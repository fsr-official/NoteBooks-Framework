export type Desmos3DDiagnostic = {
  phase: "compile";
  severity: "error" | "warning";
  code: string;
  message: string;
  line: number;
  col: number;
  id?: string;
  field?: string;
};

type Attribute = { key: string; value: string | true; line: number; col: number };
type Preset = Map<string, Attribute>;
type Tuple3 = [string, string, string];

type ExpressionState = {
  id: string;
  type?: "expression" | "text" | "table";
  latex?: string;
  text?: string;
  columns?: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

export type Desmos3DOutput = {
  target: "3d";
  options?: Record<string, boolean>;
  settings?: Record<string, boolean | string>;
  expressions: ExpressionState[];
  bounds?: Partial<Record<"xmin" | "xmax" | "ymin" | "ymax" | "zmin" | "zmax", number>>;
  camera?: { azimuth: number; elevation: number; zoom?: number };
  vectorIds: string[];
  vectorLatex: Record<string, string>;
  zDragIds: string[];
};

export type Desmos3DCompileResult =
  | { ok: true; output: Desmos3DOutput; diagnostics: Desmos3DDiagnostic[] }
  | { ok: false; diagnostics: Desmos3DDiagnostic[] };

const ID = /^[A-Za-z0-9_]+$/;
const RESERVED_PREFIX = "auto_";
const COLORS: Record<string, string> = {
  red: "#c74440",
  blue: "#2d70b3",
  green: "#348543",
  purple: "#6042a6",
  orange: "#fa7e19",
  black: "#000000",
};
const LINE_STYLES = new Set(["solid", "dashed", "dotted"]);
const POINT_STYLES: Record<string, string> = {
  point: "POINT", open: "OPEN", cross: "CROSS", square: "SQUARE",
  plus: "PLUS", triangle: "TRIANGLE", diamond: "DIAMOND", star: "STAR",
};
const DRAG_MODES: Record<string, string> = {
  auto: "AUTO", none: "NONE", x: "X", y: "Y", z: "Z",
  xy: "XY", xz: "XZ", yz: "YZ", xyz: "XYZ",
};
const OPTIONS = new Set([
  "lockViewport", "expressionsCollapsed", "keypad", "graphpaper", "expressions",
  "settingsMenu", "zoomButtons", "border", "expressionsTopbar", "images", "folders",
  "administerSecretFolders", "authorFeatures",
]);
const SETTINGS = new Set([
  "showGrid", "showXAxis", "showYAxis", "showZAxis", "showPlane", "xAxisLabel",
  "yAxisLabel", "zAxisLabel", "degreeMode", "axisArrowMode",
]);
const ALIASES: Record<string, string> = { colour: "color", drag: "dragMode", inv: "hidden" };
const ATTRIBUTES = new Set([
  "hidden", "color", "slider", "domain", "dragMode", "showLabel", "label", "labelSize", "points", "lines",
  "lineStyle", "lineWidth", "lineOpacity", "pointStyle", "pointSize", "pointOpacity",
  "fill", "fillOpacity", "secret", "folder", "use", "inv", "colour", "parametricDomain",
  "uDomain", "vDomain", "xDomain", "yDomain", "zDomain", "surface", "mesh", "arrowSize", "drag",
  "polarDomain", "labelOrientation",
]);
const TABLE_ATTRIBUTES = new Set([
  "latex", "values", "color", "colour", "hidden", "points", "lines", "lineStyle",
  "lineWidth", "lineOpacity", "pointStyle", "pointSize", "pointOpacity", "drag", "dragMode",
]);

function issue(
  severity: "error" | "warning",
  code: string,
  message: string,
  line: number,
  col: number,
  extra: Pick<Desmos3DDiagnostic, "id" | "field"> = {},
): Desmos3DDiagnostic {
  return { phase: "compile", severity, code, message, line, col, ...extra };
}

function splitTopLevel(value: string, separator: string): string[] | null {
  const result: string[] = [];
  const closers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (closers[char]) { stack.push(closers[char]); continue; }
    if (char === ")" || char === "]" || char === "}") {
      if (stack.pop() !== char) return null;
      continue;
    }
    if (char === separator && !stack.length) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quoted || stack.length) return null;
  result.push(value.slice(start).trim());
  return result;
}

function splitWhitespaceTopLevel(source: string): string[] | null {
  const values: string[] = [];
  const closers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  let start = -1;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; if (start < 0) start = index; continue; }
    if (quoted) { if (start < 0) start = index; continue; }
    if (closers[char]) { stack.push(closers[char]); if (start < 0) start = index; continue; }
    if (char === ")" || char === "]" || char === "}") {
      if (stack.pop() !== char) return null;
      continue;
    }
    if (/\s/.test(char) && !stack.length) {
      if (start >= 0) values.push(source.slice(start, index));
      start = -1;
    } else if (start < 0) start = index;
  }
  if (quoted || stack.length) return null;
  if (start >= 0) values.push(source.slice(start));
  return values;
}

