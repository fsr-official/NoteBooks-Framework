import crypto from 'crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { invalidateSubjectTree } from '../src/api/system.ts';

describe('runtime subject system API', () => {
  beforeEach(async () => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.WEBHOOK_SECRET = 'webhook-secret';
    delete process.env.SUBJECT_REPOS;
    await invalidateSubjectTree();
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

  it('returns a subject-scoped tree with raw URLs and filters unsupported files', async () => {
    const calls = stubManifestFetch();
    const app = createApp();
    const response = await request(app).get('/api/system/commerce');

    expect(response.status).toBe(200);
    expect(response.body.subject).toBe('commerce');
    expect(response.body.repos).toHaveLength(1);
    expect(response.body.repos[0].repo).toBe('fsr-commerce/NCERT-Commerce');
    expect(response.body.repos[0].tree.children[0].children[0]).toEqual(expect.objectContaining({
      name: 'README.md',
      repo: 'fsr-commerce/NCERT-Commerce',
      repoPath: 'notes/README.md',
      raw: 'https://raw.githubusercontent.com/fsr-commerce/NCERT-Commerce/main/notes/README.md'
    }));
    expect(JSON.stringify(response.body)).not.toContain('private.txt');
    expect(response.headers['cache-control']).toContain('s-maxage=300');
    expect(calls()).toBe(1);
  });

  it('reuses the subject cache for repeated GET requests', async () => {
    const calls = stubManifestFetch();
    const app = createApp();
    const first = await request(app).get('/api/system/commerce');
    const second = await request(app).get('/api/system/commerce');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(calls()).toBe(1);
  });

  it('rejects refresh requests with an invalid signature', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/system/commerce/refresh')
      .set('Content-Type', 'application/json')
      .set('X-System-Signature', 'sha256=invalid')
      .send({ reason: 'github push' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid refresh signature' });
  });

  it('accepts a signed refresh request and rebuilds the subject cache', async () => {
    stubManifestFetch();
    const app = createApp();
    const payload = { reason: 'github push', commitHash: 'abc123' };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', 'webhook-secret').update(rawBody, 'utf8').digest('hex')}`;

    const response = await request(app)
      .post('/api/system/commerce/refresh')
      .set('Content-Type', 'application/json')
      .set('X-System-Signature', signature)
      .send(payload);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      success: true,
      subject: 'commerce',
      repoCount: 1
    }));
  });
});
