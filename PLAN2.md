# PLAN v3: Reader redesign + renderer in Next.js

Scope: the note reader (markdown → rendered note, brackets, outline, search, AI panel).
Not in scope: landing page, auth, chat backend.

How to use: approve the plan, then say `continue` once per phase.

---

## 1. Decisions locked

| Decision | Result |
|---|---|
| Framework | Shell **and** renderer move to Next.js (App Router). Renderer is rewritten anyway, so moving it costs little extra. |
| TikZJax | Stays client-side. No pre-rendering. Bin/wasm files served from `/public`, loaded client-only. |
| Callout colors | Kept: one color per callout type (section 6). |
| Headings | Each H1/H2/H3/H4 section gets a colored bracket with a short underline beneath the heading, tied to its outline entry (section 5). |
| Left rail | Section outline: current section expanded, faded rows for the sections before and after, scroll-synced with the notes, search above it (section 7). |
| Mindmap | Parked for later (section 13). |
| Text colors | Every text color in the renderer comes from the active theme (section 9). No hardcoded colors. |
| Right margin | AI chat panel (section 8). |

The core problem is not CSS. It is that the renderer outputs a flat list of elements, so nothing knows where a section starts or ends. Spacing, brackets, outline, scroll sync and search all need that. Fix the renderer's output first and the rest becomes simple.

---

## 2. Renderer: output a section tree, not a flat list

```
renderNote(markdown, options) → { html, tree, searchIndex, figures }
```

- Pure function, no DOM, no framework. Runs in Node (tests), in Next.js server components, anywhere.
- Parse markdown → group by heading depth → **nested `<section>` elements**:

```html
<section data-level="1" data-id="s1" data-n="1">
  <h1>Introduction…</h1>
  <section data-level="2" data-id="s1-1" data-n="1.1">
    <h2>What is a rigid body?</h2>
    …blocks…
    <section data-level="3" …>…</section>
  </section>
</section>
```

- `tree` is the same structure as plain data (id, number, title, level, children). The outline, brackets, scroll sync and progress all read from it. One source of truth.
- `searchIndex` is a flat list of text blocks (section id, block id, plain text) used by Notes-mode search.
- Callouts become `<aside class="callout" data-type="definition">`. Existing note syntax is not changed.
- Math (KaTeX) rendered on the server so there is no layout jump.
- TikZ blocks become placeholders; TikZJax fills them in on the client.

---

## 3. Layout

```
┌──────────┬────────┬──────────────────────┬─────────────┐
│ Left rail│ bracket│  content (68ch)      │ AI panel    │
│ Search + │ gutter │                      │ (right      │
│ Outline  │  48px  │                      │  margin)    │
│ 360px    │        │                      │  340px      │
└──────────┴────────┴──────────────────────┴─────────────┘
```

- Content is left-aligned, never justified.
- Left rail closed → content re-centers. AI panel closed → it collapses to a slim tab.
- The Outline rail is 340–360px on wide layouts and 280–300px at medium widths; it becomes a drawer under ~1100px. The note text keeps its current 82ch width as a minimum when space allows and expands up to 110ch when the center column has room. The AI panel collapses to a drawer below 1600px. On narrow screens the four bracket levels use a compact gutter.

---

## 4. Spacing system (the "taste" part)

One rule drives most of it: **space above a heading is about 3× the space below it**, so a heading attaches to what follows. Unit = one body line (about 1.7em). Starting values, to tune on real notes:

| Between | Gap |
|---|---|
| paragraph → paragraph | 0.75 line |
| heading → its first block | 0.5 line |
| text → callout / table / equation / figure | 1 line above and below |
| callout → callout | 0.75 line |
| before an H3 | 2 lines |
| before an H2 | 3 lines |
| before an H1 | 5 lines + hairline rule |
| inside a callout | 0.75 line vertical, 1 line horizontal padding; title → body 0.4 line |

Implemented once, using the section wrappers (`section > * + *` for block gaps, heading margins by level). No per-element one-off margins.

---

## 5. Brackets and heading underlines

Each H1/H2/H3/H4 section gets one connected mark in the gutter. The spine **overhangs**: it starts well above the heading and ends well below the section's last block, like a real square bracket. The chapter bracket is outermost, and each nested level moves inward at both ends. Top and bottom enclosure lines span the section, the heading underline meets the spine, and the active bracket and underline glow together.

