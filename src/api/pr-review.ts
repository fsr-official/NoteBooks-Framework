import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getOctokit, getRepoConfig } from './_shared.js';

function getBearerToken(req: Request) {
  const authHeader = req.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

function verifyAdminToken(req: Request) {
  const token = getBearerToken(req);
  if (!token) throw new Error('Authorization required');
  const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as { email?: string; role?: string };
  if (!decoded || decoded.role !== 'admin') throw new Error('Admin role required');
  return decoded;
}

export async function listHandler(_req: Request, res: Response) {
  try {
    const octokit = await getOctokit({ allowUnauthenticated: true });
    const repoCfg = await getRepoConfig();
    if (!repoCfg) return res.status(500).json({ error: 'GITHUB_REPO not configured' });
    const { owner, repo } = repoCfg;

    const pulls = await octokit.pulls.list({ owner, repo, state: 'open', per_page: 100 });
    const items = [] as any[];

    for (const p of pulls.data) {
      const isAppPR = (p.head?.ref || '').startsWith('pr/edit-') || String(p.body || '').includes('Automated PR from NoteBooks Editor');
      if (!isAppPR) continue;

      const files = (await octokit.pulls.listFiles({ owner, repo, pull_number: p.number || 0 })).data || [];
      items.push({
        number: p.number,
        title: p.title,
        url: p.html_url,
        head: p.head?.ref,
        user: p.user?.login,
        created_at: p.created_at,
        body: p.body,
        files: files.map((f: any) => ({ filename: f.filename, status: f.status }))
      });
    }

    return res.status(200).json({ success: true, pulls: items });
  } catch (error: any) {
    console.error('[api/pr-review] list error', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to list PRs' });
  }
}

export async function acceptHandler(req: Request, res: Response) {
  try {
    verifyAdminToken(req);
    const { prNumber, note } = req.body || {};
    if (!prNumber) return res.status(400).json({ error: 'prNumber is required' });
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'A non-empty note is required' });

    const octokit = await getOctokit({ allowUnauthenticated: false });
    const repoCfg = await getRepoConfig();
    if (!repoCfg) return res.status(500).json({ error: 'GITHUB_REPO not configured' });
    const { owner, repo } = repoCfg;

    await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body: `Admin merge note: ${note}` });
    await octokit.pulls.merge({ owner, repo, pull_number: prNumber, commit_title: `Merge PR #${prNumber}`, commit_message: note });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[api/pr-review] accept error', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to merge PR' });
  }
}

export async function rejectHandler(req: Request, res: Response) {
  try {
    verifyAdminToken(req);
    const { prNumber, note } = req.body || {};
    if (!prNumber) return res.status(400).json({ error: 'prNumber is required' });
    if (!note || !String(note).trim()) return res.status(400).json({ error: 'A non-empty note is required' });

    const octokit = await getOctokit({ allowUnauthenticated: false });
    const repoCfg = await getRepoConfig();
    if (!repoCfg) return res.status(500).json({ error: 'GITHUB_REPO not configured' });
    const { owner, repo } = repoCfg;

    await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body: `Admin rejection note: ${note}` });
    await octokit.pulls.update({ owner, repo, pull_number: prNumber, state: 'closed' });

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('[api/pr-review] reject error', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to close PR' });
  }
}

export default {
  listHandler,
  acceptHandler,
  rejectHandler
};
