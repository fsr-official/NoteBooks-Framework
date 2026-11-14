import crypto from 'crypto';
import type { Request, Response } from 'express';
import { loadRepoRegistry } from './repo-registry.js';
import { getSubjectRepo } from './_shared.js';
import { resolvePagesBaseUrl } from './pages-fetch.js';
import { sharedDelete, sharedGetJson, sharedSetJson } from '../lib/shared-cache.js';
import { fetchRepositoryManifest } from '../scripts/json-fetch.js';
import { getRuntimeCatalog, isRuntimeRegistryActive } from '../lib/runtime-catalog.js';

const STREAMS = new Set(['science', 'commerce', 'humanities', 'developers']);
const CACHE_TTL_MS = 5 * 60 * 1000;
const SHARED_CACHE_TTL_SECONDS = Math.floor(CACHE_TTL_MS / 1000);
const SHARED_CACHE_KEY_PREFIX = 'notebooks:stream-tree:v1';
const FETCHABLE_EXTENSIONS = /\.(?:md|mdx|markdown|pdf)$/i;

type StreamTreePayload = {
  stream: string;
  root: any;
  repos: Array<{
    repo: string;
    branch: string;
    pagesBase: string;
    tree: any;
    error?: string;
  }>;
};

type CacheEntry = {
  payload: StreamTreePayload;
  cachedAt: number;
  catalogVersion: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();
const runtimePreferred = new Set<string>();

function streamCacheKey(stream: string, version: number): string {
  return `${SHARED_CACHE_KEY_PREFIX}:${stream}:${version}`;
}

function normalizePath(value: unknown): string {
  return String(value || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

function rawUrlFor(repo: string, branch: string, filePath: string, commitSha?: string): string {
  return `https://raw.githubusercontent.com/${repo}/${commitSha || branch}/${normalizePath(filePath)}`;
}

function annotateNode(node: any, repo: string, branch: string, commitSha?: string, parentPath = ''): any | null {
  if (!node || !node.name) return null;
  const isFile = node.type === 'file';
  const ownPath = normalizePath(isFile && node.path ? node.path : node.name);
  const repoPath = isFile && node.path
    ? normalizePath(node.path)
    : [parentPath, ownPath].filter(Boolean).join('/');

  if (isFile && !FETCHABLE_EXTENSIONS.test(repoPath)) return null;

  const children = Array.isArray(node.children)
    ? node.children
      .map((child: any) => annotateNode(child, repo, branch, commitSha, repoPath))
      .filter(Boolean)
    : undefined;

  if (!isFile && parentPath && (!children || children.length === 0)) return null;

  return {
    ...node,
    path: repoPath,
    repo,
    branch,
    repoPath,
    ...(isFile ? {
      raw: node.raw || rawUrlFor(repo, branch, repoPath, commitSha),
      ...(node.sha ? { sha: node.sha } : {}),
      ...(commitSha ? { commitSha } : {})
    } : {}),
    ...(children ? { children } : {})
  };
}

function buildTreeFromGitHubEntries(repo: string, branch: string, entries: any[], commitSha?: string): any {
  const repoName = repo.split('/').pop() || repo;
  const root = { type: 'folder', name: repoName, children: [] as any[] };
  for (const entry of entries || []) {
    const filePath = normalizePath(entry?.path);
    if (!filePath || entry?.type !== 'blob' || !FETCHABLE_EXTENSIONS.test(filePath)) continue;
    const parts = filePath.split('/').filter(Boolean);
    let node = root;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      let next = node.children.find((child: any) => child.type === 'folder' && child.name === part);
      if (!next) {
        next = { type: 'folder', name: part, path: parts.slice(0, index + 1).join('/'), repo, branch, repoPath: parts.slice(0, index + 1).join('/'), children: [] };
        node.children.push(next);
      }
      node = next;
    }
    node.children.push({
      type: 'file',
      name: parts[parts.length - 1],
      path: filePath,
      repo,
      branch,
      repoPath: filePath,
      raw: rawUrlFor(repo, branch, filePath, commitSha),
      ...(typeof entry.sha === 'string' ? { sha: entry.sha } : {}),
      ...(commitSha ? { commitSha } : {}),
      size: typeof entry.size === 'number' ? entry.size : null
    });
  }
  return root;
}

async function fetchGithubTree(repo: string, ref: string, branch: string, commitSha?: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const token = String(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NoteBooks-runtime-system'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`GitHub tree fetch failed with ${response.status}`);
    const payload = await response.json() as any;
    return buildTreeFromGitHubEntries(repo, branch, Array.isArray(payload?.tree) ? payload.tree : [], commitSha);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeStream(value: unknown): string | null {
  const stream = String(value || '').trim().toLowerCase();
  if (stream === 'science' || stream === 'commerce' || stream === 'humanities' || stream === 'developers') return stream;
  if (stream === 'humanity' || stream === 'arts') return 'humanities';
  return null;
}

function streamEntries(stream: string, entries: any[]): any[] {
  const enabled = (entries || []).filter((entry) => entry?.enabled !== false && entry?.repo);
  const explicitStreamEntries = enabled.filter((entry) => normalizeStream(entry.stream) === stream);
  if (explicitStreamEntries.length > 0) return explicitStreamEntries;

  const configured = getSubjectRepo(stream);
  if (configured) {
    const exact = enabled.find((entry) => String(entry.repo).toLowerCase() === `${configured.owner}/${configured.repo}`.toLowerCase());
    return exact ? [exact] : [{ repo: `${configured.owner}/${configured.repo}`, branch: process.env.GITHUB_BRANCH || 'main', pages: true }];
  }

  return enabled.filter((entry) => {
    const haystack = `${entry.name || ''} ${entry.repo || ''}`.toLowerCase();
    return stream === 'humanities'
      ? haystack.includes('humanit') || haystack.includes('arts')
      : haystack.includes(stream);
  });
}

async function buildStreamTree(stream: string, catalogVersion: number): Promise<CacheEntry> {
  const entries = streamEntries(stream, await loadRepoRegistry());
  const repos = await Promise.all(entries.map(async (entry) => {
    const repo = String(entry.repo);
    const repoName = repo.split('/').pop() || repo;
    const branch = String(entry.branch || process.env.GITHUB_BRANCH || 'main');
    const commitSha = typeof entry.commitSha === 'string' ? entry.commitSha : undefined;
    const pagesBase = resolvePagesBaseUrl(entry);
    try {
      let tree;
      const explicitlyEmpty = entry.empty === true || String(entry.empty || '').toLowerCase() === 'true';
      if (explicitlyEmpty) {
        tree = { type: 'folder', name: repoName, children: [] };
      } else {
        try {
          const manifest = await fetchRepositoryManifest({ ...entry, repo, branch, commitSha });
          const children = manifest.tree.children || [];
          tree = {
            type: 'folder',
            name: repoName,
            children: children.map((child: any) => annotateNode(child, repo, branch, commitSha)).filter(Boolean)
          };
        } catch (manifestError) {
          console.warn(`[system] files.json unavailable for ${repo}; trying GitHub tree:`, manifestError instanceof Error ? manifestError.message : manifestError);
          tree = await fetchGithubTree(repo, commitSha || branch, branch, commitSha);
        }
      }
      return { repo, branch, pagesBase, commitSha, tree };
    } catch (error) {
      console.warn(`[system] stream tree failed for ${repo}:`, error instanceof Error ? error.message : error);
      return {
        repo,
        branch,
        commitSha,
        pagesBase,
        tree: { type: 'folder', name: repoName, children: [] },
        error: 'manifest_unavailable'
      };
    }
  }));
  if (stream === 'developers') {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const artifactPath = path.resolve(process.cwd(), 'public', 'json', 'developers-tree.json');
      const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
      const localRepo = artifact?.repos?.find((repo: any) => repo?.repo === 'local/NoteBooks-Framework');
      if (localRepo?.tree && !repos.some((repo) => repo.repo === localRepo.repo)) {
        repos.push({
          repo: localRepo.repo,
          branch: localRepo.branch || 'local',
          pagesBase: '',
          commitSha: undefined,
          tree: localRepo.tree
        });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
        console.warn('[system] local Developers workspace fallback unavailable:', error instanceof Error ? error.message : error);
      }
    }
  }

  const rootName = `NoteBooks-${stream.charAt(0).toUpperCase()}${stream.slice(1)}`;
  return {
    payload: {
      stream,
      root: {
        type: 'folder',
        name: rootName,
        path: rootName,
        stream,
        children: repos.map((repo) => repo.tree)
      },
      repos
    },
    cachedAt: Date.now(),
    catalogVersion
  };
}

export async function getStreamTree(stream: string, forceRefresh = false): Promise<CacheEntry> {
  let catalogVersion = 0;
  try {
    catalogVersion = (await getRuntimeCatalog()).version;
  } catch {
    // The static/bootstrap registry remains available when shared Redis is not configured.
  }

  const localCached = cache.get(stream);
  if (!forceRefresh && localCached && localCached.catalogVersion === catalogVersion && Date.now() - localCached.cachedAt < CACHE_TTL_MS) return localCached;

  let sharedCached: CacheEntry | null = null;
  try {
    sharedCached = await sharedGetJson<CacheEntry>(streamCacheKey(stream, catalogVersion));
    if (!forceRefresh && sharedCached?.payload && sharedCached.catalogVersion === catalogVersion && typeof sharedCached.cachedAt === 'number') {
      cache.set(stream, sharedCached);
      if (Date.now() - sharedCached.cachedAt < CACHE_TTL_MS) return sharedCached;
    }
  } catch {
    // Shared-cache failures must never prevent the local rebuild path.
  }

  const inFlightKey = `${stream}:${catalogVersion}`;
  const existing = inFlight.get(inFlightKey);
  if (existing) return existing;

  const build = buildStreamTree(stream, catalogVersion)
    .then(async (entry) => {
      cache.set(stream, entry);
      await sharedSetJson(streamCacheKey(stream, catalogVersion), entry, SHARED_CACHE_TTL_SECONDS);
      return entry;
    })
    .finally(() => inFlight.delete(inFlightKey));
  inFlight.set(inFlightKey, build);

  try {
    return await build;
  } catch (error) {
    if (localCached?.catalogVersion === catalogVersion) return localCached;
    if (sharedCached?.catalogVersion === catalogVersion) return sharedCached;
    throw error;
  }
}

export async function invalidateStreamTree(stream?: string, preferRuntime = false): Promise<void> {
  const streams = stream ? [stream] : Array.from(STREAMS);
  for (const value of streams) {
    cache.delete(value);
    if (preferRuntime) runtimePreferred.add(value);
    else runtimePreferred.delete(value);
  }
  let version = 0;
  try {
    version = (await getRuntimeCatalog()).version;
  } catch {
    // A local cache clear remains useful when shared Redis is unavailable.
  }
  await Promise.all(streams.map((value) => sharedDelete(streamCacheKey(value, version))));
}

function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifyRefreshSignature(req: Request): boolean {
  const secret = String(process.env.WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET || '').trim();
  if (!secret) return false;
  const rawBody = String((req as any).rawBody || '');
  if (!rawBody) return false;

  const supplied = String(
    req.headers['x-hub-signature-256'] ||
    req.headers['x-system-signature'] ||
    req.headers['x-webhook-signature'] ||
    ''
  );
  if (!supplied) return false;

  const prefix = supplied.startsWith('sha256=') ? 'sha256=' : '';
  const expected = `${prefix}sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`.replace(/^sha256=sha256=/, 'sha256=');
  return timingSafeEqual(supplied, expected);
}

export default async function handler(req: Request, res: Response) {
    const routeStream = req.params?.stream ?? req.params?.subject ?? req.query?.stream ?? req.query?.subject;
  const stream = normalizeStream(routeStream);
  if (!stream) return res.status(404).json({ error: 'Unknown stream' });

  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      if (runtimePreferred.has(stream) || await isRuntimeRegistryActive()) {
        const refreshed = await getStreamTree(stream);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Stream-Tree-Source', 'runtime-rebuilt');
        return res.status(200).json(refreshed.payload);
      }
      const fs = await import('fs/promises');
      const path = await import('path');
      const canonicalPath = path.resolve(process.cwd(), 'public', 'json', `${stream}-tree.json`);
      try {
        const canonicalText = await fs.readFile(canonicalPath, 'utf8');
        const canonicalPayload = JSON.parse(canonicalText);
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=900');
        res.setHeader('X-Stream-Tree-Source', 'generated-json');
        return res.status(200).json(canonicalPayload);
      } catch {
        // Fall through to the compatibility runtime builder when no artifact exists.
      }

      const result = await getStreamTree(stream);
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=900');
      res.setHeader('X-Stream-Tree-Cached-At', new Date(result.cachedAt).toISOString());
      return res.status(200).json(result.payload);
    } catch (error) {
      return res.status(503).json({ error: 'Stream tree temporarily unavailable' });
    }
  }

  if (req.method === 'POST' && String(req.path || '').endsWith('/refresh')) {
    if (!verifyRefreshSignature(req)) return res.status(401).json({ error: 'Invalid refresh signature' });
    await invalidateStreamTree(stream);
    try {
      const result = await getStreamTree(stream, true);
      return res.status(200).json({
        success: true,
        stream,
        repoCount: result.payload.repos.length,
        refreshedAt: result.cachedAt
      });
    } catch (error) {
      return res.status(503).json({ error: 'Stream tree refresh failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
