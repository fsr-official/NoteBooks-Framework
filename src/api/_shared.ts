import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

export async function getOctokit(options: { allowUnauthenticated?: boolean } = {}) {
  const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
  if (token) {
    return new Octokit({ auth: token });
  }

  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();

  if (appId && privateKey && installationId) {
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

export function getRepoConfig(): { owner: string; repo: string } | null {
  const repo = (process.env.GITHUB_REPO || '').trim();
  if (!repo) {
    return null;
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    return null;
  }

  return { owner, repo: repoName };
}

export async function readRepoFile(filePath: string, branch?: string) {
  const { owner, repo } = getRepoConfig();
  const octokit = await getOctokit({ allowUnauthenticated: true });
  const ref = branch || process.env.GITHUB_BRANCH || 'main';

  const response = await octokit.repos.getContent({ owner, repo, path: filePath, ref });
  const item = Array.isArray(response.data) ? response.data[0] : (response.data as any);

  return {
    sha: item?.sha || null,
    content: typeof item?.content === 'string' ? item.content.replace(/\n/g, '') : null,
    downloadUrl: item?.download_url || null
  };
}
