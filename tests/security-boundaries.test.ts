import { describe, expect, it } from 'vitest';
import request from 'supertest';
import createApp from '../src/server/server';
import { isSafePublishedFilePath } from '../src/lib/safe-file-path';

describe('security boundaries', () => {
  it('accepts published content paths and rejects private path forms', () => {
    expect(isSafePublishedFilePath('README.md')).toBe(true);
    expect(isSafePublishedFilePath('public/json/science-tree.json')).toBe(true);
    expect(isSafePublishedFilePath('../.env')).toBe(false);
    expect(isSafePublishedFilePath('.env.production')).toBe(false);
    expect(isSafePublishedFilePath('private/id_rsa')).toBe(false);
    expect(isSafePublishedFilePath('docs/../secret.txt')).toBe(false);
    expect(isSafePublishedFilePath('docs\\..\\secret.txt')).toBe(false);
  });

  it('emits restrictive browser capability and analytics-compatible headers', async () => {
    const response = await request(createApp()).get('/settings');
    expect(response.status).toBe(200);
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['content-security-policy']).toContain('connect-src');
    expect(response.headers['content-security-policy']).toContain('https://va.vercel-scripts.com');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('enforces CSRF for production browser-cookie mutations', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = createApp();
      const agent = request.agent(app);
      const bootstrap = await agent.get('/settings');
      const csrfCookie = (bootstrap.headers['set-cookie'] || []).find((cookie) => cookie.startsWith('csrf='));
      expect(csrfCookie).toBeTruthy();
      const token = csrfCookie?.split(';', 1)[0].slice('csrf='.length);
      const blocked = await agent.put('/api/session').send({ preferences: { readerWidth: 'wide' } });
      expect(blocked.status).toBe(403);
      const allowed = await agent.put('/api/session').set('Cookie', `csrf=${token || ''}`).set('x-csrf-token', token || '').send({ preferences: { readerWidth: 'wide' } });
      expect(allowed.status).not.toBe(403);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it('rejects private paths from local file delivery', async () => {
    const app = createApp();
    const traversal = await request(app).get('/files/../.env');
    const hidden = await request(app).get('/files/.env');
    expect([403, 404]).toContain(traversal.status);
    expect(hidden.status).toBe(403);
  });
});
