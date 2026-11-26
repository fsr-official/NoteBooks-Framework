import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import sub from "markdown-it-sub";
import sup from "markdown-it-sup";
import taskLists from "markdown-it-task-lists";
import texmath from "markdown-it-texmath";
import katex from "katex";

export type NoteSection = {
  id: string;
  number: string;
  title: string;
  level: number;
  children: NoteSection[];
};

export type RenderNoteSource = {
  owner: string;
  repository: string;
  branch: string;
  filePath: string;
};

export type NoteSearchBlock = {
  sectionId: string;
  blockId: string;
  text: string;
};

export type NoteFigure = {
  id: string;
  sectionId: string | null;
  type: "mermaid" | "tikz" | "desmos" | "desmos3d";
  source: string;
};

export type RenderedNote = {
  html: string;
  tree: NoteSection[];
  searchIndex: NoteSearchBlock[];
  figures: NoteFigure[];
};

type ContentNode =
  | { type: "html"; html: string }
  | { type: "section"; section: SectionNode };

type SectionNode = Omit<NoteSection, "children"> & {
  children: SectionNode[];
  headingHtml: string;
  content: ContentNode[];
};

type Block = { tokens: import("markdown-it").Token[] };
type MarkdownParser = InstanceType<typeof MarkdownIt>;

function wikiLinkHref(target: string, anchor: string | null, source: RenderNoteSource | undefined): string {
  if (!source) return anchor && !target ? `#${encodeURIComponent(slugify(anchor))}` : `#${encodeURIComponent(target || anchor || "")}`;
  if (!target && anchor) return `#${encodeURIComponent(slugify(anchor))}`;

  const resolvedPath = resolveRepositoryPath(target, source.filePath);
  if (!resolvedPath) return "#";
  const isMarkdown = /\.(?:md|markdown|mdx)$/i.test(resolvedPath);
  const targetPath = isMarkdown ? resolvedPath : `${resolvedPath}.md`;
  if (isMarkdown || !/\.[^/]+$/.test(resolvedPath)) {
    const params = new URLSearchParams({
      owner: source.owner,
      repo: source.repository,
      path: targetPath,
      branch: source.branch,
    });
    return `/read?${params.toString()}${anchor ? `#${encodeURIComponent(slugify(anchor))}` : ""}`;
  }
  const path = resolvedPath.split("/").map(encodeURIComponent).join("/");
  const branch = source.branch.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/blob/${branch}/${path}`;
}

function embedHtml(
  value: string,
  source: RenderNoteSource | undefined,
  escapeHtml: (value: string) => string,
): { html: string; text: string } {
  const [filePart, rawSize] = value.split("|", 2).map((part) => part.trim());
  const filePath = filePart.split("#", 1)[0];
  const isImage = /\.(?:bmp|gif|jpe?g|png|svg|webp)$/i.test(filePath);
  const isAudio = /\.(?:flac|m4a|mp3|ogg|wav)$/i.test(filePath);
  const isVideo = /\.(?:mkv|mov|mp4|webm)$/i.test(filePath);
  const dimensions = rawSize?.match(/^(\d{1,4})(?:x(\d{1,4}))?$/);
  const sizeAttributes = dimensions
    ? ` width="${dimensions[1]}"${dimensions[2] ? ` height="${dimensions[2]}"` : ""}`
    : "";
  const altText = rawSize && !dimensions ? rawSize : filePath;
  const safeName = escapeHtml(altText);
  const src = source
    ? rewriteSourceUrl(filePart, source, isImage)
    : filePart;
  const safeSrc = escapeHtml(src);

  if (isImage) {
    return {
      html: `<img class="obsidian-embed obsidian-image" src="${safeSrc}" alt="${safeName}"${sizeAttributes}>`,
      text: altText,
    };
  }
  if (isAudio) {
    return {
      html: `<audio class="obsidian-embed obsidian-audio" controls src="${safeSrc}">${safeName}</audio>`,
      text: altText,
    };
  }
  if (isVideo) {
    return {
      html: `<video class="obsidian-embed obsidian-video" controls src="${safeSrc}"${sizeAttributes}>${safeName}</video>`,
      text: altText,
    };
  }
  if (/\.pdf$/i.test(filePath)) {
    return {
      html: `<iframe class="obsidian-embed obsidian-pdf" src="${safeSrc}" title="${safeName}"></iframe>`,
      text: altText,
    };
  }
  const href = /\.(?:md|markdown|mdx)$/i.test(filePath) || !/\.[^/]+$/.test(filePath)
    ? wikiLinkHref(filePath, null, source)
    : safeSrc;
  return {
    html: `<a class="obsidian-embed obsidian-transclusion" href="${escapeHtml(href)}">Embedded file: ${safeName}</a>`,
    text: `Embedded file: ${altText}`,
  };
}

function obsidianInlineHtml(
  content: string,
  source: RenderNoteSource | undefined,
  md: MarkdownParser,
): { html: string; text: string } {
  const visible = content.replace(/%%[\s\S]*?%%/g, "");
  const pattern = /!\[\[([^\]]+)\]\]|\[\[([^\]]+)\]\]|==((?!\s)[\s\S]*?(?<!\s))==|(?<![\w/])#([A-Za-z][\w/-]*)/g;
  let html = "";
  let text = "";
  let previous = 0;
  for (const match of visible.matchAll(pattern)) {
    const index = match.index ?? 0;
    const before = visible.slice(previous, index);
    html += md.utils.escapeHtml(before);
    text += before;
    if (match[1]) {
      const { html: embed, text: embedText } = embedHtml(match[1], source, md.utils.escapeHtml);
      html += embed;
      text += embedText;
    } else if (match[2]) {
      const [rawTarget, rawAlias] = match[2].split("|", 2).map((part) => part.trim());
      const hashIndex = rawTarget.indexOf("#");
      const target = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
      const anchor = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1) : null;
      const label = rawAlias || (anchor ? `${target}#${anchor}` : target);
      const href = wikiLinkHref(target, anchor, source);
      html += `<a class="obsidian-wikilink" href="${md.utils.escapeHtml(href)}" data-target="${md.utils.escapeHtml(target)}">${md.utils.escapeHtml(label)}</a>`;
      text += label;
    } else if (match[3]) {
      html += `<mark>${md.renderInline(match[3])}</mark>`;
      text += match[3];
    } else {
      const tag = match[4];
      html += `<span class="obsidian-tag">#${md.utils.escapeHtml(tag)}</span>`;
      text += `#${tag}`;
    }
    previous = index + match[0].length;
  }
  const after = visible.slice(previous);
  html += md.utils.escapeHtml(after);
  text += after;
  return { html, text: text.replace(/\s+/g, " ").trim() };
}

