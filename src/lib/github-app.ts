import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

function getAppConfig() {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
  if (!appId || !privateKey) return null;
  return { appId: Number(appId), privateKey };
}

export async function getAppOctokit(): Promise<Octokit> {
  const cfg = getAppConfig();
  if (!cfg) throw new Error('GitHub App not configured (GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY)');
  const auth = createAppAuth({ appId: cfg.appId, privateKey: cfg.privateKey });
  const appAuth = await auth({ type: 'app' });
  return new Octokit({ auth: appAuth.token });
}

export async function getInstallationIdForRepo(owner: string, repo: string): Promise<number> {
  const appOctokit = await getAppOctokit();
  // This endpoint requires app authentication
  const resp = await appOctokit.apps.getRepoInstallation({ owner, repo });
  return Number((resp.data as any).id);
}

export async function getInstallationOctokitForRepo(owner: string, repo: string): Promise<Octokit> {
  const cfg = getAppConfig();
  if (!cfg) throw new Error('GitHub App not configured');
  const installationId = await getInstallationIdForRepo(owner, repo);
  const auth = createAppAuth({ appId: cfg.appId, privateKey: cfg.privateKey, installationId });
  const installationAuth = await auth({ type: 'installation' });
  return new Octokit({ auth: installationAuth.token });
}

export async function createDiscussionForRepo(owner: string, repo: string, title: string, body: string, categoryName = 'Community') {
  const octokit = await getInstallationOctokitForRepo(owner, repo);
  const discussion = await octokit.rest.discussions.create({ owner, repo, title, body, category_name: categoryName as any });
  return discussion.data;
}

export async function createPrFromContent(owner: string, repo: string, baseBranch: string, branchName: string, filePath: string, contentBase64: string, commitMessage: string, prTitle: string, prBody: string) {
  const octokit = await getInstallationOctokitForRepo(owner, repo);
  // Create ref
  const mainRef = await octokit.git.getRef({ owner, repo, ref: `heads/${baseBranch}` });
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: mainRef.data.object.sha });
  // Create file
  await octokit.repos.createOrUpdateFileContents({ owner, repo, path: filePath, message: commitMessage, content: contentBase64, branch: branchName });
  // Create PR
  const pr = await octokit.pulls.create({ owner, repo, title: prTitle, body: prBody, head: branchName, base: baseBranch });
  return pr.data;
}

export async function mergePr(owner: string, repo: string, prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge') {
  const octokit = await getInstallationOctokitForRepo(owner, repo);
  const res = await octokit.pulls.merge({ owner, repo, pull_number: prNumber, merge_method: mergeMethod });
  return res.data;
}

export default {
  getAppOctokit,
  getInstallationOctokitForRepo,
  createDiscussionForRepo,
  createPrFromContent,
  mergePr
};
