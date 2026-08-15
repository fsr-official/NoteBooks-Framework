process.env.JWT_SECRET = 'test-secret';
import request from 'supertest';
import createApp from '../src/server/server';
import jwt from 'jsonwebtoken';
import { setUser, getUser } from '../src/api/auth';
import { describe, it, expect } from 'vitest';

describe('Admin endpoints (role/ban)', () => {
  const app = createApp();
  const adminEmail = 'admin@example.com';
  const targetEmail = 'target@example.com';

  const adminToken = jwt.sign({ email: adminEmail, role: 'admin' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

  it('can assign and revoke roles', async () => {
    // ensure target exists
    await setUser(targetEmail, { email: targetEmail, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);

    let res = await request(app).post('/api/admin?action=assign-role').set('Authorization', `Bearer ${adminToken}`).send({ email: targetEmail, role: 'editor' });
    expect(res.status).toBe(200);

    const u1 = await getUser(targetEmail);
    expect(u1).toBeTruthy();
    expect((u1 as any).role).toBe('editor');

    res = await request(app).post('/api/admin?action=revoke-role').set('Authorization', `Bearer ${adminToken}`).send({ email: targetEmail });
    expect(res.status).toBe(200);

    const u2 = await getUser(targetEmail);
    expect((u2 as any).role).toBe('user');
  });

  it('can ban and unban accounts', async () => {
    await setUser(targetEmail, { email: targetEmail, password: 'x', role: 'user', createdAt: new Date().toISOString() } as any);
    const until = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    let res = await request(app).post('/api/admin?action=ban').set('Authorization', `Bearer ${adminToken}`).send({ email: targetEmail, until });
    expect(res.status).toBe(200);

    const u1 = await getUser(targetEmail);
    expect((u1 as any).banned_until).toBeTruthy();

    res = await request(app).post('/api/admin?action=unban').set('Authorization', `Bearer ${adminToken}`).send({ email: targetEmail });
    expect(res.status).toBe(200);

    const u2 = await getUser(targetEmail);
    expect((u2 as any).banned_until).toBeUndefined();
  });
});
