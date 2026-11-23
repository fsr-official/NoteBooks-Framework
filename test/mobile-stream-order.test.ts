import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../src/app/notebooks.css", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/notebook-workspace.tsx", import.meta.url), "utf8");

function extractBlock(source: string, marker: RegExp): string {
  for (const match of source.matchAll(new RegExp(marker.source, marker.flags.includes("g") ? marker.flags : `${marker.flags}g`))) {
    const openingBrace = source.indexOf("{", match.index);
    let depth = 0;
    for (let index = openingBrace; index < source.length; index += 1) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      if (depth === 0) return source.slice(openingBrace + 1, index);
    }
  }

  throw new Error(`Could not find CSS block matching ${marker}`);
}

function extractBlockWithSelectors(source: string, marker: RegExp, selectors: string[]): string {
  for (const match of source.matchAll(new RegExp(marker.source, marker.flags.includes("g") ? marker.flags : `${marker.flags}g`))) {
    const block = extractBlock(source.slice(match.index), /^/);
    if (
      selectors.every((selector) => block.includes(selector))
      && declarationsFor(block, ".workspace-layout").display === "flex"
    ) return block;
  }

  throw new Error(`Could not find CSS block matching ${marker} and containing ${selectors.join(", ")}`);
}

function declarationsFor(source: string, selector: string): Record<string, string> {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rule = new RegExp(`(?:^|\\n)\\s*${escapedSelector}\\s*\\{([^}]*)\\}`).exec(source);
  if (!rule) return {};

  return Object.fromEntries(
    rule[1].split(";")
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(":");
        return [declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim()];
      }),
  );
}

const mobileStyles = extractBlockWithSelectors(
  stylesheet,
  /@media\s*\(max-width:\s*760px\)/,
  [".workspace-layout", ".main-panel", ".side-rail"],
);
const baseStyles = stylesheet.slice(0, stylesheet.search(/@media\s*\(/));

function workspaceRulesAt(width: number): string {
  return width <= 760 ? mobileStyles : baseStyles;
}

describe("mobile stream content ordering", () => {
  it("reveals the active stream link against the navigation client scrollport", () => {
    expect(workspace).toContain("const navViewportLeft = navBounds.left + nav.clientLeft;");
    expect(workspace).toContain("const navViewportRight = navViewportLeft + nav.clientWidth;");
    expect(workspace).toContain("if (linkBounds.right > navViewportRight)");
    expect(workspace).toContain("nav.scrollLeft += linkBounds.right - navViewportRight;");
    expect(workspace).toContain("else if (linkBounds.left < navViewportLeft)");
    expect(workspace).toContain("nav.scrollLeft -= navViewportLeft - linkBounds.left;");
  });

  it.each([320, 390])("places library content before expanded theme controls at %i px", (width) => {
    const responsiveStyles = workspaceRulesAt(width);
    expect(declarationsFor(responsiveStyles, ".workspace-layout")).toMatchObject({
      display: "flex",
      "flex-direction": "column",
    });
    expect(declarationsFor(responsiveStyles, ".main-panel").order).toBe("1");
    expect(declarationsFor(responsiveStyles, ".side-rail").order).toBe("2");
    expect(workspace).toContain('<details className="sidebar-theme-group" key={group.label} open>');
  });

  it.each([1024, 1440])("keeps the existing grid and DOM order at %i px", (width) => {
    const responsiveStyles = workspaceRulesAt(width);
    expect(declarationsFor(responsiveStyles, ".workspace-layout").display).toBe("grid");
    expect(declarationsFor(responsiveStyles, ".main-panel").order).toBeUndefined();
    expect(declarationsFor(responsiveStyles, ".side-rail").order).toBeUndefined();

    const sideRail = workspace.indexOf('<aside className="side-rail">');
    const themeControls = workspace.indexOf('<section className="sidebar-theme"');
    const mainPanel = workspace.indexOf(
      '<section className={stream === "home" ? "main-panel home-main-panel" : "main-panel"}>',
    );

    expect(sideRail).toBeGreaterThanOrEqual(0);
    expect(sideRail).toBeLessThan(themeControls);
    expect(themeControls).toBeLessThan(mainPanel);
  });
});
