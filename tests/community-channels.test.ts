import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import createApp from '../src/server/server';

describe('Community channels and messaging', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
  });

  it('lists public channels without exposing role-restricted triage', async () => {
    const response = await request(createApp()).get('/api/community/channels');
    expect(response.status).toBe(200);
    expect(response.body.channels.map((channel: any) => channel.slug)).toContain('general');
    expect(response.body.channels.map((channel: any) => channel.slug)).not.toContain('issue-triage');
  });

  it('requires the appropriate role to see issue triage', async () => {
    const memberToken = jwt.sign({ email: 'member@example.com', roles: ['verified_member'] }, 'test-secret', { expiresIn: '1h' });
    const response = await request(createApp()).get('/api/community/channels');
    expect(response.status).toBe(200);
    const restricted = await request(createApp()).get('/api/community/channels/issue-triage/messages');
    expect(restricted.status).toBe(401);
    const allowed = await request(createApp()).get('/api/community/channels/issue-triage/messages').set('Authorization', `Bearer ${memberToken}`);
    expect(allowed.status).toBe(200);
  });

  it('protects message creation, validates content, and records read state', async () => {
    const app = createApp();
    expect((await request(app).post('/api/community/channels/general/messages').send({ body: 'hello' })).status).toBe(401);
    const token = jwt.sign({ email: 'member@example.com', roles: ['verified_member'] }, 'test-secret', { expiresIn: '1h' });
    expect((await request(app).post('/api/community/channels/general/messages').set('Authorization', `Bearer ${token}`).send({ body: '' })).status).toBe(400);
    const created = await request(app).post('/api/community/channels/general/messages').set('Authorization', `Bearer ${token}`).send({ body: 'Hello Community' });
    expect(created.status).toBe(201);
    expect(created.body.message.body).toBe('Hello Community');
    const messages = await request(app).get('/api/community/channels/general/messages');
    expect(messages.status).toBe(200);
    expect(messages.body.messages.some((message: any) => message.body === 'Hello Community')).toBe(true);
    const read = await request(app).post('/api/community/channels/general/read').set('Authorization', `Bearer ${token}`);
    expect(read.status).toBe(200);
  });

  it('tracks unread counts and protects the moderation queue', async () => {
    const app = createApp();
    const memberToken = jwt.sign({ email: 'unread-member@example.com', roles: ['verified_member'] }, 'test-secret', { expiresIn: '1h' });
    const moderatorToken = jwt.sign({ email: 'community-mod@example.com', roles: ['community_mod'] }, 'test-secret', { expiresIn: '1h' });
    const created = await request(app).post('/api/community/channels/general/messages').set('Authorization', `Bearer ${memberToken}`).send({ body: 'Reportable governance message' });
    expect(created.status).toBe(201);
    const channels = await request(app).get('/api/community/channels').set('Authorization', `Bearer ${memberToken}`);
    expect(channels.body.channels.find((channel: any) => channel.slug === 'general').unreadCount).toBeGreaterThan(0);
    const reported = await request(app).post(`/api/community/messages/${created.body.message.id}/report`).set('Authorization', `Bearer ${memberToken}`).send({ reason: 'Please review this message' });
    expect(reported.status).toBe(201);
    expect((await request(app).get('/api/community/moderation/reports')).status).toBe(401);
    const reports = await request(app).get('/api/community/moderation/reports').set('Authorization', `Bearer ${moderatorToken}`);
    expect(reports.status).toBe(200);
    const report = reports.body.reports.find((item: any) => item.messageId === created.body.message.id || item.message_id === created.body.message.id);
    expect(report).toBeTruthy();
    const moderated = await request(app).post(`/api/community/messages/${created.body.message.id}/moderate`).set('Authorization', `Bearer ${moderatorToken}`).send({ action: 'remove', reason: 'Policy violation' });
    expect(moderated.status).toBe(200);
    const messages = await request(app).get('/api/community/channels/general/messages');
    expect(messages.body.messages.some((message: any) => message.id === created.body.message.id)).toBe(false);
    const resolved = await request(app).post(`/api/community/moderation/reports/${report.id}/resolve`).set('Authorization', `Bearer ${moderatorToken}`).send({ status: 'resolved' });
    expect(resolved.status).toBe(200);
  });
});
