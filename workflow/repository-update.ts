import "server-only";

import type { RepositoryUpdateJob } from "@/lib/repository-update-identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchRepositorySyncPayload } from "@/lib/repository-import";
import { getPublicIndexStore } from "@/lib/public-index-cache";
import {
  createPublicIndexDatabase,
  isTreeGroup,
  rebuildPublicIndexes,
  type TreeGroup,
} from "@/lib/public-indexes";

interface RepositoryDatabaseEntry {
  branch: string;
  class_or_stream: TreeGroup;
  empty: boolean;
  enabled: boolean;
  fallback: string | null;
  last_commit_sha: string | null;
  lfs: boolean;
  pages: boolean;
  priority: number;
  registry_name: string;
  repo_name: string;
  repo_owner: string;
  root: string;
}

export interface RepositoryUpdateResult {
  catalogStatus?: "not_attempted" | "unchanged" | "updated";
  commitSha?: string;
  fileCount?: number;
  indexStatus?: "not_attempted" | "rebuilt";
  rebuiltIndexes?: string[];
  repository: string;
  status: "ignored" | "unchanged" | "updated";
}

type RepositoryUpdateCatalogStatus =
  | "failed"
  | "not_attempted"
  | "unchanged"
  | "updated";
type RepositoryUpdateIndexStatus =
  | "failed"
  | "not_attempted"
  | "rebuilt";

export class RepositoryUpdateFailure extends Error {
  readonly catalogStatus: RepositoryUpdateCatalogStatus;
  readonly commitSha: string | null;
  readonly errorCode:
    | "catalog_sync_failed"
    | "index_rebuild_failed"
    | "repository_check_failed"
    | "sync_failed";
  readonly fileCount: number | null;
  readonly indexStatus: RepositoryUpdateIndexStatus;

  constructor(
    errorCode: RepositoryUpdateFailure["errorCode"],
    message: string,
    options: {
      catalogStatus: RepositoryUpdateCatalogStatus;
      commitSha?: string | null;
      fileCount?: number | null;
      indexStatus: RepositoryUpdateIndexStatus;
    },
  ) {
    super(message);
    this.name = "RepositoryUpdateFailure";
    this.errorCode = errorCode;
    this.catalogStatus = options.catalogStatus;
    this.commitSha = options.commitSha ?? null;
    this.fileCount = options.fileCount ?? null;
    this.indexStatus = options.indexStatus;
  }
}

function isRepositoryEntry(value: unknown): value is RepositoryDatabaseEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.branch === "string"
    && isTreeGroup(entry.class_or_stream)
    && typeof entry.empty === "boolean"
    && typeof entry.enabled === "boolean"
    && (typeof entry.fallback === "string" || entry.fallback === null)
    && typeof entry.lfs === "boolean"
    && typeof entry.registry_name === "string"
    && (typeof entry.last_commit_sha === "string" || entry.last_commit_sha === null)
    && typeof entry.pages === "boolean"
    && typeof entry.priority === "number"
    && typeof entry.repo_name === "string"
    && typeof entry.repo_owner === "string"
    && typeof entry.root === "string";
}

