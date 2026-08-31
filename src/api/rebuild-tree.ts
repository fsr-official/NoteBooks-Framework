import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { getStreamTree, invalidateStreamTree } from './system.js';

const STREAMS = new Set(['science', 'commerce', 'humanities']);

type Stream = 'science' | 'commerce' | 'humanities';

function timingSafeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, 'utf8');
  const right = Buffer.from(rightValue, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function configuredOrigins(): Map<string, Stream | '*'> {
  const raw = String(process.env.TREE_REBUILD_ALLOWED_ORIGINS || process.env.GITHUB_TREE_REBUILD_ORIGINS || '').trim();
  const result = new Map<string, Stream | '*'>();
  for (const entry of raw.split(',').map((value) => value.trim()).filter(Boolean)) {
    const [origin, stream] = entry.split('=').map((value) => value.trim());
    if (!origin) continue;
    result.set(origin, stream && STREAMS.has(stream) ? stream as Stream : '*');
  }
  return result;
}

function verifyRequest(req: Request): { origin: string; streamScope: Stream | '*' } | null {
  const origin = String(req.headers['x-notebooks-workflow-origin'] || '').trim();
  const secret = String(process.env.TREE_REBUILD_SECRET || process.env.WEBHOOK_SECRET || process.env.GITHUB_WEBHOOK_SECRET || '').trim();
  const supplied = String(req.headers['x-notebooks-signature'] || req.headers['x-hub-signature-256'] || '').trim();
  const rawBody = String((req as any).rawBody || '');
  if (!origin || !secret || !supplied || !rawBody) return null;
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
  if (!timingSafeEqual(supplied, expected)) return null;
  const origins = configuredOrigins();
  const streamScope = origins.get(origin);
  if (!streamScope) return null;
  return { origin, streamScope };
}

function normalizeStreams(body: any, streamScope: Stream | '*'): Stream[] | null {
  const requested = Array.isArray(body?.streams) ? body.streams : body?.stream ? [body.stream] : ['science', 'commerce', 'humanities'];
  const streams: string[] = [...new Set<string>(requested.map((value: unknown) => String(value || '').trim().toLowerCase()))];
  if (!streams.every((value: string) => STREAMS.has(value))) return null;
  if (streamScope !== '*' && streams.some((value: string) => value !== streamScope)) return null;
  return streams as Stream[];
}

export default async function rebuildTree(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const verified = verifyRequest(req);
  if (!verified) {
    res.status(401).json({ error: 'Invalid workflow origin or signature' });
    return;
  }
  const streams = normalizeStreams(req.body, verified.streamScope);
  if (!streams) {
    res.status(400).json({ error: 'The workflow origin is not allowed to rebuild the requested stream' });
    return;
  }
  const rebuilt: Array<{ stream: string; repoCount: number; refreshedAt: string }> = [];
  try {
    for (const stream of streams) {
      await invalidateStreamTree(stream, true);
      const result = await getStreamTree(stream, true);
      rebuilt.push({ stream, repoCount: result.payload.repos.length, refreshedAt: new Date(result.cachedAt).toISOString() });
    }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, origin: verified.origin, rebuilt, rebuiltAt: new Date().toISOString() });
  } catch (error) {
    console.error('[rebuild-tree] refresh failed', error instanceof Error ? error.message : error);
    res.status(503).json({ error: 'Stream tree rebuild failed' });
  }
}