const CALLOUT_TYPE: Record<string, string> = {
  abstract: "note",
  attention: "warning",
  bug: "warning",
  caution: "warning",
  cite: "note",
  danger: "warning",
  done: "success",
  error: "warning",
  example: "example",
  failure: "warning",
  fail: "warning",
  formula: "formula",
  faq: "note",
  help: "note",
  hint: "tip",
  jee: "tip",
  "key-principle": "principle",
  key: "principle",
  "common-mistake": "warning",
  important: "principle",
  info: "note",
  missing: "warning",
  neet: "tip",
  note: "note",
  question: "note",
  quote: "note",
  summary: "note",
  success: "success",
  tip: "tip",
  tldr: "note",
  todo: "note",
  warning: "warning",
  check: "success",
};

function normalizeCalloutType(type: string): string {
  const normalized = type.toLowerCase().replace(/_/g, "-");
  return CALLOUT_TYPE[normalized] ?? normalized;
}

function calloutLabel(type: string): string {
  return type.replace(/-/g, " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function replaceOutsideInlineCode(
  source: string,
  transform: (text: string) => string,
): string {
  let output = "";
  let cursor = 0;
  let plainStart = 0;

  while (cursor < source.length) {
    if (source[cursor] !== "`") {
      cursor += 1;
      continue;
    }

    let delimiterEnd = cursor + 1;
    while (source[delimiterEnd] === "`") delimiterEnd += 1;
    const delimiter = source.slice(cursor, delimiterEnd);
    let closing = source.indexOf(delimiter, delimiterEnd);
    while (closing >= 0
      && (source[closing - 1] === "`" || source[closing + delimiter.length] === "`")) {
      closing = source.indexOf(delimiter, closing + delimiter.length);
    }
    if (closing < 0) {
      cursor = delimiterEnd;
      continue;
    }

    output += transform(source.slice(plainStart, cursor));
    output += source.slice(cursor, closing + delimiter.length);
    cursor = closing + delimiter.length;
    plainStart = cursor;
  }

  return output + transform(source.slice(plainStart));
}

function normalizeInlineMathSource(source: string): string {
  const removeNestedDollarDelimiters = (math: string) =>
    math.replace(/(?<!\\)\$([^$\r\n]+)(?<!\\)\$/g, "$1");

  const normalizeUnicodeRadicals = (math: string) =>
    math
      .replace(/√\{([^{}]+)\}/g, "\\sqrt{$1}")
      .replace(/√\(([^()\r\n]+)\)/g, "\\sqrt{$1}")
      .replace(/√([A-Za-z0-9])/g, "\\sqrt{$1}");

  const displayMath = source.match(/^(\s*)\$\$([\s\S]*?)\$\$(\s*)$/);
  if (displayMath) {
    return `${displayMath[1]}$$${normalizeUnicodeRadicals(removeNestedDollarDelimiters(displayMath[2]))}$$${displayMath[3]}`;
  }

  return source.replace(/(\r?\n)|([^\r\n]+)/g, (line, newline: string | undefined, content: string | undefined) => {
    if (newline) return newline;
    return (content ?? "")
      .replace(/\$\$([\s\S]*?)\$\$/g, (_match, math: string) => `$$${removeNestedDollarDelimiters(math)}$$`)
      .replace(/(?<!\\)\$([^$\r\n]+)(?<!\\)\$/g, (_match, math: string) => `$${normalizeUnicodeRadicals(removeNestedDollarDelimiters(math))}$`)
      .replace(/\\\((.*?)\\\)/g, (_match, math: string) => `\\(${normalizeUnicodeRadicals(removeNestedDollarDelimiters(math))}\\)`)
      .replace(/\\\[(.*?)\\\]/g, (_match, math: string) => `\\[${normalizeUnicodeRadicals(removeNestedDollarDelimiters(math))}\\]`)
      .replace(/(?<!\S)(?<!\\)\$([^\s$\r\n](?:[^$\r\n]*?[^\s$\r\n])?)\s+(?<!\\)\$/g, (_match, math: string) => `\\(${normalizeUnicodeRadicals(math.trim())}\\)`);
  });
}

function protectTableMathPipes(source: string): string {
  const segments = source.match(/[^\r\n]*(?:\r\n|\n|$)/g)?.filter((segment) => segment.length > 0) ?? [];
  let fence: { character: string; length: number } | null = null;
  const tableLines = new Set<number>();

  for (let lineIndex = 0; lineIndex < segments.length; lineIndex += 1) {
    const line = segments[lineIndex].replace(/\r?\n$/, "");
    const content = line.replace(/^[ \t]*(?:>[ \t]*)*/, "");

    if (fence) {
      const closingFence = content.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closingFence
        && closingFence[1][0] === fence.character
        && closingFence[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    const fenceMarker = content.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMarker) {
      fence = { character: fenceMarker[1][0], length: fenceMarker[1].length };
      continue;
    }

    if (lineIndex + 1 >= segments.length) continue;
    const nextLine = segments[lineIndex + 1].replace(/\r?\n$/, "");
    const nextContent = nextLine.replace(/^[ \t]*(?:>[ \t]*)*/, "");
    const delimiter = /^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextContent);
    if (!delimiter || !line.includes("|")) continue;

    tableLines.add(lineIndex);
    tableLines.add(lineIndex + 1);
    for (let bodyIndex = lineIndex + 2; bodyIndex < segments.length; bodyIndex += 1) {
      const bodyLine = segments[bodyIndex].replace(/\r?\n$/, "");
      const bodyContent = bodyLine.replace(/^[ \t]*(?:>[ \t]*)*/, "");
      if (!bodyLine.includes("|") || /^ {0,3}(?:`{3,}|~{3,})/.test(bodyContent)) break;
      tableLines.add(bodyIndex);
    }
  }

  for (let lineIndex = 0; lineIndex < segments.length; lineIndex += 1) {
    if (!tableLines.has(lineIndex)) continue;

    const segment = segments[lineIndex];
    const newline = segment.match(/\r?\n$/)?.[0] ?? "";
    const line = segment.slice(0, segment.length - newline.length);
    let protectedLine = "";
    let inDollarMath = false;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];

      if (character === "`") {
        const runMatch = line.slice(index).match(/^`+/);
        const runLength = runMatch?.[0].length ?? 1;
        const closing = "`".repeat(runLength);
        const closingIndex = line.indexOf(closing, index + runLength);
        if (closingIndex !== -1) {
          protectedLine += line.slice(index, closingIndex + runLength);
          index = closingIndex + runLength - 1;
          continue;
        }
      }

      if (character === "$") {
        let backslashes = 0;
        for (let before = index - 1; before >= 0 && line[before] === "\\"; before -= 1) {
          backslashes += 1;
        }
        if (backslashes % 2 === 0) {
          if (line[index + 1] === "$") {
            inDollarMath = !inDollarMath;
            protectedLine += "$";
            index += 1;
          } else {
            inDollarMath = !inDollarMath;
          }
        }
      } else if (character === "|" && inDollarMath) {
        let backslashes = 0;
        for (let before = index - 1; before >= 0 && line[before] === "\\"; before -= 1) {
          backslashes += 1;
        }
        if (backslashes % 2 === 0) protectedLine += "\\";
      }

      protectedLine += character;
    }

    segments[lineIndex] = `${protectedLine}${newline}`;
  }

  return segments.join("");
}

function protectBracketMathFromProseEquationNumbers(source: string): string {
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  let fence: { character: string; length: number } | null = null;
  let previousNonblank: { quoteDepth: number; closesBracketMath: boolean } | null = null;

  return lines.map((line) => {
    const content = line.replace(/\r?\n$/, "");
    const prefix = content.match(/^[ \t]*(?:>[ \t]*)*/)?.[0] ?? "";
    const quoteDepth = (prefix.match(/>/g) ?? []).length;
    const markdown = content.slice(prefix.length);

    if (fence) {
      const closingFence = markdown.match(/^ {0,3}(`+|~+)[ \t]*$/);
      if (closingFence
        && closingFence[1][0] === fence.character
        && closingFence[1].length >= fence.length) {
        fence = null;
      }
      previousNonblank = null;
      return line;
    }

    const fenceMarker = markdown.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMarker) {
      fence = { character: fenceMarker[1][0], length: fenceMarker[1].length };
      previousNonblank = null;
      return line;
    }

    const inlineMathProse = /\\(?:[A-Za-z]+|[([])/.test(markdown);
    const standaloneParenthetical = markdown.match(/^([ \t]*)\(/);
    const sameLineParenthetical = markdown.match(/^(\\\][ \t]+)\(/);
    let protectedLine = line;
    // texmath treats any parenthesis after \] as an equation number, even across blank lines.
    if (inlineMathProse && sameLineParenthetical) {
      protectedLine = `${prefix}${sameLineParenthetical[1]}&#40;${markdown.slice(sameLineParenthetical[0].length)}`;
    } else if (inlineMathProse && standaloneParenthetical
      && previousNonblank?.closesBracketMath
      && previousNonblank.quoteDepth === quoteDepth) {
      protectedLine = `${prefix}${standaloneParenthetical[1]}&#40;${markdown.slice(standaloneParenthetical[0].length)}`;
    }

    previousNonblank = markdown.trim()
      ? { quoteDepth, closesBracketMath: /^\\\][ \t]*$/.test(markdown) }
      : previousNonblank;
    return protectedLine;
  }).join("");
}

function createMarkdownParser(source?: RenderNoteSource): MarkdownParser {
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
  md.use(footnote).use(sub).use(sup).use(taskLists, { enabled: true });
  md.use(texmath, {
    engine: katex,
    delimiters: ["dollars", "brackets", "beg_end"],
    katexOptions: { throwOnError: false, strict: "ignore", output: "html" },
  });
  md.block.ruler.before("paragraph", "notebooks_display_math_interrupt", (state, startLine, endLine, silent) => {
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];
    const opening = state.src.slice(start, end);
    const closingPattern = /^\\\[[ \t]*$/.test(opening)
      ? /^\\\][ \t]*$/
      : /^\$\$[ \t]*$/.test(opening)
        ? /^\$\$[ \t]*$/
        : null;
    if (!closingPattern) return false;

    let fence: { character: string; length: number } | null = null;
    for (let line = startLine + 1; line < endLine; line += 1) {
      const lineStart = state.bMarks[line] + state.tShift[line];
      const lineEnd = state.eMarks[line];
      const content = state.src.slice(lineStart, lineEnd);
      if (fence) {
        const closingFence = content.match(/^ {0,3}(`+|~+)[ \t]*$/);
        if (closingFence
          && closingFence[1][0] === fence.character
          && closingFence[1].length >= fence.length) {
          fence = null;
        }
        continue;
      }

      const fenceMarker = content.match(/^ {0,3}(`{3,}|~{3,})/);
      if (fenceMarker) {
        fence = { character: fenceMarker[1][0], length: fenceMarker[1].length };
        continue;
      }

      if (closingPattern.test(content)) return silent;
    }

    return false;
  }, { alt: ["paragraph"] });
  md.core.ruler.before("inline", "notebooks_math_source", (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "inline") continue;
      token.content = replaceOutsideInlineCode(token.content, normalizeInlineMathSource);

      const displayMath = token.content.match(/^\s*\$\$([\s\S]*?)\$\$\s*$/);
      if (!displayMath
        || state.tokens[index - 1]?.type !== "paragraph_open"
        || state.tokens[index + 1]?.type !== "paragraph_close") continue;

      const paragraph = state.tokens[index - 1];
      const math = new state.Token("math_block", "math", 0);
      math.block = true;
      math.tag = "$$";
      math.content = displayMath[1].trim();
      math.map = paragraph.map;
      math.level = paragraph.level;
      state.tokens.splice(index - 1, 3, math);
      index -= 1;
    }
  });

  md.block.ruler.before("paragraph", "notebooks_standalone_callout", (state, startLine, _endLine, silent) => {
    if (state.level !== 0 || state.blkIndent !== 0
      || (state.parentType !== "root" && state.parentType !== "paragraph")) return false;
    const start = state.bMarks[startLine] + state.tShift[startLine];
    const end = state.eMarks[startLine];
    const match = state.src.slice(start, end).match(/^\[!([a-zA-Z][a-zA-Z0-9_-]*)\]([+-])?\s*(.*)$/);
    if (!match) return false;
    if (silent) return true;

    const rawType = match[1].toLowerCase().replace(/_/g, "-");
    const open = state.push("blockquote_open", "blockquote", 1);
    open.block = true;
    open.map = [startLine, startLine + 1];
    open.attrJoin("class", "callout");
    open.attrSet("data-type", normalizeCalloutType(rawType));
    open.meta = { calloutTitle: calloutLabel(rawType), standaloneCallout: true };

    const paragraphOpen = state.push("paragraph_open", "p", 1);
    paragraphOpen.map = [startLine, startLine + 1];
    const inline = state.push("inline", "", 0);
    inline.content = match[3];
    inline.map = [startLine, startLine + 1];
    inline.children = [];
    state.push("paragraph_close", "p", -1);

    const close = state.push("blockquote_close", "blockquote", -1);
    close.block = true;
    close.map = [startLine, startLine + 1];
    state.line = startLine + 1;
    return true;
  }, { alt: ["paragraph"] });

  md.core.ruler.push("notebooks_callouts", (state) => {
    const tokens = state.tokens;
    for (let index = 0; index < tokens.length; index += 1) {
      const open = tokens[index];
      if (open.type !== "blockquote_open") continue;

      let nestedBlockquotes = 0;
      let inline: import("markdown-it").Token | undefined;
      for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
        const token = tokens[cursor];
        if (token.type === "blockquote_open") {
          nestedBlockquotes += 1;
        } else if (token.type === "blockquote_close") {
          if (nestedBlockquotes === 0) break;
          nestedBlockquotes -= 1;
        } else if (token.type === "inline" && nestedBlockquotes === 0) {
          inline = token;
          break;
        }
      }
      if (open.meta?.standaloneCallout === true && inline) {
        const titleToken = new state.Token("html_inline", "", 0);
        titleToken.content = `<span class="callout-title">${state.md.utils.escapeHtml(String(open.meta.calloutTitle))}</span>`;
        inline.children = [titleToken, ...(inline.children ?? [])];
        continue;
      }

      const match = inline?.content.match(/^\s*\[!([A-Z0-9_-]+)\]([+-])?(?:[ \t]+([^\r\n]*))?/i);
      if (!inline || !match) continue;

      const rawType = match[1].toLowerCase().replace(/_/g, "-");
      const type = normalizeCalloutType(rawType);
      open.attrJoin("class", "callout");
      open.attrSet("data-type", type);
      const title = match[3]?.trim() || calloutLabel(rawType);
      open.meta = { ...open.meta, calloutTitle: title };
      const titleToken = new state.Token("html_inline", "", 0);
      titleToken.content = `<span class="callout-title">${md.renderInline(title)}</span>`;
      inline.content = inline.content.replace(match[0], "").replace(/^\s+/, "");
      inline.children = md.parseInline(inline.content, {}).flatMap((token) => token.children ?? []);
      inline.children = [titleToken, ...(inline.children ?? [])];
    }
  });

  md.core.ruler.push("notebooks_obsidian_inline", (state) => {
    for (let index = 0; index < state.tokens.length; index += 1) {
      const token = state.tokens[index];
      if (token.type !== "inline" || !token.children) continue;

      let nestedItems = 0;
      let item: import("markdown-it").Token | undefined;
      for (let previous = index - 1; previous >= 0; previous -= 1) {
        if (state.tokens[previous].type === "list_item_close") nestedItems += 1;
        if (state.tokens[previous].type === "list_item_open") {
          if (nestedItems === 0) {
            item = state.tokens[previous];
            break;
          }
          nestedItems -= 1;
        }
      }
      const firstText = token.children.find((child) => child.type === "text");
      const task = firstText?.content.match(/^\[([ xX/\\\-<>!?iIbB])\]\s+/);
      if (item && firstText && task) {
        const states: Record<string, string> = {
          " ": "todo",
          x: "done",
          "/": "in-progress",
          "-": "cancelled",
          ">": "scheduled",
          "<": "rescheduled",
          "!": "important",
          "?": "question",
          i: "info",
          b: "bookmark",
        };
        const status = states[task[1].toLowerCase()];
        item.attrJoin("class", "task-list-item");
        firstText.content = firstText.content.slice(task[0].length);
        token.content = token.content.slice(task[0].length);
        const checkbox = new state.Token("html_inline", "", 0);
        checkbox.content = `<input class="task-list-checkbox" type="checkbox" disabled data-task="${status}"${status === "done" ? " checked" : ""} aria-label="${status}">`;
        token.children.unshift(checkbox);
      }

      const transformed: import("markdown-it").Token[] = [];
      for (const child of token.children) {
        if (child.type !== "text") {
          transformed.push(child);
          continue;
        }
        const result = obsidianInlineHtml(child.content, source, md);
        if (result.html) {
          const htmlToken = new state.Token("html_inline", "", 0);
          htmlToken.content = result.html;
          htmlToken.meta = { ...htmlToken.meta, obsidianText: result.text };
          transformed.push(htmlToken);
        }
      }
      token.children = transformed;
    }
  });

  const renderFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase();
    if (language === "mermaid" || language === "tikz" || language === "desmos" || language === "desmos3d") {
      const renderEnv = (env ?? {}) as { figureIndex?: number; figures?: Array<Omit<NoteFigure, "sectionId">> };
      const figureIndex = (renderEnv.figureIndex ?? 0) + 1;
      renderEnv.figureIndex = figureIndex;
      const id = `figure-${figureIndex}`;
      const escaped = stateEscape(token.content);
      if (Array.isArray(renderEnv.figures)) {
        renderEnv.figures.push({ id, type: language, source: token.content });
      }
      if (language === "mermaid") {
        const firstDirective = token.content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && !line.startsWith("%%"));
        const diagramType = /^mindmap(?:\s|$)/i.test(firstDirective ?? "") ? "mindmap" : "mermaid";
        return `<div class="obsidian-mermaid mermaid" data-figure-id="${id}" data-diagram-type="${diagramType}">${escaped}</div>\n`;
      }
      if (language === "desmos") {
        return `<div class="obsidian-desmos" data-figure-id="${id}"><div class="desmos-loading">Loading Desmos graph…</div><pre class="desmos-source" hidden>${escaped}</pre></div>\n`;
      }
      if (language === "desmos3d") {
        return `<div class="obsidian-desmos3d" data-figure-id="${id}"><div class="desmos-loading">Loading Desmos 3D graph…</div><pre class="desmos-source" hidden>${escaped}</pre></div>\n`;
      }
      return `<div class="tikz-wrapper" data-figure-id="${id}"><div class="tikz-loading">Rendering diagram…</div><div class="tikz-source" hidden>${escaped}</div></div>\n`;
    }
    return renderFence
      ? renderFence(tokens, index, options, env, renderer)
      : renderer.renderToken(tokens, index, options);
  };

  return md;
}

