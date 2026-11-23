import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(new URL("../src/app/reader-redesign.css", import.meta.url), "utf8");
const chatPanel = readFileSync(new URL("../src/components/reader-chat-panel.tsx", import.meta.url), "utf8");

function extractBlock(source: string, marker: RegExp): string {
  const match = marker.exec(source);
  if (!match) throw new Error(`Could not find CSS block matching ${marker}`);

  const openingBrace = source.indexOf("{", match.index);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }

  throw new Error(`Unclosed CSS block matching ${marker}`);
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

const reducedMotionStyles = extractBlock(stylesheet, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

describe("reader chat reduced-motion treatment", () => {
  it.each([
    ".reader-chat-caret",
    ".reader-chat-avatar.is-typing",
    ".reader-chat-typing-dots i",
  ])("removes animation from %s", (selector) => {
    const declarations = declarationsFor(reducedMotionStyles, selector);
    expect(declarations.animation === "none" || declarations["animation-name"] === "none").toBe(true);
  });

  it("keeps the readable pending status when typing animation is disabled", () => {
    expect(chatPanel).toContain('<div className="reader-chat-pending" role="status">');
    expect(chatPanel).toContain("NoteBooks AI is reading and writing");

    const statusStyles = declarationsFor(stylesheet, ".reader-chat-pending");
    expect(statusStyles.display).toBe("flex");
    expect(declarationsFor(reducedMotionStyles, ".reader-chat-pending").display).not.toBe("none");
  });
});
