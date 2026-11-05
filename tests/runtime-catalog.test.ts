import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRuntimeCatalog, processRuntimeUpdate } from '../src/lib/runtime-catalog.ts';
import { resetSharedCacheClientForTests, setSharedCacheClientForTests } from '../src/lib/shared-cache.ts';

const originalCwd = process.cwd();
const originalDocumentsRepo = process.env.NOTEBOOKS_DOCUMENTS_REPO;
const originalDocumentsBranch = process.env.NOTEBOOKS_DOCUMENTS_BRANCH;
let testCwd = '';

afterEach(async () => {
  process.chdir(originalCwd);
  if (originalDocumentsRepo === undefined) delete process.env.NOTEBOOKS_DOCUMENTS_REPO;
  else process.env.NOTEBOOKS_DOCUMENTS_REPO = originalDocumentsRepo;
  if (originalDocumentsBranch === undefined) delete process.env.NOTEBOOKS_DOCUMENTS_BRANCH;
  else process.env.NOTEBOOKS_DOCUMENTS_BRANCH = originalDocumentsBranch;
  resetSharedCacheClientForTests();
  vi.unstubAllGlobals();
  if (testCwd) await fs.rm(testCwd, { recursive: true, force: true });
  testCwd = '';
});

function installRedisMock() {
  const store = new Map<string, string>();
  setSharedCacheClientForTests({
    async get(key) {
      return store.get(key) ?? null;
    },
    async set(key, value, options) {
      if (options?.nx && store.has(key)) return null;
      store.set(key, value);
      return 'OK';
    },
    async del(key) {
      store.delete(key);
      return 1;
    }
  });
  return store;
}

async function setupBootstrap(initialFileSha: string) {
  testCwd = await fs.mkdtemp(path.join(os.tmpdir(), 'notebooks-runtime-catalog-'));
  await fs.mkdir(path.join(testCwd, 'public', 'json'), { recursive: true });
  await fs.writeFile(path.join(testCwd, 'public', 'json', 'github-repos.json'), JSON.stringify({
    schemaVersion: 1,
    entries: [{
      name: 'Science',
      stream: 'science',
      repo: 'owner/science',
      branch: 'main',
      enabled: true,
      priority: 1
    }]
  }));
  await fs.writeFile(path.join(testCwd, 'public', 'json', 'science-tree.json'), JSON.stringify({
    stream: 'science',
    root: {
      type: 'folder',
      children: [{
        type: 'file',
        path: 'chapter.md',
        repoPath: 'chapter.md',
        repo: 'owner/science',
        sha: initialFileSha
      }]
    }
  }));
  process.chdir(testCwd);
}

describe('runtime content catalog', () => {
  it('publishes blob-level changes, ignores duplicate commits, and records unchanged commits', async () => {
    installRedisMock();
    const oldBlobSha = 'a'.repeat(40);
    const changedBlobSha = 'b'.repeat(40);
    const firstCommit = '1'.repeat(40);
    const secondCommit = '2'.repeat(40);
    const unchangedCommit = '3'.repeat(40);
    let headSha = firstCommit;
    let blobSha = changedBlobSha;
    await setupBootstrap(oldBlobSha);

    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/commits/')) {
        return new Response(JSON.stringify({ sha: headSha }), { status: 200 });
      }
      if (url.endsWith(`/${firstCommit}/files.json`) || url.endsWith(`/${secondCommit}/files.json`) || url.endsWith(`/${unchangedCommit}/files.json`)) {
        return new Response(JSON.stringify([{
          type: 'file',
          name: 'chapter.md',
          path: 'chapter.md',
          sha: blobSha
        }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    }));

    const firstEvent = {
      schemaVersion: 1 as const,
      kind: 'content' as const,
      repository: 'owner/science',
      branch: 'main',
      commitSha: firstCommit
    };
    await expect(processRuntimeUpdate(firstEvent)).resolves.toMatchObject({
      changed: true,
      filesChanged: 1,
      version: 1
    });
    await expect(getRuntimeCatalog()).resolves.toMatchObject({
      version: 1,
      changes: [{
        kind: 'content',
        repository: 'owner/science',
        files: [{ path: 'chapter.md', action: 'modified', previousSha: oldBlobSha, sha: changedBlobSha }]
      }]
    });

    await expect(processRuntimeUpdate(firstEvent)).resolves.toMatchObject({
      changed: false,
      version: 1
    });

    headSha = secondCommit;
    blobSha = changedBlobSha;
    await expect(processRuntimeUpdate({
      ...firstEvent,
      commitSha: secondCommit
    })).resolves.toMatchObject({
      changed: false,
      filesChanged: 0,
      version: 1
    });

    headSha = unchangedCommit;
    blobSha = 'c'.repeat(40);
    await expect(processRuntimeUpdate({
      ...firstEvent,
      commitSha: unchangedCommit
    })).resolves.toMatchObject({
      changed: true,
      filesChanged: 1,
      version: 2
    });
  });

  it('rejects events for a commit that is no longer the configured branch head', async () => {
    installRedisMock();
    await setupBootstrap('a'.repeat(40));
    const headSha = 'b'.repeat(40);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ sha: headSha }), { status: 200 })));

    await expect(processRuntimeUpdate({
      schemaVersion: 1,
      kind: 'content',
      repository: 'owner/science',
      branch: 'main',
      commitSha: 'c'.repeat(40)
    })).resolves.toMatchObject({ superseded: true, changed: false, version: 0 });
  });
});
