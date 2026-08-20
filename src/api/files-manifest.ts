import { readdir, stat, readFile } from 'fs/promises';
import path from 'path';

export interface FileManifestNode {
  type: 'folder' | 'file';
  name: string;
  path?: string;
  children?: FileManifestNode[];
}

const EXCLUDED_DIRS = new Set(['.git', '.github', 'node_modules', '.vercel', 'tmp']);
const SUPPORTED_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'mp3', 'wav', 'ogg', 'mp4', 'webm',
  'json', 'html', 'htm', 'css', 'js', 'ts', 'py', 'csv'
]);

function normalizePath(input: string) {
  return input.replace(/^\/+|\/+$/g, '').replace(/\\/g, '/');
}

async function walkDirectory(baseDir: string, relDir = ''): Promise<FileManifestNode[]> {
  const entries = await readdir(path.join(baseDir, relDir), { withFileTypes: true });
  const nodes: FileManifestNode[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const childRelDir = relDir ? path.join(relDir, entry.name) : entry.name;
      const childNodes = await walkDirectory(baseDir, childRelDir);
      if (childNodes.length > 0) {
        nodes.push({
          type: 'folder',
          name: entry.name,
          path: normalizePath(childRelDir),
          children: childNodes
        });
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1).toLowerCase();
      if (SUPPORTED_EXTENSIONS.has(ext) || !path.extname(entry.name)) {
        const childRelPath = relDir ? path.join(relDir, entry.name) : entry.name;
        nodes.push({
          type: 'file',
          name: entry.name,
          path: normalizePath(childRelPath)
        });
      }
    }
  }

  return nodes;
}

export async function buildLocalFilesManifest(rootDir: string): Promise<FileManifestNode> {
  const resolvedRoot = path.resolve(rootDir);
  const children = await walkDirectory(resolvedRoot);
  const baseManifest: FileManifestNode = {
    type: 'folder',
    name: path.basename(resolvedRoot) || 'root',
    path: '',
    children
  };

  // If SUBJECT_REPOS is provided, return a manifest that maps streams to repo identifiers.
  // Format: SUBJECT_REPOS="science=fsr-science/NCERT-Science,commerce=fsr-commerce/NCERT-Commerce"
  const subj = process.env.SUBJECT_REPOS || '';
  if (subj) {
    const pairs = subj.split(',').map(s => s.trim()).filter(Boolean);
    const childrenBySubject: FileManifestNode[] = pairs.map(p => {
      const [key, repo] = p.split('=').map(x => (x || '').trim());
      const repoName = repo ? repo.split('/').pop() || repo : 'repo';
      const subjectKey = normalizePath(key || repoName);
      return {
        type: 'folder',
        name: subjectKey,
        path: subjectKey,
        children: [
          {
            type: 'folder',
            name: repoName,
            path: normalizePath(`${subjectKey}/${repoName}`),
            children: []
          },
          {
            type: 'folder',
            name: 'community',
            path: normalizePath(`${subjectKey}/community`),
            children: []
          },
          {
            type: 'folder',
            name: 'issues',
            path: normalizePath(`${subjectKey}/issues`),
            children: []
          }
        ]
      };
    });

    return {
      type: 'folder',
      name: path.basename(resolvedRoot) || 'root',
      path: '',
      children: childrenBySubject
    };
  }

  const mountPrefix = process.env.MOUNT_PREFIX || process.env.APP_BASE_PATH || '';
  if (mountPrefix) {
    const normalized = normalizePath(mountPrefix);
    return {
      type: 'folder',
      name: normalized,
      path: normalized,
      children: [baseManifest]
    };
  }

  return baseManifest;
}

export async function writeFilesJson(rootDir: string, outputPath: string) {
  const manifest = await buildLocalFilesManifest(rootDir);
  await readFile(outputPath, 'utf8').catch(() => undefined);
  const { writeFile } = await import('fs/promises');
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
