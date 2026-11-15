import { describe, expect, it } from "vitest";
import { alignPdfPage, getLastPdfSpreadStart } from "../src/lib/pdf-page-navigation";

describe("PDF page spread navigation", () => {
  it("keeps single-page navigation on the selected page", () => {
    expect(alignPdfPage(4, 12, "single")).toBe(4);
  });

  it("aligns either selected page to its two-page spread", () => {
    expect(alignPdfPage(2, 12, "dual")).toBe(1);
    expect(alignPdfPage(6, 12, "dual")).toBe(5);
  });

  it("clamps requested pages and keeps the final even-page spread full", () => {
    expect(alignPdfPage(15, 12, "dual")).toBe(11);
    expect(getLastPdfSpreadStart(12, "dual")).toBe(11);
  });

  it("allows an odd final page to appear alone in dual-page mode", () => {
    expect(getLastPdfSpreadStart(11, "dual")).toBe(11);
  });
});
