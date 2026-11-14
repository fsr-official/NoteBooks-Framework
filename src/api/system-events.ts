import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';

const EVENT_LIMIT = 100;
const UPTIME_WINDOW_SECONDS = 30 * 24 * 60 * 60;

export async function listSystemEvents(req: Request, res: Response): Promise<void> {
  if (!isDbConfigured()) {
    res.status(503).json({ error: 'System history is unavailable until the database is configured' });
    return;
  }

  const beforeRaw = req.query.before === undefined ? '' : String(req.query.before);
  if (beforeRaw && !/^\d+$/.test(beforeRaw)) {
    res.status(400).json({ error: 'before must be a positive event id' });
    return;
  }
  const before = beforeRaw ? Number(beforeRaw) : null;
  if (before !== null && (!Number.isSafeInteger(before) || before <= 0)) {
    res.status(400).json({ error: 'before must be a positive event id' });
    return;
  }

  try {
    const [eventsResult, checksResult, workflowResult] = await Promise.all([
      dbQuery(
        `SELECT id, event_type, summary, repository, branch, path, source_url, created_at
         FROM system_events
         WHERE $1::bigint IS NULL OR id < $1
         ORDER BY id DESC
         LIMIT $2`,
        [before, EVENT_LIMIT]
      ),
      dbQuery(
        `SELECT status, checked_at, response_ms, duration_seconds
         FROM system_uptime_checks
         WHERE checked_at >= now() - interval '30 days'
            OR id = (
              SELECT id FROM system_uptime_checks
              WHERE checked_at < now() - interval '30 days'
              ORDER BY checked_at DESC LIMIT 1
            )
         ORDER BY checked_at ASC`
      ),
      dbQuery('SELECT status, COUNT(*)::int AS count FROM system_workflow_jobs GROUP BY status')
    ]);

    const checks = (checksResult.rows || []).map((row: any) => ({
      status: String(row.status),
      checkedAt: row.checked_at,
      responseMs: row.response_ms == null ? null : Number(row.response_ms),
      durationSeconds: Number(row.duration_seconds || 0)
    }));
    const now = Date.now();
    const windowStart = now - UPTIME_WINDOW_SECONDS * 1000;
    let monitoredSeconds = 0;
    let availableSeconds = 0;
    let downtimeSeconds = 0;
    for (let index = 0; index < checks.length; index += 1) {
      const start = new Date(checks[index].checkedAt).getTime();
      const end = index + 1 < checks.length ? new Date(checks[index + 1].checkedAt).getTime() : now;
      const expectedDuration = checks[index].status === 'down' ? checks[index].durationSeconds * 1000 : 0;
      const coveredUntil = Math.min(
        end,
        now,
        start + (expectedDuration > 0 ? expectedDuration : 10 * 60 * 1000)
      );
      const seconds = Math.max(0, coveredUntil - Math.max(start, windowStart)) / 1000;
      monitoredSeconds += seconds;
      if (checks[index].status === 'down') downtimeSeconds += seconds;
      else availableSeconds += seconds;
    }

    const latest = checks.length ? checks[checks.length - 1] : null;
    const latestCheckAge = latest ? now - new Date(latest.checkedAt).getTime() : Number.POSITIVE_INFINITY;
    const status = latestCheckAge > 15 * 60 * 1000 ? 'unknown' : latest?.status || 'unknown';
    const workflowCounts = Object.fromEntries((workflowResult.rows || []).map((row: any) => [String(row.status), Number(row.count)]));
    const events = (eventsResult.rows || []).map((row: any) => ({
      id: Number(row.id),
      type: String(row.event_type),
      summary: String(row.summary),
      repository: row.repository || null,
      branch: row.branch || null,
      path: row.path || null,
      url: row.source_url || null,
      createdAt: row.created_at
    }));

    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    res.status(200).json({
      events,
      nextBefore: events.length === EVENT_LIMIT ? events[events.length - 1].id : null,
      uptime: {
        status,
        availablePercent: monitoredSeconds > 0 ? Number((availableSeconds / monitoredSeconds * 100).toFixed(3)) : null,
        downtimeSeconds: Math.round(downtimeSeconds),
        monitoredSeconds: Math.round(monitoredSeconds),
        lastCheckedAt: latest?.checkedAt || null,
        responseMs: latest?.responseMs ?? null,
        checks: checks.slice(-24).reverse()
      },
      workflows: {
        pending: workflowCounts.pending || 0,
        processing: workflowCounts.processing || 0,
        delivered: workflowCounts.delivered || 0,
        failed: workflowCounts.failed || 0
      }
    });
  } catch (error) {
    console.error('[system-events] history read failed', error);
    res.status(503).json({ error: 'System history is temporarily unavailable' });
  }
}
