# CNOTES format

CNOTES is the **condensed notes** — the whole chapter, at full breadth, broken into short, scannable points instead of NOTES's connected prose. The reader's eye should be able to land on one line, extract one fact, and move to the next — not travel through a sentence to find where the fact sits inside it. This is what makes CNOTES fast to cover: not shorter paragraphs, but *no paragraphs*.

**Hard rule: no connected prose.** If you write a sentence with "which," "so that," "because," or a comma joining two facts — stop, that's two bullets, not one. Treat hitting one of those four words/marks mid-sentence as the trigger to split, not a style choice to weigh. A CNOTES section is a list — bullets, a table, or short labelled fragments — never a paragraph a reader has to read start-to-end to parse.

**Also hard rule (unchanged from before): no Q&A pairs, no cloze/fill-in-the-blank, no "cover this and check," no quiz mechanic of any kind.** Granular does not mean interactive. Each line is a flat, declarative statement of a fact — not a prompt, not a question, not something with a hidden half. Concretely, this rules out: `<details>` tags of any kind, "cover this and check," fold-and-check instructions, `?` cells the reader must guess, "redo this yourself," "blind-redraw this diagram," and any other meta-instruction telling the reader how to interact with the page ("don't read top to bottom," "a miss is the point"). CNOTES is read straight through, start to finish, like a denser textbook — never interacted with.

## What "condensed" means here

Not "shorter" — **complete at the granularity of a fact.** Every definition, figure, comparison, and diagram NOTES has must still be recoverable from CNOTES; what's stripped out is NOTES's connective tissue (the "why we're looking at this," the build-up, the repeated emphasis), not the facts themselves. Condensation happens by cutting sentence *scaffolding*, not by cutting *content*, and the resulting facts are then laid out one-per-line instead of woven into paragraphs.

Test: if you deleted a bullet, would the chapter have a hole — a term, a number, a relationship the reader wouldn't otherwise see? If yes, it stays. If a bullet only restates the bullet above it in different words, or exists purely to transition into the next point, it goes.

## Structure: mirror NOTES's section numbers exactly

CNOTES follows the chapter's own section order (§1.1, §1.2, ...), one-to-one with NOTES, same heading granularity. A miss during revision (a solved-paper question, a quiz, a moment of blankness) should map to one obvious CNOTES heading, and from there one obvious NOTES section for the full explanation.

Do not reorganize by content type. Do not merge NOTES sections even when the condensed version of each is short — a two-bullet section is fine; a merged section that blurs two NOTES headings is not, because it breaks the one-to-one mapping back to NOTES.

## The unit of writing is the bullet, not the sentence

Every fact gets its own line. Default to this shape, per section:

- **Term — definition**, as a single bulleted line: `**Cache memory** — very high-speed memory between CPU and primary memory; stores copies of frequently accessed locations.` Bold the term, dash, then the tightest correct phrasing. One bullet, one term.
- **A named fact or figure** as its own line, not folded into a definition's bullet: `Standard sector size: 512 bytes.` `1 GB = 1024 MB (never 1000).`
- **A property list** for anything with 2+ attributes, as sub-bullets under the term rather than a run-on sentence:
  ```
  **RAM**
    - Read/write, volatile — contents lost on power-off
    - Used as main memory; DRAM (main) vs SRAM (cache)
    - Faster than secondary storage, slower than cache
  ```
- **A worked-example result**, condensed to the method and the number only, as a line or two — never the Given/Find/Concept/Work/Check scaffold: `n-bit address bus → 2ⁿ locations. 32-bit → 4 GB.`

## What stays in table/diagram form (don't convert these to bullets)

Some NOTES content is already granular and shouldn't be forced into a bulleted list just for consistency:

- **Comparisons** (RAM vs ROM, compiler vs interpreter) stay as tables — a table is already point-wise and faster to scan than the same facts written as parallel bullets.
- **Diagrams, mindmaps, flowcharts** NOTES has (Von Neumann architecture, fetch-decode-execute, memory hierarchy) get reproduced in CNOTES as-is or tightened, not converted to text. A picture stays a picture.
- **Every major section gets one Mermaid diagram even if NOTES didn't draw one**, placed immediately under the section heading, before the bullets: `mindmap` for a classification/hierarchy section (types of X, X vs Y vs Z as a tree), `flowchart` for a process/sequence section (fetch-decode-execute, an algorithm, a life cycle). One diagram per major section is the target — don't add a second unless the section genuinely covers two unrelated structures. Skip only when a section is a single flat fact list with no hierarchy or sequence to draw (state that it's skipped for that reason if asked, don't silently omit without a reason). Respect the mindmap node syntax constraint in SKILL.md §2 (no brackets, no slashes in node labels).
- **Trap/discrepancy flags** (source conflicts, "Points to Ponder" warnings) — one flagged line each, same as before: `Trap: cache is faster than RAM, not slower — order is registers > cache > RAM > secondary.`

## What does NOT go in

- Any sentence connecting two facts with causal or sequential language ("X, which means Y," "since X, Y follows"). Split into two bullets; if the causal link itself is the fact worth keeping, state it as its own short bullet ("Address bus unidirectional — CPU generates addresses, memory never sends one back").
- Build-up or framing before a definition. Start with the term.
- Repeated facts across a section for emphasis.
- Meta-commentary about the two source textbooks agreeing, or why an example was chosen — unless it's a genuine exam-relevant discrepancy (those stay, flagged, per above).
- Any interactive/testing mechanic.
- Narration between sections or bullets ("Now for memory types..."). Headings alone carry structure.

## Closing Rapid Reference table (mandatory, one per CNOTES file)

End every CNOTES file with a single section titled **Rapid Reference**: one flat two-column table, `Fact | Value`, pulling every major named fact/figure from the whole chapter into one place (constants, standard sizes, formulas, named thresholds — anything a reader might need as a quick lookup without re-finding which section it lived in). No prompts, no hidden cells, no third "check yourself" column. This is a lookup table, not a quiz — every cell is filled in and visible.

## Density and coverage check before delivering

1. **Coverage:** walk every NOTES section heading; confirm CNOTES has a matching heading with no dropped term, figure, or comparison.
2. **Granularity:** pick any CNOTES section and read it aloud. If you find yourself reading a bullet as a full sentence with subordinate clauses, it's still prose — split it.
3. **Speed:** a reader should be able to scan one CNOTES section in well under the time it takes to read the matching NOTES section — if it takes close to the same time, the bullets are too long or too dense with clauses and need splitting further.
4. **Cold read:** read the finished file top to bottom as if you were the student, seeing it for the first time. If at any point you catch yourself being *tested* — recalling, guessing, covering something — rather than *informed*, the output has reverted to a quiz format somewhere upstream. Find that spot and fix it before delivering.
