import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';

async function countTable(tableExpression: string): Promise<number> {
  try {
    const result = await dbQuery(`SELECT COUNT(*)::int AS count FROM ${tableExpression}`);
    return Number(result.rows?.[0]?.count || 0);
  } catch {
    return 0;
  }
}

export default async function adminDashboardHandler(_req: Request, res: Response): Promise<void> {
  const persisted = isDbConfigured();
  const counts = {
    users: 0,
    pendingCommunityPosts: 0,
    submittedIssues: 0,
    openPullRequests: 0,
    activeThemePresets: 0,
    auditEvents: 0,
  };

  if (persisted) {
    [counts.users, counts.pendingCommunityPosts, counts.submittedIssues, counts.openPullRequests, counts.activeThemePresets, counts.auditEvents] = await Promise.all([
      countTable('users'),
      countTable("community_posts WHERE status = 'pending'"),
      countTable("issue_proposals WHERE status IN ('submitted', 'triaged', 'approved')"),
      countTable("pr_lifecycle WHERE state IN ('created', 'open', 'approved')"),
      countTable('theme_presets WHERE is_active = true'),
      countTable('audit_events'),
    ]);
  }

  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json({
    persisted,
    counts,
    modules: [
      { key: 'identity', label: 'Identity and security', status: 'guarded', href: '/accounts' },
      { key: 'themes', label: 'Global theme presets', status: 'phase-3', href: '/settings' },
      { key: 'community', label: 'Community moderation', status: 'active', href: '/community' },
      { key: 'issues', label: 'Issues and votes', status: 'phase-3', href: '/issues' },
      { key: 'pull-requests', label: 'Pull-request lifecycle', status: 'guarded', href: '/admin-prs' },
      { key: 'audit', label: 'Audit events', status: persisted ? 'available' : 'database-required', href: '/admin' },
    ],
  });
}
