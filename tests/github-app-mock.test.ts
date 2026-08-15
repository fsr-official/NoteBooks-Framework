import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

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
      this.rest = {
        discussions: { create: async ({ owner, repo, title, body, category_name }: any) => ({ data: { id: 'd1', html_url: 'https://example.com/d/1' } }) },
        apps: { getRepoInstallation: async () => ({ data: { id: 999 } }) }
      };
      // octokit also exposes a top-level `apps` namespace in some builds; provide it for compatibility
      this.apps = { getRepoInstallation: async () => ({ data: { id: 999 } }) };
      this.git = { getRef: async () => ({ data: { object: { sha: 'deadbeef' } } }), createRef: async () => ({}) };
      this.repos = { createOrUpdateFileContents: async () => ({}) };
      this.pulls = { create: async () => ({ data: { number: 42, html_url: 'https://example.com/pull/42', head: { ref: 'branch' } } }) };
      this.pulls.merge = async () => ({ data: { merged: true } });
    }
  }
}));

import * as gha from '../src/lib/github-app';

describe('github-app wrapper (mocked)', () => {
  beforeAll(() => {
    process.env.GITHUB_APP_ID = '1';
    process.env.GITHUB_APP_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIBIjAN...\n-----END PRIVATE KEY-----';
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
});
