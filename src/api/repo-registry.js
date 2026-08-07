"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseRepoRegistryMarkdown = parseRepoRegistryMarkdown;
exports.buildRegistryTree = buildRegistryTree;
exports.loadRepoRegistry = loadRepoRegistry;
exports.default = handler;
const pages_fetch_1 = require("./pages-fetch");
function normalizeRepoEntry(entry) {
    return {
        name: entry.name || entry.repo,
        repo: entry.repo,
        branch: entry.branch || process.env.GITHUB_BRANCH || 'main',
        root: entry.root || '',
        enabled: entry.enabled !== false,
        priority: typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER,
        pages: entry.pages
    };
}
function parseRepoRegistryMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const tableLines = lines.filter((line) => line.trim().startsWith('|'));
    if (tableLines.length < 2) {
        return [];
    }
    const rows = tableLines.slice(2);
    return rows
        .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
        .filter((cells) => cells.length >= 6 && cells[0] && cells[1])
        .map((cells) => {
        const [name, repo, branch, root, enabled, priority, pages] = cells;
        return {
            name,
            repo,
            branch,
            root,
            enabled: enabled.toLowerCase() !== 'false',
            priority: Number(priority),
            pages: pages ? pages.toLowerCase() === 'true' : false
        };
    })
        .filter((entry) => !Number.isNaN(entry.priority));
}
function buildTreeNode(name, path, children = []) {
    return { type: 'folder', name, path, children };
}
function normalizePath(input) {
    return input.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}
