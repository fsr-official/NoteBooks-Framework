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
  const { signal, type, path: filePath, reason, commitHash } = req.body || {};
  
  if (!signal) {
    return res.status(400).json({ error: 'signal is required' });
  }

  const signalType = type === 'directory' ? 'directory' : 'file';
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
  
  return res.status(200).json({
    signals,
    count: signals.length,
    timestamp: Date.now()
  });
}
