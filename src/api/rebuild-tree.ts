import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { loadRepoRegistry, type RepoRegistryEntry } from './repo-registry.js';
import { sharedRelease, sharedTryAcquire } from '../lib/shared-cache.js';

const STREAMS = new Set(['science', 'commerce', 'humanities']);
const REBUILD_LOCK_KEY = 'notebooks:static-tree:deploy-lock:v1';
const DEFAULT_LOCK_TTL_SECONDS = 10 * 60;
type Stream = 'science' | 'commerce' | 'humanities';
let localRebuildLockUntil = 0;
let localRebuildInFlight = false;

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
  return entries.find((entry) => normalizeRepo(entry.repo) === repository && String(entry.stream || '').trim().toLowerCase() === stream) || null;
}

function lockTtlSeconds(): number {
  const configured = Number(process.env.TREE_REBUILD_LOCK_TTL_SECONDS || DEFAULT_LOCK_TTL_SECONDS);
  return Number.isFinite(configured) && configured >= 30 && configured <= 3600 ? Math.floor(configured) : DEFAULT_LOCK_TTL_SECONDS;
}

async function triggerStaticBuild(): Promise<{ jobId: string | null; state: string | null }> {
  const hookUrl = String(process.env.TREE_REBUILD_DEPLOY_HOOK_URL || '').trim();
  if (!hookUrl) throw new Error('TREE_REBUILD_DEPLOY_HOOK_URL is not configured');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(hookUrl, {
      method: 'POST',
      headers: { 'User-Agent': 'NoteBooks-Tree-Rebuild-API' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Vercel Deploy Hook returned ${response.status}`);
    let body: any = null;
    try { body = await response.json(); } catch { /* Some hooks return an empty response. */ }
    return { jobId: body?.job?.id ? String(body.job.id) : null, state: body?.job?.state ? String(body.job.state) : null };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function resetRebuildLockForTests(): void {
  localRebuildLockUntil = 0;
  localRebuildInFlight = false;
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
  if (!streams) {
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

  const ttlSeconds = lockTtlSeconds();
  if (localRebuildInFlight || Date.now() < localRebuildLockUntil) {
    res.status(409).json({ success: false, dropped: true, error: 'A static tree deployment is already pending' });
    return;
  }
  const owner = `${process.pid}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
  const acquired = await sharedTryAcquire(REBUILD_LOCK_KEY, owner, ttlSeconds);
  if (!acquired) {
    res.status(409).json({ success: false, dropped: true, error: 'A static tree deployment is already pending' });
    return;
  }

  localRebuildInFlight = true;
  try {
    const job = await triggerStaticBuild();
    localRebuildLockUntil = Date.now() + ttlSeconds * 1000;
    res.setHeader('Cache-Control', 'no-store');
    res.status(202).json({
      success: true,
      deploymentTriggered: true,
      repository,
      streams,
      job,
      dedupeUntil: new Date(localRebuildLockUntil).toISOString()
    });
  } catch (error) {
    localRebuildInFlight = false;
    await sharedRelease(REBUILD_LOCK_KEY, owner);
    console.error('[rebuild-tree] deploy hook failed', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Static tree deployment could not be triggered' });
  }
}
