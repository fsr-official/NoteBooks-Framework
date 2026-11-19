import { isLegacyDesmosJsonLine } from "@/lib/desmos-source";

export type DesmosPhase = "compile";

export type DesmosSeverity = "error" | "warning";

export type DesmosDiagnostic = {
  phase: DesmosPhase;
  severity: DesmosSeverity;
  code: string;
  message: string;
  line: number;
  col: number;
  id?: string;
  field?: string;
};

type DesmosExpression = {
  id: string;
  type?: "expression" | "text" | "table";
  latex?: string;
  text?: string;
  secret?: boolean;
  color?: string;
  hidden?: boolean;
  lineStyle?: "SOLID" | "DASHED" | "DOTTED";
  lineWidth?: number;
  lineOpacity?: number;
  pointStyle?: "POINT" | "OPEN" | "CROSS" | "SQUARE" | "PLUS" | "TRIANGLE" | "DIAMOND" | "STAR";
  pointSize?: number;
  pointOpacity?: number;
  fill?: boolean;
  fillOpacity?: number;
  points?: boolean;
  lines?: boolean;
  sliderBounds?: { min: string; max: string; step?: string };
  parametricDomain?: { min: string; max: string };
  polarDomain?: { min: string; max: string };
  dragMode?: "AUTO" | "NONE" | "X" | "Y" | "XY";
  label?: string;
  showLabel?: boolean;
  labelSize?: string;
  labelOrientation?: "DEFAULT" | "ABOVE" | "BELOW" | "LEFT" | "RIGHT";
  columns?: DesmosTableColumn[];
};

type DesmosTableColumn = {
  latex: string;
  values?: string[];
  color?: string;
  hidden?: boolean;
  points?: boolean;
  lines?: boolean;
  lineStyle?: "SOLID" | "DASHED" | "DOTTED";
  lineWidth?: number | string;
  lineOpacity?: number | string;
  pointStyle?: DesmosExpression["pointStyle"];
  pointSize?: number | string;
  pointOpacity?: number | string;
  dragMode?: DesmosExpression["dragMode"];
};

type GraphSettings = Record<string, string | boolean>;
type CalculatorOptions = Record<string, boolean>;

export type Desmos2DOutput = {
  options?: CalculatorOptions;
  settings?: GraphSettings;
  expressions: DesmosExpression[];
  bounds?: { left: number; right: number; bottom: number; top: number };
};

export type Desmos2DCompileResult =
  | { ok: true; output: Desmos2DOutput; diagnostics: DesmosDiagnostic[] }
  | { ok: false; diagnostics: DesmosDiagnostic[] };

type Attribute = { key: string; value: string | true; col: number };
type Preset = { values: Map<string, Attribute>; line: number; col: number };

const ID_PATTERN = /^[A-Za-z0-9_]+$/;
const RESERVED_ID_PREFIX = "auto_";
const COLOR_NAMES: Record<string, string> = {
  red: "#c74440",
  blue: "#2d70b3",
  green: "#388c46",
  purple: "#6042a6",
  orange: "#fa7e19",
  black: "#000000",
};
const LINE_STYLES = new Set(["solid", "dashed", "dotted"]);
const POINT_STYLES: Record<string, NonNullable<DesmosExpression["pointStyle"]>> = {
  point: "POINT",
  open: "OPEN",
  cross: "CROSS",
  square: "SQUARE",
  plus: "PLUS",
  triangle: "TRIANGLE",
  diamond: "DIAMOND",
  star: "STAR",
};
const DRAG_MODES: Record<string, NonNullable<DesmosExpression["dragMode"]>> = {
  auto: "AUTO",
  none: "NONE",
  x: "X",
  y: "Y",
  xy: "XY",
};
const LABEL_ORIENTATIONS: Record<string, NonNullable<DesmosExpression["labelOrientation"]>> = {
  default: "DEFAULT",
  above: "ABOVE",
  below: "BELOW",
  left: "LEFT",
  right: "RIGHT",
};
const OPTION_FLAGS = new Set([
  "lockViewport", "expressionsCollapsed", "keypad", "graphpaper", "expressions", "settingsMenu",
  "zoomButtons", "border", "pointsOfInterest", "expressionsTopbar", "singleVariableSolutions",
  "images", "folders", "administerSecretFolders", "authorFeatures",
]);
const SETTINGS = new Set([
  "xAxisArrowMode", "yAxisArrowMode", "xAxisLabel", "yAxisLabel", "degreeMode",
]);
const ATTR_ALIASES: Record<string, string> = {
  colour: "color",
  drag: "dragMode",
  inv: "hidden",
};
const ATTRIBUTE_KEYS = new Set([
  "hidden", "color", "slider", "domain", "dragMode", "showLabel", "label", "labelSize",
  "labelOrientation", "lineStyle", "lineWidth", "lineOpacity", "pointStyle", "pointSize",
  "pointOpacity", "fill", "fillOpacity", "parametricDomain", "polarDomain", "secret", "folder",
  "use", "inv", "colour",
]);
const TABLE_COLUMN_KEYS = new Set([
  "latex", "values", "color", "colour", "hidden", "points", "lines", "lineStyle", "lineWidth",
  "lineOpacity", "pointStyle", "pointSize", "pointOpacity", "drag", "dragMode",
]);

