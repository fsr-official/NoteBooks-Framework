import express, { type Request } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import repoRegistryHandler from '../api/repo-registry.js';
import configHandler from '../api/config.js';
import ghHandler from '../api/gh.js';
import blobHandler from '../api/blob.js';
import rawHandler from '../api/raw.js';
import submitPrHandler from '../api/submit-pr.js';
import * as prReview from '../api/pr-review.js';
import refreshSignalHandler, { getLatestSignal } from '../api/refresh-signal.js';
import desmosHandler from '../api/desmos.js';
import systemHandler from '../api/system.js';
import authHandler from '../api/auth.js';
import oauthHandler from '../api/oauth.js';
import { buildLocalFilesManifest } from '../api/files-manifest.js';
import permissions from '../lib/permissions.js';
import * as communityHandler from '../api/community.js';
import * as metrics from '../lib/metrics.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

function getWorkspaceEnv(): string {
  return process.env.WORKSPACE?.trim() || '';
}

function resolveWorkspaceRoot(projectDir: string, workspaceEnv: string): string {
  if (!workspaceEnv) {
    return projectDir;
  }

  const projectBaseName = path.basename(projectDir);
  const candidate = path.isAbsolute(workspaceEnv)
    ? workspaceEnv
    : workspaceEnv === projectBaseName
      ? projectDir
      : path.resolve(projectDir, workspaceEnv);

  const normalized = path.normalize(candidate);
  const projectRootNormalized = path.normalize(projectDir);
  const pathLike = path.isAbsolute(workspaceEnv) || workspaceEnv.includes('/') || workspaceEnv.includes(path.sep) || workspaceEnv.toLowerCase().endsWith('.json');

  if (normalized.toLowerCase().endsWith('.json')) {
    const parentDir = path.dirname(normalized);
    if (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()) {
      return parentDir;
    }
    if (pathLike) {
      console.warn(`[workspace] WORKSPACE=${workspaceEnv} points to a JSON file in a missing directory; using project root.`);
    }
    return projectDir;
  }

  if (!normalized.startsWith(projectRootNormalized + path.sep) && normalized !== projectRootNormalized) {
    if (pathLike) {
      console.warn(`[workspace] WORKSPACE=${workspaceEnv} resolves outside the project root; using project root instead.`);
    }
    return projectDir;
  }

  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isDirectory()) {
    if (pathLike) {
      console.warn(`[workspace] WORKSPACE=${workspaceEnv} does not resolve to an existing directory; using project root instead.`);
    }
    return projectDir;
  }

  return normalized;
}

function resolveWorkspaceManifestPath(projectDir: string, workspaceEnv: string): string {
  if (!workspaceEnv) {
    return path.join(projectDir, 'files.json');
  }

  const envPath = path.isAbsolute(workspaceEnv)
    ? workspaceEnv
    : path.resolve(projectDir, workspaceEnv);

  if (envPath.toLowerCase().endsWith('.json')) {
    return envPath;
  }

  const workspaceRoot = resolveWorkspaceRoot(projectDir, workspaceEnv);
  return path.join(workspaceRoot, 'files.json');
}

function getWorkspaceMetadata(projectDir: string) {
  const workspaceEnv = getWorkspaceEnv();
  const workspaceRoot = resolveWorkspaceRoot(projectDir, workspaceEnv);
  return {
    workspace: workspaceEnv || path.basename(projectDir),
    workspaceRoot,
    manifestPath: resolveWorkspaceManifestPath(projectDir, workspaceEnv)
  };
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts. Please try again later.' }
});

const submitPrLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many PR submissions. Please try again later.' }
});

