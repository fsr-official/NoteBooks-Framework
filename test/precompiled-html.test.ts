import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLocalPrecompiledHtml } from "../src/lib/precompiled-html";

describe("readLocalPrecompiledHtml", () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  });

  it("reads a generated HTML file below the configured output directory", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "notebooks-static-html-"));
    const file = path.join(temporaryDirectory, "AI-NOTES/chapter.html");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "<article>compiled</article>");

    await expect(readLocalPrecompiledHtml(temporaryDirectory, "AI-NOTES/chapter.html"))
      .resolves.toBe("<article>compiled</article>");
  });

  it("rejects traversal paths and HTML symlinks that escape the output directory", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "notebooks-static-html-"));
    const outside = path.join(temporaryDirectory, "outside.html");
    const output = path.join(temporaryDirectory, "build");
    await mkdir(output);
    await writeFile(outside, "<article>outside</article>");
    await symlink(outside, path.join(output, "escape.html"));

    await expect(readLocalPrecompiledHtml(output, "../outside.html")).rejects.toThrow("path is invalid");
    await expect(readLocalPrecompiledHtml(output, "escape.html")).rejects.toThrow("resolves outside");
  });

  it("rejects non-HTML paths", async () => {
    temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "notebooks-static-html-"));
    await expect(readLocalPrecompiledHtml(temporaryDirectory, "chapter.md"))
      .rejects.toThrow("path is invalid");
  });
});
