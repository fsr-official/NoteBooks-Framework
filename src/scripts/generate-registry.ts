// generate-registry.ts

import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  try {
    // Import the registry builder from source so the exact same logic that
    // the live API endpoint uses (local files.json + remote repo trees) runs
    // at build-time too — there is now only one place this logic lives.
    const mod = await import('../api/repo-registry.ts');
    const buildFullRegistryTree = (mod as any).buildFullRegistryTree as () => Promise<any>;

    if (typeof buildFullRegistryTree !== 'function') {
      console.error('[generate-registry] repo-registry module does not export buildFullRegistryTree');
      process.exit(1);
    }

    console.log('[generate-registry] Building full registry tree (local files.json + remote repos)...');
    const tree = await buildFullRegistryTree();

    // Single output location. No more root repo-registry.json (that filename
    // is reserved for loadRepoRegistry()'s deprecated *input* fallback) and
    // no more public/repo-registry.json duplicate.
    const outPath = path.resolve(process.cwd(), 'public', 'json', 'repo-registry.json');
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(tree, null, 2), 'utf8');
    console.log(`[generate-registry] Wrote ${outPath}`);

    console.log('[generate-registry] Registry generation complete');
    process.exit(0);
  } catch (err: any) {
    console.error('[generate-registry] Failed:', err?.message || err);
    process.exit(1);
  }
}

main();