import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildGithubRepositoriesArtifact } from '../lib/github-repositories.js';

export interface GenerateGithubRepositoriesOptions {
  cwd?: string;
  sourceFile?: string;
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
  const sourcePath = path.resolve(cwd, options.sourceFile || 'GITHUB-REPOSITORIES.md');
  const outputPath = path.resolve(cwd, options.outputFile || 'public/json/github-repos.json');
  const markdown = await fs.readFile(sourcePath, 'utf8');
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
