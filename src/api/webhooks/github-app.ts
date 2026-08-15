import type { Request, Response } from 'express';
import { query as dbQuery, isConfigured as isDbConfigured } from '../../lib/db';
import crypto from 'crypto';

// Webhook handler notes:
// - Validates `x-hub-signature-256` HMAC if `GITHUB_WEBHOOK_SECRET` is set.
// - Persists `installation.created` events into `github_installations` when DB is configured.
// - Provides an admin `list` action to inspect stored installations.

function verifySignature(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return { ok: true, warn: 'No webhook secret configured; skipping verification' };
  const sigHeader = (req.headers['x-hub-signature-256'] || '') as string;
  if (!sigHeader.startsWith('sha256=')) return { ok: false, message: 'Missing signature' };
  const expected = sigHeader.replace('sha256=', '');
  // Prefer the raw body preserved by the express.json verify handler, otherwise fallback to stringified body
  const raw = (req as any).rawBody || (req.body && typeof req.body === 'object' ? JSON.stringify(req.body) : (req.body || ''));
  const hmac = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(hmac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { ok: false, message: 'Signature length mismatch' };
  const ok = crypto.timingSafeEqual(a, b);
  return { ok };
}

export async function handleGithubAppWebhook(req: Request, res: Response) {
  // Verify signature if secret configured
  try {
    const verify = verifySignature(req);
    if (!verify.ok) return res.status(401).json({ error: 'Invalid signature', detail: verify.message || undefined });

    // Dedupe by delivery id to support retries. When DB is configured we store delivery ids
    // in `webhook_deliveries`. When not configured we use an in-memory Set for this process.
    const deliveryId = (req.headers['x-github-delivery'] || '') as string;
    if (deliveryId) {
      if (isDbConfigured()) {
        const ins = await dbQuery('INSERT INTO webhook_deliveries(delivery_id, event_type) VALUES($1,$2) ON CONFLICT (delivery_id) DO NOTHING RETURNING id', [deliveryId, req.headers['x-github-event'] || null]);
        if (!ins || ins.rowCount === 0) {
          // Already processed
          return res.status(200).json({ ok: true, skipped: true, reason: 'duplicate delivery' });
        }
      } else {
        // lightweight in-memory dedupe; not persistent across restarts
        if ((global as any).__seen_webhook_deliveries__ === undefined) (global as any).__seen_webhook_deliveries__ = new Set();
        const set: Set<string> = (global as any).__seen_webhook_deliveries__;
        if (set.has(deliveryId)) return res.status(200).json({ ok: true, skipped: true, reason: 'duplicate delivery' });
        set.add(deliveryId);
      }
    }

    const evt = req.headers['x-github-event'] as string | undefined;
    const body = req.body || {};
    // Handle installation created/updated/deleted and repository events as needed
    if (evt === 'installation' && body.action && ['created', 'deleted', 'suspended', 'unsuspended'].includes(body.action)) {
      const install = body.installation;
      if (install && isDbConfigured()) {
        const installationId = Number(install.id);
        const accountLogin = install.account?.login || null;
        const accountType = install.account?.type || null;
        const repository = Array.isArray(body.repositories) && body.repositories[0] ? `${body.repositories[0].owner.login}/${body.repositories[0].name}` : null;
        await dbQuery('INSERT INTO github_installations(installation_id, account_login, account_type, repository) VALUES($1,$2,$3,$4) ON CONFLICT (installation_id) DO UPDATE SET account_login = EXCLUDED.account_login, account_type = EXCLUDED.account_type, repository = EXCLUDED.repository', [installationId, accountLogin, accountType, repository]);
      }
    }
    // TODO: handle `installation_repositories` events to update repository lists, and other event types (push, pull_request) as needed.
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[webhook] github app handler error', err);
    return res.status(500).json({ error: 'webhook handler error' });
  }
}

export async function listInstallations(req: Request, res: Response) {
  try {
    if (!isDbConfigured()) return res.status(400).json({ error: 'DB not configured' });
    const r = await dbQuery('SELECT installation_id, account_login, account_type, repository, created_at FROM github_installations ORDER BY created_at DESC');
    return res.status(200).json({ installations: r.rows });
  } catch (err) {
    console.error('[webhook] list installations error', err);
    return res.status(500).json({ error: 'Failed to list installations' });
  }
}

export default async function handler(req: Request, res: Response) {
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'webhook':
      return handleGithubAppWebhook(req, res);
    case 'list':
      return listInstallations(req, res);
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}
