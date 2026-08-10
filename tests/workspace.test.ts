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
});
