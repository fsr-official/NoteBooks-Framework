import crypto from 'crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { invalidateStreamTree } from '../src/api/system.ts';

describe('runtime stream system API', () => {
  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.WEBHOOK_SECRET = 'webhook-secret';
    delete process.env.SUBJECT_REPOS;
    await invalidateStreamTree();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubManifestFetch() {
    let calls = 0;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      calls += 1;
      const url = String(input);
      if (url.includes('raw.githubusercontent.com/fsr-commerce/NCERT-Commerce/main/files.json')) {
        return new Response(JSON.stringify([
          { path: 'notes/README.md', name: 'README.md', size: 12 },
          { path: 'notes/private.txt', name: 'private.txt', size: 4 }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('not found', { status: 404 });
    });
    return () => calls;
  }

  it('serves the canonical stream-rooted artifact and normalizes case', async () => {
    const app = createApp();
    const response = await request(app).get('/api/system/COMMERCE');

    expect(response.status).toBe(200);
    expect(response.headers['x-stream-tree-source']).toBe('generated-json');
    expect(response.body.stream).toBe('commerce');
    expect(response.body.root.name).toBe('NoteBooks-Commerce');
    expect(response.body.root.children[0].name).toBe('NCERT-Commerce');
    expect(response.body.root.children[0].children).toEqual([]);
    expect(response.body.repos[0].error).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('private.txt');
    expect(response.headers['cache-control']).toContain('s-maxage=300');
  });

  it('reuses the canonical generated artifact for repeated GET requests', async () => {
    const calls = stubManifestFetch();
    const app = createApp();
    const first = await request(app).get('/api/system/commerce');
    const second = await request(app).get('/api/system/commerce');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.root.name).toBe('NoteBooks-Commerce');
    expect(second.body.root.name).toBe('NoteBooks-Commerce');
    expect(calls()).toBe(0);
  });

  it('rejects refresh requests with an invalid signature', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/system/COMMERCE/refresh')
      .set('Content-Type', 'application/json')
      .set('X-System-Signature', 'sha256=invalid')
      .send({ reason: 'github push' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid refresh signature' });
  });

  it('accepts a signed refresh request and rebuilds the stream cache', async () => {
    stubManifestFetch();
    const app = createApp();
    const payload = { reason: 'github push', commitHash: 'abc123' };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', 'webhook-secret').update(rawBody, 'utf8').digest('hex')}`;

    const response = await request(app)
      .post('/api/system/COMMERCE/refresh')
      .set('Content-Type', 'application/json')
      .set('X-System-Signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      stream: 'commerce',
      repoCount: 1
    }));
  });
});
