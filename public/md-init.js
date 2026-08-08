/* Set up markdown-it + Obsidian plugin once, reuse for all previews */
window.__markdownRuntimeState = window.__markdownRuntimeState || {
    status: 'idle',
    error: null,
    renderer: null,
    retries: 0
};

window.initializeMarkdownRenderer = function () {
    if (window.__markdownRuntimeState.renderer && typeof window.__markdownRuntimeState.renderer.render === 'function') {
        return window.__markdownRuntimeState.renderer;
    }

    if (window.__markdownRuntimeState.status === 'failed') {
        return null;
    }

    if (typeof window.markdownit !== 'function') {
        window.__markdownRuntimeState.status = 'failed';
        window.__markdownRuntimeState.error = '[markdown] markdown-it is unavailable';
        window.__markdownRuntimeState.retries += 1;
        console.error(window.__markdownRuntimeState.error);
        return null;
    }
    if (typeof window.obsidianPlugin !== 'function') {
        window.__markdownRuntimeState.status = 'failed';
        window.__markdownRuntimeState.error = '[markdown] Obsidian plugin is unavailable';
        window.__markdownRuntimeState.retries += 1;
        console.error(window.__markdownRuntimeState.error);
        return null;
    }

    var md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true,
        breaks: false
    });
    /* Optional markdown-it CDN plugins (check globals before using) */
    if (typeof window.markdownitSub === 'function')
        md.use(window.markdownitSub);
    if (typeof window.markdownitSup === 'function')
        md.use(window.markdownitSup);
    if (typeof window.markdownitFootnote === 'function')
        md.use(window.markdownitFootnote);
    /* Obsidian-specific syntax (wikilinks, callouts, embeds, tags, math,
       task lists, strikethrough, mermaid, code highlighting …)            */
    md.use(window.obsidianPlugin, {
        enableTikz: true, /* enable ```tikz fenced block → .tikz-source div */
        enableMermaid: true, /* enable ```mermaid fenced block rendering        */
        resolveWikilink: function (target, alias, anchor) {
            return '#' + encodeURIComponent(target) + (anchor ? '%23' + encodeURIComponent(anchor) : '');
        },
        resolveEmbed: function (fileName) {
            /* Resolve embed path relative to the currently-rendering note's directory */
            var base = window._currentNotePath || '';
            if (!base)
                return fileName;
            var dir = base.substring(0, base.lastIndexOf('/') + 1);
            return dir + fileName;
        },
        resolveTag: function (tag) { return '#tag-' + encodeURIComponent(tag); }
    });
    /* Inject companion CSS once */
    if (!document.getElementById('obsidian-plugin-css') && typeof window.obsidianGetCSS === 'function') {
        var styleEl = document.createElement('style');
        styleEl.id = 'obsidian-plugin-css';
        styleEl.textContent = window.obsidianGetCSS();
        document.head.appendChild(styleEl);
    }
    /* Initialise Mermaid (startOnLoad:false — we call mermaid.run() manually) */
    if (typeof mermaid !== 'undefined') {
        var mermaidTheme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'default';
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme, securityLevel: 'loose' });
        /* Re-initialise when the OS colour scheme changes at runtime */
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
                mermaid.initialize({ startOnLoad: false, theme: e.matches ? 'dark' : 'default', securityLevel: 'loose' });
            });
        }
    }
    /* Expose the configured instance globally */
    window.md = md;
    window.__markdownRuntimeState.renderer = md;
    window.__markdownRuntimeState.status = 'ready';
    window.__markdownRuntimeState.error = null;
    return md;
};

window.__markdownRuntimeError = null;
window.__markdownRuntimeState.status = 'pending';
