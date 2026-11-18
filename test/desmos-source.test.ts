import { describe, expect, it } from "vitest";
import { formatDesmosDiagnostic, isLegacyDesmosJsonLine } from "@/lib/desmos-source";

describe("Desmos source diagnostics", () => {
  it("recognizes legacy API state fields as JSON-shaped source", () => {
    expect(isLegacyDesmosJsonLine('  { "expressions": [')).toBe(true);
    expect(isLegacyDesmosJsonLine('@curve: y=x')).toBe(false);
  });

  it("includes the source location, offending line, and caret in the detail text", () => {
    expect(formatDesmosDiagnostic(
      '  { "latex": "y=x" }',
      {
        line: 1,
        col: 3,
        code: "E_LEGACY_JSON",
        message: "Use Desmos DSL.",
      },
    )).toBe([
      "E_LEGACY_JSON · line 1, column 3: Use Desmos DSL.",
      '  { "latex": "y=x" }',
      "  ^",
    ].join("\n"));
  });
});
