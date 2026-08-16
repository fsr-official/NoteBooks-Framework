#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
