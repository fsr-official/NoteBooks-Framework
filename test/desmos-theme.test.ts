import { describe, expect, it } from "vitest";
import { withDesmosTheme } from "@/lib/desmos-theme";

describe("withDesmosTheme", () => {
  it("uses Desmos light colors in a light session", () => {
    expect(withDesmosTheme({ lockViewport: true }, "light")).toEqual({
      lockViewport: true,
      invertedColors: false,
    });
  });

  it("uses Desmos inverted colors in a dark or not-yet-initialized session", () => {
    expect(withDesmosTheme({ keypad: false }, "dark")).toEqual({
      keypad: false,
      invertedColors: true,
    });
    expect(withDesmosTheme(undefined, undefined)).toEqual({ invertedColors: true });
  });
});
