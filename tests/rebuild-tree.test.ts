import crypto from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/server.ts';
import { resetRebuildLockForTests } from '../src/api/rebuild-tree.ts';
import { invalidateStreamTree } from '../src/api/system.ts';

describe('workflow static tree rebuild API', () => {
  beforeEach(async () => {
    process.env.WEBHOOK_SECRET = 'test-rebuild-secret';
    process.env.TREE_REBUILD_DEPLOY_HOOK_URL = 'https://api.vercel.com/v1/integrations/deploy/test-hook';
    delete process.env.TREE_REBUILD_SECRET;
    delete process.env.ENFORCE_CSRF;
    resetRebuildLockForTests();
    await invalidateStreamTree();
  });

  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    delete process.env.TREE_REBUILD_SECRET;
    delete process.env.TREE_REBUILD_DEPLOY_HOOK_URL;
    delete process.env.TREE_REBUILD_LOCK_TTL_SECONDS;
    resetRebuildLockForTests();
    vi.unstubAllGlobals();
  });

  function signature(payload: object): string {
    const rawBody = JSON.stringify(payload);
    return `sha256=${crypto.createHmac('sha256', 'test-rebuild-secret').update(rawBody, 'utf8').digest('hex')}`;
  }

  function signed(payload: object, repository = 'fsr-science/NCERT-Science') {
    return request(createApp())
      .post('/api/workspace/tree/rebuild')
      .set('Content-Type', 'application/json')
      .set('X-Notebooks-Workflow-Origin', repository)
      .set('X-Notebooks-Signature', signature(payload))
      .send(payload);
  }

  it('rejects unsigned, unknown-origin, and out-of-scope rebuild requests', async () => {
    const payload = { streams: ['science'], repository: 'fsr-science/NCERT-Science' };
    const unsigned = await request(createApp()).post('/api/workspace/tree/rebuild').send(payload);
    expect(unsigned.status).toBe(401);

    const unknownOrigin = await signed(payload, 'evil/repository');
    expect(unknownOrigin.status).toBe(403);

    const wrongStream = { streams: ['commerce'], repository: 'fsr-science/NCERT-Science' };
    const wrongScope = await signed(wrongStream);
    expect(wrongScope.status).toBe(403);
  });

  it('triggers one static deployment for a registry-matched source repository', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ job: { id: 'job-123', state: 'PENDING' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const payload = { streams: ['science'], repository: 'fsr-science/NCERT-Science', commit: 'abc123' };
    const response = await signed(payload);

    expect(response.status).toBe(202);
    expect(response.body).toEqual(expect.objectContaining({ success: true, deploymentTriggered: true, repository: 'fsr-science/ncert-science', streams: ['science'] }));
    expect(response.body.job).toEqual({ jobId: 'job-123', state: 'PENDING' });
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
  });

  it('drops a second request while the first deployment is inside the dedupe window', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ job: { id: 'job-123', state: 'PENDING' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const payload = { streams: ['science'], repository: 'fsr-science/NCERT-Science' };
    const first = await signed(payload);
    const second = await signed(payload);

    expect(first.status).toBe(202);
    expect(second.status).toBe(409);
    expect(second.body.dropped).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
