import { compile, run } from "@mdx-js/mdx";
import katex from "katex";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { createElement, Fragment, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { jsx, jsxs } from "react/jsx-runtime";
import type { MDXComponents } from "mdx/types";
import { isTrustedMdxRepository } from "@/lib/mdx-feature-flag";
import type {
  NoteFigure,
  NoteSearchBlock,
  NoteSection,
  RenderedNote,
  RenderNoteSource,
} from "@/lib/markdown/renderer";
import { rewriteSourceUrl } from "@/lib/markdown/renderer";

type MdxAstNode = {
  type?: string;
  position?: { start?: { line?: number } };
  children?: MdxAstNode[];
};

type NoteSectionNode = NoteSection & { children: NoteSectionNode[] };
type RenderState = {
  figures: NoteFigure[];
  nextBlockNumber: number;
  nextFigureNumber: number;
  sectionIds: Set<string>;
  sectionStack: NoteSectionNode[];
  sections: NoteSectionNode[];
  searchIndex: NoteSearchBlock[];
  source: RenderNoteSource;
};
type MdxComponentProps = { children?: ReactNode; [key: string]: unknown };

export class MdxCompileError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(line ? `MDX line ${line}: ${message}` : message);
    this.name = "MdxCompileError";
  }
}

function rejectImports() {
  return (tree: MdxAstNode) => {
    const visit = (node: MdxAstNode): void => {
      if (node.type === "mdxjsEsm") {
        throw new MdxCompileError(
          "JavaScript imports and exports are not supported; use the built-in or application-provided component registry.",
          node.position?.start?.line,
        );
      }
      for (const child of node.children ?? []) visit(child);
    };
    visit(tree);
  };
}

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return nodeText(node.props.children);
  return "";
}

function slugify(title: string): string {
  return title.toLowerCase().normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";
}

function currentSectionId(state: RenderState): string {
  return state.sectionStack.at(-1)?.id ?? "preamble";
}

function trackBlock(state: RenderState, children: ReactNode): string {
  state.nextBlockNumber += 1;
  const sectionId = currentSectionId(state);
  const blockId = `${sectionId}-block-${state.nextBlockNumber}`;
  const text = nodeText(children).replace(/\s+/g, " ").trim();
  if (text) state.searchIndex.push({ sectionId, blockId, text });
  return blockId;
}

function componentText(children: ReactNode): string {
  return nodeText(children).replace(/\r\n?/g, "\n").trim();
}

function toTree(sections: NoteSectionNode[]): NoteSection[] {
  return sections.map(({ id, number, title, level, children }) => ({
    id,
    number,
    title,
    level,
    children: toTree(children),
  }));
}

