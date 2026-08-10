import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';

describe('submit-pr auth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.GITHUB_REPO = 'owner/repo';
  });

  it('requires a bearer JWT for PR submission', async () => {
    const app = createApp();

    const response = await request(app)
      .post('/api/submit-pr')
      .send({ filePath: 'test.md', content: 'hello', originalContent: '' });

    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Authorization header');
  });
});
