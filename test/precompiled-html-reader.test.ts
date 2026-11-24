import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrecompiledHtmlReader } from "../src/components/precompiled-html-reader/reader";

describe("PrecompiledHtmlReader", () => {
  it("renders a closed AI drawer control around the compiled fragment", () => {
    const html = '<article data-kind="chapter"><script type="application/json" data-chapter-data>'
      + '{"tree":[],"searchIndex":[]}</script></article>';
    const markup = renderToStaticMarkup(createElement(
      PrecompiledHtmlReader,
      {
        html,
        title: "Chapter",
        owner: "owner",
        repository: "repo",
        branch: "main",
        filePath: "AI-NOTES/chapter.html",
        fileSha: "",
        backHref: "/developers",
        readerFontClassName: "",
      },
    ));

    expect(markup).toContain('aria-controls="precompiled-html-ai-drawer"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain("Ask AI");
    expect(markup).toContain('data-kind="chapter"');
    expect(markup).not.toContain("chapter-reader-ai-layer");
    expect(markup).not.toContain("chapter-reader-ai-drawer");
  });
});
