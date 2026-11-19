export interface RepositoryRegistryEntry {
  branch: string;
  class_or_stream: string;
  empty: boolean;
  enabled: boolean;
  fallback: string | null;
  lfs: boolean;
  name: string;
  pages: boolean;
  priority: number;
  repo_name: string;
  repo_owner: string;
  root: string;
}

export interface RepositoryFile {
  name: string;
  path: string;
  sha: string;
}

export interface RepositorySyncPayload extends RepositoryRegistryEntry {
  files: RepositoryFile[];
  last_commit_sha: string;
}

interface ManifestFile {
  name: string;
  path: string;
  sha: string | null;
}

type Fetcher = typeof fetch;

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const FETCH_TIMEOUT_MS = 15_000;
const EXCLUDED_STREAMS = new Set(["community", "issues"]);
const STREAM_GROUPS: Record<string, string> = {
  classnine: "lowersecondary",
  classten: "lowersecondary",
  lowersecondary: "lowersecondary",
  commerce: "commerce",
  developer: "developer",
  developers: "developer",
  humanities: "humanities",
  science: "science",
};

function parseBoolean(value: string, field: string, rowName: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false" || normalized === "") return false;
  throw new Error(`Invalid ${field} value for ${rowName}: ${value}`);
}

function normalizeRelativePath(value: string): string {
  const slashed = value.replace(/\\/g, "/");
  if (slashed.startsWith("/")) throw new Error(`Expected a relative repository path: ${value}`);
  const normalized = slashed.replace(/\/+/g, "/").replace(/\/+$/g, "");
  if (!normalized || normalized === "." || normalized.split("/").some((part) => part === ".." || part === ".")) {
    throw new Error(`Invalid repository-relative path: ${value}`);
  }
  return normalized;
}

function joinRepositoryPath(root: string, filePath: string): string {
  const path = normalizeRelativePath(filePath);
  if (!root || path === root || path.startsWith(`${root}/`)) return path;
  return `${root}/${path}`;
}

export function parseRepositoryRegistry(markdown: string): RepositoryRegistryEntry[] {
  const tableLines = markdown.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  if (tableLines.length < 3) throw new Error("Repository registry must contain a Markdown table with entries");

  const headers = tableLines[0].split("|").slice(1, -1).map((cell) => cell.trim().toLowerCase());
  const requiredHeaders = ["name", "stream", "repo", "branch", "enabled", "priority", "pages", "empty", "lfs", "fallback"];
  for (const header of requiredHeaders) {
    if (!headers.includes(header)) throw new Error(`Repository registry is missing the ${header} column`);
  }

  const separator = tableLines[1].split("|").slice(1, -1);
  if (separator.length !== headers.length || separator.some((cell) => !/^:?-{3,}:?$/.test(cell.trim()))) {
    throw new Error("Repository registry has an invalid Markdown table separator");
  }

  const entries: RepositoryRegistryEntry[] = [];
  const seenRepos = new Set<string>();

  for (const [index, line] of tableLines.slice(2).entries()) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== headers.length) throw new Error(`Malformed repository registry row ${index + 3}`);
    const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]]));
    const name = row.name;
    const repository = row.repo;
    if (!name || !repository) throw new Error(`Repository registry row ${index + 3} is missing name or repo`);

    const [repo_owner, repo_name, ...rest] = repository.split("/");
    if (!repo_owner || !repo_name || rest.length > 0 || !/^[\w.-]+$/.test(repo_owner) || !/^[\w.-]+$/.test(repo_name)) {
      throw new Error(`Invalid GitHub repository identifier: ${repository}`);
    }

    const stream = row.stream.toLowerCase();
    if (EXCLUDED_STREAMS.has(stream)) continue;
    const class_or_stream = STREAM_GROUPS[stream];
    if (!class_or_stream) throw new Error(`Unsupported repository stream for ${repository}: ${row.stream}`);

    const enabled = parseBoolean(row.enabled, "enabled", name);
    if (!enabled) continue;

    const priority = Number(row.priority);
    if (!Number.isInteger(priority) || priority < 0) throw new Error(`Invalid priority for ${name}`);

    const key = `${repo_owner}/${repo_name}`.toLowerCase();
    if (seenRepos.has(key)) throw new Error(`Duplicate repository registry entry: ${repository}`);
    seenRepos.add(key);

    const branch = row.branch.trim();
    if (!branch || branch.length > 200 || branch.startsWith("-")) throw new Error(`Invalid branch for ${repository}`);

    const root = row.root.trim()
      ? normalizeRelativePath(row.root)
      : "";

    entries.push({
      branch,
      class_or_stream,
      empty: parseBoolean(row.empty, "empty", name),
      enabled,
      fallback: row.fallback.trim().toLowerCase() || null,
      lfs: parseBoolean(row.lfs, "lfs", name),
      name,
      pages: parseBoolean(row.pages, "pages", name),
      priority,
      repo_name,
      repo_owner,
      root,
    });
  }

  if (entries.length === 0) throw new Error("Repository registry has no enabled repositories in scope");
  return entries;
}

