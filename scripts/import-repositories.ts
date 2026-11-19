import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";
import {
  fetchRepositorySyncPayload,
  parseRepositoryRegistry,
  type RepositorySyncPayload,
} from "../src/lib/repository-import";
import {
  createPublicIndexDatabase,
  TREE_GROUPS,
  rebuildPublicIndexes,
  type TreeGroup,
} from "../src/lib/public-indexes";
import { createUpstashPublicIndexStore } from "../src/lib/upstash-public-index-store";

config({ path: ".env.local", quiet: true });

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log("Usage: pnpm repos:sync [--apply]");
    console.log("Defaults to a read-only GitHub preview; --apply writes repository and file rows to Supabase.");
    console.log("Optionally pass --repo owner/repository to sync one configured repository.");
    return;
  }

  const apply = process.argv.includes("--apply");
  const repositoryFlagIndex = process.argv.indexOf("--repo");
  const requestedRepository = repositoryFlagIndex >= 0 ? process.argv[repositoryFlagIndex + 1] : undefined;
  if (repositoryFlagIndex >= 0 && (!requestedRepository || requestedRepository.startsWith("--"))) {
    throw new Error("--repo requires an owner/repository identifier");
  }
  const registryPath = path.resolve(process.cwd(), "GITHUB-REPOSITORIES.md");
  const markdown = await readFile(registryPath, "utf8");
  const allRepositories = parseRepositoryRegistry(markdown);
  const registry = requestedRepository
    ? allRepositories.filter((entry) => `${entry.repo_owner}/${entry.repo_name}`.toLowerCase() === requestedRepository.toLowerCase())
    : allRepositories;
  if (requestedRepository && registry.length === 0) {
    throw new Error(`Repository ${requestedRepository} is not enabled in GITHUB-REPOSITORIES.md`);
  }
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
  const payloads: RepositorySyncPayload[] = [];

  for (const entry of registry) {
    const payload = await fetchRepositorySyncPayload(entry, { token });
    payloads.push(payload);
    console.log(
      `${apply ? "Prepared" : "Preview"} ${entry.repo_owner}/${entry.repo_name}@${entry.branch}: ${payload.files.length} files at ${payload.last_commit_sha}`,
    );
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write the repository anchors and file rows.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;
  if (!redisUrl || !redisToken) {
    throw new Error("KV_REST_API_URL and KV_REST_API_TOKEN are required to rebuild public indexes");
  }
  const redis = new Redis({ url: redisUrl, token: redisToken });
  const indexStore = createUpstashPublicIndexStore(redis);

  for (const payload of payloads) {
    const { error } = await supabase.rpc("sync_repository_catalog", {
      p_repositories: [{
        ...payload,
        registry_name: payload.name,
      }],
    });
    if (error) {
      throw new Error(`Failed to sync ${payload.repo_owner}/${payload.repo_name}: ${error.message}`);
    }
    console.log(`Synced ${payload.repo_owner}/${payload.repo_name}: ${payload.files.length} file rows`);
  }

  const groupsToRebuild: readonly TreeGroup[] = requestedRepository
    ? TREE_GROUPS.filter((group) => payloads.some((payload) => payload.class_or_stream === group))
    : TREE_GROUPS;
  const rebuilt = await rebuildPublicIndexes(createPublicIndexDatabase(supabase), indexStore, {
    groups: groupsToRebuild,
    includeRepositories: true,
  });
  console.log(`Rebuilt public indexes: ${rebuilt.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Repository import failed");
  process.exitCode = 1;
});
