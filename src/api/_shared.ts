import { Octokit } from '@octokit/rest';
import { readFile } from 'fs/promises';
import path from 'path';

interface RepoRegistryEntryLike {
  name?: string;
  repo?: string;
  branch?: string;
  root?: string;
  enabled?: boolean;
  priority?: number;
}

function parseRepoRegistryMarkdown(markdown: string): RepoRegistryEntryLike[] {
  const lines = String(markdown || '').split(/\r?\n/);
  const tableLines = lines.filter((line) => line.trim().startsWith('|'));
  if (tableLines.length < 2) {
    return [];
  }

  return tableLines.slice(2)
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 6 && cells[0] && cells[1])
    .map((cells) => {
      const [name, repo, branch, root, enabled, priority] = cells;
      return {
        name,
        repo,
        branch,
        root,
        enabled: enabled.toLowerCase() !== 'false',
        priority: Number(priority)
      };
    })
    .filter((entry) => !Number.isNaN(entry.priority));
}

async function readRepoRegistryEntries(): Promise<RepoRegistryEntryLike[]> {
  const projectDir = process.cwd();
  const registryPath = path.resolve(projectDir, 'GITHUB-REPOSITORIES.md');
  const fallbackPath = path.resolve(projectDir, 'repo-registry.json');

  try {
    const markdown = await readFile(registryPath, 'utf8');
    const entries = parseRepoRegistryMarkdown(markdown);
    if (entries.length > 0) {
      return entries;
    }
  } catch {
    // fall through to JSON fallback
  }

  try {
    const fallbackText = await readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(fallbackText);
    return Array.isArray(parsed) ? parsed : parsed.entries || [];
  } catch {
    return [];
  }
}

export async function getOctokit(options: { allowUnauthenticated?: boolean } = {}) {
  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
  if (token) {
    return new Octokit({ auth: token });
  }

  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();

  if (appId && privateKey && installationId) {
    const { createAppAuth } = await import('@octokit/auth-app');
    const appAuth = createAppAuth({
      appId: Number(appId),
      privateKey,
      installationId: Number(installationId)
    });

    const auth = await appAuth({ type: 'installation' });
    return new Octokit({ auth: auth.token });
  }

  if (options.allowUnauthenticated !== false) {
    return new Octokit();
  }

  throw new Error('GitHub auth is not configured. Set GITHUB_TOKEN, GITHUB_PAT, or GitHub App credentials.');
}

export async function getRepoConfig(): Promise<{ owner: string; repo: string; branch?: string; root?: string } | null> {
  const repo = (process.env.GITHUB_REPO || '').trim();
  if (repo) {
    const [owner, repoName] = repo.split('/').filter(Boolean);
    if (owner && repoName) {
      return { owner, repo: repoName, branch: process.env.GITHUB_BRANCH || 'main' };
    }
  }

  const entries = (await readRepoRegistryEntries())
    .filter((item) => item.enabled !== false && item.repo)
    .sort((a, b) => {
      const aPriority = Number.isFinite(Number(a.priority)) ? Number(a.priority) : Number.MAX_SAFE_INTEGER;
      const bPriority = Number.isFinite(Number(b.priority)) ? Number(b.priority) : Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  const entry = entries[0];
  if (!entry?.repo) {
    return null;
  }

  const [owner, repoName] = String(entry.repo).split('/').filter(Boolean);
  if (!owner || !repoName) {
    return null;
  }

  return {
    owner,
    repo: repoName,
    branch: entry.branch || process.env.GITHUB_BRANCH || 'main',
    root: entry.root || ''
  };
}

export async function readRepoFile(filePath: string, branch?: string) {
  const repoConfig = await getRepoConfig();
  if (!repoConfig) {
    throw new Error('GitHub repo is not configured');
  }
  const { owner, repo } = repoConfig;
  const octokit = await getOctokit({ allowUnauthenticated: true });
  const ref = branch || repoConfig.branch || process.env.GITHUB_BRANCH || 'main';

  const response = await octokit.repos.getContent({ owner, repo, path: filePath, ref });
  const item = Array.isArray(response.data) ? response.data[0] : (response.data as any);

  return {
    sha: item?.sha || null,
    content: typeof item?.content === 'string' ? item.content.replace(/\n/g, '') : null,
    downloadUrl: item?.download_url || null
  };
}

export function getSubjectRepo(subject?: string) {
  const raw = process.env.SUBJECT_REPOS || '';
  if (!raw || !subject) return null;
  const map = raw.split(',').map(s => s.trim()).filter(Boolean).reduce((acc: Record<string,string>, pair) => {
    const [k,v] = pair.split('=').map(x => (x||'').trim());
    if (k && v) acc[k] = v;
    return acc;
  }, {} as Record<string,string>);
  const repo = map[subject];
  if (!repo) return null;
  const parts = repo.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}
