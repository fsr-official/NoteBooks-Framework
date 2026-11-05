import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildGithubRepositoriesArtifact } from '../lib/github-repositories.js';

export interface GenerateGithubRepositoriesOptions {
  cwd?: string;
  sourceFile?: string;
  sourceUrl?: string;
  outputFile?: string;
}

async function writeJsonAtomically(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(temporaryPath, filePath);
}

export async function generateGithubRepositories(options: GenerateGithubRepositoriesOptions = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const outputPath = path.resolve(cwd, options.outputFile || 'public/json/github-repos.json');
  let sourcePath = '';
  let markdown = '';

  if (options.sourceFile || process.env.REPO_REGISTRY_PATH) {
    sourcePath = path.resolve(cwd, options.sourceFile || process.env.REPO_REGISTRY_PATH || 'GITHUB-REPOSITORIES.md');
    markdown = await fs.readFile(sourcePath, 'utf8');
  } else {
    const compatibilityPath = path.resolve(cwd, 'GITHUB-REPOSITORIES.md');
    try {
      markdown = await fs.readFile(compatibilityPath, 'utf8');
      sourcePath = compatibilityPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT') throw error;
      const repo = String(process.env.NOTEBOOKS_DOCUMENTS_REPO || 'fsr-official/NoteBooks-Documents');
      const branch = String(process.env.NOTEBOOKS_DOCUMENTS_BRANCH || 'main');
      const sourceUrl = options.sourceUrl || process.env.NOTEBOOKS_DOCUMENTS_REGISTRY_URL ||
        `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(branch)}/GITHUB-REPOSITORIES.md`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(sourceUrl, {
          signal: controller.signal,
          headers: { Accept: 'text/plain', 'User-Agent': 'NoteBooks-registry-generator' }
        });
        if (!response.ok) throw new Error(`Registry fetch failed with ${response.status} ${response.statusText}`);
        markdown = await response.text();
        sourcePath = sourceUrl;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  const artifact = buildGithubRepositoriesArtifact(markdown);

  if (artifact.entries.length === 0) {
    throw new Error(`No repository entries found in ${sourcePath}`);
  }

  await writeJsonAtomically(outputPath, artifact);
  return {
    sourcePath,
    outputPath,
    entries: artifact.entries.length,
    sourceSha256: artifact.sourceSha256,
    artifact
  };
}

if (process.argv[1] && /generate-github-repos\.(?:ts|js)$/.test(path.basename(process.argv[1]))) {
  generateGithubRepositories()
    .then((result) => {
      console.log(`[generate-github-repos] generated ${result.entries} entries from ${result.sourcePath}`);
      console.log(`[generate-github-repos] wrote ${result.outputPath}`);
      console.log(`[generate-github-repos] source sha256 ${result.sourceSha256}`);
    })
    .catch((error) => {
      console.error('[generate-github-repos] failed:', error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
