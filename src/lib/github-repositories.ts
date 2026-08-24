import { createHash } from 'node:crypto';

export interface RepoRegistryEntry {
  name: string;
  stream?: string;
  repo: string;
  branch?: string;
  root?: string;
  enabled?: boolean;
  priority?: number;
  pages?: boolean | string;
}

export interface GithubRepositoriesArtifact {
  schemaVersion: 1;
  sourceFile: 'GITHUB-REPOSITORIES.md';
  sourceSha256: string;
  entries: RepoRegistryEntry[];
}

function parseCell(value: string): string {
  return value.trim();
}

export function parseRepoRegistryMarkdown(markdown: string): RepoRegistryEntry[] {
  const tableLines = String(markdown || '')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'));
  if (tableLines.length < 2) return [];

  const headers = tableLines[0]
    .split('|')
    .slice(1, -1)
    .map((cell) => parseCell(cell).toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);
  const valueOf = (cells: string[], name: string) => {
    const index = indexOf(name);
    return index >= 0 ? parseCell(cells[index] || '') : '';
  };

  return tableLines.slice(2)
    .map((line) => line.split('|').slice(1, -1).map(parseCell))
    .filter((cells) => cells.length >= 2 && valueOf(cells, 'name') && valueOf(cells, 'repo'))
    .map((cells) => {
      const priorityText = valueOf(cells, 'priority');
      const pagesText = valueOf(cells, 'pages');
      return {
        name: valueOf(cells, 'name'),
        stream: valueOf(cells, 'stream').toLowerCase() || undefined,
        repo: valueOf(cells, 'repo'),
        branch: valueOf(cells, 'branch') || undefined,
        root: valueOf(cells, 'root'),
        enabled: valueOf(cells, 'enabled').toLowerCase() !== 'false',
        priority: Number(priorityText),
        pages: pagesText ? pagesText.toLowerCase() === 'true' : false
      } satisfies RepoRegistryEntry;
    })
    .filter((entry) => !Number.isNaN(entry.priority));
}

export function hashGithubRepositoriesSource(markdown: string): string {
  return createHash('sha256').update(markdown, 'utf8').digest('hex');
}

export function buildGithubRepositoriesArtifact(markdown: string): GithubRepositoriesArtifact {
  return {
    schemaVersion: 1,
    sourceFile: 'GITHUB-REPOSITORIES.md',
    sourceSha256: hashGithubRepositoriesSource(markdown),
    entries: parseRepoRegistryMarkdown(markdown)
  };
}
