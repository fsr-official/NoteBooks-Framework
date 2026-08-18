// Subject landing pages (Science, Commerce, Humanities, Community, Volunteers, Admin).
// Fetches the static subject fragment from public/subjects/<slug>.html, injects it into
// the #subjectLanding mount point, then wires up its Contents tree and sample links to the
// SAME file-preview system the main workspace explorer uses (openPreview / fetchFileContent
// / markdownToHTML, all defined globally by public/app.js and public/markdown.js). No
// separate/duplicate file explorer is built here — this reuses the real one.
//
// Plain script, not an ES module: this file is loaded via a normal <script> tag alongside
// app.js, so nothing here should use `export`/`import` (module output is not wired into
// index.html and browsers have no `exports` global).

interface SubjectTreeNode {
  type: 'folder' | 'file';
  name: string;
  path?: string;
  repo?: string;
  branch?: string;
  repoPath?: string;
  children?: SubjectTreeNode[];
}

const SUBJECT_SLUGS = ['science', 'commerce', 'humanities', 'community', 'volunteers', 'admin', 'accounts'];

let subjectRepoMapPromise: Promise<Record<string, string>> | null = null;

/** Parses the SUBJECT_REPOS env format: "science=owner/Repo,commerce=owner/Repo2" */
function parseSubjectRepos(raw: string): Record<string, string> {
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

async function getSubjectRepoMap(): Promise<Record<string, string>> {
  if (!subjectRepoMapPromise) {
    subjectRepoMapPromise = fetch('/api/config')
      .then((res) => (res.ok ? res.json() : Promise.resolve({})))
      .then((data: { SUBJECT_REPOS?: string }) => parseSubjectRepos(data?.SUBJECT_REPOS || ''))
      .catch(() => ({}));
  }
  return subjectRepoMapPromise;
}

/** Finds the top-level registry tree node for a given repo (e.g. "fsr-science/NCERT-Science"). */
function findRepoNode(tree: SubjectTreeNode, repo: string): SubjectTreeNode | null {
  if (!tree || !Array.isArray(tree.children)) return null;
  for (const child of tree.children) {
    if (child.repo === repo) return child;
  }
  return null;
}

function subjectFileIcon(name: string): string {
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
function renderSubjectTree(container: HTMLElement, nodes: SubjectTreeNode[]): void {
  const list = document.createElement('ul');
  list.className = 'subject-tree-list';

  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  sorted.forEach((node) => {
    const li = document.createElement('li');
    li.className = `subject-tree-node subject-tree-node--${node.type}`;

    if (node.type === 'folder') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'subject-tree-folder';
      btn.innerHTML = `<span class="subject-tree-caret">▸</span><span class="subject-tree-glyph">📁</span><span>${escapeSubjectHTML(node.name)}</span>`;
      const childWrap = document.createElement('div');
      childWrap.className = 'subject-tree-children';
      childWrap.hidden = true;
      let expanded = false;
      let built = false;
      btn.addEventListener('click', () => {
        expanded = !expanded;
        childWrap.hidden = !expanded;
        btn.querySelector('.subject-tree-caret')!.textContent = expanded ? '▾' : '▸';
        if (expanded && !built && Array.isArray(node.children)) {
          renderSubjectTree(childWrap, node.children);
          built = true;
        }
      });
      li.appendChild(btn);
      li.appendChild(childWrap);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'subject-tree-file';
      btn.innerHTML = `<span class="subject-tree-glyph">${subjectFileIcon(node.name)}</span><span>${escapeSubjectHTML(node.name)}</span>`;
      btn.addEventListener('click', () => {
        openSubjectFile(node);
      });
      li.appendChild(btn);
    }

    list.appendChild(li);
  });

  container.innerHTML = '';
  container.appendChild(list);
}

function escapeSubjectHTML(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Opens a subject tree file node using the app's existing preview windows. */
function openSubjectFile(node: SubjectTreeNode): void {
  const w = window as any;
  const path = node.path || '';
  const repoPath = node.repoPath || path;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent);
  if (isMobile && typeof w.openMobilePreview === 'function') {
    w.openMobilePreview(path, node.name, node.repo || '', node.branch || '', repoPath);
  } else if (typeof w.openPreview === 'function') {
    w.openPreview(path, node.name, node.repo || '', node.branch || '', repoPath);
  } else {
    // Fallback: the main workspace explorer script hasn't loaded (shouldn't happen —
    // app.js is loaded on every page) — surface this clearly instead of doing nothing.
    console.error('[subjects] openPreview is unavailable; the main file explorer script did not load');
  }
}

/** Wires an "Open example" style link so it opens through the preview system too. */
function wireSubjectSampleLinks(container: HTMLElement, repo: string, branch: string): void {
  container.querySelectorAll<HTMLAnchorElement>('main#subject-content a[href^="/files/"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      const href = link.getAttribute('href') || '';
      const path = decodeURIComponent(href.replace(/^\/files\//, ''));
      const name = path.split('/').pop() || path;
      openSubjectFile({ type: 'file', name, path, repo, branch });
    });
  });
}

