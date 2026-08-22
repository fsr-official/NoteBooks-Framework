import type { Request, Response } from 'express';
import { fetchRepoManifest, resolvePagesBaseUrl } from '../shims/pages-fetch.js';

export interface RepoRegistryEntry {
  name: string;
  stream?: string;
  repo: string;
  branch?: string;
  root?: string;
  enabled?: boolean;
  priority?: number;
  pages?: boolean | string;
}

export interface TreeNode {
  type: 'folder' | 'file';
  name: string;
  path?: string;
  repoPath?: string;
  branch?: string;
  priority?: number;
  shadowedBy?: string;
  isCanonical?: boolean;
  children?: TreeNode[];
  repo?: string;
}

function normalizeRepoEntry(entry: RepoRegistryEntry): RepoRegistryEntry {
  return {
    name: entry.name || entry.repo,
    stream: entry.stream ? String(entry.stream).trim().toLowerCase() : undefined,
    repo: entry.repo,
    branch: entry.branch || process.env.GITHUB_BRANCH || 'main',
    root: entry.root || '',
    enabled: entry.enabled !== false,
    priority: typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER,
    pages: entry.pages
  };
}

export function parseRepoRegistryMarkdown(markdown: string): RepoRegistryEntry[] {
  const lines = markdown.split(/\r?\n/);
  const tableLines = lines.filter((line) => line.trim().startsWith('|'));
  if (tableLines.length < 2) {
    return [];
  }

  const headers = tableLines[0]
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim().toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const valueOf = (cells: string[], name: string) => {
    const index = indexOf(name);
    return index >= 0 ? cells[index] || '' : '';
  };

  return tableLines.slice(2)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 2 && valueOf(cells, 'name') && valueOf(cells, 'repo'))
    .map((cells) => {
      const priority = valueOf(cells, 'priority');
      const pages = valueOf(cells, 'pages');
      return {
        name: valueOf(cells, 'name'),
        stream: valueOf(cells, 'stream').toLowerCase() || undefined,
        repo: valueOf(cells, 'repo'),
        branch: valueOf(cells, 'branch') || undefined,
        root: valueOf(cells, 'root'),
        enabled: valueOf(cells, 'enabled').toLowerCase() !== 'false',
        priority: Number(priority),
        pages: pages ? pages.toLowerCase() === 'true' : false
      };
    })
    .filter((entry) => !Number.isNaN(entry.priority));
}

function buildTreeNode(name: string, path: string, children: TreeNode[] = []): TreeNode {
  return { type: 'folder', name, path, children };
}

function normalizePath(input: string) {
  return input.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

function stripRootPrefix(path: string, root: string) {
  const normalizedRoot = normalizePath(root);
  const normalizedPath = normalizePath(path);
  if (!normalizedRoot) return normalizedPath;
  return normalizedPath.startsWith(`${normalizedRoot}/`) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}

function prefixRepoPaths(node: TreeNode, prefix: string, repo: string, branch: string, priority: number): TreeNode {
  const normalizedPath = normalizePath(node.path || '');
  const prefixedPath = normalizedPath ? `${prefix}/${normalizedPath}` : prefix;
  const repoPath = normalizedPath || undefined;
  const children = Array.isArray(node.children)
    ? node.children.map((child) => prefixRepoPaths(child, prefixedPath, repo, branch, priority))
    : undefined;

  const result: TreeNode = {
    ...node,
    path: prefixedPath,
    repo,
    branch,
    priority,
    repoPath,
    isCanonical: true,
    children
  };

  return result;
}

export async function buildRegistryTree(entries: RepoRegistryEntry[]) {
  const normalizedEntries = entries
    .map(normalizeRepoEntry)
    .filter((entry) => entry.enabled)
    .sort((a, b) => {
      const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
      const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return String(a.name).localeCompare(String(b.name));
    });
  const rootChildren: TreeNode[] = [];

  for (const entry of normalizedEntries) {
    const [owner, repoName] = entry.repo.split('/');
    if (!owner || !repoName) continue;

    const repoNode: TreeNode = {
      type: 'folder',
      name: repoName,
      path: repoName,
      repo: entry.repo,
      children: []
    };

    try {
      const priority = typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER;
      const usePagesPath = entry.pages === true || entry.pages === 'true';
      const pagesBaseUrl = usePagesPath ? resolvePagesBaseUrl(entry) : '';
      let children: TreeNode[] = [];

      try {
        // raw.githubusercontent.com is tried first regardless of the `pages`
        // flag (it needs no GitHub Pages deployment at all); the Pages URL,
        // when configured, is used only as a fallback if that fails.
        const rawChildren = await fetchRepoManifest(entry.repo, repoName, entry.branch || 'main', pagesBaseUrl);
        children = rawChildren.map((child: TreeNode) => prefixRepoPaths(child, repoName, entry.repo, entry.branch || 'main', priority));
      } catch (error) {
        console.warn(`[repo-registry] Manifest fetch failed for ${entry.repo}; showing as empty:`, error);
      }

      repoNode.children = children;
      rootChildren.push(repoNode);
    } catch (error) {
      console.warn(`Skipping repo ${entry.repo}:`, error);
    }
  }

  const tree: TreeNode = {
    type: 'folder',
    name: 'root',
    children: rootChildren
  };

  resolveDuplicateFiles(tree);

  return tree;
}

function resolveDuplicateFiles(root: TreeNode) {
  const filesByRepoPath = new Map<string, TreeNode[]>();

  function collect(node: TreeNode) {
    if (!node) return;
    if (node.type === 'file' && node.repoPath) {
      const key = normalizePath(node.repoPath);
      const existing = filesByRepoPath.get(key) || [];
      existing.push(node);
      filesByRepoPath.set(key, existing);
    }
    if (Array.isArray(node.children)) {
      node.children.forEach(collect);
    }
  }

  collect(root);

  for (const [repoPath, nodes] of filesByRepoPath.entries()) {
    if (nodes.length <= 1) {
      nodes[0].isCanonical = true;
      continue;
    }

    nodes.sort((a, b) => {
      const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
      const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return String(a.repo || '').localeCompare(String(b.repo || ''));
    });

    const canonical = nodes[0];
    canonical.isCanonical = true;

    for (const shadowed of nodes.slice(1)) {
      shadowed.isCanonical = false;
      shadowed.shadowedBy = canonical.path;
    }
  }
}

export async function loadRepoRegistry(): Promise<RepoRegistryEntry[]> {
  const registryPath = process.env.REPO_REGISTRY_PATH || 'GITHUB-REPOSITORIES.md';
  const fs = await import('fs/promises');
  const path = await import('path');
  const filePath = path.resolve(process.cwd(), registryPath);

  try {
    const data = await fs.readFile(filePath, 'utf8');
    if (data.trim().startsWith('|')) {
      return parseRepoRegistryMarkdown(data);
    }
    if (data.trim().startsWith('{')) {
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : parsed.entries || [];
    }
    return parseRepoRegistryMarkdown(data);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      const fallbackPath = path.resolve(process.cwd(), 'repo-registry.json');
      try {
        const fallbackData = await fs.readFile(fallbackPath, 'utf8');
        const parsed = JSON.parse(fallbackData);
        console.warn('[api/repo-registry] repo-registry.json is deprecated; please migrate to GITHUB-REPOSITORIES.md');
        return Array.isArray(parsed) ? parsed : parsed.entries || [];
      } catch {
        return [];
      }
    }
    throw error;
  }
}

