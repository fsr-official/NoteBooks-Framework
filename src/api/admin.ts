import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import fs from 'fs';
import path from 'path';
import permissions from '../lib/permissions.js';
import { getUser, setUser } from './auth.js';
import { ROLE_KEYS, isRoleKey, ROLE_LABELS } from '../lib/roles.js';

const LEGACY_ROLES = new Set(['admin', 'moderator', 'editor', 'user']);
const VALID_ROLES = new Set([...LEGACY_ROLES, ...ROLE_KEYS]);

function appendAdminLog(entry: any) {
  try {
    const logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, 'admin-actions.log');
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('[admin] failed to write audit log', err);
  }
}

export async function listPrs(req: Request, res: Response) {
  try {
    if (!isDbConfigured()) return res.status(400).json({ error: 'DB not configured' });
    const r = await dbQuery('SELECT id, title, author_email, pr_number, pr_url, pr_branch, pr_merged, pr_merged_at, created_at FROM community_posts WHERE pr_number IS NOT NULL ORDER BY created_at DESC');
    return res.status(200).json({ prs: r.rows });
  } catch (err) {
    console.error('[admin] list prs error', err);
    return res.status(500).json({ error: 'Failed to list PRs' });
  }
}

export default async function handler(req: Request, res: Response) {
  // Defense in depth: keep the full administrator security boundary here even
  // when this handler is invoked outside the Express route registration.
  const security = await permissions.getAdminSecurityContext(req);
  if (!security.ok) {
    return res.status(security.status).json({ error: security.error });
  }
  const decoded = security.auth;
  const action = Array.isArray(req.query.action) ? req.query.action[0] : req.query.action;
  switch (action) {
    case 'list-prs':
      return listPrs(req, res);
    case 'assign-role':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const { email, role } = req.body || {};
        if (!email || !role) return res.status(400).json({ error: 'Missing email or role' });
        const roleKey = String(role);
        if (!VALID_ROLES.has(roleKey)) return res.status(400).json({ error: 'Invalid role' });
        const actor = String(decoded.email || 'system');
        const legacyRole = LEGACY_ROLES.has(roleKey) ? roleKey : roleKey === 'super_admin' ? 'admin' : 'user';
        if (isDbConfigured()) {
          await dbQuery('UPDATE users SET role = $1 WHERE email = $2', [legacyRole, email]);
          if (isRoleKey(roleKey)) {
            await dbQuery('INSERT INTO user_roles(user_id, role_key, assigned_by) SELECT target.id, $1, actor.id FROM users target LEFT JOIN users actor ON actor.email = $2 WHERE target.email = $3 ON CONFLICT (user_id, role_key) DO NOTHING', [roleKey, actor, email]).catch(() => {});
          }
          await dbQuery('INSERT INTO admin_hierarchy(user_id, subject, role) SELECT id, $1, $2 FROM users WHERE email = $3', ['global', roleKey, email]).catch(() => {});
        } else {
          const u = await getUser(email);
          if (!u) return res.status(404).json({ error: 'User not found' });
          u.role = legacyRole as any;
          if (isRoleKey(roleKey)) {
            (u as any).role_keys = Array.from(new Set([...(Array.isArray((u as any).role_keys) ? (u as any).role_keys : []), roleKey]));
          }
          await setUser(email, u as any);
        }
        appendAdminLog({ action: 'assign-role', actor, target: email, role: roleKey, label: isRoleKey(roleKey) ? ROLE_LABELS[roleKey] : roleKey, at: new Date().toISOString() });
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('[admin] assign-role failed', err);
        return res.status(500).json({ error: 'Failed to assign role' });
      }
    case 'revoke-role':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const { email, role } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Missing email' });
        const actorR = String(decoded.email || 'system');
        if (role && !isRoleKey(String(role))) return res.status(400).json({ error: 'Invalid role' });
        if (isDbConfigured()) {
          if (role) {
            await dbQuery('DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = $1) AND role_key = $2', [email, String(role)]).catch(() => {});
          } else {
            await dbQuery('UPDATE users SET role = $1 WHERE email = $2', ['user', email]);
            await dbQuery('DELETE FROM user_roles WHERE user_id = (SELECT id FROM users WHERE email = $1)', [email]).catch(() => {});
          }
        } else {
          const u = await getUser(email);
          if (!u) return res.status(404).json({ error: 'User not found' });
          if (role) (u as any).role_keys = (Array.isArray((u as any).role_keys) ? (u as any).role_keys : []).filter((key: string) => key !== String(role));
          else { u.role = 'user'; delete (u as any).role_keys; }
          await setUser(email, u as any);
        }
        appendAdminLog({ action: 'revoke-role', actor: actorR, target: email, role: role || null, at: new Date().toISOString() });
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('[admin] revoke-role failed', err);
        return res.status(500).json({ error: 'Failed to revoke role' });
      }
    case 'ban':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const { email, until } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Missing email' });
        const untilTs = until ? new Date(until).toISOString() : null;
        const actorB = String(decoded.email || 'system');
        if (isDbConfigured()) {
          await dbQuery('UPDATE users SET banned_until = $1 WHERE email = $2', [untilTs, email]);
        } else {
          const u = await getUser(email);
          if (!u) return res.status(404).json({ error: 'User not found' });
          (u as any).banned_until = untilTs;
          await setUser(email, u as any);
        }
        appendAdminLog({ action: 'ban', actor: actorB, target: email, until: untilTs, at: new Date().toISOString() });
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('[admin] ban failed', err);
        return res.status(500).json({ error: 'Failed to ban user' });
      }
    case 'unban':
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      try {
        const { email } = req.body || {};
        if (!email) return res.status(400).json({ error: 'Missing email' });
        const actorU = String(decoded.email || 'system');
        if (isDbConfigured()) {
          await dbQuery('UPDATE users SET banned_until = NULL WHERE email = $1', [email]);
        } else {
          const u = await getUser(email);
          if (!u) return res.status(404).json({ error: 'User not found' });
          delete (u as any).banned_until;
          await setUser(email, u as any);
        }
        appendAdminLog({ action: 'unban', actor: actorU, target: email, at: new Date().toISOString() });
        return res.status(200).json({ success: true });
      } catch (err) {
        console.error('[admin] unban failed', err);
        return res.status(500).json({ error: 'Failed to unban user' });
      }
    case 'logs':
      try {
        const logPath = path.join(process.cwd(), 'logs', 'admin-actions.log');
        if (!fs.existsSync(logPath)) return res.status(200).json({ logs: [] });
        const content = fs.readFileSync(logPath, 'utf8');
        const lines = String(content || '').split(/\r?\n/).filter(Boolean).slice(-200).reverse();
        const entries = lines.map((ln) => {
          try { return JSON.parse(ln); } catch { return { raw: ln }; }
        });
        return res.status(200).json({ logs: entries });
      } catch (err) {
        console.error('[admin] read logs failed', err);
        return res.status(500).json({ error: 'Failed to read logs' });
      }
    default:
      return res.status(404).json({ error: 'Action not found' });
  }
}