```
 ┌─╴                  top cap: well above the heading
 │
 │  1.2  Types of motion
 ├──────────────╴     underline: from the spine, under the heading text
 │  body, callouts, tables…
 │
 └─╴                  end cap: well below the last block
```

- **Drawing:** spine + both caps on the `section` (`::before`, with negative top/bottom offsets for the overhang); the underline on the heading (`::after`). All one color per level.
- **Overhang by level:** H1 0.9 line, H2 0.6, H3 0.4. Outer levels overhang more, so a parent's caps never collide with its children's.
- **Gap rule:** the gap before any heading must be at least 2× that level's overhang, so neighboring brackets never touch (the spacing table in section 4 already satisfies this).
- **Nesting:** H1 spine outermost (about -44px), H2 (-30px), H3 (-16px).
- **Weight:** H1 3px, H2 2px, H3 1.5px. Underline runs from the spine to the end of the heading text.
- **Color:** by level, from the theme's tones (`--tone-1/2/3`), underline and bracket the same color. Not one hue per section.
- **Why not a hue per section:** callouts are also color-coded. A blue bracket beside a blue Definition callout would mean two different things.
- **States:** idle about 35% opacity. The section in view and its parents go to 100%. Hover shows number + title.
- **Linked to the outline:** each outline entry carries the same colored mark. Hover one and the other highlights. Click a bracket to flash its outline entry.
- **Risk:** the most likely place for the page to look busy again. Test in Phase 3 on the reference notes. Fallback: stream color only, depth shown by thickness and opacity.

---

## 6. Callouts (kept)

Same semantic colors, one family: OKLCH with the same lightness and chroma, only hue changes, so they read as a set in every theme, light or dark.

| Type | Hue |
|---|---|
| Definition | blue (250) |
| Key Principle | green (160) |
| Formula | amber (85) |
| Warning / Common mistake | red (25) |
| Example | purple (310) |
| JEE/NEET tip | orange (55) |

```css
.callout { --h: 250;
  --c: oklch(72% 0.13 var(--h));
  background: color-mix(in oklab, var(--c) 10%, var(--surface-1));
  border-left: 3px solid var(--c); }
```

Light mode uses lower lightness (~45%) for border and label. Label in sentence case with a small icon. Definition and Formula get the strongest tint. The callout's left border must not collide with the bracket gutter (24px clear space).

---

## 7. Left rail: section outline and search

A **section** is an H1 and everything under it.

### What the outline shows

Only three sections at a time: the current one in full, and one faded row on each side.

```
 ┌────────────────────────┐
 │ 🔍 Search…  [Outline|Notes] │
 ├────────────────────────┤
 │   1  Introduction        │  faded: previous section
 │ ┌ 2  Rotational motion   │
 │ │   2.1 Angular velocity │  current section: its H1,
 │ │   2.2 Angular accel.   │  H2 and H3 entries
 │ │     2.2.1 …            │
 │ └                        │
 │   3  Torque              │  faded: next section
 └────────────────────────┘
```

- **First section:** the row above reads "The start of the document" (click: jump to top).
- **Last section:** the row below reads "The end of the document" (click: jump to bottom).
- Faded rows are clickable and jump to that section.
- When the current section changes, the window shifts: the old one collapses to a faded row and the next one expands. Short crossfade; none under `prefers-reduced-motion`.
- Each entry carries the same colored mark as its bracket in the notes, filled when passed, highlighted when current, hollow when upcoming.
- Open by default on wide screens. Toggle button + `o`. Choice remembered. Drawer under ~1100px.

### Two-way scroll sync

- **Anchors:** every heading has a position in the notes and a position in the outline. A position in one pane maps to the other by linear interpolation between the neighboring anchors, so scrolling stays continuous.
- **Focus line:** a fixed line about 40% down the outline matches the reading line about 30% down the notes. The heading at the focus line is the heading at the reading line.
- Scroll the notes and the outline follows. Scroll the outline and the notes follow.
- **One driver at a time:** the pane that got the last wheel, touch, key or drag input drives until about 150ms after it stops. The follower is moved with instant scrolls and its scroll events are ignored while it is moved. This prevents feedback loops.
- Anchors are recalculated on resize and whenever the note's height changes (`ResizeObserver`). TikZ figures render late and shift everything below them.
- **Docked rail only.** In drawer mode (narrow screens) the drawer does not drive the notes. Tap an entry to jump.
- **Riskiest piece of the whole plan.** Phase 5 starts with a standalone prototype on a long note before anything is built around it. Fallback if it feels like the panes fight: the outline always follows the notes, and the notes follow the outline only on click or while dragging a thin scrubber.

