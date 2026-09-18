import { promises as fs } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseRepoRegistryMarkdown } from '../src/api/repo-registry.ts';

describe('STREAM repository routing', () => {
  it('parses STREAM by header name without disturbing repository fields', () => {
    const markdown = [
      '| name | STREAM | repo | branch | root | enabled | priority | pages |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      '| Notes | COMMERCE | owner/repo | main | docs | true | 2 | true |'
    ].join('\n');

    expect(parseRepoRegistryMarkdown(markdown)).toEqual([
      expect.objectContaining({
        name: 'Notes',
        stream: 'commerce',
        repo: 'owner/repo',
        branch: 'main',
        root: 'docs',
        enabled: true,
        priority: 2,
        pages: true
      })
    ]);
  });

  it('declares all production streams and workspaces with explicit STREAM mappings', async () => {
    const registry = await fs.readFile(path.resolve(process.cwd(), 'GITHUB-REPOSITORIES.md'), 'utf8');
    const entries = parseRepoRegistryMarkdown(registry);
    expect(entries.find((entry) => entry.stream === 'commerce')).toMatchObject({ empty: true });
    expect(entries.find((entry) => entry.stream === 'community')).toMatchObject({ empty: false });
    expect(entries.find((entry) => entry.stream === 'issues')).toMatchObject({ empty: false });
    // Make assertions tolerant to added repositories and repo-name casing changes.
    const repoPairs = entries.map((entry) => [entry.stream.toLowerCase(), String(entry.repo).toLowerCase()]);
    const repoSet = new Set(repoPairs.map(([s, r]) => `${s}::${r}`));

    // Core repos must be present (case-insensitive).
    expect(repoSet.has('science::fsr-science/ncert-science')).toBe(true);
    expect(repoSet.has('commerce::fsr-commerce/ncert-commerce')).toBe(true);
    expect(repoSet.has('humanities::fsr-humanities/ncert-humanities')).toBe(true);
    expect(repoSet.has('community::fsr-official/notebooks-community')).toBe(true);
    expect(repoSet.has('issues::fsr-official/notebooks-issues')).toBe(true);

    // The science stream should contain at least three repositories (NCERT + several Cengage/third-party repos).
    const scienceCount = entries.filter((e) => String(e.stream).toLowerCase() === 'science').length;
    expect(scienceCount).toBeGreaterThanOrEqual(3);
  });
});
