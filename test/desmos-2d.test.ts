import { describe, expect, it } from "vitest";
import { compileDesmos2D } from "@/lib/desmos-2d";

describe("compileDesmos2D", () => {
  it("passes LaTeX through and compiles labels, colors, styles, and continuous sliders", () => {
    const result = compileDesmos2D([
      "@t [slider=(0,2\\pi), color=inv]: t=1",
      "@f [color=blue, lineStyle=dashed, lineWidth=3, showLabel]: f\\left(x\\right)=\\sin(x)",
      "@P [color=#ff0000, pointStyle=diamond, label=\"Peak\", labelOrientation=above]: P=(1,1)",
      "y=0",
    ].join("\n"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.expressions).toEqual([
      { id: "t", latex: "t=1", hidden: true, sliderBounds: { min: "0", max: "2\\pi" } },
      {
        id: "f",
        latex: "f\\left(x\\right)=\\sin(x)",
        color: "#2d70b3",
        lineStyle: "DASHED",
        lineWidth: 3,
        showLabel: true,
        label: "f",
      },
      {
        id: "P",
        latex: "P=(1,1)",
        color: "#ff0000",
        pointStyle: "DIAMOND",
        label: "Peak",
        labelOrientation: "ABOVE",
      },
      { id: "auto_1", latex: "y=0" },
    ]);
  });

  it("compiles presets, tables, notes, settings, options, and view bounds", () => {
    const result = compileDesmos2D([
      "%options lockViewport keypad=false",
      "%settings xAxisArrowMode=both xAxisLabel=\"time\" degreeMode=true",
      "%view x=(-2,12) y=(-3,8)",
      "%preset curve color=green lineWidth=2",
      "  // explicit table columns follow",
      "@curve [use=curve, lineStyle=dotted]: y=x^2",
      "%note explanation: Table values are measured in metres.",
      "%table samples",
      "  col latex=x values=(1,2,3) points lines",
      "  col latex=y values=(1,4,9) color=red",
    ].join("\n"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.options).toEqual({ lockViewport: true, keypad: false });
    expect(result.output.settings).toEqual({
      xAxisArrowMode: "BOTH",
      xAxisLabel: "time",
      degreeMode: true,
    });
    expect(result.output.bounds).toEqual({ left: -2, right: 12, bottom: -3, top: 8 });
    expect(result.output.expressions).toEqual([
      { id: "curve", latex: "y=x^2", color: "#348543", lineWidth: 2, lineStyle: "DOTTED" },
      { id: "explanation", type: "text", text: "Table values are measured in metres." },
      {
        id: "samples",
        type: "table",
        columns: [
          { latex: "x", values: ["1", "2", "3"], points: true, lines: true },
          { latex: "y", values: ["1", "4", "9"], color: "#c74440" },
        ],
      },
    ]);
  });

  it("reports invalid source with locations and refuses undocumented fields and directives", () => {
    const result = compileDesmos2D([
      "@same [lineOpacity=2]: y=x",
      "@same [cdf=(0,1)]: y=x",
      "%folder parameters [title=\"Parameters\"]",
    ].join("\n"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "E_BAD_RANGE", line: 1, id: "same" }),
      expect.objectContaining({ code: "E_UNKNOWN_ATTR", line: 2, field: "cdf" }),
      expect.objectContaining({ code: "E_DUP_ID", line: 2, id: "same" }),
      expect.objectContaining({ code: "E_UNSUPPORTED_DIRECTIVE", line: 3 }),
    ]));
  });

  it("rejects malformed ranges, duplicate ids, and unknown attributes", () => {
    const result = compileDesmos2D([
      "%view x=(4,1) y=(0,2)",
      "@x [color=not-a-color, madeUp=true]: x=1",
      "@x: x=2",
    ].join("\n"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "E_VIEW_RANGE",
      "E_BAD_ENUM",
      "E_UNKNOWN_ATTR",
      "E_DUP_ID",
    ]));
  });

  it("preserves LaTeX text while removing only whitespace-prefixed DSL comments", () => {
    const result = compileDesmos2D("@f: y=x // this is a comment");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.expressions[0]).toMatchObject({ id: "f", latex: "y=x" });
  });

  it("validates preset declarations even when no expression uses them", () => {
    const result = compileDesmos2D("%preset broken unknownField=1\ny=x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "E_UNKNOWN_ATTR",
      field: "unknownField",
      line: 1,
    }));
  });
});
