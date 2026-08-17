import type { Request, Response } from 'express';

// Defer importing pages-fetch so the module can be executed from TypeScript
// during build-time (ts-node) or from compiled JavaScript (dist). Try the
// runtime JS import first, then fall back to the TS source when running
// directly.
let fetchPagesManifest: any;
let resolvePagesBaseUrl: any;

async function ensurePagesFetchLoaded() {
  if (fetchPagesManifest && resolvePagesBaseUrl) return;
  try {
    // runtime compiled shape
    const m = await import('./pages-fetch.js');
    fetchPagesManifest = m.fetchPagesManifest || m.default?.fetchPagesManifest;
    resolvePagesBaseUrl = m.resolvePagesBaseUrl || m.default?.resolvePagesBaseUrl;
  } catch (e) {
    // fallback to TypeScript source when running under ts-node
    // @ts-ignore allow importing the TS source when ts-node is registered
    const m = await import('./pages-fetch.ts');
    fetchPagesManifest = m.fetchPagesManifest;
    resolvePagesBaseUrl = m.resolvePagesBaseUrl;
  }
}

export interface RepoRegistryEntry {
  name: string;
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

  const rows = tableLines.slice(2);

  return rows
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6 && cells[0] && cells[1])
    .map((cells) => {
      const [name, repo, branch, root, enabled, priority, pages] = cells;
      return {
        name,
        repo,
        branch,
        root,
        enabled: enabled.toLowerCase() !== 'false',
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
  await ensurePagesFetchLoaded();
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

      if (usePagesPath && pagesBaseUrl) {
        try {
          console.log(`[repo-registry] Using Pages read-path for ${entry.repo}`);
          const pagesChildren = await fetchPagesManifest(pagesBaseUrl, repoName);
          children = pagesChildren.map((child: TreeNode) => prefixRepoPaths(child, repoName, entry.repo, entry.branch || 'main', priority));
        } catch (error) {
          console.warn(`[repo-registry] Pages manifest failed for ${entry.repo}; skipping without GitHub API recursion:`, error);
        }
      } else {
        console.warn(`[repo-registry] Skipping ${entry.repo}; pages: true is required for the non-recursive read path.`);
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
