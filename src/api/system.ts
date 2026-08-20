import crypto from 'crypto';
import type { Request, Response } from 'express';
import { loadRepoRegistry } from './repo-registry.js';
import { getSubjectRepo } from './_shared.js';
import { resolvePagesBaseUrl, fetchRepoManifest } from './pages-fetch.js';
import { sharedDelete, sharedGetJson, sharedSetJson } from '../lib/shared-cache.js';

const SUBJECTS = new Set(['science', 'commerce', 'humanities']);
const CACHE_TTL_MS = 5 * 60 * 1000;
const SHARED_CACHE_TTL_SECONDS = Math.floor(CACHE_TTL_MS / 1000);
const SHARED_CACHE_KEY_PREFIX = 'notebooks:subject-tree:v1';
const FETCHABLE_EXTENSIONS = /\.(?:md|mdx|markdown|pdf)$/i;

type SubjectTreePayload = {
  subject: string;
  repos: Array<{
    repo: string;
    branch: string;
    pagesBase: string;
    tree: any;
    error?: string;
  }>;
};

type CacheEntry = {
  payload: SubjectTreePayload;
  cachedAt: number;
};

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<CacheEntry>>();

function subjectCacheKey(subject: string): string {
  return `${SHARED_CACHE_KEY_PREFIX}:${subject}`;
}

function normalizeSubject(value: unknown): string | null {
  const subject = String(value || '').trim().toLowerCase();
  return SUBJECTS.has(subject) ? subject : null;
}

function normalizePath(value: unknown): string {
  return String(value || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

function rawUrlFor(repo: string, branch: string, filePath: string): string {
  return `https://raw.githubusercontent.com/${repo}/${branch}/${normalizePath(filePath)}`;
}

function annotateNode(node: any, repo: string, branch: string, parentPath = ''): any | null {
  if (!node || !node.name) return null;
  const isFile = node.type === 'file';
  const ownPath = normalizePath(isFile && node.path ? node.path : node.name);
  const repoPath = isFile && node.path
    ? normalizePath(node.path)
    : [parentPath, ownPath].filter(Boolean).join('/');

  if (isFile && !FETCHABLE_EXTENSIONS.test(repoPath)) return null;

  const children = Array.isArray(node.children)
    ? node.children
      .map((child: any) => annotateNode(child, repo, branch, repoPath))
      .filter(Boolean)
    : undefined;

  if (!isFile && parentPath && (!children || children.length === 0)) return null;

  return {
    ...node,
    path: repoPath,
    repo,
    branch,
    repoPath,
    ...(isFile ? { raw: rawUrlFor(repo, branch, repoPath) } : {}),
    ...(children ? { children } : {})
  };
}

function buildTreeFromGitHubEntries(repo: string, branch: string, entries: any[]): any {
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
      raw: rawUrlFor(repo, branch, filePath),
      size: typeof entry.size === 'number' ? entry.size : null
    });
  }
  return root;
}

async function fetchGithubTree(repo: string, branch: string): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const token = String(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NoteBooks-runtime-system'
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`GitHub tree fetch failed with ${response.status}`);
    const payload = await response.json() as any;
    return buildTreeFromGitHubEntries(repo, branch, Array.isArray(payload?.tree) ? payload.tree : []);
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeStream(value: unknown): string | null {
  const stream = String(value || '').trim().toLowerCase();
  if (stream === 'science' || stream === 'commerce' || stream === 'humanities') return stream;
  if (stream === 'humanity' || stream === 'arts') return 'humanities';
  return null;
}

function subjectEntries(subject: string, entries: any[]): any[] {
  const enabled = (entries || []).filter((entry) => entry?.enabled !== false && entry?.repo);
  const explicitStreamEntries = enabled.filter((entry) => normalizeStream(entry.stream) === subject);
  if (explicitStreamEntries.length > 0) return explicitStreamEntries;

  const configured = getSubjectRepo(subject);
  if (configured) {
    const exact = enabled.find((entry) => String(entry.repo).toLowerCase() === `${configured.owner}/${configured.repo}`.toLowerCase());
    return exact ? [exact] : [{ repo: `${configured.owner}/${configured.repo}`, branch: process.env.GITHUB_BRANCH || 'main', pages: true }];
  }

  return enabled.filter((entry) => {
    const haystack = `${entry.name || ''} ${entry.repo || ''}`.toLowerCase();
    return subject === 'humanities'
      ? haystack.includes('humanit') || haystack.includes('arts')
      : haystack.includes(subject);
  });
}

