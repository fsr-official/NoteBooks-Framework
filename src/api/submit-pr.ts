import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { getOctokit, getRepoConfig } from './_shared';

const cooldownState = new Map<string, { attempts: number; lastAttempt: number; violations: number; bannedUntil?: number }>();

function getAccountToken(req: Request) {
  const bodyToken = typeof req.body?.accountToken === 'string' ? req.body.accountToken : '';
  const authHeader = req.get('authorization') || '';
  const headerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return bodyToken || headerToken;
}

function verifyAccountAuthorization(accountId: string, accountToken: string) {
  if (!accountId || !accountToken) {
    throw new Error('accountId and accountToken are required');
  }

  const allowedTokens = (process.env.PR_AUTH_TOKENS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedTokens.includes(accountToken)) {
    return;
  }

  const secret = (process.env.PR_AUTH_SECRET || process.env.GITHUB_REPO || 'notebooks-pr').trim();
  const expected = createHash('sha256')
    .update(`${accountId}:${secret}`)
    .digest('hex');

  if (accountToken === expected) {
    return;
  }

  throw new Error('Account authorization failed');
}

function enforceCooldown(accountId: string) {
  const now = Date.now();
  const current = cooldownState.get(accountId) || { attempts: 0, lastAttempt: 0, violations: 0 };

  if (current.bannedUntil && now < current.bannedUntil) {
    const retryAfter = Math.ceil((current.bannedUntil - now) / 1000);
    throw new Error(`Account is temporarily banned. Retry in ${retryAfter}s`);
  }

  const baseDelayMs = 30_000;
  const exponent = Math.min(current.attempts, 8);
  const cooldownMs = Math.min(baseDelayMs * 2 ** exponent, 15 * 60_000);
  const timeSinceLast = now - current.lastAttempt;

  if (current.lastAttempt && timeSinceLast < cooldownMs) {
    current.violations += 1;
    if (current.violations >= 3) {
      current.bannedUntil = now + 15 * 60_000;
      current.violations = 0;
    }
    cooldownState.set(accountId, current);
    const retryAfter = Math.ceil((cooldownMs - timeSinceLast) / 1000);
    throw new Error(`Cooldown active. Retry in ${retryAfter}s`);
  }

  current.attempts += 1;
  current.lastAttempt = now;
  current.violations = 0;
  cooldownState.set(accountId, current);
}

function sanitizeBranchSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 32) || 'account';
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body || {};
    const { filePath, content, editSummary, upgradeDetails, accountId, authorName, authorEmail } = body;

    if (!filePath || !content) {
      return res.status(400).json({ error: 'Missing filePath or content' });
    }

    const normalizedAccountId = String(accountId || '').trim();
    const accountToken = getAccountToken(req);

    try {
      verifyAccountAuthorization(normalizedAccountId, accountToken);
    } catch (error: any) {
      return res.status(401).json({ success: false, error: error?.message || 'Unauthorized PR request' });
    }

    try {
      enforceCooldown(normalizedAccountId);
    } catch (error: any) {
      return res.status(429).json({ success: false, error: error?.message || 'Rate limited' });
    }

    const octokit = await getOctokit({ allowUnauthenticated: true });
    const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
    const appConfigured = Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID);
    if (!token && !appConfigured) {
      return res.status(503).json({ success: false, error: 'No GitHub write credentials configured. Set a PAT or GitHub App credentials.' });
    }

    const repoCfg = await getRepoConfig();
    if (!repoCfg) {
      return res.status(500).json({ success: false, error: 'GITHUB_REPO is not configured' });
    }
    const { owner, repo } = repoCfg;
    const mainBranch = process.env.GITHUB_BRANCH || 'main';
    const branchName = `pr/edit-${sanitizeBranchSegment(normalizedAccountId)}-${Date.now()}`;
    const fileName = filePath.split('/').pop() || 'file';

    const mainRef = await octokit.git.getRef({ owner, repo, ref: `heads/${mainBranch}` });

    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: mainRef.data.object.sha
    });

    const fileContent = Buffer.from(content).toString('base64');

    try {
      const existingFile = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branchName });
      const data = Array.isArray(existingFile.data) ? existingFile.data[0] : existingFile.data;
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        message: `Update ${fileName}`,
        content: fileContent,
        sha: data?.sha,
        branch: branchName
      });
    } catch (error: any) {
      if (error?.status === 404) {
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: filePath,
          message: `Create ${fileName}`,
          content: fileContent,
          branch: branchName
        });
      } else {
        throw error;
      }
    }

    const prBody = [
      '**Automated PR from NoteBooks Editor**',
      `**Account ID:** ${normalizedAccountId || 'unknown'}`,
      `**Author:** ${authorName || 'anonymous'}`,
      `**Email:** ${authorEmail || 'n/a'}`,
      `**File:** ${filePath}`,
      `**Edit Summary:** ${editSummary || 'No summary provided'}`,
      `**Upgrade Details:** ${upgradeDetails || 'No upgrade details provided'}`,
      `**Verification:** ${normalizedAccountId ? 'verified account submission' : 'unverified submission'}`
    ].join('\n\n');

    const pr = await octokit.pulls.create({
      owner,
      repo,
      title: `Update: ${fileName}`,
      body: prBody,
      head: branchName,
      base: mainBranch
    });

    return res.status(200).json({ success: true, prUrl: pr.data.html_url, prNumber: pr.data.number });
  } catch (error: any) {
    console.error('PR submission error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create pull request' });
  }
}
