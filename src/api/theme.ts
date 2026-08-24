import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { parseAuthToken } from '../lib/permissions.js';

const THEME_COOKIE = 'notebooks-theme';
const VISITOR_COOKIE = 'notebooks-theme-visitor';
const ALLOWED_KEYS = new Set([
  'accent', 'accentHover', 'accentSubtle', 'surface', 'surfaceMuted', 'text', 'textMuted',
  'code', 'font', 'bg', 'panel', 'border', 'borderSubtle', 'radius', 'density', 'shadow',
  'texture', 'heading', 'hover', 'selected', 'btnBg', 'btnHover'
]);

function sanitizeTheme(input: unknown): Record<string, string> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key) || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 160 || /[<>;{}]/.test(trimmed)) continue;
    output[key] = trimmed;
  }
  return Object.keys(output).length > 0 ? output : null;
}

function getVisitorKey(req: Request, res: Response): string {
  const existing = String(req.cookies?.[VISITOR_COOKIE] || '').trim();
  if (/^[a-f0-9-]{36}$/i.test(existing)) return existing;
  const generated = crypto.randomUUID();
  res.cookie(VISITOR_COOKIE, generated, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
  return generated;
}

async function persistTheme(req: Request, res: Response, theme: Record<string, string>): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const auth = parseAuthToken(req);
    if (auth?.email) {
      const user = await dbQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [String(auth.email)]);
      const userId = user.rows?.[0]?.id;
      if (userId) {
        await dbQuery(
          `INSERT INTO theme_preferences(user_id, tokens, updated_at) VALUES($1, $2::jsonb, now())
           ON CONFLICT (user_id) DO UPDATE SET tokens = EXCLUDED.tokens, updated_at = now()`,
          [userId, JSON.stringify(theme)],
        );
        return;
      }
    }
    const visitorKey = getVisitorKey(req, res);
    await dbQuery(
      `INSERT INTO theme_preferences(visitor_key, tokens, updated_at) VALUES($1, $2::jsonb, now())
       ON CONFLICT (visitor_key) DO UPDATE SET tokens = EXCLUDED.tokens, updated_at = now()`,
      [visitorKey, JSON.stringify(theme)],
    );
  } catch (error) {
    console.warn('[theme] persistence unavailable; cookie remains authoritative', error);
  }
}

export async function setTheme(req: Request, res: Response): Promise<void> {
  const theme = sanitizeTheme(req.body?.theme);
  if (!theme) {
    res.status(400).json({ error: 'Theme must contain at least one valid token' });
    return;
  }
  const serialized = JSON.stringify(theme);
  // Leave headroom for the cookie name and attributes while staying below common cookie limits.
  if (serialized.length > 3500) {
    res.status(413).json({ error: 'Theme payload is too large' });
    return;
  }
  res.cookie(THEME_COOKIE, serialized, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
  await persistTheme(req, res, theme);
  res.status(200).json({ ok: true, persisted: isDbConfigured() });
}

export function getTheme(req: Request, res: Response): void {
  const theme = sanitizeTheme(req.cookies?.[THEME_COOKIE] ? JSON.parse(req.cookies[THEME_COOKIE]) : null);
  if (!theme) {
    res.status(204).end();
    return;
  }
  res.status(200).json({ theme });
}

export default { setTheme, getTheme };