async function buildSubjectTree(subject: string): Promise<CacheEntry> {
  const entries = subjectEntries(subject, await loadRepoRegistry());
  const repos = await Promise.all(entries.map(async (entry) => {
    const repo = String(entry.repo);
    const repoName = repo.split('/').pop() || repo;
    const branch = String(entry.branch || process.env.GITHUB_BRANCH || 'main');
    const pagesBase = resolvePagesBaseUrl(entry);
    try {
      let tree;
      try {
        const children = await fetchRepoManifest(repo, repoName, branch, pagesBase);
        tree = {
          type: 'folder',
          name: repoName,
          children: children.map((child: any) => annotateNode(child, repo, branch)).filter(Boolean)
        };
      } catch (manifestError) {
        console.warn(`[system] files.json unavailable for ${repo}; trying GitHub tree:`, manifestError instanceof Error ? manifestError.message : manifestError);
        tree = await fetchGithubTree(repo, branch);
      }
      return { repo, branch, pagesBase, tree };
    } catch (error) {
      console.warn(`[system] subject tree failed for ${repo}:`, error instanceof Error ? error.message : error);
      return {
        repo,
        branch,
        pagesBase,
        tree: { type: 'folder', name: repoName, children: [] },
        error: 'manifest_unavailable'
      };
    }
  }));

  return {
    payload: { subject, repos },
    cachedAt: Date.now()
  };
}

async function getSubjectTree(subject: string, forceRefresh = false): Promise<CacheEntry> {
  const localCached = cache.get(subject);
  if (!forceRefresh && localCached && Date.now() - localCached.cachedAt < CACHE_TTL_MS) return localCached;

  let sharedCached: CacheEntry | null = null;
  try {
    sharedCached = await sharedGetJson<CacheEntry>(subjectCacheKey(subject));
    if (!forceRefresh && sharedCached?.payload && typeof sharedCached.cachedAt === 'number') {
      cache.set(subject, sharedCached);
      if (Date.now() - sharedCached.cachedAt < CACHE_TTL_MS) return sharedCached;
    }
  } catch {
    // Shared-cache failures must never prevent the local rebuild path.
  }

  const existing = inFlight.get(subject);
  if (existing) return existing;

  const build = buildSubjectTree(subject)
    .then(async (entry) => {
      cache.set(subject, entry);
      await sharedSetJson(subjectCacheKey(subject), entry, SHARED_CACHE_TTL_SECONDS);
      return entry;
    })
    .finally(() => inFlight.delete(subject));
  inFlight.set(subject, build);

  try {
    return await build;
  } catch (error) {
    if (localCached) return localCached;
    if (sharedCached) return sharedCached;
    throw error;
  }
}

export async function invalidateSubjectTree(subject?: string): Promise<void> {
  const subjects = subject ? [subject] : Array.from(SUBJECTS);
  for (const value of subjects) cache.delete(value);
  await Promise.all(subjects.map((value) => sharedDelete(subjectCacheKey(value))));
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
  const routeSubject = String(req.params?.subject || req.query?.subject || '').toLowerCase();
  const subject = normalizeSubject(routeSubject);
  if (!subject) return res.status(404).json({ error: 'Unknown subject' });

  if (req.method === 'GET' || req.method === 'HEAD') {
    try {
      const result = await getSubjectTree(subject);
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=900');
      res.setHeader('X-Subject-Tree-Cached-At', new Date(result.cachedAt).toISOString());
      return res.status(200).json(result.payload);
    } catch (error) {
      return res.status(503).json({ error: 'Subject tree temporarily unavailable' });
    }
  }

  if (req.method === 'POST' && String(req.path || '').endsWith('/refresh')) {
    if (!verifyRefreshSignature(req)) return res.status(401).json({ error: 'Invalid refresh signature' });
    await invalidateSubjectTree(subject);
    try {
      const result = await getSubjectTree(subject, true);
      return res.status(200).json({
        success: true,
        subject,
        repoCount: result.payload.repos.length,
        refreshedAt: result.cachedAt
      });
    } catch (error) {
      return res.status(503).json({ error: 'Subject tree refresh failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
