// Stream route bootstrap. The focused streams.html document owns the workspace;
// this script resolves a top-level stream slug and preserves the stream tree behavior.
// Plain script, not an ES module: loaded via a normal script tag.


interface StreamTreeNode {
  type: 'folder' | 'file';
  name: string;
  path?: string;
  repo?: string;
  branch?: string;
  repoPath?: string;
  raw?: string;
  stream?: string;
  children?: StreamTreeNode[];
}

const STREAM_ARTIFACTS: Record<string, string> = {
  science: '/public/json/science-tree.json',
  commerce: '/public/json/commerce-tree.json',
  humanities: '/public/json/humanities-tree.json'
};
const STREAM_SLUGS = Object.keys(STREAM_ARTIFACTS);

let streamRepoMapPromise: Promise<Record<string, string>> | null = null;

/** Parses the stream repository mapping; SUBJECT_REPOS remains accepted as a legacy configuration key. */
function parseStreamRepos(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  String(raw || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const eq = entry.indexOf('=');
      if (eq === -1) return;
      const slug = entry.slice(0, eq).trim().toLowerCase();
      const repo = entry.slice(eq + 1).trim();
      if (slug && repo) map[slug] = repo;
    });
  return map;
}

async function getStreamRepoMap(): Promise<Record<string, string>> {
  if (!streamRepoMapPromise) {
    streamRepoMapPromise = fetch('/api/config')
      .then((res) => (res.ok ? res.json() : Promise.resolve({})))
      .then((data: { STREAM_REPOS?: string; SUBJECT_REPOS?: string }) => parseStreamRepos(data?.STREAM_REPOS || data?.SUBJECT_REPOS || ''))
      .catch(() => ({}));
  }
  return streamRepoMapPromise;
}

/** Finds the top-level registry tree node for a given repo (e.g. "fsr-science/NCERT-Science"). */
function findRepoNode(tree: StreamTreeNode, repo: string): StreamTreeNode | null {
  if (!tree || !Array.isArray(tree.children)) return null;
  for (const child of tree.children) {
    if (child.repo === repo) return child;
  }
  return null;
}

function streamFileIcon(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'md' || ext === 'markdown') return '📝';
  if (ext === 'pdf') return '📕';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return '🖼️';
  return '📄';
}

/**
 * Renders a compact nested Contents tree into `container`, sorted folders-first.
 * File clicks call the existing global openPreview()/openMobilePreview() so files open
 * in the same floating-window markdown renderer as the rest of the app — nothing new
 * is built here for actually displaying file content.
 */
function renderStreamTree(container: HTMLElement, nodes: StreamTreeNode[]): void {
  const list = document.createElement('ul');
  list.className = 'stream-tree-list';

  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  sorted.forEach((node) => {
    const li = document.createElement('li');
    li.className = `stream-tree-node stream-tree-node--${node.type}`;

    if (node.type === 'folder') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stream-tree-folder';
      btn.innerHTML = `<span class="stream-tree-caret">▸</span><span class="stream-tree-glyph">📁</span><span>${escapeStreamHTML(node.name)}</span>`;
      const childWrap = document.createElement('div');
      childWrap.className = 'stream-tree-children';
      childWrap.hidden = true;
      let expanded = false;
      let built = false;
      btn.addEventListener('click', () => {
        expanded = !expanded;
        childWrap.hidden = !expanded;
        btn.querySelector('.stream-tree-caret')!.textContent = expanded ? '▾' : '▸';
        if (expanded && !built && Array.isArray(node.children)) {
          renderStreamTree(childWrap, node.children);
          built = true;
        }
      });
      li.appendChild(btn);
      li.appendChild(childWrap);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'stream-tree-file';
      btn.innerHTML = `<span class="stream-tree-glyph">${streamFileIcon(node.name)}</span><span>${escapeStreamHTML(node.name)}</span>`;
      btn.addEventListener('click', () => {
        openStreamFile(node);
      });
      li.appendChild(btn);
    }

    list.appendChild(li);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

function escapeStreamHTML(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Opens a stream tree file node using the app's existing preview windows. */
function openStreamFile(node: StreamTreeNode): void {
  const w = window as any;
  const path = node.path || '';
  const repoPath = node.repoPath || path;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (isMobile && typeof w.openMobilePreview === 'function') {
        w.openMobilePreview(path, node.name, node.repo || '', node.branch || '', repoPath, node.raw || '');
  } else if (typeof w.openPreview === 'function') {
        w.openPreview(path, node.name, node.repo || '', node.branch || '', repoPath, node.raw || '');
  } else {
    // Fallback: the main workspace explorer script hasn't loaded (shouldn't happen —
    // app.js is loaded on every page) — surface this clearly instead of doing nothing.
    console.error('[streams] openPreview is unavailable; the main file explorer script did not load');
  }
}

/** Wires an "Open example" style link so it opens through the preview system too. */
function wireStreamSampleLinks(container: HTMLElement, repo: string, branch: string): void {
  container.querySelectorAll<HTMLAnchorElement>('main#subject-content a[href^="/files/"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      const path = decodeURIComponent(href.replace(/^\/files\//, ''));
      const name = path.split('/').pop() || path;
      openStreamFile({ type: 'file', name, path, repo, branch });
    });
  });
}

