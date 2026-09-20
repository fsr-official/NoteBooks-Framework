# NOTES format

NOTES is the **conceptual read** — the file you go through once to actually understand the chapter, and return to when CNOTES's compressed line isn't enough to reconstruct the reasoning behind it. Where CNOTES optimizes for scan speed, NOTES optimizes for comprehension: it should teach a reader who has never seen the chapter, and it should be complete enough that CNOTES and GLOSSARY can be built from it without going back to the source material.

**NOTES is not "prose" and not "point-wise" — it's both, deployed where each does its job.** Explanation, reasoning, derivations, and the connective "why" between ideas belong in prose: a reader needs to follow a chain of thought to actually absorb it, and chopping that chain into disconnected bullets destroys the thing NOTES exists to preserve. But definitions, properties, figures, comparisons, steps in a fixed procedure, and anything enumerable belong in points or tables from the start — writing "RAM has three properties: it is volatile, it is read/write, and it is faster than secondary storage" as a sentence doesn't make it more conceptual, it just makes it harder to scan for no comprehension benefit. The test isn't "is this important" — everything in NOTES is important — it's **does understanding this fact depend on the sentence around it, or is it standing on its own already.**

## The governing split: reasoning vs. enumeration

Before writing any paragraph or list, classify what you're about to write:

| If the content is... | Write it as... | Why |
|---|---|---|
| A chain of reasoning, a derivation, cause→effect, "this happens because..." | Prose | The logic only makes sense in sequence; breaking it into bullets forces the reader to reconstruct the chain themselves |
| Motivation / framing — why this topic matters, how it connects to the previous section | Prose | This is connective tissue by nature; it has no standalone fact to extract |
| A definition | Point (term — definition), same as GLOSSARY but with room to breathe if needed | Definitions are atomic; a reader scanning for "what is X" shouldn't have to read a paragraph |
| A list of properties/types/parts (2+ items of the same kind) | Bulleted sub-list under a short intro line | Each item is independently retrievable; prose would force artificial connective words between unrelated items |
| Two or more things being contrasted on the same axes | Table | Comparison is inherently tabular; prose comparison hides the axes |
| A worked example | Structured block (Given / Find / Concept / Work / Check) — see below | The scaffold itself is part of what's being taught (method), not just the numbers |
| A numbered procedure / algorithm / sequence of steps | Numbered list, or a `flowchart` if the sequence has branches | Steps are ordered and discrete; prose obscures the ordering |
| A warning, common mistake, or source discrepancy | Flagged one-line callout (see Warnings below) | Needs to visually interrupt normal reading, not blend into a paragraph |

When in doubt: if you can delete the sentence's connecting words ("because," "which," "therefore") and lay the pieces on separate lines without losing meaning, it was enumeration wearing prose as a costume — convert it. If removing those words would leave the *reasoning* unstated, it was genuine prose — keep it.

## Standard document structure

Every NOTES file follows this skeleton top to bottom. Sections are always present; a section with nothing to add for a given chapter states that briefly rather than being silently dropped, so the reader can trust the skeleton is complete rather than wondering if something was missed.

### 1. Header block (unchanged, do not restyle)

Whatever header convention the subject/chapter's existing files already use (title, chapter code, subject, source textbook(s), last-updated marker, or whatever fields are already established) stays exactly as-is. This skill does not touch header styling — see workflow step 2 in SKILL.md for confirming the existing convention before writing anything. If no convention exists yet (first chapter in a new subject), keep the header minimal: chapter title, subject, chapter/section code.

### 2. Chapter brief

Immediately after the header, before the table of contents: **2-4 sentences, prose**, answering — what is this chapter about, why does it matter / where does it sit in the subject's broader arc, and what should the reader be able to do after reading it. This is orientation, not summary — it should not contain any fact that's later tested or referenced by §; it exists purely so the reader has a frame before the detail starts. If a chapter is a direct continuation of the previous one, say so in one clause ("builds directly on §-numbering-of-prior-chapter's treatment of X").

### 3. Standardized front-matter block

A short fixed block, after the brief and before the table of contents, using whichever of these fields are genuinely applicable to the chapter (omit a field entirely if the subject doesn't have one — don't force it):

- **Prerequisites** — concepts/chapters a reader should already know; one line, comma-separated, or "None" if the chapter is a genuine starting point.
- **Key outcomes** — 3-6 bullets, the "by the end of this chapter you should be able to..." list. These are checkable capabilities, not restated facts — they help the reader self-assess readiness for CNOTES-level revision, not test recall.
- **Scope note** — one line on what this chapter deliberately does *not* cover (a topic deferred to a later chapter, a simplification used at this level), if applicable. Prevents a reader from assuming completeness where the subject's own sequencing hasn't gotten there yet.

