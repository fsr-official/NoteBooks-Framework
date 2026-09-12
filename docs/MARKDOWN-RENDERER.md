# NoteBooks Markdown Renderer

**Status:** active renderer contract for the current static browser client. The renderer lives primarily in `public/js/`; it is not a server-side Markdown-to-HTML service. The server delivers source bytes and metadata, while the browser performs the final reading presentation.

## Architecture and lifecycle

The reader uses a two-phase pipeline. `public/js/markdown.js` calls `markdownToHTML()` to produce safe application markup synchronously, inserts that markup into the preview container, and then calls `initMarkdownFeatures(container)` to activate optional runtimes. `public/js/md-init.js` constructs the Markdown-it instance and registers renderer extensions. `public/js/obsidian-markdown-it.js` supplies Obsidian-flavored parsing and post-render helpers. `public/js/markdown-vendors.js` loads MathJax, Mermaid, TikZJax, Desmos, and Highlight.js only when a rendered document requires them.

This design keeps the first reader paint deterministic and makes vendor failure visible. It also preserves the application’s eager content model: tree artifacts are loaded eagerly, and the renderer does not add lazy subtree or document loading.

| File | Responsibility |
| --- | --- |
| `public/js/markdown.js` | Public rendering entry point, fallback markup, feature initialization, and preview lifecycle. |
| `public/js/md-init.js` | Markdown-it configuration, frontmatter extraction, figure fences, specialized fence registration, and Mermaid setup. |
| `public/js/obsidian-markdown-it.js` | Wikilinks, embeds, callouts, tasks, tags, highlights, heading anchors, math, diagram placeholders, and compatibility behavior. |
| `public/js/markdown-vendors.js` | On-demand CDN vendor loading and selected theme/security configuration. |
| `public/js/app.js` | Fetches the selected Markdown source, sets `window._currentNotePath`, owns preview/raw/source actions, and starts the renderer. |
| `public/css/style.css` | Reader width, heading scale, code, callouts, figures, captions, and theme tokens. |
| `src/api/raw.ts` | Canonical source-byte delivery and path/repository validation. |
| `src/api/system.ts` | Eager stream tree discovery and repository metadata used to locate notes. |

## Supported syntax

| Feature | Author syntax | Render behavior |
| --- | --- | --- |
| Markdown core | Headings, lists, tables, links, blockquotes, code | Markdown-it output with application styling. |
| Frontmatter | YAML-like block at the beginning of a note | Extracted as metadata and removed from the visible body. |
| Wikilinks | `[[Page]]`, `[[Page|Alias]]`, `[[Page#Heading]]` | Resolved through the current repository/tree context. |
| Embeds | `![[file.svg]]`, `![[image.svg|300]]`, `![[image.svg|300x200]]` | Responsive media with optional dimensions. |
| Callouts | `> [!NOTE]`, `> [!TIP]+`, `> [!WARNING]-` | Semantic, optionally foldable note blocks. |
| Highlights/tags | `==important==`, `#biology`, `#chemistry/setup` | `<mark>` emphasis and navigable tag styling. |
| Tasks | `- [ ]`, `- [x]`, `- [/]`, `- [-]` | Extended task states with accessible state labels. |
| Block IDs/headings | `^block-id`, automatic heading IDs | Stable links for internal references. |
| Inline/display math | `$x^2$`, `$$E=mc^2$$`, `\(...\)`, `\[...\]` | MathJax enhancement with source fallback. |
| Mermaid | ` ```mermaid` | Client-side diagram rendering; strict security and selected light/dark theme. |
| TikZ | ` ```tikz` | TikZJax/WASM rendering; processed before MathJax to preserve TikZ source. |
| Desmos | ` ```desmos`, ` ```desmos3d` | Interactive 2D/3D graphing with supported options. |
| Code | ` ```typescript`, ` ```python`, and other language fences | Highlight.js enhancement and reader-controlled wrapping. |
| Biology figures | ` ```bio`, ` ```biology` | Accessible static figure with caption/source support. |
| Chemistry figures | ` ```chem-setup`, ` ```chemistry` | Accessible experimental-setup figure with the same contract. |

The recognized Obsidian callout aliases include note, abstract/summary/tldr, info, todo, tip/hint/important, success/check/done, question/help/faq, warning/caution/attention, failure/fail/missing, danger/error, bug, example, and quote/cite. Aliases map to a smaller set of visual styles so the reader remains consistent.

