import type { Request, Response } from 'express';
import * as gha from '../lib/github-app';
import { getRepoConfig } from './_shared';
import fs from 'fs';
import path from 'path';

export async function mergePrHandler(req: Request, res: Response) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { prNumber, mergeMethod } = req.body || {};
    if (!prNumber) return res.status(400).json({ error: 'Missing prNumber' });
    const cfg = await getRepoConfig();
    if (!cfg) return res.status(500).json({ error: 'Repo not configured' });
    // Audit log the merge attempt
    try {
      const user = (req as any).auth?.email || 'unknown';
      const logDir = path.join(process.cwd(), 'logs');
      try { if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true }); } catch (e) {}
      const entry = { at: new Date().toISOString(), user, action: 'merge-pr', prNumber: Number(prNumber), mergeMethod: mergeMethod || 'merge' };
      try { fs.appendFileSync(path.join(logDir, 'admin-actions.log'), JSON.stringify(entry) + '\n'); } catch (e) {}
    } catch (e) {
      // ignore logging errors
    }
    try {
      const merged = await gha.mergePr(cfg.owner, cfg.repo, Number(prNumber), mergeMethod || 'merge');
      const okEntry = { at: new Date().toISOString(), result: 'ok', prNumber: Number(prNumber) };
      try { fs.appendFileSync(path.join(process.cwd(), 'logs', 'admin-actions.log'), JSON.stringify(okEntry) + '\n'); } catch (e) {}
      return res.status(200).json({ success: true, merged });
    } catch (err: any) {
      const failEntry = { at: new Date().toISOString(), result: 'error', prNumber: Number(prNumber), error: String(err?.message || err) };
      try { fs.appendFileSync(path.join(process.cwd(), 'logs', 'admin-actions.log'), JSON.stringify(failEntry) + '\n'); } catch (e) {}
      console.error('[github-app] merge error', err);
      return res.status(500).json({ error: err?.message || 'Failed to merge PR' });
    }
  } catch (err: any) {
    console.error('[github-app] merge handler error', err);
    return res.status(500).json({ error: err?.message || 'Failed to merge PR' });
  }
}

export default async function handler(req: Request, res: Response) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'merge-pr':
      return mergePrHandler(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}
