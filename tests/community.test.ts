process.env.JWT_SECRET = 'test-secret';
import request from 'supertest';
import createApp from '../src/server/server';
import jwt from 'jsonwebtoken';
import { setUser } from '../src/api/auth';
import { describe, it, expect } from 'vitest';

describe('Community endpoints', () => {
  const app = createApp();

  it('allows listing posts (empty at start)', async () => {
    const res = await request(app).get('/api/community/posts');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.posts)).toBe(true);
  });

  it('requires auth to create a post and persists it in-memory', async () => {
    const email = 'comm@example.com';
    await setUser(email, { email, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const token = jwt.sign({ email }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const res = await request(app).post('/api/community/post').set('Authorization', `Bearer ${token}`).send({ title: 'Hello', body: 'World' });
    expect(res.status).toBe(201);
    expect(res.body.post).toBeTruthy();
    const list = await request(app).get('/api/community/posts');
    expect(list.status).toBe(200);
    expect(list.body.posts.length).toBeGreaterThanOrEqual(1);
  });
});
