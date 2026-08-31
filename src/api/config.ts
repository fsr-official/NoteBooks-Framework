import type { Request, Response } from 'express';
import { getStreamRepo } from './_shared.js';

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const [communityRepo, issuesRepo] = await Promise.all([getStreamRepo('community'), getStreamRepo('issues')]);
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({
    GITHUB_REPO: process.env.GITHUB_REPO || 'fsr-science/NCERT-Science',
    GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
    GITHUB_COMMUNITY_REPO: communityRepo ? `${communityRepo.owner}/${communityRepo.repo}` : (process.env.GITHUB_COMMUNITY_REPO || ''),
    GITHUB_ISSUES_REPO: issuesRepo ? `${issuesRepo.owner}/${issuesRepo.repo}` : (process.env.GITHUB_ISSUES_REPO || ''),
    APP_URL: process.env.APP_URL || '',
    GITPAGE_URL: process.env.GITPAGE_URL || 'https://fsr-science.github.io/NCERT-Science/',
    RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY || '',
    WORKSPACE: process.env.WORKSPACE || '',
    SUBJECT_REPOS: process.env.SUBJECT_REPOS || ''
  });
}