function decodeValue(raw: string): string | null {
  if (!raw.startsWith('"')) return raw;
  if (raw.length < 2 || !raw.endsWith('"')) return null;
  return raw.slice(1, -1).replace(/\\(["\\])/g, "$1");
}

function parseAttributes(
  source: string,
  line: number,
  col: number,
  diagnostics: Desmos3DDiagnostic[],
  allowed: Set<string> = ATTRIBUTES,
): Attribute[] {
  if (!source.trim()) return [];
  const chunks = splitTopLevel(source, ",");
  if (!chunks) {
    diagnostics.push(issue("error", "E_ATTR_SYNTAX", "Unbalanced quotes or brackets in attributes.", line, col));
    return [];
  }
  const attributes: Attribute[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    const chunkIndex = source.indexOf(chunk, offset);
    const chunkCol = col + Math.max(0, chunkIndex);
    offset = Math.max(offset, chunkIndex + chunk.length);
    const equals = splitTopLevel(chunk, "=");
    if (!equals || equals.length > 2 || !chunk.trim()) {
      diagnostics.push(issue("error", "E_ATTR_SYNTAX", "Malformed attribute.", line, chunkCol));
      continue;
    }
    const key = equals[0].trim();
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key)) {
      diagnostics.push(issue("error", "E_ATTR_SYNTAX", `Invalid attribute name '${key}'.`, line, chunkCol));
      continue;
    }
    if (!allowed.has(key)) {
      diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown attribute '${key}'.`, line, chunkCol, { field: key }));
      continue;
    }
    const raw = equals.length === 2 ? chunk.slice(chunk.indexOf("=") + 1).trim() : "";
    if (equals.length === 2 && !raw) {
      diagnostics.push(issue("error", "E_ATTR_SYNTAX", `Attribute '${key}' needs a value.`, line, chunkCol, { field: key }));
      continue;
    }
    const value = equals.length === 1 ? true : decodeValue(raw);
    if (value === null) {
      diagnostics.push(issue("error", "E_ATTR_SYNTAX", `Malformed quoted value for '${key}'.`, line, chunkCol, { field: key }));
      continue;
    }
    attributes.push({ key, value, line, col: chunkCol });
  }
  return attributes;
}

function parseArgs(source: string, line: number, col: number, diagnostics: Desmos3DDiagnostic[]): Attribute[] {
  const chunks = splitWhitespaceTopLevel(source);
  if (!chunks) {
    diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", "Unbalanced quotes or brackets in directive.", line, col));
    return [];
  }
  const attributes: Attribute[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    const chunkIndex = source.indexOf(chunk, offset);
    const chunkCol = col + Math.max(0, chunkIndex);
    offset = Math.max(offset, chunkIndex + chunk.length);
    const equals = chunk.indexOf("=");
    if (equals < 0) {
      attributes.push({ key: chunk, value: true, line, col: chunkCol });
      continue;
    }
    const key = chunk.slice(0, equals);
    const raw = chunk.slice(equals + 1);
    const value = decodeValue(raw);
    if (!key || !raw || value === null) {
      diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", `Malformed directive argument '${chunk}'.`, line, chunkCol));
      continue;
    }
    attributes.push({ key, value, line, col: chunkCol });
  }
  return attributes;
}

function removeComment(source: string): string {
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < source.length - 1; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (quoted && char === "\\") { escaped = true; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === "/" && source[index + 1] === "/" && /\s/.test(source[index - 1] ?? "")) {
      return source.slice(0, index).trimEnd();
    }
  }
  return source;
}

function tuple(
  value: string | true,
  arity: number,
  line: number,
  col: number,
  field: string,
  diagnostics: Desmos3DDiagnostic[],
  code = "E_BAD_VALUE",
): string[] | null {
  const match = typeof value === "string" ? value.match(/^\(([\s\S]*)\)$/) : null;
  const values = match ? splitTopLevel(match[1], ",") : null;
  if (!values || values.length !== arity || values.some((entry) => !entry)) {
    diagnostics.push(issue("error", code, `'${field}' must contain exactly ${arity} non-empty values.`, line, col, { field }));
    return null;
  }
  return values;
}

function booleanValue(attribute: Attribute, diagnostics: Desmos3DDiagnostic[]): boolean | undefined {
  if (attribute.value === true || attribute.value === "true") return true;
  if (attribute.value === "false") return false;
  diagnostics.push(issue("error", "E_BAD_VALUE", `'${attribute.key}' must be true or false.`, attribute.line, attribute.col, { field: attribute.key }));
  return undefined;
}

function numericValue(
  attribute: Attribute,
  diagnostics: Desmos3DDiagnostic[],
  minimum: number,
  integer = false,
): number | undefined {
  const number = typeof attribute.value === "string" ? Number(attribute.value) : Number.NaN;
  if (!Number.isFinite(number) || number < minimum || (integer && !Number.isInteger(number))) {
    diagnostics.push(issue("error", "E_BAD_RANGE", `'${attribute.key}' must be ${integer ? "an integer " : ""}at least ${minimum}.`, attribute.line, attribute.col, { field: attribute.key }));
    return undefined;
  }
  return number;
}

function colorValue(attribute: Attribute, diagnostics: Desmos3DDiagnostic[]): string | "inv" | undefined {
  if (typeof attribute.value !== "string") {
    diagnostics.push(issue("error", "E_BAD_ENUM", "'color' needs a color name or #rrggbb value.", attribute.line, attribute.col, { field: "color" }));
    return undefined;
  }
  const value = attribute.value.toLowerCase();
  if (value === "inv") return "inv";
  const color = COLORS[value] ?? attribute.value;
  if (!/^#[\da-f]{6}$/i.test(color)) {
    diagnostics.push(issue("error", "E_BAD_ENUM", `Unknown or malformed color '${attribute.value}'.`, attribute.line, attribute.col, { field: "color" }));
    return undefined;
  }
  return color.toLowerCase();
}

function applyAttributes(
  target: Record<string, unknown>,
  attributes: Attribute[],
  id: string,
  diagnostics: Desmos3DDiagnostic[],
  vector: boolean,
): { domains: Record<string, { min: string; max: string }>; zDrag: boolean } {
  const domains: Record<string, { min: string; max: string }> = {};
  const parameterDomains: Record<string, { min: string; max: string }> = {};
  let zDrag = false;
  const seen = new Set<string>();
  const colors = attributes.filter(({ key }) => key === "color" || key === "colour");
  if (colors.length > 1) diagnostics.push(issue("error", "E_DUP_COLOR", "Specify color or colour only once.", colors[1].line, colors[1].col, { id, field: "color" }));

  for (const attribute of attributes) {
    const key = ALIASES[attribute.key] ?? attribute.key;
    const { value, line, col } = attribute;
    if (seen.has(key)) diagnostics.push(issue("error", "E_DUP_ATTR", `Attribute '${key}' is specified more than once.`, line, col, { id, field: key }));
    seen.add(key);
    if (key === "use" || key === "folder") {
      if (key === "folder") diagnostics.push(issue("error", "E_UNSUPPORTED_DIRECTIVE", "'folder=' is not accepted until 3D folder serialization is verified.", line, col, { id, field: "folder" }));
      continue;
    }
    if (key === "polarDomain" || key === "labelOrientation") {
      diagnostics.push(issue("error", "E_2D_ONLY", `'${key}' is a 2D-only attribute.`, line, col, { id, field: key }));
      continue;
    }
    if (key === "color") {
      const color = colorValue(attribute, diagnostics);
      if (color === "inv") {
        target.hidden = true;
        delete target.color;
      } else if (color) target.color = color;
      continue;
    }
    if (["hidden", "secret", "showLabel", "fill", "points", "lines"].includes(key)) {
      if (key === "fill" && typeof value === "string" && value !== "true" && value !== "false") {
        const opacity = numericValue({ ...attribute, key: "fillOpacity" }, diagnostics, 0);
        if (opacity !== undefined && opacity <= 1) target.fillOpacity = opacity;
        else if (opacity !== undefined) diagnostics.push(issue("error", "E_BAD_RANGE", "'fill' must be between 0 and 1.", line, col, { id, field: key }));
        continue;
      }
      const result = booleanValue(attribute, diagnostics);
      if (result !== undefined) target[key === "fill" ? "fill" : key] = result;
      continue;
    }
    if (key === "slider") {
      const match = typeof value === "string" ? value.match(/^\(([\s\S]*)\)$/) : null;
      const values = match ? splitTopLevel(match[1], ",") : null;
      if (!values || (values.length !== 2 && values.length !== 3) || values.some((entry) => !entry)) {
        diagnostics.push(issue("error", "E_BAD_VALUE", "'slider' must contain two or three non-empty values.", line, col, { id, field: key }));
        continue;
      }
      if (values) target.sliderBounds = { min: values[0], max: values[1], ...(values[2] ? { step: values[2] } : {}) };
      continue;
    }
    if (key === "domain" || key === "parametricDomain") {
      const values = tuple(value, 2, line, col, key, diagnostics);
      if (values) target[key] = { min: values[0], max: values[1] };
      continue;
    }
    if (["xDomain", "yDomain", "zDomain"].includes(key)) {
      const values = tuple(value, 2, line, col, key, diagnostics);
      if (values) domains[key[0]] = { min: values[0], max: values[1] };
      continue;
    }
    if (key === "uDomain" || key === "vDomain") {
      const values = tuple(value, 2, line, col, key, diagnostics);
      if (values) parameterDomains[key[0]] = { min: values[0], max: values[1] };
      continue;
    }
    if (key === "dragMode") {
      const mode = typeof value === "string" ? DRAG_MODES[value.toLowerCase()] : undefined;
      if (!mode) diagnostics.push(issue("error", "E_BAD_ENUM", `Invalid value for '${key}'.`, line, col, { id, field: key }));
      else {
        target.dragMode = mode;
        zDrag = /z/i.test(mode);
      }
      continue;
    }
    if (key === "lineStyle") {
      const style = typeof value === "string" ? value.toLowerCase() : "";
      if (!LINE_STYLES.has(style)) diagnostics.push(issue("error", "E_BAD_ENUM", `Invalid value for '${key}'.`, line, col, { id, field: key }));
      else target.lineStyle = style.toUpperCase();
      continue;
    }
    if (key === "pointStyle") {
      const style = typeof value === "string" ? POINT_STYLES[value.toLowerCase()] : undefined;
      if (!style) diagnostics.push(issue("error", "E_BAD_ENUM", `Invalid value for '${key}'.`, line, col, { id, field: key }));
      else target.pointStyle = style;
      continue;
    }
    if (key === "surface") {
      if (typeof value !== "string" || !["solid", "mesh", "wire"].includes(value.toLowerCase())) {
        diagnostics.push(issue("error", "E_BAD_ENUM", "'surface' must be solid, mesh, or wire.", line, col, { id, field: key }));
      } else target.surfaceStyle = value.toLowerCase();
      continue;
    }
    if (key === "lineWidth" || key === "pointSize" || key === "arrowSize") {
      const result = numericValue(attribute, diagnostics, 0);
      if (result !== undefined && result > 0) target[key] = result;
      else if (result === 0) diagnostics.push(issue("error", "E_BAD_RANGE", `'${key}' must be greater than zero.`, line, col, { id, field: key }));
      if (key === "arrowSize" && !vector) diagnostics.push(issue("warning", "W_ARROW_TARGET", "'arrowSize' is intended for vector expressions.", line, col, { id, field: key }));
      continue;
    }
    if (key === "mesh") {
      const result = numericValue(attribute, diagnostics, 1, true);
      if (result !== undefined) target.meshDensity = result;
      continue;
    }
    if (key === "lineOpacity" || key === "pointOpacity" || key === "fillOpacity") {
      const result = numericValue(attribute, diagnostics, 0);
      if (result !== undefined && result > 1) {
        diagnostics.push(issue("error", "E_BAD_RANGE", `'${key}' must be between 0 and 1.`, line, col, { id, field: key }));
      } else if (result !== undefined) target[key] = result;
      continue;
    }
    if (key === "label" || key === "labelSize") {
      if (typeof value !== "string") diagnostics.push(issue("error", "E_BAD_VALUE", `'${key}' requires a value.`, line, col, { id, field: key }));
      else target[key] = value;
      continue;
    }
    diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unsupported attribute '${key}'.`, line, col, { id, field: key }));
  }
  if (domains.x || domains.y || domains.z) target.domain = domains;
  const hasU = Boolean(parameterDomains.u);
  const hasV = Boolean(parameterDomains.v);
  if (hasU !== hasV) diagnostics.push(issue("error", "E_DOMAIN_PAIR", "uDomain and vDomain must be provided together.", attributes[0]?.line ?? 1, attributes[0]?.col ?? 1, { id }));
  if (hasU && hasV) target.parametricDomain = { u: parameterDomains.u, v: parameterDomains.v };
  if (target.showLabel === true && !target.label) target.label = id;
  if (target.hidden === true && target.showLabel === true) {
    diagnostics.push(issue("warning", "W_HIDDEN_LABEL", "A hidden expression cannot show its label.", attributes[0]?.line ?? 1, 1, { id }));
  }
  return { domains, zDrag };
}

