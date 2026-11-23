import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createSupabaseAdminClient,
  fetchRepositorySyncPayload,
  getPublicIndexStore,
  createPublicIndexDatabase,
  rebuildPublicIndexes,
  rpc,
  from,
  runUpdates,
} = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  fetchRepositorySyncPayload: vi.fn(),
  getPublicIndexStore: vi.fn(),
  createPublicIndexDatabase: vi.fn(),
  rebuildPublicIndexes: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  runUpdates: [] as Array<Record<string, unknown>>,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient }));
vi.mock("@/lib/repository-import", () => ({ fetchRepositorySyncPayload }));
vi.mock("@/lib/public-index-cache", () => ({ getPublicIndexStore }));
vi.mock("@/lib/public-indexes", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/public-indexes")>();
  return {
    ...actual,
    createPublicIndexDatabase,
    rebuildPublicIndexes,
  };
});

import {
  processRepositoryUpdate,
  RepositoryUpdateFailure,
} from "../workflow/repository-update";

const storedEntry = {
  branch: "main",
  class_or_stream: "science",
  empty: false,
  enabled: true,
  fallback: null,
  last_commit_sha: "a".repeat(40),
  lfs: false,
  pages: true,
  priority: 1,
  registry_name: "Science Notes",
  repo_name: "repo",
  repo_owner: "owner",
  root: "",
};

const syncPayload = {
  branch: "main",
  class_or_stream: "science",
  empty: false,
  enabled: true,
  fallback: null,
  files: [{ name: "lesson.md", path: "chapter/lesson.md", sha: "b".repeat(40) }],
  last_commit_sha: "c".repeat(40),
  lfs: false,
  name: "Science Notes",
  pages: true,
  priority: 1,
  repo_name: "repo",
  repo_owner: "owner",
  root: "",
};

const job = {
  repository: "owner/repo",
  branch: "main",
  identity: { source: "push" as const, runId: "123456789", runAttempt: 1 },
};

function configureSupabase(entry: unknown = storedEntry) {
  runUpdates.length = 0;
  let runId = 77;

  from.mockImplementation((table: string) => {
    if (table === "repository_sync_runs") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: runId++ }, error: null })),
          })),
        })),
        update: vi.fn((payload: Record<string, unknown>) => {
          runUpdates.push(payload);
          return {
            eq: vi.fn(async () => ({ error: null })),
          };
        }),
      };
    }

    if (table === "repository_entries") {
      const lookup = {
        select: vi.fn(),
        eq: vi.fn(),
        is: vi.fn(),
        maybeSingle: vi.fn(async () => ({ data: entry, error: null })),
      };
      lookup.select.mockReturnValue(lookup);
      lookup.eq.mockReturnValue(lookup);
      lookup.is.mockReturnValue(lookup);

      return {
        select: lookup.select,
        update: vi.fn(() => {
          const checkedAtChain = {
            eq: vi.fn(),
            is: vi.fn(async () => ({ error: null })),
          };
          checkedAtChain.eq.mockReturnValue(checkedAtChain);
          return checkedAtChain;
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  createSupabaseAdminClient.mockReturnValue({ from, rpc });
  createPublicIndexDatabase.mockReturnValue({ kind: "public-index-database" });
  getPublicIndexStore.mockReturnValue({ kind: "public-index-store" });
  fetchRepositorySyncPayload.mockResolvedValue(syncPayload);
}

describe("repository update worker recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a Redis/index rebuild failure after a successful catalog sync", async () => {
    configureSupabase();
    rpc.mockResolvedValue({ error: null });
    rebuildPublicIndexes.mockRejectedValue(new Error("Redis write unavailable"));

    await processRepositoryUpdate(job).catch((error) => {
      expect(error).toBeInstanceOf(RepositoryUpdateFailure);
      expect(error).toMatchObject({
        errorCode: "index_rebuild_failed",
        catalogStatus: "updated",
        indexStatus: "failed",
        commitSha: syncPayload.last_commit_sha,
        fileCount: 1,
      });
    });

    expect(rebuildPublicIndexes).toHaveBeenCalled();
    expect(runUpdates.at(-1)).toMatchObject({
      status: "failed",
      error_code: "index_rebuild_failed",
      commit_sha: syncPayload.last_commit_sha,
      file_count: 1,
    });
  });

  it("can retry successfully after an index rebuild failure", async () => {
    configureSupabase();
    rpc.mockResolvedValue({ error: null });
    rebuildPublicIndexes
      .mockRejectedValueOnce(new Error("Redis write unavailable"))
      .mockResolvedValueOnce(["science-tree"]);

    await expect(processRepositoryUpdate(job)).rejects.toBeInstanceOf(RepositoryUpdateFailure);
    await expect(processRepositoryUpdate(job)).resolves.toMatchObject({
      status: "updated",
      catalogStatus: "updated",
      indexStatus: "rebuilt",
      rebuiltIndexes: ["science-tree"],
    });

    expect(runUpdates).toHaveLength(2);
    expect(runUpdates[0]).toMatchObject({ status: "failed", error_code: "index_rebuild_failed" });
    expect(runUpdates[1]).toMatchObject({ status: "updated", commit_sha: syncPayload.last_commit_sha });
  });

  it("rebuilds missing or stale indexes even when the commit is unchanged", async () => {
    configureSupabase({
      ...storedEntry,
      last_commit_sha: syncPayload.last_commit_sha,
    });
    rebuildPublicIndexes.mockResolvedValue(["science-tree"]);

    await expect(processRepositoryUpdate(job)).resolves.toMatchObject({
      status: "unchanged",
      catalogStatus: "unchanged",
      indexStatus: "rebuilt",
      rebuiltIndexes: ["science-tree"],
    });

    expect(rpc).not.toHaveBeenCalled();
    expect(rebuildPublicIndexes).toHaveBeenCalledTimes(1);
  });

  it("reports catalog sync failures distinctly and does not rebuild indexes", async () => {
    configureSupabase();
    rpc.mockResolvedValue({ error: { message: "catalog unavailable" } });

    await processRepositoryUpdate(job).catch((error) => {
      expect(error).toBeInstanceOf(RepositoryUpdateFailure);
      expect(error).toMatchObject({
        errorCode: "catalog_sync_failed",
        catalogStatus: "failed",
        indexStatus: "not_attempted",
        commitSha: syncPayload.last_commit_sha,
        fileCount: 1,
      });
    });

    expect(rebuildPublicIndexes).not.toHaveBeenCalled();
    expect(runUpdates.at(-1)).toMatchObject({
      status: "failed",
      error_code: "catalog_sync_failed",
      commit_sha: syncPayload.last_commit_sha,
      file_count: 1,
    });
  });
});
