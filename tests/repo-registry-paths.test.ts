import { describe, expect, it } from 'vitest';
import { buildRegistryTree } from '../src/api/repo-registry.ts';

describe('repo registry path layout', () => {
  it('roots remote entries by the repo slug instead of the display name', async () => {
    const tree = await buildRegistryTree([
      {
        name: 'NCERT display name',
        repo: 'fsr-science/NCERT-Science',
        branch: 'main',
        enabled: true,
        priority: 1,
        pages: true
      }
    ] as any);

    expect(tree.children?.[0]?.name).toBe('NCERT-Science');
    expect(tree.children?.[0]?.path).toBe('NCERT-Science');
  });
});