function createMdxComponents(state: RenderState): MDXComponents {
  const heading = (level: number, children: ReactNode, props: Record<string, unknown>) => {
    const title = nodeText(children).replace(/\s+/g, " ").trim() || "Untitled section";
    while (state.sectionStack.length && state.sectionStack.at(-1)!.level >= level) {
      state.sectionStack.pop();
    }
    const parent = state.sectionStack.at(-1);
    const number = parent ? `${parent.number}.${parent.children.length + 1}` : String(state.sections.length + 1);
    const baseId = slugify(title);
    let id = baseId;
    let suffix = 2;
    while (state.sectionIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    state.sectionIds.add(id);
    const section: NoteSectionNode = { id, number, title, level, children: [] };
    if (parent) parent.children.push(section);
    else state.sections.push(section);
    state.sectionStack.push(section);
    const blockId = `${id}-heading`;
    state.searchIndex.push({ sectionId: id, blockId, text: title });
    const tag = `h${level}` as const;
    return createElement(tag, {
      ...props,
      id,
      "data-section-id": id,
      "data-block-id": blockId,
    }, children);
  };

  const tracked = <Tag extends "p" | "ul" | "ol" | "blockquote" | "pre" | "table" | "hr">(
    tag: Tag,
    children: ReactNode,
    props: ComponentPropsWithoutRef<Tag>,
  ) => {
    const blockId = trackBlock(state, children);
    return createElement("div", {
      className: "note-block",
      "data-section-id": currentSectionId(state),
      "data-block-id": blockId,
    }, createElement(tag, props, children));
  };

  const figure = (
    type: NoteFigure["type"],
    children: ReactNode,
  ) => {
    const source = componentText(children);
    const id = `figure-${++state.nextFigureNumber}`;
    const sectionId = state.sectionStack.at(-1)?.id ?? null;
    state.figures.push({ id, sectionId, type, source });
    if (type === "mermaid") {
      return createElement("div", {
        className: "obsidian-mermaid mermaid",
        "data-figure-id": id,
        "data-diagram-type": /^\s*mindmap(?:\s|$)/im.test(source) ? "mindmap" : "mermaid",
      }, source);
    }
    if (type === "tikz") {
      return createElement("div", { className: "tikz-wrapper", "data-figure-id": id },
        createElement("div", { className: "tikz-loading" }, "Rendering diagram…"),
        createElement("div", { className: "tikz-source", hidden: true }, source));
    }
    if (type === "desmos") {
      return createElement("div", { className: "obsidian-desmos", "data-figure-id": id },
        createElement("div", { className: "desmos-loading" }, "Loading Desmos graph…"),
        createElement("pre", { className: "desmos-source", hidden: true }, source));
    }
    return createElement("div", { className: "obsidian-desmos3d", "data-figure-id": id },
      createElement("div", { className: "desmos-loading" }, "Loading Desmos 3D graph…"),
      createElement("pre", { className: "desmos-source", hidden: true }, source));
  };

  const components: MDXComponents = {
    h1: (props) => heading(1, props.children, props),
    h2: (props) => heading(2, props.children, props),
    h3: (props) => heading(3, props.children, props),
    h4: (props) => heading(4, props.children, props),
    h5: (props) => heading(5, props.children, props),
    h6: (props) => heading(6, props.children, props),
    p: (props) => tracked("p", props.children, props),
    ul: (props) => tracked("ul", props.children, props),
    ol: (props) => tracked("ol", props.children, props),
    blockquote: (props) => tracked("blockquote", props.children, props),
    pre: (props) => tracked("pre", props.children, props),
    table: (props) => tracked("table", props.children, props),
    hr: (props) => tracked("hr", props.children, props),
    Callout: ({ type = "note", title, children }: MdxComponentProps) => {
      const calloutType = typeof type === "string" ? type.toLowerCase().replace(/_/g, "-") : "note";
      const label = typeof title === "string"
        ? title
        : calloutType.replace(/-/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
      const normalizedType = ({
        abstract: "note",
        attention: "warning",
        caution: "warning",
        danger: "warning",
        error: "warning",
        example: "example",
        formula: "formula",
        info: "note",
        jee: "tip",
        "key-principle": "principle",
        "common-mistake": "warning",
        important: "principle",
        neet: "tip",
        note: "note",
        success: "success",
        tip: "tip",
        warning: "warning",
      } as Record<string, string>)[calloutType] ?? calloutType;
      return createElement("blockquote", { className: "callout", "data-type": normalizedType },
        createElement("span", { className: "callout-title" }, label),
        children);
    },
    InlineMath: ({ children }: MdxComponentProps) => createElement("span", {
      dangerouslySetInnerHTML: {
        __html: katex.renderToString(componentText(children), {
          throwOnError: false,
          strict: "ignore",
          output: "html",
        }),
      },
    }),
    BlockMath: ({ children }: MdxComponentProps) => createElement("div", {
      className: "math-block",
      dangerouslySetInnerHTML: {
        __html: katex.renderToString(componentText(children), {
          displayMode: true,
          throwOnError: false,
          strict: "ignore",
          output: "html",
        }),
      },
    }),
    Mermaid: ({ children }: MdxComponentProps) => figure("mermaid", children),
    TikZ: ({ children }: MdxComponentProps) => figure("tikz", children),
    Desmos: ({ children }: MdxComponentProps) => figure("desmos", children),
    Desmos3D: ({ children }: MdxComponentProps) => figure("desmos3d", children),
    a: ({ href, children, ...props }: ComponentPropsWithoutRef<"a">) => {
      const safeHref = typeof href === "string" ? rewriteSourceUrl(href, state.source, false) : undefined;
      return createElement("a", { ...props, href: safeHref }, children);
    },
    img: ({ src, alt, ...props }: ComponentPropsWithoutRef<"img">) => {
      const safeSrc = typeof src === "string" ? rewriteSourceUrl(src, state.source, true) : undefined;
      return createElement("img", { ...props, src: safeSrc, alt });
    },
  };
  return components;
}

export async function compileMdx(source: string): Promise<string> {
  const compiled = await compile(source.replace(/\r\n?/g, "\n"), {
    development: false,
    outputFormat: "function-body",
    remarkPlugins: [remarkGfm, remarkMath, rejectImports],
    rehypePlugins: [rehypeKatex],
  });
  return String(compiled);
}

export async function renderMdxNote(
  source: string,
  sourceInfo: RenderNoteSource,
  applicationComponents: MDXComponents = {},
): Promise<RenderedNote> {
  if (!isTrustedMdxRepository(sourceInfo.owner, sourceInfo.repository)) {
    throw new MdxCompileError(
      `MDX execution is not enabled for ${sourceInfo.owner}/${sourceInfo.repository}. Add the exact repository to TRUSTED_MDX_REPOSITORIES.`,
    );
  }
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const compiled = await compileMdx(body);
  const compiledMdx = await run(compiled, { Fragment, jsx, jsxs });
  const state: RenderState = {
    figures: [],
    nextBlockNumber: 0,
    nextFigureNumber: 0,
    sectionIds: new Set(),
    sectionStack: [],
    sections: [],
    searchIndex: [],
    source: sourceInfo,
  };
  const components: MDXComponents = {
    ...applicationComponents,
    ...createMdxComponents(state),
  };
  const html = renderToStaticMarkup(createElement(compiledMdx.default, { components }));
  return {
    html,
    tree: toTree(state.sections),
    searchIndex: state.searchIndex,
    figures: state.figures,
  };
}
