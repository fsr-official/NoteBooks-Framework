// Prefer running the TypeScript implementation under ts-node. If a JS build
// artifact exists at runtime it will be used by ts-node when resolving imports,
// but don't fail if cleanup removed the temporary JS file.
try {
  require('ts-node').register({ transpileOnly: true, compilerOptions: { allowImportingTsExtensions: true } });
} catch (e) {
  console.error('ts-node is required to run this script:', e && e.message ? e.message : e);
  process.exit(1);
}

try {
  require('./generate-subject-trees.ts');
} catch (e) {
  console.error('generate-subject-trees runner failed:', e && e.message ? e.message : e);
  process.exit(1);
}
