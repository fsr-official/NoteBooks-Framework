import path from 'path';
import { promises as fs } from 'fs';

// Import helpers from repo-registry and pages-fetch. Use runtime paths that
// work both when running compiled JS and under ts-node during build.
async function loadHelpers() {
  try {
    const rr = await import('../api/repo-registry.js');
    const pf = await import('../api/pages-fetch.js');
    return { loadRepoRegistry: rr.loadRepoRegistry || rr.default?.loadRepoRegistry, resolvePagesBaseUrl: pf.resolvePagesBaseUrl || pf.default?.resolvePagesBaseUrl, fetchPagesManifest: pf.fetchPagesManifest || pf.default?.fetchPagesManifest };
  } catch (e) {
    const rr = await import('../api/repo-registry.ts');
    const pf = await import('../api/pages-fetch.ts');
    return { loadRepoRegistry: (rr as any).loadRepoRegistry, resolvePagesBaseUrl: (pf as any).resolvePagesBaseUrl, fetchPagesManifest: (pf as any).fetchPagesManifest };
  }
}

function isMarkdown(name: string) {
  return /\.mdx?$|\.markdown$/i.test(name);
}

function isPdf(name: string) {
  return /\.pdf$/i.test(name);
}

function rawUrlFor(owner: string, repoName: string, branch: string, filePath: string) {
  const normalized = String(filePath || '').replace(/^\/+/, '');
  return `https://raw.githubusercontent.com/${owner}/${repoName}/${branch}/${normalized}`;
}

async function main() {
  try {
    const { loadRepoRegistry, resolvePagesBaseUrl, fetchPagesManifest } = await loadHelpers();
    if (typeof loadRepoRegistry !== 'function') throw new Error('loadRepoRegistry not available');

    const entries = await loadRepoRegistry();
    // Subject targets
    const subjects = ['science', 'commerce', 'humanities'];
    const trees: Record<string, any[]> = { science: [], commerce: [], humanities: [] };

    for (const entry of entries || []) {
      const repo = String(entry.repo || '');
      const lc = repo.toLowerCase();
      let subjectKey: string | null = null;
      if (lc.includes('science')) subjectKey = 'science';
      else if (lc.includes('commerce')) subjectKey = 'commerce';
      else if (lc.includes('humanities') || lc.includes('humanity') || lc.includes('arts')) subjectKey = 'humanities';
      if (!subjectKey) continue;

      const pagesBase = resolvePagesBaseUrl ? resolvePagesBaseUrl(entry) : '';
      if (!pagesBase) {
        console.log(`[subject-trees] skipping ${repo} — no Pages base URL`);
        continue;
      }

      try {
        const manifest = await fetchPagesManifest(pagesBase, (repo.split('/')[1] || ''));
        if (!Array.isArray(manifest) || manifest.length === 0) {
          console.log(`[subject-trees] pages manifest empty for ${repo}; skipping`);
          continue;
        }

        const [owner, repoName] = repo.split('/');
        const branch = entry.branch || 'main';

        // Ensure a repo node exists for this subject
        let repoNode = (trees as any)[subjectKey].find((r: any) => r.repo === repo);
        if (!repoNode) {
          repoNode = {
            repo,
            branch,
            pagesBase: pagesBase,
            tree: { type: 'folder', name: repoName, children: [] }
          };
          (trees as any)[subjectKey].push(repoNode);
        }

        // Insert files into nested folders under repoNode.tree
        for (const item of manifest) {
          const p = String(item.path || item.name || '');
          if (!p)
            continue;
          if (!(isMarkdown(p) || isPdf(p)))
            continue;

          const parts = p.split('/').filter(Boolean);
          const fileName = parts[parts.length - 1];
          const fileEntry = {
            type: 'file',
            name: item.name || fileName,
            path: p,
            mime: isPdf(p) ? 'application/pdf' : 'text/markdown',
            repo,
            branch,
            raw: rawUrlFor(owner, repoName, branch, p),
            size: item.size || null
          };

          // Insert into nested tree
          let node = repoNode.tree;
          for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            node.children = node.children || [];
            let next = node.children.find((c: any) => c.type === 'folder' && c.name === part);
            if (!next) {
              next = { type: 'folder', name: part, children: [] };
              node.children.push(next);
            }
            node = next;
          }
          node.children = node.children || [];
          node.children.push(fileEntry);
        }
      } catch (err: any) {
        console.warn(`[subject-trees] failed to fetch pages manifest for ${repo}:`, err?.message || err);
        continue;
      }
    }

    // Write out per-subject JSON files under public/
    for (const s of subjects) {
      const out = path.resolve(process.cwd(), 'public', `${s}-tree.json`);
      const outJson = path.resolve(process.cwd(), 'public', 'json', `${s}-tree.json`);
      try {
        await fs.mkdir(path.dirname(out), { recursive: true });
        // Use the format: { subject, repos: [ { repo, branch, pagesBase, tree } ] }
        const payload = { subject: s, repos: (trees as any)[s] };
        await fs.writeFile(out, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`[subject-trees] wrote ${out} (${(trees as any)[s].length} repo entries)`);
        // Also write to organized public/json folder for runtime consumption
        await fs.mkdir(path.dirname(outJson), { recursive: true });
        await fs.writeFile(outJson, JSON.stringify(payload, null, 2), 'utf8');
        console.log(`[subject-trees] wrote ${outJson} (${(trees as any)[s].length} repo entries)`);
      } catch (e) {
        console.warn(`[subject-trees] failed to write ${out}:`, e?.message || e);
      }
    }

    console.log('[subject-trees] generation complete');
    process.exit(0);
  } catch (err: any) {
    console.error('[subject-trees] failed:', err?.message || err);
    process.exit(1);
  }
}

main();
