import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseRepoRegistryMarkdown } from '../src/api/repo-registry';
import { buildLocalFilesManifest } from '../src/api/files-manifest';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => import('fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true }))));
});

describe('repo registry markdown loader', () => {
  it('parses repository rows and keeps priority ordering', () => {
    const markdown = `# GitHub Repositories

| name | repo | branch | root | enabled | priority |
| --- | --- | --- | --- | --- | --- |
| Physics-XI | fsr-science/physics-xi-notes | main | notes/ | true | 1 |
| Chem-XI | fsr-science/chem-xi-notes | main | | false | 99 |
`;

    const entries = parseRepoRegistryMarkdown(markdown);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      name: 'Physics-XI',
      repo: 'fsr-science/physics-xi-notes',
      enabled: true,
      priority: 1
    });
    expect(entries[1]).toMatchObject({
      name: 'Chem-XI',
      repo: 'fsr-science/chem-xi-notes',
      enabled: false,
      priority: 99
    });
  });
});

describe('local files manifest', () => {
  it('includes markdown and office files in the local tree', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'notebooks-manifest-'));
    tempDirs.push(tempDir);

    await mkdir(path.join(tempDir, 'notes'), { recursive: true });
    await writeFile(path.join(tempDir, 'notes', 'hello.md'), '# hello');
    await writeFile(path.join(tempDir, 'notes', 'slides.pptx'), 'pptx');
    await writeFile(path.join(tempDir, 'notes', 'guide.pdf'), 'pdf');

    const manifest = await buildLocalFilesManifest(tempDir);
    const fileNames = manifest.children?.map((child) => child.name) || [];

    expect(fileNames).toContain('notes');
    const notesFolder = manifest.children?.find((child) => child.name === 'notes');
    const noteNames = notesFolder?.children?.map((child) => child.name) || [];
    expect(noteNames).toEqual(expect.arrayContaining(['hello.md', 'slides.pptx', 'guide.pdf']));
  });
});
