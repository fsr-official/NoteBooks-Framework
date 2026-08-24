import request from 'supertest';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it } from 'vitest';
import createApp from '../src/server/server';

describe('Issues review boundaries', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
  });

  it('protects proposal review, diff, and reviewer comment reads', async () => {
    const app = createApp();
    expect((await request(app).get('/api/issues/review')).status).toBe(401);
    expect((await request(app).get('/api/issues/1/diff')).status).toBe(401);
    expect((await request(app).get('/api/issues/1/comments')).status).toBe(401);
    expect((await request(app).post('/api/issues/1/review').send({ decision: 'approved' })).status).toBe(401);
  });

  it('keeps comments authenticated and reports database-unavailable state explicitly', async () => {
    const token = jwt.sign({ email: 'reviewer@example.com', roles: ['verified_member'] }, 'test-secret', { expiresIn: '1h' });
    const response = await request(createApp()).get('/api/issues/1/comments').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(503);
    expect(response.body.error).toContain('database foundation');
  });

  it('only permits Issue proposal links from issue-triage messages', async () => {
    const token = jwt.sign({ email: 'member@example.com', roles: ['verified_member'] }, 'test-secret', { expiresIn: '1h' });
    const app = createApp();
    const response = await request(app).post('/api/community/channels/general/messages').set('Authorization', `Bearer ${token}`).send({ body: 'Not a triage message', issueProposalId: 1 });
    expect(response.status).toBe(400);
    const triage = await request(app).post('/api/community/channels/issue-triage/messages').set('Authorization', `Bearer ${token}`).send({ body: 'Triage context', issueProposalId: 1 });
    expect(triage.status).toBe(201);
    expect(triage.body.message.issueProposalId).toBe(1);
  });
});
