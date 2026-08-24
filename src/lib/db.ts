import { readFile } from 'fs/promises';
import path from 'path';
import fs from 'fs';

type PgClient = {
  query: (text: string, params?: unknown[]) => Promise<any>;
  release: () => void;
};

type PgPool = {
  query: (text: string, params?: unknown[]) => Promise<any>;
  connect: () => Promise<PgClient>;
  end: () => Promise<void>;
};

let pool: PgPool | null = null;

function databaseUrl(): string {
  return (process.env.DATABASE_URL || '').trim();
}

function isProduction(): boolean {
  return (process.env.NODE_ENV || 'development').toLowerCase() === 'production';
}

function poolOptions(connectionString: string): Record<string, unknown> {
  const max = Math.max(1, Math.min(10, Number(process.env.DB_POOL_MAX || (isProduction() ? 3 : 5)) || 3));
  const options: Record<string, unknown> = {
    connectionString,
    max,
    idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 10_000),
    connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5_000),
    statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT_MS || 15_000),
    allowExitOnIdle: true,
  };

  // Supabase connections should use TLS in production. For local development,
  // SSL is opt-in unless the connection string itself requests it.
  const sslMode = String(process.env.DB_SSL || '').toLowerCase();
  if (isProduction() || sslMode === 'require' || connectionString.includes('sslmode=require')) {
    options.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  }
  return options;
}

async function ensurePool(): Promise<PgPool> {
  if (pool) return pool;
  const connectionString = databaseUrl();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured');
  }

  const pg = await import('pg');
  const Pool = (pg as any).Pool;
  if (!Pool) throw new Error('PostgreSQL Pool constructor is unavailable');
  pool = new Pool(poolOptions(connectionString)) as PgPool;
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const client = await ensurePool();
  return client.query(text, params);
}

export async function migrate() {
  if (!databaseUrl()) {
    throw new Error('DATABASE_URL is not configured');
  }

  // Migration runner: apply SQL files in `src/db/migrations` in filename order.
  const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    const sqlPath = path.join(process.cwd(), 'src', 'db', 'init_identity_schema.sql');
    const sql = await readFile(sqlPath, 'utf8');
    return query(sql);
  }

  const db = await ensurePool();
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const already = await db.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if (already && already.rowCount > 0) continue;
    const sql = await readFile(path.join(migrationsDir, file), 'utf8');
    const migrationClient = await db.connect();
    try {
      await migrationClient.query('BEGIN');
      await migrationClient.query(sql);
      await migrationClient.query('INSERT INTO schema_migrations(id) VALUES($1)', [file]);
      await migrationClient.query('COMMIT');
    } catch (error) {
      try { await migrationClient.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      migrationClient.release();
    }
  }
}

export async function close() {
  if (pool) {
    try { await pool.end(); } catch {}
    pool = null;
  }
}

export function isConfigured() {
  return Boolean(databaseUrl());
}
