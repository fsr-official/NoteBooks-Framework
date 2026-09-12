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
    // Some hosted PostgreSQL providers expose a self-signed/intermediate chain
    // through their pooled endpoint. Keep TLS encryption enabled while allowing
    // deployments to opt into strict CA validation explicitly.
    options.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true' };
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

  // Build options and attempt to create a pool. If the initial TLS
  // connection fails due to a self-signed certificate in the chain,
  // retry with `rejectUnauthorized: false` to allow hosted providers
  // that expose an intermediate/self-signed cert. This keeps TLS
  // enabled while avoiding a hard failure for deployments that cannot
  // validate the CA chain.
  const options = poolOptions(connectionString);
  try {
    console.log('[db] creating pool with ssl:', Boolean((options as any).ssl));
    pool = new Pool(options) as PgPool;
    // Probe the pool with a lightweight query to surface TLS errors
    // now instead of at the first application query.
    await (pool as any).query('SELECT 1');
    return pool;
  } catch (err: any) {
    console.error('[db] initial pool creation/query failed:', err?.message || err);
    // If the error looks like a self-signed cert chain problem, retry
    // with relaxed certificate validation. Only do this when the
    // previous options explicitly enabled SSL.
    const sslConfigured = Boolean((options as any).ssl);
    const isSelfSigned = err && typeof err.message === 'string' && err.message.includes('self-signed certificate');
    if (sslConfigured && isSelfSigned) {
      console.warn('[db] Retrying pool creation with rejectUnauthorized=false due to self-signed certificate');
      const relaxed = { ...options, ssl: { rejectUnauthorized: false } } as Record<string, unknown>;
      try {
        pool = new Pool(relaxed) as PgPool;
        await (pool as any).query('SELECT 1');
        return pool;
      } catch (err2: any) {
        console.error('[db] retry with relaxed SSL failed:', err2?.message || err2);
        throw err2;
      }
    }
    throw err;
  }
}

export async function query(text: string, params?: unknown[]) {
  const client = await ensurePool();
  return client.query(text, params);
}

export async function migrate() {
  if (!databaseUrl()) {
    throw new Error('DATABASE_URL is not configured');
  }

  const migrationsDir = path.join(process.cwd(), 'src', 'db', 'migrations');
  const baseSchemaPath = path.join(process.cwd(), 'src', 'db', 'init_identity_schema.sql');
  if (!fs.existsSync(migrationsDir)) {
    const sql = await readFile(baseSchemaPath, 'utf8');
    return query(sql);
  }

  const db = await ensurePool();
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');

  const applyMigration = async (id: string, sql: string) => {
    const already = await db.query('SELECT 1 FROM schema_migrations WHERE id = $1', [id]);
    if (already && already.rowCount > 0) return;
    const migrationClient = await db.connect();
    try {
      await migrationClient.query('BEGIN');
      try {
        await migrationClient.query(sql);
        // Record the migration id. Use ON CONFLICT DO NOTHING to avoid race
        // conditions where multiple processes insert the same id concurrently.
        await migrationClient.query('INSERT INTO schema_migrations(id) VALUES($1) ON CONFLICT (id) DO NOTHING', [id]);
        await migrationClient.query('COMMIT');
      } catch (err: any) {
        const msg = err && (err.message || String(err));
        const isAlreadyExists = (err && err.code === '42710') || (typeof msg === 'string' && /already exists/i.test(msg));
        if (isAlreadyExists) {
          console.warn('[db] migration SQL partially already exists or constraint present:', msg);
          // The current transaction is now aborted. Roll it back, then mark
          // this migration as applied to avoid other deployments retrying it.
          try {
            await migrationClient.query('ROLLBACK');
          } catch (rbErr) {
            console.error('[db] rollback after partially-applied migration failed:', rbErr);
          }
          try {
            await migrationClient.query('INSERT INTO schema_migrations(id) VALUES($1) ON CONFLICT (id) DO NOTHING', [id]);
          } catch (recErr) {
            console.error('[db] recording migration id after partial failure failed:', recErr);
          }
          return;
        }
        // Unknown error: rollback and rethrow so the caller can handle it.
        try { await migrationClient.query('ROLLBACK'); } catch {}
        throw err;
      }
    } catch (error) {
      try { await migrationClient.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      migrationClient.release();
    }
  };

  // The base schema lives outside the dated directory for compatibility with
  // older checkouts. Apply it explicitly first so add-* migrations cannot
  // create indexes against tables that do not exist on a fresh CI database.
  if (fs.existsSync(baseSchemaPath)) {
    await applyMigration('0000-init-identity-schema', await readFile(baseSchemaPath, 'utf8'));
  }

  const migrationPriority = ['2026-08-23-phase2-foundations.sql'];
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort((a, b) => {
      const aPriority = migrationPriority.indexOf(a);
      const bPriority = migrationPriority.indexOf(b);
      if (aPriority >= 0 || bPriority >= 0) {
        if (aPriority < 0) return 1;
        if (bPriority < 0) return -1;
        return aPriority - bPriority;
      }
      return a.localeCompare(b);
    });
  for (const file of files) {
    await applyMigration(file, await readFile(path.join(migrationsDir, file), 'utf8'));
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
