import express from 'express';
import rateLimit from 'express-rate-limit';
import repoRegistryHandler from '../api/repo-registry.js';
import configHandler from '../api/config.js';
import ghHandler from '../api/gh.js';
import blobHandler from '../api/blob.js';
import rawHandler from '../api/raw.js';
import submitPrHandler from '../api/submit-pr.js';
import * as prReview from '../api/pr-review.js';
import refreshSignalHandler, { getLatestSignal } from '../api/refresh-signal.js';
import desmosHandler from '../api/desmos.js';
import systemHandler from '../api/system.js';
import authHandler from '../api/auth.js';
import oauthHandler from '../api/oauth.js';
import totpHandler from '../api/totp.js';
import permissions from '../lib/permissions.js';
import * as communityHandler from '../api/community.js';
import dashboardHandler from '../api/dashboard.js';
import adminDashboardHandler from '../api/admin-dashboard.js';
import themeHandler from '../api/theme.js';
import issuesHandler from '../api/issues.js';
import * as communityProfileHandler from '../api/community-profile.js';
import * as communityChannelsHandler from '../api/community-channels.js';
import * as issueReviewHandler from '../api/issue-review.js';
import sessionHandler from '../api/session.js';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' }
});

const submitPrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many PR submissions. Please try again later.' }
});

const blobLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many file operations. Please try again later.' }
});

