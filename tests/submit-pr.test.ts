import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { resolveSubjectSubmissionRepo } from '../src/api/submit-pr.ts';

describe('submit-pr auth', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    process.env.GITHUB_REPO = 'owner/repo';
  });

  it('resolves editor submissions through the STREAM registry', async () => {
    delete process.env.SUBJECT_REPOS;
    const target = await resolveSubjectSubmissionRepo('commerce');
    expect(target).toMatchObject({ owner: 'fsr-commerce', repo: 'NCERT-Commerce', branch: 'main' });
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