### Search (bar above the outline, `/` focuses it)

- **Mode switch:** Outline | Notes. The last mode is remembered.
- **Wildcards in both modes:** `*` = any run of characters, `?` = exactly one character, case-insensitive, matching anywhere in the text. Example: `ang*vel` finds "angular velocity". All other characters are matched literally. A query with only wildcards is ignored.
- **Outline mode:** searches heading titles and numbers. While a query is active the results replace the three-section window: number + title with the matched part in bold. Enter or click jumps. Esc clears and returns to the window.
- **Notes mode:** searches the text of paragraphs, lists, table cells, callouts and headings. Equations are not searched in v1. Results are grouped by section with a short snippet each and a total ("12 matches in 4 sections"). Click jumps to the match and highlights all matches on the page (CSS Custom Highlight API, `<mark>` fallback). Enter / Shift+Enter move between matches. Capped at 200 results.
- Runs entirely in the browser against `searchIndex`. Debounced about 120ms.

---

## 8. Right margin: AI panel

- Collapsed to a slim tab by default. Opens by toggle, or when the reader selects text and picks "Explain this".
- Knows the current section from `tree` plus any selected text. Messages can be anchored to a section and show the matching bracket color.
- Stateless: each request carries the section text, the selection and the last few messages. No server-side session needed.
- This plan builds the panel UI only. The backend is a separate plan.

---

## 9. Tokens and type

Color roles are theme-driven (every theme has light and dark):

```css
:root {
  --bg: ; --surface-1: ; --surface-2: ; --line: ;
  --text: ; --text-muted: ;
  --stream: ; --stream-soft: ;       /* Science / Commerce / Humanities */
  --tone-1: ; --tone-2: ; --tone-3: ; --tone-4: ; /* H1 / H2 / H3 / H4 brackets */
}
```

| Role | Choice |
|---|---|
| Body | Literata (alt: Source Serif 4), 17–18px, line-height 1.7, max ~68ch |
| Headings + UI | one sans with character; test 2 candidates (e.g. Bricolage Grotesque, Schibsted Grotesk) on a sample page |
| Code, paths | JetBrains Mono, only there |
| Math | KaTeX default fonts |

**Text colors follow the theme.** Text roles are tokens, per theme and per light/dark:

```css
:root {
  --text: ;         /* body */
  --text-strong: ;  /* headings, bold terms */
  --text-muted: ;   /* captions, meta, numbers */
  --link: ;
  --code-text: ;
}
```

- No hardcoded colors in the renderer's CSS, and no inline `style` colors in its HTML output.
- KaTeX inherits `currentColor`. TikZ is recolored to `currentColor`. Mermaid gets `themeVariables`. Callout labels use their hue, adjusted to stay readable on the theme.
- Automated check: every theme × light/dark must reach 4.5:1 for body text on `--bg`, and 3:1 for brackets and large headings. A theme that fails is flagged before it ships.

Single type scale (~1.2 ratio). Fonts self-hosted via `next/font`. No all-caps labels or eyebrows; hierarchy comes from size, weight and the section number inside the heading.

---

## 10. Other components

| Component | Rule |
|---|---|
| Tables | Header on `--surface-2`, 2px stream-color bottom border, normal-case muted text, row padding 10–12px, faint zebra, `overflow-x: auto` wrapper |
| Equations | Display math on `--surface-2`, centered, ~1.15× size |
| TikZ figures | Black-on-transparent SVG vanishes on dark themes. After TikZJax renders, recolor strokes/fills to `currentColor`; fall back to a light card for complex figures. Caption style included. |
| Code | `--surface-2`, mono, copy button |
| Worked examples | `<details>`, optional revision mode closes them by default |

---

## 11. Phases

**Phase 0: Baseline.** Pick 5 reference notes (heavy tables, TikZ, equation-heavy, very long chapter, mobile width). Playwright screenshots, light + dark, 2 themes. *Done when* screenshots are saved.

