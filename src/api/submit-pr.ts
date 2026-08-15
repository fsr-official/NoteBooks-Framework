import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import { getOctokit, getRepoConfig } from './_shared';
import { validateBlocks, sanitizeBlocks } from '../lib/ai-markdown';

const cooldownState = new Map<string, { attempts: number; lastAttempt: number; violations: number; bannedUntil?: number }>();

export function getOpenPrLimitError(openPulls: Array<{ body?: string | null; head?: { ref?: string | null } }>, accountEmail: string, maxOpenPerAccount: number) {
  if (!maxOpenPerAccount || maxOpenPerAccount <= 0) return null;

  const accountKey = `Account ID: ${accountEmail}`;
  const accountBranchPrefix = `pr/edit-${accountEmail.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 32) || 'account'}`;

  const matching = (openPulls || []).filter((pull) => {
    if ((pull.head?.ref || '').startsWith(accountBranchPrefix)) return true;
    if (String(pull.body || '').includes(accountKey)) return true;
    return false;
  });

  return matching.length >= maxOpenPerAccount ? `Open PR limit reached (${maxOpenPerAccount})` : null;
}

function getBearerToken(req: Request) {
  const authHeader = req.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}

function verifyBearerToken(token: string) {
  if (!token) {
    throw new Error('Authorization header is required. Provide a Bearer token from /api/auth.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || '') as { email?: string; role?: string };
    if (!decoded.email) {
      throw new Error('JWT payload is missing an email');
    }
    return decoded;
  } catch (error) {
    throw new Error('Invalid or expired authorization token');
  }
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
    const { filePath, content, editSummary, upgradeDetails, authorName, authorEmail } = body;

    if (!filePath || !content) {
      return res.status(400).json({ error: 'Missing filePath or content' });
    }

    // Validate AI-assisted interactive blocks in content
    const v = validateBlocks(content);
    if (!v.ok) return res.status(400).json({ success: false, error: 'Invalid interactive blocks', details: v.errors });

    // Sanitize interactive blocks to remove any scripts/HTML
    const sanitized = sanitizeBlocks(content || '');
    const finalContent = sanitized.sanitized || content;

    const bearerToken = getBearerToken(req);
    let decodedIdentity: { email: string; role?: string };

    try {
      decodedIdentity = verifyBearerToken(bearerToken) as { email: string; role?: string };
    } catch (error: any) {
      return res.status(401).json({ success: false, error: error?.message || 'Unauthorized PR request' });
    }

    const normalizedAccountId = String(decodedIdentity.email || '').trim();

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

    // Determine content repo: prefer subject-specific mapping, then configured repo registry
    const subject = String(body.subject || '').trim() || undefined;
    let owner: string | undefined;
    let repo: string | undefined;
    if (subject) {
      const subjRepo = getSubjectRepo(subject as string);
      if (subjRepo) {
        owner = subjRepo.owner;
        repo = subjRepo.repo;
      }
    }

    if (!owner || !repo) {
      const repoCfg = await getRepoConfig();
      if (!repoCfg) {
        return res.status(500).json({ success: false, error: 'GITHUB_REPO is not configured' });
      }
      owner = repoCfg.owner;
      repo = repoCfg.repo;
    }
    // Enforce a hard cap on open PRs per account to avoid unreviewed backlog
    const maxOpenPerAccount = Number(process.env.MAX_OPEN_PRS_PER_ACCOUNT || '3');
    if (maxOpenPerAccount > 0) {
      try {
        const openPulls = await octokit.pulls.list({ owner, repo, state: 'open', per_page: 100 });
        const limitError = getOpenPrLimitError(openPulls.data as Array<{ body?: string | null; head?: { ref?: string | null } }>, normalizedAccountId, maxOpenPerAccount);
        if (limitError) {
          return res.status(429).json({ success: false, error: limitError });
        }
      } catch (err) {
        console.warn('[submit-pr] could not enforce open PR cap:', err);
      }
    }
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

    const fileContent = Buffer.from(finalContent).toString('base64');

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
      `**Email:** ${authorEmail || decodedIdentity.email || 'n/a'}`,
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

    try {
      const logDir = path.join(process.cwd(), 'logs');
      if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
      fs.appendFileSync(path.join(logDir, 'admin-actions.log'), JSON.stringify({ at: new Date().toISOString(), action: 'submit-pr', owner, repo, pr: pr.data.html_url || pr.data.number }) + '\n');
    } catch (e) {
      // ignore logging errors
    }

    return res.status(200).json({ success: true, prUrl: pr.data.html_url, prNumber: pr.data.number });
  } catch (error: any) {
    console.error('PR submission error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create pull request' });
  }
}
