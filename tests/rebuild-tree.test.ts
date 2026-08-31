import crypto from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { invalidateStreamTree } from '../src/api/system.ts';

describe('workflow tree rebuild API', () => {
  beforeEach(async () => {
    process.env.WEBHOOK_SECRET = 'test-rebuild-secret';
    process.env.TREE_REBUILD_ALLOWED_ORIGINS = 'fsr-official/NCERT-Commerce=commerce';
    delete process.env.TREE_REBUILD_SECRET;
    delete process.env.ENFORCE_CSRF;
    await invalidateStreamTree();
  });

  afterEach(() => {
    delete process.env.TREE_REBUILD_ALLOWED_ORIGINS;
    delete process.env.WEBHOOK_SECRET;
    vi.unstubAllGlobals();
  });

  function signature(payload: object): string {
    const rawBody = JSON.stringify(payload);
    return `sha256=${crypto.createHmac('sha256', 'test-rebuild-secret').update(rawBody, 'utf8').digest('hex')}`;
  }

  function stubManifestFetch() {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('raw.githubusercontent.com/fsr-commerce/NCERT-Commerce/main/files.json')) {
        return new Response(JSON.stringify([{ path: 'notes/README.md', name: 'README.md', size: 12 }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    });
  }

  it('rejects unsigned, unknown-origin, and out-of-scope rebuild requests', async () => {
    const app = createApp();
    const payload = { streams: ['commerce'] };
    const unsigned = await request(app).post('/api/workspace/tree/rebuild').send(payload);
    expect(unsigned.status).toBe(401);

    const unknownOrigin = await request(app).post('/api/workspace/tree/rebuild').set('X-Notebooks-Workflow-Origin', 'evil/repository').set('X-Notebooks-Signature', signature(payload)).send(payload);
    expect(unknownOrigin.status).toBe(401);

    const wrongStream = { streams: ['science'] };
    const wrongScope = await request(app).post('/api/workspace/tree/rebuild').set('X-Notebooks-Workflow-Origin', 'fsr-official/NCERT-Commerce').set('X-Notebooks-Signature', signature(wrongStream)).send(wrongStream);
    expect(wrongScope.status).toBe(400);
  });

  it('rebuilds and runtime-preferences the configured stream after a valid signed request', async () => {
    stubManifestFetch();
    const app = createApp();
    const payload = { streams: ['commerce'], repository: 'fsr-commerce/NCERT-Commerce', commit: 'abc123' };
    const response = await request(app)
      .post('/api/workspace/tree/rebuild')
      .set('Content-Type', 'application/json')
      .set('X-Notebooks-Workflow-Origin', 'fsr-official/NCERT-Commerce')
      .set('X-Notebooks-Signature', signature(payload))
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({ success: true, origin: 'fsr-official/NCERT-Commerce' }));
    expect(response.body.rebuilt[0]).toEqual(expect.objectContaining({ stream: 'commerce', repoCount: 1 }));

    const tree = await request(app).get('/api/system/commerce');
    expect(tree.status).toBe(200);
    expect(tree.headers['x-stream-tree-source']).toBe('runtime-rebuilt');
    expect(tree.body.repos[0].repo).toBe('fsr-commerce/NCERT-Commerce');
  });
});
