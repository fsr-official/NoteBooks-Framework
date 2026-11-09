import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildGithubRepositoriesArtifact,
  parseRepoRegistryMarkdown,
  type RepoRegistryEntry
} from './github-repositories.js';
import {
  sharedGetJson,
  sharedGetJsonRequired,
  sharedReleaseRequired,
  sharedSetJsonRequired,
  sharedTryAcquireRequired
} from './shared-cache.js';
import { fetchRepositoryManifest } from '../scripts/json-fetch.js';

const REGISTRY_KEY = 'notebooks:runtime-registry:v1';
const CATALOG_KEY = 'notebooks:runtime-catalog:v1';
const LOCK_KEY = 'notebooks:runtime-update-lock:v1';
const REPO_STATE_PREFIX = 'notebooks:repo-state:v1:';
const CHANGE_HISTORY_LIMIT = 100;
const VALID_STREAMS = new Set(['science', 'commerce', 'humanities', 'developers']);
const GITHUB_SHA_PATTERN = /^[a-f0-9]{40}$/i;

export type RuntimeUpdateKind = 'registry' | 'content';

export interface RuntimeUpdateEvent {
  schemaVersion: 1;
  kind: RuntimeUpdateKind;
  repository: string;
  branch: string;
  commitSha: string;
}

export interface CatalogFileChange {
  path: string;
  action: 'added' | 'modified' | 'removed';
  previousSha?: string;
  sha?: string;
}

export interface CatalogChange {
  version: number;
  kind: RuntimeUpdateKind;
  repository: string;
  branch: string;
  commitSha: string;
  streams: string[];
  files: CatalogFileChange[];
}

interface RuntimeRegistryRecord {
  schemaVersion: 1;
  sourceCommitSha?: string;
  sourceSha256?: string;
  entries: RepoRegistryEntry[];
  pendingChange?: CatalogChange;
}

interface RuntimeCatalogRecord {
  version: number;
  changes: CatalogChange[];
}

interface RepositoryState {
  processedSha: string;
  fileShas: Record<string, string>;
  pendingChange?: CatalogChange;
}

function repoStateKey(repository: string, branch: string): string {
  return `${REPO_STATE_PREFIX}${repository.toLowerCase()}:${encodeURIComponent(branch)}`;
}

function normalizeRepository(value: string): string {
  return value.trim().toLowerCase();
}

function validateRegistryEntries(entries: RepoRegistryEntry[]): void {
  if (entries.length === 0) throw new Error('Registry contains no repository entries');
  const seen = new Set<string>();
  for (const entry of entries) {
    const repo = String(entry.repo || '').trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`Invalid repository identifier: ${repo}`);
    const key = normalizeRepository(repo);
    if (seen.has(key)) throw new Error(`Duplicate repository entry: ${repo}`);
    seen.add(key);
    if (!String(entry.branch || 'main').trim()) throw new Error(`Missing branch for ${repo}`);
    if (entry.enabled !== false && !String(entry.stream || '').trim()) {
      throw new Error(`Missing stream for enabled repository ${repo}`);
    }
  }
}

async function fetchTextAtCommit(repository: string, commitSha: string, filePath: string): Promise<string> {
  const url = `https://raw.githubusercontent.com/${repository}/${commitSha}/${filePath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'text/plain', 'User-Agent': 'NoteBooks-runtime-catalog' }
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${repository}/${filePath}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function requireCurrentBranchHead(repository: string, branch: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'NoteBooks-runtime-catalog'
    };
    const token = String(process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(
      `https://api.github.com/repos/${repository}/commits/${encodeURIComponent(branch)}`,
      { headers, signal: controller.signal }
    );
    if (!response.ok) throw new Error(`Unable to resolve ${repository}@${branch}: GitHub returned ${response.status}`);
    const payload = await response.json() as { sha?: unknown };
    const sha = String(payload?.sha || '');
    if (!GITHUB_SHA_PATTERN.test(sha)) throw new Error(`GitHub returned an invalid head SHA for ${repository}@${branch}`);
    return sha.toLowerCase();
  } finally {
    clearTimeout(timeout);
  }
}

