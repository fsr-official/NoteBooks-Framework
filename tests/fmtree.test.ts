import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type ManifestNode = {
  type: 'folder' | 'file';
  name: string;
  path: string;
  children?: ManifestNode[];
};

function flattenFiles(node: ManifestNode): string[] {
  if (node.type === 'file') return [node.path];
  return (node.children || []).flatMap(flattenFiles);
}

describe('fmtree local manifest ownership', () => {
  it('includes landing documentation, excludes non-landing roots, and preserves remote registry ownership', () => {
    const fixture = mkdtempSync(path.join(os.tmpdir(), 'notebooks-fmtree-'));
    try {
      mkdirSync(path.join(fixture, 'docs', 'archive'), { recursive: true });
      mkdirSync(path.join(fixture, 'src'), { recursive: true });
      mkdirSync(path.join(fixture, 'public'), { recursive: true });
      mkdirSync(path.join(fixture, 'tests'), { recursive: true });
      writeFileSync(path.join(fixture, 'README.md'), '# Landing README\n');
      writeFileSync(path.join(fixture, 'docs', 'archive', 'ARCHITECTURE.md'), '# Architecture\n');
      writeFileSync(path.join(fixture, 'notes.txt'), 'Landing notes\n');
      writeFileSync(path.join(fixture, 'src', 'internal.md'), 'internal\n');
      writeFileSync(path.join(fixture, 'public', 'internal.md'), 'public internal\n');
      writeFileSync(path.join(fixture, 'tests', 'fixture.md'), 'test fixture\n');
      writeFileSync(path.join(fixture, 'index.html'), '<html></html>\n');

      const output = path.join(fixture, 'files.json');
      execFileSync('python3', [path.resolve('fmtree.py'), '--root', fixture, '--output', output], {
        cwd: path.resolve('.'),
        stdio: 'pipe'
      });

      const manifest = JSON.parse(readFileSync(output, 'utf8')) as ManifestNode;
      const files = flattenFiles(manifest);
      expect(files).toContain('README.md');
      expect(files).toContain('docs/archive/ARCHITECTURE.md');
      expect(files).toContain('notes.txt');
      expect(files).not.toContain('src/internal.md');
      expect(files).not.toContain('public/internal.md');
      expect(files).not.toContain('tests/fixture.md');
      expect(files).not.toContain('index.html');
      expect(files).not.toContain('files.json');
      expect(() => readFileSync(path.join(fixture, 'repo-registry.json'))).toThrow();
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
