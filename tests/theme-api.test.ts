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
