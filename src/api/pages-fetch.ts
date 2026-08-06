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

export async function fetchPagesManifest(pagesBase: string, repoName: string) {
  const url = `${String(pagesBase).replace(/\/$/, '')}/files.json`;
  
  // Add a 5-second timeout for Pages manifest fetch to prevent hanging
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Pages manifest fetch failed with ${res.status}`);
    const manifest = await res.json();
    const normalizedManifest = Array.isArray(manifest) ? manifest : [];
    return buildPagesTreeFromManifest(repoName, normalizedManifest as PagesManifestEntry[]);
  } finally {
    clearTimeout(timeoutId);
  }
}
