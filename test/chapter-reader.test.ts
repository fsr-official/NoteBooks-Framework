import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterReader } from "../src/components/chapter-bundle/chapter-reader";
import type { ChapterBundle } from "../src/lib/chapter-bundle/schema";

const bundle: ChapterBundle = {
  schemaVersion: 2,
  id: "physics06-system-of-particles-and-rotational-motion",
  title: "System of Particles and Rotational Motion",
  rendererVersion: "0.1.2",
  sourceShas: {
    glossary: "1".repeat(64),
    notes: "2".repeat(64),
    cnotes: "3".repeat(64),
  },
  outline: [
    { id: "chapter-overview", title: "Overview", importance: 0, brief: "Chapter overview." },
    { id: "SECTION-1", title: "Foundations", importance: 2, brief: "Core ideas." },
  ],
  notes: {
    tree: [
      { type: "heading", depth: 2, children: [{ type: "text", value: "SECTION 1 — Foundations" }] },
      { type: "heading", depth: 3, id: "1.1", children: [{ type: "text", value: "1.1 Momentum" }] },
      {
        type: "paragraph",
        children: [
          { type: "text", value: "The relation is " },
          { type: "glossaryRef", termId: "momentum", children: [{ type: "text", value: "momentum" }] },
          { type: "text", value: " " },
          { type: "mathInline", value: "p=mv" },
          { type: "text", value: "." },
        ],
      },
      {
        type: "component",
        name: "Diagram",
        props: { name: "Diagram", id: "diagram-1", kind: "mermaid", title: "Momentum flow" },
      },
      {
        type: "component",
        name: "Desmos",
        props: { name: "Desmos", id: "graph-1", kind: "2d", data: { ref: "graph-1" } },
      },
    ],
  },
  facts: [{
    sectionId: "1.1",
    brief: "Linear momentum.",
    points: ["$p=mv$."],
    glossaryRefs: {
      brief: [{ start: 7, end: 15, termId: "momentum" }],
      points: [[]],
    },
  }],
  examples: [{
    id: "ex-1-1",
    from: ["1.1"],
    concepts: ["1.1"],
    title: "Calculate momentum",
    question: [{ type: "paragraph", children: [{ type: "text", value: "Find p." }] }],
    answer: [{ type: "paragraph", children: [{ type: "text", value: "p=mv." }] }],
  }],
  glossary: {
    momentum: { term: "Momentum", definition: "Mass multiplied by velocity.", aliases: [], common: false },
  },
  diagrams: [{ id: "diagram-1", kind: "mermaid", source: "graph TD\nA-->B", title: "Momentum flow" }],
  desmos: [{
    id: "graph-1",
    kind: "2d",
    data: { expressions: [{ id: "graph-expression", latex: "y=x" }] },
  }],
};

describe("ChapterReader", () => {
  it("renders the three-column reader, synchronized section anchors, facts, and mobile tabs", () => {
    const html = renderToStaticMarkup(createElement(ChapterReader, {
      bundle,
      sourceCommitSha: "a".repeat(40),
      stale: false,
    }));

    expect(html).toContain('class="chapter-reader-grid"');
    expect(html).toContain('id="SECTION-1"');
    expect(html).toContain("The relation is");
    expect(html).toContain('class="chapter-math-inline"');
    expect(html).toContain('class="chapter-glossary-reference"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Open Momentum flow");
    expect(html).toContain("Load interactive graph");
    expect(html).not.toContain("Rendering diagram…");
    expect(html).not.toContain("dcg-container");
    expect(html.replace(/<[^>]*>/g, "")).toContain("Linear momentum.");
    expect(html).toContain("Examples (1)");
    expect(html).toContain("Go to example: Calculate momentum");
    expect(html).toContain("Reveal answer");
    expect(html).toContain("CONCEPTS USED");
    expect(html).toContain("Return to section");
  });
});
