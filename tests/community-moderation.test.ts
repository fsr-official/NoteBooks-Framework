process.env.JWT_SECRET = 'test-secret';
import request from 'supertest';
import createApp from '../src/server/server';
import jwt from 'jsonwebtoken';
import { setUser } from '../src/api/auth';
import { describe, it, expect } from 'vitest';

describe('Community moderation', () => {
  const app = createApp();

  it('allows admin to approve a post', async () => {
    const author = 'author@example.com';
    await setUser(author, { email: author, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const admin = 'admin@example.com';
    await setUser(admin, {
      email: admin,
      password: 'x',
      role: 'admin',
      github_id: 'github-community-admin',
      totp_secret: 'JBSWY3DPEHPK3PXP',
      createdAt: new Date().toISOString()
    } as any);

    const authorToken = jwt.sign({ email: author }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const createRes = await request(app).post('/api/community/post').set('Authorization', `Bearer ${authorToken}`).send({ title: 'For Approval', body: 'Please approve' });
    expect(createRes.status).toBe(201);
    const postId = createRes.body.post.id;

    const adminToken = jwt.sign({ email: admin, role: 'admin' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const approveRes = await request(app).post(`/api/community/post/${postId}/approve`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.post.status).toBe('approved');
  });

  it('rejects non-admin attempting approval', async () => {
    const author = 'author2@example.com';
    await setUser(author, { email: author, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const nonAdmin = 'user@example.com';
    await setUser(nonAdmin, { email: nonAdmin, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const authorToken = jwt.sign({ email: author }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const createRes = await request(app).post('/api/community/post').set('Authorization', `Bearer ${authorToken}`).send({ title: 'For Rejection', body: 'Please reject' });
    expect(createRes.status).toBe(201);
    const postId = createRes.body.post.id;

    const userToken = jwt.sign({ email: nonAdmin, role: 'user' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const approveRes = await request(app).post(`/api/community/post/${postId}/approve`).set('Authorization', `Bearer ${userToken}`).send({});
    expect(approveRes.status).toBe(403);
  });
});
