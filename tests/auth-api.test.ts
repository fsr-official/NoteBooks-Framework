import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/server/server';

describe('authentication API contract', () => {
  it('accepts a bootstrapped CSRF token and reaches login validation', async () => {
    const app = createApp();
    const agent = request.agent(app);
    const session = await agent.get('/api/session').set('Accept', 'application/json');
    expect(session.status).toBe(200);

    const csrfCookie = (session.headers['set-cookie'] || [])
      .map(String)
      .find((cookie) => cookie.startsWith('csrf='));
    expect(csrfCookie).toBeTruthy();
    const csrfToken = csrfCookie!.split(';', 1)[0].slice('csrf='.length);

    const login = await agent
      .post('/api/auth?action=login')
      .set('x-csrf-token', csrfToken)
      .send({ email: 'missing-user@example.invalid', password: 'not-a-real-password' });

    expect(login.status).toBe(401);
    expect(login.body).toEqual({ error: 'Invalid email or password' });
  });

  it('rejects a mutation without a CSRF token before authentication', async () => {
    const previous = process.env.ENFORCE_CSRF;
    process.env.ENFORCE_CSRF = 'true';
    const app = createApp();
    if (previous === undefined) delete process.env.ENFORCE_CSRF;
    else process.env.ENFORCE_CSRF = previous;
    const response = await request(app)
      .post('/api/auth?action=login')
      .send({ email: 'missing-user@example.invalid', password: 'not-a-real-password' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('CSRF token missing or invalid');
  });
});