**Phase 1: Renderer core.** `renderNote` as a pure module producing the section tree, `searchIndex`, callout mapping, server-side KaTeX. Tests in Node on the reference notes. *Done when* the tree, index and HTML are correct for all 5 notes.

**Phase 2: Next.js shell.** Reader route, GitHub fetch with caching and a token, TikZJax client-only with bin files in `/public`, theme and outline state applied before paint (no flash). *Done when* the 5 notes render in Next.js at parity with Phase 0, unstyled.

**Phase 3: Layout, tokens, type, spacing, brackets.** Sections 3, 4, 5, 9. *Done when* a note with no callouts or tables already looks clean, brackets (with overhang) and underlines pass the busy-ness check, and the contrast check passes on every theme.

**Phase 4: Components.** Callouts, tables, equations, figures, code, examples (sections 6 and 10). *Done when* all 5 notes look right in light and dark on 2 themes with no hardcoded colors.

**Phase 5: Outline window + two-way scroll sync.** Starts with a standalone sync prototype. Then the three-section window, start/end rows, colored marks, toggle, drawer. *Done when* a 40-section chapter can be read and navigated from either pane, the panes never fight, and the outline stays correct after TikZ figures load.

**Phase 6: Search.** Outline mode and Notes mode with wildcards (section 7). *Done when* `ang*vel` finds the right heading in Outline mode and the right text in Notes mode on the reference notes, with highlights and next/previous working.

**Phase 7: AI panel UI.** Section 8, UI only. *Done when* it opens from text selection with the right section context.

**Phase 8: Extras.** Header cleanup (Library, outline toggle, one "more" menu), reading progress saved per note, font-size toggle, sepia, print stylesheet.

### Implementation status and verification — 2026-11-17

| Phase | Status | Verification |
|---|---|---|
| 0 — Baseline | Complete | The five-reference baseline matrix is saved under `design/reader-baseline/`. |
| 1 — Renderer core | Complete | Renderer tests cover nested sections, IDs, callouts, KaTeX, diagrams, links, code, Obsidian syntax, and 42 generated subsections. All five references rendered through the reader route. |
| 2 — Next.js shell | Complete | All five reference routes returned successfully. The saved Paper/light theme, custom colors, outline preference, and route-scoped self-hosted reader fonts were smoke-tested. |
| 3 — Layout and tokens | Complete | Desktop layout, bracket states, and 390px mobile layout were checked; the mobile content remained 321px wide without horizontal overflow. Contrast tests pass for every theme preset and light/dark mode. |
| 4 — Note components | Complete for available fixtures | Tables, KaTeX, code, and Mermaid were checked on the reference notes; all 28 Mermaid diagrams in the diagram reference rendered. No usable TikZ fixture was found, so visual TikZ parity remains unverified. |
| 5 — Outline and navigation | Complete using the documented fallback | A 199-heading chapter and a 60-heading Mermaid note were navigated. Notes scrolling updates the active heading/brackets; outline clicks jump to notes. Continuous outline-pane scrolling does not drive the notes; this intentionally uses the fallback to avoid competing scroll drivers. TikZ-after-render behavior could not be fixture-tested. |
| 6 — Search | Complete | The real table note returned 3 Outline and 4 Notes matches for `dec*sys`; `ang*vel` matching is covered by the unit test. Enter, Shift+Enter, grouped results, highlighting, and Escape were checked in the reader. |
| 7 — AI panel | Complete (UI only) | Selecting note text opens the panel with the selected excerpt and current section context. No response backend is included by design. |
| 8 — Extras | Complete | Per-note progress restored to the saved fraction after diagram/layout settling; font scaling, sepia, print hiding, and mobile outline open/close were checked. |

Final validation: 129 tests passed, TypeScript passed, the production build passed, and full lint completed with no errors (five existing warnings in `public/client/observability.js` and `public/client/streams.js`).

### Next.js diagram runtime ownership

The Next.js `renderNote` server renderer owns Markdown parsing and emits Mermaid code placeholders. The reader client loads Mermaid from `markdown-vendors.js` and calls the diagram helpers in `obsidian-markdown-it.js` to turn those placeholders into SVG and add pan/zoom controls. The legacy `md-init.js` injects the old runtime's complete global stylesheet, but the Next.js reader does not load `md-init.js`; viewer presentation therefore belongs in the scoped `reader-redesign.css`. Next.js now awaits Mermaid rendering before measuring diagram layout.

