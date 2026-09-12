import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { close, query } from '../src/lib/db.ts';

const databaseDescribe = process.env.DATABASE_URL && process.env.RUN_DB_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

databaseDescribe('PostgreSQL-backed browser sessions and themes', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'local-db-test-secret';
    await query('TRUNCATE browser_sessions, theme_preferences RESTART IDENTITY CASCADE');
  });

  afterAll(async () => {
    await close();
  });

  it('persists browser session state across application instances', async () => {
    const firstApp = createApp();
    const first = request.agent(firstApp);
    const issued = await first.get('/api/session');
    const cookie = issued.headers['set-cookie']?.find((value: string) => value.startsWith('nb_sid='))?.split(';', 1)[0];

    expect(issued.status).toBe(200);
    expect(cookie).toMatch(/^nb_sid=[A-Za-z0-9_-]{32,128}$/);
    expect(issued.body.session.persisted).toBe(true);

    const updated = await first.put('/api/session').send({
      selectedThemeSlug: 'professional',
      preferences: { density: 'compact', reducedMotion: true }
    });
    expect(updated.status).toBe(200);
    expect(updated.body.session.persisted).toBe(true);

    const secondApp = createApp();
    const restored = await request(secondApp).get('/api/session').set('Cookie', cookie as string);
    expect(restored.status).toBe(200);
    expect(restored.body.session).toMatchObject({
      persisted: true,
      selectedThemeSlug: 'professional',
      preferences: { density: 'compact', reducedMotion: true }
    });
  });

  it('persists a custom theme and exposes the global catalog', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const catalog = await agent.get('/api/themes');
    expect(catalog.status).toBe(200);
    expect(catalog.body.themes.length).toBeGreaterThanOrEqual(5);

    const saved = await agent.post('/api/theme').send({ theme: { accent: '#123456', bg: '#050505' } });
    expect(saved.status).toBe(200);
    expect(saved.body.persisted).toBe(true);

    const loaded = await agent.get('/api/theme');
    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual({ theme: { accent: '#123456', bg: '#050505' } });

    const session = await agent.get('/api/session');
    expect(session.body.session).toMatchObject({
      persisted: true,
      selectedThemeSlug: 'custom',
      customTheme: { accent: '#123456', bg: '#050505' }
    });
  });
});