async function populateSubjectTree(container: HTMLElement, slug: string): Promise<void> {
  const treeBody = container.querySelector<HTMLElement>('#subject-tree .tree-body');
  if (!treeBody) return;

  treeBody.innerHTML = '<p class="subject-tree-loading">Loading contents…</p>';

  try {
    // Try generated subject tree JSON first (created during build). Falls back to /api/registry
    // if the generated file is unavailable.
    let payload: any = null;
    const candidateUrls = [`/${slug}-tree.json`, `/public/subjects/${slug}-tree.json`, `/public/${slug}-tree.json`];
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

    if (payload && Array.isArray(payload.repos) && payload.repos.length > 0) {
      // Prefer a configured repo if available, otherwise pick the first repo in the
      // generated payload. This branch works even when the SUBJECT_REPOS config
      // is missing — giving the build-generated trees a chance to display.
      const repoMap = await getSubjectRepoMap().catch(() => ({} as Record<string, string>));
      const configuredRepo = repoMap[slug];
      let repoEntry = null;
      if (configuredRepo) {
        repoEntry = payload.repos.find((r: any) => String(r.repo).toLowerCase() === String(configuredRepo).toLowerCase());
      }
      if (!repoEntry) repoEntry = payload.repos[0];

      if (!repoEntry || !repoEntry.tree || !Array.isArray(repoEntry.tree.children) || repoEntry.tree.children.length === 0) {
        treeBody.innerHTML = '<p class="subject-tree-empty">No content is available yet.</p>';
        return;
      }

      renderSubjectTree(treeBody, repoEntry.tree.children);
      wireSubjectSampleLinks(container, repoEntry.repo, repoEntry.branch || 'main');
      return;
    }

    // Fallback: query the live registry and use the configured repo as before
    const res = await fetch(`/api/registry?${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Registry fetch failed: ${res.status}`);
    const tree: SubjectTreeNode = await res.json();
    // Respect a configured SUBJECT_REPOS mapping if present; otherwise fall
    // back to using the passed-in slug's repo mapping (may be undefined).
    const repoMap2 = await getSubjectRepoMap().catch(() => ({} as Record<string, string>));
    const repo = repoMap2[slug];
    const repoNode = findRepoNode(tree, repo);

    if (!repoNode || !Array.isArray(repoNode.children) || repoNode.children.length === 0) {
      treeBody.innerHTML = '<p class="subject-tree-empty">No content is available yet.</p>';
      return;
    }

    renderSubjectTree(treeBody, repoNode.children);
    wireSubjectSampleLinks(container, repo, repoNode.children[0]?.branch || 'main');
  } catch (error) {
    console.error('[subjects] failed to load contents tree', error);
    treeBody.innerHTML = '<p class="subject-tree-empty">Could not load contents. Try refreshing.</p>';
  }
}

async function initSubjectShell(slug: string): Promise<void> {
  // The full app shell is the visible mount for subject routes. Keep #subjectLanding
    // as the fallback for standalone subject-fragment pages that have no shell.
    const target = document.querySelector<HTMLElement>('.app-shell') || document.querySelector<HTMLElement>('#subjectLanding') || document.body;
  try {
    const res = await fetch(`/public/subjects/${slug}.html`);
    if (!res.ok) throw new Error('Subject fragment not found');
    const html = await res.text();
    if (!target) return;

    target.innerHTML = html;

    if (!document.querySelector('link[data-subjects-css]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.setAttribute('data-subjects-css', '1');
      l.href = '/public/subjects/subjects.css';
      document.head.appendChild(l);
    }

    const w = window as any;
    // The subject fragment is already HTML. markdownToHTML expects a string,
    // so only initialize interactive markdown behavior on the mounted fragment.
    if (typeof w.initMarkdownFeatures === 'function') w.initMarkdownFeatures(target);

    // Populate the Contents tree and wire sample links to the real file explorer.
    // Only subjects with a #subject-tree mount (science/commerce/humanities today)
    // have one; community/volunteers/admin fragments don't, so this is a no-op there.
    if (target.querySelector('#subject-tree')) {
      void populateSubjectTree(target, slug);
    }
  } catch (err) {
    console.error('[subjects] failed to load subject shell', err);
    if (target) target.innerHTML = '<div class="subject-page"><p>Could not load subject.</p></div>';
  }
}

function subjectSlugFromPath(pathname: string): string | null {
  const first = pathname.replace(/^\/+/, '').split('/')[0]?.toLowerCase();
  return first && SUBJECT_SLUGS.includes(first) ? first : null;
}

function bootstrapSubjectRouting(): void {
  const slug = subjectSlugFromPath(window.location.pathname);
  if (slug) void initSubjectShell(slug);
}

document.addEventListener('DOMContentLoaded', bootstrapSubjectRouting);

// Exposed for the nav links (which do full page loads today, but this keeps the
// function reachable if nav is later switched to client-side routing).
(window as any).initSubjectShell = initSubjectShell;