export function createApp() {
    // Do not fail the entire serverless function during module initialization when
  // optional/public endpoints are requested. Sensitive operations validate their
  // own required configuration when they are invoked.



  const app = express();

  // TikZJax and other WASM/WebWorker features require the page and its assets to be
  // cross-origin isolated. Setting this at the app layer guarantees the document and
  // static assets inherit the required COOP/COEP policies regardless of route type.
  app.use((_req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });

  // Parse cookies so `req.cookies` is available for CSRF, theme endpoints, etc.
  app.use(cookieParser());

  // CSRF enforcement (double-submit) for state-changing API routes when enabled
  const enforceCsrf = process.env.ENFORCE_CSRF === 'true';
  if (enforceCsrf) {
    app.use((req, res, next) => {
      const method = req.method.toUpperCase();
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
      // Exempt refresh-signal which is server-to-server
      if (req.path === '/api/refresh-signal' || req.path.startsWith('/api/system/')) return next();
      const cookieToken = req.cookies?.csrf || req.headers['x-csrf-cookie'];
      const header = req.headers['x-csrf-token'];
      if (!cookieToken || !header || header !== cookieToken) {
        return res.status(403).json({ error: 'CSRF token missing or invalid' });
      }
      return next();
    });
  }

  // Write-path request logging when enabled
  if (process.env.ENABLE_WRITE_LOGS === 'true') {
    app.use((req, _res, next) => {
      const method = req.method.toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        console.log('[write-log]', method, req.path, req.ip);
      }
      next();
    });
  }
  const projectDir = path.resolve(process.cwd());

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://www.google.com',
          'https://www.gstatic.com'
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          'blob:',
          'https://cdn.jsdelivr.net',
          'https://cdnjs.cloudflare.com',
          'https://www.google.com',
          'https://www.gstatic.com'
        ],
        workerSrc: ["'self'", 'blob:'],
        connectSrc: [
          "'self'",
          'https://*.github.io',
          'https://cdn.jsdelivr.net',
          'https://raw.githubusercontent.com',
          'https://www.google.com',
          'https://www.gstatic.com',
          'https://cdnjs.cloudflare.com'
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.github.io', 'https://raw.githubusercontent.com'],
        mediaSrc: ["'self'", 'blob:', 'https://*.github.io', 'https://raw.githubusercontent.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        frameSrc: ["'self'", 'https://docs.google.com', 'https://*.github.io', 'https://www.google.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com', 'https://www.google.com', 'https://fonts.googleapis.com']
      }
    }
  }));
  app.use(express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf?.toString('utf8') || '';
    }
  }));
  // Minimal metrics middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const dur = Date.now() - start;
      try {
        metrics.incCounter('requests_total');
        metrics.incCounter(`requests_method_${req.method.toLowerCase()}`, 1);
        metrics.incCounter('request_duration_ms_sum', dur);
        metrics.incCounter('request_duration_ms_count', 1);
        if (res.statusCode >= 500) metrics.incCounter('request_errors_total', 1);
      } catch (e) {
        // swallow metric errors
      }
    });
    next();
  });
  app.get('/metrics', (req, res) => {
    const format = String(req.query.format || '').toLowerCase();
    if (format === 'prometheus' || req.headers.accept === 'text/plain') {
      const text = metrics.getPrometheusText ? metrics.getPrometheusText() : '';
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      return res.status(200).send(text);
    }
    const m = metrics.getMetrics();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(m);
  });
  app.use(express.urlencoded({ extended: true }));

    app.get('/health', async (_req, res) => {
    const health: any = { status: 'ok', checks: {} };
    // DB check
    try {
      // lazy import to avoid touching DB in environments without DATABASE_URL
      const db = await import('../lib/db.js');
      if (db.isConfigured()) {
        try {
          await db.query('SELECT 1');
          health.checks.database = { ok: true };
        } catch (err) {
          health.status = 'degraded';
          health.checks.database = { ok: false, error: String(err) };
        }
      } else {
        health.checks.database = { ok: false, reason: 'DATABASE_URL not configured' };
      }
    } catch (err) {
      health.checks.database = { ok: false, error: String(err) };
    }

    // GitHub auth check
    try {
      const sh = await import('../api/_shared.js');
      try {
        // request an authenticated client; if not configured this will throw
        const oct = await sh.getOctokit({ allowUnauthenticated: false } as any);
        // if we have a client, try a minimal call that doesn't require scopes
        // prefer apps.getAuthenticated when available
        const apps = (oct as any).apps;
        if (apps && typeof apps.getAuthenticated === 'function') {
          await apps.getAuthenticated();
        }
        health.checks.github = { ok: true };
      } catch (err) {
        health.status = health.status === 'degraded' ? 'degraded' : 'degraded';
        health.checks.github = { ok: false, error: String(err) };
      }
    } catch (err) {
      health.checks.github = { ok: false, error: String(err) };
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(health);
  });

  app.get('/api/version', (_req, res) => {
    const versionPath = path.join(projectDir, 'version.json');
    try {
      if (fs.existsSync(versionPath)) {
        const content = fs.readFileSync(versionPath, 'utf-8');
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.set('Content-Type', 'application/json; charset=utf-8');
        res.send(content);
        return;
      }
    } catch (error) {
      console.warn('[version] Failed to read version.json:', error);
    }
    
    // Fallback version if file doesn't exist
    const fallbackVersion = {
      version: '1.0.0',
      buildTime: new Date().toISOString(),
      buildTimestamp: Date.now(),
      buildHash: 'unknown'
    };
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(fallbackVersion);
  });

  app.get('/private/files.json', async (_req, res) => await sendManifestResponse(res));

  app.post('/api/oauth', oauthHandler);

  app.get('/private/config', configHandler);

  app.get('/', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  app.get('/index.html', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  app.get('/README.md', (_req, res) => {
    res.sendFile(path.join(projectDir, 'README.md'));
  });

  app.get('/LICENSE', (_req, res) => {
    res.sendFile(path.join(projectDir, 'LICENSE'));
  });

  // Subject and content routes use the focused subject shell rather than the
  // marketing landing page. This keeps the legacy workspace as the only visible
  // rendering surface on subject routes.
  const SUBJECT_ROUTES = ['science', 'commerce', 'humanities', 'community', 'volunteers', 'accounts', 'issues', 'about'];
  SUBJECT_ROUTES.forEach((s) => {
  app.get(`/${s}`, (_req, res) => res.sendFile(path.join(projectDir, 'public', 'html', 'streams.html')));
  app.get(`/${s}/*`, (_req, res) => res.sendFile(path.join(projectDir, 'public', 'html', 'streams.html')));
  });
  
  app.get(/^\/(science|commerce|humanities|community|issues|accounts|volunteers|about)(?:\/.+)?$/, (_req, res) => {
  res.sendFile(path.join(projectDir, 'public', 'html', 'streams.html'));
  });

  app.get('/manifest.json', (_req, res) => {
    res.sendFile(path.join(projectDir, 'public', 'manifest.json'));
  });

  app.get('/service-worker.js', (_req, res) => {
    res.sendFile(path.join(projectDir, 'service-worker.js'));
  });

  app.get('/favicon.png', (_req, res) => {
    res.sendFile(path.join(projectDir, 'favicon.png'));
  });

  // Serve public static assets under /public and also as the root public directory.
  app.use('/public', express.static(path.join(projectDir, 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
        res.setHeader('Content-Type', 'font/woff2');
      } else if (filePath.endsWith('.ttf')) {
        res.setHeader('Content-Type', 'font/ttf');
      } else if (filePath.endsWith('.gz')) {
        res.setHeader('Content-Type', 'application/gzip');
      }
    }
  }));

  app.use(express.static(path.join(projectDir, 'public'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
        res.setHeader('Content-Type', 'font/woff2');
      } else if (filePath.endsWith('.ttf')) {
        res.setHeader('Content-Type', 'font/ttf');
      } else if (filePath.endsWith('.gz')) {
        res.setHeader('Content-Type', 'application/gzip');
      }
    }
  }));

  async function sendManifestResponse(res: any) {
    const workspaceEnv = getWorkspaceEnv();
    const manifestPath = resolveWorkspaceManifestPath(projectDir, workspaceEnv);
    const workspaceRoot = resolveWorkspaceRoot(projectDir, workspaceEnv);

    if (fs.existsSync(manifestPath)) {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.send(content);
      return;
    }

    const manifest = await buildLocalFilesManifest(workspaceRoot);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(manifest));
  }

  app.get('/files.json', async (_req, res) => await sendManifestResponse(res));
  app.get('/repo-registry.json', (_req, res) => {
    const registryPath = path.join(projectDir, 'repo-registry.json');
    if (fs.existsSync(registryPath)) {
      return res.sendFile(registryPath);
    }
    return res.status(404).json({ error: 'repo-registry.json not found' });
  });
  app.get('/api/files.json', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/manifest', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/manifest.js', async (_req, res) => await sendManifestResponse(res));
  app.get('/files/:filePath(*)', (req, res) => {
    const params = req.params as { filePath?: string };
    const filePath = String(params.filePath || '').replace(/^\/+/, '');
    if (!filePath) {
      return res.status(400).json({ error: 'Missing file path' });
    }

    const absolutePath = path.resolve(projectDir, filePath);
    if (!absolutePath.startsWith(projectDir + path.sep) && absolutePath !== projectDir) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.set('Cache-Control', 'no-cache');
    return res.sendFile(absolutePath);
  });
  app.get('/api/workspace', (_req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(getWorkspaceMetadata(projectDir));
  });

  app.get('/api/config', configHandler);
  app.get('/api/config.js', configHandler);
  app.get('/api/registry', repoRegistryHandler);
  app.get('/api/registry.js', repoRegistryHandler);
  app.get('/api/system/:subject', systemHandler);
  app.head('/api/system/:subject', systemHandler);
  app.post('/api/system/:subject/refresh', systemHandler);
  app.get('/api/files', repoRegistryHandler);
  app.get('/api/files.js', repoRegistryHandler);
  app.get('/api/pr-review', prReview.listHandler);
  app.get('/api/pr-review.js', prReview.listHandler);
  app.use('/api/auth', authLimiter);
  app.all('/api/auth', authHandler);
  app.all('/api/auth.js', authHandler);
  app.post('/api/gh', permissions.requireAuth, ghHandler);
  app.post('/api/gh.js', permissions.requireAuth, ghHandler);
  app.post('/api/blob', permissions.requireTotpEnrolled, blobHandler);
  app.post('/api/blob.js', permissions.requireTotpEnrolled, blobHandler);
  app.get('/api/raw', rawHandler);
  app.get('/api/raw.js', rawHandler);
  app.options('/api/raw', rawHandler);
  app.options('/api/raw.js', rawHandler);
  app.use('/api/submit-pr', submitPrLimiter);
  app.post('/api/submit-pr', permissions.requireTotpEnrolled, submitPrHandler);
  app.post('/api/submit-pr.js', permissions.requireTotpEnrolled, submitPrHandler);
  app.post('/api/refresh-signal', refreshSignalHandler);
  app.get('/api/refresh-signal', refreshSignalHandler);
  // Subject-scoped endpoints: community posts and issues
  app.post('/api/subject/:subject/community/post', permissions.requireAuth, (req, res) => {
    // delegate to community handler with subject in params
    return import('../api/community.js').then((m) => m.createPost(req, res));
  });
  app.post('/api/subject/:subject/community/post/:id/approve', permissions.requireRole('admin'), (req, res) => {
    return import('../api/community.js').then((m) => m.approvePost(req, res));
  });
  app.post('/api/subject/:subject/issues/create', permissions.requireAuth, async (req, res) => {
    const subject = String(req.params.subject || req.query.subject || '').trim();
    const title = (req.body && req.body.title) || req.body.title || req.query.title;
    const body = (req.body && req.body.body) || req.body.body || req.query.body;
    if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });
    try {
      const issuesTarget = process.env.GITHUB_ISSUES_REPO || '';
      if (!issuesTarget) return res.status(500).json({ error: 'Issues repo not configured' });
      const [owner, repo] = issuesTarget.split('/').filter(Boolean);
      const oct = await import('../api/_shared.js').then((m) => m.getOctokit({ allowUnauthenticated: false }));
      const issueBody = subject ? `[${subject}]\n\n${body}` : body;
      const issue = await oct.issues.create({ owner, repo, title, body: issueBody }).catch((e:any) => { throw e; });
      return res.status(201).json({ issue: issue.data });
    } catch (err:any) {
      console.error('[subject-issues] create failed', err);
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });
  // Community and issues feed endpoints
  app.get('/api/community/feed', communityHandler.listFeed);
  app.get('/api/community/posts', communityHandler.listPosts);
  app.get('/api/issues/feed', communityHandler.listFeed);
  app.post('/api/community/post', permissions.requireAuth, communityHandler.createPost);
  app.post('/api/community/post/:id/approve', permissions.requireRole('admin'), communityHandler.approvePost);
  app.post('/api/community/post/:id/reject', permissions.requireRole('admin'), communityHandler.rejectPost);
  // GitHub App administrative actions
  app.post('/api/github-app', permissions.requireRole('admin'), (req, res) => {
    return import('../api/github-app.js').then((m: any) => (typeof m.default === 'function' ? m.default(req, res) : m(req, res)));
  });
  // GitHub App webhook receiver (no auth; validate with webhook secret in front proxy if needed)
  app.post('/api/webhooks/github-app', express.json(), (req, res) => {
    return import('../api/webhooks/github-app.js').then((m: any) => (typeof m.default === 'function' ? m.default(req, res) : m(req, res)));
  });
  app.get('/api/webhooks/github-app', permissions.requireRole('admin'), (req, res) => {
    return import('../api/webhooks/github-app.js').then((m: any) => (typeof m.default === 'function' ? m.default(req, res) : m(req, res)));
  });
  // Admin PR listing
  app.get('/api/admin', permissions.requireRole('admin'), (req, res) => {
    return import('../api/admin.js').then((m: any) => (typeof m.default === 'function' ? m.default(req, res) : m(req, res)));
  });
  app.post('/api/admin', permissions.requireRole('admin'), (req, res) => {
    return import('../api/admin.js').then((m: any) => (typeof m.default === 'function' ? m.default(req, res) : m(req, res)));
  });
  app.get('/api/latest-commit', (_req, res) => {
    const latest = getLatestSignal();
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({
      latestCommit: latest?.commitHash || null,
      latestSignal: latest
        ? {
            signal: latest.signal,
            type: latest.type,
            at: latest.at,
            path: latest.path,
            reason: latest.reason
          }
        : null,
      timestamp: Date.now()
    });
  });
  app.post('/api/pr-review/accept', permissions.requireRole('admin'), prReview.acceptHandler);
  app.post('/api/pr-review/reject', permissions.requireRole('admin'), prReview.rejectHandler);
  app.get('/api/desmos', desmosHandler);
  app.get('/api/desmos.js', desmosHandler);

  // Theme preference API — sets a cookie with the chosen theme JSON.
  app.post('/api/theme', express.json(), (req, res) => {
    try {
      const theme = req.body && req.body.theme ? req.body.theme : null;
      if (!theme) return res.status(400).json({ error: 'Missing theme in request body' });
      const json = JSON.stringify(theme);
      // set cookie for theme (same-site lax)
      res.cookie('notebooks-theme', json, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 365 * 24 * 60 * 60 * 1000 });
      return res.status(200).json({ ok: true });
    } catch (err:any) {
      console.warn('[theme] set failed', err);
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });

  app.get('/api/theme', (req, res) => {
    try {
      const cookie = req.cookies && req.cookies['notebooks-theme'];
      if (!cookie) return res.status(204).end();
      let parsed = null;
      try { parsed = JSON.parse(cookie); } catch (_) { parsed = null; }
      return parsed ? res.status(200).json({ theme: parsed }) : res.status(204).end();
    } catch (err:any) {
      return res.status(500).json({ error: String(err?.message || err) });
    }
  });

  return app;
}

export function startServer(port: number = PORT) {
  if (process.env.NODE_ENV !== 'production') {
    const envDefaults = {
      JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-key-do-not-use-in-production',
      GITHUB_REPO: process.env.GITHUB_REPO || 'fsr-science/NCERT-Science',
      GITHUB_COMMUNITY_REPO: process.env.GITHUB_COMMUNITY_REPO || 'fsr-official/NoteBooks-Community',
      GITHUB_ISSUES_REPO: process.env.GITHUB_ISSUES_REPO || 'fsr-official/NoteBooks-Issues',
      WORKSPACE: process.env.WORKSPACE || 'NoteBooks-Framework',
    };

    Object.entries(envDefaults).forEach(([key, value]) => {
      if (!process.env[key]) process.env[key] = value;
    });
  }

  const app = createApp();
  return app.listen(port, () => {
    console.log(`Private backend listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

export default createApp;
