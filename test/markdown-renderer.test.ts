import { describe, expect, it } from "vitest";
import { renderNote } from "@/lib/markdown/renderer";
import { createWildcardMatcher } from "@/lib/markdown/search";

describe("renderNote", () => {
  it("builds a nested section tree and keeps each section's content in order", () => {
    const result = renderNote([
      "# Intro",
      "Opening paragraph.",
      "## Concepts",
      "A second paragraph.",
      "### Detail",
      "- First item",
      "- Second item",
      "## Next",
      "Closing paragraph.",
    ].join("\n\n"));

    expect(result.tree).toEqual([
      {
        id: "intro",
        number: "1",
        title: "Intro",
        level: 1,
        children: [
          {
            id: "concepts",
            number: "1.1",
            title: "Concepts",
            level: 2,
            children: [
              { id: "detail", number: "1.1.1", title: "Detail", level: 3, children: [] },
            ],
          },
          { id: "next", number: "1.2", title: "Next", level: 2, children: [] },
        ],
      },
    ]);
    expect(result.html.indexOf("Opening paragraph.")).toBeLessThan(result.html.indexOf("Concepts"));
    expect(result.html.indexOf("A second paragraph.")).toBeLessThan(result.html.indexOf("Detail"));
    expect(result.html.indexOf("Detail")).toBeLessThan(result.html.indexOf("First item"));
    expect(result.html.indexOf("First item")).toBeLessThan(result.html.indexOf("Next"));
    expect(result.searchIndex.some((block) => block.text.includes("Second item"))).toBe(true);
  });

  it("nests chapter, section, subheading, and optional sub-subheading levels", () => {
    const result = renderNote([
      "# Chapter",
      "Chapter text.",
      "## Section",
      "Section text.",
      "### Subheading",
      "Subheading text.",
      "#### Sub-subheading",
      "Sub-subheading text.",
      "### Next subheading",
      "Next text.",
    ].join("\n\n"));

    expect(result.tree[0]).toMatchObject({
      level: 1,
      children: [{
        level: 2,
        children: [{
          level: 3,
          children: [{ level: 4, title: "Sub-subheading", children: [] }],
        }, { level: 3, title: "Next subheading", children: [] }],
      }],
    });
    expect(result.html.match(/class="note-section"/g)).toHaveLength(5);
    expect(result.html).toContain('class="note-section" data-level="4"');
    expect(result.html.indexOf("Chapter text.")).toBeLessThan(result.html.indexOf("Section"));
    expect(result.html.indexOf("Sub-subheading text.")).toBeLessThan(result.html.indexOf("Next subheading"));
  });

  it("indexes duplicate headings uniquely and recognizes standard callout types", () => {
    const result = renderNote([
      "# Repeated",
      "> [!WARNING] Common mistake",
      "> Check the sign.",
      "## Repeated",
      "Use the formula $x^2 + y^2$.",
    ].join("\n\n"));

    expect(result.tree[0].id).toBe("repeated");
    expect(result.tree[0].children[0].id).toBe("repeated-2");
    expect(result.html).toContain('class="callout" data-type="warning"');
    expect(result.html).toContain('<span class="callout-title">Common mistake</span>');
    expect(result.searchIndex).toContainEqual(expect.objectContaining({ text: "Check the sign." }));
    expect(result.searchIndex).toContainEqual(expect.objectContaining({ text: "Use the formula." }));
    expect(result.html).toContain("katex");
  });

  it("renders NCERT inline, bracketed, and bare begin/end LaTeX delimiters", () => {
    const result = renderNote(String.raw`
Inline \(x^2+1=0\).

\[
x^2=-1
\]

> \begin{aligned}
> x &= 1
> \end{aligned}
`);

    expect(result.html.match(/class="katex"/g)).toHaveLength(3);
    expect(result.html).toContain('class="katex-display"');
  });

  it("keeps a prose-parenthetical inline formula separate after bracketed display math", () => {
    const result = renderNote(String.raw`
\[
x=1
\]

( \(x=2\) ) Following prose remains separate.
`);

    expect(result.html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(result.html.match(/class="katex"/g)).toHaveLength(2);
    expect(result.html).not.toContain('class="eqno"');
    expect(result.html).toMatch(/<p>[\s\S]*class="katex"[\s\S]*Following prose remains separate\.<\/p>/);
  });

  it("preserves a numeric equation number after bracketed display math", () => {
    const result = renderNote(String.raw`
\[
x=1
\]

(7)
`);

    expect(result.html.match(/class="katex-display"/g)).toHaveLength(1);
    expect(result.html).toContain('<section class="eqno">');
    expect(result.html).toContain("<span>(7)</span>");
  });

  it("normalizes inconsistent math delimiters found in repository notes", () => {
    const result = renderNote(String.raw`
Cross-force pair: \(N_A$–$e_B\).

Frequency: Hz $= $ s⁻¹; dimension $[T^{-1}]$.

$$I = \sum_i m_i r_i^2 \quad \text{(mass $m$ is common)}$$

Potential energy: $V = $ sum over all **pairs**, $-Gm_im_j/r_{ij}$.
`);

    expect(result.html).not.toContain("katex-error");
    expect(result.html.match(/class="katex"/g)).toHaveLength(6);
    expect(result.html).toContain("<strong>pairs</strong>");
    expect(result.html).toContain('class="katex-display"');

    expect(renderNote("Code: ``$V = $``.").html).toContain("<code>$V = $</code>");
  });

  it("preserves vertical-bar math operators inside Markdown table cells", () => {
    const result = renderNote([
      "| Kind | Value | Extra |",
      "| --- | --- | --- |",
      String.raw`| Math | $\sum_{i=1}^{n} x_i | y_i$ | ordinary |`,
      "| Code | `left \\| right` | ordinary |",
    ].join("\n"));

    expect(result.html.match(/<th\b/g)).toHaveLength(3);
    expect(result.html.match(/<td\b/g)).toHaveLength(6);
    expect(result.html.match(/class="katex"/g)).toHaveLength(1);
    expect(result.html).not.toContain("katex-error");
    expect(result.html).not.toContain("\\sum");
    expect(result.html.match(/∣/g)).toHaveLength(1);
    expect(result.html).not.toContain("∥");
    expect(result.html).toContain("<code>left | right</code>");
    expect(result.html.match(/<td>ordinary<\/td>/g)).toHaveLength(2);
  });

  it("renders standalone and custom callouts in the server reader", () => {
    const result = renderNote([
      "# Chitin",
      "A topic introduction.",
      "[!info] Scientific Definition: A tough nitrogenous polysaccharide.",
      "",
      "> [!KEY-PRINCIPLE] Preserve the polymer structure.",
      "",
      "> [!COMMON_MISTAKE] Confusing chitin with cellulose.",
      "",
      "> [!JEE] Exam-specific note.",
      "",
      "> [!SUCCESS] Structure identified.",
      "",
      "> [!NOTE] Outer callout",
      "> > [!TIP] Nested callout",
      "> > Nested body.",
    ].join("\n"));

    expect(result.html).toContain('class="callout" data-type="note"');
    expect(result.html).toContain('<span class="callout-title">Info</span>');
    expect(result.html).toContain("Scientific Definition: A tough nitrogenous polysaccharide.");
    expect(result.html).toContain('data-type="principle"');
    expect(result.html).toContain('data-type="warning"');
    expect(result.html).toContain('data-type="tip"');
    expect(result.html).toContain('data-type="success"');
    expect(result.html).toContain("Exam-specific note.");
    expect(result.html).toMatch(/<blockquote class="callout" data-type="note">[\s\S]*<blockquote class="callout" data-type="tip">[\s\S]*Nested body\./);
  });

  it("returns client-renderable diagram placeholders and escapes raw HTML", () => {
    const result = renderNote([
      "# Figures",
      "```mermaid",
      "flowchart TD",
      "  A --> B",
      "```",
      "```tikz",
      "\\\\draw (0,0) -- (1,1);",
      "```",
      "```desmos",
      "@line [color=blue]: y=x",
      "```",
      "```desmos3d",
      "%vector axis dir=(1,0,0)",
      "```",
      "<script>alert(1)</script>",
    ].join("\n"));

    expect(result.figures).toEqual([
      { id: "figure-1", sectionId: "figures", type: "mermaid", source: "flowchart TD\n  A --> B\n" },
      { id: "figure-2", sectionId: "figures", type: "tikz", source: "\\\\draw (0,0) -- (1,1);\n" },
      { id: "figure-3", sectionId: "figures", type: "desmos", source: "@line [color=blue]: y=x\n" },
      { id: "figure-4", sectionId: "figures", type: "desmos3d", source: "%vector axis dir=(1,0,0)\n" },
    ]);
    expect(result.html).toContain('class="obsidian-mermaid mermaid"');
    expect(result.html).toContain('class="tikz-wrapper"');
    expect(result.html).toContain('class="obsidian-desmos"');
    expect(result.html).toContain('class="desmos-source" hidden');
    expect(result.html).toContain('class="obsidian-desmos3d"');
    expect(result.html).not.toContain("<script>");
  });

  it("preserves Mermaid mindmap type before client rendering", () => {
    const result = renderNote([
      "# Mindmap",
      "```mermaid",
      "%%{init: {\"theme\":\"dark\"}}%%",
      "mindmap",
      "  root((Central))",
      "    Branch",
      "```",
    ].join("\n"));

    expect(result.html).toContain('data-diagram-type="mindmap"');
  });

  it("renders CNOTES section facts with both mindmaps and LaTeX", () => {
    const result = renderNote([
      "# CNOTES",
      "",
      "## Section 1 — Sets",
      "",
      "```mermaid",
      "mindmap",
      "  root((Sets))",
      "    Operations",
      "      Union",
      "      Intersection",
      "```",
      "",
      String.raw`The distributive law is \(A\cap(B\cup C)=(A\cap B)\cup(A\cap C)\).`,
    ].join("\n"));

    expect(result.html).toContain('data-diagram-type="mindmap"');
    expect(result.html).toContain("katex");
    expect(result.html).not.toContain("katex-error");
    expect(result.searchIndex.some(({ text }) => text.includes("distributive law"))).toBe(true);
  });

  it("renders regular fenced code through Markdown-it's complete fence renderer", () => {
    const result = renderNote("# Example\n\n```ts\nconst answer = 42;\n```");
    expect(result.html).toContain('<pre><code class="language-ts">const answer = 42;');
    const openingTags = result.html.match(/<code\b/g) ?? [];
    const closingTags = result.html.match(/<\/code>/g) ?? [];
    expect(openingTags).toHaveLength(closingTags.length);
  });

  it("resolves relative media and source links to the existing public routes", () => {
    const result = renderNote(
      "[Diagram](../images/diagram.png)\n\n![Graph](./graph.svg)",
      {
        owner: "notebook-owner",
        repository: "study-notes",
        branch: "main",
        filePath: "NOTES/CHAPTER/lesson.md",
      },
    );

    expect(result.html).toContain("/api/media?owner=notebook-owner&amp;repo=study-notes&amp;path=NOTES%2Fimages%2Fdiagram.png");
    expect(result.html).toContain("/api/media?owner=notebook-owner&amp;repo=study-notes&amp;path=NOTES%2FCHAPTER%2Fgraph.svg");
  });

  it("uses explicit heading numbers without duplicating them in the outline title", () => {
    const result = renderNote("# Chapter\n\n## §2.1 Angular velocity");
    expect(result.tree[0].children[0]).toMatchObject({
      number: "2.1",
      title: "Angular velocity",
    });
    expect(result.html).toContain("§2.1 Angular velocity");
  });

  it("supports case-insensitive wildcard search without treating other characters as patterns", () => {
    expect(createWildcardMatcher("ang*vel")?.test("Angular velocity")).toBe(true);
    expect(createWildcardMatcher("h?story")?.test("History")).toBe(true);
    expect(createWildcardMatcher("***")).toBeNull();
    expect(createWildcardMatcher("a+b")?.test("a+b")).toBe(true);
    expect(createWildcardMatcher("a+b")?.test("aaab")).toBe(false);
  });

  it("renders Obsidian comments, highlights, links, media embeds, and extended task states", () => {
    const result = renderNote(
      [
        "# Notes",
        "Visible %%private%% ==important text== [[Related Note|related]] #revision/topic",
        "",
        "![[diagram.png|320x180]]",
        "",
        "- [/] In progress",
      ].join("\n\n"),
      {
        owner: "owner",
        repository: "repo",
        branch: "release/2026",
        filePath: "physics/current.md",
      },
    );

    expect(result.html).not.toContain("private");
    expect(result.html).toContain("<mark>important text</mark>");
    expect(result.html).toContain('href="/read?owner=owner&amp;repo=repo&amp;path=physics%2FRelated+Note.md&amp;branch=release%2F2026"');
    expect(result.html).toContain('class="obsidian-tag">#revision/topic</span>');
    expect(result.html).toContain('src="/api/media?owner=owner&amp;repo=repo&amp;path=physics%2Fdiagram.png"');
    expect(result.html).toContain('data-task="in-progress"');
    expect(result.searchIndex.some((block) => block.text.includes("important text related #revision/topic"))).toBe(true);
  });

  it("renders valid HTML attributes for standard task-list checkboxes", () => {
    const result = renderNote("- [ ] To do\n- [x] Done");

    expect(result.html).toContain('<input class="task-list-item-checkbox" type="checkbox">');
    expect(result.html).toContain('<input class="task-list-item-checkbox" checked="" type="checkbox">');
    expect(result.html).not.toContain('checkbox"type=');
    expect(result.html).not.toContain('""type=');
  });

  it("keeps all headings and searchable text in a long chapter", () => {
    const markdown = [
      "# Chapter",
      ...Array.from({ length: 42 }, (_, index) => `## Section ${index + 1}\n\nText block ${index + 1}.`),
    ].join("\n\n");
    const result = renderNote(markdown);
    expect(result.tree[0].children).toHaveLength(42);
    expect(result.searchIndex).toHaveLength(85);
    expect(result.html.match(/class="note-section"/g)).toHaveLength(43);
  });
});
