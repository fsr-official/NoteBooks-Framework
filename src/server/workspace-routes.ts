import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { buildLocalFilesManifest } from '../api/files-manifest.js';
import { isSafePublishedFilePath } from '../lib/safe-file-path.js';

export function getWorkspaceEnv(): string {
  return process.env.WORKSPACE?.trim() || '';
}

export function resolveWorkspaceRoot(projectDir: string, workspaceEnv: string): string {
  if (!workspaceEnv) return projectDir;
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
    if (fs.existsSync(parentDir) && fs.statSync(parentDir).isDirectory()) return parentDir;
    if (pathLike) console.warn(`[workspace] WORKSPACE=${workspaceEnv} points to a JSON file in a missing directory; using project root.`);
    return projectDir;
  }
  if (!normalized.startsWith(projectRootNormalized + path.sep) && normalized !== projectRootNormalized) {
    if (pathLike) console.warn(`[workspace] WORKSPACE=${workspaceEnv} resolves outside the project root; using project root instead.`);
    return projectDir;
  }
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isDirectory()) {
    if (pathLike) console.warn(`[workspace] WORKSPACE=${workspaceEnv} does not resolve to an existing directory; using project root instead.`);
    return projectDir;
  }
  return normalized;
}

export function resolveWorkspaceManifestPath(projectDir: string, workspaceEnv: string): string {
  if (!workspaceEnv) return path.join(projectDir, 'files.json');
  const envPath = path.isAbsolute(workspaceEnv) ? workspaceEnv : path.resolve(projectDir, workspaceEnv);
  if (envPath.toLowerCase().endsWith('.json')) return envPath;
  return path.join(resolveWorkspaceRoot(projectDir, workspaceEnv), 'files.json');
}

export function getWorkspaceMetadata(projectDir: string) {
  const workspaceEnv = getWorkspaceEnv();
  const workspaceRoot = resolveWorkspaceRoot(projectDir, workspaceEnv);
  return { workspace: workspaceEnv || path.basename(projectDir), workspaceRoot, manifestPath: resolveWorkspaceManifestPath(projectDir, workspaceEnv) };
}

export function registerWorkspaceRoutes(app: express.Application, projectDir: string): void {
  const sendManifestResponse = async (res: express.Response) => {
    const workspaceEnv = getWorkspaceEnv();
    const manifestPath = resolveWorkspaceManifestPath(projectDir, workspaceEnv);
    const workspaceRoot = resolveWorkspaceRoot(projectDir, workspaceEnv);
    if (fs.existsSync(manifestPath)) {
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.send(await fs.promises.readFile(manifestPath, 'utf8'));
      return;
    }
    const manifest = await buildLocalFilesManifest(workspaceRoot);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(manifest));
  };

  app.get('/private/files.json', async (_req, res) => await sendManifestResponse(res));
  app.get('/files.json', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/files.json', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/manifest', async (_req, res) => await sendManifestResponse(res));
  app.get('/api/manifest.js', async (_req, res) => await sendManifestResponse(res));
  const sendPublishedFile = (req: express.Request, res: express.Response) => {
    const params = req.params as { filePath?: string | string[] };
    const rawFilePath = Array.isArray(params.filePath) ? params.filePath.join('/') : params.filePath;
    const queryFilePath = typeof req.query.path === 'string' ? req.query.path : '';
    const filePath = String(rawFilePath || queryFilePath || '').replace(/^\/+/, '');
    if (!filePath) return res.status(400).json({ error: 'Missing file path' });
    if (!isSafePublishedFilePath(filePath)) return res.status(403).json({ error: 'Access denied' });
    const absolutePath = path.resolve(projectDir, filePath);
    if (!absolutePath.startsWith(projectDir + path.sep) && absolutePath !== projectDir) return res.status(403).json({ error: 'Access denied' });
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) return res.status(404).json({ error: 'File not found' });
    res.set('Cache-Control', 'no-cache');
    return res.sendFile(absolutePath);
  };
  app.get('/files/{*filePath}', sendPublishedFile);
  // Vercel rewrites /files/* into the API function because the platform does not
  // invoke the Express catch-all for a dynamic static path automatically.
  app.get('/api/workspace-file', sendPublishedFile);
  app.get('/api/workspace-file/{*filePath}', sendPublishedFile);
  app.get('/api/workspace', (_req, res) => {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(getWorkspaceMetadata(projectDir));
  });
}
