import { resolvePagesBaseUrl } from '../api/pages-fetch.js';

export interface JsonFetchRegistryEntry {
  name?: string;
  stream?: string;
  repo: string;
  branch?: string;
  root?: string;
  enabled?: boolean;
  priority?: number;
  pages?: boolean | string;
}

export interface JsonFetchNode {
  type: 'folder' | 'file';
  name: string;
  path?: string;
  repoPath?: string;
  repo?: string;
  branch?: string;
  stream?: string;
  raw?: string;
  size?: number | null;
  [key: string]: unknown;
  children?: JsonFetchNode[];
}

export interface RepositoryManifestInstance {
  stream: string;
  repo: string;
  branch: string;
  root: string;
  name: string;
  manifestUrl: string;
  source: 'raw' | 'pages';
  files: JsonFetchNode[];
  tree: JsonFetchNode;
}

const DEFAULT_BRANCH = 'main';
const FETCH_TIMEOUT_MS = 10_000;

export function normalizePath(value: unknown): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .replace(/\/\.\//g, '/')
    .replace(/(^|\/)\.\.(?=\/|$)/g, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function normalizeStream(value: unknown): string {
  const stream = String(value || '').trim().toLowerCase();
  if (stream === 'humanity' || stream === 'arts') return 'humanities';
  return stream || 'unassigned';
}

export function repositoryName(repo: string): string {
  return String(repo).split('/').filter(Boolean).pop() || String(repo);
}

export function buildRawFilesJsonUrl(entry: JsonFetchRegistryEntry): string {
  const branch = entry.branch || DEFAULT_BRANCH;
  const root = normalizePath(entry.root || '');
  const suffix = root ? `${root}/files.json` : 'files.json';
  return `https://raw.githubusercontent.com/${entry.repo}/${encodeURIComponent(branch)}/${suffix}`;
}

export function buildRawFileUrl(repo: string, branch: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch || DEFAULT_BRANCH)}/${normalizePath(filePath)}`;
}

function buildPagesFilesJsonUrl(entry: JsonFetchRegistryEntry): string {
  const pagesBase = resolvePagesBaseUrl(entry);
  const root = normalizePath(entry.root || '');
  const suffix = root ? `${root}/files.json` : 'files.json';
  return `${String(pagesBase).replace(/\/$/, '')}/${suffix}`;
}

function isFolderNode(node: any): boolean {
  return node?.type === 'folder' || node?.type === 'dir' || node?.type === 'tree' || Array.isArray(node?.children);
}

function isFileNode(node: any): boolean {
  return node?.type === 'file' || node?.type === 'blob' || Boolean(node?.download_url) || Boolean(node?.path && !Array.isArray(node?.children));
}

function joinPath(parentPath: string, childPath: string): string {
  const child = normalizePath(childPath);
  if (!parentPath) return child;
  if (!child) return normalizePath(parentPath);
  if (child.toLowerCase() === normalizePath(parentPath).toLowerCase() || child.toLowerCase().startsWith(`${normalizePath(parentPath).toLowerCase()}/`)) {
    return child;
  }
  return normalizePath(`${parentPath}/${child}`);
}

function basename(value: string): string {
  const normalized = normalizePath(value);
  return normalized.split('/').pop() || normalized;
}

function annotateFile(node: any, entry: JsonFetchRegistryEntry, stream: string, parentPath: string): JsonFetchNode | null {
  const rawPath = node?.path ? normalizePath(node.path) : joinPath(parentPath, String(node?.name || ''));
  if (!rawPath) return null;
  const branch = entry.branch || DEFAULT_BRANCH;
  const result: JsonFetchNode = {
    ...node,
    type: 'file',
    name: String(node?.name || basename(rawPath)),
    path: rawPath,
    repoPath: rawPath,
    repo: entry.repo,
    branch,
    stream,
    raw: buildRawFileUrl(entry.repo, branch, rawPath)
  };
  if (typeof node?.size === 'number') result.size = node.size;
  delete result.children;
  return result;
}

function annotateTreeNode(node: any, entry: JsonFetchRegistryEntry, stream: string, parentPath = ''): JsonFetchNode | null {
  if (!node || typeof node !== 'object') return null;
  const nodePath = node.path ? normalizePath(node.path) : joinPath(parentPath, String(node.name || ''));
  if (isFileNode(node) && !isFolderNode(node)) return annotateFile(node, entry, stream, parentPath);
  if (!node.name && !nodePath) return null;

  const children = Array.isArray(node.children)
    ? node.children
      .map((child: any) => annotateTreeNode(child, entry, stream, nodePath))
      .filter(Boolean) as JsonFetchNode[]
    : [];

  const folder: JsonFetchNode = {
    ...node,
    type: 'folder',
    name: String(node.name || basename(nodePath) || repositoryName(entry.repo)),
    ...(nodePath ? { path: nodePath } : {}),
    repo: entry.repo,
    branch: entry.branch || DEFAULT_BRANCH,
    stream,
    children
  };
  return folder;
}

function addFileToTree(root: JsonFetchNode, file: JsonFetchNode): void {
  const filePath = normalizePath(file.path || file.name);
  const parts = filePath.split('/').filter(Boolean);
  if (parts.length === 0) return;

  let current = root;
  let currentPath = '';
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    current.children = current.children || [];
    let next = current.children.find((child) => child.type === 'folder' && child.name === part);
    if (!next) {
      next = {
        type: 'folder',
        name: part,
        path: currentPath,
        repoPath: currentPath,
        repo: file.repo,
        branch: file.branch,
        stream: file.stream,
        children: []
      };
      current.children.push(next);
    }
    current = next;
  }

  current.children = current.children || [];
  const alreadyPresent = current.children.some((child) => child.type === 'file' && child.path === file.path);
  if (!alreadyPresent) current.children.push(file);
}

function collectFiles(node: JsonFetchNode, entry: JsonFetchRegistryEntry, stream: string, parentPath = ''): JsonFetchNode[] {
  const output: JsonFetchNode[] = [];
  if (node.type === 'file') {
    output.push(annotateFile(node, entry, stream, parentPath) || node);
    return output;
  }
  for (const child of node.children || []) {
    output.push(...collectFiles(child, entry, stream, node.path || parentPath));
  }
  return output;
}

export function normalizeManifest(manifest: unknown, entry: JsonFetchRegistryEntry, stream: string): { files: JsonFetchNode[]; tree: JsonFetchNode } {
  const repoName = repositoryName(entry.repo);
  const root: JsonFetchNode = {
    type: 'folder',
    name: repoName,
    path: repoName,
    repo: entry.repo,
    branch: entry.branch || DEFAULT_BRANCH,
    stream,
    children: []
  };

  if (Array.isArray(manifest)) {
    for (const item of manifest) {
      const annotated = annotateTreeNode(item, entry, stream);
      if (!annotated) continue;
      if (annotated.type === 'file') {
        addFileToTree(root, annotated);
      } else if (annotated.children?.length) {
        const files = collectFiles(annotated, entry, stream);
        files.forEach((file) => addFileToTree(root, file));
      }
    }
  } else if (manifest && typeof manifest === 'object') {
    const annotated = annotateTreeNode(manifest, entry, stream);
    if (annotated?.type === 'file') {
      addFileToTree(root, annotated);
    } else if (annotated) {
      for (const file of collectFiles(annotated, entry, stream)) addFileToTree(root, file);
    }
  }

  return { files: collectFiles(root, entry, stream), tree: root };
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'NoteBooks-json-fetch' }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchRepositoryManifest(entry: JsonFetchRegistryEntry): Promise<RepositoryManifestInstance> {
  const stream = normalizeStream(entry.stream || entry.name || entry.repo);
  const branch = entry.branch || DEFAULT_BRANCH;
  const normalizedEntry = { ...entry, branch };
  const rawUrl = buildRawFilesJsonUrl(normalizedEntry);
  const pagesEnabled = entry.pages === true || String(entry.pages || '').toLowerCase() === 'true';
  const attempts: Array<{ url: string; source: 'raw' | 'pages' }> = [{ url: rawUrl, source: 'raw' }];
  if (pagesEnabled && resolvePagesBaseUrl(entry)) attempts.push({ url: buildPagesFilesJsonUrl(normalizedEntry), source: 'pages' });

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      const manifest = await fetchJson(attempt.url);
      const normalized = normalizeManifest(manifest, normalizedEntry, stream);
      return {
        stream,
        repo: entry.repo,
        branch,
        root: normalizePath(entry.root || ''),
        name: String(entry.name || repositoryName(entry.repo)),
        manifestUrl: attempt.url,
        source: attempt.source,
        files: normalized.files,
        tree: normalized.tree
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`Unable to fetch files.json for ${entry.repo}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