function validId(id: string, line: number, col: number, diagnostics: Desmos3DDiagnostic[]): boolean {
  if (ID.test(id) && !id.startsWith(RESERVED_PREFIX)) return true;
  diagnostics.push(issue("error", "E_BAD_ID", `Invalid or reserved id '${id}'.`, line, col, { id }));
  return false;
}

function reserveId(id: string, line: number, col: number, ids: Map<string, number>, diagnostics: Desmos3DDiagnostic[]): boolean {
  if (!validId(id, line, col, diagnostics)) return false;
  const firstLine = ids.get(id);
  if (firstLine !== undefined) {
    diagnostics.push(issue("error", "E_DUP_ID", `Duplicate id '${id}' (first declared on line ${firstLine}).`, line, col, { id }));
    return false;
  }
  ids.set(id, line);
  return true;
}

function parseHeader(lineText: string, line: number, diagnostics: Desmos3DDiagnostic[]) {
  const match = lineText.match(/^@([^\s:[\]]+)\s*(?:\[([\s\S]*?)\])?\s*:\s*([\s\S]*)$/);
  if (!match) {
    diagnostics.push(issue("error", "E_HEADER_SYNTAX", "Expected '@id [attributes]: LaTeX'.", line, 1));
    return null;
  }
  const [, id, rawAttrs = "", latex] = match;
  return { id, attrs: parseAttributes(rawAttrs, line, lineText.indexOf("[") + 2, diagnostics), latex };
}

