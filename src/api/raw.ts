import type { Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { resolve, normalize } from 'path';
import { getRepoConfig } from './_shared';

const MIME_TYPES: Record<string, string> = {
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

function normalizeRequestedPath(rawPath: string) {
  return String(rawPath || '').replace(/^\/+/, '').replace(/\\/g, '/');
}

export function buildRawGithubUrl(filePath: string, repoCfg: { owner: string; repo: string; branch?: string; root?: string }) {
  const rawPath = normalizeRequestedPath(filePath || '');
  const rawMatch = rawPath.match(/^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
  const unresolvedPath = rawMatch ? rawMatch[1] : rawPath;
  const repoFolder = String(repoCfg.repo).split('/').pop() || '';
  let repoRelativePath = unresolvedPath;

  if (repoFolder && repoRelativePath.toLowerCase().startsWith(`${repoFolder.toLowerCase()}/`)) {
    repoRelativePath = repoRelativePath.slice(repoFolder.length + 1);
  }

  const cleanedPath = repoRelativePath.replace(/^\/+/, '');
  const branch = repoCfg.branch || process.env.GITHUB_BRANCH || 'main';
  return `https://raw.githubusercontent.com/${repoCfg.owner}/${repoCfg.repo}/${branch}/${cleanedPath}`;
}

function getRepoRelativePath(filePath: string, repoCfg: { owner: string; repo: string; branch?: string; root?: string }) {
  let normalizedPath = normalizeRequestedPath(filePath);
  const repoFolder = String(repoCfg.repo).split('/').pop()?.toLowerCase() || '';
  const rootPrefix = normalizeRequestedPath(repoCfg.root || '');
  const prefixes = [repoFolder, rootPrefix].filter(Boolean);

  for (const prefix of prefixes) {
    const lowerPrefix = prefix.toLowerCase();
    if (normalizedPath.toLowerCase().startsWith(`${lowerPrefix}/`)) {
      normalizedPath = normalizedPath.slice(prefix.length + 1);
      break;
    }
  }

  return normalizedPath;
}

async function serveLocalFile(filePath: string, res: Response) {
  const projectRoot = process.cwd();
  const normalizedPath = normalize(filePath).replace(/^(\.\.(\/|\\|$))+/g, '');
  const absolutePath = resolve(projectRoot, normalizedPath);

  if (!absolutePath.startsWith(projectRoot)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const content = await readFile(absolutePath);
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(content);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.status(500).json({ error: 'Failed to read file' });
  }
}

export default async function handler(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const filePath = normalizeRequestedPath(String(req.query.path || ''));
  if (!filePath) {
    return res.status(400).json({ error: 'Missing path query parameter' });
  }

  try {
    const repoCfg = await getRepoConfig();
    if (!repoCfg) {
      return serveLocalFile(filePath, res);
    }

    if (filePath.startsWith('http') && !/^https?:\/\/raw\.githubusercontent\.com\//.test(filePath)) {
      return res.status(400).json({ error: 'Unsupported URL format for path parameter' });
    }

    const rawUrl = buildRawGithubUrl(filePath, repoCfg);
    const repoPath = normalizeRequestedPath(filePath);
    const ext = repoPath.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const rawRes = await fetch(rawUrl, {
      headers: {
        Accept: '*/*'
      }
    });

    if (!rawRes.ok) {
      if (rawRes.status === 404) {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.status(rawRes.status).json({ error: 'Failed to fetch raw file' });
    }

    return res.status(200).send(Buffer.from(await rawRes.arrayBuffer()));
  } catch (error: any) {
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
