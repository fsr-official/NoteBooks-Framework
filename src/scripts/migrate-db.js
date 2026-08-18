#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

// If we're not already running with --experimental-strip-types, attempt to
// re-run this script under node with that flag so TS imports work when CI
// invokes `node src/scripts/migrate-db.js` directly.
if (!process.execArgv.includes('--experimental-strip-types') && !process.env.__MIGRATE_DB_STRIPPED) {
  const nodeBin = process.execPath;
  const args = ['--experimental-strip-types', path.resolve(process.cwd(), 'src/scripts/migrate-db.js')];
  const env = { ...process.env, __MIGRATE_DB_STRIPPED: '1' };
  const res = spawnSync(nodeBin, args, { stdio: 'inherit', env });
  process.exit(res.status ?? 1);
}

(async () => {
  try {
    const dbModulePath = path.resolve(process.cwd(), 'src/lib/db.ts');
    const { isConfigured, migrate } = await import(pathToFileURL(dbModulePath).href);
    if (!isConfigured()) {
      console.log('DATABASE_URL not configured — skipping migrations.');
      process.exit(0);
    }
    console.log('Running DB migrations...');
    await migrate();
    console.log('Migrations applied successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    console.error('Hint: run with node --experimental-strip-types src/scripts/migrate-db.js');
    process.exit(1);
  }
})();