const refreshCache = new Map<string, { cachedAt: number; value: any }>();
let buildInProgress = false;
let lastSuccessfulBuild: { cachedAt: number; value: any } | null = null;

function getRefreshCacheKey(req: Request) {
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const canonicalPath = path.resolve(process.cwd(), 'public', 'json', 'repo-registry.json');
    try {
      const canonicalText = await fs.readFile(canonicalPath, 'utf8');
      const canonicalTree = JSON.parse(canonicalText) as TreeNode;
      return res.status(200).json(canonicalTree);
    } catch {
      // Fall through to the legacy local-plus-remote registry builder.
    }

    const manifestPath = path.resolve(process.cwd(), 'files.json');

    try {
      const manifestText = await fs.readFile(manifestPath, 'utf8');
      const localTree = JSON.parse(manifestText) as TreeNode;
      const entries = await loadRepoRegistry();
      const remoteTree = await buildRegistryTree(entries);
      const combinedTree: TreeNode = {
        ...localTree,
        name: 'root',
        children: [
          ...(Array.isArray(localTree.children) ? localTree.children : []),
          ...(Array.isArray(remoteTree.children) ? remoteTree.children : [])
        ]
      };
      return res.status(200).json(combinedTree);
    } catch {
      const cacheKey = getRefreshCacheKey(req);
      const cached = refreshCache.get(cacheKey);
      const now = Date.now();

      // Return cached result if fresh (30 seconds)
      if (cached && now - cached.cachedAt < 30_000) {
        return res.status(200).json(cached.value);
      }

      // If build is already in progress, return last successful build immediately
      // to avoid timeout on concurrent requests
      if (buildInProgress && lastSuccessfulBuild) {
        console.log('[repo-registry] Build in progress, returning cached result');
        return res.status(200).json(lastSuccessfulBuild.value);
      }

      // Start new build with a timeout to prevent Vercel function timeout
      buildInProgress = true;
      try {
        const buildPromise = (async () => {
          const entries = await loadRepoRegistry();
          const tree = await buildRegistryTree(entries);
          return tree;
        })();

        // Set a 9-second timeout (Vercel limit is 10s for Hobby)
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error('Registry build timeout - returning cached data')), 9000);
        });

        const tree = await Promise.race([buildPromise, timeoutPromise]);
        const cacheEntry = { cachedAt: now, value: tree };
        refreshCache.set(cacheKey, cacheEntry);
        lastSuccessfulBuild = cacheEntry;
        console.log('[repo-registry] Successfully built registry');
        return res.status(200).json(tree);
      } catch (buildError: any) {
        console.warn('[repo-registry] Build failed:', buildError.message);
        // If build fails/times out and we have a previous successful build, return it
        if (lastSuccessfulBuild) {
          console.log('[repo-registry] Returning last successful build due to timeout/error');
          return res.status(200).json(lastSuccessfulBuild.value);
        }
        throw buildError;
      } finally {
        buildInProgress = false;
      }
    }
  } catch (error: any) {
    console.error('[api/repo-registry]', error);
    return res.status(500).json({ error: error?.message || 'Failed to build repo registry index' });
  }
}
