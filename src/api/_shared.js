"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOctokit = getOctokit;
exports.getRepoConfig = getRepoConfig;
exports.readRepoFile = readRepoFile;
const rest_1 = require("@octokit/rest");
const auth_app_1 = require("@octokit/auth-app");
const promises_1 = require("fs/promises");
const path_1 = __importDefault(require("path"));
function parseRepoRegistryMarkdown(markdown) {
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
async function readRepoRegistryEntries() {
    const projectDir = process.cwd();
    const registryPath = path_1.default.resolve(projectDir, 'GITHUB-REPOSITORIES.md');
    const fallbackPath = path_1.default.resolve(projectDir, 'repo-registry.json');
    try {
        const markdown = await (0, promises_1.readFile)(registryPath, 'utf8');
        const entries = parseRepoRegistryMarkdown(markdown);
        if (entries.length > 0) {
            return entries;
        }
    }
    catch {
        // fall through to JSON fallback
    }
    try {
        const fallbackText = await (0, promises_1.readFile)(fallbackPath, 'utf8');
        const parsed = JSON.parse(fallbackText);
        return Array.isArray(parsed) ? parsed : parsed.entries || [];
    }
    catch {
        return [];
    }
}
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
async function getRepoConfig() {
    const repo = (process.env.GITHUB_REPO || '').trim();
    if (repo) {
        const [owner, repoName] = repo.split('/').filter(Boolean);
        if (owner && repoName) {
            return { owner, repo: repoName, branch: process.env.GITHUB_BRANCH || 'main' };
        }
    }
    const entries = await readRepoRegistryEntries();
    const entry = entries.find((item) => item.enabled !== false);
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
async function readRepoFile(filePath, branch) {
    const repoConfig = await getRepoConfig();
    if (!repoConfig) {
        throw new Error('GitHub repo is not configured');
    }
    const { owner, repo } = repoConfig;
    const octokit = await getOctokit({ allowUnauthenticated: true });
    const ref = branch || repoConfig.branch || process.env.GITHUB_BRANCH || 'main';
    const response = await octokit.repos.getContent({ owner, repo, path: filePath, ref });
    const item = Array.isArray(response.data) ? response.data[0] : response.data;
    return {
        sha: item?.sha || null,
        content: typeof item?.content === 'string' ? item.content.replace(/\n/g, '') : null,
        downloadUrl: item?.download_url || null
    };
}
