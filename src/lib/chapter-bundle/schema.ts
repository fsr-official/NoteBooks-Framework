export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export type InlineNode =
  | { type: "text" | "inlineCode" | "mathInline"; value: string }
  | { type: "emphasis" | "strong"; children: InlineNode[] }
  | { type: "link"; href: string; title?: string; children: InlineNode[] }
  | { type: "glossaryRef"; termId: string; children: InlineNode[] };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; depth: 1 | 2 | 3 | 4 | 5 | 6; id?: string; children: InlineNode[] }
  | { type: "list"; ordered: boolean; start?: number; children: BlockNode[] }
  | { type: "listItem"; children: BlockNode[] }
  | {
      type: "table";
      align: Array<"left" | "center" | "right" | null>;
      children: Array<{ type: "tableRow"; children: Array<{ type: "tableCell"; children: InlineNode[] }> }>;
    }
  | { type: "tableRow"; children: BlockNode[] }
  | { type: "tableCell"; children: InlineNode[] }
  | { type: "blockquote"; children: BlockNode[] }
  | { type: "thematicBreak" }
  | { type: "codeBlock"; lang?: string; value: string }
  | { type: "mathBlock"; value: string }
  | { type: "image"; src: string; alt: string; title?: string }
  | {
      type: "component";
      name: "Callout";
      props: { name: "Callout"; type: "example" | "important" | "note" | "tip" | "warning" };
      children?: BlockNode[];
    }
  | {
      type: "component";
      name: "Example";
      props: {
        name: "Example";
        id: string;
        from: string[];
        concepts: string[];
        title: string;
        question: BlockNode[];
        answer: BlockNode[];
      };
      children?: BlockNode[];
    }
  | {
      type: "component";
      name: "Diagram";
      props: { name: "Diagram"; id: string; kind: "mermaid" | "tikz"; title?: string };
      children?: BlockNode[];
    }
  | {
      type: "component";
      name: "Desmos";
      props: { name: "Desmos"; id: string; kind: "2d" | "3d"; data: JsonValue };
      children?: BlockNode[];
    };

export type ChapterSourceShas = { glossary: string; notes: string; cnotes: string };
export type GlossaryMatch = { start: number; end: number; termId: string };

export type ChapterBundle = {
  schemaVersion: 2;
  id: string;
  title: string;
  rendererVersion: string;
  sourceShas: ChapterSourceShas;
  outline: Array<{ id: string; title: string; importance: 0 | 1 | 2 | 3; brief: string }>;
  notes: { tree: BlockNode[] };
  facts: Array<{
    sectionId: string;
    brief: string;
    points: string[];
    glossaryRefs: { brief: GlossaryMatch[]; points: GlossaryMatch[][] };
  }>;
  examples: Array<{
    id: string;
    from: string[];
    concepts: string[];
    title: string;
    question: BlockNode[];
    answer: BlockNode[];
  }>;
  glossary: Record<string, { term: string; definition: string; aliases: string[]; common: boolean }>;
  diagrams: Array<{ id: string; kind: "mermaid" | "tikz"; source: string; title?: string }>;
  desmos: Array<{ id: string; kind: "2d" | "3d"; data: JsonValue }>;
};

export type ChapterManifestEntry = {
  id: string;
  title: string;
  bundle: string;
  sourceShas: ChapterSourceShas;
};

export type ChapterManifest = {
  schemaVersion: 2;
  rendererVersion: string;
  chapters: ChapterManifestEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => key in value)
    && Object.keys(value).every((key) => allowed.has(key));
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isSectionId(value: unknown): value is string {
  return typeof value === "string" && /^\d+\.\d+(?:\.\d+)?$/.test(value);
}

function isSectionIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isSectionId);
}