function diagnostic(
  severity: DesmosSeverity,
  code: string,
  message: string,
  line: number,
  col: number,
  extra: Pick<DesmosDiagnostic, "id" | "field"> = {},
): DesmosDiagnostic {
  return { phase: "compile", severity, code, message, line, col, ...extra };
}

function splitTopLevel(value: string, separator: string): string[] | null {
  const parts: string[] = [];
  let start = 0;
  let quote = false;
  let escaped = false;
  const stack: string[] = [];
  const closeFor: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\" && quote) {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quote = !quote;
      continue;
    }
    if (quote) continue;
    if (closeFor[character]) {
      stack.push(closeFor[character]);
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      if (stack.pop() !== character) return null;
      continue;
    }
    if (character === separator && stack.length === 0) {
      parts.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote || stack.length) return null;
  parts.push(value.slice(start).trim());
  return parts;
}

function unquote(value: string): string | null {
  if (!value.startsWith('"')) return value;
  if (!value.endsWith('"') || value.length < 2) return null;
  return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

function parseAttributes(
  source: string,
  line: number,
  col: number,
  diagnostics: DesmosDiagnostic[],
  allowed: Set<string> = ATTRIBUTE_KEYS,
): Attribute[] {
  if (!source.trim()) return [];
  const chunks = splitTopLevel(source, ",");
  if (!chunks) {
    diagnostics.push(diagnostic("error", "E_ATTR_SYNTAX", "Unbalanced quotes or brackets in attributes.", line, col));
    return [];
  }
  const attributes: Attribute[] = [];
  let searchOffset = 0;
  for (const chunk of chunks) {
    const chunkOffset = source.indexOf(chunk, searchOffset);
    const chunkCol = col + Math.max(0, chunkOffset);
    searchOffset = Math.max(searchOffset, chunkOffset + chunk.length);
    if (!chunk) {
      diagnostics.push(diagnostic("error", "E_ATTR_SYNTAX", "Empty attribute.", line, chunkCol));
      continue;
    }
    const equals = splitTopLevel(chunk, "=");
    if (!equals) {
      diagnostics.push(diagnostic("error", "E_ATTR_SYNTAX", "Unbalanced quotes or brackets in attribute.", line, chunkCol));
      continue;
    }
    const key = equals[0].trim();
    const rawValue = equals.length > 1 ? chunk.slice(chunk.indexOf("=") + 1).trim() : "";
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      diagnostics.push(diagnostic("error", "E_ATTR_SYNTAX", `Invalid attribute name '${key}'.`, line, chunkCol));
      continue;
    }
    if (!allowed.has(key)) {
      diagnostics.push(diagnostic("error", "E_UNKNOWN_ATTR", `Unknown attribute '${key}'.`, line, chunkCol, { field: key }));
      continue;
    }
    if (equals.length > 2 || (equals.length === 2 && !rawValue)) {
      diagnostics.push(diagnostic("error", "E_ATTR_SYNTAX", `Attribute '${key}' needs one non-empty value.`, line, chunkCol, { field: key }));
      continue;
    }
    const value = equals.length === 1 ? true : unquote(rawValue);
    if (value === null) {
      diagnostics.push(diagnostic("error", "E_ATTR_SYNTAX", `Malformed quoted value for '${key}'.`, line, chunkCol, { field: key }));
      continue;
    }
    attributes.push({ key, value, col: chunkCol });
  }
  return attributes;
}

function parseTuple(
  value: string,
  count: number[],
  line: number,
  col: number,
  key: string,
  diagnostics: DesmosDiagnostic[],
): string[] | null {
  const match = value.match(/^\(([\s\S]*)\)$/);
  const values = match ? splitTopLevel(match[1], ",") : null;
  if (!values || !count.includes(values.length) || values.some((entry) => !entry)) {
    diagnostics.push(diagnostic("error", "E_BAD_VALUE", `'${key}' must be a tuple with ${count.join(" or ")} values.`, line, col, { field: key }));
    return null;
  }
  return values;
}

