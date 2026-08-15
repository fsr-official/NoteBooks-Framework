import { readFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';

let client: any = null;

async function ensureClient() {
  if (client) return client;
  const DATABASE_URL = process.env.DATABASE_URL || '';
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  const pg = await import('pg');
  const { Client } = pg as any;
  client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

export async function query(text: string, params?: any[]) {
  const c = await ensureClient();
  return c.query(text, params);
}

export async function migrate() {
  const DATABASE_URL = process.env.DATABASE_URL || '';
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }

  // Migration runner: apply SQL files in `src/db/migrations` in filename order
  const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    // Fallback: run the single init file if no migrations directory exists
    const sqlPath = path.join(process.cwd(), 'src', 'db', 'init_identity_schema.sql');
    const sql = await readFile(sqlPath, 'utf8');
    return query(sql);
  }

  // Ensure schema_migrations table exists
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const id = f;
    const already = await query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
    if (already && already.rowCount > 0) continue;
    const sql = await readFile(path.join(migrationsDir, f), 'utf8');
    await query(sql);
    await query('INSERT INTO schema_migrations(id) VALUES($1)', [id]);
  }
  return;
}

export async function close() {
  if (client) {
    try { await client.end(); } catch {}
    client = null;
  }
}

export function isConfigured() {
  return Boolean(process.env.DATABASE_URL);
}