function isSourceShas(value: unknown): value is ChapterSourceShas {
  return isRecord(value)
    && hasKeys(value, ["glossary", "notes", "cnotes"])
    && Object.values(value).every((sha) => typeof sha === "string" && /^[a-f0-9]{64}$/.test(sha));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isInlineNode(value: unknown): value is InlineNode {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case "text":
    case "inlineCode":
    case "mathInline":
      return hasKeys(value, ["type", "value"]) && isString(value.value);
    case "emphasis":
    case "strong":
      return hasKeys(value, ["type", "children"])
        && Array.isArray(value.children)
        && value.children.every(isInlineNode);
    case "link":
      return hasKeys(value, ["type", "href", "children"], ["title"])
        && isString(value.href)
        && (value.title === undefined || isString(value.title))
        && Array.isArray(value.children)
        && value.children.every(isInlineNode);
    case "glossaryRef":
      return hasKeys(value, ["type", "termId", "children"])
        && isNonEmptyString(value.termId)
        && Array.isArray(value.children)
        && value.children.every(isInlineNode);
    default:
      return false;
  }
}

function isBlockNodeArray(value: unknown): value is BlockNode[] {
  return Array.isArray(value) && value.every(isBlockNode);
}

function isBlockNode(value: unknown): value is BlockNode {
  if (!isRecord(value) || !isString(value.type)) return false;
  switch (value.type) {
    case "paragraph":
    case "tableCell":
      return hasKeys(value, ["type", "children"])
        && Array.isArray(value.children)
        && value.children.every(isInlineNode);
    case "heading":
      return hasKeys(value, ["type", "depth", "children"], ["id"])
        && Number.isInteger(value.depth)
        && Number(value.depth) >= 1
        && Number(value.depth) <= 6
        && (value.id === undefined || isSectionId(value.id))
        && Array.isArray(value.children)
        && value.children.every(isInlineNode);
    case "list":
      return hasKeys(value, ["type", "ordered", "children"], ["start"])
        && typeof value.ordered === "boolean"
        && (value.start === undefined || (Number.isInteger(value.start) && Number(value.start) > 0))
        && isBlockNodeArray(value.children);
    case "listItem":
    case "blockquote":
      return hasKeys(value, ["type", "children"]) && isBlockNodeArray(value.children);
    case "tableRow":
      return hasKeys(value, ["type", "children"])
        && Array.isArray(value.children)
        && value.children.every(isTableCellNode);
    case "table":
      return hasKeys(value, ["type", "align", "children"])
        && Array.isArray(value.align)
        && value.align.every((alignment) => alignment === null || ["left", "center", "right"].includes(String(alignment)))
        && Array.isArray(value.children)
        && value.children.every(isTableRowNode);
    case "thematicBreak":
      return hasKeys(value, ["type"]);
    case "codeBlock":
      return hasKeys(value, ["type", "value"], ["lang"])
        && isString(value.value)
        && (value.lang === undefined || isString(value.lang));
    case "mathBlock":
      return hasKeys(value, ["type", "value"]) && isString(value.value);
    case "image":
      return hasKeys(value, ["type", "src", "alt"], ["title"])
        && isString(value.src)
        && isString(value.alt)
        && (value.title === undefined || isString(value.title));
    case "component":
      return isComponentNode(value);
    default:
      return false;
  }
}

function isTableCellNode(value: unknown): boolean {
  return isRecord(value)
    && value.type === "tableCell"
    && hasKeys(value, ["type", "children"])
    && Array.isArray(value.children)
    && value.children.every(isInlineNode);
}

function isTableRowNode(value: unknown): boolean {
  return isRecord(value)
    && value.type === "tableRow"
    && hasKeys(value, ["type", "children"])
    && Array.isArray(value.children)
    && value.children.every(isTableCellNode);
}

function isComponentNode(value: Record<string, unknown>): value is BlockNode & Record<string, unknown> {
  if (!hasKeys(value, ["type", "name", "props"], ["children"])
    || (value.children !== undefined && !isBlockNodeArray(value.children))
    || !isRecord(value.props)
    || value.props.name !== value.name) return false;

  const props = value.props;
  switch (value.name) {
    case "Callout":
      return hasKeys(props, ["name", "type"])
        && ["example", "important", "note", "tip", "warning"].includes(String(props.type));
    case "Example":
      return hasKeys(props, ["name", "id", "from", "concepts", "title", "question", "answer"])
        && isNonEmptyString(props.id)
        && isSectionIdArray(props.from)
        && isSectionIdArray(props.concepts)
        && isString(props.title)
        && isBlockNodeArray(props.question)
        && isBlockNodeArray(props.answer);
    case "Diagram":
      return hasKeys(props, ["name", "id", "kind"], ["title"])
        && isNonEmptyString(props.id)
        && ["mermaid", "tikz"].includes(String(props.kind))
        && (props.title === undefined || isString(props.title));
    case "Desmos":
      return hasKeys(props, ["name", "id", "kind", "data"])
        && isNonEmptyString(props.id)
        && ["2d", "3d"].includes(String(props.kind))
        && isJsonValue(props.data);
    default:
      return false;
  }
}

