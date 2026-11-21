import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { compileMdx, MdxCompileError, renderMdxNote } from "@/lib/markdown/mdx-compiler";

const compilerGuidePath = resolve(
  process.cwd(),
  "../NoteBooks-Developers/research-and-development/mdx-compiler.mdx",
);
const compilerGuide = existsSync(compilerGuidePath) ? readFileSync(compilerGuidePath, "utf8") : null;
const sourceInfo = {
  owner: "notebooks",
  repository: "developers",
  branch: "main",
  filePath: "research-and-development/mdx-compiler.mdx",
};
const previousTrustList = process.env.TRUSTED_MDX_REPOSITORIES;

afterEach(() => {
  if (previousTrustList === undefined) delete process.env.TRUSTED_MDX_REPOSITORIES;
  else process.env.TRUSTED_MDX_REPOSITORIES = previousTrustList;
});

describe("renderMdxNote", () => {
  it("executes expressions and renders application-provided React components", async () => {
    process.env.TRUSTED_MDX_REPOSITORIES = "notebooks/developers";
    const result = await renderMdxNote(
      [
        "# Executable MDX",
        "",
        "The expression result is **{6 * 7}**.",
        "",
        "<Badge tone=\"positive\">Compiled React element</Badge>",
      ].join("\n"),
      sourceInfo,
      {
        Badge: ({ children }: { children?: ReactNode }) => createElement(
          "mark",
          { "data-tone": "positive" },
          children,
        ),
      },
    );

    expect(result.html).toContain("The expression result is <strong>42</strong>.");
    expect(result.html).toContain('<mark data-tone="positive">Compiled React element</mark>');
    expect(result.tree).toMatchObject([{ title: "Executable MDX" }]);
  });

  it("blocks execution for repositories outside the explicit trust list", async () => {
    process.env.TRUSTED_MDX_REPOSITORIES = "another-owner/trusted-notes";
    const executable = "{" + "globalThis.__mdxSentinel = true" + "}";

    await expect(renderMdxNote(executable, sourceInfo)).rejects.toThrow(
      "MDX execution is not enabled for notebooks/developers",
    );
    expect((globalThis as typeof globalThis & { __mdxSentinel?: boolean }).__mdxSentinel).toBeUndefined();
  });

  it("rejects imports and exports while permitting JSX expressions", async () => {
    process.env.TRUSTED_MDX_REPOSITORIES = "notebooks/developers";
    await expect(compileMdx('import Button from "./button.js";')).rejects.toThrow(MdxCompileError);
    await expect(compileMdx("export const answer = 42;")).rejects.toThrow(MdxCompileError);
    await expect(compileMdx("The answer is {40 + 2}.")).resolves.toContain("40 + 2");
  });

  it("renders registered callouts, equations, and diagram runtime placeholders", async () => {
    process.env.TRUSTED_MDX_REPOSITORIES = "notebooks/developers";
    const result = await renderMdxNote([
      "# Components",
      "",
      '<Callout type="warning" title="Check this">',
      "Use **careful algebra**.",
      "</Callout>",
      "",
      "<InlineMath>",
      "x^2 + y^2",
      "</InlineMath>",
      "",
      "<BlockMath>",
      "a^2 + b^2 = c^2",
      "</BlockMath>",
      "",
      "<Mermaid>",
      "flowchart TD",
      "  A --> B",
      "</Mermaid>",
      "",
      "<TikZ>",
      "\\draw (0,0) -- (1,1);",
      "</TikZ>",
      "",
      "<Desmos>",
      "@line [color=blue]: y=x",
      "</Desmos>",
      "",
      "<Desmos3D>",
      "%vector axis dir=(1,0,0)",
      "</Desmos3D>",
    ].join("\n"), sourceInfo);

    expect(result.html).toContain('class="callout" data-type="warning"');
    expect(result.html).toContain("<strong>careful algebra</strong>");
    expect(result.html).toContain('class="katex-display"');
    expect(result.html).toContain('class="katex"');
    expect(result.figures.map(({ type }) => type)).toEqual([
      "mermaid",
      "tikz",
      "desmos",
      "desmos3d",
    ]);
  });

  if (compilerGuide) {
    it("compiles and renders this guide as its own test fixture", async () => {
      process.env.TRUSTED_MDX_REPOSITORIES = "notebooks/developers";
      const rendered = await renderMdxNote(compilerGuide, sourceInfo);

      expect(rendered.html).toContain('id="react-elements-available-to-mdx"');
      expect(rendered.html).toContain('id="supported-markdown-and-note-features"');
      expect(rendered.html).toContain('data-type="note"');
      expect(rendered.html).toContain("katex");
      expect(rendered.figures.map(({ type }) => type)).toEqual([
        "mermaid",
        "tikz",
        "desmos",
        "desmos3d",
      ]);
      expect(rendered.html).not.toContain("<script>");
    });
  } else {
    it.skip("compiles and renders this guide as its own test fixture", () => {});
  }
});
