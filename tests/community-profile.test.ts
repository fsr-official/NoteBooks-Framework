import request from 'supertest';
import jwt from 'jsonwebtoken';
import { describe, expect, it, beforeAll } from 'vitest';
import createApp from '../src/server/server';
import { setUser } from '../src/api/auth';

const email = 'profile-member@example.com';
const token = jwt.sign({ email, role: 'user', roles: ['verified_member'] }, process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production', { expiresIn: '1h' });

describe('Community profile and presence API', () => {
  const app = createApp();

  beforeAll(async () => {
    await setUser(email, {
      email,
      password: 'x',
      role: 'user',
      displayName: 'Profile Member',
      bio: 'A public NoteBooks member.',
      avatarColor: '#21d4a5',
      presenceStatus: 'online',
      profilePublic: true,
      role_keys: ['verified_member'],
      createdAt: new Date().toISOString(),
    } as any);
  });

  it('returns a safe public profile with role labels and presence', async () => {
    const response = await request(app).get(`/api/community/profile/${encodeURIComponent(email)}`);
    expect(response.status).toBe(200);
    expect(response.body.profile.displayName).toBe('Profile Member');
    expect(response.body.profile.presence).toBe('online');
    expect(response.body.profile.roles).toEqual([{ key: 'verified_member', label: 'Verified Member' }]);
    expect(response.body.profile.email).toBeUndefined();
  });

  it('allows an authenticated member to update presence and profile fields', async () => {
    const response = await request(app)
      .put('/api/community/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'Updated Member', bio: 'Available later.', presence: 'dnd', profilePublic: true });
    expect(response.status).toBe(200);
    expect(response.body.profile.displayName).toBe('Updated Member');
    expect(response.body.profile.presence).toBe('dnd');
    expect(response.body.profile.email).toBe(email);
  });

  it('rejects invalid presence values and unauthenticated updates', async () => {
    const invalid = await request(app)
      .put('/api/community/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ presence: 'away' });
    expect(invalid.status).toBe(400);

    const unauthenticated = await request(app)
      .put('/api/community/profile')
      .send({ presence: 'dnd' });
    expect(unauthenticated.status).toBe(401);
  });
});