function isGlossary(value: unknown): value is ChapterBundle["glossary"] {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => isRecord(entry)
    && hasKeys(entry, ["term", "definition", "aliases", "common"])
    && isString(entry.term)
    && isString(entry.definition)
    && isStringArray(entry.aliases)
    && typeof entry.common === "boolean");
}

function glossaryMatchesAreValid(
  refs: unknown,
  text: string,
  glossary: ChapterBundle["glossary"],
): refs is GlossaryMatch[] {
  if (!Array.isArray(refs)) return false;
  let previousEnd = 0;
  return refs.every((ref) => {
    if (!isRecord(ref)
      || !hasKeys(ref, ["start", "end", "termId"])
      || !Number.isInteger(ref.start)
      || !Number.isInteger(ref.end)
      || Number(ref.start) < previousEnd
      || Number(ref.end) <= Number(ref.start)
      || Number(ref.end) > text.length
      || typeof ref.termId !== "string"
      || !glossary[ref.termId]
      || glossary[ref.termId].common) return false;
    const matched = text.slice(Number(ref.start), Number(ref.end)).toLowerCase();
    const entry = glossary[ref.termId];
    const canonical = entry.term.replace(/\s*\([^)]*\)/, "").trim().toLowerCase();
    if (matched !== canonical && !entry.aliases.some((alias) => alias.toLowerCase() === matched)) return false;
    previousEnd = Number(ref.end);
    return true;
  });
}

function glossaryRefsInNodesAreValid(
  nodes: BlockNode[],
  glossary: ChapterBundle["glossary"],
): boolean {
  const inlineAreValid = (inline: InlineNode[]): boolean => inline.every((node) => {
    if (node.type === "glossaryRef") return Boolean(glossary[node.termId]) && !glossary[node.termId].common;
    if (node.type === "emphasis" || node.type === "strong") return inlineAreValid(node.children);
    if (node.type === "link") return inlineAreValid(node.children);
    return true;
  });
  return nodes.every((node) => {
    if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell") {
      return inlineAreValid(node.children);
    }
    if (node.type === "component") {
      if (node.name === "Example") {
        return glossaryRefsInNodesAreValid(node.props.question, glossary)
          && glossaryRefsInNodesAreValid(node.props.answer, glossary);
      }
      return node.children === undefined || glossaryRefsInNodesAreValid(node.children, glossary);
    }
    if (node.type === "table") {
      return node.children.every((row) => row.children.every((cell) => inlineAreValid(cell.children)));
    }
    if ("children" in node) return glossaryRefsInNodesAreValid(node.children, glossary);
    return true;
  });
}

function isFact(
  value: unknown,
  glossary: ChapterBundle["glossary"],
): value is ChapterBundle["facts"][number] {
  if (!isRecord(value)
    || !hasKeys(value, ["sectionId", "brief", "points", "glossaryRefs"])
    || !isSectionId(value.sectionId)
    || !isString(value.brief)
    || !isStringArray(value.points)) return false;
  const points = value.points;
  if (
    !isRecord(value.glossaryRefs)
    || !hasKeys(value.glossaryRefs, ["brief", "points"])
    || !glossaryMatchesAreValid(value.glossaryRefs.brief, value.brief, glossary)
    || !Array.isArray(value.glossaryRefs.points)
    || value.glossaryRefs.points.length !== points.length) return false;
  return value.glossaryRefs.points.every((refs, index) => (
    glossaryMatchesAreValid(refs, points[index], glossary)
  ));
}

