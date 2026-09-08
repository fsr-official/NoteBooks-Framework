---
name: "maths-generator"
description: "Generate and upgrade mathematics study notes (NCERT/board/JEE level) in NoteBooks-Framework Markdown. Specializes the notes-generator skill with maths-specific conventions: concept roadmaps, theorem-then-corollary derivation style (general case before special case), TikZ patterns for number lines, function graphs, the unit circle, Venn diagrams, vacant-places counting diagrams and probability trees, domain/notation discipline, extraneous-solution and validity checks, and cross-checking a primary textbook against supplementary handwritten notes. Use whenever the user asks to create, upgrade, extend, or gap-fill maths notes -- including turning a textbook chapter or handwritten/coaching notes into a study note, adding worked examples or diagrams to existing maths notes, generating a GLOSSARY/NOTES/REVISION-MINDMAP set for a chapter, or reconciling notes against NCERT or a syllabus -- even if they don't say 'maths-generator' by name."
---

# Maths Notes Generator

A specialization of `notes-generator` for mathematics. Read that skill first -- it owns the renderer contract, Markdown/callout conventions, and the general math-notation rules. This skill only covers what's specific to writing *maths* notes well: how to structure a chapter, how to derive and verify results, how to draw maths diagrams in TikZ, when to reach for Mermaid instead, and how to work from a textbook plus a student's own notes without losing rigor.

One note up front: `notes-generator` still describes TikZJax as a future placeholder. That's stale for this renderer -- TikZJax renders now, the same way it does for `physics-generator`. Treat the placeholder language in `notes-generator` as superseded for TikZ specifically; everything else in that skill (MathJax, Mermaid, callouts, tables) still applies as written.

## Chapter Structure

Maths notes read best organized around the source's own logical order (definitions before theorems, theorems before applications), not reshuffled for narrative flair. Use this shape:

1. **Title + tagline** -- chapter name and target level (Board / JEE / NEET-adjacent), since depth and rigor expectations differ sharply between them.
2. **Concept Roadmap** -- one Mermaid flowchart mapping prerequisite → definition/theorem → application, dark-themed to match the renderer's palette. A student should be able to glance at it and know where a given result sits in the chapter's logic.
3. **Numbered sections matching the source's own structure** (Section 1, 2, 3…; subsections X.Y). Preserve this numbering when upgrading an existing note -- see *Working from a Primary Source + Supplementary Notes* below.
4. **Quick Reference** -- a boxed formula/identity sheet near the end, grouped by topic, for last-minute revision.
5. **Points to Ponder** -- the conceptual traps that actually cost marks: domain restrictions dropped mid-solution, extraneous roots, sign errors from squaring, off-by-one errors in counting problems -- not a restatement of Quick Reference.
6. **Problem-Solving Strategy** -- a short closing checklist per problem *type* (e.g. "Counting problems: 1. does order matter? 2. is repetition allowed? 3. add or multiply the cases?").

Tag each section with difficulty/importance stars (⭐ to ⭐⭐⭐). If the user has asked for a **GLOSSARY / NOTES / REVISION-MINDMAP** trio for a chapter rather than one combined note, split along these lines: GLOSSARY is the Quick Reference table standing alone, NOTES is items 1, 3, 4 (inline) and 5 above, and REVISION-MINDMAP is the Concept Roadmap plus the Problem-Solving Strategy rendered as flowcharts.

## The Worked-Example Pattern

