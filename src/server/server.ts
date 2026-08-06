import express from 'express';
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
import refreshSignalHandler from '../api/refresh-signal';
import desmosHandler from '../api/desmos';
import authHandler, { assertAuthConfig } from '../api/auth';
import { buildLocalFilesManifest } from '../api/files-manifest';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

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

  app.use(helmet());
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/api/version', (_req, res) => {
    const versionPath = path.join(projectDir, 'version.json');
    try {
      if (fs.existsSync(versionPath)) {
        const content = fs.readFileSync(versionPath, 'utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.type('application/json').send(content);
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
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(fallbackVersion);
  });

  app.get('/private/files.json', async (_req, res) => {
    const filePath = path.join(projectDir, 'files.json');
    if (!fs.existsSync(filePath)) {
      const manifest = await buildLocalFilesManifest(projectDir);
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/json').send(JSON.stringify(manifest));
      return;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(content);
  });

  app.get('/private/config', configHandler);

  app.get('/', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  app.get('/index.html', (_req, res) => {
    res.sendFile(path.join(projectDir, 'index.html'));
  });

  // Serve static files from /bin directory with proper MIME types
  app.use('/bin', express.static(path.join(projectDir, 'src', 'bin'), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css; charset=utf-8');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      } else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2')) {
        res.setHeader('Content-Type', 'font/woff2');
      } else if (filePath.endsWith('.ttf')) {
        res.setHeader('Content-Type', 'font/ttf');
      }
    }
  }));

  app.get('/api/files.json', async (_req, res) => {
    const filePath = path.join(projectDir, 'files.json');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/json').send(content);
      return;
    }

    const manifest = await buildLocalFilesManifest(projectDir);
    res.setHeader('Cache-Control', 'no-store');
    res.type('application/json').send(JSON.stringify(manifest));
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
  app.post('/api/pr-review/accept', prReview.acceptHandler);
  app.post('/api/pr-review/reject', prReview.rejectHandler);
  app.get('/api/desmos', desmosHandler);
  app.get('/api/desmos.js', desmosHandler);

  // Catch-all for remaining static files (place at END to not interfere with API routes)
  app.use(express.static(projectDir, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
      } else if (filePath.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript');
      } else if (filePath.endsWith('.json')) {
        res.setHeader('Content-Type', 'application/json');
      } else if (filePath.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      }
    }
  }));

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
