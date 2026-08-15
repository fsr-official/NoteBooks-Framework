import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';

let app: any;
beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  app = createApp();
});

describe('GitHub App webhook', () => {
  it('accepts installation.created webhook and persists when DB not configured (no error)', async () => {
    const payload = {
      action: 'created',
      installation: { id: 12345, account: { login: 'example', type: 'Organization' } },
      repositories: [{ name: 'repo', owner: { login: 'example' } }]
    };
    const res = await request(app).post('/api/webhooks/github-app?action=webhook').send(payload).set('x-github-event', 'installation');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ok', true);
  });
});
