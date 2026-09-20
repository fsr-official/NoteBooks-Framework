---
name: notes-triad
description: Generate or extend the GLOSSARY / NOTES / CNOTES three-file academic notes set for a chapter (any subject — Physics, Chemistry, Maths, Biology, CS). Use this whenever the user asks for chapter notes, revision notes, condensed notes, a glossary, or says "make notes for [chapter]" — even if they only name one of the three files, since all three should exist together and stay cross-referenced. Also use this to tighten or audit an existing GLOSSARY for airtightness (one-line, unambiguous, no circular definitions), or to backfill a missing CNOTES file for a chapter that already has GLOSSARY + NOTES. Do NOT use this for one-off explanations, homework help, or content that isn't meant to become a saved reference file — those stay conversational.
---

# Notes Triad: GLOSSARY / NOTES / CNOTES

Three files per chapter, each with **one job**, cross-referenced by section number. This skill governs all three and the contract between them. It layers on top of whatever generates the source content (e.g. an existing notes-from-PDF pipeline) — it does not replace that; it disciplines the *output shape*.

**Read `references/notes-format.md` before writing a NOTES file.** It defines the standard skeleton (header, chapter brief, front-matter, table of contents, numbered sections) and when to use prose versus points/tables within a section — don't default to either pure-prose or pure-bullet without checking it.

**Read `references/cnotes-format.md` before writing a CNOTES file.** It's the newest and least standardized of the three; the format rules matter more there than for GLOSSARY or NOTES.

**Read `references/glossary-rules.md` before writing or auditing a GLOSSARY file.** "Airtight" has a specific, checkable meaning defined there — don't approximate it.

## The contract between the three files

| File | Job | Read when | Never contains |
|---|---|---|---|
| **GLOSSARY** | Fast, unambiguous lookup of one term | "What does X mean, right now" | Explanation of *why*, worked examples, opinion on which source is right |
| **NOTES** | Full explanation — the thing you read once to actually learn the chapter. Prose for reasoning/framing, points/tables for anything enumerable (definitions, properties, comparisons, procedures). Standard skeleton: header, chapter brief, front-matter (prerequisites/outcomes/scope), table of contents, numbered sections | First pass through the chapter, or GLOSSARY/CNOTES wasn't enough | Filler, restated definitions with no added reasoning, prose-only sections with no points where enumeration is called for, or bullet-only sections with no explanatory framing |
| **CNOTES** | The whole chapter, condensed into granular, point-wise lines — full breadth, fast to scan. One Mermaid diagram per major section, plus a closing flat "Rapid Reference" table | Every revision session — this is the primary re-read | Connected prose, paragraphs, a quiz, a Q&A pair, a fill-in-the-blank, `<details>`/fold-and-check, "redo this yourself," or any other instruction telling the reader how to interact with the page |

**The failure mode this exists to prevent:** producing three files that all just restate the same facts at different lengths without a real reason to open more than one. Each file must fail differently. GLOSSARY fails silently if you don't know the term (you look it up, done — no shame, no friction). NOTES fails by being incomplete (you finish it and you understand the chapter, or you don't). CNOTES fails by taking too long or being missing a fact — the fix for CNOTES failing is *tighter prose*, not more interactivity.

If a fact only exists in one form across all three files (same wording, same depth), something is wrong — usually it means CNOTES was built by lightly trimming NOTES instead of genuinely condensing it (see `references/cnotes-format.md`), or GLOSSARY was copy-pasted from NOTES prose instead of written to stand alone.

## Core rule: CNOTES is granular and point-wise, not prose and not an interactive quiz

This is the rule most likely to get drifted from mid-generation, so it's worth stating flatly: **CNOTES contains no connected prose and no questions/blanks/fold-and-check mechanics.** Every fact is its own bulleted line — a reader's eye lands on one point, extracts it, moves on, rather than reading a sentence to find where the fact sits inside it. It still covers everything NOTES covers, at NOTES's full breadth; only the *expression* changes, from paragraphs to lines. Read `references/cnotes-format.md` in full before writing CNOTES — it defines exactly what counts as granular enough, what stays as a table or diagram instead of a bullet, and how to check coverage isn't lost in the process.

## Workflow

### 1. Determine what exists and what's being asked for

