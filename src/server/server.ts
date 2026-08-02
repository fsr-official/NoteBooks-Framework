import express from 'express';
import path from 'path';
import fs from 'fs';
import repoRegistryHandler from '../api/repo-registry';
import configHandler from '../api/config';
import ghHandler from '../api/gh';
import blobHandler from '../api/blob';
import rawHandler from '../api/raw';
import submitPrHandler from '../api/submit-pr';
import desmosHandler from '../api/desmos';
import authHandler, { assertAuthConfig } from '../api/auth';
import { buildLocalFilesManifest } from '../api/files-manifest';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

export function createApp() {
  assertAuthConfig();

  const app = express();
  const projectDir = path.resolve(process.cwd());

  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
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

  app.use(express.static(projectDir, { index: false }));

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
  app.post('/api/submit-pr', submitPrHandler);
  app.post('/api/submit-pr.js', submitPrHandler);
  app.get('/api/desmos', desmosHandler);
  app.get('/api/desmos.js', desmosHandler);

  return app;
}

export function startServer(port: number = PORT) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`Private backend listening on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

export default createApp;
