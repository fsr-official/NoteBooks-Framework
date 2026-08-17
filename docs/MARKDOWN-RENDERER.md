
# Markdown Renderer — Feature List

Scope: `public/obsidian-markdown-it.js` (core plugin, ~2,100 lines), `public/markdown.js` (entry point), `public/markdown-editor.js` (editor-side helpers). Built on `markdown-it`, extended with a custom Obsidian-flavor syntax layer plus several diagram/graphing/math renderers.

---

## 1. Current Features

### 1.1 Core syntax extensions (Obsidian-flavored Markdown)


| Feature         | Syntax                                           | Notes                                                  |
| ----------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Comments        | `%% hidden text %%`                              | Stripped from output entirely, not just hidden via CSS |
| Highlight       | `==highlighted text==`                           | Renders as`<mark>`                                     |
| Strikethrough   | `~~text~~`                                       |                                                        |
| Tags            | `#tag`, `#nested/tag`                            | Rendered as clickable tag chips                        |
| Block IDs       | paragraph ending in`^blockid`                    | Enables precise wikilink anchors to a specific block   |
| Wikilinks       | `[[Page]]`, `[[Page|Alias]]`, `[[Page#Heading]]` | Resolved against the content manifest                  |
| Embeds          | `![[file]]`, `![[img|300]]`, `![[img|300x200]]`  | Supports width/height sizing syntax                    |
| Task lists      | `- [ ]`, `- [x]`, `- [/]`, `- [-]`               | Extended states beyond plain done/not-done             |
| Heading anchors | auto-stamped`id="..."` on `h1`–`h6`             | Required for wikilink`#Heading` targets to resolve     |
| Front-matter    | YAML block at top of file                        | Parsed and stripped before rendering                   |

### 1.2 Callouts

Obsidian-style `> [!TYPE]` callouts, foldable with `+` (open) / `-` (closed) modifiers and custom titles.

**24 recognized types** (aliased into 15 visual styles with icons):
`note` · `abstract`/`summary`/`tldr` · `info` · `todo` · `tip`/`hint`/`important` · `success`/`check`/`done` · `question`/`help`/`faq` · `warning`/`caution`/`attention` · `failure`/`fail`/`missing` · `danger`/`error` · `bug` · `example` · `quote`/`cite`

Each renders with its own icon, color, and an optional collapsible chevron.

### 1.3 Math rendering (MathJax)

- Inline math: `$...$`
- Display math: `$$...$$` (both as its own block and inline-within-paragraph)
- Raw LaTeX delimiters: `\(...\)` and `\[...\]`
- Custom block-promotion rule so `$$` blocks are recognized even when adjacent to other block content (e.g., interrupting a paragraph, sitting inside a callout)

### 1.4 Diagrams — Mermaid

- ` ```mermaid` fenced blocks
- Custom **pan/zoom viewer** wrapped around rendered diagrams (drag to pan, scroll/pinch to zoom) — not just static SVG output

### 1.5 Diagrams — TikZ (via TikZJax)

- ` ```tikz` fenced blocks, compiled client-side via TikZJax (WASM)
- Requires cross-origin isolation (COOP/COEP headers, set at the Express app level) for `SharedArrayBuffer` support
- Careful init ordering: TikZ is processed **before** MathJax specifically because MathJax would otherwise corrupt raw `\begin{tikzpicture}` source sitting in hidden divs before TikZJax can consume it

### 1.6 Graphing — Desmos

- ` ```desmos` — 2D graphing calculator embed (`Desmos.GraphingCalculator`)
- ` ```desmos3d` — 3D graphing calculator embed, separate fence language and separate post-render init path
- Both support key=value option parsing in the fence info string (e.g. bounds, expressions)

### 1.7 Code blocks

- Syntax highlighting via Highlight.js
- Language-aware fencing (info string drives the highlighted language)

### 1.8 Embeds & media