function resolveRepositoryPath(path: string, filePath: string): string | null {
  const segments = path.startsWith("/") ? [] : filePath.split("/").slice(0, -1);
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.length ? segments.join("/") : null;
}

export function rewriteSourceUrl(value: string, source: RenderNoteSource, isImage: boolean): string {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return value;
  const [cleanPath, fragment] = value.split("#", 2);
  const resolvedPath = resolveRepositoryPath(cleanPath, source.filePath);
  if (!resolvedPath) return value;
  const isMedia = /\.(?:bmp|gif|ico|jpe?g|mp3|mp4|ogg|pdf|png|svg|wav|webm|webp)$/i.test(resolvedPath);
  if (isImage || isMedia) {
    const params = new URLSearchParams({
      owner: source.owner,
      repo: source.repository,
      path: resolvedPath,
    });
    return `/api/media?${params.toString()}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
  }
  const path = resolvedPath.split("/").map(encodeURIComponent).join("/");
  const branch = source.branch.split("/").map(encodeURIComponent).join("/");
  return `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/blob/${branch}/${path}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
}

function stateEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function plainInlineText(tokens: import("markdown-it").Token[]): string {
  return tokens.flatMap((token) => {
    const calloutTitle = token.meta?.calloutTitle;
    if (typeof calloutTitle === "string") return [calloutTitle];
    const obsidianText = token.meta?.obsidianText;
    if (typeof obsidianText === "string") return [obsidianText];
    if (token.type === "inline") return plainInlineText(token.children ?? []);
    if (token.type === "math_inline" || token.type === "math_block") return [];
    if (token.type === "image") return [token.content];
    if (token.type === "softbreak" || token.type === "hardbreak") return [" "];
    if (token.type === "text" || token.type === "code_inline") return [token.content];
    return [];
  }).join("").replace(/\s+/g, " ").trim();
}

function splitBlocks(tokens: import("markdown-it").Token[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.level !== 0) {
      index += 1;
      continue;
    }
    const start = index;
    if (token.nesting === 1) {
      let depth = 1;
      index += 1;
      while (index < tokens.length && depth > 0) {
        const current = tokens[index];
        if (current.level === 0) depth += current.nesting;
        index += 1;
      }
    } else {
      index += 1;
    }
    blocks.push({ tokens: tokens.slice(start, index) });
  }
  return blocks;
}

