import type { SupabaseClient } from "@supabase/supabase-js";

export const TREE_GROUPS = [
  "commerce",
  "developer",
  "humanities",
  "lowersecondary",
  "science",
] as const;

export type TreeGroup = (typeof TREE_GROUPS)[number];
export type PublicIndexName = `${TreeGroup}-tree` | "github_repositories";
export type PublicIndexFormat = "json" | "jsonl";

export interface PublicRepositoryRecord {
  branch: string;
  class_or_stream: TreeGroup;
  empty: boolean;
  enabled: boolean;
  fallback: string | null;
  id: string;
  lfs: boolean;
  last_commit_sha: string | null;
  mdx_styled_rendering: boolean;
  pages: boolean;
  priority: number | null;
  registry_name: string;
  repo_name: string;
  repo_owner: string;
  root: string;
}

export interface PublicFileRecord {
  file_name: string;
  file_path: string;
  file_sha: string;
  repo_id: string;
}

export interface FileLookupRecord {
  branch: string;
  commitSha: string | null;
  fileName: string;
  filePath: string;
  fileSha: string;
  repository: string;
  repositoryId: string;
  root: string;
}

export interface PublicRepositoryLookupRecord {
  branch: string;
  classOrStream: TreeGroup;
  commitSha: string | null;
  id: string;
  lfs: boolean;
  mdxStyledRendering: boolean;
  name: string;
  owner: string;
  pages: boolean;
  priority: number | null;
  repoName: string;
  root: string;
}

export interface PublicIndexDocument<T> {
  schemaVersion: 1;
  entries: Record<string, T>;
}

export interface PublicIndexFormats {
  json: string;
  jsonl: string;
}

export interface PublicIndexStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  setMany?(entries: Array<{ key: string; value: string }>): Promise<unknown>;
}

export interface PublicIndexDatabase {
  listRepositories(group?: TreeGroup): Promise<PublicRepositoryRecord[]>;
  listFiles(repositoryIds: string[]): Promise<PublicFileRecord[]>;
}

interface DatabaseRow {
  [key: string]: unknown;
}

const PAGE_SIZE = 1000;
const FILE_QUERY_REPO_BATCH_SIZE = 100;
const FILE_QUERY_CONCURRENCY = 4;
const CACHE_KEY_PREFIX = "notebooks:public-index:v1";

export function isTreeGroup(value: unknown): value is TreeGroup {
  return typeof value === "string" && TREE_GROUPS.includes(value as TreeGroup);
}

export function getPublicIndexName(filename: string): {
  name: PublicIndexName;
  format: PublicIndexFormat;
} | null {
  const match = /^(commerce|developer|humanities|lowersecondary|science)-tree\.(json|jsonl)$/.exec(filename);
  if (match) {
    return {
      name: `${match[1]}-tree` as PublicIndexName,
      format: match[2] as PublicIndexFormat,
    };
  }
  if (filename === "github_repositories.json") {
    return { name: "github_repositories", format: "json" };
  }
  if (filename === "github_repositories.jsonl") {
    return { name: "github_repositories", format: "jsonl" };
  }
  return null;
}

export function publicIndexCacheKey(
  name: PublicIndexName,
  format: PublicIndexFormat = "json",
): string {
  return `${CACHE_KEY_PREFIX}:${name}:${format}`;
}

