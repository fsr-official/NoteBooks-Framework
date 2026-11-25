import { describe, expect, it } from "vitest";
import {
  compareExplorerFiles,
  getFileTypeBadge,
  listDirectoryEntries,
  type ExplorerFile,
} from "../src/lib/file-explorer";

const entries: Record<string, ExplorerFile> = {
  "owner/repo/biology/chapter-one/CNOTES.md": {
    fileName: "CNOTES.md",
    filePath: "biology/chapter-one/CNOTES.md",
    repository: "owner/repo",
  },
  "owner/repo/biology/chapter-one/GLOSSARY.md": {
    fileName: "GLOSSARY.md",
    filePath: "biology/chapter-one/GLOSSARY.md",
    repository: "owner/repo",
  },
  "owner/repo/biology/chapter-one/NOTES.md": {
    fileName: "NOTES.md",
    filePath: "biology/chapter-one/NOTES.md",
    repository: "owner/repo",
  },
  "owner/repo/biology/overview.md": {
    fileName: "overview.md",
    filePath: "biology/overview.md",
    repository: "owner/repo",
  },
};

describe("file explorer", () => {
  it("lists immediate directories before files and keeps nested paths intact", () => {
    const rootEntries = listDirectoryEntries(entries, "owner/repo", "");
    expect(rootEntries).toEqual([
      { kind: "directory", name: "biology", path: "biology", fileCount: 4 },
    ]);

    const biologyEntries = listDirectoryEntries(entries, "owner/repo", "biology");
    expect(biologyEntries).toEqual([
      { kind: "directory", name: "chapter-one", path: "biology/chapter-one", fileCount: 3 },
      { kind: "file", key: "owner/repo/biology/overview.md", file: entries["owner/repo/biology/overview.md"] },
    ]);

    const chapterEntries = listDirectoryEntries(entries, "owner/repo", "biology/chapter-one");
    expect(chapterEntries.map((entry) => entry.kind === "file" ? entry.file.filePath : entry.path)).toEqual([
      "biology/chapter-one/NOTES.md",
      "biology/chapter-one/CNOTES.md",
      "biology/chapter-one/GLOSSARY.md",
    ]);
  });

  it("keeps special note files first in their requested order for either name sort", () => {
    const names = ["z-extra.md", "CNOTES.md", "GLOSSARY.md", "NOTES.md", "a-extra.md"];

    expect([...names].sort((left, right) => compareExplorerFiles(left, right, "name-asc"))).toEqual([
      "NOTES.md",
      "CNOTES.md",
      "GLOSSARY.md",
      "a-extra.md",
      "z-extra.md",
    ]);
    expect([...names].sort((left, right) => compareExplorerFiles(left, right, "name-desc"))).toEqual([
      "NOTES.md",
      "CNOTES.md",
      "GLOSSARY.md",
      "z-extra.md",
      "a-extra.md",
    ]);
  });

  it("shows separate file badges for CNOTES, GLOSSARY, and NOTES", () => {
    expect(getFileTypeBadge("lesson-CNOTES.md")).toEqual({ label: "CN", kind: "cnotes" });
    expect(getFileTypeBadge("subject-GLOSSARY.md")).toEqual({ label: "GL", kind: "glossary" });
    expect(getFileTypeBadge("chapter-NOTES.md")).toEqual({ label: "NT", kind: "notes" });
    expect(getFileTypeBadge("diagram.pdf")).toEqual({ label: "PDF", kind: "file" });
  });
});
