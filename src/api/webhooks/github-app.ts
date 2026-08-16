import type { Request, Response } from 'express';
import { query as dbQuery, isConfigured as isDbConfigured } from '../../lib/db.js';
import crypto from 'crypto';

function getRawBodyString(req: Request): string {
  const rawBody = (req as any).rawBody;
  if (typeof rawBody === 'string') return rawBody;
  if (Buffer.isBuffer(rawBody)) return rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return '';
}

function verifySignature(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return { ok: true, warn: 'No webhook secret configured; skipping verification' };

  const headers = req.headers;
  const sigHeader = (headers['x-hub-signature-256'] || headers['x-hub-signature'] || '') as string;
  if (!sigHeader) return { ok: false, message: 'Missing signature' };

  const raw = getRawBodyString(req);
  if (!raw) return { ok: false, message: 'Missing request body for signature verification' };

  if (sigHeader.startsWith('sha256=')) {
    const expected = sigHeader.replace('sha256=', '');
    const actual = crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    const a = Buffer.from(actual, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return { ok: false, message: 'Signature length mismatch' };
    return { ok: crypto.timingSafeEqual(a, b) };
  }

  if (sigHeader.startsWith('sha1=')) {
    const expected = sigHeader.replace('sha1=', '');
    const actual = crypto.createHmac('sha1', secret).update(raw, 'utf8').digest('hex');
    const a = Buffer.from(actual, 'hex');
    const b = Buffer.from(expected, 'hex');
    if (a.length !== b.length) return { ok: false, message: 'Signature length mismatch' };
    return { ok: crypto.timingSafeEqual(a, b) };
  }

  return { ok: false, message: 'Unsupported signature format' };
}

export async function handleGithubAppWebhook(req: Request, res: Response) {
  try {
    const verify = verifySignature(req);
    if (!verify.ok) return res.status(401).json({ error: 'Invalid signature', detail: verify.message || undefined });

    const deliveryId = (req.headers['x-github-delivery'] || '') as string;
    if (deliveryId) {
      if (isDbConfigured()) {
        const result = await dbQuery(
          'INSERT INTO webhook_deliveries(delivery_id, event_type) VALUES($1,$2) ON CONFLICT (delivery_id) DO NOTHING RETURNING id',
          [deliveryId, req.headers['x-github-event'] || null]
        );
        if (!result || result.rowCount === 0) {
          return res.status(200).json({ ok: true, skipped: true, reason: 'duplicate delivery' });
        }
      } else {
        if ((global as any).__seen_webhook_deliveries__ === undefined) {
          (global as any).__seen_webhook_deliveries__ = new Set();
        }
        const set: Set<string> = (global as any).__seen_webhook_deliveries__;
        if (set.has(deliveryId)) {
          return res.status(200).json({ ok: true, skipped: true, reason: 'duplicate delivery' });
        }
        set.add(deliveryId);
      }
    }

    const evt = req.headers['x-github-event'] as string | undefined;
    const body = req.body || {};

    if (evt === 'ping') {
      return res.status(200).json({ ok: true, message: 'pong' });
    }

    if (evt === 'installation' && body.action && ['created', 'deleted', 'suspended', 'unsuspended'].includes(body.action)) {
      const install = body.installation;
      if (install && isDbConfigured()) {
        const installationId = Number(install.id);
        const accountLogin = install.account?.login || null;
        const accountType = install.account?.type || null;
        const repository = Array.isArray(body.repositories) && body.repositories[0]
          ? `${body.repositories[0].owner.login}/${body.repositories[0].name}`
          : null;
        await dbQuery(
          'INSERT INTO github_installations(installation_id, account_login, account_type, repository) VALUES($1,$2,$3,$4) ON CONFLICT (installation_id) DO UPDATE SET account_login = EXCLUDED.account_login, account_type = EXCLUDED.account_type, repository = EXCLUDED.repository',
          [installationId, accountLogin, accountType, repository]
        );
      }
    }

    if (evt === 'installation_repositories' && Array.isArray(body.repositories)) {
      if (isDbConfigured() && body.installation?.id) {
        const installationId = Number(body.installation.id);
        const repository = body.repositories[0] ? `${body.repositories[0].owner.login}/${body.repositories[0].name}` : null;
        await dbQuery(
          'UPDATE github_installations SET repository = $1 WHERE installation_id = $2',
          [repository, installationId]
        );
      }
    }

    return res.status(200).json({ ok: true, event: evt || 'unknown' });
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