function assertEvent(event: RuntimeUpdateEvent): void {
  if (event.schemaVersion !== 1) throw new Error('Unsupported update schema version');
  if (event.kind !== 'registry' && event.kind !== 'content') throw new Error('Unsupported update kind');
  if (!/^[\w.-]+\/[\w.-]+$/.test(event.repository)) throw new Error('Invalid repository identifier');
  if (!event.branch || event.branch.length > 200 || event.branch.startsWith('-')) throw new Error('Invalid branch');
  if (!GITHUB_SHA_PATTERN.test(event.commitSha)) throw new Error('Invalid commit SHA');
}

async function readInitialRegistry(): Promise<RepoRegistryEntry[]> {
  const artifactPath = path.resolve(process.cwd(), 'public', 'json', 'github-repos.json');
  const text = await fs.readFile(artifactPath, 'utf8');
  const artifact = JSON.parse(text);
  if (artifact?.schemaVersion !== 1 || !Array.isArray(artifact.entries)) {
    throw new Error('No valid registry bootstrap artifact is available');
  }
  const entries = artifact.entries as RepoRegistryEntry[];
  validateRegistryEntries(entries);
  return entries;
}

async function readRegistryRecord(required: boolean): Promise<RuntimeRegistryRecord | null> {
  const record = required
    ? await sharedGetJsonRequired<RuntimeRegistryRecord>(REGISTRY_KEY)
    : await sharedGetJson<RuntimeRegistryRecord>(REGISTRY_KEY);
  if (!record || record.schemaVersion !== 1 || !Array.isArray(record.entries)) return null;
  return record;
}

export async function readRuntimeRepoRegistry(): Promise<RepoRegistryEntry[] | null> {
  const record = await readRegistryRecord(false);
  if (!record) return null;
  return record.entries;
}

export async function isRuntimeRegistryActive(): Promise<boolean> {
  return (await readRegistryRecord(false)) !== null;
}

export async function getRuntimeCatalog(since = 0): Promise<{
  version: number;
  changes: CatalogChange[];
  reset: boolean;
}> {
  const record = await sharedGetJsonRequired<RuntimeCatalogRecord>(CATALOG_KEY);
  const catalog = record && Number.isInteger(record.version) && Array.isArray(record.changes)
    ? record
    : { version: 0, changes: [] };
  const earliest = catalog.changes[0]?.version ?? catalog.version + 1;
  const reset = since > 0 && since < earliest - 1;
  return {
    version: catalog.version,
    changes: reset ? [] : catalog.changes.filter((change) => change.version > since),
    reset
  };
}

async function publishCatalogChange(catalog: RuntimeCatalogRecord, change: CatalogChange): Promise<number> {
  const existing = catalog.changes.find((item) =>
    item.kind === change.kind &&
    item.repository.toLowerCase() === change.repository.toLowerCase() &&
    item.commitSha === change.commitSha
  );
  if (existing) return existing.version;
  const published = { ...change, version: catalog.version + 1 };
  catalog.version = published.version;
  catalog.changes = [...catalog.changes, published].slice(-CHANGE_HISTORY_LIMIT);
  await sharedSetJsonRequired(CATALOG_KEY, catalog);
  return published.version;
}

function fileShaMap(files: Array<{ path?: string; sha?: unknown }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const file of files) {
    const filePath = String(file.path || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
    const sha = String(file.sha || '').toLowerCase();
    if (!filePath) continue;
    if (!GITHUB_SHA_PATTERN.test(sha)) {
      throw new Error(`files.json is missing a valid Git blob SHA for ${filePath}`);
    }
    result[filePath] = sha;
  }
  return result;
}

function diffFileShas(previous: Record<string, string>, next: Record<string, string>): CatalogFileChange[] {
  const changes: CatalogFileChange[] = [];
  for (const [filePath, sha] of Object.entries(next)) {
    const previousSha = previous[filePath];
    if (!previousSha) changes.push({ path: filePath, action: 'added', sha });
    else if (previousSha !== sha) changes.push({ path: filePath, action: 'modified', previousSha, sha });
  }
  for (const [filePath, sha] of Object.entries(previous)) {
    if (!next[filePath]) changes.push({ path: filePath, action: 'removed', previousSha: sha });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

async function readBootstrapFileShas(entry: RepoRegistryEntry): Promise<Record<string, string>> {
  const stream = String(entry.stream || '').toLowerCase();
  if (!VALID_STREAMS.has(stream)) return {};
  const filePath = path.resolve(process.cwd(), 'public', 'json', `${stream}-tree.json`);
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    const result: Record<string, string> = {};
    const visit = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if (
        node.type === 'file' &&
        normalizeRepository(String(node.repo || '')) === normalizeRepository(entry.repo) &&
        typeof node.sha === 'string' &&
        GITHUB_SHA_PATTERN.test(node.sha)
      ) {
        const pathValue = String(node.repoPath || node.path || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
        if (pathValue) result[pathValue] = node.sha.toLowerCase();
      }
      if (Array.isArray(node.children)) node.children.forEach(visit);
      if (Array.isArray(node.repos)) node.repos.forEach((repo: any) => visit(repo.tree));
    };
    visit(parsed.root || parsed);
    return result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.warn(`[runtime-catalog] bootstrap SHA snapshot unavailable for ${entry.repo}:`, error instanceof Error ? error.message : error);
    }
    return {};
  }
}