function parseTupleList(
  value: string,
  line: number,
  col: number,
  key: string,
  diagnostics: DesmosDiagnostic[],
): string[] | null {
  const match = value.match(/^\(([\s\S]*)\)$/);
  const values = match ? splitTopLevel(match[1], ",") : null;
  if (!values || !values.length || values.some((entry) => !entry)) {
    diagnostics.push(diagnostic("error", "E_BAD_VALUE", `'${key}' must be a non-empty tuple.`, line, col, { field: key }));
    return null;
  }
  return values;
}

function numeric(
  value: string | true,
  key: string,
  line: number,
  col: number,
  diagnostics: DesmosDiagnostic[],
  minimum: number,
  maximum = Number.POSITIVE_INFINITY,
): number | undefined {
  const number = typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    diagnostics.push(diagnostic("error", "E_BAD_RANGE", `'${key}' must be a number in the range ${minimum}..${maximum}.`, line, col, { field: key }));
    return undefined;
  }
  return number;
}

function boolValue(
  value: string | true,
  key: string,
  line: number,
  col: number,
  diagnostics: DesmosDiagnostic[],
): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === "false") return false;
  diagnostics.push(diagnostic("error", "E_BAD_VALUE", `'${key}' must be true or false.`, line, col, { field: key }));
  return undefined;
}

function enumValue<T extends string>(
  value: string | true,
  key: string,
  mapping: Record<string, T>,
  line: number,
  col: number,
  diagnostics: DesmosDiagnostic[],
): T | undefined {
  const mapped = typeof value === "string" ? mapping[value.toLowerCase()] : undefined;
  if (mapped) return mapped;
  diagnostics.push(diagnostic("error", "E_BAD_ENUM", `Invalid value for '${key}'.`, line, col, { field: key }));
  return undefined;
}

function parseColor(
  value: string | true,
  line: number,
  col: number,
  diagnostics: DesmosDiagnostic[],
): string | "inv" | undefined {
  if (typeof value === "string" && value.toLowerCase() === "inv") return "inv";
  if (typeof value !== "string") {
    diagnostics.push(diagnostic("error", "E_BAD_ENUM", "'color' needs a color name or #rrggbb value.", line, col, { field: "color" }));
    return undefined;
  }
  const color = COLOR_NAMES[value.toLowerCase()] ?? value;
  if (!/^#[\da-f]{6}$/i.test(color)) {
    diagnostics.push(diagnostic("error", "E_BAD_ENUM", `Unknown or malformed color '${value}'.`, line, col, { field: "color" }));
    return undefined;
  }
  return color.toLowerCase();
}

