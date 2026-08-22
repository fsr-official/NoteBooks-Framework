#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptPath = path.resolve(process.cwd(), 'src/scripts/migrate-db.js');
const nodeMajorVersion = Number((process.versions.node || '0').split('.')[0]);
const supportsStripTypes = nodeMajorVersion >= 22;

// Re-run this script with a TS-aware Node loader when CI invokes the JS file
// directly. Node 20 does not support --experimental-strip-types, while Node 22+
// does. We prefer the native flag when available and fall back to the tsx
// loader otherwise.
if (!process.execArgv.includes('--experimental-strip-types') && !process.env.__MIGRATE_DB_STRIPPED) {
  const nodeBin = process.execPath;
  const args = supportsStripTypes
    ? ['--experimental-strip-types', scriptPath]
    : ['--import', 'tsx', scriptPath];

  const env = { ...process.env, __MIGRATE_DB_STRIPPED: '1' };
  const res = spawnSync(nodeBin, args, { stdio: 'inherit', env });
  if (res.error) {
    console.error('Failed to launch migration runner:', res.error);
    process.exit(1);
  }
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