function headingFromBlock(block: Block): { level: number; title: string; number?: string } | null {
  const opening = block.tokens[0];
  if (!opening || !/^heading_open$/.test(opening.type)) return null;
  const level = Number(opening.tag.slice(1));
  const inline = block.tokens.find((token) => token.type === "inline");
  const rawTitle = inline ? plainInlineText(inline.children ?? []) : "";
  const numberedTitle = rawTitle.match(/^\s*(?:§\s*)?(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/);
  return {
    level,
    title: numberedTitle?.[2] ?? rawTitle,
    number: numberedTitle?.[1],
  };
}

function slugify(title: string): string {
  return title.toLowerCase().normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "") || "section";
}

function addIdsAndCollect(
  blocks: Block[],
  md: MarkdownParser,
  searchIndex: NoteSearchBlock[],
  figures: NoteFigure[],
): { preamble: string; sections: SectionNode[] } {
  const root: ContentNode[] = [];
  const sectionStack: SectionNode[] = [];
  const idCounts = new Map<string, number>();
  const env = { figureIndex: 0, figures: [] as Array<Omit<NoteFigure, "sectionId">> };
  let blockNumber = 0;

  for (const block of blocks) {
    const heading = headingFromBlock(block);
    if (heading) {
      const level = Math.min(heading.level, 4);
      while (sectionStack.length && sectionStack.at(-1)!.level >= level) sectionStack.pop();
      const siblings = sectionStack.at(-1)?.children ?? [];
      const count = siblings.length + 1;
      const generatedNumber = sectionStack.at(-1) ? `${sectionStack.at(-1)!.number}.${count}` : String(count);
      const number = heading.number ?? generatedNumber;
      const base = slugify(heading.title);
      const occurrence = (idCounts.get(base) ?? 0) + 1;
      idCounts.set(base, occurrence);
      const id = occurrence === 1 ? base : `${base}-${occurrence}`;
      const headingToken = block.tokens[0];
      headingToken.attrSet("id", id);
      headingToken.attrSet("data-section-id", id);
      headingToken.attrSet("data-block-id", `${id}-heading`);
      const headingHtml = md.renderer.render(block.tokens, md.options, env);
      const section: SectionNode = {
        id,
        number,
        title: heading.title || "Untitled section",
        level,
        children: [],
        headingHtml,
        content: [],
      };
      if (sectionStack.length) {
        const parent = sectionStack.at(-1)!;
        parent.children.push(section);
        parent.content.push({ type: "section", section });
      } else {
        root.push({ type: "section", section });
      }
      sectionStack.push(section);
      searchIndex.push({ sectionId: id, blockId: `${id}-heading`, text: heading.title });
      continue;
    }

    blockNumber += 1;
    const section = sectionStack.at(-1);
    const sectionId = section?.id ?? "preamble";
    const blockId = `${sectionId}-block-${blockNumber}`;
    const blockHtml = md.renderer.render(block.tokens, md.options, env);
    const wrappedHtml = `<div class="note-block" data-section-id="${sectionId}" data-block-id="${blockId}">${blockHtml}</div>`;
    if (section) section.content.push({ type: "html", html: wrappedHtml });
    else root.push({ type: "html", html: wrappedHtml });

    const text = plainInlineText(block.tokens);
    if (text) {
      searchIndex.push({ sectionId, blockId, text });
    }
    for (const figure of env.figures.splice(0)) {
      figures.push({ ...figure, sectionId: section?.id ?? null });
    }
  }

  return {
    preamble: renderNodes(root.filter((node) => node.type === "html")),
    sections: root.flatMap((node) => node.type === "section" ? [node.section] : []),
  };
}

