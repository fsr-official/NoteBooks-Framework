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

  it('declares all production subject repositories with explicit STREAM mappings', async () => {
    const registry = await fs.readFile(path.resolve(process.cwd(), 'GITHUB-REPOSITORIES.md'), 'utf8');
    const entries = parseRepoRegistryMarkdown(registry);
    expect(entries.map((entry) => [entry.stream, entry.repo])).toEqual([
      ['science', 'fsr-science/NCERT-Science'],
      ['commerce', 'fsr-commerce/NCERT-Commerce'],
      ['humanities', 'fsr-humanities/NCERT-Humanities']
    ]);
  });
});
