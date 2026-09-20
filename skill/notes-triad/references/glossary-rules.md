# GLOSSARY airtightness rules

"Airtight" means: a reader who knows nothing else about the chapter can read one entry, get an unambiguous and *sufficient* answer to "what is this," and never be misled by it later. This file defines the checklist a GLOSSARY entry must pass. Use it both when generating a new GLOSSARY and when auditing an existing one.

## The five checks, per entry

**1. No circularity.** The definition of a term cannot use that term, a trivial rewording of it, or another term whose own definition loops back. ("Cache memory: memory used for caching" fails. "Cache memory: very high-speed memory placed between the CPU and primary memory, storing copies of frequently accessed locations" passes.)

**2. No silent dependency on an undefined term.** If defining X requires knowing what Y means, Y must also be a GLOSSARY entry (link it or ensure it exists elsewhere in the same file), or the definition must inline enough of Y's meaning to stand alone. A reader should never hit a term inside a definition that sends them hunting through NOTES just to parse the GLOSSARY entry itself.

**3. States the discriminator, not just the description, for any term with a known confusable pair.** If NOTES or CNOTES flags a term as commonly confused with another (RAM/ROM, OMR/OCR/MICR, compiler/interpreter, freeware/FOSS), the GLOSSARY entry should contain the one distinguishing fact, not just a standalone description that happens to be technically correct but doesn't help distinguish it under exam pressure. Cross-check against the "Easily-confused pairs" / "Points to Ponder" sections of NOTES when building GLOSSARY — every pair listed there needs its discriminator represented in both entries.

**4. One entry, one meaning — flag polysemy instead of hiding it.** If a term has a different meaning in a different context within the same subject (e.g. "port" as a physical socket in this chapter vs. "port" as a network endpoint elsewhere), the entry must say so explicitly rather than silently defining only one sense. Don't let the reader assume completeness where there's a gap.

**5. Length discipline — one to two sentences, no exceptions.** If a term needs more than two sentences to state airtightly, that's a signal it needs a NOTES section (if it doesn't have one) rather than a longer GLOSSARY entry. GLOSSARY entries that run long are usually smuggling in explanation, which is NOTES's job. Cut to the definition; point to NOTES's `§` for the rest.

## Source-conflict handling

When two source textbooks define a term differently (as already happens in this corpus — e.g. CPU components, ISCII's expansion), GLOSSARY does not silently pick one. State the version to use for the exam, flag that a discrepancy exists, and point to NOTES's discrepancy appendix for the reasoning. Do not let GLOSSARY quietly resolve a genuine source conflict without a flag — that's how a wrong fact gets memorized as settled when it isn't. Match the existing convention already in use (e.g. **(Supp.)** tags, bold discrepancy notes) — don't invent a new flagging syntax if one already exists in the chapter's files.

## Audit checklist (for tightening an existing GLOSSARY)

Run each existing entry through checks 1-5 above. For violations, report as a table: `Term | Which check fails | Suggested fix`. Do not silently rewrite the whole file — present the audit first, let the person confirm before applying bulk edits, since some "violations" may be intentional (e.g. a term that's genuinely inseparable from a longer explanation and was a deliberate exception).

Common real violations seen in practice:
- An entry that defines a device/concept purely by *what it's used for*, without saying what it *is* (fails check 1 in spirit — it's description, not definition).
- An entry for a unit or abbreviation that gives the expansion but not the meaning (e.g. defining "ISCII" as only "Indian Script Code for Information Interchange" without saying what that means in practice — 8-bit, extends ASCII, covers Indian scripts).
- Entries copied near-verbatim from NOTES prose, which tend to be too long and too dependent on surrounding NOTES context to stand alone (fails check 5, often check 2).
