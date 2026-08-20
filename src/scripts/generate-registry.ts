import { promises as fs } from 'fs';
import path from 'path';

async function main() {
  try {
    // Import the registry builder from source so the same logic runs at build-time.
    const mod = await import('../api/repo-registry.ts');
    const load = (mod as any).loadRepoRegistry as () => Promise<any[]>;
    const build = (mod as any).buildRegistryTree as (entries: any[]) => Promise<any>;

    if (typeof load !== 'function' || typeof build !== 'function') {
      console.error('[generate-registry] repo-registry module does not export expected functions');
      process.exit(1);
    }

    console.log('[generate-registry] Loading registry entries...');
    const entries = await load();
    console.log(`[generate-registry] Loaded ${entries.length} entries`);

    console.log('[generate-registry] Building registry tree (this may fetch remote pages)...');
    const tree = await build(entries || []);

    const outPath = path.resolve(process.cwd(), 'repo-registry.json');
    const publicOutPath = path.resolve(process.cwd(), 'public', 'repo-registry.json');
    const publicJsonOutPath = path.resolve(process.cwd(), 'public', 'json', 'repo-registry.json');

    await fs.writeFile(outPath, JSON.stringify(tree, null, 2), 'utf8');
    console.log(`[generate-registry] Wrote ${outPath}`);

    try {
      await fs.mkdir(path.dirname(publicOutPath), { recursive: true });
      await fs.writeFile(publicOutPath, JSON.stringify(tree, null, 2), 'utf8');
      console.log(`[generate-registry] Wrote ${publicOutPath}`);
      // Also write into public/json for organized runtime lookup
      await fs.mkdir(path.dirname(publicJsonOutPath), { recursive: true });
      await fs.writeFile(publicJsonOutPath, JSON.stringify(tree, null, 2), 'utf8');
      console.log(`[generate-registry] Wrote ${publicJsonOutPath}`);
    } catch (e) {
      console.warn('[generate-registry] Could not write public copy(s):', e?.message || e);
    }

    console.log('[generate-registry] Registry generation complete');
    process.exit(0);
  } catch (err: any) {
    console.error('[generate-registry] Failed:', err?.message || err);
    process.exit(1);
  }
}

main();
