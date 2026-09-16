import { describe, expect, it } from 'vitest';
import { buildMediaGithubUrl, buildRawGithubUrl } from '../src/api/raw';

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

  it('builds a GitHub media URL fallback for LFS-backed files', () => {
    const url = buildMediaGithubUrl('IOC/1. General Principles and Processes of Isolation of Elements.pdf', {
      owner: 'fsr-science',
      repo: 'cengage-chemistry',
      branch: 'main',
      root: ''
    });

    expect(url).toBe('https://media.githubusercontent.com/media/fsr-science/cengage-chemistry/refs/heads/main/IOC/1.%20General%20Principles%20and%20Processes%20of%20Isolation%20of%20Elements.pdf');
  });
});
