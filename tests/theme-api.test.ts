import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('theme API', () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
    process.env.JWT_SECRET = 'test-secret';
  });

  it('stores and retrieves an anonymous custom theme through the theme cookie', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const saved = await agent.post('/api/theme').send({ theme: { accent: '#123456', bg: '#050505' } });

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ ok: true, persisted: false });

    const loaded = await agent.get('/api/theme');
    expect(loaded.status).toBe(200);
    expect(loaded.body).toEqual({ theme: { accent: '#123456', bg: '#050505' } });
  });

  it('lists selectable global theme presets', async () => {
    const app = createApp();
    const response = await request(app).get('/api/themes');

    expect(response.status).toBe(200);
    expect(response.body.themes.map((theme: { slug: string }) => theme.slug)).toEqual(['futuristic', 'contrast', 'neon', 'professional', 'classic']);
    expect(response.body.themes[0]).toHaveProperty('tokens');
    const classic = response.body.themes.find((theme: { slug: string }) => theme.slug === 'classic');
    expect(classic.variants.dark).toMatchObject({ bg: '#1b1f24', surface: '#262b32', panel: '#2b3138' });
  });

  it('selects a global preset into the browser session', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const selected = await agent.post('/api/themes/select').send({ slug: 'professional' });

    expect(selected.status).toBe(200);
    expect(selected.body.theme.slug).toBe('professional');
    expect(selected.body.theme.tokens.bg).toBe('#111827');

    const session = await agent.get('/api/session');
    expect(session.body.session.selectedThemeSlug).toBe('professional');
    expect(session.body.session.customTheme).toEqual({});
  });

  it('selects a light variant while preserving the theme family', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const selected = await agent.post('/api/themes/select').send({ slug: 'contrast', mode: 'light' });

    expect(selected.status).toBe(200);
    expect(selected.body.theme.slug).toBe('contrast');
    expect(selected.body.theme.mode).toBe('light');
    expect(selected.body.theme.tokens.bg).toBe('#ffffff');

    const session = await agent.get('/api/session');
    expect(session.body.session.selectedThemeSlug).toBe('contrast');
    expect(session.body.session.themeMode).toBe('light');
  });

  it('keeps Classic dark charcoal even when a stale theme cookie exists', async () => {
    const app = createApp();
    const agent = request.agent(app);
    await agent.post('/api/theme').send({ theme: { bg: '#ffffff', surface: '#ffffff' }, mode: 'light' });
    const selected = await agent.post('/api/themes/select').send({ slug: 'classic', mode: 'dark' });

    expect(selected.status).toBe(200);
    expect(selected.body.theme.tokens.bg).toBe('#1b1f24');
    expect(selected.body.theme.tokens.surface).toBe('#262b32');

    const loaded = await agent.get('/api/theme');
    expect(loaded.status).toBe(200);
    expect(loaded.body.theme.bg).toBe('#1b1f24');
    expect(loaded.body.theme.surface).toBe('#262b32');
  });

  it('persists custom theme mode in the browser session', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const saved = await agent.post('/api/theme').send({ theme: { bg: '#f6f8fa', surface: '#ffffff' }, mode: 'light' });

    expect(saved.status).toBe(200);
    const session = await agent.get('/api/session');
    expect(session.body.session).toMatchObject({ selectedThemeSlug: 'custom', themeMode: 'light' });
  });

  it('rejects unknown global presets', async () => {
    const app = createApp();
    const response = await request(app).post('/api/themes/select').send({ slug: 'does-not-exist' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/unknown theme/i);
  });

  it('rejects unsafe or unknown theme payloads', async () => {
    const app = createApp();
    const response = await request(app).post('/api/theme').send({
      theme: { accent: '<script>alert(1)</script>', unknown: 'ignored' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/valid token/i);
  });

  it('rejects oversized theme payloads', async () => {
    const app = createApp();
    const tokenKeys = ['accent', 'accentHover', 'accentSubtle', 'surface', 'surfaceMuted', 'text', 'textMuted', 'code', 'font', 'bg', 'panel', 'border', 'borderSubtle', 'radius', 'density', 'shadow', 'texture', 'heading', 'hover', 'selected', 'btnBg', 'btnHover'];
    const response = await request(app).post('/api/theme').send({
      theme: Object.fromEntries(tokenKeys.map((key) => [key, 'x'.repeat(160)])),
    });

    expect(response.status).toBe(413);
    expect(response.body.error).toMatch(/too large/i);
  });
});
