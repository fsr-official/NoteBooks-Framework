import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('workspace env routing', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.WEBHOOK_SECRET = 'webhook-secret';
  });

  it('exposes WORKSPACE from /api/config', async () => {
    process.env.WORKSPACE = 'NoteBooks-Framework';
    const app = createApp();
    const res = await request(app).get('/api/config');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      WORKSPACE: 'NoteBooks-Framework'
    }));
  });

  it('returns workspace metadata from /api/workspace', async () => {
    process.env.WORKSPACE = 'NoteBooks-Framework';
    const app = createApp();
    const res = await request(app).get('/api/workspace');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      workspace: 'NoteBooks-Framework'
    }));
  });

  it('serves the admin control-centre shell at /admin', async () => {
    const app = createApp();
    const response = await request(app).get('/admin');
    expect(response.status).toBe(200);
    expect(response.text).toContain('Admin control centre');
    expect(response.text).toContain('/api/admin?action=');
  });

  it('serves the subject-aware landing routes for science, commerce, humanities, community, issues, accounts and volunteers', async () => {
    const app = createApp();

    for (const route of ['/science', '/commerce', '/humanities', '/community', '/issues', '/accounts', '/volunteers']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.text).toContain('NoteBooks');
    }
  });

  it('serves the public project docs from the root of the app', async () => {
    const app = createApp();

    for (const route of ['/README.md', '/LICENSE']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      const raw = typeof res.text === 'string'
        ? res.text
        : Buffer.isBuffer(res.body)
          ? res.body.toString('utf8')
          : typeof res.body === 'string'
            ? res.body
            : JSON.stringify(res.body ?? '');
      expect(raw.length).toBeGreaterThan(20);
    }
  });

  it('serves TikZJax assets with the headers required for the worker to initialize', async () => {
    const app = createApp();
    const res = await request(app).get('/public/bin/tikzjax/output/tikzjax.js');

    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(res.headers['cross-origin-embedder-policy']).toBe('credentialless');
  });
});
