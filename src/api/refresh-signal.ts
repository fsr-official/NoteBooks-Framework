import crypto from 'crypto';
import type { Request, Response } from 'express';

export interface RefreshSignal {
  signal: string;
  type: 'directory' | 'file';
  at: number;
  path?: string;
  reason?: string;
  commitHash?: string;
}

const recentSignals: RefreshSignal[] = [];
const MAX_SIGNALS_HISTORY = 50;

export function addRefreshSignal(
  signal: string,
  type: 'directory' | 'file',
  metadata?: { path?: string; reason?: string; commitHash?: string }
) {
  const refreshSignal: RefreshSignal = {
    signal,
    type,
    at: Date.now(),
    ...metadata
  };
  
  recentSignals.unshift(refreshSignal);
  
  // Keep only recent history
  if (recentSignals.length > MAX_SIGNALS_HISTORY) {
    recentSignals.pop();
  }
  
  console.log(`[refresh-signal] Added ${type} signal:`, signal, metadata);
}

function getWebhookSecret(): string | undefined {
  return process.env.WEBHOOK_SECRET;
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function timingSafeCompare(a: string, b: string): boolean {
  if (!isString(a) || !isString(b)) {
    return false;
  }
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifyWebhookSignature(req: Request): boolean {
  const secret = getWebhookSecret();
  if (!secret) {
    return true;
  }

  const rawBody = (req as any).rawBody;
  if (!isString(rawBody)) {
    return false;
  }

  const signature256 = req.headers['x-hub-signature-256'] as string | undefined;
  const signature = req.headers['x-hub-signature'] as string | undefined;

  if (signature256) {
    const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
    return timingSafeCompare(signature256, expected);
  }

  if (signature) {
    const expected = `sha1=${crypto.createHmac('sha1', secret).update(rawBody, 'utf8').digest('hex')}`;
    return timingSafeCompare(signature, expected);
  }

  return false;
}

export function getLatestSignal(): RefreshSignal | null {
  return recentSignals[0] || null;
}

export function getRecentSignals(since?: number): RefreshSignal[] {
  if (!since) {
    return recentSignals.slice(0, 10);
  }
  return recentSignals.filter((sig) => sig.at > since);
}

export default function handler(req: Request, res: Response) {
  if (req.method === 'POST') {
    return handlePost(req, res);
  }
  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  return res.status(405).json({ error: 'Method not allowed' });
}

function handlePost(req: Request, res: Response) {
  if (!verifyWebhookSignature(req)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const requestBody = req.body || {};
  let { signal, type, path: filePath, reason, commitHash } = requestBody as any;
  const signalType = type === 'file' ? 'file' : 'directory';

  if (!signal) {
    if (requestBody?.head_commit) {
      const headCommit = requestBody.head_commit;
      signal = `github-push-${String(headCommit.id || requestBody.after || Date.now())}`;
      filePath = filePath || headCommit.modified?.[0] || headCommit.added?.[0] || String(requestBody.ref || '');
      reason = reason || `GitHub push ${String(requestBody.ref || '')}`;
      commitHash = commitHash || headCommit.id || requestBody.after;
    } else if (requestBody?.action && requestBody?.repository) {
      signal = `github-event-${String(requestBody.action)}-${Date.now()}`;
      reason = reason || `GitHub event ${requestBody.action}`;
    }
  }

  if (!signal) {
    return res.status(400).json({ error: 'signal is required' });
  }

  addRefreshSignal(signal, signalType, {
    path: filePath,
    reason,
    commitHash
  });

  return res.status(200).json({
    success: true,
    signal,
    type: signalType,
    receivedAt: Date.now()
  });
}

function handleGet(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  
  const since = req.query.since ? Number(req.query.since) : 0;
  const signals = getRecentSignals(since > 0 ? since : undefined);
  
  if (signals.length > 0) {
    console.log(`[refresh-signal] GET returning ${signals.length} signal(s) for client`);
  }
  
  return res.status(200).json({
    signals,
    count: signals.length,
    timestamp: Date.now()
  });
}
