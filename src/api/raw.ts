import type { Request, Response } from 'express';
import { readFile } from 'fs/promises';
import { resolve, normalize } from 'path';
import { getRepoConfig, findRegisteredRepo } from './_shared.js';
import { isSafePublishedFilePath } from '../lib/safe-file-path.js';

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

function getRepoRelativePath(filePath: string, repoCfg: { owner: string; repo: string; branch?: string; root?: string }) {
  const rawPath = normalizeRequestedPath(filePath || '');
  const rawMatch = rawPath.match(/^https?:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\/(.+)$/);
  const mediaMatch = rawPath.match(/^https?:\/\/media\.githubusercontent\.com\/media\/[^/]+\/[^/]+\/refs\/heads\/[^/]+\/(.+)$/);
  const unresolvedPath = mediaMatch ? mediaMatch[1] : rawMatch ? rawMatch[1] : rawPath;
  const repoFolder = String(repoCfg.repo).split('/').pop() || '';
  let repoRelativePath = unresolvedPath;

  if (repoFolder && repoRelativePath.toLowerCase().startsWith(`${repoFolder.toLowerCase()}/`)) {
    repoRelativePath = repoRelativePath.slice(repoFolder.length + 1);
  }

  return repoRelativePath.replace(/^\/+/, '');
}

export function buildRawGithubUrl(filePath: string, repoCfg: { owner: string; repo: string; branch?: string; root?: string }) {
  const cleanedPath = getRepoRelativePath(filePath, repoCfg);
  const branch = repoCfg.branch || process.env.GITHUB_BRANCH || 'main';
  return `https://raw.githubusercontent.com/${repoCfg.owner}/${repoCfg.repo}/${branch}/${cleanedPath}`;
}

export function buildMediaGithubUrl(filePath: string, repoCfg: { owner: string; repo: string; branch?: string; root?: string }) {
  const cleanedPath = getRepoRelativePath(filePath, repoCfg);
  const branch = repoCfg.branch || process.env.GITHUB_BRANCH || 'main';
  const encodedPath = cleanedPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://media.githubusercontent.com/media/${repoCfg.owner}/${repoCfg.repo}/refs/heads/${branch}/${encodedPath}`;
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
  if (!isSafePublishedFilePath(filePath)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Optional explicit repo override (owner/repoName), used when the caller
  // knows the file belongs to a specific subject repo rather than whichever
  // one getRepoConfig() treats as the default. Validated against the repo
  // registry so this endpoint can't be used as an open proxy for arbitrary
  // GitHub repos.
  const repoOverride = String(req.query.repo || '').trim();
  const branchOverride = String(req.query.branch || '').trim();
  const suppliedRawUrl = String(req.query.raw || '').trim();
  const suppliedMediaUrl = String(req.query.media || '').trim();
  const useMediaRoute = req.path === '/api/media' || req.path === '/api/media.js';

  try {
    let repoCfg = await getRepoConfig();

    if (repoOverride) {
      const [ownerParam, repoNameParam] = repoOverride.split('/').filter(Boolean);
      if (!ownerParam || !repoNameParam) {
        return res.status(400).json({ error: 'Invalid repo query parameter, expected owner/repo' });
      }
      const registered = await findRegisteredRepo(ownerParam, repoNameParam);
      if (!registered) {
        return res.status(403).json({ error: 'Repo is not registered for this deployment' });
      }
      repoCfg = branchOverride ? { ...registered, branch: branchOverride } : registered;
    }

    if (!repoCfg) {
      return serveLocalFile(filePath, res);
    }

    if (filePath.startsWith('http') && !/^(https?:\/\/raw\.githubusercontent\.com\/|https?:\/\/media\.githubusercontent\.com\/)/.test(filePath)) {
      return res.status(400).json({ error: 'Unsupported URL format for path parameter' });
    }

    const expectedRawUrl = buildRawGithubUrl(filePath, repoCfg);
    const expectedMediaUrl = buildMediaGithubUrl(filePath, repoCfg);
    const rawUrl = suppliedRawUrl
      ? (suppliedRawUrl === expectedRawUrl ? suppliedRawUrl : expectedRawUrl)
      : expectedRawUrl;
    const mediaUrl = suppliedMediaUrl
      ? (suppliedMediaUrl === expectedMediaUrl ? suppliedMediaUrl : expectedMediaUrl)
      : expectedMediaUrl;
    const repoPath = normalizeRequestedPath(filePath);
    const ext = repoPath.split('.').pop()?.toLowerCase() || '';
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const fetchCandidates = useMediaRoute
      ? [mediaUrl, rawUrl]
      : [rawUrl, mediaUrl];

    let lastResponse: Response | null = null;
    for (const candidateUrl of fetchCandidates) {
      const candidateRes = await fetch(candidateUrl, {
        headers: {
          Accept: '*/*'
        }
      });
      lastResponse = candidateRes;
      if (candidateRes.ok) {
        return res.status(200).send(Buffer.from(await candidateRes.arrayBuffer()));
      }
      if (candidateRes.status === 404 && candidateUrl !== fetchCandidates[fetchCandidates.length - 1]) {
        continue;
      }
      if (candidateRes.status === 404) {
        return res.status(404).json({ error: 'File not found' });
      }
      if (candidateUrl === fetchCandidates[fetchCandidates.length - 1]) {
        return res.status(candidateRes.status).json({ error: 'Failed to fetch raw file' });
      }
    }

    if (lastResponse) {
      return res.status(lastResponse.status).json({ error: 'Failed to fetch raw file' });
    }

    return res.status(500).json({ error: 'Failed to resolve file' });
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
