import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('canonical issues security boundaries', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
  });

  it('requires authentication for proposal creation and voting', async () => {
    const app = createApp();

    expect((await request(app).post('/api/issues/proposals').send({})).status).toBe(401);
    expect((await request(app).post('/api/issues/1/vote').send({ value: 1 })).status).toBe(401);
    expect((await request(app).delete('/api/issues/1/vote')).status).toBe(401);
  });

  it('requires administrator security for repository PR creation', async () => {
    const app = createApp();
    const response = await request(app).post('/api/issues/1/pr').send({ content: 'replacement' });
    expect(response.status).toBe(401);
  });
});
