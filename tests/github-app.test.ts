import { describe, it, expect } from 'vitest';
import { getAppOctokit } from '../src/lib/github-app';

describe('GitHub App helpers', () => {
  it('throws when app not configured', async () => {
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    await expect(getAppOctokit()).rejects.toThrow('GitHub App not configured');
  });
});
