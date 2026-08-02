"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOctokit = getOctokit;
exports.getRepoConfig = getRepoConfig;
exports.readRepoFile = readRepoFile;
const rest_1 = require("@octokit/rest");
const auth_app_1 = require("@octokit/auth-app");
async function getOctokit(options = {}) {
    const token = (process.env.GITHUB_TOKEN || process.env.GITHUB_PAT || '').trim();
    if (token) {
        return new rest_1.Octokit({ auth: token });
    }
    const appId = process.env.GITHUB_APP_ID?.trim();
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim();
    const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
    if (appId && privateKey && installationId) {
        const appAuth = (0, auth_app_1.createAppAuth)({
            appId: Number(appId),
            privateKey,
            installationId: Number(installationId)
        });
        const auth = await appAuth({ type: 'installation' });
        return new rest_1.Octokit({ auth: auth.token });
    }
    if (options.allowUnauthenticated !== false) {
        return new rest_1.Octokit();
    }
    throw new Error('GitHub auth is not configured. Set GITHUB_TOKEN, GITHUB_PAT, or GitHub App credentials.');
}
function getRepoConfig() {
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
async function readRepoFile(filePath, branch) {
    const { owner, repo } = getRepoConfig();
    const octokit = await getOctokit({ allowUnauthenticated: true });
    const ref = branch || process.env.GITHUB_BRANCH || 'main';
    const response = await octokit.repos.getContent({ owner, repo, path: filePath, ref });
    const item = Array.isArray(response.data) ? response.data[0] : response.data;
    return {
        sha: item?.sha || null,
        content: typeof item?.content === 'string' ? item.content.replace(/\n/g, '') : null,
        downloadUrl: item?.download_url || null
    };
}