function renderNodes(nodes: ContentNode[]): string {
  return nodes.map((node) => {
    if (node.type === "html") return node.html;
    const section = node.section;
    const body = section.content.map((child) => child.type === "html"
      ? child.html
      : renderNodes([child])).join("");
    return `<section class="note-section" data-level="${section.level}" data-id="${section.id}" data-n="${section.number}">${section.headingHtml}${body}</section>`;
  }).join("");
}

function toTree(sections: SectionNode[]): NoteSection[] {
  return sections.map(({ id, number, title, level, children }) => ({
    id,
    number,
    title,
    level,
    children: toTree(children),
  }));
}

export function renderNote(markdown: string, sourceInfo?: RenderNoteSource): RenderedNote {
  const md = createMarkdownParser(sourceInfo);
  if (sourceInfo) {
    const originalLinkOpen = md.renderer.rules.link_open;
    md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
      const href = tokens[index].attrGet("href");
      if (typeof href === "string") tokens[index].attrSet("href", rewriteSourceUrl(href, sourceInfo, false));
      return originalLinkOpen
        ? originalLinkOpen(tokens, index, options, env, renderer)
        : renderer.renderToken(tokens, index, options);
    };
    md.renderer.rules.image = (tokens, index, options, env, renderer) => {
      const src = tokens[index].attrGet("src");
      if (typeof src === "string") tokens[index].attrSet("src", rewriteSourceUrl(src, sourceInfo, true));
      return renderer.renderToken(tokens, index, options);
    };
  }
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  const tokens = md.parse(protectBracketMathFromProseEquationNumbers(protectTableMathPipes(body)), {});
  const searchIndex: NoteSearchBlock[] = [];
  const figures: NoteFigure[] = [];
  const { preamble, sections } = addIdsAndCollect(splitBlocks(tokens), md, searchIndex, figures);
  const html = `${preamble}${renderNodes(sections.map((section) => ({ type: "section", section })))}`;
  return {
    html: html.replace(
      /(<input\b[^>]*class="task-list-item-checkbox"[^>]*?)(?<!\s)(checked|type)=/g,
      "$1 $2=",
    ),
    tree: toTree(sections),
    searchIndex,
    figures,
  };
}
