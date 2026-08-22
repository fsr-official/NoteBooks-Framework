import request from 'supertest';
// Ensure JWT_SECRET is set before app is created
process.env.JWT_SECRET = 'test-secret';
import createApp from '../src/server/server';
import jwt from 'jsonwebtoken';
import { setUser } from '../src/api/auth';
import { describe, it, expect } from 'vitest';

describe('Protected endpoints', () => {
  const app = createApp();

  it('rejects unauthenticated POST /api/submit-pr', async () => {
    const res = await request(app).post('/api/submit-pr').send({});
    expect(res.status).toBe(401);
  });

  it('requires TOTP enrollment for POST /api/submit-pr with auth', async () => {
    const email = 'submit-no-totp@example.com';
    await setUser(email, { email, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const res = await request(app).post('/api/submit-pr').set('Authorization', `Bearer ${token}`).send({ filePath: 'test.md', content: 'hello' });
    expect(res.status).toBe(403);
  });

  it('allows Bearer-authenticated admin requests when CSRF enforcement is enabled', async () => {
    const previousCsrf = process.env.ENFORCE_CSRF;
    process.env.ENFORCE_CSRF = 'true';
    try {
      const csrfApp = createApp();
      await setUser('csrf-admin@example.com', {
        email: 'csrf-admin@example.com',
        password: 'x',
        role: 'admin',
        github_id: 'github-csrf-admin',
        totp_secret: 'KVKFKRCPNZQUYMLXOVDSQKJKZDTSRLD',
        createdAt: new Date().toISOString()
      } as any);
      const adminToken = jwt.sign({ email: 'csrf-admin@example.com', role: 'admin' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
      const res = await request(csrfApp)
        .post('/api/admin?action=assign-role')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'target@example.com', role: 'unsupported' });
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Invalid role' });
    } finally {
      if (previousCsrf === undefined) delete process.env.ENFORCE_CSRF;
      else process.env.ENFORCE_CSRF = previousCsrf;
    }
  });

  it('rejects unauthenticated POST /api/totp', async () => {
    const res = await request(app).post('/api/totp?action=enroll').send({ email: 'someone@example.com' });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated subject-scoped community approval', async () => {
    const res = await request(app).post('/api/subject/science/community/post/1/approve').send({});
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated POST /api/pr-review/accept', async () => {
    const res = await request(app).post('/api/pr-review/accept').send({});
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated POST /api/blob', async () => {
    const res = await request(app).post('/api/blob').send({});
    expect(res.status).toBe(401);
  });
});