This block is intentionally short — a glance, not a page. If none of these three fields has real content for a given chapter, the block can be a single line stating that, rather than three empty headers.

### 4. Table of contents

A linked list of every section and major subsection heading (§1, §1.1, §1.2, §2, ...), matching the section numbers used throughout the file exactly — this is the same numbering CNOTES and GLOSSARY cross-reference against, so it must be generated from the actual headings, not drafted separately and then matched loosely. Use whatever link syntax the rendering environment supports (confirm per workflow step 2 of SKILL.md); if anchors aren't supported, a plain nested list of section numbers and titles is enough.

### 5. Body — the numbered sections

The actual chapter content, §1 onward, following the governing split above throughout. A few structural rules that apply across all subjects and streams:

- **Section granularity matches one teachable idea per heading**, not one paragraph per heading and not the whole chapter under one heading. If a section is getting long enough that you'd want a sub-table-of-contents just for it, split it into `§x.1`, `§x.2`, etc.
- **Every section opens with a line or two of prose framing** ("this section covers...", or a direct continuation of the reasoning from the prior section) before dropping into points/tables where the content calls for it. A section that's 100% bulleted with zero framing prose has usually skipped the conceptual layer NOTES exists to provide — that's a CNOTES section, not a NOTES section.
- **Worked examples** use a consistent internal scaffold across the whole file — Given / Find / Concept (which principle applies and why) / Work (the steps, shown, not just the answer) / Check (sanity-check or alternate-method verification) — because the *method* being modeled is as much the point as the answer. Don't compress this in NOTES; CNOTES is where the compression happens.
- **Warnings, common mistakes, and source discrepancies** get a visually distinct one-line (or short) callout at the point in the text where the confusion would naturally arise — not batched into an appendix the reader has to remember to check. Use whatever callout syntax the environment supports (e.g. Obsidian-style `> [!warning]`), confirmed per SKILL.md workflow step 2. Example: `> [!warning] Cache is faster than RAM, not slower — hierarchy is registers > cache > RAM > secondary storage.`
- **Diagrams** (mindmap for classification/hierarchy, flowchart for process/sequence) are used where they clarify structure faster than prose would — same diagram-type logic as CNOTES, but in NOTES they supplement the prose explanation rather than replacing it; the prose still has to stand on its own for a reader who skips the diagram.
- **Section numbering is stable once written.** Don't renumber existing sections when extending a chapter later — append new sections or insert with decimal sub-numbers (§2.5a) rather than shifting every downstream § reference in GLOSSARY/CNOTES.

## What NOTES is not

- Not a condensed/scan-first format — that's CNOTES's job. If a section in NOTES reads like a rapid-fire bullet dump with no explanatory prose connecting the ideas, it's drifted into CNOTES's territory and needs framing prose added back.
- Not a glossary — a definition appearing in NOTES should have enough surrounding context to explain *why the concept exists*, not just state what it means. The bare "what does X mean" answer is GLOSSARY's job; NOTES's version of the same term can and should say more.
- Not exhaustive busywork — a fact that exists only to pad length without adding understanding or being referenced later doesn't belong, regardless of format. Every paragraph and every bullet should either build understanding or state a fact CNOTES/GLOSSARY will need to point back to.

## Subject-agnostic by design

This structure names no subject-specific section types on purpose — no "formula section" that only makes sense for Physics/Maths, no "diagram" heading forced onto a chapter that has none, no assumption of a lab/practical component. The skeleton (header → brief → front-matter → TOC → numbered sections with prose+point-wise content as each fact calls for) applies identically whether the chapter is Organic Chemistry nomenclature, a Linear Algebra proof sequence, a History unit, or a Computer Science architecture chapter. What varies by subject is only the *content* poured into "definition," "worked example," "comparison," and "procedure" — not the skeleton itself. Don't add a subject-flavored section to this file; if a genuinely new content type shows up that doesn't fit definition/property-list/comparison/procedure/warning/diagram, treat that as a signal to extend the governing-split table above generally, not to bolt on a one-off subject-specific rule.

## Density and coherence check before delivering

1. **Prose-vs-point audit:** walk every section; for each paragraph ask "does deleting the connecting words lose meaning" (keep as prose) and for each bullet list ask "would prose here just add connective filler with no new information" (keep as points). Anything that fails its own test gets converted.
2. **Standalone comprehension:** read the chapter brief and front-matter block alone, without the body. A reader should know what the chapter is about, what they need already, and what they'll walk away able to do.
3. **TOC accuracy:** confirm every TOC entry has a matching heading in the body and every body heading appears in the TOC, with matching numbering — this is what GLOSSARY and CNOTES cross-reference against, so a mismatch here breaks both downstream files.
4. **Worked-example scaffold consistency:** every worked example in the file uses the same Given/Find/Concept/Work/Check structure — a reader shouldn't have to learn a new format partway through the chapter.
