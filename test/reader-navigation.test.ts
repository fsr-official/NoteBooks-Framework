import { describe, expect, it } from "vitest";
import { readerHref } from "../src/lib/reader-navigation";

describe("readerHref", () => {
  it("routes compiled HTML through the compiled reader", () => {
    const href = readerHref({
      branch: "main",
      filePath: "AI-NOTES/PHYSICS06/chapter.html",
      repository: "fsr-official/NoteBooks-Developers",
    }, "/developers");

    expect(href).not.toBeNull();
    const url = new URL(href ?? "", "http://localhost");
    expect(url.pathname).toBe("/read");
    expect(url.searchParams.get("repo")).toBe("NoteBooks-Developers");
    expect(url.searchParams.get("path")).toBe("AI-NOTES/PHYSICS06/chapter.html");
  });

  it("continues routing Markdown and leaves other text files in the preview", () => {
    expect(readerHref({
      branch: "main",
      filePath: "notes/chapter.mdx",
      repository: "fsr-official/NoteBooks-Developers",
    }, "/developers")).toContain("/read?");
    expect(readerHref({
      branch: "main",
      filePath: "notes/data.json",
      repository: "fsr-official/NoteBooks-Developers",
    }, "/developers")).toBeNull();
  });

  it("leaves unconfigured repositories' HTML in the source preview", () => {
    expect(readerHref({
      branch: "main",
      filePath: "docs/index.html",
      repository: "someone-else/repo",
    }, "/developers")).toBeNull();
  });
});
