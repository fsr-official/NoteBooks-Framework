#!/usr/bin/env node
(async () => {
  try {
    const { isConfigured, migrate } = await import('../lib/db.js');
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
    process.exit(1);
  }
})();
