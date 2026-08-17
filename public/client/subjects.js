"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSubjectShell = initSubjectShell;
async function initSubjectShell(slug) {
    const target = document.querySelector('#subjectLanding') || document.querySelector('.app-shell') || document.body;
    try {
        const res = await fetch(`/public/subjects/${slug}.html`);
        if (!res.ok)
            throw new Error('Subject fragment not found');
        const html = await res.text();
        if (target) {
            // Clear previous
            target.innerHTML = html;
            // Add stylesheet if not already present
            if (!document.querySelector('link[data-subjects-css]')) {
                const l = document.createElement('link');
                l.rel = 'stylesheet';
                l.setAttribute('data-subjects-css', '1');
                l.href = '/public/subjects/subjects.css';
                document.head.appendChild(l);
            }
            // Initialize markdown and runtime features if available
            // markdownToHTML and initMarkdownFeatures are in public/markdown.js
            if (window.markdownToHTML) {
                window.markdownToHTML(target);
            }
            if (window.initMarkdownFeatures) {
                window.initMarkdownFeatures(target);
            }

                    // Load subject tree JSON (generated at build time) and render repository/file tree
                    (async function loadAndRenderTree() {
                        try {
                            const treeRes = await fetch(`/public/${slug}-tree.json`);
                            if (!treeRes.ok) return;
                            const idx = await treeRes.json();
                            const container = target.querySelector('#subjectTree') || (function() {
                                const el = document.createElement('div');
                                el.id = 'subjectTree';
                                el.className = 'subject-tree';
                                target.appendChild(el);
                                return el;
                            })();

                            function renderNode(node, parentEl, repoName) {
                                if (!node) return;
                                if (node.type === 'file') {
                                    const a = document.createElement('a');
                                    a.textContent = node.name || node.path || 'file';
                                    // Link to subject-scoped path so service-worker can intercept
                                    const relPath = repoName ? `${repoName}/${(node.path || node.repoPath || '').replace(/^\/+/, '')}` : (node.path || node.repoPath || '');
                                    a.href = `/${slug}/${relPath}`;
                                    a.className = 'subject-file-link';
                                    parentEl.appendChild(a);
                                    return;
                                }
                                // folder
                                const details = document.createElement('details');
                                const summary = document.createElement('summary');
                                summary.textContent = node.name || 'folder';
                                details.appendChild(summary);
                                const list = document.createElement('div');
                                list.className = 'subject-folder-children';
                                details.appendChild(list);
                                parentEl.appendChild(details);
                                const children = Array.isArray(node.children) ? node.children : [];
                                for (const c of children) renderNode(c, list, repoName);
                            }

                            container.innerHTML = '';
                            const repos = Array.isArray(idx.repos) ? idx.repos : [];
                            for (const repoEntry of repos) {
                                const repoDiv = document.createElement('div');
                                repoDiv.className = 'subject-repo';
                                const h = document.createElement('h3');
                                h.textContent = repoEntry.repo || repoEntry.repo || repoEntry.name || 'repo';
                                repoDiv.appendChild(h);
                                const treeRoot = repoEntry.tree || null;
                                if (treeRoot) {
                                    // render children of the repo root
                                    const content = document.createElement('div');
                                    content.className = 'subject-repo-tree';
                                    const children = Array.isArray(treeRoot.children) ? treeRoot.children : [];
                                    for (const c of children) renderNode(c, content, treeRoot.name || repoEntry.repo);
                                    repoDiv.appendChild(content);
                                }
                                container.appendChild(repoDiv);
                            }
                        } catch (e) {
                            console.warn('[subjects] tree render failed', e?.message || e);
                        }
                    })();
        }
    }
    catch (err) {
        console.error('[subjects] failed to load subject shell', err);
        if (target)
            target.innerHTML = '<div class="subject-page"><p>Could not load subject.</p></div>';
    }
}