- Smart SVG sizer (auto-fits embedded SVGs to their container rather than rendering at native/unbounded size)
- Image embeds via wikilink embed syntax with optional explicit sizing

### 1.9 AI-assisted Markdown intake

- `src/lib/ai-markdown.ts` — a separate structured-content pipeline (schemas for quizzes/flashcards) that sits alongside, but is distinct from, the client-side rendering plugin above. Used for ingesting/normalizing AI-assisted content submissions before they hit the renderer.

### 1.10 Rendering pipeline / lifecycle

- Two-phase render: `markdownToHTML()` (string → HTML, synchronous) then `initMarkdownFeatures(container)` (async, activates all post-render features — TikZ → MathJax → Mermaid → Desmos → Desmos3D → Highlight.js, in that specific dependency order)
- Frontmatter stripped prior to render, exposed separately to callers
- Graceful degradation: explicit fallback markup (`.markdown-preview-fallback`) if the renderer or frontmatter parser fails to initialize, rather than a hard crash
- Per-file path context (`window._currentNotePath`) threaded through so relative embed/wikilink URLs resolve correctly regardless of which file is being viewed

---

## 2. Planned / To-Be-Added Features

### 2.1 SMILES chemical structure rendering (SmilesDrawer) — *engineering, in progress*

Add a ` ```smiles` fenced-block handler, implemented as a direct structural parallel to the existing Mermaid fence handler (same `md.renderer.rules.fence` override pattern, same post-render init hook shape as `obsidianInitMermaid`).

- **Library**: SmilesDrawer, loaded alongside the existing MathJax / Mermaid / Desmos / TikZJax script set
- **Input**: a SMILES string inside the fence, e.g.:
  ````
  ```smiles
  C(C1C(C(C(C(O1)O)O)O)O)O
  ```
  ````
- **Validation targets**: glucose, ATP, and a representative amino acid, to confirm correct rendering before wider rollout
- **Why it's needed**: chemistry notes currently have no structured way to render molecular structures — this closes that gap using the same "fenced block → client-side renderer" pattern already proven for Mermaid/TikZ/Desmos, so it fits the existing architecture rather than introducing a new one

### 2.2 Pre-drawn biology/anatomy SVG library — *sourcing, not engineering*

For recurring biological structures (cells, organelles, organ systems, the nephron, the neuron, etc.), the plan is explicitly **not** to hand-draw these or build new renderer functionality:

- **Source**: openly licensed, textbook-quality diagrams — **OpenStax Biology** is the leading candidate, since it's freely licensed and covers exactly the recurring structures needed
- **Integration path**: once sourced into an asset folder, these are just standard image embeds (`![[diagram.svg]]` / `![[diagram.svg|400]]`) — the existing embed + smart SVG sizer functionality (§1.8) already handles this with **no new renderer code required**
- **Distinction from §2.1**: SMILES is a data-driven renderer (text in, structure out, code required); this is a static-asset problem (image in, no code required) — deliberately kept separate so the sourcing work doesn't get blocked on or conflated with the engineering work

---

## 3. Architectural Notes for Future Additions

The fence-handler pattern used by Mermaid, TikZ, Desmos, and Desmos3D (and now planned for SMILES) is consistent enough to treat as the template for any future embedded-language block:

1. Wrap `md.renderer.rules.fence`, check `token.info` for the target language tag, fall through to `orig(...)` for anything else
2. Emit a placeholder container (e.g. a `<div>` with the raw source stashed in a data attribute or hidden child) rather than rendering the final output synchronously
3. Add a corresponding `obsidianInit<Feature>(container)` function, called from `initMarkdownFeatures()` in `public/markdown.js`, in the correct dependency order relative to existing features (TikZ-before-MathJax is the cautionary example already encoded here)
4. If the feature needs external assets (WASM, worker scripts, heavy JS libraries), load them alongside the existing MathJax/Mermaid/Desmos/TikZJax set rather than introducing a separate loading mechanism