async function processRepositoryUpdateUnchecked(job: RepositoryUpdateJob): Promise<RepositoryUpdateResult> {
  const [owner, name] = job.repository.split("/");
  const supabase = createSupabaseAdminClient();
  const { data: storedEntry, error: lookupError } = await supabase
    .from("repository_entries")
    .select("branch, class_or_stream, empty, enabled, fallback, lfs, registry_name, pages, priority, repo_name, repo_owner, root, last_commit_sha")
    .eq("record_type", "repository")
    .eq("repo_owner", owner)
    .eq("repo_name", name)
    .eq("enabled", true)
    .is("archived_at", null)
    .maybeSingle();

  if (lookupError) throw new Error(`Repository update lookup failed: ${lookupError.message}`);
  if (!storedEntry) {
    return {
      catalogStatus: "not_attempted",
      indexStatus: "not_attempted",
      repository: job.repository,
      status: "ignored",
    };
  }
  if (!isRepositoryEntry(storedEntry)) {
    throw new RepositoryUpdateFailure("sync_failed", `Stored repository configuration is invalid: ${job.repository}`, {
      catalogStatus: "not_attempted",
      indexStatus: "not_attempted",
    });
  }
  if (storedEntry.branch !== job.branch) {
    return {
      catalogStatus: "not_attempted",
      indexStatus: "not_attempted",
      repository: job.repository,
      status: "ignored",
    };
  }

  const syncPayload = await fetchRepositorySyncPayload({
    branch: storedEntry.branch,
    class_or_stream: storedEntry.class_or_stream,
    empty: storedEntry.empty,
    enabled: storedEntry.enabled,
    fallback: storedEntry.fallback,
    lfs: storedEntry.lfs,
    name: storedEntry.registry_name,
    pages: storedEntry.pages,
    priority: storedEntry.priority,
    repo_name: storedEntry.repo_name,
    repo_owner: storedEntry.repo_owner,
    root: storedEntry.root,
  }, {
    token: process.env.GITHUB_TOKEN || process.env.GITHUB_PAT,
  });

  const unchanged = syncPayload.last_commit_sha === storedEntry.last_commit_sha;
  const catalogStatus: "unchanged" | "updated" = unchanged ? "unchanged" : "updated";
  if (!unchanged) {
    const { error: syncError } = await supabase.rpc("sync_repository_catalog", {
      p_repositories: [{
        ...syncPayload,
        registry_name: syncPayload.name,
      }],
    });
    if (syncError) {
      throw new RepositoryUpdateFailure(
        "catalog_sync_failed",
        `Repository catalog sync failed: ${syncError.message}`,
        {
          catalogStatus: "failed",
          commitSha: syncPayload.last_commit_sha,
          fileCount: syncPayload.files.length,
          indexStatus: "not_attempted",
        },
      );
    }
  }

  let rebuiltIndexes: string[];
  try {
    // An unchanged source commit can still require repair after Redis loss,
    // or when a previously published index is stale. Always rebuild here.
    rebuiltIndexes = await rebuildPublicIndexes(
      createPublicIndexDatabase(supabase),
      getPublicIndexStore(),
      { groups: [storedEntry.class_or_stream] },
    );
  } catch (error) {
    throw new RepositoryUpdateFailure(
      "index_rebuild_failed",
      `Public index rebuild failed: ${error instanceof Error ? error.message : "unknown error"}`,
      {
        catalogStatus,
        commitSha: syncPayload.last_commit_sha,
        fileCount: syncPayload.files.length,
        indexStatus: "failed",
      },
    );
  }

  const { error: checkedAtError } = await supabase
    .from("repository_entries")
    .update({ last_checked_at: new Date().toISOString() })
    .eq("record_type", "repository")
    .eq("repo_owner", owner)
    .eq("repo_name", name)
    .eq("enabled", true)
    .is("archived_at", null);
  if (checkedAtError) {
    throw new RepositoryUpdateFailure(
      "repository_check_failed",
      `Repository check timestamp update failed: ${checkedAtError.message}`,
      {
        catalogStatus,
        commitSha: syncPayload.last_commit_sha,
        fileCount: syncPayload.files.length,
        indexStatus: "rebuilt",
      },
    );
  }

  return {
    catalogStatus,
    repository: job.repository,
    status: unchanged ? "unchanged" : "updated",
    commitSha: syncPayload.last_commit_sha,
    fileCount: syncPayload.files.length,
    indexStatus: "rebuilt",
    rebuiltIndexes,
  };
}

export async function processRepositoryUpdate(job: RepositoryUpdateJob): Promise<RepositoryUpdateResult> {
  const [owner, name] = job.repository.split("/");
  const supabase = createSupabaseAdminClient();
  const startedAt = Date.now();
  const { data: run, error: insertError } = await supabase
    .from("repository_sync_runs")
    .insert({
      branch: job.branch,
      repo_name: name,
      repo_owner: owner,
      requested_by: job.requestedBy ?? null,
      status: "running",
    })
    .select("id")
    .single();
  if (insertError || !run || typeof run.id !== "number") {
    throw new Error(`Unable to record repository sync run: ${insertError?.message ?? "invalid run record"}`);
  }

  try {
    const result = await processRepositoryUpdateUnchecked(job);
    const { error: updateError } = await supabase
      .from("repository_sync_runs")
      .update({
        commit_sha: result.commitSha ?? null,
        completed_at: new Date().toISOString(),
        duration_ms: Math.max(0, Date.now() - startedAt),
        file_count: result.fileCount ?? null,
        status: result.status,
      })
      .eq("id", run.id);
    if (updateError) throw new Error(`Unable to record repository sync result: ${updateError.message}`);
    return result;
  } catch (error) {
    const failure = error instanceof RepositoryUpdateFailure ? error : null;
    const errorCode = failure?.errorCode ?? "sync_failed";
    console.error("Repository update failed", {
      catalogStatus: failure?.catalogStatus ?? "not_attempted",
      errorCode,
      indexStatus: failure?.indexStatus ?? "not_attempted",
      repository: job.repository,
      message: error instanceof Error ? error.message : "unknown error",
    });
    const { error: updateError } = await supabase
      .from("repository_sync_runs")
      .update({
        commit_sha: failure?.commitSha ?? null,
        completed_at: new Date().toISOString(),
        duration_ms: Math.max(0, Date.now() - startedAt),
        error_code: errorCode,
        file_count: failure?.fileCount ?? null,
        status: "failed",
      })
      .eq("id", run.id);
    if (updateError) console.error("Unable to record failed repository sync run", updateError);
    throw error;
  }
}
