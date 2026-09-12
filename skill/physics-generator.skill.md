---
name: "physics-generator"
description: "Generate and upgrade physics study notes (NEET/JEE/board level) in NoteBooks-Framework Markdown. Specializes the notes-generator skill with physics-specific conventions: concept roadmaps, difficulty-tagged sections, derivation style (general case before special case), TikZ patterns for force/vector/circular-motion/spring diagrams, dimensional-formula discipline, and cross-checking a primary textbook against supplementary handwritten notes. Use whenever the user asks to create, upgrade, extend, or gap-fill physics notes -- including turning a textbook chapter or handwritten/coaching notes into a study note, adding worked examples or diagrams to existing physics notes, or reconciling notes against NCERT or a syllabus -- even if they don't say 'physics-generator' by name."
---

# Physics Notes Generator

A specialization of `notes-generator` for physics. Read that skill first -- it owns the renderer contract, Markdown/callout conventions, and math-notation rules (display MathJax by default, stepped derivations). This skill only covers what's specific to writing *physics* notes well: how to structure a chapter, how to derive results, how to draw physics diagrams in TikZ, and how to work from a textbook plus a student's own notes without losing accuracy.

## Chapter Structure

Physics notes read best organized around the source material's own logical order (usually a syllabus chapter), not reshuffled for narrative flair. Use this shape:

