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

/**
 * A raw manifest payload can either be a flat array of entries to be turned
 * into a tree, or an already-built folder node (e.g. `{ type: 'folder', children: [...] }`).
 */
type RawManifestPayload = ManifestEntry[] | FolderNode | unknown;

function normalizePath(input: unknown): string {
  return String(input || '').replace(/^\/\/+|\/\/+$/g, '').replace(/\\/g, '/');
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

export function buildPagesTreeFromManifest(
  repoName: string,
  manifest: ManifestEntry[] | undefined
): TreeNode[] {
  const root: FolderNode = { type: 'folder', name: repoName, children: [] };

  for (const entry of manifest || []) {
    const normalizedPath = normalizePath(entry.path || '');
    if (!normalizedPath) continue;
    const parts = normalizedPath.split('/');
    const fileName = parts[parts.length - 1];

    let node: FolderNode = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      let next = (node.children || []).find(
        (child): child is FolderNode => child.type === 'folder' && child.name === part
      );
      if (!next) {
        next = { type: 'folder', name: part, children: [] };
        node.children.push(next);
      }
      node = next;
    }

    node.children.push({
      type: 'file',
      name: fileName || entry.name || 'file',
      path: normalizedPath,
      size: entry.size,
    });
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
    if (
      !Array.isArray(manifest) &&
      manifest &&
      typeof manifest === 'object' &&
      (manifest as FolderNode).type === 'folder' &&
      Array.isArray((manifest as FolderNode).children)
    ) {
      return (manifest as FolderNode).children;
    }
    const normalizedManifest: ManifestEntry[] = Array.isArray(manifest) ? manifest : [];
    return buildPagesTreeFromManifest(repoName, normalizedManifest);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildRawManifestUrl(repo: string, branch: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/files.json`;
}

export async function fetchRepoManifest(
  repo: string,
  repoName: string,
  branch: string | undefined,
  pagesBase: string | undefined
): Promise<TreeNode[]> {
  const rawUrl = buildRawManifestUrl(repo, branch || DEFAULT_BRANCH);
  try {
    return await fetchManifestFromUrl(rawUrl, repoName);
  } catch (rawError) {
    if (pagesBase) {
      try {
        return await fetchManifestFromUrl(`${String(pagesBase).replace(/\/$/, '')}/files.json`, repoName);
      } catch (pagesError) {
        throw new Error(
          `Both raw.githubusercontent.com and GitHub Pages manifest fetches failed for ${repo}: ` +
            `raw=${rawError instanceof Error ? rawError.message : String(rawError)}; ` +
            `pages=${pagesError instanceof Error ? pagesError.message : String(pagesError)}`
        );
      }
    }
    throw rawError;
  }
}

export async function fetchPagesManifest(pagesBase: string, repoName: string): Promise<TreeNode[]> {
  return fetchManifestFromUrl(`${String(pagesBase).replace(/\/$/, '')}/files.json`, repoName);
}

export default null;