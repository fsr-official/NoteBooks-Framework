import { describe, expect, it } from "vitest";
import {
  buildChapterOutline,
  outlineSectionId,
} from "../src/components/precompiled-html-reader/runtime/chapter-reader-outline.js";

describe("compiled chapter outline", () => {
  it("groups subsection buttons under main sections without adding Worked Examples", () => {
    const outline = buildChapterOutline([
      { id: "chapter-overview", title: "Concept Roadmap", importance: 0 },
      { id: "SECTION-1", title: "Foundations", importance: 2 },
      { id: "SECTION-2", title: "Applications", importance: 1 },
    ], [
      { id: "SECTION-1", title: "Foundations", depth: 2 },
      { id: "1.1", title: "Momentum", depth: 3 },
      { id: "1.2", title: "Impulse", depth: 3 },
      { id: "2.1", title: "Systems", depth: 3 },
    ]);

    expect(outline).toEqual([
      { id: "chapter-overview", title: "Concept Roadmap", importance: 0, kind: "overview", children: [] },
      {
        id: "SECTION-1",
        title: "Foundations",
        importance: 2,
        kind: "section",
        children: [
          { id: "1.1", title: "Momentum", depth: 3 },
          { id: "1.2", title: "Impulse", depth: 3 },
        ],
      },
      {
        id: "SECTION-2",
        title: "Applications",
        importance: 1,
        kind: "section",
        children: [{ id: "2.1", title: "Systems", depth: 3 }],
      },
    ]);
    expect(outline.some((item) => item.title === "Worked Examples")).toBe(false);
  });

  it("maps subsection activity back to its main section", () => {
    expect(outlineSectionId("chapter-overview")).toBe("chapter-overview");
    expect(outlineSectionId("SECTION-10")).toBe("SECTION-10");
    expect(outlineSectionId("10.2.1")).toBe("SECTION-10");
    expect(outlineSectionId("unsectioned")).toBe("");
  });
});