async function populateStreamTree(container: HTMLElement, slug: string): Promise<void> {
  const treeBody = container.querySelector<HTMLElement>('#stream-tree .tree-body');
  if (!treeBody) return;

  treeBody.innerHTML = '<p class="stream-tree-loading">Loading contents…</p>';

  try {
    // The runtime system endpoint is authoritative; static files remain a compatibility fallback.
    let payload: any = null;
    const candidateUrls = [
      `/api/system/${slug}`,
      STREAM_ARTIFACTS[slug] || ''
    ];
    for (const u of candidateUrls) {
      try {
        const r = await fetch(`${u}?_=${Date.now()}`, { cache: 'no-store' });
        if (!r.ok) continue;
        payload = await r.json();
        break;
      } catch (e) {
        // try next
      }
    }

    if (payload && Array.isArray(payload.repos)) {
      if (payload.repos.length === 0 && !payload.root) {
        treeBody.innerHTML = '<p class="stream-tree-empty">No content is available yet.</p>';
        return;
      }

      // Phase-I payloads expose a stream root whose children are repository folders.
      // Render that root so multiple repositories remain visible in the workspace.
      if (payload.root && Array.isArray(payload.root.children)) {
        if (payload.root.children.length === 0) {
          treeBody.innerHTML = '<p class="stream-tree-empty">No content is available yet.</p>';
          return;
        }
        renderStreamTree(treeBody, payload.root.children);
        const firstRepo = payload.repos[0];
        wireStreamSampleLinks(container, firstRepo?.repo || '', firstRepo?.branch || 'main');
        return;
      }

      // Compatibility path for older generated payloads that expose one tree per repo.
      const repoMap = await getStreamRepoMap().catch(() => ({} as Record<string, string>));
      const configuredRepo = repoMap[slug];
      let repoEntry = null;
      if (configuredRepo) {
        repoEntry = payload.repos.find((r: any) => String(r.repo).toLowerCase() === String(configuredRepo).toLowerCase());
      }
      if (!repoEntry) repoEntry = payload.repos[0];

      if (!repoEntry || !repoEntry.tree || !Array.isArray(repoEntry.tree.children) || repoEntry.tree.children.length === 0) {
        treeBody.innerHTML = '<p class="stream-tree-empty">No content is available yet.</p>';
        return;
      }

      renderStreamTree(treeBody, repoEntry.tree.children);
      wireStreamSampleLinks(container, repoEntry.repo, repoEntry.branch || 'main');
      return;
    }

    treeBody.innerHTML = '<p class="stream-tree-empty">No stream content is available yet.</p>';
  } catch (error) {
    console.error('[streams] failed to load contents tree', error);
    treeBody.innerHTML = '<p class="stream-tree-empty">Could not load contents. Try refreshing.</p>';
  }
}

function initStreamShell(slug: string): void {
  document.body.dataset.stream = slug;
}

function streamSlugFromPath(pathname: string): string | null {
  const first = pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
  return first && STREAM_SLUGS.includes(first) ? first : null;
}

function bootstrapStreamRouting(): void {
  const slug = streamSlugFromPath(window.location.pathname);
  if (slug) initStreamShell(slug);
}

document.addEventListener('DOMContentLoaded', bootstrapStreamRouting);

// Exposed for the nav links (which do full page loads today, but this keeps the
// function reachable if nav is later switched to client-side routing).
(window as any).initStreamShell = initStreamShell;
