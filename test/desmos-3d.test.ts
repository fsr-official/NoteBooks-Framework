import { describe, expect, it } from "vitest";
import { compileDesmos3D } from "@/lib/desmos-3d";

describe("compileDesmos3D", () => {
  it("compiles ordinary expressions and vector sugar without parsing LaTeX", () => {
    const result = compileDesmos3D([
      "%preset arrow lineWidth=4 arrowSize=1.2",
      "@t [slider=(0,3,0.1)]: t=1",
      "%vector a [use=arrow, color=red, showLabel] dir=(2,1,3)",
      "%vector b [use=arrow, color=blue] at=(1,2,3) dir=(-1,a+b,t)",
      "@handwritten: \\operatorname{vector}\\left(\\left(0,0,0\\right),\\left(1,-1,2\\right)\\right)",
    ].join("\n"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.target).toBe("3d");
    expect(result.output.expressions).toEqual([
      { id: "t", latex: "t=1", sliderBounds: { min: "0", max: "3", step: "0.1" } },
      {
        id: "a",
        latex: "\\operatorname{vector}\\left(\\left(0,0,0\\right),\\left(2,1,3\\right)\\right)",
        lineWidth: 4,
        arrowSize: 1.2,
        color: "#c74440",
        showLabel: true,
        label: "a",
      },
      {
        id: "b",
        latex: "\\operatorname{vector}\\left(\\left(1,2,3\\right),\\left(1+\\left(-1\\right),2+\\left(a+b\\right),3+\\left(t\\right)\\right)\\right)",
        lineWidth: 4,
        arrowSize: 1.2,
        color: "#2d70b3",
      },
      {
        id: "handwritten",
        latex: "\\operatorname{vector}\\left(\\left(0,0,0\\right),\\left(1,-1,2\\right)\\right)",
      },
    ]);
    expect(result.output.vectorIds).toEqual(["a", "b"]);
    expect(result.output.vectorLatex.a).toContain("\\operatorname{vector}");
  });

  it("compiles point, vector-list and axis sugar and tracks 3D drag capabilities", () => {
    const result = compileDesmos3D([
      "%point3 P at=(1,2,3) [color=black, showLabel]",
      "%vectors basis at=(0,0,0) [color=green]",
      "  dir=(1,0,0) id=i",
      "  dir=(0,1,0)",
      "%axes [length=5, labels=(\"X axis\",\"Y axis\",\"Z axis\"), color=blue]",
      "%vector movable [drag=xyz] dir=(1,2,3)",
    ].join("\n"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.expressions).toEqual(expect.arrayContaining([
      { id: "P", latex: "P=\\left(1,2,3\\right)", color: "#000000", showLabel: true, label: "P" },
      expect.objectContaining({ id: "basis_i", color: "#348543" }),
      expect.objectContaining({ id: "basis_1", color: "#348543" }),
      expect.objectContaining({ id: "axis_x", label: "X axis", showLabel: true }),
      expect.objectContaining({ id: "axis_z", label: "Z axis", showLabel: true }),
    ]));
    expect(result.output.zDragIds).toEqual(["movable"]);
  });

  it("compiles 3D bounds, settings, surface domains, mesh style, and camera metadata", () => {
    const result = compileDesmos3D([
      "%view x=(-4,4) y=(-3,3) z=(-2,8)",
      "%settings showGrid=true showZAxis=true zAxisLabel=\"height\" axisArrowMode=positive",
      "%camera azimuth=35 elevation=20 zoom=1.5",
      "@surface [fill=0.35, surface=mesh, mesh=12, xDomain=(-3,3), yDomain=(-2,2), color=purple]: z=x^2-y^2",
      "@parametric [uDomain=(0,2\\pi), vDomain=(0,1)]: \\left(u,v,uv\\right)",
    ].join("\n"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.bounds).toEqual({
      xmin: -4,
      xmax: 4,
      ymin: -3,
      ymax: 3,
      zmin: -2,
      zmax: 8,
    });
    expect(result.output.settings).toEqual({
      showGrid: true,
      showZAxis: true,
      zAxisLabel: "height",
      axisArrowMode: "POSITIVE",
    });
    expect(result.output.camera).toEqual({ azimuth: 35, elevation: 20, zoom: 1.5 });
    expect(result.output.expressions).toEqual([
      {
        id: "surface",
        latex: "z=x^2-y^2",
        fillOpacity: 0.35,
        surfaceStyle: "mesh",
        meshDensity: 12,
        color: "#6042a6",
        domain: { x: { min: "-3", max: "3" }, y: { min: "-2", max: "2" } },
      },
      {
        id: "parametric",
        latex: "\\left(u,v,uv\\right)",
        parametricDomain: { u: { min: "0", max: "2\\pi" }, v: { min: "0", max: "1" } },
      },
    ]);
  });

  it("supports Desmos text and tabular states without grouping coordinate columns", () => {
    const result = compileDesmos3D([
      "%note caption: Spatial sample points",
      "%table coordinates",
      "  col latex=x_1 values=(1,2,3)",
      "  col latex=y_1 values=(4,5,6)",
      "  col latex=z_1 values=(7,8,9)",
      "@after_table: z=x+y",
    ].join("\n"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.expressions).toEqual([
      { id: "caption", type: "text", text: "Spatial sample points" },
      {
        id: "coordinates",
        type: "table",
        columns: [
          { latex: "x_1", values: ["1", "2", "3"] },
          { latex: "y_1", values: ["4", "5", "6"] },
          { latex: "z_1", values: ["7", "8", "9"] },
        ],
      },
      { id: "after_table", latex: "z=x+y" },
    ]);
  });

  it("returns located diagnostics for bad ids, tuple arity, conflicting forms, domains, and 2D-only keys", () => {
    const result = compileDesmos3D([
      "%vector broken from=(0,0) to=(1,2,3)",
      "%vector mixed from=(0,0,0) to=(1,1,1) dir=(1,2,3)",
      "@bad [uDomain=(0,1)]: z=x",
      "@other [polarDomain=(0,1), labelOrientation=above]: z=y",
      "@bad: z=2",
    ].join("\n"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "E_VECTOR_ARITY",
      "E_VECTOR_FORM",
      "E_DOMAIN_PAIR",
      "E_2D_ONLY",
      "E_DUP_ID",
    ]));
    expect(result.diagnostics.every(({ line, col }) => line > 0 && col > 0)).toBe(true);
  });

  it("rejects unverified runtime directives and invalid surfaces or ranges", () => {
    const result = compileDesmos3D([
      "%folder groups [title=\"Groups\"]",
      "%verify strict",
      "%view x=(2,2) z=(0,4)",
      "@shape [surface=unknown, mesh=0]: z=x",
    ].join("\n"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "E_UNSUPPORTED_DIRECTIVE",
      "E_VIEW_RANGE",
      "E_BAD_ENUM",
      "E_BAD_RANGE",
    ]));
  });
});
