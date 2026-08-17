// Bootstrap for running the TypeScript registry generator with ts-node
try {
  require('ts-node').register({
    transpileOnly: true,
    compilerOptions: { allowImportingTsExtensions: true }
  });
} catch (e) {
  console.error('ts-node not available, please install dev dependencies:', e?.message || e);
  process.exit(1);
}

// Delegate to the TS implementation
require('./generate-registry.ts');
