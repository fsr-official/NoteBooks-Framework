/* Load expensive Markdown rendering vendors only when a preview needs them. */
(function (global) {
  'use strict';

  const scriptPromises = new Map();
  const stylePromises = new Map();

  const scripts = {
    mathjax: 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg.js',
    mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js',
    tikz: '/public/bin/tikzjax/output/tikzjax.js',
    desmos: '/api/desmos.js',
    highlight: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.10.0/highlight.min.js'
  };

  const styles = {
    tikzFonts: '/public/bin/tikzjax/css/fonts.css',
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
      script.onerror = () => reject(new Error(`Failed to load Markdown vendor: ${name}`));
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
      link.onerror = () => reject(new Error(`Failed to load Markdown vendor stylesheet: ${name}`));
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
    if (has(target, '.math[data-math]')) jobs.push(loadScript('mathjax'));
    if (has(target, '.obsidian-mermaid')) jobs.push(loadScript('mermaid'));
    if (has(target, '.tikz-wrapper')) jobs.push(loadStyle('tikzFonts'), loadScript('tikz'));
    if (has(target, '.desmos-block, .desmos3d-block')) jobs.push(loadScript('desmos'));
    if (has(target, 'pre code')) {
      jobs.push(loadStyle('highlightLight'), loadStyle('highlightDark'), loadScript('highlight'));
    }
    const results = await Promise.allSettled(jobs);
    results.forEach((result) => {
      if (result.status === 'rejected') console.warn('[markdown-vendors]', result.reason);
    });
    if (has(target, '.obsidian-mermaid') && typeof global.mermaid !== 'undefined' && typeof global.mermaid.initialize === 'function') {
      const mode = global.document?.documentElement?.dataset?.themeMode;
      global.mermaid.initialize({ startOnLoad: false, theme: mode === 'light' ? 'default' : 'dark', securityLevel: 'strict' });
    }
  }

  global.NoteBooksMarkdownVendors = { ensureFor };
})(window);
