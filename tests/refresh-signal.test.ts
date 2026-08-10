import request from 'supertest';
import crypto from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('refresh signal and manifest endpoints', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.WEBHOOK_SECRET = 'webhook-secret';
  });

  it('returns a manifest from /api/manifest and /api/files.json', async () => {
    const app = createApp();
    const [manifestRes, filesRes] = await Promise.all([
      request(app).get('/api/manifest'),
      request(app).get('/api/files.json')
    ]);

    expect(manifestRes.status).toBe(200);
    expect(filesRes.status).toBe(200);
    expect(manifestRes.type).toContain('json');
    expect(filesRes.type).toContain('json');
    expect(typeof manifestRes.body).toBe('object');
    expect(typeof filesRes.body).toBe('object');
  });

  it('rejects webhook requests with invalid signature', async () => {
    const app = createApp();
    const response = await request(app)
      .post('/api/refresh-signal')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', 'sha256=invalidsig')
      .send({ signal: 'test-signal', type: 'directory' });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Invalid webhook signature' });
  });

  it('accepts valid webhook signatures and exposes latest signal', async () => {
    const app = createApp();
    const payload = { signal: 'github-test-signal', type: 'directory', reason: 'auto refresh', commitHash: 'abcd1234' };
    const rawBody = JSON.stringify(payload);
    const signature = `sha256=${crypto.createHmac('sha256', process.env.WEBHOOK_SECRET as string).update(rawBody, 'utf8').digest('hex')}`;

    const postRes = await request(app)
      .post('/api/refresh-signal')
      .set('Content-Type', 'application/json')
      .set('X-Hub-Signature-256', signature)
      .send(payload);

    expect(postRes.status).toBe(200);
    expect(postRes.body).toEqual(
      expect.objectContaining({
        success: true,
        signal: 'github-test-signal',
        type: 'directory'
      })
    );

    const latestRes = await request(app).get('/api/latest-commit');
    expect(latestRes.status).toBe(200);
    expect(latestRes.body).toEqual(
      expect.objectContaining({
        latestCommit: 'abcd1234',
        latestSignal: expect.objectContaining({
          signal: 'github-test-signal',
          type: 'directory',
          reason: 'auto refresh'
        }),
        timestamp: expect.any(Number)
      })
    );
  });
});
