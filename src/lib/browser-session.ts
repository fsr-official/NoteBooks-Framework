import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from './db.js';

export const BROWSER_SESSION_COOKIE = 'nb_sid';
export const CSRF_COOKIE = 'csrf';
const SESSION_TTL_SECONDS = 365 * 24 * 60 * 60;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
const MAX_PREFERENCES_BYTES = 4096;
const MAX_THEME_BYTES = 3500;
const volatileSessions = new Map<string, BrowserSessionState>();

export interface BrowserSessionState {
  tokenHash: string;
  userId: number | null;
  selectedThemeSlug: string | null;
  themeMode: 'dark' | 'light';
  customTheme: Record<string, string>;
  preferences: Record<string, unknown>;
  persisted: boolean;
}

function isProduction(): boolean {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production' || process.env.VERCEL === '1';
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction() ? true : process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  };
}

function newToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

function parseAuthIdentity(req: Request): { email?: string } | null {
  const bearer = String(req.headers.authorization || '');
  let token = bearer.match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!token) token = String(req.cookies?.session || '');
  if (!token) return null;
  try {
    const secret = process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production';
    const decoded = jwt.verify(token, secret) as { email?: string };
    return decoded?.email ? { email: String(decoded.email) } : null;
  } catch {
    return null;
  }
}

function sanitizePreferences(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,48}$/.test(key)) continue;
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') output[key] = value;
  }
  return output;
}

function sanitizeCustomTheme(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,48}$/.test(key) || typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed && trimmed.length <= 160 && !/[<>;{}]/.test(trimmed)) output[key] = trimmed;
  }
  return output;
}

function shouldHydrateSession(req: Request): boolean {
  const path = String(req.path || '');
  const acceptsHtml = String(req.headers.accept || '').includes('text/html');
  return acceptsHtml || path === '/api/session' || path.startsWith('/api/theme') || path.startsWith('/api/themes') || path.startsWith('/api/auth') || path.startsWith('/api/oauth');
}

function toState(row: any, persisted: boolean): BrowserSessionState {
  return {
    tokenHash: String(row?.token_hash || ''),
    userId: row?.user_id == null ? null : Number(row.user_id),
    selectedThemeSlug: row?.selected_theme_slug ? String(row.selected_theme_slug) : null,
    themeMode: row?.selected_theme_mode === 'light' ? 'light' : 'dark',
    customTheme: sanitizeCustomTheme(row?.custom_theme),
    preferences: sanitizePreferences(row?.preferences),
    persisted
  };
}

async function createOrLoadPersistedSession(tokenHash: string, userId: number | null): Promise<BrowserSessionState> {
  const result = await dbQuery(
    `INSERT INTO browser_sessions(token_hash, user_id, expires_at)
     VALUES($1, $2, now() + ($3 || ' seconds')::interval)
     ON CONFLICT (token_hash) DO UPDATE SET
       last_seen_at = now(),
       expires_at = CASE WHEN browser_sessions.expires_at < now() THEN EXCLUDED.expires_at ELSE browser_sessions.expires_at END,
       user_id = COALESCE(browser_sessions.user_id, EXCLUDED.user_id)
     RETURNING token_hash, user_id, selected_theme_slug, selected_theme_mode, custom_theme, preferences`,
    [tokenHash, userId, SESSION_TTL_SECONDS]
  );
  return toState(result.rows?.[0], true);
}

