import crypto from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { invalidateStreamTree } from '../src/api/system.ts';

describe('workflow tree rebuild API', () => {
  beforeEach(async () => {
    process.env.WEBHOOK_SECRET = 'test-rebuild-secret';
    delete process.env.TREE_REBUILD_ALLOWED_ORIGINS;
    delete process.env.TREE_REBUILD_SECRET;
    delete process.env.ENFORCE_CSRF;
    await invalidateStreamTree();
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.unstubAllGlobals();
  });

  function signature(payload: object): string {
    const rawBody = JSON.stringify(payload);
    return `sha256=${crypto.createHmac('sha256', 'test-rebuild-secret').update(rawBody, 'utf8').digest('hex')}`;
  }

  function signed(payload: object, repository = 'fsr-science/NCERT-Science') {
    return request(createApp())
      .post('/api/workspace/tree/rebuild')
      .set('Content-Type', 'application/json')
      .set('X-Notebooks-Workflow-Origin', repository)
      .set('X-Notebooks-Signature', signature(payload))
      .send(payload);
  }

  function stubManifestFetch() {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([{ path: 'notes/README.md', name: 'README.md', size: 12 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }

  it('rejects unsigned, unknown-origin, and out-of-scope rebuild requests', async () => {
    const payload = { streams: ['science'], repository: 'fsr-science/NCERT-Science' };
    const unsigned = await request(createApp()).post('/api/workspace/tree/rebuild').send(payload);
    expect(unsigned.status).toBe(401);

    const unknownOrigin = await signed(payload, 'evil/repository');
    expect(unknownOrigin.status).toBe(403);

    const wrongStream = { streams: ['commerce'], repository: 'fsr-science/NCERT-Science' };
    const wrongScope = await signed(wrongStream);
    expect(wrongScope.status).toBe(403);
  });

  it('rebuilds and runtime-preferences the registry-matched stream', async () => {
    stubManifestFetch();
    const payload = { streams: ['science'], repository: 'fsr-science/NCERT-Science', commit: 'abc123' };
    const response = await signed(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ success: true, repository: 'fsr-science/ncert-science' }));
    expect(response.body.rebuilt[0]).toEqual(expect.objectContaining({ stream: 'science', repoCount: 1 }));

    const tree = await request(createApp()).get('/api/system/science');
    expect(tree.status).toBe(200);
    expect(tree.headers['x-stream-tree-source']).toBe('runtime-rebuilt');
    expect(tree.body.repos[0].repo).toBe('fsr-science/NCERT-Science');
  });

  it('drops a second overlapping rebuild request instead of starting another build', async () => {
    let releaseFetch!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFetch = resolve; });
    let firstFetch = true;
    vi.stubGlobal('fetch', async () => {
      if (firstFetch) {
        firstFetch = false;
        await gate;
      }
      return new Response(JSON.stringify([{ path: 'notes/README.md', name: 'README.md' }]), { status: 200 });
    });
    const payload = { streams: ['science'], repository: 'fsr-science/NCERT-Science' };
    const first = signed(payload).then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await signed(payload);
    expect(second.status).toBe(409);
    expect(second.body.dropped).toBe(true);
    releaseFetch();
    expect((await first).status).toBe(200);
  });
});
