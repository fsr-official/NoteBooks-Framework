import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('auth route', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  it('routes auth actions through /api/auth instead of returning 404', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/auth?action=login')
      .send({ email: 'test@example.com', password: 'secret123' });

    expect(response.status).not.toBe(404);
    expect(response.body).toEqual(
      expect.objectContaining({
        error: expect.any(String),
      })
    );
  });
});