function setAttribute(
  target: Record<string, unknown>,
  attribute: Attribute,
  line: number,
  id: string,
  diagnostics: DesmosDiagnostic[],
  context: "expression" | "table" | "column" = "expression",
): void {
  const key = ATTR_ALIASES[attribute.key] ?? attribute.key;
  const { value, col } = attribute;
  const error = (code: string, message: string, field = key) => {
    diagnostics.push(diagnostic("error", code, message, line, col, { id, field }));
  };
  if (key === "use" || key === "folder") return;
  if (key === "hidden" || key === "secret" || key === "showLabel" || key === "points" || key === "lines") {
    const result = boolValue(value, key, line, col, diagnostics);
    if (result !== undefined) target[key] = result;
    return;
  }
  if (key === "color") {
    const color = parseColor(value, line, col, diagnostics);
    if (color === "inv") {
      target.hidden = true;
      delete target.color;
    }
    else if (color) target.color = color;
    return;
  }
  if (key === "slider") {
    if (context !== "expression") { error("E_UNKNOWN_ATTR", "'slider' is only valid on expressions."); return; }
    if (typeof value !== "string") { error("E_BAD_VALUE", "'slider' requires a tuple."); return; }
    const values = parseTuple(value, [2, 3], line, col, key, diagnostics);
    if (values) target.sliderBounds = { min: values[0], max: values[1], ...(values[2] ? { step: values[2] } : {}) };
    return;
  }
  if (key === "domain" || key === "parametricDomain" || key === "polarDomain") {
    if (key === "domain") { error("E_UNKNOWN_ATTR", "Use parametricDomain or polarDomain; there is no generic domain field."); return; }
    if (typeof value !== "string") { error("E_BAD_VALUE", `'${key}' requires a tuple.`); return; }
    const values = parseTuple(value, [2], line, col, key, diagnostics);
    if (values) target[key] = { min: values[0], max: values[1] };
    return;
  }
  if (key === "dragMode") {
    const mapped = enumValue(value, key, DRAG_MODES, line, col, diagnostics);
    if (mapped) target.dragMode = mapped;
    return;
  }
  if (key === "lineStyle") {
    if (typeof value !== "string" || !LINE_STYLES.has(value.toLowerCase())) {
      error("E_BAD_ENUM", `Invalid value for '${key}'.`);
    } else target.lineStyle = value.toUpperCase();
    return;
  }
  if (key === "pointStyle") {
    const mapped = enumValue(value, key, POINT_STYLES, line, col, diagnostics);
    if (mapped) target.pointStyle = mapped;
    return;
  }
  if (key === "labelOrientation") {
    const mapped = enumValue(value, key, LABEL_ORIENTATIONS, line, col, diagnostics);
    if (mapped) target.labelOrientation = mapped;
    return;
  }
  if (key === "lineWidth" || key === "pointSize") {
    if (context === "expression") {
      const result = numeric(value, key, line, col, diagnostics, 0, Number.POSITIVE_INFINITY);
      if (result !== undefined && result > 0) target[key] = result;
      else if (result === 0) error("E_BAD_RANGE", `'${key}' must be greater than zero.`);
    } else if (typeof value === "string" && value.trim()) {
      const number = Number(value);
      if (Number.isFinite(number)) {
        if (number > 0) target[key] = number;
        else error("E_BAD_RANGE", `'${key}' must be greater than zero.`);
      } else target[key] = value;
    } else error("E_BAD_RANGE", `'${key}' must be positive.`);
    return;
  }
  if (key === "lineOpacity" || key === "pointOpacity" || key === "fillOpacity" || key === "fill") {
    if (key === "fill" && context === "expression") {
      const result = boolValue(value, key, line, col, diagnostics);
      if (result !== undefined) target.fill = result;
      return;
    }
    const result = numeric(value, key, line, col, diagnostics, 0, 1);
    if (result !== undefined) target[key] = result;
    return;
  }
  if (key === "label" || key === "labelSize") {
    if (typeof value !== "string") error("E_BAD_VALUE", `'${key}' requires a value.`);
    else target[key] = value;
    return;
  }
  error("E_UNKNOWN_ATTR", `Attribute '${key}' is not supported here.`);
}

function parseDirectiveArgs(
  source: string,
  line: number,
  col: number,
  diagnostics: DesmosDiagnostic[],
): Attribute[] {
  const chunks: Array<{ value: string; index: number }> = [];
  const closing: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      if (start < 0) start = index;
      continue;
    }
    if (quoted) continue;
    if (closing[character]) {
      stack.push(closing[character]);
      if (start < 0) start = index;
      continue;
    }
    if (character === ")" || character === "]" || character === "}") {
      if (stack.pop() !== character) {
        diagnostics.push(diagnostic("error", "E_DIRECTIVE_SYNTAX", "Unbalanced brackets in directive arguments.", line, col + index));
        return [];
      }
      continue;
    }
    if (/\s/.test(character) && stack.length === 0) {
      if (start >= 0) chunks.push({ value: source.slice(start, index), index: start });
      start = -1;
    } else if (start < 0) start = index;
  }
  if (quoted || stack.length) {
    diagnostics.push(diagnostic("error", "E_DIRECTIVE_SYNTAX", "Unbalanced quotes or brackets in directive arguments.", line, col + Math.max(start, 0)));
    return [];
  }
  if (start >= 0) chunks.push({ value: source.slice(start), index: start });

  const attrs: Attribute[] = [];
  for (const { value: chunk, index } of chunks) {
    const attributeCol = col + index;
    const split = chunk.indexOf("=");
    if (split < 0) {
      attrs.push({ key: chunk, value: true, col: attributeCol });
      continue;
    }
    const key = chunk.slice(0, split);
    const rawValue = chunk.slice(split + 1);
    const value = unquote(rawValue);
    if (!key || !rawValue || value === null) {
      diagnostics.push(diagnostic("error", "E_DIRECTIVE_SYNTAX", `Malformed directive argument '${chunk}'.`, line, attributeCol));
    } else attrs.push({ key, value, col: attributeCol });
  }
  return attrs;
}

function stripComment(line: string): string {
  let quote = false;
  let escaped = false;
  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\" && quote) { escaped = true; continue; }
    if (character === '"') { quote = !quote; continue; }
    if (!quote && character === "/" && line[index + 1] === "/" && /\s/.test(line[index - 1] ?? "")) {
      return line.slice(0, index).trimEnd();
    }
  }
  return line;
}