async function acquireUpdateLock(): Promise<string> {
  const owner = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  if (!(await sharedTryAcquireRequired(LOCK_KEY, owner, 60))) {
    throw new Error('Another repository update is being processed; retry this notification');
  }
  return owner;
}

export async function processRuntimeUpdate(event: RuntimeUpdateEvent): Promise<{
  accepted: boolean;
  superseded: boolean;
  version: number;
  changed: boolean;
  filesChanged: number;
  streams: string[];
}> {
  assertEvent(event);
  const lockOwner = await acquireUpdateLock();
  try {
    const reportedSha = event.commitSha.toLowerCase();
    const branchHead = await requireCurrentBranchHead(event.repository, event.branch);
    if (event.kind === 'content' && branchHead !== reportedSha) {
      const currentCatalog = await sharedGetJsonRequired<RuntimeCatalogRecord>(CATALOG_KEY);
      return {
        accepted: true,
        superseded: true,
        version: currentCatalog?.version || 0,
        changed: false,
        filesChanged: 0,
        streams: []
      };
    }
    const commitSha = event.kind === 'registry' ? branchHead : reportedSha;

    const currentRegistry = await readRegistryRecord(true);
    const priorEntries = currentRegistry?.entries || await readInitialRegistry();
    const priorCatalog = await sharedGetJsonRequired<RuntimeCatalogRecord>(CATALOG_KEY);
    const catalog: RuntimeCatalogRecord = priorCatalog && Number.isInteger(priorCatalog.version) && Array.isArray(priorCatalog.changes)
      ? priorCatalog
      : { version: 0, changes: [] };

    if (event.kind === 'registry') {
      const expectedRepo = String(process.env.NOTEBOOKS_DOCUMENTS_REPO || 'fsr-official/NoteBooks-Documents').toLowerCase();
      const expectedBranch = String(process.env.NOTEBOOKS_DOCUMENTS_BRANCH || 'main');
      if (normalizeRepository(event.repository) !== expectedRepo || event.branch !== expectedBranch) {
        throw new Error('Registry update came from an untrusted documents repository or branch');
      }
      if (currentRegistry?.sourceCommitSha === commitSha) {
        if (currentRegistry.pendingChange) {
          const version = await publishCatalogChange(catalog, currentRegistry.pendingChange);
          const { pendingChange: _pendingChange, ...activeRecord } = currentRegistry;
          await sharedSetJsonRequired(REGISTRY_KEY, activeRecord);
          return {
            accepted: true,
            superseded: false,
            version,
            changed: true,
            filesChanged: 0,
            streams: currentRegistry.pendingChange.streams
          };
        }
        return { accepted: true, superseded: false, version: catalog.version, changed: false, filesChanged: 0, streams: [] };
      }

      const markdown = await fetchTextAtCommit(event.repository, commitSha, 'GITHUB-REPOSITORIES.md');
      const entries = parseRepoRegistryMarkdown(markdown);
      validateRegistryEntries(entries);
      const previousByRepo = new Map(priorEntries.map((entry) => [normalizeRepository(entry.repo), entry]));
      const mergedEntries = entries.map((entry) => {
        const previous = previousByRepo.get(normalizeRepository(entry.repo));
        return previous && previous.branch === entry.branch
          ? { ...entry, ...(previous.commitSha ? { commitSha: previous.commitSha } : {}) }
          : entry;
      });
      const artifact = buildGithubRepositoriesArtifact(markdown);
      const registryRecord: RuntimeRegistryRecord = {
        schemaVersion: 1,
        sourceCommitSha: commitSha,
        sourceSha256: artifact.sourceSha256,
        entries: mergedEntries
      };
      const changed = JSON.stringify(priorEntries) !== JSON.stringify(mergedEntries);
      const streams = [...new Set([...priorEntries, ...mergedEntries].map((entry) => String(entry.stream || '').toLowerCase()).filter(Boolean))].sort();
      const change: CatalogChange = {
        version: catalog.version + 1,
        kind: 'registry',
        repository: event.repository,
        branch: event.branch,
        commitSha,
        streams,
        files: []
      };
      if (changed) registryRecord.pendingChange = change;
      await sharedSetJsonRequired(REGISTRY_KEY, registryRecord);
      let version = catalog.version;
      if (changed) {
        version = await publishCatalogChange(catalog, change);
        const { pendingChange: _pendingChange, ...activeRecord } = registryRecord;
        await sharedSetJsonRequired(REGISTRY_KEY, activeRecord);
      }
      return {
        accepted: true,
        superseded: false,
        version,
        changed,
        filesChanged: 0,
        streams
      };
    }

    const registryEntry = priorEntries.find((entry) =>
      entry.enabled !== false &&
      normalizeRepository(entry.repo) === normalizeRepository(event.repository) &&
      String(entry.branch || 'main') === event.branch
    );
    if (!registryEntry) throw new Error('Repository and branch are not enabled in the active registry');
    const stream = String(registryEntry.stream || '').trim().toLowerCase();
    if (!VALID_STREAMS.has(stream)) throw new Error('Only curriculum content repositories can send content updates');

    const stateKey = repoStateKey(event.repository, event.branch);
    const priorRepoState = await sharedGetJsonRequired<RepositoryState>(stateKey);
    if (priorRepoState?.processedSha === commitSha) {
      if (priorRepoState.pendingChange) {
        const version = await publishCatalogChange(catalog, priorRepoState.pendingChange);
        await sharedSetJsonRequired(stateKey, {
          processedSha: priorRepoState.processedSha,
          fileShas: priorRepoState.fileShas
        } satisfies RepositoryState);
        return {
          accepted: true,
          superseded: false,
          version,
          changed: true,
          filesChanged: priorRepoState.pendingChange.files.length,
          streams: priorRepoState.pendingChange.streams
        };
      }
      return { accepted: true, superseded: false, version: catalog.version, changed: false, filesChanged: 0, streams: [stream] };
    }

    const manifest = await fetchRepositoryManifest({ ...registryEntry, commitSha });
    const currentFiles = fileShaMap(manifest.files);
    const previousFiles = priorRepoState?.fileShas || await readBootstrapFileShas(registryEntry);
    const files = priorRepoState || Object.keys(previousFiles).length > 0
      ? diffFileShas(previousFiles, currentFiles)
      : [];
    const repoState: RepositoryState = { processedSha: commitSha, fileShas: currentFiles };

    let version = catalog.version;
    const updatedEntries = priorEntries.map((entry) =>
      normalizeRepository(entry.repo) === normalizeRepository(event.repository) &&
      String(entry.branch || 'main') === event.branch
        ? { ...entry, commitSha }
        : entry
    );
    if (files.length > 0) {
      const change: CatalogChange = {
        version: catalog.version + 1,
        kind: 'content',
        repository: event.repository,
        branch: event.branch,
        commitSha,
        streams: [stream],
        files
      };
      await sharedSetJsonRequired(REGISTRY_KEY, {
        schemaVersion: 1,
        sourceCommitSha: currentRegistry?.sourceCommitSha,
        sourceSha256: currentRegistry?.sourceSha256,
        entries: updatedEntries
      } satisfies RuntimeRegistryRecord);
      await sharedSetJsonRequired(stateKey, { ...repoState, pendingChange: change } satisfies RepositoryState);
      version = await publishCatalogChange(catalog, change);
      await sharedSetJsonRequired(stateKey, repoState);
    }
    if (files.length === 0) {
      await sharedSetJsonRequired(REGISTRY_KEY, {
        schemaVersion: 1,
        sourceCommitSha: currentRegistry?.sourceCommitSha,
        sourceSha256: currentRegistry?.sourceSha256,
        entries: updatedEntries
      } satisfies RuntimeRegistryRecord);
    }
    await sharedSetJsonRequired(stateKey, repoState);
    return { accepted: true, superseded: false, version, changed: files.length > 0, filesChanged: files.length, streams: [stream] };
  } finally {
    await sharedReleaseRequired(LOCK_KEY, lockOwner);
  }
}