Use **Given / Find / Approach / Work / Check**:
- **Given** -- the data restated cleanly (don't make the reader hunt through prose for it).
- **Find** -- what's actually being asked.
- **Approach** -- which definition, theorem, or technique applies, and why (e.g. "order doesn't matter here ⟹ this is a combination, not a permutation").
- **Work** -- the calculation or proof, as stepped display-MathJax blocks (per `notes-generator`'s equation rules).
- **Check** -- does the answer make sense (right sign, right domain, right order of magnitude, satisfies the *original* equation)?

You don't need to label all five words every time -- a well-written `[!example]` callout often makes Approach and Check implicit -- but the *reasoning* should always be visible, not just the algebra.

**Label every worked example by where it came from:**
- `### 6.4 Solved — Committee selection (NCERT Example 18)` -- sourced from the primary textbook, numbered to match it.
- `### 6.9 Additional Practice — Extraneous-root check (New)` -- added from a supplementary source or filled in during gap analysis.

A student revising needs to know which examples are "core syllabus" vs. "extra practice you added," especially right before an exam.

## Derivation Convention: General Case Before Special Case

When a textbook states only a *special case* of a result (a common pattern: proving `nCr = nC(n-r)` only by example rather than from the formula, or deriving a trig identity only for acute angles), and a fuller derivation is available (from a teacher's notes, a more advanced source, or your own derivation) -- **present the general result first**, then obtain the textbook's version by substituting the special condition into it. Don't present them as two unrelated facts.

Why this matters: a student who only memorizes the special-case version is stuck the moment a problem changes the setup slightly (an obtuse angle, an *n* the formula wasn't "shown" for). Showing "here's the general derivation, and here's how the familiar case falls out of it" builds the actual transferable skill.

Every derivation should be numbered steps, each a labeled MathJax display block (see `notes-generator`), ending with the result in `\boxed{}`.

## Mathematical Validity and Consistency Checks

Before presenting a solution as final, verify it the way you'd want a student to -- don't inherit a source's confidence uncritically:

- **Substitute back into the original equation, not the transformed one.** Squaring, cross-multiplying, or taking logs can introduce extraneous roots that satisfy the transformed equation but not the original. Flag and discard these explicitly rather than silently dropping them.
- **State domain restrictions before solving, and re-check them after.** Denominators ≠ 0, arguments of `\log` and `\sqrt{}` within their valid range, discriminant sign for real roots, principal-value ranges for inverse trig functions.
- **Sanity-check counting and probability answers.** Re-derive a combinatorial formula's result for a small *n* by direct listing where feasible; confirm probabilities lie in \([0,1]\) and that a full probability distribution sums to 1.
- **Verify a classification before asserting it**, the same way you would in physics -- don't call a system "consistent," a sequence "convergent," or a function "continuous at a point" just because a source's label says so; check it against the actual given values or the formal definition.
- **Check units/context in applied problems** (mensuration, probability word problems, linear programming) the same way a physics note checks dimensions.

> [!warning] A real trap to avoid
> Squaring both sides of \(\sqrt{x+3} = x - 3\) gives \(x=1\) or \(x=6\), but only \(x=6\) satisfies the *original* equation -- \(x=1\) is extraneous. A note that presents both roots without this check teaches the wrong lesson.

## Notation, Domain, and Convention Discipline

Every time a new object is introduced:
- State its **domain and codomain/range** if it's a function or relation.
- State whether bounds are **open or closed** using consistent interval notation, and match it in any accompanying number-line figure.
- State the **convention in force** where more than one is common (degrees vs. radians, \(\log\) meaning \(\log_{10}\) vs. \(\ln\), row vector vs. column vector).
- Box every named theorem, identity, or final boxed result with `\boxed{...}` so it's visually distinct from intermediate algebra when a student is scanning the page.

## Mermaid Usage for Maths Notes

Mermaid is for **relationships and decisions**, not for anything that needs geometric accuracy -- a parabola, a unit circle, an angle, a proportionally-correct triangle all belong in TikZ (below), never in Mermaid. Use Mermaid for:

- **Concept roadmaps** (prerequisite → theorem → application), one per chapter.
- **"Which technique applies?" decision flowcharts** -- e.g. permutation vs. combination, which integration technique to try first, how to classify a conic from its general equation. Use a decision node only where the problem genuinely branches.
- **Process flows** with no geometric content -- proof strategy outlines, the steps of an algorithm (e.g. the Euclidean algorithm), a probability experiment's stages before assigning numeric probabilities (the tree itself, once probabilities are attached, is better as a TikZ probability tree -- see below).

Follow every diagram with a sentence of interpretation, per `notes-generator`.

## TikZ Diagram Patterns for Maths

Maths notes lean on figures Mermaid can't draw accurately -- true proportions, true angles, true curves. Use TikZ (per `notes-generator`'s renderer contract, corrected per the note at the top of this file) for these recurring figure types. Each pattern is a working template -- adapt coordinates/labels, don't reinvent the structure.

> [!warning] Renderer quirks carried over from `physics-generator` (still true here)
> `style=italic` is **not a valid TikZ key** and silently breaks the whole figure -- use `font=\itshape\small` instead. Prefer `plot coordinates {...}` over parametric/trig `plot({...},{...})` expressions -- explicit coordinate lists are far more reliable than function parsing on this renderer's frozen TikZ build. Any `<->` dimension or arrow line needs **both** `>={Stealth[...]}` and `<={Stealth[...]}` set in the `tikzpicture` options, or one arrowhead silently won't render. Avoid `\foreach` -- write out repeated elements (tick marks, tree branches) explicitly instead.

**Number line / interval (sets, inequalities):**
```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.0]
  \draw[->, line width=1pt] (-4.5,0) -- (4.5,0) node[right, font=\small] {$x$};
  \draw (-4,0.08) -- (-4,-0.08); \node[below, font=\small] at (-4,-0.2) {$-4$};
  \draw (-3,0.08) -- (-3,-0.08); \node[below, font=\small] at (-3,-0.2) {$-3$};
  \draw (-2,0.08) -- (-2,-0.08); \node[below, font=\small] at (-2,-0.2) {$-2$};
  \draw (-1,0.08) -- (-1,-0.08); \node[below, font=\small] at (-1,-0.2) {$-1$};
  \draw (0,0.08) -- (0,-0.08); \node[below, font=\small] at (0,-0.2) {$0$};
  \draw (1,0.08) -- (1,-0.08); \node[below, font=\small] at (1,-0.2) {$1$};
  \draw (2,0.08) -- (2,-0.08); \node[below, font=\small] at (2,-0.2) {$2$};
  \draw (3,0.08) -- (3,-0.08); \node[below, font=\small] at (3,-0.2) {$3$};
  \draw (4,0.08) -- (4,-0.08); \node[below, font=\small] at (4,-0.2) {$4$};
  \draw[red!75!black, line width=2pt] (-2,0) -- (3,0);
  \draw[fill=white, draw=red!75!black, line width=1.4pt] (-2,0) circle (2.2pt);
  \fill[red!75!black] (3,0) circle (2.6pt);
  \node[below, font=\itshape\small, text=gray] at (0.5,-0.9) {open at $-2$ (excluded), closed at $3$ (included): $(-2,3]$};
\end{tikzpicture}
```

**Cartesian function graph (parabola shown; adapt the coordinate list for any curve):**

```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.0]
  \draw[->, line width=1pt] (-3.5,0) -- (3.5,0) node[right, font=\small] {$x$};
  \draw[->, line width=1pt] (0,-2) -- (0,4.5) node[above, font=\small] {$y$};
  \draw[blue!70!black, line width=1.6pt, smooth]
       plot coordinates {(-3,3.5) (-2.5,1.6) (-2,0.2) (-1.5,-0.7) (-1,-1.2) (-0.5,-1.4)
                         (0,-1.5) (0.5,-1.4) (1,-1.2) (1.5,-0.7) (2,0.2) (2.5,1.6) (3,3.5)};
  \fill[red!75!black] (-1.63,0) circle (2.4pt);
  \node[below, font=\small, text=red!75!black] at (-1.63,-0.15) {$x_1$};
  \fill[red!75!black] (1.63,0) circle (2.4pt);
  \node[below, font=\small, text=red!75!black] at (1.63,-0.15) {$x_2$};
  \fill[green!45!black] (0,-1.5) circle (2.4pt);
  \node[right, font=\small, text=green!45!black] at (0.15,-1.5) {vertex $(0,-1.5)$};
  \draw[dashed, gray] (0,-1.5) -- (0,4.2);
  \node[below, font=\itshape\small, text=gray] at (0,-2.4) {axis of symmetry, roots $x_1,x_2$, vertex marked};
\end{tikzpicture}
```

**Unit circle (trigonometric ratios):**

```tikz
\usetikzlibrary{arrows.meta}
\begin{tikzpicture}[>={Stealth[length=7pt,width=5pt]}, thick, scale=1.3]
  \draw[gray!50] (0,0) circle (1);
  \draw[->, line width=0.8pt] (-1.3,0) -- (1.3,0) node[right, font=\small] {$x$};
  \draw[->, line width=0.8pt] (0,-1.3) -- (0,1.3) node[above, font=\small] {$y$};
  \coordinate (P) at (0.766,0.643);
  \draw[blue!70!black, line width=1.4pt] (0,0) -- (P);
  \draw[orange!80!black] (0.35,0) arc (0:40:0.35);
  \node[font=\small, orange!80!black] at (0.5,0.16) {$\theta$};
  \draw[dashed, red!70!black] (P) -- (0.766,0);
  \node[right, font=\small, text=red!70!black] at (0.78,0.32) {$\sin\theta$};
  \draw[dashed, green!45!black] (0,0) -- (0.766,0);
  \node[below, font=\small, text=green!45!black] at (0.38,-0.05) {$\cos\theta$};
  \fill[blue!70!black] (P) circle (1.6pt);
  \node[above right, font=\small] at (P) {$(\cos\theta,\sin\theta)$};
  \node[below, font=\itshape\small, text=gray] at (0,-1.6) {point on the unit circle defines $\cos\theta,\sin\theta$};
\end{tikzpicture}
```

**Venn diagram (sets):**

```tikz
\begin{tikzpicture}[thick, scale=1.0]
  \draw[fill=blue!12, draw=blue!60!black] (0,0) circle (1.5);
  \draw[fill=orange!12, draw=orange!70!black] (1.6,0) circle (1.5);
  \node[font=\small, text=blue!60!black] at (-0.9,0.9) {$A$};
  \node[font=\small, text=orange!70!black] at (2.5,0.9) {$B$};
  \node[font=\small] at (0.8,0) {$A\cap B$};
  \node[font=\small] at (-1.0,-1.0) {$A\setminus B$};
  \node[font=\small] at (2.6,-1.0) {$B\setminus A$};
  \node[below, font=\itshape\small, text=gray] at (0.8,-1.9) {shade or label only the region you're actually discussing};
\end{tikzpicture}
```

**Vacant-places diagram (permutations/combinations counting proofs):**

```tikz
\begin{tikzpicture}[thick, scale=1.0]
  \draw (0,0) rectangle (1,1); \node[font=\small] at (0.5,0.5) {$n$};
  \draw (1.3,0) rectangle (2.3,1); \node[font=\small] at (1.8,0.5) {$n-1$};
  \draw (2.6,0) rectangle (3.6,1); \node[font=\small] at (3.1,0.5) {$n-2$};
  \node[font=\small] at (4.0,0.5) {$\cdots$};
  \draw (4.4,0) rectangle (5.4,1); \node[font=\small] at (4.9,0.5) {$n-r+1$};
  \node[below, font=\small] at (0.5,-0.3) {place 1};
  \node[below, font=\small] at (1.8,-0.3) {place 2};
  \node[below, font=\small] at (3.1,-0.3) {place 3};
  \node[below, font=\small] at (4.9,-0.3) {place $r$};
  \node[below, font=\itshape\small, text=gray] at (2.7,-0.9) {choices per vacant place, multiplied, give ${}^{n}P_r$};
\end{tikzpicture}
```

**Probability tree** -- build with TikZ's `child{}` syntax (not `\foreach`) rather than plain `\draw`, one `child` per branch, labeling each edge with its conditional probability:

```tikz
\begin{tikzpicture}[thick, scale=1.0, level distance=1.6cm,
  level 1/.style={sibling distance=3cm}, level 2/.style={sibling distance=1.6cm}]
  \node {Start}
    child { node {$E_1$}
      child { node {$E_1\cap F$} edge from parent node[left, font=\small] {$P(F\mid E_1)$} }
      child { node {$E_1\cap F'$} edge from parent node[right, font=\small] {$P(F'\mid E_1)$} }
      edge from parent node[left, font=\small] {$P(E_1)$} }
    child { node {$E_2$}
      child { node {$E_2\cap F$} edge from parent node[left, font=\small] {$P(F\mid E_2)$} }
      child { node {$E_2\cap F'$} edge from parent node[right, font=\small] {$P(F'\mid E_2)$} }
      edge from parent node[right, font=\small] {$P(E_2)$} };
\end{tikzpicture}
```

**Geometry / circle-theorem figures and conic sections:** build the same way as the unit circle above -- a `\draw ... circle` or explicit `plot coordinates` for the curve, `\coordinate` for every labeled point, angle arcs via `arc(start:end:radius)`, and a closing `font=\itshape\small` caption stating the theorem the figure proves. Never rely on the reader inferring proportions "by eye" from a rough sketch -- if an angle or length is meant to look equal, make the coordinates actually produce that.

**General TikZ rules for maths figures** (restated from `notes-generator`, worth repeating because maths figures lean on them hardest):

- Every curve/region/angle gets a color **and** a label -- never color alone.
- One diagram per genuinely load-bearing idea; skip the figure if a sentence or a table says it just as clearly (a 2-row comparison table beats a diagram for e.g. listing trig ratios at standard angles).
- Always follow the figure with a sentence of interpretation, not just the image.
- Coordinates should be numerically accurate to what they represent -- if a figure claims two lengths are equal or two angles congruent, that must actually hold in the coordinates used, not just look approximately right.

## Subject-Branch Quick Guide


| Branch                       | Typical diagram                                                                                                  | Notation discipline to watch                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Algebra / functions          | TikZ Cartesian graph                                                                                             | domain/range, one-to-one vs. onto                                        |
| Trigonometry                 | TikZ unit circle                                                                                                 | degrees vs. radians, principal values                                    |
| Coordinate geometry / conics | TikZ precise figure                                                                                              | which axis convention, eccentricity sign                                 |
| Calculus                     | TikZ graph with tangent/area shading                                                                             | open vs. closed interval, existence before evaluating a limit/derivative |
| Sets & relations             | TikZ Venn diagram                                                                                                | universal set, subset vs. proper subset                                  |
| Combinatorics & probability  | Mermaid decision flow + TikZ vacant-places/probability tree                                                      | order matters?, repetition allowed?, mutually exclusive vs. independent  |
| Statistics                   | Tables (histograms/box plots rarely need geometric precision -- a table is usually clearer and faster to update) | population vs. sample, rounding convention stated once                   |

## Working from a Primary Source + Supplementary Notes

Maths notes are usually built from a textbook (NCERT, a syllabus PDF) plus a student's own coaching/handwritten notes. Beyond `notes-generator`'s general multi-source rules, maths specifically requires:

- **Recompute, don't transcribe, every numeric or symbolic answer** -- redo the algebra/calculus from the given statement, using the definition or theorem the problem actually invokes. A wrong sign or dropped term three steps up produces a confidently wrong final result that "looks" fine.
- **Finish incomplete derivations** -- a source that sets up an equation, an integral, or an inductive step and stops is a gap to fill, not a stopping point to reproduce.
- **A textbook's own worked example can itself be incomplete** -- e.g. a question with two parts whose printed solution only answers one, or a proof that skips a case (like a sign case in an inequality). Complete it, and note that you did.
- **Prefer the more general derivation when both a special-case and general-case source exist** -- see *Derivation Convention* above.
- **Check every substitution step**, not just the final answer -- confirm the domain still holds, confirm no division by a possibly-zero expression, confirm no root was dropped.

## Final Checklist (maths-specific, on top of `notes-generator`'s)

- Every section carries a difficulty tag, and the roadmap reflects the note's actual structure (update it last, after content changes).
- Every new function/relation has its domain and range stated.
- Every named theorem, identity, or final result is boxed.
- Worked examples are labeled by source (`NCERT X.Y` vs. `(New)`).
- Any generalized derivation shows the textbook's special case falling out of it, not sitting beside it unexplained.
- No solution keeps an extraneous root, drops a domain restriction, or asserts a classification (convergent, consistent, elastic-equivalent labels for maths) that the given values don't actually satisfy.
- Mermaid is used only for relationships/decisions; anything needing geometric accuracy is TikZ.
- TikZ figures use `font=\itshape\small` for italic captions, `plot coordinates` over parametric plotting, set both arrow-tip styles for any `<->` line, avoid `\foreach`, and use numerically accurate coordinates for any claimed equality of length or angle.