The Mermaid runtime sizing was verified against the chemistry Structure of Atom note: viewer CSS removes Mermaid's inline SVG max-width constraint, positions the pan/zoom canvas, and lets the width-fit scale render the tall flowchart at the available content width inside a capped-height viewport.

The server renderer tags Mermaid mindmaps from their source directive before Mermaid transforms the placeholder. The viewer uses that tag (with Mermaid's `mindmapDiagram` SVG class and rotated-group check as fallbacks), so output-class differences cannot silently switch a mindmap to flowchart zoom behavior. Mindmap fit derives its scale from the smallest label font and Mermaid's SVG viewBox scaling so labels render at a 16px minimum; the map's rendered SVG height then determines the unbounded viewer height. This prioritizes readable labels and showing the full map over filling the content column. Reset restores this view. The separate “Fill to view” action scales to 1.35× for closer inspection; fit/fill recalculates on viewer resize, while manually zoomed or panned diagrams keep the user's framing.

Desktop layout follow-up: the document card now fills the available center column, with a wider Outline and explicit spacing between the three panels. Existing narrower-screen stacking and drawer behavior are preserved. Focused reader tests, TypeScript, and the production build pass.

Responsive panel spacing follow-up: desktop and medium layouts keep minimum column widths and gutters. Below 1600px, Chat compresses to a right-corner button and opens as an overlay without shrinking Notes. Below 1100px, the Outline automatically closes into a toggleable drawer and Notes uses the full column; opening either compact panel closes the other.

### Phase 0 baseline record — 2026-11-17

The baseline image set is saved in `design/reader-baseline/`. The table-heavy,
Mermaid-rich, equation-heavy, and long-chapter notes each have captures for
Midnight and Paper in both light and dark modes. The long chapter also has
four narrow-width captures at a 390×844 screenshot size.

| Reference | Repository path | Coverage |
|---|---|---|
| Tables | `fsr-commerce/NCERT-Commerce/AI-NOTES/COMPUTER-SCIENCE/CS02-DATA_REPRESENTATION_AND_BOOLEAN_LOGIC/CS02-DATA_REPRESENTATION_AND_BOOLEAN_LOGIC-CNOTES.md` | Tables, diagrams, long sections |
| Diagram substitute | `fsr-commerce/NCERT-Commerce/AI-NOTES/COMPUTER-SCIENCE/CS03-GETTING_STARTED_WITH_PYTHON/CS03-GETTING_STARTED_WITH_PYTHON-CNOTES.md` | Mermaid (the sampled libraries had no usable TikZ fixture), tables |
| Equations | `fsr-commerce/NCERT-Commerce/AI-NOTES/MATHEMATICS/MATHEMATICS01-SETS/MATHEMATICS01-SETS-GLOSSARY.md` | Inline and display math |
| Long chapter | `ubsr-official/notebooks/NOTES/SOCIAL-SCIENCE/HISTORY/04PRINT_CULTURE_AND_THE_MODERN_WORLD/NOTES.md` | Very long chapter, headings, tables; also used for narrow viewport |
| Mobile candidate | `ubsr-official/notebooks/NOTES/SOCIAL-SCIENCE/HISTORY/02NATIONALISM_IN_INDIA/NOTES.md` | The legacy client renderer did not finish loading this note during capture; the long chapter was used as the mobile fallback |

The mobile captures show the legacy reader content squeezed into a narrow
column with unused space to the right. This is part of the baseline, not a
desired layout. The selected TikZ case is unavailable in the sampled library;
Mermaid is the closest real diagram fixture and should not be treated as TikZ
coverage.

**Phase 0 status: complete.** The screenshot matrix and the unavailable-fixture
substitutions are recorded above.

---

## 12. Open questions

1. What callout syntax do the notes use today, so each type maps to `data-type`?
2. Do you want a revision mode that closes worked solutions by default?
3. Should equations be searchable in Notes mode? Planned as no for v1 (matching raw TeX gives confusing results).

---

## 13. Parked for later

- **Chapter mindmaps** (Mermaid, already draggable and zoomable). Earlier idea: a Map tab in the left rail with an Expand overlay, clicking a node jumps to its section. Needs a check of how Mermaid exposes mindmap nodes. Not part of any phase above.