/* Set up markdown-it + Obsidian plugin once, reuse for all previews */
window.__markdownRuntimeState = window.__markdownRuntimeState || {
    status: 'idle',
    error: null,
    renderer: null,
    retries: 0
};

function escapeMarkdownHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character];
    });
}
function parseDiagramFence(content) {
    var result = { src: '', alt: '', caption: '', source: '' };
    String(content || '').split(/\r?\n/).forEach(function (line) {
        var match = line.match(/^\s*(src|image|alt|caption|source)\s*:\s*(.*?)\s*$/i);
        if (match)
            result[match[1].toLowerCase() === 'image' ? 'src' : match[1].toLowerCase()] = match[2];
    });
    return result;
}
function safeDiagramUrl(value) {
    var url = String(value || '').trim();
    if (!url || /^(?:javascript|data|blob|file):/i.test(url) || /^\/\//.test(url))
        return '';
    if (/^https?:\/\//i.test(url))
        return url;
    return url.charAt(0) === '/' ? url : '/' + url.replace(/^\.\//, '');
}
function renderDiagramFence(token, language) {
    var meta = parseDiagramFence(token.content);
    var src = safeDiagramUrl(meta.src);
    var domain = language === 'chem-setup' || language === 'chemistry' ? 'chemistry' : 'biology';
    var label = meta.alt || (domain === 'chemistry' ? 'Chemistry experimental setup' : 'Biological diagram');
    if (!src) {
        return '<div class="diagram-figure diagram-figure-missing" role="note"><strong>Diagram image needed.</strong><span>Add <code>src: /assets/diagrams/…</code> to this ' + escapeMarkdownHtml(language) + ' block.</span></div>\n';
    }
    var source = safeDiagramUrl(meta.source);
    var sourceMarkup = source ? '<a class="diagram-source" href="' + escapeMarkdownHtml(source) + '" target="_blank" rel="noopener noreferrer">Source</a>' : '';
    var caption = meta.caption ? '<figcaption>' + escapeMarkdownHtml(meta.caption) + sourceMarkup + '</figcaption>' : (sourceMarkup ? '<figcaption>' + sourceMarkup + '</figcaption>' : '');
    return '<figure class="note-figure diagram-figure diagram-' + domain + '" data-diagram-domain="' + domain + '">' +
        '<img src="' + escapeMarkdownHtml(src) + '" alt="' + escapeMarkdownHtml(label) + '" decoding="async">' + caption + '</figure>\n';
}

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
    /* Keep fence metadata honest: unlabeled fences stay neutral and never receive an inferred language. */
    var pluginFence = md.renderer.rules.fence;
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
        var token = tokens[idx];
        var info = String(token.info || '').trim();
        var language = (info.split(/\s+/)[0] || '').toLowerCase();
        if (language === 'bio' || language === 'biology' || language === 'chem-setup' || language === 'chemistry')
            return renderDiagramFence(token, language);
        /* Preserve specialized Obsidian fence renderers (Mermaid, TikZ, Desmos). */
        if ((language === 'mermaid' || language === 'tikz' || language === 'desmos' || language === 'desmos3d') && pluginFence)
            return pluginFence(tokens, idx, options, env, self);
        var safeLanguage = language.replace(/[^a-zA-Z0-9_-]/g, '');
        var className = safeLanguage ? ' class="language-' + safeLanguage + '"' : '';
        var label = language ? '<span class="code-language-label">' + escapeMarkdownHtml(language) + '</span>' : '';
        var code = escapeMarkdownHtml(token.content);
        return '<div class="code-block-shell">' + label + '<pre><code' + className + '>' + code + '</code></pre></div>\n';
    };
    /* Inject companion CSS once */
    if (!document.getElementById('obsidian-plugin-css') && typeof window.obsidianGetCSS === 'function') {
        var styleEl = document.createElement('style');
        styleEl.id = 'obsidian-plugin-css';
        styleEl.textContent = window.obsidianGetCSS();
        document.head.appendChild(styleEl);
    }
    /* Initialise Mermaid (startOnLoad:false — we call mermaid.run() manually) */
    if (typeof mermaid !== 'undefined') {
        var mermaidMode = document.documentElement && document.documentElement.dataset.themeMode;
        var mermaidTheme = mermaidMode === 'light' ? 'default' : 'dark';
        mermaid.initialize({ startOnLoad: false, theme: mermaidTheme, securityLevel: 'strict' });
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
