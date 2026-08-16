import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/server/server';
import { query as dbQuery } from '../../src/lib/db';

vi.mock('../../src/lib/db', () => ({
  isConfigured: () => true,
  query: vi.fn(async (sql: string, params?: any[]) => ({ rowCount: 1, rows: [] }))
}));

let app: any;
beforeAll(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  app = createApp();
});

beforeEach(() => {
  vi.clearAllMocks();
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

  it('handles installation removed and repository-added events without failing', async () => {
    const removed = {
      action: 'removed',
      installation: { id: 987, account: { login: 'example', type: 'Organization' } },
      repositories: [{ name: 'repo', owner: { login: 'example' } }]
    };

    const removedRes = await request(app)
      .post('/api/webhooks/github-app?action=webhook')
      .send(removed)
      .set('x-github-event', 'installation');

    expect(removedRes.status).toBe(200);

    const repoChange = {
      action: 'added',
      installation: { id: 987 },
      repositories_added: [{ name: 'repo-two', owner: { login: 'example' } }]
    };

    const changeRes = await request(app)
      .post('/api/webhooks/github-app?action=webhook')
      .send(repoChange)
      .set('x-github-event', 'installation_repositories');

    expect(changeRes.status).toBe(200);
    expect(dbQuery).toHaveBeenCalled();
  });
});
