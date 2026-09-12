import type { Request, Response } from 'express';
import { getBrowserSession, publicSessionState, updateBrowserSession } from '../lib/browser-session.js';

export function getSession(req: Request, res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ session: publicSessionState(req) });
}

export async function updateSession(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const session = await updateBrowserSession(req, res, {
      selectedThemeSlug: body.selectedThemeSlug,
      themeMode: body.themeMode === 'light' ? 'light' : body.themeMode === 'dark' ? 'dark' : undefined,
      customTheme: body.customTheme,
      preferences: body.preferences
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ session: publicSessionState(req), persisted: session.persisted });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /too large/i.test(message) ? 413 : 400;
    res.status(status).json({ error: message });
  }
}

export function hasSession(req: Request): boolean {
  return Boolean(getBrowserSession(req));
}

export default { getSession, updateSession };
