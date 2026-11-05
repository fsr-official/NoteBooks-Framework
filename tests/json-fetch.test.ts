import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRepositoryManifest } from '../src/scripts/json-fetch.ts';

describe('repository files.json fetching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts an HTTP-200 empty Commerce manifest as a valid empty tree', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })));

    const result = await fetchRepositoryManifest({
      name: 'NCERT-COMMERCE',
      stream: 'commerce',
      repo: 'fsr-commerce/NCERT-Commerce',
      branch: 'main',
      root: '',
      pages: true
    });

    expect(result.source).toBe('raw');
    expect(result.manifestUrl).toBe('https://raw.githubusercontent.com/fsr-commerce/NCERT-Commerce/main/files.json');
    expect(result.files).toEqual([]);
    expect(result.tree).toMatchObject({
      type: 'folder',
      name: 'NCERT-Commerce',
      path: 'NCERT-Commerce',
      repo: 'fsr-commerce/NCERT-Commerce',
      branch: 'main',
      stream: 'commerce',
      children: []
    });
  });

  it('does not request files.json when the registry marks Commerce as explicitly empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRepositoryManifest({
      name: 'NCERT-COMMERCE',
      stream: 'commerce',
      repo: 'fsr-commerce/NCERT-Commerce',
      branch: 'main',
      root: '',
      pages: true,
      empty: true
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.files).toEqual([]);
    expect(result.tree.children).toEqual([]);
  });

  it('prefers GitHub media URLs for repositories marked as LFS', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { type: 'file', name: 'file.pdf', path: 'IOC/1. General Principles and Processes of Isolation of Elements.pdf' }
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })));

    const result = await fetchRepositoryManifest({
      name: 'cengage-chemistry',
      stream: 'science',
      repo: 'fsr-science/cengage-chemistry',
      branch: 'main',
      root: '',
      lfs: true
    });

    expect(result.files[0].raw).toBe('https://media.githubusercontent.com/media/fsr-science/cengage-chemistry/refs/heads/main/IOC/1.%20General%20Principles%20and%20Processes%20of%20Isolation%20of%20Elements.pdf');
  });

  it('pins LFS media URLs to the selected commit when one is available', async () => {
    const commitSha = 'a'.repeat(40);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { type: 'file', name: 'file.pdf', path: 'IOC/file.pdf', sha: 'b'.repeat(40) }
    ]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })));

    const result = await fetchRepositoryManifest({
      name: 'cengage-chemistry',
      stream: 'science',
      repo: 'fsr-science/cengage-chemistry',
      branch: 'main',
      commitSha,
      root: '',
      lfs: true
    });

    expect(result.files[0].raw).toBe(`https://media.githubusercontent.com/media/fsr-science/cengage-chemistry/${commitSha}/IOC/file.pdf`);
  });

  it('uses the opt-in GitHub tree fallback when a repository has no files.json', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('raw.githubusercontent.com')) return new Response('Not Found', { status: 404 });
      if (url.includes('api.github.com/repos/fsr-official/NoteBooks-Documents/git/trees/')) {
        return new Response(JSON.stringify({
          truncated: false,
          tree: [
            { type: 'blob', path: 'docs/CONTENT-UPDATE-CONTRACT.md', sha: 'a'.repeat(40), size: 1200 },
            { type: 'blob', path: 'images/cover.png', sha: 'b'.repeat(40), size: 900 }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchRepositoryManifest({
      name: 'NoteBooks-Documents',
      stream: 'developers',
      repo: 'fsr-official/NoteBooks-Documents',
      branch: 'main',
      fallback: 'github-tree'
    });

    expect(result.source).toBe('github-tree');
    expect(result.files).toHaveLength(2);
    expect(result.files[0]).toMatchObject({
      path: 'docs/CONTENT-UPDATE-CONTRACT.md',
      sha: 'a'.repeat(40),
      raw: 'https://raw.githubusercontent.com/fsr-official/NoteBooks-Documents/main/docs/CONTENT-UPDATE-CONTRACT.md'
    });
    expect(result.tree.children[0]).toMatchObject({ name: 'docs', type: 'folder' });
  });

  it('rejects truncated trees from the GitHub fallback', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      if (String(input).includes('api.github.com')) {
        return new Response(JSON.stringify({ truncated: true, tree: [] }), { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    }));

    await expect(fetchRepositoryManifest({
      repo: 'fsr-official/NoteBooks-Documents',
      stream: 'developers',
      fallback: 'github-tree'
    })).rejects.toThrow('truncated tree');
  });
});