function isRecord(value: unknown): value is DatabaseRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(row: DatabaseRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Repository catalog row has an invalid ${key}`);
  }
  return value;
}

function requiredBoolean(row: DatabaseRow, key: string): boolean {
  const value = row[key];
  if (typeof value !== "boolean") {
    throw new Error(`Repository catalog row has an invalid ${key}`);
  }
  return value;
}

function parseRepository(value: unknown): PublicRepositoryRecord {
  if (!isRecord(value)) throw new Error("Repository catalog returned a malformed repository row");
  const group = value.class_or_stream;
  if (!isTreeGroup(group)) throw new Error("Repository catalog row has an unsupported class_or_stream");
  const priority = value.priority;
  if (priority !== null && typeof priority !== "number") {
    throw new Error("Repository catalog row has an invalid priority");
  }
  if (value.fallback !== null && typeof value.fallback !== "string") {
    throw new Error("Repository catalog row has an invalid fallback");
  }
  const lastCommitSha = value.last_commit_sha;
  if (lastCommitSha !== null && (
    typeof lastCommitSha !== "string"
    || !/^[a-f0-9]{40}$/i.test(lastCommitSha)
  )) {
    throw new Error("Repository catalog row has an invalid last_commit_sha");
  }

  return {
    branch: requiredString(value, "branch"),
    class_or_stream: group,
    empty: requiredBoolean(value, "empty"),
    enabled: requiredBoolean(value, "enabled"),
    fallback: value.fallback,
    id: requiredString(value, "id"),
    lfs: requiredBoolean(value, "lfs"),
    last_commit_sha: lastCommitSha,
    mdx_styled_rendering: requiredBoolean(value, "mdx_styled_rendering"),
    pages: requiredBoolean(value, "pages"),
    priority,
    registry_name: requiredString(value, "registry_name"),
    repo_name: requiredString(value, "repo_name"),
    repo_owner: requiredString(value, "repo_owner"),
    root: typeof value.root === "string" ? value.root : "",
  };
}

function parseFile(value: unknown): PublicFileRecord {
  if (!isRecord(value)) throw new Error("Repository catalog returned a malformed file row");
  return {
    file_name: requiredString(value, "file_name"),
    file_path: requiredString(value, "file_path"),
    file_sha: requiredString(value, "file_sha"),
    repo_id: requiredString(value, "repo_id"),
  };
}

function buildDocument<T>(entries: Record<string, T>): PublicIndexFormats {
  const orderedEntries = Object.fromEntries(
    Object.entries(entries).sort(([left], [right]) => left.localeCompare(right)),
  );
  const document: PublicIndexDocument<T> = { schemaVersion: 1, entries: orderedEntries };
  const records = Object.values(orderedEntries).map((entry) => JSON.stringify(entry));
  return {
    json: JSON.stringify(document),
    jsonl: records.length > 0 ? `${records.join("\n")}\n` : "",
  };
}

export function buildSectionIndex(
  repositories: PublicRepositoryRecord[],
  files: PublicFileRecord[],
): PublicIndexFormats {
  const repositoriesById = new Map(repositories.map((repository) => [repository.id, repository]));
  const entries: Record<string, FileLookupRecord> = {};

  for (const file of files) {
    const repository = repositoriesById.get(file.repo_id);
    if (!repository) throw new Error(`File row references an unknown repository: ${file.repo_id}`);
    if (/\.html$/i.test(file.file_path) && !repository.mdx_styled_rendering) continue;
    const identifier = `${repository.repo_owner}/${repository.repo_name}/${file.file_path}`;
    if (entries[identifier]) throw new Error(`Duplicate public file index key: ${identifier}`);
    entries[identifier] = {
      branch: repository.branch,
      commitSha: repository.last_commit_sha,
      fileName: file.file_name,
      filePath: file.file_path,
      fileSha: file.file_sha,
      repository: `${repository.repo_owner}/${repository.repo_name}`,
      repositoryId: repository.id,
      root: repository.root,
    };
  }

  return buildDocument(entries);
}

export function buildRepositoryIndex(repositories: PublicRepositoryRecord[]): PublicIndexFormats {
  const entries: Record<string, PublicRepositoryLookupRecord> = {};

  for (const repository of repositories) {
    const identifier = `${repository.repo_owner}/${repository.repo_name}`;
    if (entries[identifier]) throw new Error(`Duplicate public repository index key: ${identifier}`);
    entries[identifier] = {
      branch: repository.branch,
      classOrStream: repository.class_or_stream,
      commitSha: repository.last_commit_sha,
      id: repository.id,
      lfs: repository.lfs,
      mdxStyledRendering: repository.mdx_styled_rendering,
      name: repository.registry_name,
      owner: repository.repo_owner,
      pages: repository.pages,
      priority: repository.priority,
      repoName: repository.repo_name,
      root: repository.root,
    };
  }

  return buildDocument(entries);
}

async function fetchRows<T>(
  fetchPage: (start: number, end: number) => Promise<{
    data: unknown[] | null;
    error: { message: string } | null;
  }> | PromiseLike<{
    data: unknown[] | null;
    error: { message: string } | null;
  }>,
  parse: (value: unknown) => T,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await fetchPage(start, start + PAGE_SIZE - 1);
    if (error) throw new Error(`Unable to query repository catalog: ${error.message}`);
    if (!data) throw new Error("Repository catalog query returned no data");
    rows.push(...data.map(parse));
    if (data.length < PAGE_SIZE) return rows;
  }
}

async function loadRepositories(
  supabase: SupabaseClient,
  group?: TreeGroup,
): Promise<PublicRepositoryRecord[]> {
  return fetchRows(
    (start, end) => {
      let query = supabase
        .from("repository_entries")
        .select("id, branch, class_or_stream, empty, enabled, fallback, last_commit_sha, lfs, mdx_styled_rendering, pages, priority, registry_name, repo_name, repo_owner, root")
        .eq("record_type", "repository")
        .eq("enabled", true)
        .is("archived_at", null)
        .order("repo_owner")
        .order("repo_name")
        .range(start, end);
      if (group) query = query.eq("class_or_stream", group);
      return query;
    },
    parseRepository,
  );
}

async function loadFiles(
  supabase: SupabaseClient,
  repositoryIds: string[],
): Promise<PublicFileRecord[]> {
  const batches: string[][] = [];
  for (let start = 0; start < repositoryIds.length; start += FILE_QUERY_REPO_BATCH_SIZE) {
    batches.push(repositoryIds.slice(start, start + FILE_QUERY_REPO_BATCH_SIZE));
  }

  const batchResults = new Array<PublicFileRecord[]>(batches.length);
  let nextBatch = 0;
  async function loadBatchWorkers(): Promise<void> {
    const batchIndex = nextBatch;
    nextBatch += 1;
    if (batchIndex >= batches.length) return;
    const ids = batches[batchIndex];
    batchResults[batchIndex] = await fetchRows(
      (pageStart, pageEnd) => supabase
        .from("repository_entries")
        .select("file_name, file_path, file_sha, repo_id")
        .eq("record_type", "file")
        .in("repo_id", ids)
        .order("file_path")
        .range(pageStart, pageEnd),
      parseFile,
    );
    await loadBatchWorkers();
  }
  await Promise.all(
    Array.from({ length: Math.min(FILE_QUERY_CONCURRENCY, batches.length) }, () => loadBatchWorkers()),
  );
  return batchResults.flat();
}

export function createPublicIndexDatabase(supabase: SupabaseClient): PublicIndexDatabase {
  return {
    listRepositories: (group) => loadRepositories(supabase, group),
    listFiles: (repositoryIds) => loadFiles(supabase, repositoryIds),
  };
}

async function publish(
  store: PublicIndexStore,
  name: PublicIndexName,
  formats: PublicIndexFormats,
): Promise<void> {
  const entries = [
    { key: publicIndexCacheKey(name, "json"), value: formats.json },
    { key: publicIndexCacheKey(name, "jsonl"), value: formats.jsonl },
  ];
  if (store.setMany) {
    await store.setMany(entries);
    return;
  }
  await Promise.all(entries.map(({ key, value }) => store.set(key, value)));
}

export async function rebuildPublicIndexes(
  database: PublicIndexDatabase,
  store: PublicIndexStore,
  options: { groups?: readonly TreeGroup[]; includeRepositories?: boolean },
): Promise<PublicIndexName[]> {
  const rebuilt: PublicIndexName[] = [];
  const groups = [...new Set(options.groups ?? TREE_GROUPS)];

  if (groups.length === TREE_GROUPS.length && TREE_GROUPS.every((group) => groups.includes(group))
      && options.includeRepositories) {
    const repositories = await database.listRepositories();
    const files = await database.listFiles(repositories.map((repository) => repository.id));
    const writes: Array<Promise<void>> = [];
    for (const group of TREE_GROUPS) {
      const groupRepositories = repositories.filter((repository) => repository.class_or_stream === group);
      const groupIds = new Set(groupRepositories.map((repository) => repository.id));
      const groupFiles = files.filter((file) => groupIds.has(file.repo_id));
      writes.push(publish(store, `${group}-tree`, buildSectionIndex(groupRepositories, groupFiles)));
      rebuilt.push(`${group}-tree`);
    }
    writes.push(publish(store, "github_repositories", buildRepositoryIndex(repositories)));
    await Promise.all(writes);
    rebuilt.push("github_repositories");
    return rebuilt;
  }

  const repositoryIndexPromise = options.includeRepositories
    ? database.listRepositories()
    : null;
  const groupResults = await Promise.all(groups.map(async (group) => {
    const repositories = await database.listRepositories(group);
    const files = await database.listFiles(repositories.map((repository) => repository.id));
    const name = `${group}-tree` as const;
    await publish(store, name, buildSectionIndex(repositories, files));
    return name;
  }));
  rebuilt.push(...groupResults);

  if (repositoryIndexPromise) {
    const repositories = await repositoryIndexPromise;
    await publish(store, "github_repositories", buildRepositoryIndex(repositories));
    rebuilt.push("github_repositories");
  }

  return rebuilt;
}
