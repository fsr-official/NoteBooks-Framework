import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';

const githubAppState = {
  existingOpenPr: null as any,
  existingMergedPr: null as any
};

(globalThis as any).__githubAppState = githubAppState;

// Mock Octokit and auth-app to test our wrapper without external network calls
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: () => async (opts: any) => ({ token: 'fake-token' })
}));

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest: any;
    git: any;
    repos: any;
    pulls: any;
    constructor() {
      const state = (globalThis as any).__githubAppState || githubAppState;
      this.rest = {
        discussions: { create: async ({ owner, repo, title, body, category_name }: any) => ({ data: { id: 'd1', html_url: 'https://example.com/d/1' } }) },
        apps: { getRepoInstallation: async () => ({ data: { id: 999 } }) }
      };
      this.apps = { getRepoInstallation: async () => ({ data: { id: 999 } }) };
      this.git = { getRef: async () => ({ data: { object: { sha: 'deadbeef' } } }), createRef: async () => ({}) };
      this.repos = { createOrUpdateFileContents: async () => ({}) };
      this.pulls = {
        list: async () => ({ data: state.existingOpenPr ? [state.existingOpenPr] : [] }),
        create: async () => ({ data: { number: 42, html_url: 'https://example.com/pull/42', head: { ref: 'branch' } } }),
        get: async () => ({ data: state.existingMergedPr || { number: 42, merged: false, state: 'open' } }),
        merge: async () => ({ data: { merged: true, number: 42 } })
      };
    }
  }
}));

import * as gha from '../src/lib/github-app';

describe('github-app wrapper (mocked)', () => {
  beforeAll(() => {
    process.env.GITHUB_APP_ID = '1';
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIBIjAN...\n-----END PRIVATE KEY-----';
  });

  beforeEach(() => {
    githubAppState.existingOpenPr = null;
    githubAppState.existingMergedPr = null;
  });

  afterAll(() => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  it('creates discussion, pr and merges via mocked octokit', async () => {
    const discussion = await gha.createDiscussionForRepo('o', 'r', 't', 'b', 'Community');
    expect(discussion).toHaveProperty('id');

    const pr = await gha.createPrFromContent('o', 'r', 'main', 'branch-x', 'path/file.md', Buffer.from('hi').toString('base64'), 'msg', 'title', 'body');
    expect(pr).toHaveProperty('number');

    const merge = await gha.mergePr('o', 'r', 42, 'merge');
    expect(merge).toHaveProperty('merged');
  });

  it('returns an existing open PR instead of creating a duplicate', async () => {
    githubAppState.existingOpenPr = { number: 99, html_url: 'https://example.com/pull/99', head: { ref: 'branch-x' } };

    const pr = await gha.createPrFromContent('o', 'r', 'main', 'branch-x', 'path/file.md', Buffer.from('hi').toString('base64'), 'msg', 'title', 'body');
    expect(pr.number).toBe(99);
    expect(pr.alreadyExists).toBe(true);
  });

  it('reports an already merged PR without re-merging it', async () => {
    githubAppState.existingMergedPr = { number: 42, merged: true, state: 'closed' };

    const result = await gha.mergePr('o', 'r', 42, 'merge');
    expect(result.merged).toBe(true);
    expect(result.alreadyMerged).toBe(true);
  });
});