## Biology and chemistry figure fences

Static educational diagrams use a small key-value convention rather than arbitrary inline HTML:

````markdown
```bio
src: /assets/diagrams/starter/biological-cell.svg
alt: Labeled cross-section of a biological cell
caption: Major cell structures and their relative locations.
source: /assets/diagrams/starter/ATTRIBUTIONS.md
```

```chem-setup
src: /assets/diagrams/starter/simple-distillation-apparatus.svg
alt: Simple distillation apparatus
caption: Flask, condenser, receiver, and heat source.
```
````

The accepted keys are `src` or `image`, `alt`, `caption`, and `source`. The renderer emits a semantic `<figure>` and responsive image with an optional `<figcaption>`. URLs are limited to safe same-origin or HTTPS paths; unsafe `javascript:`, `data:`, `blob:`, `file:`, and protocol-relative values are rejected. A missing source produces a clear explanatory fallback rather than a broken image. The aliases `biology` and `chemistry` are accepted for author convenience.

Uploaded diagrams use the same visual contract. The protected upload path can sanitize a native SVG (`mode: vector`) or package a raster image as an SVG containing a transparent-background PNG (`mode: embedded-raster`). The latter is an SVG container, not true vector tracing. The original name and derivative metadata remain attached to the review record.

## Security model

Markdown from repository content and user-submitted Markdown must not be treated as equivalent trust domains. The renderer constrains figure URLs and does not inject arbitrary HTML for figure fences. Mermaid is configured with `securityLevel: 'strict'`; the selected NoteBooks theme mode is used instead of relying only on the operating-system preference. The existing general Markdown-it HTML behavior remains a compatibility boundary and should be narrowed or source-scoped in a future hardening pass rather than silently changed in a way that breaks trusted notes.

TikZJax requires the server’s cross-origin isolation headers for `SharedArrayBuffer` support. This is a deployment requirement, not a reason to expose new cross-origin write behavior. Vendor runtimes are loaded from their configured CDN sources, and missing or blocked vendors must leave the source-visible fallback.

## Backend handoff

The renderer does not discover repositories or invent raw URLs. The browser first receives a selected file from an eager stream tree. `app.js` carries the repository-relative path into the preview context. Source text is fetched through the canonical raw delivery flow, rendered locally, and kept associated with the repository, branch, path, and commit/snapshot metadata. When the reader’s selection-to-suggest action is used, the same metadata plus exact line range and source text is sent to the Issues proposal endpoint.

This separation means that Markdown presentation can evolve without changing publication authority. GitHub remains the content source, generated trees remain discovery artifacts, `raw.ts` remains byte delivery, and GitHub PR review remains the protected publication path.

## Extension pattern

New fenced features should follow the established pattern:

1. Detect a narrowly named fence in the Markdown-it fence rule and fall through unchanged for all other languages.
2. Validate and normalize input before emitting a placeholder or figure.
3. Add a focused post-render initializer only when a runtime library is genuinely required.
4. Load external vendors through `markdown-vendors.js`, preserving graceful fallbacks.
5. Add browser-static and regression tests, update this contract, and verify both light and dark theme modes.

SMILES molecular rendering remains a future capability. It should be added only after a maintained, appropriately licensed library is selected and input validation/fallback behavior are tested. It must not be conflated with the current chemistry experimental-setup figure fence.

## Acceptance checks

A renderer change is complete when ordinary Markdown remains readable, H1/H2/H3/H4 hierarchy is visually coherent, figures remain responsive in both theme modes, captions and source links are accessible, unsafe figure URLs are rejected, Mermaid remains strict, optional vendor failure is visible, source evidence still contains correct line metadata, and the full test/build pipeline passes. The current client cache contract is `webman-v31`; changes to renderer scripts or CSS require a service-worker version update and frontend regression assertion.

## References

The current architecture and backend boundaries are documented in [`docs/phase1/REAL-ARCHITECTURE.md`](phase1/REAL-ARCHITECTURE.md). The upload conversion and licensing plan is in [`docs/phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md`](phase2-3/DIAGRAM-ASSET-AND-RENDERER-PLAN.md). Starter image licenses are in [`public/assets/diagrams/starter/ATTRIBUTIONS.md`](../public/assets/diagrams/starter/ATTRIBUTIONS.md).
