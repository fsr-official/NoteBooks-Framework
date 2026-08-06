import type { Request, Response } from 'express';

const recentSignals = new Map<string, { type: string; at: number }>();

export function addRefreshSignal(signal: string, type: 'directory' | 'file') {
  recentSignals.set(signal, { type, at: Date.now() });
}

export default function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { signal, type } = req.body || {};
  if (!signal) {
    return res.status(400).json({ error: 'signal is required' });
  }

  addRefreshSignal(signal, type === 'directory' ? 'directory' : 'file');
  return res.status(200).json({ success: true, signal, type: type || 'file' });
}