function mergePresetAttributes(
  attributes: Attribute[],
  presets: Map<string, Preset>,
  line: number,
  id: string,
  diagnostics: Desmos3DDiagnostic[],
): Attribute[] {
  const use = attributes.filter((attribute) => attribute.key === "use");
  if (use.length > 1) diagnostics.push(issue("error", "E_DUP_ATTR", "Only one preset may be used on an expression.", line, use[1].col, { id, field: "use" }));
  const inherited: Attribute[] = [];
  for (const reference of use.slice(0, 1)) {
    const preset = typeof reference.value === "string" ? presets.get(reference.value) : undefined;
    if (!preset) diagnostics.push(issue("error", "E_NO_PRESET", `Unknown preset '${String(reference.value)}'.`, line, reference.col, { id, field: "use" }));
    else inherited.push(...preset.values());
  }
  const inlineKeys = new Set(attributes.filter((attribute) => attribute.key !== "use").map(({ key }) => ALIASES[key] ?? key));
  return [
    ...inherited.filter(({ key }) => !inlineKeys.has(ALIASES[key] ?? key)),
    ...attributes.filter((attribute) => attribute.key !== "use"),
  ];
}

function parsePairs(source: string, allowed: Set<string>, line: number, diagnostics: Desmos3DDiagnostic[]): Map<string, [number, number]> {
  const result = new Map<string, [number, number]>();
  const re = /([A-Za-z]+)\s*=\s*(\([^)]*\))/g;
  let match: RegExpExecArray | null;
  let residue = source;
  while ((match = re.exec(source))) {
    const [, axis, raw] = match;
    if (!allowed.has(axis)) {
      diagnostics.push(issue("error", "E_VIEW_SYNTAX", `Unknown view axis '${axis}'.`, line, 1, { field: "bounds" }));
      residue = residue.replace(match[0], "");
      continue;
    }
    const parts = splitTopLevel(raw.slice(1, -1), ",");
    const pair = parts?.map(Number);
    if (!parts || parts.length !== 2 || parts.some((part) => !part) || !pair || pair.some((value) => !Number.isFinite(value))) {
      diagnostics.push(issue("error", "E_VIEW_RANGE", `Invalid ${axis}-axis bounds.`, line, 1, { field: "bounds" }));
    } else if (pair[0] >= pair[1]) {
      diagnostics.push(issue("error", "E_VIEW_RANGE", `${axis}-axis bounds must have min < max.`, line, 1, { field: "bounds" }));
    } else if (result.has(axis)) {
      diagnostics.push(issue("error", "E_VIEW_SYNTAX", `Duplicate ${axis}-axis bounds.`, line, 1, { field: "bounds" }));
    } else result.set(axis, [pair[0], pair[1]]);
    residue = residue.replace(match[0], "");
  }
  if (residue.trim()) diagnostics.push(issue("error", "E_VIEW_SYNTAX", `Malformed or unsupported bounds '${residue.trim()}'.`, line, 1, { field: "bounds" }));
  if (!result.size) diagnostics.push(issue("error", "E_VIEW_SYNTAX", "'%view' must include at least one axis pair.", line, 1, { field: "bounds" }));
  return result;
}

