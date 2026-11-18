import { describe, expect, it } from "vitest";
import { getRelevantNoteContext } from "../src/lib/reader-ai-context";

const tree = [
  {
    id: "motion",
    number: "1",
    title: "Motion",
    level: 1,
    children: [
      { id: "velocity", number: "1.1", title: "Velocity", level: 2, children: [] },
      { id: "forces", number: "1.2", title: "Forces", level: 2, children: [] },
    ],
  },
];

const searchIndex = [
  { sectionId: "velocity", blockId: "velocity-a", text: "Velocity is displacement per unit time." },
  { sectionId: "forces", blockId: "forces-a", text: "Forces change the momentum of an object." },
  { sectionId: "velocity", blockId: "velocity-b", text: "Average velocity uses total displacement." },
];

describe("getRelevantNoteContext", () => {
  it("ranks relevant note excerpts and includes their section headings", () => {
    expect(getRelevantNoteContext("Explain velocity", searchIndex, tree, "forces", "")).toEqual([
      { title: "1.1 Velocity", text: "Velocity is displacement per unit time." },
      { title: "1.1 Velocity", text: "Average velocity uses total displacement." },
    ]);
  });

  it("puts explicitly selected text first while also including relevant note sections", () => {
    expect(getRelevantNoteContext(
      "Explain velocity",
      searchIndex,
      tree,
      "forces",
      "Velocity describes motion.",
    )).toEqual([
      { title: "Selected text", text: "Velocity describes motion." },
      { title: "1.1 Velocity", text: "Velocity is displacement per unit time." },
      { title: "1.1 Velocity", text: "Average velocity uses total displacement." },
    ]);
  });

  it("falls back to the active section and bounds the sent context", () => {
    const active = getRelevantNoteContext("What is it?", searchIndex, tree, "forces", "");
    expect(active).toEqual([
      { title: "1.2 Forces", text: "Forces change the momentum of an object." },
    ]);

    const largeIndex = Array.from({ length: 10 }, (_, index) => ({
      sectionId: "velocity",
      blockId: `large-${index}`,
      text: "velocity ".repeat(600),
    }));
    const context = getRelevantNoteContext("velocity", largeIndex, tree, "velocity", "");
    expect(context.length).toBeLessThanOrEqual(6);
    expect(context.reduce((total, section) => total + section.text.length, 0)).toBeLessThanOrEqual(9000);
  });
});
