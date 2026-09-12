import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('browser sessions', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
  });

  it('issues an opaque HttpOnly browser session cookie and exposes safe state', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const response = await agent.get('/api/session');
    const cookie = response.headers['set-cookie']?.find((value: string) => value.startsWith('nb_sid='));

    expect(response.status).toBe(200);
    expect(cookie).toMatch(/^nb_sid=[A-Za-z0-9_-]{32,128}; .*Path=\/; .*HttpOnly; SameSite=Lax$/);
    expect(response.body.session).toMatchObject({
      authenticated: false,
      persisted: false,
      hasSession: true,
      userId: null,
      selectedThemeSlug: null,
      customTheme: {},
      preferences: {}
    });
    expect(JSON.stringify(response.body)).not.toContain('tokenHash');
  });

  it('persists validated preferences for the browser session', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const updated = await agent.put('/api/session').send({
      selectedThemeSlug: 'midnight',
      customTheme: { accent: '#123456', bg: '#050505' },
      preferences: { density: 'compact', reducedMotion: true, ignored: { secret: true } }
    });

    expect(updated.status).toBe(200);
    expect(updated.body.session).toMatchObject({
      selectedThemeSlug: 'midnight',
      customTheme: { accent: '#123456', bg: '#050505' },
      preferences: { density: 'compact', reducedMotion: true }
    });
    expect(updated.body.session.preferences.ignored).toBeUndefined();
  });

  it('rejects oversized custom theme state', async () => {
    const app = createApp();
    const response = await request(app).put('/api/session').send({
      customTheme: Object.fromEntries(Array.from({ length: 24 }, (_, index) => [`token${index}`, 'x'.repeat(160)]))
    });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/too large/i);
  });
});
