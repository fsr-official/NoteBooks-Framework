import fs from 'node:fs';
import path from 'node:path';
import { generateGithubRepositories } from '../scripts/generate-github-repos.js';
import { generateJsonFiles } from '../scripts/generate-json-files.js';

export function applyDevelopmentDefaults(): void {
  if (process.env.NODE_ENV === 'production') return;
  const envDefaults: Record<string, string> = {
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production',
    GITHUB_REPO: process.env.GITHUB_REPO || 'fsr-science/NCERT-Science',
    GITHUB_COMMUNITY_REPO: process.env.GITHUB_COMMUNITY_REPO || 'fsr-official/NoteBooks-Community',
    GITHUB_ISSUES_REPO: process.env.GITHUB_ISSUES_REPO || 'fsr-official/NoteBooks-Issues',
    WORKSPACE: process.env.WORKSPACE || 'NoteBooks-Framework',
  };
  Object.entries(envDefaults).forEach(([key, value]) => {
    if (!process.env[key]) process.env[key] = value;
  });
}

export async function hasValidGeneratedArtifacts(projectDir: string): Promise<boolean> {
  const candidates = [
    path.join(projectDir, 'public', 'json', 'github-repos.json'),
    path.join(projectDir, 'public', 'json', 'repo-registry.json'),
    path.join(projectDir, 'public', 'json', 'science-tree.json'),
    path.join(projectDir, 'public', 'json', 'commerce-tree.json'),
    path.join(projectDir, 'public', 'json', 'humanities-tree.json')
  ];
  try {
    const githubArtifact = JSON.parse(await fs.promises.readFile(candidates[0], 'utf8'));
    if (githubArtifact?.schemaVersion !== 1 || githubArtifact?.sourceFile !== 'GITHUB-REPOSITORIES.md' || !Array.isArray(githubArtifact?.entries) || githubArtifact.entries.length === 0) return false;
    for (const candidate of candidates.slice(1)) {
      const parsed = JSON.parse(await fs.promises.readFile(candidate, 'utf8'));
      if (!parsed || typeof parsed !== 'object') return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function prepareGeneratedArtifacts(projectDir: string): Promise<void> {
  // Vercel/serverless production must never perform remote repository generation at
  // request or cold-start time. The build command owns artifact generation.
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    if (!(await hasValidGeneratedArtifacts(projectDir))) {
      throw new Error('Generated stream artifacts are missing from the production build');
    }
    return;
  }
  try {
    await generateGithubRepositories({ cwd: projectDir });
    const result = await generateJsonFiles({ cwd: projectDir });
    console.log(`[startup] generated JSON artifacts for ${result.generated} of ${result.entries} repositories`);
    result.failures.forEach((failure) => console.warn(`[startup] skipped ${failure.repo}: ${failure.error}`));
  } catch (error) {
    if (await hasValidGeneratedArtifacts(projectDir)) {
      console.warn('[startup] JSON generation failed; serving existing generated artifacts as stale data:', error instanceof Error ? error.message : error);
      return;
    }
    throw error;
  }
}
