import type { Request, Response } from 'express';
import createApp from '../src/server/server';
import { isConfigured as isDbConfigured, migrate as migrateDatabase } from '../src/lib/db';

// Vercel functions do not run the long-lived server startup hook, so ensure
// the identity schema exists before the first request reaches authentication.
const app = createApp();
let migration: Promise<void> | null = null;

function ensureDatabase(): Promise<void> {
  if (!isDbConfigured()) return Promise.resolve();
  if (!migration) {
    migration = migrateDatabase().catch((error) => {
      migration = null;
      console.error('[v0] Database migration failed:', error);
      throw error;
    });
  }
  return migration;
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureDatabase();
    return app(req, res);
  } catch (error) {
    console.error('[v0] API initialization failed:', error);
    if (!res.headersSent) {
      return res.status(503).json({ error: 'Service temporarily unavailable' });
    }
    return res.end();
  }
}