Check the chapter's existing files first (list the directory / ask the user for the folder). Common cases:

- **Nothing exists yet, user wants notes for a new chapter** → build all three, in order NOTES → GLOSSARY → CNOTES (CNOTES needs NOTES's section numbers to reference; GLOSSARY can be pulled from NOTES's terms).
- **NOTES exists, GLOSSARY/CNOTES don't** → this is the common backfill case. Read the existing NOTES file fully first — don't regenerate NOTES, extract from it.
- **All three exist, user wants a chapter added/extended** → find the existing files' conventions (heading style, callout syntax, section-numbering scheme) and match them exactly. Don't introduce a new house style mid-subject.
- **User wants an "airtightness audit" of an existing GLOSSARY** → see `references/glossary-rules.md`, run the checklist there, report violations with fixes, don't silently rewrite the whole file unless asked.

### 2. Confirm the rendering environment once per subject/session, not per file

These notes render in a specific pipeline (Mermaid `mindmap`/`flowchart`, Obsidian-style `> [!note]` callouts, possibly `svg`/`desmos`/`tikz` fences). Check what the existing files in this chapter/subject actually use — don't assume every subject supports every fence type. If unsure, ask, or default to Mermaid + plain tables + Obsidian callouts, since those are confirmed-safe in the existing corpus.

**Mermaid `mindmap` syntax constraint (recurring failure point):** node labels cannot contain brackets `()[]{}`, slashes `/`, or the mindmap parser misreads them as shape syntax. Write "picture element" not "pic/ture el/ement"-style abbreviation splits, and rephrase anything with parentheses before it goes in a mindmap node.

### 3. Build in dependency order

**NOTES first** (if not already present) — this is the source of truth. Everything in GLOSSARY and CNOTES must trace back to a NOTES section number. See `references/notes-format.md` for the required skeleton (header, brief, front-matter, TOC, numbered sections) and the prose-vs-points rule within each section — don't wing this one either.

**GLOSSARY second** — extract every term NOTES formally defines or that a "define X" question could target. See `references/glossary-rules.md` for the airtightness checklist before finalizing.

**CNOTES third** — this is the one this skill exists to improve. It must cover every NOTES section at full breadth, broken into granular, point-wise lines rather than prose — see `references/cnotes-format.md` for exactly what that means, what stays as a table/diagram instead of a bullet, and what's explicitly excluded. Don't wing this one from the description above.

### 4. Cross-reference, don't duplicate

Every CNOTES entry that isn't self-contained (a trap-flag, a discriminator) must carry the NOTES section number it falls back to, e.g. `§1.4a`. This is what makes "I missed this, let me go understand it properly" a two-second action instead of a re-search through the whole chapter. Check this is actually true — pick five CNOTES entries at random after drafting and verify the referenced section exists and actually covers the claim.

GLOSSARY entries may also carry a `§` back to NOTES using the same numbering convention already established in this chapter's NOTES file (e.g. NCERT-style `1.1.1`, or whatever scheme is already in use — match it, don't invent a new one).

### 5. Before presenting, run the coverage-and-density check

For NOTES specifically (new or extended chapters): confirm the skeleton is complete (brief, front-matter, TOC matching actual headings) and spot-check a few sections against the prose-vs-points test in `references/notes-format.md`. For CNOTES specifically: walk every NOTES section heading and confirm CNOTES has a corresponding section with no dropped facts (coverage), and that the section is written as granular bullets/tables/diagrams rather than connected prose (format) — see the checks in `references/cnotes-format.md`. For GLOSSARY: spot-check 3-5 entries against the five airtightness checks in `references/glossary-rules.md`.

## Output and file naming

Match whatever convention the chapter's existing files use. If starting fresh, use the pattern visible in prior chapters of this subject (e.g. `CS01-COMPUTER_SYSTEM-NOTES.md`, `CS01-COMPUTER_SYSTEM-GLOSSARY.md`, `CS01-COMPUTER_SYSTEM-CNOTES.md`) — ask the user for the chapter code/number if it's not obvious from context, rather than guessing a numbering scheme.

Deliver as markdown files via the file-creation flow (this is a `.md` deliverable — follow whatever this session's normal file-output convention is, e.g. writing to the outputs directory and presenting it). Don't dump the full file content into the chat reply; the file itself is the deliverable.
