import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { isConfigured as isDbConfigured, query as dbQuery } from '../lib/db.js';
import { parseAuthToken } from '../lib/permissions.js';
import { getBrowserSession, updateBrowserSession } from '../lib/browser-session.js';
import { BUILTIN_THEME_PRESETS, sanitizeThemeTokens, themePresetBySlug, themeTokensForMode, type ThemeMode, type ThemePreset } from '../lib/theme-catalog.js';

const THEME_COOKIE = 'notebooks-theme';
const VISITOR_COOKIE = 'notebooks-theme-visitor';
function sanitizeTheme(input: unknown): Record<string, string> | null {
  const output = sanitizeThemeTokens(input);
  return Object.keys(output).length > 0 ? output : null;
}

async function listDatabasePresets(): Promise<ThemePreset[]> {
  if (!isDbConfigured()) return [];
  try {
    const result = await dbQuery(
      `SELECT slug, name, COALESCE(description, '') AS description, tokens, light_tokens
       FROM theme_presets WHERE is_active = true ORDER BY name ASC LIMIT 100`
    );
    return (result.rows || []).map((row: any) => ({
      slug: String(row.slug),
      name: String(row.name),
      description: String(row.description || ''),
      tokens: sanitizeThemeTokens(row.tokens),
      variants: { dark: sanitizeThemeTokens(row.tokens), light: sanitizeThemeTokens(row.light_tokens) },
      source: 'database' as const
    })).map((preset: ThemePreset) => ({ ...preset, variants: { ...preset.variants, light: Object.keys(preset.variants.light).length ? preset.variants.light : preset.variants.dark } })).filter((preset: ThemePreset) => Object.keys(preset.tokens).length > 0);
  } catch (error) {
    console.warn('[theme] global preset catalog unavailable', error instanceof Error ? error.message : error);
    return [];
  }
}

export async function listThemes(): Promise<ThemePreset[]> {
  const database = await listDatabasePresets();
  const bySlug = new Map<string, ThemePreset>();
  for (const preset of BUILTIN_THEME_PRESETS) bySlug.set(preset.slug, preset);
  for (const preset of database) bySlug.set(preset.slug, preset);
  return [...bySlug.values()];
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
           ON CONFLICT DO NOTHING`,
          [userId, JSON.stringify(theme)],
        );
        await dbQuery(
          'UPDATE theme_preferences SET tokens = $1::jsonb, updated_at = now() WHERE user_id = $2',
          [JSON.stringify(theme), userId],
        );
        return;
      }
    }
    const visitorKey = getVisitorKey(req, res);
    await dbQuery(
      `INSERT INTO theme_preferences(visitor_key, tokens, updated_at) VALUES($1, $2::jsonb, now())
       ON CONFLICT DO NOTHING`,
      [visitorKey, JSON.stringify(theme)],
    );
    await dbQuery(
      'UPDATE theme_preferences SET tokens = $1::jsonb, updated_at = now() WHERE visitor_key = $2',
      [JSON.stringify(theme), visitorKey],
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
  const mode: ThemeMode = req.body?.mode === 'light' ? 'light' : req.body?.mode === 'dark' ? 'dark' : ((getBrowserSession(req)?.themeMode || 'dark') as ThemeMode);
  await updateBrowserSession(req, res, { selectedThemeSlug: 'custom', customTheme: theme, themeMode: mode });
  await persistTheme(req, res, theme);
  res.status(200).json({ ok: true, persisted: isDbConfigured() });
}

export function getTheme(req: Request, res: Response): void {
  let theme: Record<string, string> | null = null;
  const session = getBrowserSession(req);
  if (session?.selectedThemeSlug && session.selectedThemeSlug !== 'custom') {
    const preset = themePresetBySlug(session.selectedThemeSlug);
    if (preset) theme = themeTokensForMode(preset, session.themeMode || 'dark');
  }
  if (!theme && session?.customTheme && Object.keys(session.customTheme).length > 0) theme = session.customTheme;
  if (!theme) {
    try {
      theme = sanitizeTheme(req.cookies?.[THEME_COOKIE] ? JSON.parse(req.cookies[THEME_COOKIE]) : null);
    } catch {
      theme = null;
    }
  }
  if (!theme) {
    res.status(204).end();
    return;
  }
  res.status(200).json({ theme });
}

export async function getThemeCatalog(_req: Request, res: Response): Promise<void> {
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=900');
  res.status(200).json({ themes: await listThemes() });
}

export async function selectTheme(req: Request, res: Response): Promise<void> {
  const slug = String(req.body?.slug || '').trim().toLowerCase();
  const preset = (await listThemes()).find((candidate) => candidate.slug === slug);
  if (!preset) {
    res.status(400).json({ error: 'Unknown theme preset' });
    return;
  }
  const mode: ThemeMode = req.body?.mode === 'light' ? 'light' : req.body?.mode === 'dark' ? 'dark' : ((getBrowserSession(req)?.themeMode || 'dark') as ThemeMode);
  const session = await updateBrowserSession(req, res, { selectedThemeSlug: preset.slug, customTheme: {}, themeMode: mode });
  res.status(200).json({ theme: { ...preset, tokens: themeTokensForMode(preset, mode), mode }, persisted: session.persisted });
}

export default { setTheme, getTheme, getThemeCatalog, selectTheme };