function parseHeader(
  lineText: string,
  line: number,
  diagnostics: DesmosDiagnostic[],
): { id: string; attrs: Attribute[]; latex: string } | null {
  const match = lineText.match(/^@([^\s:[\]]+)\s*(?:\[([\s\S]*?)\])?\s*:\s*([\s\S]*)$/);
  if (!match) {
    diagnostics.push(diagnostic("error", "E_HEADER_SYNTAX", "Expected '@id [attributes]: LaTeX'.", line, 1));
    return null;
  }
  const [, id, rawAttributes = "", rawLatex] = match;
  if (!ID_PATTERN.test(id) || id.startsWith(RESERVED_ID_PREFIX)) {
    diagnostics.push(diagnostic("error", "E_BAD_ID", `Invalid or reserved expression id '${id}'.`, line, 2, { id }));
  }
  const attrs = parseAttributes(rawAttributes, line, lineText.indexOf("[") + 2, diagnostics);
  return { id, attrs, latex: rawLatex };
}

function assignUniqueId(
  id: string,
  line: number,
  col: number,
  ids: Map<string, { line: number; col: number }>,
  diagnostics: DesmosDiagnostic[],
): boolean {
  const prior = ids.get(id);
  if (prior) {
    diagnostics.push(diagnostic("error", "E_DUP_ID", `Duplicate id '${id}' (first declared on line ${prior.line}).`, line, col, { id }));
    return false;
  }
  ids.set(id, { line, col });
  return true;
}

function compileExpressionAttributes(
  attrs: Attribute[],
  id: string,
  line: number,
  presets: Map<string, Preset>,
  diagnostics: DesmosDiagnostic[],
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const useAttrs = attrs.filter((attribute) => attribute.key === "use");
  if (useAttrs.length > 1) diagnostics.push(diagnostic("error", "E_DUP_ATTR", "Only one preset may be used on an expression.", line, useAttrs[1].col, { id, field: "use" }));
  const presetName = useAttrs[0]?.value;
  if (presetName !== undefined) {
    const preset = typeof presetName === "string" ? presets.get(presetName) : undefined;
    if (!preset) diagnostics.push(diagnostic("error", "E_NO_PRESET", `Unknown preset '${String(presetName)}'.`, line, useAttrs[0].col, { id, field: "use" }));
    else {
      for (const attribute of preset.values.values()) {
        const start = diagnostics.length;
        setAttribute(output, attribute, line, id, diagnostics);
        diagnostics.slice(start).forEach((entry) => { entry.id ??= id; });
      }
    }
  }
  const seen = new Set<string>();
  const colors = attrs.filter((attribute) => attribute.key === "color" || attribute.key === "colour");
  if (colors.length > 1) diagnostics.push(diagnostic("error", "E_DUP_COLOR", "Specify color or colour only once.", line, colors[1].col, { id, field: "color" }));

  for (const attribute of attrs) {
    const key = ATTR_ALIASES[attribute.key] ?? attribute.key;
    if (key === "use") continue;
    if (seen.has(key)) diagnostics.push(diagnostic("error", "E_DUP_ATTR", `Attribute '${key}' is specified more than once.`, line, attribute.col, { id, field: key }));
    seen.add(key);
    if (key === "folder") {
      diagnostics.push(diagnostic("error", "E_UNSUPPORTED_DIRECTIVE", "'folder=' is not supported by the documented setExpressions API.", line, attribute.col, { id, field: "folder" }));
    } else {
      const start = diagnostics.length;
      setAttribute(output, attribute, line, id, diagnostics);
      diagnostics.slice(start).forEach((entry) => { entry.id ??= id; });
    }
  }
  if (output.showLabel === true && !output.label) output.label = id;
  if (output.hidden === true && output.showLabel === true) {
    diagnostics.push(diagnostic("warning", "W_HIDDEN_LABEL", "A hidden expression cannot show its label.", line, 1, { id, field: "showLabel" }));
  }
  return output;
}

