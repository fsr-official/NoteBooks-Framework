import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runtime = readFileSync(new URL(
  "../src/components/precompiled-html-reader/runtime/chapter-reader.js",
  import.meta.url,
), "utf8");
const stylesheet = readFileSync(new URL("../src/app/precompiled-html-reader.css", import.meta.url), "utf8");

describe("precompiled HTML chapter reader layout contract", () => {
  it("places the anchored outline beside the topic heading and Concepts | Facts panes", () => {
    expect(runtime).toContain('const outline = root.querySelector("[data-outline]")');
    expect(runtime).toContain('const notes = root.querySelector("[data-notes]")');
    expect(runtime).toContain('const facts = root.querySelector("[data-facts]")');
    expect(runtime).toContain('outlinePanel.dataset.readerPanel = "outline"');
    expect(runtime).toContain('contentColumns.append(notes, facts)');
    expect(runtime).toContain('columns.append(outlinePanel, readingArea)');
    expect(runtime).toContain('readingArea.append(topicHeader, tabs, contentColumns)');
    expect(runtime).toContain('conceptsTitle.textContent = "Concepts"');
    expect(runtime).toContain('factsTitle.textContent = "Important Facts"');
    expect(stylesheet).toMatch(/\.chapter-reader-columns\s*\{[^}]*grid-template-columns:\s*minmax\(190px,\s*250px\)\s+minmax\(0,\s*1fr\)/s);
    expect(stylesheet).toMatch(/\.chapter-reader-content-columns\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s+minmax\(220px,\s*\.8fr\)/s);
  });

  it("exposes mobile tabs as an accessible tablist with keyboard navigation", () => {
    expect(runtime).toContain('tabs.setAttribute("role", "tablist")');
    expect(runtime).toContain('tabs.setAttribute("aria-label", "Reader sections")');
    expect(runtime).toContain('button.setAttribute("role", "tab")');
    expect(runtime).toContain('button.setAttribute("aria-controls", `${readerId}-${pane}-pane`)');
    expect(runtime).toContain('button.setAttribute("aria-selected", "false")');
    expect(runtime).toContain('button.tabIndex = selected ? 0 : -1');
    expect(runtime).toContain('if (event.key === "ArrowRight")');
    expect(runtime).toContain('else if (event.key === "ArrowLeft")');
    expect(runtime).toContain('else if (event.key === "Home")');
    expect(runtime).toContain('else if (event.key === "End")');
    expect(runtime).toContain('tabs.querySelector(`[data-reader-pane="${nextPane}"]`)?.focus()');
    expect(stylesheet).toContain('[data-renderer-version] .chapter-reader-mobile-tabs');
    expect(stylesheet).toContain('[data-kind="chapter"][data-active-pane="facts"] [data-reader-panel="facts"]');
  });

  it("synchronizes Facts with the section selected from the outline or Concepts", () => {
    expect(runtime).toContain('const updateFacts = (sectionId) => {');
    expect(runtime).toContain('facts.dataset.activeSection = active?.dataset.sectionId || ""');
    expect(runtime).toContain('const updateActiveSection = (sectionId) => {');
    expect(runtime).toContain('updateFacts(sectionId)');
    expect(runtime).toContain('updateActiveSection(button.dataset.sectionId)');
    expect(runtime).toContain('root.addEventListener("click", guardedNavigate)');
  });
});
