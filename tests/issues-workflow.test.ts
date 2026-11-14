import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getOctokit: vi.fn(),
  getStreamRepo: vi.fn(),
  findRegisteredRepo: vi.fn()
}));

vi.mock('../src/lib/db.ts', () => ({
  isConfigured: () => true,
  query: mocks.query
}));

vi.mock('../src/api/_shared.ts', () => ({
  getOctokit: mocks.getOctokit,
  getStreamRepo: mocks.getStreamRepo,
  findRegisteredRepo: mocks.findRegisteredRepo
}));

import { createProposal } from '../src/api/issues.ts';

describe('Issue proposal outbox', () => {
  it('stores the proposal and queues delivery without making a synchronous GitHub write', async () => {
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 12 }] };
      if (sql.includes('WITH proposal AS')) {
        return { rows: [{ id: 37, title: 'Add a missing source', publication_state: 'queued' }] };
      }
      return { rows: [] };
    });
    mocks.getOctokit.mockReset();
    mocks.getStreamRepo.mockResolvedValue({ owner: 'fsr-official', repo: 'NoteBooks-Issues' });
    mocks.findRegisteredRepo.mockResolvedValue({ owner: 'fsr-science', repo: 'NCERT-Science', branch: 'main' });

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
    await createProposal({
      method: 'POST',
      auth: { email: 'reader@example.test' },
      body: {
        title: 'Add a missing source',
        body: 'The source section is incomplete.',
        sourceRepository: 'fsr-science/NCERT-Science',
        sourceBranch: 'main',
        sourcePath: 'notes/chapter.md'
      }
    } as any, response);

    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ proposal: { id: 37 }, delivery: { status: 'queued' } });
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_workflow_jobs'),
      expect.arrayContaining(['fsr-official/NoteBooks-Issues'])
    );
    expect(mocks.getOctokit).not.toHaveBeenCalled();
  });
});
