import type { Request, Response } from 'express';
import { getOctokit, getRepoConfig } from './_shared';
import { fetchPagesManifest, resolvePagesBaseUrl } from './pages-fetch';

export interface RepoRegistryEntry {
  name: string;
  repo: string;
  branch?: string;
  root?: string;
  enabled?: boolean;
  priority?: number;
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
    priority: typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER
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
      const [name, repo, branch, root, enabled, priority] = cells;
      return {
        name,
        repo,
        branch,
        root,
        enabled: enabled.toLowerCase() !== 'false',
        priority: Number(priority)
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

async function fetchRepoContentsWithRetry(octokit: any, owner: string, repo: string, path: string, branch: string, retries = 3) {
  const normalizedPath = normalizePath(path || '.');

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path: normalizedPath || '.',
        ref: branch,
        headers: {
          'X-GitHub-Api-Version': '2022-11-28'
        }
      });
    } catch (error: any) {
      const status = typeof error?.status === 'number' ? error.status : 0;
      const shouldRetry = attempt < retries && (status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 0);
      if (!shouldRetry) throw error;

      const delayMs = 500 * (attempt + 1) + Math.floor(Math.random() * 250);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Failed to fetch repository contents after retries');
}

async function fetchRepoTree(octokit: any, owner: string, repo: string, branch: string, root = '') {
  const rootPath = normalizePath(root);
  const response = await fetchRepoContentsWithRetry(octokit, owner, repo, rootPath || '.', branch);
  const item = Array.isArray(response.data) ? response.data : [response.data];
  const children: TreeNode[] = [];

  for (const entry of item) {
    const name = entry.name;
    const entryPath = normalizePath([rootPath, name].filter(Boolean).join('/'));

    if (entry.type === 'dir') {
      const nestedChildren = await fetchRepoTree(octokit, owner, repo, branch, entryPath);
      children.push({ type: 'folder', name, path: entryPath, children: nestedChildren, repo: `${owner}/${repo}` });
    } else if (entry.type === 'file') {
      children.push({ type: 'file', name, path: entryPath, repo: `${owner}/${repo}` });
    }
  }

  return children;
}

export async function buildRegistryTree(entries: RepoRegistryEntry[]) {
  const octokit = await getOctokit({ allowUnauthenticated: true });
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

    const repoRoot = normalizePath(entry.root || '');
    const repoNode: TreeNode = {
      type: 'folder',
      name: entry.name || repoName,
      path: entry.name || repoName,
      repo: entry.repo,
      children: []
    };

    try {
      const priority = typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER;
      const pagesBaseUrl = resolvePagesBaseUrl(entry);
      let children: TreeNode[] = [];

      if (pagesBaseUrl) {
        try {
          const pagesChildren = await fetchPagesManifest(pagesBaseUrl, entry.name || repoName);
          children = pagesChildren.map((child) => prefixRepoPaths(child, entry.name || repoName, entry.repo, entry.branch || 'main', priority));
        } catch (error) {
          console.warn(`[repo-registry] Pages manifest fallback for ${entry.repo}:`, error);
          const repoChildren = await fetchRepoTree(octokit, owner, repoName, entry.branch || 'main', repoRoot);
          children = repoChildren.map((child) => prefixRepoPaths(child, entry.name || repoName, entry.repo, entry.branch || 'main', priority));
        }
      } else {
        const repoChildren = await fetchRepoTree(octokit, owner, repoName, entry.branch || 'main', repoRoot);
        children = repoChildren.map((child) => prefixRepoPaths(child, entry.name || repoName, entry.repo, entry.branch || 'main', priority));
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

function getRefreshCacheKey(req: Request) {
  return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`;
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const manifestPath = path.resolve(process.cwd(), 'files.json');

    try {
      const manifestText = await fs.readFile(manifestPath, 'utf8');
      return res.status(200).type('application/json').send(manifestText);
    } catch {
      const cacheKey = getRefreshCacheKey(req);
      const cached = refreshCache.get(cacheKey);
      const now = Date.now();
      if (cached && now - cached.cachedAt < 30_000) {
        return res.status(200).json(cached.value);
      }

      const entries = await loadRepoRegistry();
      const tree = await buildRegistryTree(entries);
      refreshCache.set(cacheKey, { cachedAt: now, value: tree });
      return res.status(200).json(tree);
    }
  } catch (error: any) {
    console.error('[api/repo-registry]', error);
    return res.status(500).json({ error: error?.message || 'Failed to build repo registry index' });
  }
}
