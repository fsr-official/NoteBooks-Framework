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

    if (typeof window.obsidianParseFrontmatter !== 'function') {
        window.__markdownRuntimeError = '[markdown] obsidianParseFrontmatter is unavailable';
        console.error(window.__markdownRuntimeError);
        return '<div class="markdown-preview-fallback">Markdown preview unavailable. Frontmatter parser failed to load.</div>';
    }

    /* Strip YAML front-matter before rendering */
    var parsed = window.obsidianParseFrontmatter(rawText);
    /* Render via markdown-it + Obsidian plugin */
    var renderer = typeof window.initializeMarkdownRenderer === 'function'
        ? window.initializeMarkdownRenderer()
        : window.md;
    if (!renderer || typeof renderer.render !== 'function') {
        window.__markdownRuntimeError = window.__markdownRuntimeState && window.__markdownRuntimeState.error
            ? window.__markdownRuntimeState.error
            : '[markdown] renderer unavailable';
        console.error(window.__markdownRuntimeError);
        return '<div class="markdown-preview-fallback">Markdown preview unavailable. The markdown renderer could not be initialized.</div>';
    }
    return renderer.render(parsed.content);
}

window.markdownToHTML = markdownToHTML;
/**
 * Activate all post-render Obsidian features scoped to a specific DOM element.
 * Must be called AFTER the rendered HTML has been inserted into the DOM.
 * @param {Element} container – the wrapper element that received the HTML
 */
async function initMarkdownFeatures(container) {
    if (window.NoteBooksMarkdownVendors && typeof window.NoteBooksMarkdownVendors.ensureFor === 'function') {
        await window.NoteBooksMarkdownVendors.ensureFor(container);
    }
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
