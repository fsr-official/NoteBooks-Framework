"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePagesBaseUrl = resolvePagesBaseUrl;
exports.buildPagesTreeFromManifest = buildPagesTreeFromManifest;
exports.fetchPagesManifest = fetchPagesManifest;
function normalizePath(input) {
    return String(input || '').replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}
function resolvePagesBaseUrl(entry) {
    if (!entry?.repo)
        return '';
    const [owner, repoName] = String(entry.repo).split('/').filter(Boolean);
    if (!owner || !repoName)
        return '';
    if (repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return `https://${owner}.github.io/`;
    }
    return `https://${owner}.github.io/${repoName}/`;
}
function buildPagesTreeFromManifest(repoName, manifest) {
    const root = { type: 'folder', name: repoName, children: [] };
    for (const entry of manifest || []) {
        const normalizedPath = normalizePath(entry.path || '');
        if (!normalizedPath)
            continue;
        const parts = normalizedPath.split('/');
        const fileName = parts[parts.length - 1];
        let node = root;
        for (let index = 0; index < parts.length - 1; index += 1) {
            const part = parts[index];
            let next = (node.children || []).find((child) => child.type === 'folder' && child.name === part);
            if (!next) {
                next = { type: 'folder', name: part, children: [] };
                node.children.push(next);
            }
            node = next;
        }
        node.children.push({
            type: 'file',
            name: fileName || entry.name || 'file',
            path: normalizedPath,
            size: entry.size
        });
    }
    return root.children || [];
}
async function fetchPagesManifest(pagesBase, repoName) {
    const url = `${String(pagesBase).replace(/\/$/, '')}/files.json`;
    // Add a 5-second timeout for Pages manifest fetch to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok)
            throw new Error(`Pages manifest fetch failed with ${res.status}`);
        const manifest = await res.json();
        if (!Array.isArray(manifest) && manifest?.type === 'folder' && Array.isArray(manifest.children)) {
            return manifest.children;
        }
        const normalizedManifest = Array.isArray(manifest) ? manifest : [];
        return buildPagesTreeFromManifest(repoName, normalizedManifest);
    }
    finally {
        clearTimeout(timeoutId);
    }
}
