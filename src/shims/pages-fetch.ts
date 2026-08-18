// TypeScript shim for pages manifest helpers (single, clean implementation)
const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_BRANCH = 'main';

export interface ManifestEntry {
  path?: string;
  name?: string;
  size?: number;
}

export interface FileNode {
  type: 'file';
  name: string;
  path: string;
  size?: number;
}

export interface FolderNode {
  type: 'folder';
  name: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

export interface RepoEntry {
  repo?: string;
}

type RawManifestPayload = ManifestEntry[] | FolderNode | unknown;

function normalizePath(input: unknown): string {
  return String(input || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

export function resolvePagesBaseUrl(entry: RepoEntry | null | undefined): string {
  if (!entry || !entry.repo) return '';
  const [owner, repoName] = String(entry.repo).split('/').filter(Boolean);
  if (!owner || !repoName) return '';
  if (repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${repoName}/`;
}

export function buildPagesTreeFromManifest(repoName: string, manifest: ManifestEntry[] | undefined): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: repoName, children: [] };

  for (const entry of manifest || []) {
    const p = normalizePath(entry.path || '');
    if (!p) continue;
    const parts = p.split('/');
    const fileName = parts[parts.length - 1] || entry.name || 'file';

    let node: FolderNode = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      let next = node.children.find((c) => c.type === 'folder' && c.name === part) as FolderNode | undefined;
      if (!next) {
        next = { type: 'folder', name: part, children: [] };
        node.children.push(next);
      }
      node = next;
    }

    node.children.push({ type: 'file', name: fileName, path: p, size: entry.size });
  }

  return root.children || [];
}

async function fetchManifestFromUrl(url: string, repoName: string): Promise<TreeNode[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Manifest fetch failed with ${res.status}`);
    const manifest = (await res.json()) as RawManifestPayload;
    if (!Array.isArray(manifest) && manifest && typeof manifest === 'object' && (manifest as FolderNode).type === 'folder') {
      return (manifest as FolderNode).children;
    }
    const normalized: ManifestEntry[] = Array.isArray(manifest) ? manifest : [];
    return buildPagesTreeFromManifest(repoName, normalized);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildRawManifestUrl(repo: string, branch?: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch || DEFAULT_BRANCH}/files.json`;
}

export async function fetchRepoManifest(repo: string, repoName: string, branch?: string, pagesBase?: string): Promise<TreeNode[]> {
  const rawUrl = buildRawManifestUrl(repo, branch || DEFAULT_BRANCH);
  try {
    return await fetchManifestFromUrl(rawUrl, repoName);
  } catch (rawError) {
    if (pagesBase) {
      try {
        return await fetchManifestFromUrl(`${String(pagesBase).replace(/\/$/, '')}/files.json`, repoName);
      } catch (pagesError) {
        throw new Error(`Both raw.githubusercontent.com and GitHub Pages manifest fetches failed for ${repo}: raw=${rawError instanceof Error ? rawError.message : String(rawError)}; pages=${pagesError instanceof Error ? pagesError.message : String(pagesError)}`);
      }
    }
    throw rawError;
  }
}

export async function fetchPagesManifest(pagesBase: string, repoName: string): Promise<TreeNode[]> {
  return fetchManifestFromUrl(`${String(pagesBase).replace(/\/$/, '')}/files.json`, repoName);
}

export default null;
