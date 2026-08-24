import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadRepoRegistry } from '../src/api/repo-registry.ts';
import {
  buildGithubRepositoriesArtifact,
  hashGithubRepositoriesSource,
  parseRepoRegistryMarkdown
} from '../src/lib/github-repositories.ts';
import { generateGithubRepositories } from '../src/scripts/generate-github-repos.ts';

const MARKDOWN = [
  '# GitHub Repositories',
  '',
  '| name | STREAM | repo | branch | root | enabled | priority | pages |',
  '| --- | --- | --- | --- | --- | --- | --- | --- |',
  '| Science | SCIENCE | owner/science | main | docs | true | 1 | true |',
  '| Disabled | COMMERCE | owner/disabled | dev |  | false | 9 | false |'
].join('\n');

const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
});

describe('github-repos build artifact', () => {
  it('parses the canonical Markdown table without changing stream semantics', () => {
    expect(parseRepoRegistryMarkdown(MARKDOWN)).toEqual([
      expect.objectContaining({
        name: 'Science',
        stream: 'science',
        repo: 'owner/science',
        branch: 'main',
        root: 'docs',
        enabled: true,
        priority: 1,
        pages: true
      }),
      expect.objectContaining({
        name: 'Disabled',
        stream: 'commerce',
        enabled: false,
        priority: 9
      })
    ]);
  });

  it('creates byte-stable output for the same Markdown source', () => {
    const first = buildGithubRepositoriesArtifact(MARKDOWN);
    const second = buildGithubRepositoriesArtifact(MARKDOWN);
    expect(first).toEqual(second);
    expect(first.sourceSha256).toBe(hashGithubRepositoriesSource(MARKDOWN));
    expect(first.schemaVersion).toBe(1);
    expect(first.sourceFile).toBe('GITHUB-REPOSITORIES.md');
  });

  it('rejects an empty or malformed registry at generation time', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'notebooks-github-repos-'));
    await fs.writeFile(path.join(cwd, 'GITHUB-REPOSITORIES.md'), '# no table\n', 'utf8');
    await expect(generateGithubRepositories({ cwd })).rejects.toThrow('No repository entries found');
  });

  it('writes github-repos.json and the loader prefers it over Markdown', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'notebooks-github-repos-'));
    await fs.mkdir(path.join(cwd, 'public', 'json'), { recursive: true });
    await fs.writeFile(path.join(cwd, 'GITHUB-REPOSITORIES.md'), MARKDOWN, 'utf8');
    const generated = await generateGithubRepositories({ cwd });
    const artifactText = await fs.readFile(path.join(cwd, 'public', 'json', 'github-repos.json'), 'utf8');
    expect(JSON.parse(artifactText)).toEqual(generated.artifact);

    await fs.writeFile(path.join(cwd, 'GITHUB-REPOSITORIES.md'), MARKDOWN.replace('owner/science', 'owner/changed'), 'utf8');
    process.chdir(cwd);
    await expect(loadRepoRegistry()).resolves.toEqual(generated.artifact.entries);
  });
});
