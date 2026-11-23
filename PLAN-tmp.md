# PLAN-tmp: Notes-Only Chapter Flow

## Goal

Present the compiled chapter as a straight reading flow:

**Chapter Outline → Chapter Heading → Chapter Brief**

Keep the full Notes content in the center column, make the Chapter Brief a
full-height, readable companion to Notes, and do not render the Worked
Examples section.

## Scope and assumptions

- Change only the compiled-HTML reader runtime and its styles/tests in
  `NoteBooks-Framework`; do not change the Markdown reader, Developer source
  notes, build pipeline, or generated HTML.
- Move the existing chapter title into the Notes column as its heading and
  remove the redundant title from the Notes fragment.
- Keep the compact main-section Outline and its active-section expansion.
- Keep the Chapter Brief visible while CNOTES summaries continue to follow the
  active Notes subsection. The straight connector targets the three fixed
  column headings, not the changing subsection summary.
- Remove the dedicated Worked Examples fragment and its navigation controls
  from the rendered reader. Examples written as part of the Notes content
  remain Notes.
- Keep the chapter brief and Notes body in the same reader typeface and base
  text size; stretch the brief to the Notes column's height.

## Checklist

### Plan and inspect

- [x] Review the existing Outline, chapter title, Notes title, Chapter Brief,
  CNOTES summaries, and Worked Examples markup.
- [x] Record the revised scope and clarify which heading is the center flow
  target.

### Implementation

- [x] Remove Worked Examples and its dead navigation from the rendered DOM.
- [x] Place the chapter title in Notes and rename the Outline heading to
  “Chapter Outline”.
- [x] Replace the active-content connector with a straight horizontal line
  between Chapter Outline, Chapter Heading, and Chapter Brief headings.
- [x] Keep Chapter Brief visible, full-height, and styled like Notes while
  retaining active subsection CNOTES summaries.
- [x] Keep active-section expansion, mobile panes, and other Notes features
  working.

### Verification

- [x] Add or update focused tests for the revised outline model and examples
  removal.
- [x] Run focused tests, typecheck, lint, and production build.
- [x] Verify desktop, tablet, and mobile rendering in Chromium, including the
  straight connector and full-height Chapter Brief.
- [x] Confirm the current `whoami` branch is unchanged and pre-existing
  Framework edits remain preserved.

## Acceptance checks

- The Outline, Chapter Heading, and Chapter Brief headings are aligned and
  connected by a single straight horizontal flow line.
- The Notes content remains intact; only the redundant Notes document title
  and example navigation controls are removed.
- The Chapter Brief remains visible when changing sections, fills the CNOTES
  column height, and uses Notes-like typography.
- No Worked Examples panel, outline item, tab, or dead in-note example link is
  rendered.
- The compiled reader remains usable on mobile and at tablet widths.
