"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
const blob_1 = require("@vercel/blob");
async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    const { action, filename, content, url } = req.body || {};
    try {
        if (action === 'upload') {
            if (!filename || !content) {
                return res.status(400).json({ error: 'Missing filename or content' });
            }
            const buffer = Buffer.from(content, 'base64');
            if (buffer.byteLength > 25 * 1024 * 1024) {
                return res.status(413).json({ error: 'File exceeds 25 MB limit' });
            }
            const blob = await (0, blob_1.put)(filename, buffer, {
                access: 'private',
                addRandomSuffix: false
            });
            return res.status(200).json({ url: blob.url });
        }
        if (action === 'delete') {
            if (!url)
                return res.status(400).json({ error: 'Missing url' });
            await (0, blob_1.del)(url);
            return res.status(200).json({ ok: true });
        }
        if (action === 'fetch') {
            if (!url)
                return res.status(400).json({ error: 'Missing url' });
            const blobRes = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN || ''}`
                }
            });
            if (!blobRes.ok) {
                return res.status(blobRes.status).json({ error: `Blob fetch failed: ${blobRes.status}` });
            }
            const buffer = Buffer.from(await blobRes.arrayBuffer());
            return res.status(200).json({ content: buffer.toString('base64') });
        }
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
    catch (error) {
        console.error('[api/blob]', error);
        return res.status(500).json({ error: error?.message || 'Internal error' });
    }
}
