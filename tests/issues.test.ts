import request from 'supertest';
import { describe, expect, it, beforeEach } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { sourceEvidence } from '../src/api/issues.ts';

describe('canonical issues source evidence', () => {
  it('accepts bounded line ranges with selected source text', () => {
    expect(sourceEvidence({ startLine: 4, endLine: 6, text: '## Heading\\n\\nDetails' })).toEqual({ startLine: 4, endLine: 6, text: '## Heading\\n\\nDetails' });
  });

  it('rejects missing, reversed, oversized, or empty evidence', () => {
    expect(sourceEvidence({ startLine: 0, endLine: 1, text: 'x' })).toBeNull();
    expect(sourceEvidence({ startLine: 8, endLine: 4, text: 'x' })).toBeNull();
    expect(sourceEvidence({ startLine: 1, endLine: 501, text: 'x' })).toBeNull();
    expect(sourceEvidence({ startLine: 1, endLine: 1, text: '' })).toBeNull();
  });
});

describe('canonical issues security boundaries', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret';
    delete process.env.DATABASE_URL;
  });

  it('requires authentication for proposal creation and voting', async () => {
    const app = createApp();

    expect((await request(app).post('/api/issues/proposals').send({})).status).toBe(401);
    expect((await request(app).post('/api/issues/1/vote').send({ value: 1 })).status).toBe(401);
    expect((await request(app).delete('/api/issues/1/vote')).status).toBe(401);
  });

  it('requires administrator security for repository PR creation', async () => {
    const app = createApp();
    const response = await request(app).post('/api/issues/1/pr').send({ content: 'replacement' });
    expect(response.status).toBe(401);
  });
});
