// Bootstrap runner for ts-node with import ext enabled
try {
  require('ts-node').register({ transpileOnly: true, compilerOptions: { allowImportingTsExtensions: true } });
} catch (e) {
  console.error('ts-node is required to run this script:', e?.message || e);
  process.exit(1);
}

require('./generate-subject-trees.ts');