1. **Title + tagline** -- chapter name and target level (Board / NEET / JEE), since the same topic gets different depth at each level.
2. **Concept Roadmap** -- one Mermaid flowchart mapping how ideas build on each other (prerequisite → derived idea → application), dark-themed to match the renderer's palette. This is the single most useful orientation tool in the whole note -- a student should be able to look at it and know where they are.
3. **Numbered sections matching the source's own structure** (Section 1, 2, 3…; subsections X.Y). Preserve this numbering when upgrading an existing note -- see *Working from a Primary Source + Supplementary Notes* below.
4. **Quick Reference** -- a boxed formula sheet near the end, grouped by topic, for last-minute revision.
5. **Points to Ponder** -- a numbered list of the conceptual traps that actually cost marks (sign errors, when a law doesn't apply, common confusions) -- not a restatement of the formulas already in Quick Reference.
6. **Problem-Solving Strategy** -- a short closing checklist per problem *type* (e.g. "Collision problems: 1. draw before/after… 2. check elastic vs inelastic…").

Tag each section with difficulty/importance stars (⭐ to ⭐⭐⭐) so a student prioritizing for an exam knows where to spend time.

## The Worked-Example Pattern

Use **Given / Find / Model / Work / Check**:
- **Given** -- the numbers, restated cleanly (don't make the reader hunt through prose for them).
- **Find** -- what's actually being asked.
- **Model** -- which law/principle applies, and why (e.g. "conservative forces only ⟹ mechanical energy is conserved").
- **Work** -- the calculation, as stepped display-MathJax blocks (per `notes-generator`'s equation rules).
- **Check** -- does the answer make sense (right order of magnitude, right sign, right units)?

You don't need to label these five words explicitly every time -- a well-written `[!example]` callout often makes Model and Check implicit -- but the *reasoning* should always be visible, not just the arithmetic.

**Label every worked example by where it came from:**
- `### 4.3 Solved — Bullet through plywood (NCERT 5.4)` -- sourced from the primary textbook, numbered to match it.
- `### 12.10 Additional Practice — More Collision Problems (New)` -- added from a supplementary source or filled in during gap analysis.

This isn't cosmetic: a student revising needs to know which examples are "core syllabus" vs. "extra practice you added," especially right before an exam.

## Derivation Convention: General Case Before Special Case

When a textbook only derives a *special case* of a more general result (the most common example: elastic collision formulas assuming the target starts at rest), and a fuller derivation is available (from a teacher's notes, a more advanced source, or your own derivation) -- **present the general result first**, then obtain the textbook's version by substituting the special condition into it. Don't present them as two unrelated formulas.

Why this matters: a student who only memorizes the special-case formula is stuck the moment a problem gives them two moving bodies instead of one. Showing "here's the general derivation, and here's how the familiar formula falls out of it when $u_2=0$" builds the actual skill (specializing a general law) rather than a lookup table of formulas.

Every derivation itself should be numbered steps, each a labeled MathJax display block (see `notes-generator`), and should end with the result in `\boxed{}`.

## Physical Consistency Check

Before labeling a problem "elastic," "conservative," "isolated," etc., verify the given numbers actually satisfy that condition -- don't inherit a source's label uncritically.

**Concretely:** if a problem gives you final velocities/positions directly (rather than asking you to derive them from a conservation law), plug them back in and check. If a "sink the ball at 30°" billiards-style problem is solved with momentum conservation alone and the resulting kinetic energies don't match, that collision **is not elastic** -- solve it and present it as a momentum-conservation problem, and say so in a `[!warning]` callout, rather than filing it under "Elastic Collisions" and asserting something false. Getting this right matters more than tidiness -- a note that confidently states something physically wrong is worse than no note at all.

## Dimensional and Unit Discipline

Every time a new physical quantity is introduced:
- State its **SI unit**.
- State its **dimensional formula** (e.g. `[ML²T⁻²]`).
- If it has a standard alternative unit in common use (erg, eV, kWh, hp…), give the conversion.

Box every named law or final result with `\boxed{...}` (per `notes-generator`'s MathJax rules) so it's visually distinct from intermediate algebra when a student is scanning the page.

## TikZ Diagram Patterns for Physics

Physics notes benefit enormously from figures Mermaid can't draw accurately -- real vectors, real angles, real proportions. Use TikZ (see `notes-generator`'s renderer contract) for these recurring physics figure types. Each pattern below is a working, verified template -- adapt the coordinates/labels, don't reinvent the structure.

> [!warning] A real bug to avoid
> `style=italic` is **not a valid TikZ key** and will silently break the whole figure. For italic caption text, put `\itshape` inside the `font=` value instead: `font=\itshape\small`. This exact mistake broke 4 of 5 diagrams in one real note before it was caught -- bake the fix in from the start.

**Vector / dot-product / projection diagram:**
```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.05]
  \coordinate (O) at (0,0);
  \coordinate (A) at (4,0);
  \coordinate (B) at (2.45,2.06);
  \coordinate (F) at (2.45,0);
  \draw[->, blue!70!black, line width=1.6pt] (O) -- (A) node[midway, below, font=\small] {$\mathbf{A}$};
  \draw[->, green!55!black, line width=1.6pt] (O) -- (B) node[midway, above left, font=\small] {$\mathbf{B}$};
  \draw[dashed, gray] (B) -- (F);
  \draw[orange!80!black, line width=1.6pt] (O) -- (F) node[midway, below, font=\small, orange!80!black] {$B\cos\theta$};
  \draw[orange!80!black] (0.7,0) arc (0:40:0.7);
  \node[font=\small, orange!80!black] at (0.95,0.35) {$\theta$};
  \node[below, font=\itshape\small, text=gray] at (2,-0.9) {caption restating the relationship};
\end{tikzpicture}
```

**Force-at-angle-on-a-block (work) diagram:**

```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.0]
  \draw[line width=1pt] (-0.3,0) -- (6.3,0);
  \draw[gray] (0,0)--(-0.2,-0.25) (1.2,0)--(1.0,-0.25) (2.4,0)--(2.2,-0.25)
              (3.6,0)--(3.4,-0.25) (4.8,0)--(4.6,-0.25) (6.0,0)--(5.8,-0.25);
  \draw[fill=blue!15] (0,0) rectangle (1,0.8);
  \draw[dashed, fill=blue!5] (4,0) rectangle (5,0.8);
  \draw[->, black, line width=1pt] (0.5,-0.6) -- (4.5,-0.6) node[midway, below, font=\small] {$d$};
  \draw[->, red!75!black, line width=1.8pt] (0.5,0.4) -- (2.1,1.55) node[above, font=\small] {$\mathbf{F}$};
  \draw[red!75!black] (1.0,0.4) arc (0:35:0.5);
  \node[font=\small, red!75!black] at (1.35,0.62) {$\theta$};
  \node[below, font=\itshape\small, text=gray] at (2.5,-1.1) {$W=(F\cos\theta)d$ -- only the component along $d$ does work};
\end{tikzpicture}
```

**F-x graph / area-under-curve (work by a variable force):**

```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.0]
  \draw[->, line width=1pt] (-0.3,0) -- (6.5,0) node[right, font=\small] {$x$};
  \draw[->, line width=1pt] (0,-0.3) -- (0,4) node[above, font=\small] {$F(x)$};
  \draw[blue!70!black, line width=1.6pt, smooth]
       plot coordinates {(0.3,0.8) (1.0,1.3) (1.8,1.6) (2.6,2.1) (3.4,2.0) (4.2,2.6) (5.0,3.1) (5.8,3.3)};
  \fill[blue!15]
       plot[smooth] coordinates {(1.8,0) (1.8,1.6) (2.6,2.1) (3.4,2.0) (4.2,2.6) (4.2,0)} -- cycle;
  \draw[dashed, gray] (1.8,0) -- (1.8,1.6);
  \draw[dashed, gray] (4.2,0) -- (4.2,2.6);
  \node[below, font=\small] at (1.8,-0.05) {$x_i$};
  \node[below, font=\small] at (4.2,-0.05) {$x_f$};
  \node[font=\small, blue!55!black] at (3.0,1.0) {Area $=\displaystyle\int_{x_i}^{x_f}\!F(x)\,dx=W$};
\end{tikzpicture}
```

Note the use of `plot coordinates {...}` rather than a parametric/trig `\draw[domain=...] plot ({...},{...})` expression -- coordinate lists are far more reliable than function parsing on this renderer's frozen TikZ build.

**Vertical circular motion apparatus:**

```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.0]
  \draw[gray!60] (0,0) circle (2);
  \coordinate (A) at (0,-2); \coordinate (B) at (2,0); \coordinate (C) at (0,2);
  \fill[blue!70!black] (A) circle (2.5pt);
  \fill[blue!70!black] (B) circle (2.5pt);
  \fill[blue!70!black] (C) circle (2.5pt);
  \node[below, font=\small] at (A) {A ($v_0$)};
  \node[right, font=\small] at (B) {B ($v_B$)};
  \node[above, font=\small] at (C) {C ($v_C$)};
  \draw[->, red!75!black, line width=1.4pt] (A) -- ++(0.9,0);
  \draw[->, red!75!black, line width=1.4pt] (B) -- ++(0,0.9);
  \draw[->, red!75!black, line width=1.4pt] (C) -- ++(-0.9,0);
  \node[below, font=\itshape\small, text=gray] at (0,-2.7) {caption noting where a constraint (tension/normal force) vanishes};
\end{tikzpicture}
```

**Spring at equilibrium vs. extreme position:** build two rows -- a zig-zag `\draw` path for the coil (a handful of explicit points, not a loop), a filled rectangle for the block, and a `<->` dimension line between the two extreme positions. If the dimension line uses `<->`, set both `>={Stealth[...]}` and `<={Stealth[...]}` in the `tikzpicture` options, or the left-hand arrowhead silently won't render. See `notes-generator`'s TikZ guidance for why to avoid `\foreach` here too.

**General TikZ rules for physics figures** (restated from `notes-generator`, worth repeating because physics figures lean on them hardest):

- Every vector/force gets a color **and** a label -- never color alone.
- One diagram per genuinely load-bearing concept; skip the figure if a sentence says it just as clearly.
- Always follow the figure with a sentence of interpretation, not just the image.

## Working from a Primary Source + Supplementary Notes

Physics notes are usually built from a textbook (NCERT, a syllabus PDF) plus a student's own coaching/handwritten notes. Beyond `notes-generator`'s general multi-source rules, physics specifically requires:

- **Re-derive, don't transcribe, every numeric answer** -- recompute it from the given values, using the law the problem actually invokes. Physics answers are easy to silently corrupt with a dropped sign or a wrong substitution, and a wrong number in a study note is worse than a missing one.
- **Finish incomplete derivations** -- a source that sets up a quadratic, an integral, or a formula and stops is a gap to fill, not a stopping point to reproduce.
- **A textbook's own worked example can itself be incomplete** -- e.g. a question with two parts whose printed solution only answers one. Complete it; note that you did.
- **Prefer the more general derivation when both a special-case and general-case source exist** -- see *Derivation Convention* above.
- **Check units and signs at every substitution**, not just at the final answer -- a sign error three lines up produces a confidently wrong final result that "looks" fine.

## Final Checklist (physics-specific, on top of `notes-generator`'s)

- Every section carries a difficulty tag, and the roadmap reflects the note's actual structure (update it last, after content changes).
- Every new physical quantity has stated units and dimensional formula.
- Every named law/result is boxed.
- Worked examples are labeled by source (`NCERT X.Y` vs. `(New)`).
- Any generalized derivation shows the textbook's special case falling out of it, not sitting beside it unexplained.
- No problem is labeled with a physical property (elastic, conservative, isolated…) that its own numbers don't actually satisfy.
- TikZ figures use `font=\itshape\small` for italic captions, `plot coordinates` over parametric plotting, set both arrow-tip styles for any `<->` line, and avoid `\foreach`.
