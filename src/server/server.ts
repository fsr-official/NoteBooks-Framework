import express, { type Request } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import repoRegistryHandler from '../api/repo-registry';
import configHandler from '../api/config';
import ghHandler from '../api/gh';
import blobHandler from '../api/blob';
import rawHandler from '../api/raw';
import submitPrHandler from '../api/submit-pr';
import * as prReview from '../api/pr-review';
import refreshSignalHandler, { getLatestSignal } from '../api/refresh-signal';
import desmosHandler from '../api/desmos';
import authHandler, { assertAuthConfig } from '../api/auth';
import { buildLocalFilesManifest } from '../api/files-manifest';

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
  assertAuthConfig();

  const app = express();
  const projectDir = path.resolve(process.cwd());

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        connectSrc: [
          "'self'",
          'https://*.github.io',
          'https://cdn.jsdelivr.net',
          'https://raw.githubusercontent.com'
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://*.github.io', 'https://raw.githubusercontent.com'],
        mediaSrc: ["'self'", 'blob:', 'https://*.github.io', 'https://raw.githubusercontent.com'],
        frameSrc: ["'self'", 'https://docs.google.com', 'https://*.github.io']
      }
    }
  }));
  app.use(express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf?.toString('utf8') || '';
    }
  }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
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

  app.get('/private/config', configHandler);

  app.get('/', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  app.get('/index.html', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
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

  app.get('/api/files.json', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/manifest', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/manifest.js', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/workspace', (_req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(getWorkspaceMetadata(projectDir));
  });

  app.get('/api/config', configHandler);
  app.get('/api/config.js', configHandler);
  app.get('/api/registry', repoRegistryHandler);
  app.get('/api/registry.js', repoRegistryHandler);
  app.get('/api/files', repoRegistryHandler);
  app.get('/api/files.js', repoRegistryHandler);
  app.get('/api/pr-review', prReview.listHandler);
  app.get('/api/pr-review.js', prReview.listHandler);
  app.use('/api/auth', authLimiter);
  app.all('/api/auth', authHandler);
  app.all('/api/auth.js', authHandler);
  app.post('/api/gh', ghHandler);
  app.post('/api/gh.js', ghHandler);
  app.post('/api/blob', blobHandler);
  app.post('/api/blob.js', blobHandler);
  app.get('/api/raw', rawHandler);
  app.get('/api/raw.js', rawHandler);
  app.options('/api/raw', rawHandler);
  app.options('/api/raw.js', rawHandler);
  app.use('/api/submit-pr', submitPrLimiter);
  app.post('/api/submit-pr', submitPrHandler);
  app.post('/api/submit-pr.js', submitPrHandler);
  app.post('/api/refresh-signal', refreshSignalHandler);
  app.get('/api/refresh-signal', refreshSignalHandler);
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
  app.post('/api/pr-review/accept', prReview.acceptHandler);
  app.post('/api/pr-review/reject', prReview.rejectHandler);
  app.get('/api/desmos', desmosHandler);
  app.get('/api/desmos.js', desmosHandler);

  return app;
}

export function startServer(port: number = PORT) {
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

export default createApp;
