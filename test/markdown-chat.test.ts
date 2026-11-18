import { describe, expect, it } from "vitest";
import { renderChatMarkdown } from "../src/lib/markdown/chat";

describe("renderChatMarkdown", () => {
  it("renders formatted text, lists, code, tables, and links", () => {
    const html = renderChatMarkdown([
      "## Key idea",
      "",
      "**Velocity** is displacement per unit time.",
      "",
      "The relation is \\(v = \\frac{\\Delta x}{\\Delta t}\\).",
      "",
      "\\[",
      "\\vec{v} = v_x\\hat{i} + v_y\\hat{j}",
      "\\]",
      "",
      "- Average velocity",
      "- `v = Δx / Δt`",
      "",
      "| Quantity | Unit |",
      "| --- | --- |",
      "| Velocity | m/s |",
      "",
      "[Read more](https://example.com)",
    ].join("\n"));

    expect(html).toContain("<h2>Key idea</h2>");
    expect(html).toContain("<strong>Velocity</strong>");
    expect(html).toContain('class="katex"');
    expect(html).toContain("<ul>");
    expect(html).toContain("<code>v = Δx / Δt</code>");
    expect(html).toContain("<table>");
    expect(html).toContain('href="https://example.com" target="_blank" rel="noopener noreferrer"');
  });

  it("escapes raw HTML, rejects unsafe link protocols, and does not fetch remote images", () => {
    const html = renderChatMarkdown([
      "<script>alert(1)</script>",
      "",
      "[unsafe](javascript:alert(1))",
      "",
      "![tracking pixel](https://example.com/pixel.png)",
    ].join("\n"));

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("Image: tracking pixel");
    expect(html).not.toContain("<img");
  });
});