function graphAttrs(
  attributes: Attribute[],
  kind: "options" | "settings",
  diagnostics: Desmos3DDiagnostic[],
): Record<string, boolean | string> {
  const output: Record<string, boolean | string> = {};
  const seen = new Set<string>();
  const allowed = kind === "options" ? OPTIONS : SETTINGS;
  for (const attribute of attributes) {
    const { key, value, line, col } = attribute;
    if (!allowed.has(key)) {
      diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown ${kind} key '${key}'.`, line, col, { field: key }));
      continue;
    }
    if (seen.has(key)) {
      diagnostics.push(issue("error", "E_DUP_ATTR", `Duplicate ${kind} key '${key}'.`, line, col, { field: key }));
      continue;
    }
    seen.add(key);
    if (kind === "options" || ["showGrid", "showXAxis", "showYAxis", "showZAxis", "showPlane", "degreeMode"].includes(key)) {
      const result = booleanValue(attribute, diagnostics);
      if (result !== undefined) output[key] = result;
    } else if (key === "axisArrowMode") {
      const mode = typeof value === "string" ? value.toLowerCase() : "";
      const mapped = { none: "NONE", positive: "POSITIVE", both: "BOTH" }[mode as "none" | "positive" | "both"];
      if (!mapped) diagnostics.push(issue("error", "E_BAD_ENUM", "axisArrowMode must be none, positive, or both.", line, col, { field: key }));
      else output[key] = mapped;
    } else if (typeof value === "string") output[key] = value;
    else diagnostics.push(issue("error", "E_BAD_VALUE", `'${key}' requires a string value.`, line, col, { field: key }));
  }
  return output;
}

function parseVectorTuple(
  value: string | true,
  line: number,
  col: number,
  field: string,
  diagnostics: Desmos3DDiagnostic[],
): Tuple3 | null {
  return tuple(value, 3, line, col, field, diagnostics, "E_VECTOR_ARITY") as Tuple3 | null;
}

function addState(
  id: string,
  latex: string,
  attributes: Attribute[],
  line: number,
  ids: Map<string, number>,
  presets: Map<string, Preset>,
  expressions: ExpressionState[],
  diagnostics: Desmos3DDiagnostic[],
  vectorIds: string[],
  vectorLatex: Record<string, string>,
  zDragIds: string[],
  isVector = false,
  reserved = false,
): void {
  if (!reserved && !reserveId(id, line, 1, ids, diagnostics)) return;
  if (reserved && ids.has(id)) return;
  const merged = mergePresetAttributes(attributes, presets, line, id, diagnostics);
  const state: Record<string, unknown> = { id, latex };
  const { zDrag } = applyAttributes(state, merged, id, diagnostics, isVector);
  expressions.push(state as ExpressionState);
  if (isVector) {
    vectorIds.push(id);
    vectorLatex[id] = latex;
  }
  if (zDrag) zDragIds.push(id);
}

function vectorLatex(from: Tuple3, to: Tuple3): string {
  return `\\operatorname{vector}\\left(\\left(${from.join(",")}\\right),\\left(${to.join(",")}\\right)\\right)`;
}

export function compileDesmos3D(source: string): Desmos3DCompileResult {
  const diagnostics: Desmos3DDiagnostic[] = [];
  const ids = new Map<string, number>();
  const presets = new Map<string, Preset>();
  const expressions: ExpressionState[] = [];
  const vectorIds: string[] = [];
  const vectorLatexes: Record<string, string> = {};
  const zDragIds: string[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const options: Record<string, boolean> = {};
  const settings: Record<string, boolean | string> = {};
  const bounds: NonNullable<Desmos3DOutput["bounds"]> = {};
  let camera: Desmos3DOutput["camera"];
  let autoId = 0;
  let table: ExpressionState | null = null;
  let vectorGroup: { prefix: string; at?: Tuple3; attrs: Attribute[]; line: number; count: number } | null = null;
  let pending: { id: string; attrs: Attribute[]; line: number } | null = null;

  const addExpression = (id: string, latex: string, attrs: Attribute[], line: number) => {
    addState(id, latex, attrs, line, ids, presets, expressions, diagnostics, vectorIds, vectorLatexes, zDragIds);
  };
  const renderVector = (id: string, from: Tuple3, to: Tuple3, attrs: Attribute[], line: number) => {
    addState(id, vectorLatex(from, to), attrs, line, ids, presets, expressions, diagnostics, vectorIds, vectorLatexes, zDragIds, true);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const uncommented = removeComment(rawLine);
    const trimmed = uncommented.trim();
    const line = index + 1;

    if (vectorGroup) {
      if (!trimmed) continue;
      if (!/^\s/.test(rawLine)) vectorGroup = null;
      else {
        const row = parseArgs(trimmed, line, rawLine.indexOf(trimmed) + 1, diagnostics);
        const direction = row.find((attribute) => attribute.key === "dir");
        if (!direction) {
          diagnostics.push(issue("error", "E_VECTOR_FORM", "Each %vectors row needs dir=(x,y,z).", line, 1, { field: "dir" }));
          continue;
        }
        const dir = parseVectorTuple(direction.value, line, direction.col, "dir", diagnostics);
        if (!dir) continue;
        const suffixAttribute = row.find((attribute) => attribute.key === "id");
        const suffix = suffixAttribute && typeof suffixAttribute.value === "string"
          ? suffixAttribute.value
          : String(++vectorGroup.count);
        if (!ID.test(suffix) || suffix.startsWith(RESERVED_PREFIX)) {
          diagnostics.push(issue("error", "E_BAD_ID", `Invalid vector suffix '${suffix}'.`, line, suffixAttribute?.col ?? 1));
          continue;
        }
        const rowAttributes = row.filter((attribute) => !["dir", "id"].includes(attribute.key));
        const rowKeys = new Set(rowAttributes.map((attribute) => ALIASES[attribute.key] ?? attribute.key));
        const merged = [
          ...vectorGroup.attrs.filter((attribute) => !rowKeys.has(ALIASES[attribute.key] ?? attribute.key)),
          ...rowAttributes,
        ];
        const at = vectorGroup.at ?? ["0", "0", "0"];
        const to = at.map((value, component) => `${value}+\\left(${dir[component]}\\right)`) as Tuple3;
        renderVector(`${vectorGroup.prefix}_${suffix}`, at, to, merged, line);
        continue;
      }
    }

    if (table) {
      if (!trimmed) continue;
      if (trimmed.startsWith("//")) continue;
      if (!/^\s/.test(rawLine) || !trimmed.startsWith("col ")) {
        diagnostics.push(issue("error", "E_TABLE_SYNTAX", "Table columns must be indented 'col' lines.", line, 1, { id: table.id }));
        table = null;
        index -= 1;
        continue;
      }
      const attrs = parseArgs(trimmed.slice(4), line, rawLine.indexOf("col") + 5, diagnostics);
      const column: Record<string, unknown> = {};
      let latex: string | undefined;
      let values: string[] | undefined;
      const display = attrs.filter((attribute) => attribute.key !== "latex" && attribute.key !== "values");
      for (const attribute of attrs) {
        if (attribute.key === "latex") {
          if (typeof attribute.value === "string") latex = attribute.value;
          else diagnostics.push(issue("error", "E_BAD_VALUE", "Table column latex needs a value.", line, attribute.col, { id: table.id }));
        } else if (attribute.key === "values") {
          if (typeof attribute.value === "string") {
            const match = attribute.value.match(/^\(([\s\S]*)\)$/);
            const parsed = match ? splitTopLevel(match[1], ",") : null;
            if (!parsed || parsed.some((value) => !value)) diagnostics.push(issue("error", "E_BAD_VALUE", "'values' must be a non-empty tuple.", line, attribute.col, { id: table.id }));
            else values = parsed;
          } else diagnostics.push(issue("error", "E_BAD_VALUE", "'values' requires a tuple.", line, attribute.col, { id: table.id }));
        } else if (!TABLE_ATTRIBUTES.has(attribute.key)) {
          diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown table column key '${attribute.key}'.`, line, attribute.col, { id: table.id, field: attribute.key }));
        }
      }
      if (display.length) applyAttributes(column, display, table.id, diagnostics, false);
      if (!latex) diagnostics.push(issue("error", "E_TABLE_SYNTAX", "Each table column requires latex=.", line, 1, { id: table.id }));
      else (table.columns as Array<Record<string, unknown>>).push({ latex, ...(values ? { values } : {}), ...column });
      continue;
    }

    if (!trimmed || trimmed.startsWith("//")) continue;
    if (pending) {
      if (trimmed.startsWith("%") || trimmed.startsWith("@")) {
        diagnostics.push(issue("error", "E_HEADER_LATEX", `Expression '${pending.id}' is missing its LaTeX body.`, pending.line, 1, { id: pending.id }));
        pending = null;
      } else {
        addExpression(pending.id, trimmed, pending.attrs, pending.line);
        pending = null;
        continue;
      }
    }

    const clean = trimmed;
    if (clean.startsWith("@")) {
      const header = parseHeader(clean, line, diagnostics);
      if (!header) continue;
      if (header.latex.trim()) addExpression(header.id, header.latex, header.attrs, line);
      else pending = { id: header.id, attrs: header.attrs, line };
      continue;
    }
    if (!clean.startsWith("%")) {
      autoId += 1;
      addExpression(`auto_${autoId}`, clean, [], line);
      continue;
    }

    const directive = clean.match(/^%([A-Za-z][A-Za-z0-9]*)\b\s*([\s\S]*)$/);
    if (!directive) {
      diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", "Malformed directive.", line, 1));
      continue;
    }
    const [, name, rest] = directive;

    if (name === "vector") {
      const idMatch = rest.match(/^([^\s\[]+)/);
      if (!idMatch) { diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", "Use '%vector id ...'.", line, 1)); continue; }
      const id = idMatch[1];
      const afterId = rest.slice(idMatch[0].length).trimStart();
      const attrsMatch = afterId.match(/^\[([\s\S]*?)\]\s*/);
      const attrs = parseAttributes(attrsMatch?.[1] ?? "", line, 1, diagnostics);
      const argsText = attrsMatch ? afterId.slice(attrsMatch[0].length) : afterId;
      const args = parseArgs(argsText, line, 1, diagnostics);
      const argMap = new Map(args.map((attribute) => [attribute.key, attribute]));
      const hasFromTo = argMap.has("from") || argMap.has("to");
      const hasAtDir = argMap.has("at") || argMap.has("dir");
      if ((hasFromTo && hasAtDir) || (!hasFromTo && !argMap.has("dir"))) {
        diagnostics.push(issue("error", "E_VECTOR_FORM", "%vector requires exactly one form: from+to, at+dir, or dir.", line, 1, { id }));
        continue;
      }
      let from: Tuple3 | null = null;
      let to: Tuple3 | null = null;
      if (hasFromTo) {
        if (!argMap.has("from") || !argMap.has("to")) {
          diagnostics.push(issue("error", "E_VECTOR_FORM", "%vector from/to form requires both endpoints.", line, 1, { id }));
          continue;
        }
        from = parseVectorTuple(argMap.get("from")!.value, line, argMap.get("from")!.col, "from", diagnostics);
        to = parseVectorTuple(argMap.get("to")!.value, line, argMap.get("to")!.col, "to", diagnostics);
      } else if (argMap.has("at")) {
        if (!argMap.has("dir")) {
          diagnostics.push(issue("error", "E_VECTOR_FORM", "%vector at= requires dir=.", line, 1, { id }));
          continue;
        }
        from = parseVectorTuple(argMap.get("at")!.value, line, argMap.get("at")!.col, "at", diagnostics);
        const dir = parseVectorTuple(argMap.get("dir")!.value, line, argMap.get("dir")!.col, "dir", diagnostics);
        if (from && dir) to = from.map((value, component) => `${value}+\\left(${dir[component]}\\right)`) as Tuple3;
      } else {
        from = ["0", "0", "0"];
        to = parseVectorTuple(argMap.get("dir")!.value, line, argMap.get("dir")!.col, "dir", diagnostics);
      }
      const unknownArgs = args.filter((attribute) => !["from", "to", "at", "dir"].includes(attribute.key));
      unknownArgs.forEach((attribute) => diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown %vector argument '${attribute.key}'.`, line, attribute.col, { id })));
      if (from && to) renderVector(id, from, to, attrs, line);
      continue;
    }

    if (name === "vectors") {
      const prefixMatch = rest.match(/^([^\s\[]+)/);
      if (!prefixMatch) { diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", "Use '%vectors prefix ...'.", line, 1)); continue; }
      const prefix = prefixMatch[1];
      if (!ID.test(prefix) || prefix.startsWith(RESERVED_PREFIX)) {
        validId(prefix, line, 1, diagnostics);
        continue;
      }
      const afterPrefix = rest.slice(prefixMatch[0].length).trimStart();
      const attrMatch = afterPrefix.match(/\[([\s\S]*?)\]/);
      const attrs = parseAttributes(attrMatch?.[1] ?? "", line, 1, diagnostics);
      const attrStart = attrMatch ? (attrMatch.index ?? afterPrefix.indexOf(attrMatch[0])) : -1;
      const argsText = attrMatch ? `${afterPrefix.slice(0, attrStart)} ${afterPrefix.slice(attrStart + attrMatch[0].length)}`.trim() : afterPrefix;
      const args = parseArgs(argsText, line, 1, diagnostics);
      const atAttribute = args.find((attribute) => attribute.key === "at");
      const invalid = args.filter((attribute) => attribute.key !== "at");
      invalid.forEach((attribute) => diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown %vectors argument '${attribute.key}'.`, line, attribute.col)));
      const at = atAttribute ? parseVectorTuple(atAttribute.value, line, atAttribute.col, "at", diagnostics) : ["0", "0", "0"] as Tuple3;
      vectorGroup = at ? { prefix, at, attrs, line, count: 0 } : null;
      continue;
    }

    if (name === "point3") {
      const match = rest.match(/^([^\s\[]+)\s+at=(\([^)]*\))\s*(?:\[([\s\S]*?)\])?\s*$/);
      if (!match) { diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", "Use '%point3 id at=(x,y,z) [attributes]'.", line, 1)); continue; }
      const [, id, rawPoint, rawAttrs = ""] = match;
      const point = parseVectorTuple(rawPoint, line, rest.indexOf(rawPoint) + 1, "at", diagnostics);
      const attrs = parseAttributes(rawAttrs, line, rest.indexOf("[") + 2, diagnostics);
      if (point) addExpression(id, `${id}=\\left(${point.join(",")}\\right)`, attrs, line);
      continue;
    }

    if (name === "axes") {
      let attrSource = rest.trim();
      if (attrSource.startsWith("[")) attrSource = attrSource.slice(1, attrSource.lastIndexOf("]"));
      const attrs = parseAttributes(attrSource, line, 1, diagnostics, new Set(["length", "color", "colour", "labels", "lineWidth", "lineStyle", "arrowSize", "showLabel"]));
      const length = attrs.find(({ key }) => key === "length");
      const labels = attrs.find(({ key }) => key === "labels");
      let axisLabels = ["x", "y", "z"];
      if (labels) {
        const parsed = tuple(labels.value, 3, line, labels.col, "labels", diagnostics, "E_POINT_ARITY");
        if (parsed) axisLabels = parsed.map((value) => decodeValue(value) ?? value);
      }
      const styles = attrs.filter(({ key }) => key !== "length" && key !== "labels");
      const size = length?.value === undefined ? "5" : length.value;
      if (typeof size !== "string" || !size.trim()) {
        diagnostics.push(issue("error", "E_BAD_VALUE", "'length' requires a LaTeX value.", line, length?.col ?? 1, { field: "length" }));
        continue;
      }
      const vectors: Array<{ id: string; dir: Tuple3; axis: number }> = [
        { id: "axis_x", dir: [size, "0", "0"], axis: 0 },
        { id: "axis_y", dir: ["0", size, "0"], axis: 1 },
        { id: "axis_z", dir: ["0", "0", size], axis: 2 },
      ];
      for (const item of vectors) {
        if (!reserveId(item.id, line, 1, ids, diagnostics)) continue;
        const vectorAttrs = [...styles];
        if (!vectorAttrs.some(({ key }) => key === "label" || key === "showLabel")) {
          vectorAttrs.push({ key: "label", value: axisLabels[item.axis], line, col: 1 }, { key: "showLabel", value: true, line, col: 1 });
        }
        const vectorState: Record<string, unknown> = { id: item.id, latex: vectorLatex(["0", "0", "0"], item.dir) };
        const { zDrag } = applyAttributes(vectorState, vectorAttrs, item.id, diagnostics, true);
        expressions.push(vectorState as ExpressionState);
        vectorIds.push(item.id);
        vectorLatexes[item.id] = vectorState.latex as string;
        if (zDrag) zDragIds.push(item.id);
      }
      continue;
    }

    if (name === "table") {
      const id = rest.trim();
      if (!reserveId(id, line, 1, ids, diagnostics)) continue;
      table = { id, type: "table", columns: [] };
      expressions.push(table);
      continue;
    }
    if (name === "folder") {
      diagnostics.push(issue("error", "E_UNSUPPORTED_DIRECTIVE", "'%folder' is not supported until 3D folder serialization is verified.", line, 1));
      continue;
    }
    if (name === "note") {
      const note = rest.match(/^([A-Za-z0-9_]+)\s*:\s*([\s\S]*)$/);
      if (!note || !reserveId(note[1], line, 1, ids, diagnostics)) continue;
      expressions.push({ id: note[1], type: "text", text: note[2] });
      continue;
    }
    if (name === "preset") {
      const match = rest.match(/^([A-Za-z][A-Za-z0-9_]*)\s+([\s\S]+)$/);
      if (!match) { diagnostics.push(issue("error", "E_DIRECTIVE_SYNTAX", "Use '%preset name key=value ...'.", line, 1)); continue; }
      const attrs = parseArgs(match[2], line, 1, diagnostics);
      const values = new Map<string, Attribute>();
      const validation: Record<string, unknown> = {};
      for (const attribute of attrs) {
        const key = ALIASES[attribute.key] ?? attribute.key;
        if (!ATTRIBUTES.has(attribute.key) || ["use", "folder"].includes(attribute.key)) {
          diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown preset attribute '${attribute.key}'.`, line, attribute.col, { field: attribute.key }));
          continue;
        }
        if (values.has(key)) {
          diagnostics.push(issue("error", "E_DUP_ATTR", `Duplicate preset key '${attribute.key}'.`, line, attribute.col, { field: key }));
          continue;
        }
        values.set(key, attribute);
        applyAttributes(validation, [attribute], match[1], diagnostics, true);
      }
      if (presets.has(match[1])) diagnostics.push(issue("error", "E_DUP_PRESET", `Duplicate preset '${match[1]}'.`, line, 1));
      else presets.set(match[1], values);
      continue;
    }
    if (name === "options" || name === "settings") {
      const attrs = parseArgs(rest, line, 1, diagnostics);
      const parsed = graphAttrs(attrs, name, diagnostics);
      if (name === "options") Object.assign(options, parsed);
      else Object.assign(settings, parsed);
      continue;
    }
    if (name === "view") {
      const pairs = parsePairs(rest, new Set(["x", "y", "z"]), line, diagnostics);
      const keys = { x: ["xmin", "xmax"], y: ["ymin", "ymax"], z: ["zmin", "zmax"] } as const;
      Object.entries(keys).forEach(([axis, pairKeys]) => {
        const pair = pairs.get(axis);
        if (pair) {
          bounds[pairKeys[0]] = pair[0];
          bounds[pairKeys[1]] = pair[1];
        }
      });
      continue;
    }
    if (name === "camera") {
      const attrs = parseArgs(rest, line, 1, diagnostics);
      const values = new Map(attrs.map((attribute) => [attribute.key, attribute]));
      const azimuth = values.get("azimuth");
      const elevation = values.get("elevation");
      const zoom = values.get("zoom");
      const allowed = new Set(["azimuth", "elevation", "zoom"]);
      attrs.filter(({ key }) => !allowed.has(key)).forEach((attribute) =>
        diagnostics.push(issue("error", "E_UNKNOWN_ATTR", `Unknown camera field '${attribute.key}'.`, line, attribute.col, { field: attribute.key })),
      );
      const parseAngle = (attribute: Attribute | undefined, field: string): number | undefined => {
        const number = attribute && typeof attribute.value === "string" ? Number(attribute.value) : Number.NaN;
        if (!Number.isFinite(number)) {
          diagnostics.push(issue("error", "E_CAMERA_SYNTAX", `%camera needs a numeric ${field}.`, line, attribute?.col ?? 1, { field }));
          return undefined;
        }
        return number;
      };
      const parsedAzimuth = parseAngle(azimuth, "azimuth");
      const parsedElevation = parseAngle(elevation, "elevation");
      const parsedZoom = zoom ? parseAngle(zoom, "zoom") : undefined;
      if (parsedAzimuth !== undefined && parsedElevation !== undefined && (!zoom || parsedZoom !== undefined)) {
        if (camera) diagnostics.push(issue("error", "E_DUP_DIRECTIVE", "Only one '%camera' directive is allowed.", line, 1));
        else camera = { azimuth: parsedAzimuth, elevation: parsedElevation, ...(parsedZoom !== undefined ? { zoom: parsedZoom } : {}) };
      }
      continue;
    }
    if (name === "expect" || name === "verify" || name === "const") {
      diagnostics.push(issue("error", "E_UNSUPPORTED_DIRECTIVE", `'%${name}' is not implemented in the initial 3D renderer.`, line, 1));
      continue;
    }
    diagnostics.push(issue("error", "E_UNKNOWN_DIRECTIVE", `Unknown directive '%${name}'.`, line, 1));
  }

  if (pending) diagnostics.push(issue("error", "E_HEADER_LATEX", `Expression '${pending.id}' is missing its LaTeX body.`, pending.line, 1, { id: pending.id }));
  if (table && !table.columns?.length) diagnostics.push(issue("error", "E_TABLE_EMPTY", `Table '${table.id}' needs at least one column.`, lines.length, 1, { id: table.id }));
  if (vectorGroup && vectorGroup.count === 0) diagnostics.push(issue("error", "E_VECTOR_FORM", `%vectors '${vectorGroup.prefix}' needs at least one indented dir row.`, vectorGroup.line, 1));
  if (diagnostics.some(({ severity }) => severity === "error")) return { ok: false, diagnostics };
  return {
    ok: true,
    output: {
      target: "3d",
      ...(Object.keys(options).length ? { options } : {}),
      ...(Object.keys(settings).length ? { settings } : {}),
      expressions,
      ...(Object.keys(bounds).length ? { bounds } : {}),
      ...(camera ? { camera } : {}),
      vectorIds,
      vectorLatex: vectorLatexes,
      zDragIds,
    },
    diagnostics,
  };
}
