"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = handler;
function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
        GITHUB_REPO: process.env.GITHUB_REPO || '',
        GITHUB_BRANCH: process.env.GITHUB_BRANCH || 'main',
        APP_URL: process.env.APP_URL || '',
        GITPAGE_URL: process.env.GITPAGE_URL || '',
        RECAPTCHA_SITE_KEY: process.env.RECAPTCHA_SITE_KEY || ''
    });
}
