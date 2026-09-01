import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { getStreamTree, invalidateStreamTree } from './system.js';
import { loadRepoRegistry, type RepoRegistryEntry } from './repo-registry.js';
import { sharedRelease, sharedTryAcquire } from '../lib/shared-cache.js';

const STREAMS = new Set(['science', 'commerce', 'humanities']);
const REBUILD_LOCK_KEY = 'notebooks:stream-tree:rebuild-lock:v1';
const REBUILD_LOCK_TTL_SECONDS = 90;
type Stream = 'science' | 'commerce' | 'humanities';
let localRebuildInFlight: Promise<unknown> | null = null;

function timingSafeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, 'utf8');
  const right = Buffer.from(rightValue, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function verifySignature(req: Request): boolean {
  const secret = String(process.env.TREE_REBUILD_SECRET || process.env.WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET || '').trim();
  const supplied = String(req.headers['x-notebooks-signature'] || req.headers['x-hub-signature-256'] || '').trim();
  const rawBody = String((req as any).rawBody || '');
  if (!secret || !supplied || !rawBody) return false;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  return timingSafeEqual(supplied, expected);
}

function normalizeStreams(body: any): Stream[] | null {
  const requested = Array.isArray(body?.streams) ? body.streams : body?.stream ? [body.stream] : [];
  const streams: string[] = [...new Set<string>(requested.map((value: unknown) => String(value || '').trim().toLowerCase()))];
  if (!streams.length || !streams.every((value) => STREAMS.has(value))) return null;
  return streams as Stream[];
}

function normalizeRepo(value: unknown): string {
  return String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '').toLowerCase();
}

function findRegistryEntry(entries: RepoRegistryEntry[], repository: string, stream: Stream): RepoRegistryEntry | null {
  const normalizedRepository = normalizeRepo(repository);
  return entries.find((entry) => normalizeRepo(entry.repo) === normalizedRepository && String(entry.stream || '').trim().toLowerCase() === stream) || null;
}

function safeRequestOwner(req: Request): string {
  return `${process.pid}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
}

export default async function rebuildTree(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!verifySignature(req)) {
    res.status(401).json({ error: 'Invalid workflow signature' });
    return;
  }

  const headerRepository = normalizeRepo(req.headers['x-notebooks-workflow-origin']);
  const bodyRepository = normalizeRepo(req.body?.repository);
  if (!headerRepository || !bodyRepository || headerRepository !== bodyRepository) {
    res.status(403).json({ error: 'Workflow origin does not match the registered repository' });
    return;
  }
  const repository = bodyRepository;
  const streams = normalizeStreams(req.body);
  if (!repository || !streams) {
    res.status(400).json({ error: 'repository and a non-empty supported streams list are required' });
    return;
  }

  let entries: RepoRegistryEntry[];
  try {
    entries = await loadRepoRegistry();
  } catch (error) {
    console.error('[rebuild-tree] registry load failed', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Repository registry unavailable' });
    return;
  }
  for (const stream of streams) {
    const entry = findRegistryEntry(entries, repository, stream);
    if (!entry || entry.enabled === false) {
      res.status(403).json({ error: 'Workflow repository is not registered for the requested stream' });
      return;
    }
  }

  if (localRebuildInFlight) {
    res.status(409).json({ success: false, dropped: true, error: 'A tree rebuild is already in progress' });
    return;
  }

  const owner = safeRequestOwner(req);
  const rebuild = (async () => {
    const acquired = await sharedTryAcquire(REBUILD_LOCK_KEY, owner, REBUILD_LOCK_TTL_SECONDS);
    if (!acquired) return null;
    try {
      const rebuilt: Array<{ stream: string; repoCount: number; refreshedAt: string }> = [];
      for (const stream of streams) {
        await invalidateStreamTree(stream, true);
        const result = await getStreamTree(stream, true);
        rebuilt.push({ stream, repoCount: result.payload.repos.length, refreshedAt: new Date(result.cachedAt).toISOString() });
      }
      return rebuilt;
    } finally {
      await sharedRelease(REBUILD_LOCK_KEY, owner);
    }
  })();
  localRebuildInFlight = rebuild;
  try {
    const rebuilt = await rebuild;
    if (!rebuilt) {
      res.status(409).json({ success: false, dropped: true, error: 'A tree rebuild is already in progress' });
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, repository, rebuilt, rebuiltAt: new Date().toISOString() });
  } catch (error) {
    console.error('[rebuild-tree] refresh failed', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Stream tree rebuild failed' });
  } finally {
    if (localRebuildInFlight === rebuild) localRebuildInFlight = null;
  }
}