function requestHeaders(token: string | undefined, accept: string): HeadersInit {
  return {
    Accept: accept,
    "User-Agent": "NoteBooks-Framework-v2",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson(url: string, token: string | undefined, fetcher: Fetcher): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      headers: requestHeaders(token, "application/json"),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Request failed with HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pagesBaseUrl(entry: RepositoryRegistryEntry): string {
  const { repo_owner: owner, repo_name: repo } = entry;
  return repo.toLowerCase() === `${owner.toLowerCase()}.github.io`
    ? `https://${owner}.github.io`
    : `https://${owner}.github.io/${repo}`;
}

function manifestFileUrl(entry: RepositoryRegistryEntry, ref: string): string {
  const path = entry.root ? `${entry.root}/files.json` : "files.json";
  return `https://raw.githubusercontent.com/${entry.repo_owner}/${entry.repo_name}/${encodeURIComponent(ref)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

function collectManifestFiles(
  manifest: unknown,
  entry: RepositoryRegistryEntry,
  options: { rootRelative: boolean },
): ManifestFile[] {
  const files: ManifestFile[] = [];
  const seenPaths = new Set<string>();

  function visit(value: unknown, parentPath = ""): void {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const node = value as Record<string, unknown>;
    const children = Array.isArray(node.children) ? node.children : null;
    const rawPath = typeof node.path === "string"
      ? node.path
      : [parentPath, typeof node.name === "string" ? node.name : ""].filter(Boolean).join("/");

    if (children) {
      for (const child of children) visit(child, rawPath);
      return;
    }

    const isFile = node.type === "file" || node.type === "blob" || typeof node.path === "string";
    if (!isFile) return;

    const path = options.rootRelative && entry.root
      ? joinRepositoryPath(entry.root, rawPath)
      : normalizeRelativePath(rawPath);
    if (seenPaths.has(path)) throw new Error(`Manifest contains duplicate file path: ${path}`);
    seenPaths.add(path);
    const rawSha = typeof node.sha === "string" ? node.sha.toLowerCase() : "";
    files.push({ name: path.split("/").pop()!, path, sha: SHA_PATTERN.test(rawSha) ? rawSha : null });
  }

  if (Array.isArray(manifest)) {
    for (const item of manifest) visit(item);
  } else {
    visit(manifest);
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function fetchGithubTree(
  entry: RepositoryRegistryEntry,
  commitSha: string,
  token: string | undefined,
  fetcher: Fetcher,
): Promise<Map<string, string>> {
  const url = `https://api.github.com/repos/${entry.repo_owner}/${entry.repo_name}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`;
  const response = await fetchJson(url, token, fetcher) as {
    tree?: Array<{ path?: string; sha?: string; type?: string }>;
    truncated?: boolean;
  };
  if (response.truncated) {
    throw new Error(`GitHub returned a truncated tree for ${entry.repo_owner}/${entry.repo_name}`);
  }
  if (!Array.isArray(response.tree)) {
    throw new Error(`GitHub returned an invalid tree for ${entry.repo_owner}/${entry.repo_name}`);
  }

  const files = new Map<string, string>();
  for (const node of response.tree) {
    if (node.type !== "blob" || typeof node.path !== "string" || typeof node.sha !== "string") continue;
    const sha = node.sha.toLowerCase();
    if (SHA_PATTERN.test(sha)) files.set(normalizeRelativePath(node.path), sha);
  }
  return files;
}

async function addMissingShas(
  files: ManifestFile[],
  entry: RepositoryRegistryEntry,
  commitSha: string,
  token: string | undefined,
  fetcher: Fetcher,
): Promise<RepositoryFile[]> {
  if (files.every((file) => file.sha !== null)) {
    return files.map((file) => {
      if (!file.sha) throw new Error(`Missing Git blob SHA for ${file.path}`);
      return { name: file.name, path: file.path, sha: file.sha };
    });
  }

  const treeFiles = await fetchGithubTree(entry, commitSha, token, fetcher);
  return files.map((file) => {
    const sha = file.sha || treeFiles.get(file.path);
    if (!sha) throw new Error(`GitHub tree did not provide a SHA for ${entry.repo_owner}/${entry.repo_name}/${file.path}`);
    return { ...file, sha };
  });
}

async function fetchFilesJson(
  entry: RepositoryRegistryEntry,
  commitSha: string,
  token: string | undefined,
  fetcher: Fetcher,
): Promise<RepositoryFile[]> {
  let lastError: unknown;
  const rawUrl = manifestFileUrl(entry, commitSha);
  try {
    const manifest = await fetchJson(rawUrl, token, fetcher);
    const files = collectManifestFiles(manifest, entry, { rootRelative: true });
    return addMissingShas(files, entry, commitSha, token, fetcher);
  } catch (error) {
    lastError = error;
  }

  if (entry.pages) {
    const root = entry.root ? `${entry.root}/` : "";
    const pagesUrl = `${pagesBaseUrl(entry)}/${root}files.json`;
    try {
      const manifest = await fetchJson(pagesUrl, token, fetcher);
      const files = collectManifestFiles(manifest, entry, { rootRelative: true });
      return addMissingShas(files, entry, commitSha, token, fetcher);
    } catch (error) {
      lastError = error;
    }
  }

  if (entry.fallback === "github-tree") {
    const treeFiles = await fetchGithubTree(entry, commitSha, token, fetcher);
    return Array.from(treeFiles, ([path, sha]) => ({
      name: path.split("/").pop()!,
      path,
      sha,
    })).sort((left, right) => left.path.localeCompare(right.path));
  }

  throw new Error(
    `Unable to load files.json for ${entry.repo_owner}/${entry.repo_name}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export async function fetchRepositorySyncPayload(
  entry: RepositoryRegistryEntry,
  options: { token?: string; fetcher?: Fetcher } = {},
): Promise<RepositorySyncPayload> {
  const fetcher = options.fetcher ?? fetch;
  const repository = `${entry.repo_owner}/${entry.repo_name}`;
  const head = await fetchJson(
    `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(entry.branch)}`,
    options.token,
    fetcher,
  ) as { sha?: unknown };
  const last_commit_sha = typeof head.sha === "string" ? head.sha.toLowerCase() : "";
  if (!SHA_PATTERN.test(last_commit_sha)) throw new Error(`GitHub returned an invalid commit SHA for ${repository}@${entry.branch}`);

  const files = entry.empty ? [] : await fetchFilesJson(entry, last_commit_sha, options.token, fetcher);
  return { ...entry, files, last_commit_sha };
}