function isChapterBundle(value: unknown): value is ChapterBundle {
  if (!isRecord(value) || !hasKeys(value, [
    "schemaVersion", "id", "title", "rendererVersion", "sourceShas", "outline",
    "notes", "facts", "examples", "glossary", "diagrams", "desmos",
  ])) return false;
  if (value.schemaVersion !== 2
    || typeof value.id !== "string"
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)
    || !isNonEmptyString(value.title)
    || !isNonEmptyString(value.rendererVersion)
    || !isSourceShas(value.sourceShas)
    || !isRecord(value.notes)
    || !hasKeys(value.notes, ["tree"])
    || !isBlockNodeArray(value.notes.tree)
    || !Array.isArray(value.outline)
    || !Array.isArray(value.facts)
    || !Array.isArray(value.examples)
    || !isGlossary(value.glossary)
    || !Array.isArray(value.diagrams)
    || !Array.isArray(value.desmos)) return false;

  const glossary = value.glossary;
  const outlineIsValid = value.outline.every((entry) => isRecord(entry)
    && hasKeys(entry, ["id", "title", "importance", "brief"])
    && isNonEmptyString(entry.id)
    && isString(entry.title)
    && Number.isInteger(entry.importance)
    && Number(entry.importance) >= 0
    && Number(entry.importance) <= 3
    && isString(entry.brief));
  const factsAreValid = value.facts.every((fact) => isFact(fact, glossary));
  const examplesAreValid = value.examples.every((example) => isRecord(example)
    && hasKeys(example, ["id", "from", "concepts", "title", "question", "answer"])
    && isNonEmptyString(example.id)
    && isSectionIdArray(example.from)
    && isSectionIdArray(example.concepts)
    && isString(example.title)
    && isBlockNodeArray(example.question)
    && isBlockNodeArray(example.answer));
  const diagramsAreValid = value.diagrams.every((diagram) => isRecord(diagram)
    && hasKeys(diagram, ["id", "kind", "source"], ["title"])
    && isNonEmptyString(diagram.id)
    && ["mermaid", "tikz"].includes(String(diagram.kind))
    && isString(diagram.source)
    && (diagram.title === undefined || isString(diagram.title)));
  const desmosAreValid = value.desmos.every((block) => isRecord(block)
    && hasKeys(block, ["id", "kind", "data"])
    && isNonEmptyString(block.id)
    && ["2d", "3d"].includes(String(block.kind))
    && isJsonValue(block.data));

  return outlineIsValid
    && factsAreValid
    && examplesAreValid
    && diagramsAreValid
    && desmosAreValid
    && glossaryRefsInNodesAreValid(value.notes.tree, glossary);
}

export function parseChapterBundle(value: unknown): ChapterBundle {
  if (!isChapterBundle(value)) throw new Error("Chapter bundle does not match schema version 2");
  return value;
}

export function isChapterManifest(value: unknown): value is ChapterManifest {
  if (!isRecord(value)
    || !hasKeys(value, ["schemaVersion", "rendererVersion", "chapters"])
    || value.schemaVersion !== 2
    || !isNonEmptyString(value.rendererVersion)
    || !Array.isArray(value.chapters)) return false;

  const entries = value.chapters.filter((entry): entry is Record<string, unknown> => isRecord(entry));
  if (entries.length !== value.chapters.length) return false;
  const ids = new Set<string>();
  return entries.every((entry) => {
    if (!hasKeys(entry, ["id", "title", "bundle", "sourceShas"])
      || typeof entry.id !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)
      || ids.has(entry.id)
      || !isNonEmptyString(entry.title)
      || entry.bundle !== `${entry.id}.json`
      || !isSourceShas(entry.sourceShas)) return false;
    ids.add(entry.id);
    return true;
  });
}

export function parseChapterManifest(value: unknown): ChapterManifest {
  if (!isChapterManifest(value)) throw new Error("Chapter manifest does not match schema version 2");
  return value;
}

export function sourceShasMatch(left: ChapterSourceShas, right: ChapterSourceShas): boolean {
  return left.glossary === right.glossary
    && left.notes === right.notes
    && left.cnotes === right.cnotes;
}
