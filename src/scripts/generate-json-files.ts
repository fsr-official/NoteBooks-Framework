import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadRepoRegistry } from '../api/repo-registry.js';
import {
  fetchRepositoryManifest,
  normalizeStream,
  type JsonFetchNode,
  type RepositoryManifestInstance
} from './json-fetch.js';

export const STREAMS = ['science', 'commerce', 'humanities'] as const;
export type Stream = (typeof STREAMS)[number];

export interface GeneratedStreamTree {
  stream: string;
  root: JsonFetchNode;
  repos: RepositoryManifestInstance[];
}

export interface GeneratedRegistry {
  type: 'folder';
  name: 'root';
  path: '';
  children: JsonFetchNode[];
  streams: GeneratedStreamTree[];
  generatedAt: string;
}

export interface GenerateJsonFilesOptions {
  cwd?: string;
}

function streamRootName(stream: string): string {
  return `NoteBooks-${stream.charAt(0).toUpperCase()}${stream.slice(1)}`;
}

function isStream(value: string): value is Stream {
  return (STREAMS as readonly string[]).includes(value);
}

function cloneNode<T extends JsonFetchNode>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function sortNodes(nodes: JsonFetchNode[]): JsonFetchNode[] {
  return [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

function collectFiles(node: JsonFetchNode, output: JsonFetchNode[] = []): JsonFetchNode[] {
  if (node.type === 'file') {
    output.push(cloneNode(node));
    return output;
  }
  for (const child of node.children || []) collectFiles(child, output);
  return output;
}

function legacyRepoToInstance(stream: Stream, repo: any): RepositoryManifestInstance | null {
  if (!repo?.repo || !repo?.tree) return null;
  const tree = cloneNode(repo.tree);
  const files = collectFiles(tree).map((file) => ({
    ...file,
    repo: file.repo || repo.repo,
    branch: file.branch || repo.branch || 'main',
    stream: file.stream || stream,
    raw: file.raw || `https://raw.githubusercontent.com/${repo.repo}/${repo.branch || 'main'}/${String(file.repoPath || file.path || file.name).split('/').filter(Boolean).join('/')}`
  }));
  return {
    stream,
    repo: String(repo.repo),
    branch: String(repo.branch || 'main'),
    root: '',
    name: String(repo.name || repo.repo),
    manifestUrl: '',
    source: 'raw',
    files,
    tree
  };
}

async function readExistingStreamTree(cwd: string, stream: Stream): Promise<GeneratedStreamTree | null> {
  try {
    const filePath = path.resolve(cwd, 'public', 'json', `${stream}-tree.json`);
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as any;
    const repos = Array.isArray(parsed.repos)
      ? parsed.repos.map((repo: any) => legacyRepoToInstance(stream, repo)).filter(Boolean) as RepositoryManifestInstance[]
      : [];
    if (parsed.root && Array.isArray(parsed.root.children) && repos.length > 0) {
      return { stream, root: cloneNode(parsed.root), repos };
    }
    if (repos.length > 0) return buildStreamTree(stream, repos);
  } catch {
    // A missing or malformed stale artifact is not a usable fallback.
  }
  return null;
}

function buildStreamTree(stream: Stream, repos: RepositoryManifestInstance[]): GeneratedStreamTree {
  const root: JsonFetchNode = {
    type: 'folder',
    name: streamRootName(stream),
    path: streamRootName(stream),
    stream,
    children: sortNodes(repos.map((instance) => cloneNode(instance.tree)))
  };

  return {
    stream,
    root,
    repos: repos.map((instance) => ({
      ...instance,
      tree: cloneNode(instance.tree),
      files: instance.files.map((file) => cloneNode(file))
    }))
  };
}

function buildRegistryTree(streamTrees: GeneratedStreamTree[], generatedAt: string): GeneratedRegistry {
  const children = streamTrees.map((streamTree) => ({
    type: 'folder' as const,
    name: streamTree.stream,
    path: streamTree.stream,
    stream: streamTree.stream,
    children: streamTree.root.children || []
  }));

  return {
    type: 'folder',
    name: 'root',
    path: '',
    children,
    streams: streamTrees,
    generatedAt
  };
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

async function writeArtifactSet(cwd: string, name: string, value: unknown): Promise<string[]> {
  const outputPath = path.resolve(cwd, 'public', 'json', name);
  await writeJsonAtomically(outputPath, value);
  return [outputPath];
}

export async function generateJsonFiles(options: GenerateJsonFilesOptions = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const entries = (await loadRepoRegistry())
    .filter((entry: any) => entry?.enabled !== false && entry?.repo)
    .sort((a: any, b: any) => {
      const priorityA = Number.isFinite(Number(a.priority)) ? Number(a.priority) : Number.MAX_SAFE_INTEGER;
      const priorityB = Number.isFinite(Number(b.priority)) ? Number(b.priority) : Number.MAX_SAFE_INTEGER;
      return priorityA - priorityB || String(a.name || a.repo).localeCompare(String(b.name || b.repo));
    });

  if (entries.length === 0) throw new Error('No enabled repository entries found in GITHUB-REPOSITORIES.md');

  const instances: RepositoryManifestInstance[] = [];
  const failures: Array<{ repo: string; error: string }> = [];
  for (const entry of entries) {
    try {
      const instance = await fetchRepositoryManifest(entry);
      if (isStream(normalizeStream(instance.stream))) instances.push(instance);
      else failures.push({ repo: entry.repo, error: `unsupported stream: ${instance.stream}` });
    } catch (error) {
      failures.push({ repo: entry.repo, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (instances.length === 0) {
    throw new Error(`No repository manifests could be generated: ${failures.map((failure) => `${failure.repo}: ${failure.error}`).join('; ')}`);
  }

  const generatedAt = new Date().toISOString();
  const streamTrees: GeneratedStreamTree[] = [];
  for (const stream of STREAMS) {
    const freshRepos = instances.filter((instance) => normalizeStream(instance.stream) === stream);
    if (freshRepos.length > 0) {
      streamTrees.push(buildStreamTree(stream, freshRepos));
      continue;
    }
    const staleTree = await readExistingStreamTree(cwd, stream);
    if (staleTree) {
      console.warn(`[generate-json-files] retaining stale ${stream} tree because no fresh manifest was available`);
      streamTrees.push(staleTree);
    } else {
      streamTrees.push(buildStreamTree(stream, []));
    }
  }
  const registry = buildRegistryTree(streamTrees, generatedAt);
  const written: string[] = [];

  written.push(...await writeArtifactSet(cwd, 'repo-registry.json', registry));
  for (const streamTree of streamTrees) {
    written.push(...await writeArtifactSet(cwd, `${streamTree.stream}-tree.json`, streamTree));
  }

  return { entries: entries.length, generated: instances.length, failures, written, generatedAt, registry, streamTrees };
}

if (process.argv[1] && /generate-json-files\.(?:ts|js)$/.test(path.basename(process.argv[1]))) {
  generateJsonFiles()
    .then((result) => {
      console.log(`[generate-json-files] generated ${result.generated} of ${result.entries} repositories`);
      result.written.forEach((filePath) => console.log(`[generate-json-files] wrote ${filePath}`));
      result.failures.forEach((failure) => console.warn(`[generate-json-files] skipped ${failure.repo}: ${failure.error}`));
    })
    .catch((error) => {
      console.error('[generate-json-files] failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
