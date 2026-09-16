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
});