export async function ensureBrowserSession(req: Request, res: Response): Promise<BrowserSessionState> {
  const csrf = String(req.cookies?.[CSRF_COOKIE] || '').trim();
  if (!SESSION_TOKEN_PATTERN.test(csrf)) {
    res.cookie(CSRF_COOKIE, newToken(), { ...cookieOptions(), httpOnly: false });
  }

  let token = String(req.cookies?.[BROWSER_SESSION_COOKIE] || '').trim();
  if (!SESSION_TOKEN_PATTERN.test(token)) {
    token = newToken();
    res.cookie(BROWSER_SESSION_COOKIE, token, cookieOptions());
  }

  const tokenHash = hashToken(token);
  const auth = parseAuthIdentity(req);
  let state: BrowserSessionState;
  if (isDbConfigured() && shouldHydrateSession(req)) {
    try {
      state = await createOrLoadPersistedSession(tokenHash, null);
      if (auth?.email && state.userId === null) {
        const user = await dbQuery('SELECT id FROM users WHERE email = $1 LIMIT 1', [auth.email]);
        const userId = user.rows?.[0]?.id == null ? null : Number(user.rows[0].id);
        if (userId !== null) {
          await dbQuery('UPDATE browser_sessions SET user_id = $1, last_seen_at = now() WHERE token_hash = $2', [userId, tokenHash]);
          state.userId = userId;
        }
      }
    } catch (error) {
      console.warn('[session] persistence unavailable; using volatile browser session', error instanceof Error ? error.message : error);
      state = volatileSessions.get(tokenHash) || { tokenHash, userId: null, selectedThemeSlug: null, themeMode: 'dark', customTheme: {}, preferences: {}, persisted: false };
      volatileSessions.set(tokenHash, state);
    }
  } else {
    state = volatileSessions.get(tokenHash) || { tokenHash, userId: null, selectedThemeSlug: null, themeMode: 'dark', customTheme: {}, preferences: {}, persisted: false };
    volatileSessions.set(tokenHash, state);
  }
  (req as any).browserSession = state;
  return state;
}

export async function browserSessionMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    await ensureBrowserSession(req, res);
    return next();
  } catch (error) {
    console.warn('[session] initialization failed', error instanceof Error ? error.message : error);
    return next();
  }
}

export function getBrowserSession(req: Request): BrowserSessionState | null {
  return ((req as any).browserSession || null) as BrowserSessionState | null;
}

export async function updateBrowserSession(
  req: Request,
  res: Response,
  input: { selectedThemeSlug?: string | null; themeMode?: 'dark' | 'light'; customTheme?: unknown; preferences?: unknown }
): Promise<BrowserSessionState> {
  const current = getBrowserSession(req) || await ensureBrowserSession(req, res);
  const selectedThemeSlug = input.selectedThemeSlug === undefined
    ? current.selectedThemeSlug
    : input.selectedThemeSlug === null ? null : String(input.selectedThemeSlug).trim().slice(0, 120) || null;
  const themeMode = input.themeMode === 'light' ? 'light' : input.themeMode === 'dark' ? 'dark' : current.themeMode;
  const customTheme = input.customTheme === undefined ? current.customTheme : sanitizeCustomTheme(input.customTheme);
  const preferences = input.preferences === undefined ? current.preferences : sanitizePreferences(input.preferences);
  if (JSON.stringify(customTheme).length > MAX_THEME_BYTES) throw new Error('Custom theme payload is too large');
  if (JSON.stringify(preferences).length > MAX_PREFERENCES_BYTES) throw new Error('Session preferences are too large');

  const next = { ...current, selectedThemeSlug, themeMode, customTheme, preferences };
  if (current.persisted) {
    try {
      await dbQuery(
        `UPDATE browser_sessions
         SET selected_theme_slug = $1, selected_theme_mode = $2, custom_theme = $3::jsonb, preferences = $4::jsonb, last_seen_at = now()
         WHERE token_hash = $5`,
        [selectedThemeSlug, themeMode, JSON.stringify(customTheme), JSON.stringify(preferences), current.tokenHash]
      );
    } catch (error) {
      console.warn('[session] preference persistence unavailable', error instanceof Error ? error.message : error);
      next.persisted = false;
    }
  }
  volatileSessions.set(current.tokenHash, next);
  (req as any).browserSession = next;
  return next;
}

export function publicSessionState(req: Request): Record<string, unknown> {
  const session = getBrowserSession(req);
  const auth = parseAuthIdentity(req);
  return {
    authenticated: Boolean(auth?.email),
    persisted: Boolean(session?.persisted),
    hasSession: Boolean(session),
    userId: session?.userId ?? null,
    selectedThemeSlug: session?.selectedThemeSlug ?? null,
    themeMode: session?.themeMode || 'dark',
    customTheme: session?.customTheme || {},
    preferences: session?.preferences || {}
  };
}
