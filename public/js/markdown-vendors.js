/* Load expensive Markdown rendering vendors only when a preview needs them. */
// ============= COPYLEFT NOTICE (FRONTEND) ===============
// This file is based on Ada (https://github.com/Pratyush-Chanda/Ada)
// Copyright (C) 2025  Pratyush Chanda [Ada]
//
// Modifications and integration into NoteBooks-Framework:
// Copyright (C) 2024-2026  Federation of Socialist Republics,
// United Boys Socialist Republic
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later
// ===========================================================

(function (global) {
  'use strict';

  const scriptPromises = new Map();
  const stylePromises = new Map();

  const scripts = {
    mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js',
    mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    tikz: '/bin/tikzjax/output/tikzjax.js',
    desmos: '/api/desmos.js',
    desmos3d: '/api/desmos3d.js',
    highlight: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js'
  };

  const styles = {
    tikzFonts: '/bin/tikzjax/output/fonts.css',
    highlightLight: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github.min.css',
    highlightDark: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/styles/github-dark.min.css'
  };

  function loadScript(name) {
    if (scriptPromises.has(name)) return scriptPromises.get(name);
    const existing = document.querySelector(`script[data-notebooks-vendor="${name}"]`);
    if (existing) {
      const promise = Promise.resolve();
      scriptPromises.set(name, promise);
      return promise;
    }
    const src = scripts[name];
    if (!src) return Promise.reject(new Error(`Unknown Markdown vendor: ${name}`));
    if (name === 'mathjax' && !global.MathJax) {
      global.MathJax = {
        loader: {
          load: ['[tex]/boldsymbol']
        },
        tex: {
          inlineMath: [['\\(', '\\)']],
          displayMath: [['\\[', '\\]']],
          packages: { '[+]': ['ams', 'boldsymbol'] }
        },
        svg: { fontCache: 'global' },
        startup: { typeset: false },
        options: { ignoreHtmlClass: 'tikz-source' }
      };
    }
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.dataset.notebooksVendor = name;
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromises.delete(name);
        reject(new Error(`Failed to load Markdown vendor: ${name}`));
      };
      document.head.appendChild(script);
    });
    scriptPromises.set(name, promise);
    return promise;
  }

  function loadStyle(name) {
    if (stylePromises.has(name)) return stylePromises.get(name);
    const existing = document.querySelector(`link[data-notebooks-vendor="${name}"]`);
    if (existing) {
      const promise = Promise.resolve();
      stylePromises.set(name, promise);
      return promise;
    }
    const href = styles[name];
    if (!href) return Promise.reject(new Error(`Unknown Markdown vendor stylesheet: ${name}`));
    const promise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.dataset.notebooksVendor = name;
      link.href = href;
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        stylePromises.delete(name);
        reject(new Error(`Failed to load Markdown vendor stylesheet: ${name}`));
      };
      document.head.appendChild(link);
    });
    stylePromises.set(name, promise);
    return promise;
  }

  function has(root, selector) {
    return Boolean(root && root.querySelector(selector));
  }

  async function ensureFor(root) {
    const target = root || document;
    const jobs = [];
    const hasMermaid = has(target, '.obsidian-mermaid:not([data-diagram-deferred])');
    if (has(target, '.math[data-math]')) jobs.push(loadScript('mathjax'));
    if (hasMermaid) jobs.push(loadScript('mermaid'));
    if (has(target, '.tikz-wrapper')) jobs.push(loadStyle('tikzFonts'), loadScript('tikz'));
    if (has(target, '.desmos-block')) jobs.push(loadScript('desmos'));
    if (has(target, '.desmos3d-block')) jobs.push(loadScript('desmos3d'));
    if (has(target, 'pre code')) {
      const mode = global.document?.documentElement?.dataset?.mode || global.document?.documentElement?.dataset?.themeMode;
      jobs.push(loadStyle(mode === 'light' ? 'highlightLight' : 'highlightDark'), loadScript('highlight'));
    }
    await Promise.all(jobs);
    if (hasMermaid && typeof global.mermaid !== 'undefined' && typeof global.mermaid.initialize === 'function') {
      const mode = global.document?.documentElement?.dataset?.mode || global.document?.documentElement?.dataset?.themeMode;
      global.mermaid.initialize({ startOnLoad: false, theme: mode === 'light' ? 'default' : 'dark', securityLevel: 'strict' });
    }
  }

  global.NoteBooksMarkdownVendors = { ensureFor };
})(window);