function stripRootPrefix(path, root) {
    const normalizedRoot = normalizePath(root);
    const normalizedPath = normalizePath(path);
    if (!normalizedRoot)
        return normalizedPath;
    return normalizedPath.startsWith(`${normalizedRoot}/`) ? normalizedPath.slice(normalizedRoot.length + 1) : normalizedPath;
}
function prefixRepoPaths(node, prefix, repo, branch, priority) {
    const normalizedPath = normalizePath(node.path || '');
    const prefixedPath = normalizedPath ? `${prefix}/${normalizedPath}` : prefix;
    const repoPath = normalizedPath || undefined;
    const children = Array.isArray(node.children)
        ? node.children.map((child) => prefixRepoPaths(child, prefixedPath, repo, branch, priority))
        : undefined;
    const result = {
        ...node,
        path: prefixedPath,
        repo,
        branch,
        priority,
        repoPath,
        isCanonical: true,
        children
    };
    return result;
}
async function buildRegistryTree(entries) {
    const normalizedEntries = entries
        .map(normalizeRepoEntry)
        .filter((entry) => entry.enabled)
        .sort((a, b) => {
        const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
        const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
        if (aPriority !== bPriority)
            return aPriority - bPriority;
        return String(a.name).localeCompare(String(b.name));
    });
    const rootChildren = [];
    for (const entry of normalizedEntries) {
        const [owner, repoName] = entry.repo.split('/');
        if (!owner || !repoName)
            continue;
        const repoNode = {
            type: 'folder',
            name: entry.name || repoName,
            path: entry.name || repoName,
            repo: entry.repo,
            children: []
        };
        try {
            const priority = typeof entry.priority === 'number' ? entry.priority : Number.MAX_SAFE_INTEGER;
            const usePagesPath = entry.pages === true || entry.pages === 'true';
            const pagesBaseUrl = usePagesPath ? (0, pages_fetch_1.resolvePagesBaseUrl)(entry) : '';
            let children = [];
            if (usePagesPath && pagesBaseUrl) {
                try {
                    console.log(`[repo-registry] Using Pages read-path for ${entry.repo}`);
                    const pagesChildren = await (0, pages_fetch_1.fetchPagesManifest)(pagesBaseUrl, entry.name || repoName);
                    children = pagesChildren.map((child) => prefixRepoPaths(child, entry.name || repoName, entry.repo, entry.branch || 'main', priority));
                }
                catch (error) {
                    console.warn(`[repo-registry] Pages manifest failed for ${entry.repo}; skipping without GitHub API recursion:`, error);
                }
            }
            else {
                console.warn(`[repo-registry] Skipping ${entry.repo}; pages: true is required for the non-recursive read path.`);
            }
            repoNode.children = children;
            rootChildren.push(repoNode);
        }
        catch (error) {
            console.warn(`Skipping repo ${entry.repo}:`, error);
        }
    }
    const tree = {
        type: 'folder',
        name: 'root',
        children: rootChildren
    };
    resolveDuplicateFiles(tree);
    return tree;
}
function resolveDuplicateFiles(root) {
    const filesByRepoPath = new Map();
    function collect(node) {
        if (!node)
            return;
        if (node.type === 'file' && node.repoPath) {
            const key = normalizePath(node.repoPath);
            const existing = filesByRepoPath.get(key) || [];
            existing.push(node);
            filesByRepoPath.set(key, existing);
        }
        if (Array.isArray(node.children)) {
            node.children.forEach(collect);
        }
    }
    collect(root);
    for (const [repoPath, nodes] of filesByRepoPath.entries()) {
        if (nodes.length <= 1) {
            nodes[0].isCanonical = true;
            continue;
        }
        nodes.sort((a, b) => {
            const aPriority = typeof a.priority === 'number' ? a.priority : Number.MAX_SAFE_INTEGER;
            const bPriority = typeof b.priority === 'number' ? b.priority : Number.MAX_SAFE_INTEGER;
            if (aPriority !== bPriority)
                return aPriority - bPriority;
            return String(a.repo || '').localeCompare(String(b.repo || ''));
        });
        const canonical = nodes[0];
        canonical.isCanonical = true;
        for (const shadowed of nodes.slice(1)) {
            shadowed.isCanonical = false;
            shadowed.shadowedBy = canonical.path;
        }
    }
}
async function loadRepoRegistry() {
    const registryPath = process.env.REPO_REGISTRY_PATH || 'GITHUB-REPOSITORIES.md';
    const fs = await import('fs/promises');
    const path = await import('path');
    const filePath = path.resolve(process.cwd(), registryPath);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        if (data.trim().startsWith('|')) {
            return parseRepoRegistryMarkdown(data);
        }
        if (data.trim().startsWith('{')) {
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : parsed.entries || [];
        }
        return parseRepoRegistryMarkdown(data);
    }
    catch (error) {
        if (error?.code === 'ENOENT') {
            const fallbackPath = path.resolve(process.cwd(), 'repo-registry.json');
            try {
                const fallbackData = await fs.readFile(fallbackPath, 'utf8');
                const parsed = JSON.parse(fallbackData);
                console.warn('[api/repo-registry] repo-registry.json is deprecated; please migrate to GITHUB-REPOSITORIES.md');
                return Array.isArray(parsed) ? parsed : parsed.entries || [];
            }
            catch {
                return [];
            }
        }
        throw error;
    }
}
const refreshCache = new Map();
let buildInProgress = false;
let lastSuccessfulBuild = null;
function getRefreshCacheKey(req) {
    return `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`;
}
async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const manifestPath = path.resolve(process.cwd(), 'files.json');
        try {
            const manifestText = await fs.readFile(manifestPath, 'utf8');
            const localTree = JSON.parse(manifestText);
            const entries = await loadRepoRegistry();
            const remoteTree = await buildRegistryTree(entries);
            const combinedTree = {
                ...localTree,
                name: 'root',
                children: [
                    ...(Array.isArray(localTree.children) ? localTree.children : []),
                    ...(Array.isArray(remoteTree.children) ? remoteTree.children : [])
                ]
            };
            return res.status(200).json(combinedTree);
        }
        catch {
            const cacheKey = getRefreshCacheKey(req);
            const cached = refreshCache.get(cacheKey);
            const now = Date.now();
            // Return cached result if fresh (30 seconds)
            if (cached && now - cached.cachedAt < 30_000) {
                return res.status(200).json(cached.value);
            }
            // If build is already in progress, return last successful build immediately
            // to avoid timeout on concurrent requests
            if (buildInProgress && lastSuccessfulBuild) {
                console.log('[repo-registry] Build in progress, returning cached result');
                return res.status(200).json(lastSuccessfulBuild.value);
            }
            // Start new build with a timeout to prevent Vercel function timeout
            buildInProgress = true;
            try {
                const buildPromise = (async () => {
                    const entries = await loadRepoRegistry();
                    const tree = await buildRegistryTree(entries);
                    return tree;
                })();
                // Set a 9-second timeout (Vercel limit is 10s for Hobby)
                const timeoutPromise = new Promise((_resolve, reject) => {
                    setTimeout(() => reject(new Error('Registry build timeout - returning cached data')), 9000);
                });
                const tree = await Promise.race([buildPromise, timeoutPromise]);
                const cacheEntry = { cachedAt: now, value: tree };
                refreshCache.set(cacheKey, cacheEntry);
                lastSuccessfulBuild = cacheEntry;
                console.log('[repo-registry] Successfully built registry');
                return res.status(200).json(tree);
            }
            catch (buildError) {
                console.warn('[repo-registry] Build failed:', buildError.message);
                // If build fails/times out and we have a previous successful build, return it
                if (lastSuccessfulBuild) {
                    console.log('[repo-registry] Returning last successful build due to timeout/error');
                    return res.status(200).json(lastSuccessfulBuild.value);
                }
                throw buildError;
            }
            finally {
                buildInProgress = false;
            }
        }
    }
    catch (error) {
        console.error('[api/repo-registry]', error);
        return res.status(500).json({ error: error?.message || 'Failed to build repo registry index' });
    }
}
