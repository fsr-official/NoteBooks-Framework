"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const _shared_1 = require("./_shared");
const MIME_TYPES = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    txt: 'text/plain',
    md: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json'
};
async function serveLocalFile(filePath, res) {
    const projectRoot = process.cwd();
    const normalizedPath = (0, path_1.normalize)(filePath).replace(/^(\.\.(\/|\\|$))+/g, '');
    const absolutePath = (0, path_1.resolve)(projectRoot, normalizedPath);
    if (!absolutePath.startsWith(projectRoot)) {
        return res.status(403).json({ error: 'Access denied' });
    }
    try {
        const content = await (0, promises_1.readFile)(absolutePath);
        const ext = filePath.split('.').pop()?.toLowerCase() || '';
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        return res.status(200).send(content);
    }
    catch (error) {
        if (error?.code === 'ENOENT') {
            return res.status(404).json({ error: 'File not found' });
        }
        return res.status(500).json({ error: 'Failed to read file' });
    }
}
async function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const filePath = req.query.path;
    if (!filePath) {
        return res.status(400).json({ error: 'Missing path query parameter' });
    }
    try {
        const octokit = await (0, _shared_1.getOctokit)({ allowUnauthenticated: true });
        const repoCfg = await (0, _shared_1.getRepoConfig)();
        if (!repoCfg) {
            return serveLocalFile(filePath, res);
        }
        const { owner, repo } = repoCfg;
        let repoPath = filePath;
        const rawMatch = filePath.match(/^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
        if (rawMatch) {
            repoPath = rawMatch[1];
        }
        else if (filePath.startsWith('http')) {
            return res.status(400).json({ error: 'Unsupported URL format for path parameter' });
        }
        const branch = repoCfg.branch || process.env.GITHUB_BRANCH || 'main';
        const data = await octokit.repos.getContent({ owner, repo, path: repoPath, ref: branch });
        const content = Array.isArray(data.data) ? data.data[0] : data.data;
        const downloadUrl = content?.download_url || null;
        const contentUrl = content?.url || null;
        if (!downloadUrl && !contentUrl) {
            return res.status(404).json({ error: 'File not found or not downloadable' });
        }
        const ext = repoPath.split('.').pop()?.toLowerCase() || '';
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        let buffer;
        if (downloadUrl) {
            const rawRes = await fetch(downloadUrl);
            if (!rawRes.ok) {
                return res.status(rawRes.status).json({ error: 'Failed to fetch raw file' });
            }
            buffer = Buffer.from(await rawRes.arrayBuffer());
        }
        else {
            const rawRes = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
                owner,
                repo,
                path: repoPath,
                ref: branch,
                headers: { 'X-GitHub-Api-Version': '2022-11-28' }
            });
            const fileData = Array.isArray(rawRes.data) ? rawRes.data[0] : rawRes.data;
            const encoded = fileData?.content || '';
            buffer = Buffer.from(encoded, 'base64');
        }
        return res.status(200).send(buffer);
    }
    catch (error) {
        if (error?.status === 404) {
            return res.status(404).json({ error: 'File not found' });
        }
        if (error?.message?.includes('configured')) {
            return serveLocalFile(filePath, res);
        }
        console.error('[api/raw]', error);
        return res.status(500).json({ error: 'Failed to resolve file' });
    }
}
