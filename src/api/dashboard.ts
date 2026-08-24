import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { parseAuthToken } from '../lib/permissions.js';

const STREAMS = ['science', 'commerce', 'humanities'] as const;

type CountRow = { count?: string | number };

async function countTable(table: string): Promise<number> {
  try {
    const result = await dbQuery(`SELECT COUNT(*)::int AS count FROM ${table}`);
    return Number((result.rows?.[0] as CountRow | undefined)?.count || 0);
  } catch {
    return 0;
  }
}

async function userActivity(email: string | undefined): Promise<Array<Record<string, unknown>>> {
  if (!email || !isDbConfigured()) return [];
  try {
    const result = await dbQuery(
      `SELECT area, action, stream, repository, file_path, created_at
       FROM dashboard_activity da
       JOIN users u ON u.id = da.user_id
       WHERE u.email = $1
       ORDER BY da.created_at DESC
       LIMIT 12`,
      [email],
    );
    return result.rows || [];
  } catch {
    return [];
  }
}

export default async function dashboardHandler(req: Request, res: Response): Promise<void> {
  const auth = parseAuthToken(req);
  const email = auth?.email ? String(auth.email) : undefined;
  const signedIn = Boolean(email);
  const persisted = isDbConfigured();

  const metrics = {
    streams: STREAMS.length,
    communityPosts: 0,
    issueProposals: 0,
    activeThemePresets: 0,
  };

  if (persisted) {
    [metrics.communityPosts, metrics.issueProposals, metrics.activeThemePresets] = await Promise.all([
      countTable('community_posts'),
      countTable("issue_proposals WHERE status NOT IN ('rejected', 'cancelled')"),
      countTable('theme_presets WHERE is_active = true'),
    ]);
  }

  res.setHeader('Cache-Control', signedIn ? 'private, no-store' : 'public, max-age=30, stale-while-revalidate=120');
  res.status(200).json({
    viewer: {
      signedIn,
      email: email || null,
      role: auth?.role || 'user',
    },
    metrics,
    streams: STREAMS.map((stream) => ({ stream, href: `/${stream}`, label: stream[0].toUpperCase() + stream.slice(1) })),
    activity: await userActivity(email),
    capabilities: {
      database: persisted,
      personalizedActivity: signedIn && persisted,
      themes: true,
      community: true,
      issues: true,
    },
  });
}
