export interface PagesManifestEntry {
  path: string;
  name: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface PagesRegistryEntryLike {
  repo?: string;
  name?: string;
  pages?: string | boolean;
}

function normalizePath(input: string) {
  return String(input || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

export function resolvePagesBaseUrl(entry: PagesRegistryEntryLike) {
  if (!entry?.repo) return '';
  const [owner, repoName] = String(entry.repo).split('/').filter(Boolean);
  if (!owner || !repoName) return '';
  if (repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
    return `https://${owner}.github.io/`;
  }
  return `https://${owner}.github.io/${repoName}/`;
}

export function buildPagesTreeFromManifest(repoName: string, manifest: PagesManifestEntry[]) {
  const root = { type: 'folder' as const, name: repoName, children: [] as Array<{ type: 'folder' | 'file'; name: string; path?: string; children?: any[] }> };

  for (const entry of manifest || []) {
    const normalizedPath = normalizePath(entry.path || '');
    if (!normalizedPath) continue;
    const parts = normalizedPath.split('/');
    const fileName = parts[parts.length - 1];

    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      let next = (node.children || []).find((child: any) => child.type === 'folder' && child.name === part);
      if (!next) {
        next = { type: 'folder', name: part, children: [] };
        (node.children as any[]).push(next);
      }
      node = next as any;
    }

    (node.children as any[]).push({
      type: 'file',
      name: fileName || entry.name || 'file',
      path: normalizedPath,
      size: entry.size
    });

  }

  return root.children || [];
}

async function fetchManifestFromUrl(url: string, repoName: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Manifest fetch failed with ${res.status}`);
    const manifest: any = await res.json();
    if (!Array.isArray(manifest) && manifest?.type === 'folder' && Array.isArray(manifest.children)) {
      return manifest.children;
    }
    const normalizedManifest = Array.isArray(manifest) ? manifest : [];
    return buildPagesTreeFromManifest(repoName, normalizedManifest as PagesManifestEntry[]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**

- Build the raw.githubusercontent.com manifest URL for a repo, per the
- documented content-delivery architecture (docs/archive/ARCHITECTURE.md §4.2):
- https://raw.githubusercontent.com/{owner}/{repo}/{branch}/files.json
- This is the primary read path — it works for any repo regardless of
- whether GitHub Pages is enabled, and mirrors what src/api/raw.ts already
- uses for individual file reads.
*/
export function buildRawManifestUrl(repo: string, branch: string) {
  return `https://raw.githubusercontent.com/${repo}/${branch}/files.json`;
}

/**

- Fetch a repo's files.json manifest. Tries raw.githubusercontent.com first
- (works for any repo, no GitHub Pages required), and falls back to the
- GitHub Pages-hosted copy only if the repo is explicitly marked pages-enabled
- and the raw fetch fails. Previously this only had the Pages path, which
- meant any repo whose Pages deployment was missing or stale silently
- resolved to an empty folder with no visible error.
*/
export async function fetchRepoManifest(repo: string, repoName: string, branch: string, pagesBase: string) {
  const rawUrl = buildRawManifestUrl(repo, branch || 'main');
  try {
    return await fetchManifestFromUrl(rawUrl, repoName);
  } catch (rawError) {
    if (pagesBase) {
      try {
        return await fetchManifestFromUrl(`${String(pagesBase).replace(/\/$/, '')}/files.json`, repoName);
      } catch (pagesError) {
        throw new Error(
          `Both raw.githubusercontent.com and GitHub Pages manifest fetches failed for ${repo}: ` +
          `raw=${(rawError as Error).message}; pages=${(pagesError as Error).message}`
        );
      }
    }
    throw rawError;
  }
}

/** @deprecated use fetchRepoManifest, which tries raw.githubusercontent.com first */
export async function fetchPagesManifest(pagesBase: string, repoName: string) {
  return fetchManifestFromUrl(`${String(pagesBase).replace(/\/$/, '')}/files.json`, repoName);
}