function parseView(
  rest: string,
  line: number,
  diagnostics: DesmosDiagnostic[],
): Desmos2DOutput["bounds"] | undefined {
  const values = new Map<string, [number, number]>();
  for (const match of rest.matchAll(/([xy])\s*=\s*(\([^)]*\))/g)) {
    const key = match[1];
    const tuple = match[2];
    if (values.has(key)) {
      diagnostics.push(diagnostic("error", "E_VIEW_SYNTAX", `Duplicate ${key}-axis bounds.`, line, 1, { field: "bounds" }));
      continue;
    }
    const parts = splitTopLevel(tuple.slice(1, -1), ",");
    const pair = parts?.map(Number);
    if (!parts || parts.length !== 2 || parts.some((value) => !value) || !pair || pair.some((value) => !Number.isFinite(value))) {
      diagnostics.push(diagnostic("error", "E_VIEW_RANGE", `Invalid ${key}-axis bounds.`, line, 1, { field: "bounds" }));
    } else values.set(key, [pair[0], pair[1]]);
  }
  const residue = rest.replace(/([xy])\s*=\s*\([^)]*\)/g, "").trim();
  if (residue || values.size !== 2) {
    diagnostics.push(diagnostic("error", "E_VIEW_SYNTAX", "Use '%view x=(left,right) y=(bottom,top)'.", line, 1, { field: "bounds" }));
    return undefined;
  }
  const x = values.get("x");
  const y = values.get("y");
  if (!x || !y || x[0] >= x[1] || y[0] >= y[1]) {
    diagnostics.push(diagnostic("error", "E_VIEW_RANGE", "View bounds must have left < right and bottom < top.", line, 1, { field: "bounds" }));
    return undefined;
  }
  return { left: x[0], right: x[1], bottom: y[0], top: y[1] };
}

function parseGraphAttributes(
  attrs: Attribute[],
  line: number,
  diagnostics: DesmosDiagnostic[],
  kind: "options",
): CalculatorOptions;
function parseGraphAttributes(
  attrs: Attribute[],
  line: number,
  diagnostics: DesmosDiagnostic[],
  kind: "settings",
): GraphSettings;
function parseGraphAttributes(
  attrs: Attribute[],
  line: number,
  diagnostics: DesmosDiagnostic[],
  kind: "options" | "settings",
): Record<string, string | boolean> {
  const target: Record<string, string | boolean> = {};
  const allowed = kind === "options" ? OPTION_FLAGS : SETTINGS;
  const seen = new Set<string>();
  for (const attribute of attrs) {
    if (!allowed.has(attribute.key)) {
      diagnostics.push(diagnostic("error", "E_UNKNOWN_ATTR", `Unknown ${kind} key '${attribute.key}'.`, line, attribute.col, { field: attribute.key }));
      continue;
    }
    if (seen.has(attribute.key)) {
      diagnostics.push(diagnostic("error", "E_DUP_ATTR", `Duplicate ${kind} key '${attribute.key}'.`, line, attribute.col, { field: attribute.key }));
      continue;
    }
    seen.add(attribute.key);
    if (kind === "options") {
      const value = boolValue(attribute.value, attribute.key, line, attribute.col, diagnostics);
      if (value !== undefined) target[attribute.key] = value;
      continue;
    }
    if (attribute.key.endsWith("ArrowMode")) {
      const mode = typeof attribute.value === "string" ? attribute.value.toLowerCase() : "";
      const values = { none: "NONE", positive: "POSITIVE", both: "BOTH" };
      if (!values[mode as keyof typeof values]) diagnostics.push(diagnostic("error", "E_BAD_ENUM", `Invalid value for '${attribute.key}'.`, line, attribute.col, { field: attribute.key }));
      else target[attribute.key] = values[mode as keyof typeof values];
    } else if (attribute.key.endsWith("Label")) {
      if (typeof attribute.value !== "string") diagnostics.push(diagnostic("error", "E_BAD_VALUE", `'${attribute.key}' requires a string.`, line, attribute.col, { field: attribute.key }));
      else target[attribute.key] = attribute.value;
    } else {
      const value = boolValue(attribute.value, attribute.key, line, attribute.col, diagnostics);
      if (value !== undefined) target[attribute.key] = value;
    }
  }
  return target;
}

