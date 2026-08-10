import { describe, expect, it } from 'vitest';
import { buildPagesTreeFromManifest, resolvePagesBaseUrl } from '../src/api/pages-fetch.ts';

describe('Pages manifest helpers', () => {
  it('resolves GitHub Pages URLs from repo metadata', () => {
    expect(resolvePagesBaseUrl({ repo: 'fsr-official/NoteBooks-Framework' } as any)).toBe('https://fsr-official.github.io/NoteBooks-Framework/');
    expect(resolvePagesBaseUrl({ repo: 'octocat/octocat.github.io' } as any)).toBe('https://octocat.github.io/');
  });

  it('builds a nested tree from a flat Pages manifest array', () => {
    const manifest = [
      { path: 'notes/intro.md', name: 'intro.md', type: 'file' },
      { path: 'notes/advanced/guide.md', name: 'guide.md', type: 'file' }
    ];

    const tree = buildPagesTreeFromManifest('Demo', manifest as any);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('notes');
    expect(tree[0].children?.[0].name).toBe('intro.md');
    expect(tree[0].children?.[1].name).toBe('advanced');
  });
});
