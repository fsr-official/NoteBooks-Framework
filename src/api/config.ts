import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({
    GITHUB_REPO: process.env.GITHUB_REPO || '',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
    APP_URL: process.env.APP_URL || '',
    GITPAGE_URL: process.env.GITPAGE_URL || ''
  });
}