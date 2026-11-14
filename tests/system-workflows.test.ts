import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getOctokit: vi.fn(),
  getStreamRepo: vi.fn(),
  recordSystemEvent: vi.fn(),
  graphql: vi.fn()
}));

vi.mock('../src/lib/db.ts', () => ({
  isConfigured: () => true,
  query: mocks.query
}));

vi.mock('../src/api/_shared.ts', () => ({
  getOctokit: mocks.getOctokit,
  getStreamRepo: mocks.getStreamRepo
}));

vi.mock('../src/lib/system-events.ts', () => ({
  recordSystemEvent: mocks.recordSystemEvent
}));

import { runSystemWorkflows } from '../src/api/system-workflows.ts';

function signedRequest(body: unknown, signatureOverride?: string) {
  const rawBody = JSON.stringify(body);
  const signature = signatureOverride || `sha256=${crypto.createHmac('sha256', 'workflow-secret').update(rawBody).digest('hex')}`;
  return {
    method: 'POST',
    body,
    rawBody,
    headers: { 'x-notebooks-signature': signature }
  } as any;
}

async function invoke(body: unknown, signatureOverride?: string) {
  const result: { status?: number; body?: any } = {};
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(value: unknown) {
      result.body = value;
      return this;
    }
  } as any;
  await runSystemWorkflows(signedRequest(body, signatureOverride), response);
  return result;
}

describe('System workflow worker', () => {
  beforeEach(() => {
    process.env.NOTEBOOKS_UPDATE_SECRET = 'workflow-secret';
    delete process.env.GITHUB_ISSUES_REPO;
    vi.clearAllMocks();
    mocks.getOctokit.mockResolvedValue({ graphql: mocks.graphql });
    mocks.getStreamRepo.mockResolvedValue(null);
    mocks.recordSystemEvent.mockResolvedValue(undefined);
    mocks.query.mockResolvedValue({ rows: [], rowCount: 1 });
    mocks.graphql.mockImplementation(async (query: string) => {
      if (query.includes('discussionCategories')) {
        return { repository: { id: 'repository-node', discussionCategories: { nodes: [{ id: 'general-node', name: 'General' }] } } };
      }
      if (query.includes('discussions(first: 100')) {
        return { repository: { discussions: { nodes: [] } } };
      }
      if (query.includes('createDiscussion')) {
        return { createDiscussion: { discussion: { id: 'discussion-node', url: 'https://github.com/fsr-official/NoteBooks-Community/discussions/8' } } };
      }
      throw new Error('Unexpected GitHub GraphQL request');
    });
  });

  afterEach(() => {
    delete process.env.NOTEBOOKS_UPDATE_SECRET;
  });

  it('rejects invalid signatures before touching persistence or GitHub', async () => {
    const result = await invoke({ uptime: { status: 'up', checkedAt: new Date().toISOString() } }, 'sha256=invalid');
    expect(result).toEqual({ status: 401, body: { error: 'Invalid workflow signature' } });
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getOctokit).not.toHaveBeenCalled();
  });

  it('records an initial healthy check without creating a false recovery event', async () => {
    const result = await invoke({ uptime: { status: 'up', responseMs: 42, checkedAt: new Date().toISOString() } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, uptime: { status: 'up' }, jobs: { delivered: 0 } });
    expect(mocks.recordSystemEvent).not.toHaveBeenCalled();
  });

  it('records a downtime interval followed by recovery exactly once', async () => {
    const downSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const result = await invoke({
      uptime: {
        status: 'up',
        responseMs: 42,
        checkedAt: new Date().toISOString(),
        previousNonUpStatus: 'down',
        previousNonUpSince: downSince
      }
    });
    expect(result.status).toBe(200);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('VALUES($1, $2, $3)'),
      expect.arrayContaining(['down', downSince])
    );
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE system_uptime_checks SET duration_seconds = $1'),
      expect.any(Array)
    );
    expect(mocks.recordSystemEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'service_down' }));
    expect(mocks.recordSystemEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'service_recovered' }));
  });

  it('publishes an approved Community post idempotently through Discussions', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status FROM system_uptime_checks')) return { rows: [] };
      if (sql.includes('INSERT INTO system_uptime_checks')) return { rows: [], rowCount: 1 };
      if (sql.includes('WITH ready AS')) {
        return { rows: [{ id: 17, job_type: 'community_post', source_id: 8, target_repository: 'fsr-official/NoteBooks-Community', attempts: 1 }] };
      }
      if (sql.includes('SELECT id, title, body, subject, status FROM community_posts')) {
        return { rows: [{ id: 8, title: 'A public note', body: 'Approved body', subject: null, status: 'approved' }] };
      }
      return { rows: [], rowCount: 1 };
    });

    const result = await invoke({ uptime: { status: 'up', checkedAt: new Date().toISOString() } });
    expect(result.status).toBe(200);
    expect(result.body.jobs.delivered).toBe(1);
    expect(mocks.graphql).toHaveBeenCalledTimes(3);
    expect(mocks.graphql).toHaveBeenCalledWith(
      expect.stringContaining('createDiscussion'),
      expect.objectContaining({
        input: expect.objectContaining({
          title: 'A public note',
          body: expect.stringContaining('notebooksCommunityPostId:8')
        })
      })
    );
    expect(mocks.recordSystemEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'community_post_published' }));
  });

  it('backs off and leaves a failed GitHub delivery retryable', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT status FROM system_uptime_checks')) return { rows: [] };
      if (sql.includes('INSERT INTO system_uptime_checks')) return { rows: [], rowCount: 1 };
      if (sql.includes('WITH ready AS')) {
        return { rows: [{ id: 21, job_type: 'community_post', source_id: 9, target_repository: 'fsr-official/NoteBooks-Community', attempts: 1 }] };
      }
      if (sql.includes('SELECT id, title, body, subject, status FROM community_posts')) {
        return { rows: [{ id: 9, title: 'Retry me', body: 'Approved body', subject: null, status: 'approved' }] };
      }
      return { rows: [], rowCount: 1 };
    });
    mocks.graphql.mockRejectedValue(new Error('GitHub temporarily unavailable'));

    const result = await invoke({ uptime: { status: 'up', checkedAt: new Date().toISOString() } });
    expect(result.status).toBe(200);
    expect(result.body.jobs).toMatchObject({ delivered: 0, retried: 1, failed: 0 });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('SET status = $1, last_error = $2'),
      ['pending', 'GitHub temporarily unavailable', 30, 21]
    );
  });
});
