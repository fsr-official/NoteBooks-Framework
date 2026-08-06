"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const repo_registry_1 = __importDefault(require("../api/repo-registry"));
const config_1 = __importDefault(require("../api/config"));
const gh_1 = __importDefault(require("../api/gh"));
const blob_1 = __importDefault(require("../api/blob"));
const raw_1 = __importDefault(require("../api/raw"));
const submit_pr_1 = __importDefault(require("../api/submit-pr"));
const prReview = __importStar(require("../api/pr-review"));
const refresh_signal_1 = __importDefault(require("../api/refresh-signal"));
const desmos_1 = __importDefault(require("../api/desmos"));
const auth_1 = __importStar(require("../api/auth"));
const files_manifest_1 = require("../api/files-manifest");
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts. Please try again later.' }
});
const submitPrLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 50,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many PR submissions. Please try again later.' }
});
function createApp() {
    (0, auth_1.assertAuthConfig)();
    const app = (0, express_1.default)();
    const projectDir = path_1.default.resolve(process.cwd());
    app.use((0, helmet_1.default)());
    app.use(express_1.default.json({ limit: '25mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok' });
    });
    app.get('/api/version', (_req, res) => {
        const versionPath = path_1.default.join(projectDir, 'version.json');
        try {
            if (fs_1.default.existsSync(versionPath)) {
                const content = fs_1.default.readFileSync(versionPath, 'utf-8');
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.type('application/json').send(content);
                return;
            }
        }
        catch (error) {
            console.warn('[version] Failed to read version.json:', error);
        }
        // Fallback version if file doesn't exist
        const fallbackVersion = {
            version: '1.0.0',
            buildTime: new Date().toISOString(),
            buildTimestamp: Date.now(),
            buildHash: 'unknown'
        };
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.json(fallbackVersion);
    });
    app.get('/private/files.json', async (_req, res) => {
        const filePath = path_1.default.join(projectDir, 'files.json');
        if (!fs_1.default.existsSync(filePath)) {
            const manifest = await (0, files_manifest_1.buildLocalFilesManifest)(projectDir);
            res.setHeader('Cache-Control', 'no-store');
            res.type('application/json').send(JSON.stringify(manifest));
            return;
        }
        const content = fs_1.default.readFileSync(filePath, 'utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.type('application/json').send(content);
    });
    app.get('/private/config', config_1.default);
    app.get('/', (_req, res) => {
        res.sendFile(path_1.default.join(projectDir, 'index.html'));
    });
    app.get('/index.html', (_req, res) => {
        res.sendFile(path_1.default.join(projectDir, 'index.html'));
    });
    // Serve public static assets under /public and also as the root public directory.
    app.use('/public', express_1.default.static(path_1.default.join(projectDir, 'public'), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css; charset=utf-8');
            }
            else if (filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            }
            else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
                res.setHeader('Content-Type', 'font/woff2');
            }
            else if (filePath.endsWith('.ttf')) {
                res.setHeader('Content-Type', 'font/ttf');
            }
            else if (filePath.endsWith('.gz')) {
                res.setHeader('Content-Type', 'application/gzip');
            }
        }
    }));
    app.use(express_1.default.static(path_1.default.join(projectDir, 'public'), {
        setHeaders: (res, filePath) => {
            if (filePath.endsWith('.css')) {
                res.setHeader('Content-Type', 'text/css; charset=utf-8');
            }
            else if (filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
            }
            else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
                res.setHeader('Content-Type', 'font/woff2');
            }
            else if (filePath.endsWith('.ttf')) {
                res.setHeader('Content-Type', 'font/ttf');
            }
            else if (filePath.endsWith('.gz')) {
                res.setHeader('Content-Type', 'application/gzip');
            }
        }
    }));
    app.get('/api/files.json', async (_req, res) => {
        const filePath = path_1.default.join(projectDir, 'files.json');
        if (fs_1.default.existsSync(filePath)) {
            const content = fs_1.default.readFileSync(filePath, 'utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.type('application/json').send(content);
            return;
        }
        const manifest = await (0, files_manifest_1.buildLocalFilesManifest)(projectDir);
        res.setHeader('Cache-Control', 'no-store');
        res.type('application/json').send(JSON.stringify(manifest));
    });
    app.get('/api/config', config_1.default);
    app.get('/api/config.js', config_1.default);
    app.get('/api/registry', repo_registry_1.default);
    app.get('/api/registry.js', repo_registry_1.default);
    app.get('/api/files', repo_registry_1.default);
    app.get('/api/files.js', repo_registry_1.default);
    app.get('/api/pr-review', prReview.listHandler);
    app.get('/api/pr-review.js', prReview.listHandler);
    app.use('/api/auth', authLimiter);
    app.all('/api/auth', auth_1.default);
    app.all('/api/auth.js', auth_1.default);
    app.post('/api/gh', gh_1.default);
    app.post('/api/gh.js', gh_1.default);
    app.post('/api/blob', blob_1.default);
    app.post('/api/blob.js', blob_1.default);
    app.get('/api/raw', raw_1.default);
    app.get('/api/raw.js', raw_1.default);
    app.options('/api/raw', raw_1.default);
    app.options('/api/raw.js', raw_1.default);
    app.use('/api/submit-pr', submitPrLimiter);
    app.post('/api/submit-pr', submit_pr_1.default);
    app.post('/api/submit-pr.js', submit_pr_1.default);
    app.post('/api/refresh-signal', refresh_signal_1.default);
    app.get('/api/refresh-signal', refresh_signal_1.default);
    app.post('/api/pr-review/accept', prReview.acceptHandler);
    app.post('/api/pr-review/reject', prReview.rejectHandler);
    app.get('/api/desmos', desmos_1.default);
    app.get('/api/desmos.js', desmos_1.default);
    return app;
}
function startServer(port = PORT) {
    // Check for env vars but provide defaults for development
    const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production';
    const GITHUB_REPO = process.env.GITHUB_REPO || 'fsr-science/NCERT-Science';
    if (!process.env.JWT_SECRET || !process.env.GITHUB_REPO) {
        console.warn('[server] Using default environment variables for development. Ensure they are set in production.');
        process.env.JWT_SECRET = JWT_SECRET;
        process.env.GITHUB_REPO = GITHUB_REPO;
    }
    const app = createApp();
    return app.listen(port, () => {
        console.log(`Private backend listening on port ${port}`);
    });
}
if (require.main === module) {
    startServer();
}
exports.default = createApp;
