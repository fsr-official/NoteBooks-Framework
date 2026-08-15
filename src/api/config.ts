import type { Request, Response } from 'express';

export default function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({
    GITHUB_REPO: process.env.GITHUB_REPO || 'fsr-science/NCERT-Science',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
    GITHUB_COMMUNITY_REPO: process.env.GITHUB_COMMUNITY_REPO || 'fsr-official/NoteBooks-Community',
    GITHUB_ISSUES_REPO: process.env.GITHUB_ISSUES_REPO || 'fsr-official/NoteBooks-Issues',
    APP_URL: process.env.APP_URL || '',
    GITPAGE_URL: process.env.GITPAGE_URL || 'https://fsr-science.github.io/NCERT-Science/',
    RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY || '',
    WORKSPACE: process.env.WORKSPACE || '',
    SUBJECT_REPOS: process.env.SUBJECT_REPOS || ''
  });
}