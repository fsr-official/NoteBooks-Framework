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

  it('serves the public Dashboard and separate admin control-center shells', async () => {
    const app = createApp();

    const dashboard = await request(app).get('/dashboard');
    expect(dashboard.status).toBe(302);
    expect(dashboard.headers.location).toBe('/settings#personal-space');

    const settings = await request(app).get('/settings');
    expect(settings.status).toBe(200);
    expect(settings.text).toContain('Your Dashboard');
    expect(settings.text).toContain('id="personal-space"');

    const admin = await request(app).get('/admin');
    expect(admin.status).toBe(200);
    expect(admin.text).toContain('Admin control center');
    expect(admin.text).toContain('/public/js/admin-dashboard.js');

    const adminApi = await request(app).get('/api/admin/dashboard');
    expect(adminApi.status).toBe(401);
  });

  it('returns a public Dashboard data contract without requiring a database', async () => {
    const app = createApp();
    const response = await request(app).get('/api/dashboard');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(expect.objectContaining({
      viewer: expect.objectContaining({ signedIn: false }),
      metrics: expect.objectContaining({ streams: 3 }),
      capabilities: expect.objectContaining({ database: Boolean(process.env.DATABASE_URL) }),
    }));
  });

  it('serves the subject-aware landing routes for science, commerce, humanities, community, issues, accounts and volunteers', async () => {
    const app = createApp();

    for (const route of ['/science', '/commerce', '/humanities', '/community', '/issues', '/accounts', '/volunteers']) {
      const res = await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.text).toContain('NoteBooks');
    }
  });

  it('serves published project documents through /files without falling back to the shell', async () => {
    const app = createApp();
    const res = await request(app).get('/files/README.md');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/markdown|text\/plain/);
    expect(res.text).toContain('NoteBooks');
    expect(res.text).not.toContain('<!DOCTYPE html>');

    const apiAlias = await request(app).get('/api/workspace-file/README.md');
    expect(apiAlias.status).toBe(200);
    expect(apiAlias.headers['content-type']).toMatch(/text\/markdown|text\/plain/);
    expect(apiAlias.text).not.toContain('<!DOCTYPE html>');
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
