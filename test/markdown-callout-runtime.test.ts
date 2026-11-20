import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import MarkdownIt from "markdown-it";
import { describe, expect, it } from "vitest";

type MarkdownRenderer = InstanceType<typeof MarkdownIt>;
type ObsidianPlugin = (markdown: MarkdownRenderer) => void;

function isObsidianPlugin(value: unknown): value is ObsidianPlugin {
  return typeof value === "function";
}

function createMarkdownRenderer(): MarkdownRenderer {
  const runtime: Record<string, unknown> = {};
  runtime.window = runtime;
  const source = readFileSync(
    new URL("../public/js/obsidian-markdown-it.js", import.meta.url),
    "utf8",
  );
  runInNewContext(source, runtime);

  if (!isObsidianPlugin(runtime.obsidianPlugin)) {
    throw new Error("The Obsidian Markdown plugin did not initialize.");
  }

  const markdown = new MarkdownIt();
  runtime.obsidianPlugin(markdown);
  return markdown;
}

describe("active Markdown callout plugin", () => {
  const markdown = createMarkdownRenderer();

  it("renders standalone callout markers after a title line", () => {
    const html = markdown.render([
      "Chitin (Greek: *chiton* = tunic/coat) — [Exam Target: NEET]",
      "[!info] Scientific Definition: A tough nitrogenous polysaccharide.",
    ].join("\n"));

    expect(html).toContain('<p>Chitin (Greek: <em>chiton</em>');
    expect(html).toContain('class="callout callout-info" data-callout="info"');
    expect(html).toContain('<span class="callout-title-text">Info</span>');
    expect(html).toContain("Scientific Definition: A tough nitrogenous polysaccharide.");
  });

  it("preserves blockquoted callouts and leaves inline marker text unchanged", () => {
    const html = markdown.render([
      "> [!info] Existing title",
      "> Existing body.",
      "",
      "Plain [!info] text.",
    ].join("\n"));

    expect(html.match(/class="callout callout-info"/g)).toHaveLength(1);
    expect(html).toContain('<span class="callout-title-text">Existing title</span>');
    expect(html).toContain("Plain [!info] text.");
  });

  it("renders standard and custom callout types, including hyphenated names", () => {
    const types = [
      "note", "abstract", "summary", "tldr", "info", "todo", "tip", "hint", "important",
      "success", "check", "done", "question", "help", "faq", "warning", "caution",
      "attention", "failure", "fail", "missing", "danger", "error", "bug", "example",
      "quote", "cite", "formula", "jee", "neet", "key-principle", "common-mistake",
    ];
    const html = markdown.render(types.map((type) => `> [!${type.toUpperCase()}] Title`).join("\n\n"));

    for (const type of types) {
      expect(html).toContain(`class="callout callout-${type}" data-callout="${type}"`);
    }
  });

  it("normalizes underscores and keeps fold controls on standalone custom callouts", () => {
    const html = markdown.render([
      "> [!KEY_PRINCIPLE] Core idea",
      "",
      "[!formula]- Quadratic formula",
    ].join("\n"));

    expect(html).toContain('class="callout callout-key-principle" data-callout="key-principle"');
    expect(html).toContain('class="callout callout-formula" data-callout="formula" data-foldable="true" data-open="false"');
    expect(html).toContain('<span class="callout-title-text">Formula</span>');
    expect(html).toContain("Quadratic formula");
  });
});
