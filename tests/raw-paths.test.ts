import { describe, expect, it } from 'vitest';
import { buildRawGithubUrl } from '../src/api/raw';

describe('raw CDN URL builder', () => {
  it('builds a raw.githubusercontent URL from a repo-scoped path', () => {
    const url = buildRawGithubUrl('AI-NOTES/CHEMISTRY/test.md', {
      owner: 'fsr-science',
      repo: 'NCERT-Science',
      branch: 'main',
      root: 'AI-NOTES'
    });

    expect(url).toBe('https://raw.githubusercontent.com/fsr-science/NCERT-Science/main/AI-NOTES/CHEMISTRY/test.md');
  });

  it('strips a repo folder prefix and root prefix before building the raw URL', () => {
    const url = buildRawGithubUrl('NCERT-Science/AI-NOTES/CHEMISTRY/test.md', {
      owner: 'fsr-science',
      repo: 'NCERT-Science',
      branch: 'main',
      root: 'AI-NOTES'
    });

    expect(url).toBe('https://raw.githubusercontent.com/fsr-science/NCERT-Science/main/AI-NOTES/CHEMISTRY/test.md');
  });
});
