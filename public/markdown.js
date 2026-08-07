/**
   * Render raw Markdown to an HTML string.
   * The caller must insert the HTML into the DOM, then call
   * initMarkdownFeatures(containerEl) to activate MathJax / TikZJax / Mermaid / hljs / folds.
   * @param {string}  rawText   – Markdown source (may include YAML front-matter)
   * @param {string}  [filePath] – source file path; used to resolve ![[embed]] URLs
   */
function markdownToHTML(rawText, filePath) {
    /* Expose current file path so resolveEmbed can build correct relative URLs */
    window._currentNotePath = filePath || '';
    /* Strip YAML front-matter before rendering */
    var parsed = window.obsidianParseFrontmatter(rawText);
    /* Render via markdown-it + Obsidian plugin */
    return window.md.render(parsed.content);
}
/**
 * Activate all post-render Obsidian features scoped to a specific DOM element.
 * Must be called AFTER the rendered HTML has been inserted into the DOM.
 * @param {Element} container – the wrapper element that received the HTML
 */
async function initMarkdownFeatures(container) {
    if (typeof window.obsidianInitCalloutFolds === 'function') {
        window.obsidianInitCalloutFolds(container);
    }
    /* TikZ MUST run before MathJax — obsidianInitMath processes the entire
       container including hidden .tikz-source divs. MathJax corrupts their
       textContent by replacing egin{tikzpicture} with error messages.
       Running TikZ first moves the source into <script> elements that
       MathJax skips entirely.                                               */
    if (typeof window.obsidianInitTikz === 'function') {
        window.obsidianInitTikz(container);
    }
    if (typeof window.obsidianInitMath === 'function') {
        await window.obsidianInitMath(container);
    }
    if (typeof window.obsidianInitMermaid === 'function') {
        window.obsidianInitMermaid(container);
    }
    if (typeof window.obsidianInitDesmos === 'function') {
        window.obsidianInitDesmos(container);
    }
    if (typeof window.obsidianInitDesmos3D === 'function') {
        window.obsidianInitDesmos3D(container);
    }
    if (typeof window.obsidianInitHighlight === 'function') {
        window.obsidianInitHighlight(container);
    }
}