export function compileDesmos2D(source: string): Desmos2DCompileResult {
  const diagnostics: DesmosDiagnostic[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const ids = new Map<string, { line: number; col: number }>();
  const presets = new Map<string, Preset>();
  const expressions: DesmosExpression[] = [];
  let options: CalculatorOptions | undefined;
  let settings: GraphSettings | undefined;
  let bounds: Desmos2DOutput["bounds"];
  let autoId = 0;
  let table: DesmosExpression | null = null;
  let pendingHeader: { id: string; attrs: Attribute[]; line: number; col: number } | null = null;

  const addExpression = (id: string, latex: string, attrs: Attribute[], line: number, col: number) => {
    if (!assignUniqueId(id, line, col, ids, diagnostics)) return;
    const state = compileExpressionAttributes(attrs, id, line, presets, diagnostics);
    expressions.push({ id, latex, ...state } as DesmosExpression);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const sourceLine = lines[index];
    const trimmed = sourceLine.trim();
    const lineNumber = index + 1;
    if (table) {
      const tableSourceLine = stripComment(sourceLine);
      const tableTrimmed = tableSourceLine.trim();
      if (!tableTrimmed) continue;
      if (tableTrimmed.startsWith("//")) continue;
      if (!/^\s+/.test(tableSourceLine)) {
        table = null;
        index -= 1;
        continue;
      }
      if (!tableTrimmed.startsWith("col ")) {
        diagnostics.push(diagnostic("error", "E_TABLE_SYNTAX", "Table columns must be indented 'col' lines.", lineNumber, 1, { id: table.id }));
        table = null;
        index -= 1;
        continue;
      }
      const attrs = parseDirectiveArgs(tableTrimmed.slice(4), lineNumber, sourceLine.indexOf("col") + 5, diagnostics);
      let columnLatex: string | undefined;
      const column: Record<string, unknown> = {};
      const seen = new Set<string>();
      for (const attribute of attrs) {
        const key = ATTR_ALIASES[attribute.key] ?? attribute.key;
        if (!TABLE_COLUMN_KEYS.has(attribute.key)) {
          diagnostics.push(diagnostic("error", "E_UNKNOWN_ATTR", `Unknown table column key '${attribute.key}'.`, lineNumber, attribute.col, { id: table.id, field: attribute.key }));
          continue;
        }
        if (seen.has(key)) diagnostics.push(diagnostic("error", "E_DUP_ATTR", `Duplicate table column key '${key}'.`, lineNumber, attribute.col, { id: table.id, field: key }));
        seen.add(key);
        if (key === "latex") {
          if (typeof attribute.value !== "string") diagnostics.push(diagnostic("error", "E_BAD_VALUE", "Table column latex needs a value.", lineNumber, attribute.col, { id: table.id }));
          else columnLatex = attribute.value;
        } else if (key === "values") {
          if (typeof attribute.value !== "string") diagnostics.push(diagnostic("error", "E_BAD_VALUE", "Table column values need a tuple.", lineNumber, attribute.col, { id: table.id }));
          else {
            const values = parseTupleList(attribute.value, lineNumber, attribute.col, key, diagnostics);
            if (values) column.values = values;
          }
        } else setAttribute(column, attribute, lineNumber, table.id, diagnostics, "column");
      }
      if (!columnLatex) diagnostics.push(diagnostic("error", "E_TABLE_SYNTAX", "Each table column requires latex=.", lineNumber, 1, { id: table.id, field: "latex" }));
      else (table.columns as DesmosTableColumn[]).push({ latex: columnLatex, ...column } as DesmosTableColumn);
      continue;
    }
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (isLegacyDesmosJsonLine(sourceLine)) {
      diagnostics.push(diagnostic(
        "error",
        "E_LEGACY_JSON",
        "This block uses Desmos API JSON/state syntax. Use the Desmos DSL instead, for example '@curve: y=x'.",
        lineNumber,
        sourceLine.search(/\S/) + 1,
      ));
      continue;
    }
    if (pendingHeader && trimmed) {
      if (trimmed.startsWith("%") || trimmed.startsWith("@")) {
        diagnostics.push(diagnostic("error", "E_HEADER_LATEX", `Expression '${pendingHeader.id}' is missing its LaTeX body.`, pendingHeader.line, pendingHeader.col, { id: pendingHeader.id }));
        pendingHeader = null;
      } else {
        addExpression(pendingHeader.id, trimmed, pendingHeader.attrs, pendingHeader.line, pendingHeader.col);
        pendingHeader = null;
        continue;
      }
    }
    const lineText = stripComment(sourceLine).trim();
    if (!lineText) continue;
    if (lineText.startsWith("@")) {
      const header = parseHeader(lineText, lineNumber, diagnostics);
      if (!header) continue;
      if (header.latex.trim()) addExpression(header.id, header.latex, header.attrs, lineNumber, sourceLine.indexOf("@") + 1);
      else pendingHeader = { id: header.id, attrs: header.attrs, line: lineNumber, col: sourceLine.indexOf("@") + 1 };
      continue;
    }
    if (lineText.startsWith("%")) {
      const directive = lineText.match(/^%([A-Za-z]+)\b\s*([\s\S]*)$/);
      if (!directive) {
        diagnostics.push(diagnostic("error", "E_DIRECTIVE_SYNTAX", "Malformed directive.", lineNumber, 1));
        continue;
      }
      const [, name, rest] = directive;
      if (name === "table") {
        const id = rest.trim();
        if (!ID_PATTERN.test(id) || id.startsWith(RESERVED_ID_PREFIX)) diagnostics.push(diagnostic("error", "E_BAD_ID", `Invalid or reserved table id '${id}'.`, lineNumber, 1, { id }));
        else if (assignUniqueId(id, lineNumber, 1, ids, diagnostics)) {
          table = { id, type: "table", columns: [] };
          expressions.push(table);
        }
      } else if (name === "folder") {
        diagnostics.push(diagnostic("error", "E_UNSUPPORTED_DIRECTIVE", "'%folder' is not supported by the documented setExpressions API.", lineNumber, 1));
      } else if (name === "note") {
        const match = rest.match(/^([A-Za-z0-9_]+)\s*:\s*([\s\S]*)$/);
        if (!match || match[1].startsWith(RESERVED_ID_PREFIX)) {
          diagnostics.push(diagnostic("error", "E_DIRECTIVE_SYNTAX", "Use '%note id: plain text'.", lineNumber, 1));
          continue;
        }
        if (assignUniqueId(match[1], lineNumber, 1, ids, diagnostics)) {
          expressions.push({ id: match[1], type: "text", text: match[2] });
        }
      } else if (name === "preset") {
        const match = rest.match(/^([A-Za-z][A-Za-z0-9_]*)\s+([\s\S]+)$/);
        if (!match) {
          diagnostics.push(diagnostic("error", "E_DIRECTIVE_SYNTAX", "Use '%preset name key=value ...'.", lineNumber, 1));
          continue;
        }
        const attrs = parseDirectiveArgs(match[2], lineNumber, 1, diagnostics);
        const values = new Map<string, Attribute>();
        const presetState: Record<string, unknown> = {};
        for (const attribute of attrs) {
          if (attribute.key === "use" || attribute.key === "folder") {
            diagnostics.push(diagnostic("error", "E_BAD_PRESET", "Presets cannot contain 'use' or 'folder'.", lineNumber, attribute.col, { field: attribute.key }));
          } else if (!ATTRIBUTE_KEYS.has(attribute.key)) {
            diagnostics.push(diagnostic("error", "E_UNKNOWN_ATTR", `Unknown preset attribute '${attribute.key}'.`, lineNumber, attribute.col, { field: attribute.key }));
          } else if (values.has(ATTR_ALIASES[attribute.key] ?? attribute.key)) {
            diagnostics.push(diagnostic("error", "E_DUP_ATTR", `Duplicate preset key '${attribute.key}'.`, lineNumber, attribute.col, { field: attribute.key }));
          } else {
            values.set(ATTR_ALIASES[attribute.key] ?? attribute.key, attribute);
            setAttribute(presetState, attribute, lineNumber, match[1], diagnostics);
          }
        }
        if (presets.has(match[1])) diagnostics.push(diagnostic("error", "E_DUP_PRESET", `Duplicate preset '${match[1]}'.`, lineNumber, 1));
        else presets.set(match[1], { values, line: lineNumber, col: 1 });
      } else if (name === "options" || name === "settings") {
        const attrs = parseDirectiveArgs(rest, lineNumber, 1, diagnostics);
        if (name === "options") options = { ...options, ...parseGraphAttributes(attrs, lineNumber, diagnostics, "options") };
        else settings = { ...settings, ...parseGraphAttributes(attrs, lineNumber, diagnostics, "settings") };
      } else if (name === "view") {
        if (bounds) diagnostics.push(diagnostic("error", "E_DUP_DIRECTIVE", "Only one '%view' directive is allowed.", lineNumber, 1));
        bounds = parseView(rest, lineNumber, diagnostics);
      } else if (name === "expect" || name === "verify" || name === "const") {
        diagnostics.push(diagnostic("error", "E_UNSUPPORTED_DIRECTIVE", `'%${name}' is not implemented in the initial 2D parser.`, lineNumber, 1));
      } else {
        diagnostics.push(diagnostic("error", "E_UNKNOWN_DIRECTIVE", `Unknown directive '%${name}'.`, lineNumber, 1));
      }
      continue;
    }
    autoId += 1;
    addExpression(`auto_${autoId}`, lineText, [], lineNumber, 1);
  }

  if (pendingHeader) {
    diagnostics.push(diagnostic("error", "E_HEADER_LATEX", `Expression '${pendingHeader.id}' is missing its LaTeX body.`, pendingHeader.line, pendingHeader.col, { id: pendingHeader.id }));
  }
  if (table && !table.columns?.length) diagnostics.push(diagnostic("error", "E_TABLE_EMPTY", `Table '${table.id}' needs at least one column.`, lines.length, 1, { id: table.id }));
  if (diagnostics.some((entry) => entry.severity === "error")) return { ok: false, diagnostics };
  return {
    ok: true,
    output: {
      ...(options && Object.keys(options).length ? { options } : {}),
      ...(settings && Object.keys(settings).length ? { settings } : {}),
      expressions,
      ...(bounds ? { bounds } : {}),
    },
    diagnostics,
  };
}
