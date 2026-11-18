import { describe, expect, it } from "vitest";
import { resolvePdfPageMode } from "../src/lib/pdf-page-mode";

describe("PDF page layout preference", () => {
  it("keeps explicitly selected single-page mode across wide layouts", () => {
    expect(resolvePdfPageMode("single", 1440)).toBe("single");
  });

  it("keeps dual-page mode on wide layouts but uses single pages when space is narrow", () => {
    expect(resolvePdfPageMode("dual", 1440)).toBe("dual");
    expect(resolvePdfPageMode("dual", 760)).toBe("single");
    expect(resolvePdfPageMode("dual", 390)).toBe("single");
  });

  it("restores dual-page mode when a narrow viewport becomes wide again", () => {
    expect(resolvePdfPageMode("dual", 700)).toBe("single");
    expect(resolvePdfPageMode("dual", 900)).toBe("dual");
  });
});
