import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { localPrecompiledHtmlDirectory, readLocalPrecompiledHtml } from "../src/lib/precompiled-html";

describe("readLocalPrecompiledHtml", () => {
  let temporaryDirectory: string | undefined;

  afterEach(async () => {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    temporaryDirectory = undefined;
  });

  describe("localPrecompiledHtmlDirectory", () => {
    it("finds the adjacent Developer repository only for local development", async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "notebooks-local-reader-"));
      const framework = path.join(root, "NoteBooks-Framework");
      const developers = path.join(root, "NoteBooks-Developers");
      await mkdir(framework);
      await mkdir(developers);

      try {
        const options = { nodeEnv: "development", configuredDirectory: "", workingDirectory: framework };
        expect(localPrecompiledHtmlDirectory("fsr-official", "NoteBooks-Developers", options)).toBe(developers);
        expect(localPrecompiledHtmlDirectory("someone-else", "repo", options)).toBeUndefined();
        expect(localPrecompiledHtmlDirectory("fsr-official", "NoteBooks-Developers", {
          ...options,
          nodeEnv: "production",
        })).toBeUndefined();
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });

    it("prefers an explicitly configured local output directory", () => {
      expect(localPrecompiledHtmlDirectory("fsr-official", "NoteBooks-Developers", {
        nodeEnv: "development",
        configuredDirectory: "/tmp/notebooks-html",
        workingDirectory: "/unused",
      })).toBe("/tmp/notebooks-html");
    });
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
