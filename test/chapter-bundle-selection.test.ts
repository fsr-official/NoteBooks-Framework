import { describe, expect, it } from "vitest";
import { precompiledChapterId } from "../src/lib/chapter-bundle/selection";

describe("precompiled chapter selection", () => {
  it("maps only matching NOTES files from the builder repository", () => {
    expect(precompiledChapterId(
      "fsr-official",
      "NoteBooks-Developers",
      "research-and-development/src/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION/PHYSICS06-SYSTEM_OF_PARTICLES_AND_ROTATIONAL_MOTION-NOTES.mdx",
    )).toBe("physics06-system-of-particles-and-rotational-motion");
  });

  it("does not select other repositories, files, or mismatched chapter folders", () => {
    expect(precompiledChapterId("someone-else", "NoteBooks-Developers", "research-and-development/src/A/A-NOTES.mdx")).toBeNull();
    expect(precompiledChapterId("fsr-official", "NoteBooks-Documents", "research-and-development/src/A/A-NOTES.mdx")).toBeNull();
    expect(precompiledChapterId("fsr-official", "NoteBooks-Developers", "research-and-development/src/A/A-GLOSSARY.mdx")).toBeNull();
    expect(precompiledChapterId("fsr-official", "NoteBooks-Developers", "research-and-development/src/A/B-NOTES.mdx")).toBeNull();
    expect(precompiledChapterId("fsr-official", "NoteBooks-Developers", "elsewhere/A/A-NOTES.mdx")).toBeNull();
  });
});