export function registerApiRoutes(app: express.Application): void {
  app.get('/api/oauth', oauthHandler);
  app.get('/api/oauth.js', oauthHandler);
  app.post('/api/oauth', oauthHandler);
  app.get('/private/config', configHandler);

  app.get('/api/config', configHandler);
  app.get('/api/config.js', configHandler);
  app.get('/api/dashboard', dashboardHandler);
  app.get('/api/session', sessionHandler.getSession);
  app.put('/api/session', express.json(), sessionHandler.updateSession);
  app.get('/api/registry', repoRegistryHandler);
  app.get('/api/registry.js', repoRegistryHandler);
  app.get('/api/system/:stream', systemHandler);
  app.head('/api/system/:stream', systemHandler);
  app.post('/api/system/:stream/refresh', systemHandler);
  app.get('/api/files', repoRegistryHandler);
  app.get('/api/files.js', repoRegistryHandler);
  app.get('/api/pr-review', prReview.listHandler);
  app.get('/api/pr-review.js', prReview.listHandler);

  app.use('/api/auth', authLimiter);
  app.all('/api/auth', authHandler);
  app.all('/api/auth.js', authHandler);
  app.post('/api/totp', permissions.requireAuth, totpHandler);
  app.post('/api/totp.js', permissions.requireAuth, totpHandler);
  app.post('/api/gh', permissions.requireAuth, ghHandler);
  app.post('/api/gh.js', permissions.requireAuth, ghHandler);
  app.post('/api/blob', blobLimiter, permissions.requireTotpEnrolled, blobHandler);
  app.post('/api/blob.js', blobLimiter, permissions.requireTotpEnrolled, blobHandler);
  app.get('/api/raw', rawHandler);
  app.get('/api/raw.js', rawHandler);
  app.options('/api/raw', rawHandler);
  app.options('/api/raw.js', rawHandler);

  app.use('/api/submit-pr', submitPrLimiter);
  app.post('/api/submit-pr', permissions.requireTotpEnrolled, submitPrHandler);
  app.post('/api/submit-pr.js', permissions.requireTotpEnrolled, submitPrHandler);
  app.post('/api/refresh-signal', refreshSignalHandler);
  app.get('/api/refresh-signal', refreshSignalHandler);

  // These subject-scoped compatibility routes are retained for the dormant
  // community/editor activation phase. Academic-subject fields are untouched.
  app.post('/api/subject/:subject/community/post', permissions.requireAuth, (req, res) => {
    return import('../api/community.js').then((module) => module.createPost(req, res));
  });
  app.post('/api/subject/:subject/community/post/:id/approve', permissions.requireAdminSecurity, (req, res) => {
    return import('../api/community.js').then((module) => module.approvePost(req, res));
  });
  app.post('/api/subject/:subject/issues/create', permissions.requireAuth, async (req, res) => {
    const subject = String(req.params.subject || req.query.subject || '').trim();
    const title = (req.body && req.body.title) || req.query.title;
    const body = (req.body && req.body.body) || req.query.body;
    if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });
    try {
      const configured = await import('../api/_shared.js').then((module) => module.getStreamRepo('issues'));
      const issuesTarget = configured ? `${configured.owner}/${configured.repo}` : (process.env.GITHUB_ISSUES_REPO || '');
      if (!issuesTarget) return res.status(500).json({ error: 'Issues repo not configured' });
      const [owner, repo] = issuesTarget.split('/').filter(Boolean);
      const octokit = await import('../api/_shared.js').then((module) => module.getOctokit({ allowUnauthenticated: false }));
      const issueBody = subject ? `[${subject}]\n\n${body}` : body;
      const issue = await octokit.issues.create({ owner, repo, title, body: issueBody });
      return res.status(201).json({ issue: issue.data });
    } catch (error: any) {
      console.error('[subject-issues] create failed', error);
      return res.status(500).json({ error: String(error?.message || error) });
    }
  });

  app.get('/api/community/feed', communityHandler.listFeed);
  app.get('/api/community/posts', communityHandler.listPosts);
  app.get('/api/community/channels', communityChannelsHandler.listChannels);
  app.get('/api/community/channels/:slug/messages', communityChannelsHandler.listMessages);
  app.post('/api/community/channels/:slug/messages', permissions.requireAuth, communityChannelsHandler.createMessage);
  app.post('/api/community/channels/:slug/read', permissions.requireAuth, communityChannelsHandler.markChannelRead);
  app.post('/api/community/messages/:id/report', permissions.requireAuth, communityChannelsHandler.reportMessage);
  app.get('/api/community/moderation/reports', permissions.requireAnyRole('super_admin', 'community_mod', 'issues_mod', 'content_mod'), communityChannelsHandler.listReports);
  app.post('/api/community/messages/:id/moderate', permissions.requireAnyRole('super_admin', 'community_mod', 'issues_mod', 'content_mod'), communityChannelsHandler.moderateMessage);
  app.post('/api/community/moderation/reports/:id/resolve', permissions.requireAnyRole('super_admin', 'community_mod', 'issues_mod', 'content_mod'), communityChannelsHandler.resolveReport);
  app.get('/api/community/profiles', communityProfileHandler.listPublicProfiles);
  app.get('/api/community/profile', permissions.requireAuth, communityProfileHandler.getOwnProfile);
  app.get('/api/community/profile/:email', communityProfileHandler.getPublicProfile);
  app.put('/api/community/profile', permissions.requireAuth, express.json(), communityProfileHandler.updateOwnProfile);
  app.get('/api/issues/feed', issuesHandler.listIssues);
  app.get('/api/issues/review', permissions.requireAdminSecurity, issueReviewHandler.listProposals);
  app.get('/api/issues/:id/diff', permissions.requireAdminSecurity, issueReviewHandler.getDiff);
  app.get('/api/issues/:id/comments', permissions.requireAuth, issueReviewHandler.listComments);
  app.post('/api/issues/:id/comments', permissions.requireAuth, issueReviewHandler.createComment);
  app.post('/api/issues/:id/review', permissions.requireAdminSecurity, issueReviewHandler.reviewProposal);
  app.post('/api/community/post', permissions.requireAuth, communityHandler.createPost);
  app.post('/api/community/post/:id/approve', permissions.requireAdminSecurity, communityHandler.approvePost);
  app.post('/api/community/post/:id/reject', permissions.requireAdminSecurity, communityHandler.rejectPost);
  app.post('/api/issues/proposals', permissions.requireAuth, issuesHandler.createProposal);
  app.post('/api/issues/:id/vote', permissions.requireAuth, issuesHandler.voteIssue);
  app.delete('/api/issues/:id/vote', permissions.requireAuth, issuesHandler.removeVote);
  app.post('/api/issues/:id/pr', permissions.requireAdminSecurity, issuesHandler.createPullRequest);

  app.post('/api/github-app', permissions.requireAdminSecurity, (req, res) => {
    return import('../api/github-app.js').then((module: any) => (typeof module.default === 'function' ? module.default(req, res) : module(req, res)));
  });
  app.post('/api/webhooks/github-app', express.json(), (req, res) => {
    return import('../api/webhooks/github-app.js').then((module: any) => (typeof module.default === 'function' ? module.default(req, res) : module(req, res)));
  });
  app.get('/api/webhooks/github-app', permissions.requireAdminSecurity, (req, res) => {
    return import('../api/webhooks/github-app.js').then((module: any) => (typeof module.default === 'function' ? module.default(req, res) : module(req, res)));
  });
  app.get('/api/admin/dashboard', permissions.requireAdminSecurity, adminDashboardHandler);
  app.get('/api/admin', permissions.requireAdminSecurity, (req, res) => {
    return import('../api/admin.js').then((module: any) => (typeof module.default === 'function' ? module.default(req, res) : module(req, res)));
  });
  app.post('/api/admin', permissions.requireAdminSecurity, (req, res) => {
    return import('../api/admin.js').then((module: any) => (typeof module.default === 'function' ? module.default(req, res) : module(req, res)));
  });

  app.get('/api/latest-commit', (_req, res) => {
    const latest = getLatestSignal();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({
      latestCommit: latest?.commitHash || null,
      latestSignal: latest
        ? { signal: latest.signal, type: latest.type, at: latest.at, path: latest.path, reason: latest.reason }
        : null,
      timestamp: Date.now()
    });
  });
  app.post('/api/pr-review/accept', permissions.requireAdminSecurity, prReview.acceptHandler);
  app.post('/api/pr-review/reject', permissions.requireAdminSecurity, prReview.rejectHandler);
  app.get('/api/desmos', desmosHandler);
  app.get('/api/desmos.js', desmosHandler);

  app.get('/api/themes', themeHandler.getThemeCatalog);
  app.post('/api/themes/select', express.json(), themeHandler.selectTheme);
  app.post('/api/theme', express.json(), themeHandler.setTheme);
  app.get('/api/theme', themeHandler.getTheme);
}
