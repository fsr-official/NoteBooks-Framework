import type { Request, Response } from 'express';
import { getOctokit, getRepoConfig, readRepoFile } from './_shared.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, path: filePath, content, sha, message } = req.body || {};

  try {
    const octokit = await getOctokit({ allowUnauthenticated: true });
    const repoCfg = await getRepoConfig();
    if (!repoCfg) {
      return res.status(500).json({ error: 'GITHUB_REPO is not configured' });
    }
    const { owner, repo } = repoCfg;

    if (action === 'getFile') {
      if (!filePath) return res.status(400).json({ error: 'Missing path' });
      try {
        const data = await readRepoFile(filePath, process.env.GITHUB_BRANCH || 'main');
        return res.status(200).json({ sha: data.sha });
      } catch (error: any) {
        if (error?.status === 404) return res.status(200).json({ sha: null });
        throw error;
      }
    }

    if (action === 'getFileContent') {
      if (!filePath) return res.status(400).json({ error: 'Missing path' });
      try {
        const data = await readRepoFile(filePath, process.env.GITHUB_BRANCH || 'main');
        return res.status(200).json({ sha: data.sha, content: data.content });
      } catch (error: any) {
        if (error?.status === 404) return res.status(200).json({ sha: null, content: null });
        throw error;
      }
    }

    if (action === 'putFile') {
      if (!filePath || !content || !message) return res.status(400).json({ error: 'Missing path, content, or message' });
      const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
      if (!token) return res.status(403).json({ error: 'Write access requires GITHUB_TOKEN or GITHUB_PAT.' });
      const body: Record<string, unknown> = { message, content };
      if (sha) body.sha = sha;
      await octokit.repos.createOrUpdateFileContents({ owner, repo, path: filePath, message, content, branch: process.env.GITHUB_BRANCH || 'main', ...(sha ? { sha } : {}) });
      return res.status(200).json({ ok: true });
    }

    if (action === 'deleteFile') {
      if (!filePath || !sha) return res.status(400).json({ error: 'Missing path or sha' });
      const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
      if (!token) return res.status(403).json({ error: 'Write access requires GITHUB_TOKEN or GITHUB_PAT.' });
      await octokit.repos.deleteFile({ owner, repo, path: filePath, message: message || `Delete: ${filePath}`, sha });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error: any) {
    console.error('[api/gh]', error);
    return res.status(500).json({ error: error?.message || 'GitHub request failed' });
  }
}