"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOpenPrLimitError = getOpenPrLimitError;
exports.default = handler;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const _shared_1 = require("./_shared");
const cooldownState = new Map();
function getOpenPrLimitError(openPulls, accountEmail, maxOpenPerAccount) {
    if (!maxOpenPerAccount || maxOpenPerAccount <= 0)
        return null;
    const accountKey = `Account ID: ${accountEmail}`;
    const accountBranchPrefix = `pr/edit-${accountEmail.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 32) || 'account'}`;
    const matching = (openPulls || []).filter((pull) => {
        if ((pull.head?.ref || '').startsWith(accountBranchPrefix))
            return true;
        if (String(pull.body || '').includes(accountKey))
            return true;
        return false;
    });
    return matching.length >= maxOpenPerAccount ? `Open PR limit reached (${maxOpenPerAccount})` : null;
}
function getBearerToken(req) {
    const authHeader = req.get('authorization') || '';
    return authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
}
function verifyBearerToken(token) {
    if (!token) {
        throw new Error('Authorization header is required. Provide a Bearer token from /api/auth.');
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || '');
        if (!decoded.email) {
            throw new Error('JWT payload is missing an email');
        }
        return decoded;
    }
    catch (error) {
        throw new Error('Invalid or expired authorization token');
    }
}
function enforceCooldown(accountId) {
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
function sanitizeBranchSegment(value) {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').slice(0, 32) || 'account';
}
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const body = req.body || {};
        const { filePath, content, editSummary, upgradeDetails, authorName, authorEmail } = body;
        if (!filePath || !content) {
            return res.status(400).json({ error: 'Missing filePath or content' });
        }
        const bearerToken = getBearerToken(req);
        let decodedIdentity;
        try {
            decodedIdentity = verifyBearerToken(bearerToken);
        }
        catch (error) {
            return res.status(401).json({ success: false, error: error?.message || 'Unauthorized PR request' });
        }
        const normalizedAccountId = String(decodedIdentity.email || '').trim();
        try {
            enforceCooldown(normalizedAccountId);
        }
        catch (error) {
            return res.status(429).json({ success: false, error: error?.message || 'Rate limited' });
        }
        const octokit = await (0, _shared_1.getOctokit)({ allowUnauthenticated: true });
        const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
        const appConfigured = Boolean(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY && process.env.GITHUB_APP_INSTALLATION_ID);
        if (!token && !appConfigured) {
            return res.status(503).json({ success: false, error: 'No GitHub write credentials configured. Set a PAT or GitHub App credentials.' });
        }
        const repoCfg = await (0, _shared_1.getRepoConfig)();
        if (!repoCfg) {
            return res.status(500).json({ success: false, error: 'GITHUB_REPO is not configured' });
        }
        const { owner, repo } = repoCfg;
        // Enforce a hard cap on open PRs per account to avoid unreviewed backlog
        const maxOpenPerAccount = Number(process.env.MAX_OPEN_PRS_PER_ACCOUNT || '3');
        if (maxOpenPerAccount > 0) {
            try {
                const openPulls = await octokit.pulls.list({ owner, repo, state: 'open', per_page: 100 });
                const limitError = getOpenPrLimitError(openPulls.data, normalizedAccountId, maxOpenPerAccount);
                if (limitError) {
                    return res.status(429).json({ success: false, error: limitError });
                }
            }
            catch (err) {
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
        }
        catch (error) {
            if (error?.status === 404) {
                await octokit.repos.createOrUpdateFileContents({
                    owner,
                    repo,
                    path: filePath,
                    message: `Create ${fileName}`,
                    content: fileContent,
                    branch: branchName
                });
            }
            else {
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
        return res.status(200).json({ success: true, prUrl: pr.data.html_url, prNumber: pr.data.number });
    }
    catch (error) {
        console.error('PR submission error:', error);
        return res.status(500).json({ success: false, error: error?.message || 'Failed to create pull request' });
    }
}
