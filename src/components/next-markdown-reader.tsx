"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import type { NoteSearchBlock, NoteSection } from "@/lib/markdown/renderer";
import { isAiTier, type AiTier } from "@/lib/ai-tiers";
import { createWildcardMatcher } from "@/lib/markdown/search";
import { withDesmosTheme } from "@/lib/desmos-theme";
import type { ReaderChatPanelProps } from "@/components/reader-chat-panel";
import type { ReaderFile } from "@/lib/reader-types";

type ReaderWindow = Window & {
  Desmos?: {
    __notebooksUnavailable?: boolean;
    enabledFeatures?: { Calculator3D?: boolean };
    DragModes?: Record<string, unknown>;
    GraphingCalculator: (
      element: HTMLElement,
      options?: Record<string, boolean>,
    ) => DesmosCalculator;
    Calculator3D?: (
      element: HTMLElement,
      options?: Record<string, boolean>,
    ) => DesmosCalculator;
  };
  NoteBooksMarkdownVendors?: { ensureFor: (root: Element) => Promise<void> };
  obsidianInitTikz?: (root?: Element) => void;
  obsidianInitMermaid?: (root?: Element) => void | Promise<void>;
};

type DesmosCalculator = {
  expressionAnalysis?: Record<string, { isError?: boolean; errorMessage?: string }>;
  updateSettings?: (settings: Record<string, string | boolean>) => void;
  setExpressions?: (expressions: unknown[]) => void;
  setMathBounds?: (bounds: Record<string, number>) => void;
  setCamera?: (camera: { azimuth: number; elevation: number; zoom?: number }) => void;
  destroy?: () => void;
};

type SectionPosition = { section: NoteSection; parent: NoteSection | null };

const AI_TIER_PREFERENCE_KEY = "notebooks:reader:ai-tier:v1";
function lockDesmosExpressions<T extends object>(expressions: T[]): Array<T & { readonly: true }> {
  return expressions.map((expression) => ({ ...expression, readonly: true }));
}

async function getDesmosExpressionErrors(
  calculator: DesmosCalculator,
  expressions: Array<{ id: string; type?: string }>,
  isActive: () => boolean,
): Promise<string[]> {
  const ids = expressions
    .filter((expression) => expression.type !== "text" && expression.type !== "table")
    .map((expression) => expression.id);
  if (!ids.length) return [];
  if (!("expressionAnalysis" in calculator)) return [];

  const deadline = Date.now() + 2500;
  let analysis = calculator.expressionAnalysis;
  while (
    (!analysis || !ids.every((id) => Object.hasOwn(analysis ?? {}, id)))
    && Date.now() < deadline
  ) {
    await new Promise((resolve) => window.setTimeout(resolve, 50));
    if (!isActive()) return [];
    analysis = calculator.expressionAnalysis;
  }
  const resolvedAnalysis = analysis;
  if (!isActive() || !resolvedAnalysis) return [];
  return ids.flatMap((id) => {
    const result = resolvedAnalysis[id];
    return result?.isError
      ? [`${id}: ${result.errorMessage || "Desmos reports that this expression is invalid."}`]
      : [];
  });
}

const scriptLoads = new Map<string, Promise<void>>();
const READER_PREFERENCE_EVENT = "notebooks:reader-preference-change";
const readerPreferenceFallback = new Map<string, string>();

function hasWebGL(): boolean {
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const loseContext = context?.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    return Boolean(context);
  } catch (error) {
    console.error("Could not check WebGL support for Desmos 3D", error);
    return false;
  }
}

function subscribeToReaderPreferences(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(READER_PREFERENCE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(READER_PREFERENCE_EVENT, listener);
  };
}

function subscribeToReaderViewport(listener: () => void): () => void {
  window.addEventListener("resize", listener, { passive: true });
  return () => window.removeEventListener("resize", listener);
}

function isChatCompactViewport(): boolean {
  return window.matchMedia("(max-width: 1599px)").matches;
}

function isOutlineCompactViewport(): boolean {
  return window.matchMedia("(max-width: 1099px)").matches;
}

function getDefaultWideViewport(): boolean {
  return false;
}

function readReaderPreference(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? readerPreferenceFallback.get(key) ?? null;
  } catch (error) {
    console.error("Could not read a reader preference", error);
    return readerPreferenceFallback.get(key) ?? null;
  }
}

function writeReaderPreference(key: string, value: string): void {
  readerPreferenceFallback.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error("Could not save a reader preference", error);
  }
  window.dispatchEvent(new Event(READER_PREFERENCE_EVENT));
}

function readOutlineOpen(): boolean {
  return readReaderPreference("notebooks:reader:outline") !== "closed";
}

function readSearchMode(): "outline" | "notes" {
  return readReaderPreference("notebooks:reader:search-mode") === "notes" ? "notes" : "outline";
}

function readAiTier(): AiTier {
  const tier = readReaderPreference(AI_TIER_PREFERENCE_KEY);
  return isAiTier(tier) ? tier : "low";
}

function getDefaultAiTier(): AiTier {
  return "low";
}

function readFontScale(key: string): number {
  const saved = Number(readReaderPreference(key));
  return Number.isFinite(saved) && saved >= 0.85 && saved <= 1.25 ? saved : 1;
}

function getDefaultOutlineOpen(): boolean {
  return true;
}

function getDefaultSearchMode(): "outline" | "notes" {
  return "outline";
}

function getDefaultFontScale(): number {
  return 1;
}

function loadScript(source: string, timeoutMs = 0): Promise<void> {
  const pending = scriptLoads.get(source);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-reader-runtime="${source}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }
    const script = existing ?? document.createElement("script");
    let timeout: number | null = null;
    const clearTimeoutIfNeeded = () => {
      if (timeout !== null) window.clearTimeout(timeout);
    };
    script.dataset.readerRuntime = source;
    script.onload = () => {
      clearTimeoutIfNeeded();
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      clearTimeoutIfNeeded();
      script.remove();
      scriptLoads.delete(source);
      reject(new Error(`Unable to load reader feature script: ${source}`));
    };
    if (timeoutMs > 0) {
      timeout = window.setTimeout(() => {
        script.remove();
        scriptLoads.delete(source);
        reject(new Error(`Timed out loading reader feature script: ${source}`));
      }, timeoutMs);
    }
    if (!existing) {
      script.src = source;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  scriptLoads.set(source, promise);
  return promise;
}

async function waitForReaderLayout(root: HTMLElement): Promise<boolean> {
  const diagrams = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-mermaid:not([data-diagram-deferred]), .tikz-wrapper, .obsidian-desmos, .obsidian-desmos3d"));
  const deadline = Date.now() + 8000;
  let previousHeight = -1;
  let stableSince = Date.now();
  while (Date.now() < deadline) {
    const height = document.documentElement.scrollHeight;
    const diagramsReady = diagrams.every((diagram) => diagram.querySelector("svg, .tikz-error, .dcg-container, .desmos-error"));
    const fontsReady = document.fonts.status === "loaded";
    if (diagramsReady && fontsReady && height === previousHeight && Date.now() - stableSince >= 300) return true;
    if (!diagramsReady || !fontsReady || height !== previousHeight) {
      previousHeight = height;
      stableSince = Date.now();
    }
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  return false;
}

function flattenTree(tree: NoteSection[], parent: NoteSection | null = null): SectionPosition[] {
  return tree.flatMap((section) => [
    { section, parent },
    ...flattenTree(section.children, section),
  ]);
}

function findSection(tree: NoteSection[], id: string): NoteSection | null {
  for (const section of tree) {
    if (section.id === id) return section;
    const nested = findSection(section.children, id);
    if (nested) return nested;
  }
  return null;
}

function rootSection(tree: NoteSection[], target: NoteSection | null): NoteSection | null {
  if (!target) return tree[0] ?? null;
  for (const section of tree) {
    if (section.id === target.id || findSection(section.children, target.id)) return section;
  }
  return tree[0] ?? null;
}

function outlineHref(file: ReaderFile): string {
  return `https://github.com/${encodeURIComponent(file.owner)}/${encodeURIComponent(file.repository)}/blob/${file.branch.split("/").map(encodeURIComponent).join("/")}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
}

function SearchHighlight({ query, root }: { query: string; root: HTMLElement | null }) {
  useEffect(() => {
    if (!root) return;
    const matcher = createWildcardMatcher(query);
    const css = CSS as typeof CSS & { highlights?: { set: (name: string, value: unknown) => void; delete: (name: string) => void } };
    const HighlightCtor = (window as Window & { Highlight?: new (...ranges: Range[]) => unknown }).Highlight;
    if (!matcher) {
      css.highlights?.delete("reader-search");
      return;
    }

    let cleanup = () => {};
    const timer = window.setTimeout(() => {
      const ranges: Range[] = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => node.parentElement?.closest("pre, code, .katex, .katex-display") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const text = node.textContent ?? "";
        matcher.lastIndex = 0;
        for (const match of text.matchAll(new RegExp(matcher.source, "ig"))) {
          if (!match[0]) continue;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          ranges.push(range);
        }
      }

      if (css.highlights && HighlightCtor) {
        css.highlights.set("reader-search", new HighlightCtor(...ranges));
        cleanup = () => { css.highlights?.delete("reader-search"); };
        return;
      }

      const marks: HTMLElement[] = [];
      for (const range of ranges.reverse()) {
        const mark = document.createElement("mark");
        try {
          range.surroundContents(mark);
          marks.push(mark);
        } catch (error) {
          console.error("Could not highlight a search match", error);
        }
      }
      cleanup = () => {
        for (const mark of marks) {
          const parent = mark.parentNode;
          mark.replaceWith(...Array.from(mark.childNodes));
          parent?.normalize();
        }
      };
    }, 140);

    return () => {
      window.clearTimeout(timer);
      cleanup();
    };
  }, [query, root]);

  return null;
}

function SearchResultButton({
  blockId,
  onJump,
  sectionId,
  sectionNumber,
  text,
}: {
  blockId: string;
  onJump: (blockId: string, sectionId: string) => void;
  sectionId: string;
  sectionNumber?: string;
  text: string;
}) {
  return (
    <button type="button" onClick={() => onJump(blockId, sectionId)}>
      {sectionNumber && <span>{sectionNumber}</span>}
      {text.slice(0, 130)}
    </button>
  );
}

export function NextMarkdownReader({
  backHref,
  file,
  html,
  readerFontClassName,
  searchIndex,
  tree,
}: {
  backHref: string;
  file: ReaderFile;
  html: string;
  readerFontClassName: string;
  searchIndex: NoteSearchBlock[];
  tree: NoteSection[];
}) {
  const contentRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const diagramInitializationRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const searchHighlightTimerRef = useRef<number | null>(null);
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
  const outlineOpen = useSyncExternalStore(
    subscribeToReaderPreferences,
    readOutlineOpen,
    getDefaultOutlineOpen,
  );
  const isChatCompact = useSyncExternalStore(
    subscribeToReaderViewport,
    isChatCompactViewport,
    getDefaultWideViewport,
  );
  const isOutlineCompact = useSyncExternalStore(
    subscribeToReaderViewport,
    isOutlineCompactViewport,
    getDefaultWideViewport,
  );
  const [compactOutlineOpen, setCompactOutlineOpen] = useState(false);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [ChatPanel, setChatPanel] = useState<ComponentType<ReaderChatPanelProps> | null>(null);
  const [chatPanelLoadFailed, setChatPanelLoadFailed] = useState(false);
  const effectiveOutlineOpen = isOutlineCompact ? compactOutlineOpen : outlineOpen;
  const isChatExpanded = isChatCompact && chatExpanded;
  const shouldRenderChatPanel = !isChatCompact || isChatExpanded;
  const [activeSectionId, setActiveSectionId] = useState(tree[0]?.id ?? "");
  const searchMode = useSyncExternalStore(
    subscribeToReaderPreferences,
    readSearchMode,
    getDefaultSearchMode,
  );
  const aiTier = useSyncExternalStore(
    subscribeToReaderPreferences,
    readAiTier,
    getDefaultAiTier,
  );
  const [query, setQuery] = useState("");
  const hasSearchQuery = query.trim().length > 0;
  const [aiNotice, setAiNotice] = useState("");
  const [currentSearchMatchId, setCurrentSearchMatchId] = useState<string | null>(null);
  const fontPreferenceKey = `notebooks:reader-font:${file.owner}/${file.repository}/${file.path}`;
  const fontScale = useSyncExternalStore(
    subscribeToReaderPreferences,
    () => readFontScale(fontPreferenceKey),
    getDefaultFontScale,
  );
  const [sepia, setSepia] = useState(false);
  const [readingProgress, setReadingProgress] = useState(0);
  const setFontScale = useCallback((update: number | ((scale: number) => number)) => {
    const current = readFontScale(fontPreferenceKey);
    const next = typeof update === "function" ? update(current) : update;
    writeReaderPreference(fontPreferenceKey, String(next));
  }, [fontPreferenceKey]);
  const setSearchMode = useCallback((mode: "outline" | "notes") => {
    writeReaderPreference("notebooks:reader:search-mode", mode);
  }, []);

  useEffect(() => {
    if ((isChatCompactViewport() && !isChatExpanded) || ChatPanel) return;
    let active = true;
    void import("./reader-chat-panel")
      .then(({ ReaderChatPanel }) => {
        if (active) setChatPanel(() => ReaderChatPanel);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Could not load the reader chat panel", error);
        setChatPanelLoadFailed(true);
      });
    return () => { active = false; };
  }, [ChatPanel, isChatExpanded]);

  useEffect(() => {
    if (!contentElement?.querySelector(".katex, .katex-display")) return;
    let active = true;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void import("katex/dist/katex.min.css").catch((error: unknown) => {
          if (!active) return;
          console.error("Could not load note math styles", error);
          setAiNotice("Some equations could not be styled. Please reload the note.");
        });
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [contentElement, html]);

  const flattened = useMemo(() => flattenTree(tree), [tree]);
  const activeSection = findSection(tree, activeSectionId);
  const currentRoot = rootSection(tree, activeSection);
  const rootIndex = currentRoot ? tree.findIndex((section) => section.id === currentRoot.id) : 0;
  const matcher = useMemo(() => createWildcardMatcher(query.trim()), [query]);
  const matches = useMemo(() => {
    if (!hasSearchQuery || !matcher) return [];
    if (searchMode === "outline") {
      return flattened
        .filter(({ section }) => matcher.test(`${section.number} ${section.title}`))
        .slice(0, 200)
        .map(({ section }) => ({ sectionId: section.id, blockId: `${section.id}-heading`, text: `${section.number} ${section.title}` }));
    }
    return searchIndex.filter((block) => matcher.test(block.text)).slice(0, 200);
  }, [flattened, hasSearchQuery, matcher, searchIndex, searchMode]);
  const groupedMatches = useMemo(() => {
    const groups = new Map<string, NoteSearchBlock[]>();
    for (const match of matches) {
      const blocks = groups.get(match.sectionId) ?? [];
      blocks.push(match);
      groups.set(match.sectionId, blocks);
    }
    return Array.from(groups, ([sectionId, blocks]) => ({ sectionId, blocks }));
  }, [matches]);

  const jumpTo = useCallback((blockId: string, sectionId: string) => {
    setActiveSectionId(sectionId);
    setCurrentSearchMatchId(blockId);
    const root = contentRef.current;
    const target = root?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"], [data-section-id="${CSS.escape(sectionId)}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    root?.querySelectorAll(".reader-search-current").forEach((element) => element.classList.remove("reader-search-current"));
    if (searchHighlightTimerRef.current !== null) window.clearTimeout(searchHighlightTimerRef.current);
    target?.classList.add("reader-search-current");
    if (target) {
      searchHighlightTimerRef.current = window.setTimeout(() => {
        target.classList.remove("reader-search-current");
        searchHighlightTimerRef.current = null;
      }, 1600);
    }
  }, []);

  const toggleOutline = useCallback(() => {
    if (isOutlineCompactViewport()) {
      setCompactOutlineOpen((open) => {
        const next = !open;
        if (next) setChatExpanded(false);
        return next;
      });
      return;
    }
    const next = !readOutlineOpen();
    document.documentElement.dataset.readerOutline = next ? "open" : "closed";
    writeReaderPreference("notebooks:reader:outline", next ? "open" : "closed");
  }, []);

  useEffect(() => {
    const closeChatAtWideViewport = () => {
      if (!isChatCompactViewport()) setChatExpanded(false);
    };
    window.addEventListener("resize", closeChatAtWideViewport, { passive: true });
    return () => window.removeEventListener("resize", closeChatAtWideViewport);
  }, []);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>(
      ".note-section[data-id] > h1, .note-section[data-id] > h2, .note-section[data-id] > h3, .note-section[data-id] > h4, .note-section[data-id] > h5, .note-section[data-id] > h6",
    ));
    if (!headings.length) return;
    let frame: number | null = null;
    const updateActiveSection = () => {
      const focusLine = window.innerHeight * 0.3;
      let low = 0;
      let high = headings.length - 1;
      let activeHeading: HTMLElement | null = null;
      let nextHeading: HTMLElement | null = null;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const heading = headings[middle];
        if (heading.getBoundingClientRect().top <= focusLine) {
          activeHeading = heading;
          low = middle + 1;
        } else {
          nextHeading = heading;
          high = middle - 1;
        }
      }
      const section = (activeHeading ?? nextHeading)?.closest<HTMLElement>(".note-section[data-id]");
      if (section?.dataset.id) setActiveSectionId(section.dataset.id);
    };
    const scheduleUpdate = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        updateActiveSection();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(root);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    scheduleUpdate();
    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [contentElement, html]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const positions = new Map(flattened.map((position) => [position.section.id, position]));
    const currentIds = new Set<string>();
    let position = positions.get(activeSectionId);
    while (position) {
      currentIds.add(position.section.id);
      position = position.parent ? positions.get(position.parent.id) : undefined;
    }
    root.querySelectorAll<HTMLElement>(".note-section[data-id]").forEach((section) => {
      section.classList.toggle("is-current-bracket", currentIds.has(section.dataset.id ?? ""));
    });
  }, [activeSectionId, contentElement, flattened]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const blocks = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-mermaid"));
    if (!blocks.length) return;

    let active = true;
    const listeners = blocks.map((block) => {
      const details = document.createElement("details");
      details.className = "reader-diagram-disclosure";
      details.dataset.readerDiagram = "mermaid";
      const reservedHeight = Math.ceil(block.getBoundingClientRect().height);
      if (reservedHeight > 0) details.style.minHeight = `${reservedHeight}px`;

      const summary = document.createElement("summary");
      summary.textContent = "Load interactive diagram";
      block.setAttribute("data-diagram-deferred", "");
      block.parentElement?.insertBefore(details, block);
      details.append(summary, block);

      let loading = false;
      const onToggle = () => {
        if (!details.open || loading || block.dataset.diagramReady === "true") return;
        loading = true;
        summary.textContent = "Loading diagram…";
        block.removeAttribute("data-diagram-deferred");
        void (async () => {
          try {
            await Promise.all([
              loadScript("/js/markdown-vendors.js"),
              loadScript("/js/obsidian-markdown-it.js"),
            ]);
            if (!active) return;
            const runtime = window as ReaderWindow;
            await runtime.NoteBooksMarkdownVendors?.ensureFor(details);
            if (!active) return;
            await runtime.obsidianInitMermaid?.(details);
            if (!active) return;
            if (!block.querySelector("svg")) throw new Error("The diagram did not produce an SVG.");
            block.dataset.diagramReady = "true";
            summary.textContent = "Interactive diagram";
          } catch (error) {
            if (!active) return;
            console.error("Could not load an interactive Mermaid diagram", error);
            block.setAttribute("data-diagram-deferred", "");
            summary.textContent = "Could not load diagram. Close and reopen to retry.";
          } finally {
            loading = false;
          }
        })();
      };
      details.addEventListener("toggle", onToggle);
      return () => {
        details.removeEventListener("toggle", onToggle);
        if (details.contains(block)) details.replaceWith(block);
        if (block.dataset.diagramReady !== "true") block.removeAttribute("data-diagram-deferred");
      };
    });

    return () => {
      active = false;
      listeners.forEach((removeListener) => removeListener());
    };
  }, [html]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) {
      diagramInitializationRef.current = Promise.resolve(true);
      return;
    }
    const hasTikzDiagrams = Boolean(root.querySelector(".tikz-wrapper"));
    const desmosBlocks = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-desmos"));
    const desmos3DBlocks = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-desmos3d"));
    if (!hasTikzDiagrams && !desmosBlocks.length && !desmos3DBlocks.length) {
      diagramInitializationRef.current = waitForReaderLayout(root);
      return;
    }
    let active = true;
    const calculators = new Map<HTMLElement, { destroy?: () => void }>();
    const createBlockErrorPanel = (title: string, details: string[]) => {
      const stage = document.createElement("div");
      stage.className = "desmos-error-stage";
      const overlay = document.createElement("div");
      overlay.className = "desmos-error";
      overlay.setAttribute("role", "alert");
      const card = document.createElement("div");
      card.className = "desmos-error-card";
      const icon = document.createElement("span");
      icon.className = "desmos-error-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "!";
      const heading = document.createElement("strong");
      heading.textContent = title;
      const message = document.createElement("p");
      message.textContent = "This graph could not be rendered.";
      card.append(icon, heading, message);
      if (details.length) {
        const disclosure = document.createElement("details");
        disclosure.className = "desmos-error-details";
        const summary = document.createElement("summary");
        summary.textContent = "Show details";
        const list = document.createElement("ul");
        details.forEach((detail) => {
          const item = document.createElement("li");
          item.textContent = detail;
          list.append(item);
        });
        disclosure.append(summary, list);
        card.append(disclosure);
      }
      overlay.append(card);
      stage.append(overlay);
      return stage;
    };
    const setBlockError = (block: HTMLElement, title: string, details: string[]) => {
      block.classList.add("has-desmos-error");
      block.replaceChildren(createBlockErrorPanel(title, details));
    };
    const appendBlockError = (block: HTMLElement, title: string, details: string[]) => {
      block.classList.add("has-desmos-error");
      block.append(createBlockErrorPanel(title, details));
    };
    diagramInitializationRef.current = (async () => {
      try {
        const runtime = window as ReaderWindow;
        if (hasTikzDiagrams) {
          await Promise.all([
            loadScript("/js/markdown-vendors.js"),
            loadScript("/js/obsidian-markdown-it.js"),
          ]);
          if (!active) return true;
          await runtime.NoteBooksMarkdownVendors?.ensureFor(root);
          if (!active) return true;
          runtime.obsidianInitTikz?.(root);
        }
        if (desmosBlocks.length) {
          const [{ compileDesmos2D }, { formatDesmosDiagnostic }] = await Promise.all([
            import("@/lib/desmos-2d"),
            import("@/lib/desmos-source"),
          ]);
          if (!active) return true;
          const compiledBlocks = desmosBlocks.map((block) => {
            const source = block.querySelector("pre.desmos-source")?.textContent ?? "";
            return { block, source, result: compileDesmos2D(source) };
          });
          compiledBlocks.forEach(({ block, source, result }) => {
            if (result.ok) return;
            setBlockError(block, "Malformed graph", result.diagnostics.map((entry) => formatDesmosDiagnostic(source, entry)));
          });
          const runnableBlocks = compiledBlocks.filter(({ result }) => result.ok);
          if (runnableBlocks.length) {
            await loadScript("/api/desmos.js", 30_000);
            if (!active) return true;
          }
          const desmos = runtime.Desmos;
          if (runnableBlocks.length && (!desmos?.GraphingCalculator || desmos.__notebooksUnavailable)) {
            runnableBlocks.forEach(({ block }) => setBlockError(block, "Desmos could not be loaded.", [
              "Check that DESMOS_API_KEY is configured and the Desmos API is reachable.",
            ]));
          } else if (runnableBlocks.length && desmos?.GraphingCalculator) {
            for (const entry of runnableBlocks) {
              const { block } = entry;
              if (!entry.result.ok) continue;
              try {
                const graph = document.createElement("div");
                graph.className = "desmos-calculator";
                block.replaceChildren(graph);
                const calculator = desmos.GraphingCalculator(
                  graph,
                  withDesmosTheme(entry.result.output.options, document.documentElement.dataset.mode),
                );
                const setExpressions = calculator.setExpressions;
                const updateSettings = calculator.updateSettings;
                const setMathBounds = calculator.setMathBounds;
                if (
                  typeof setExpressions !== "function"
                  || (entry.result.output.settings && typeof updateSettings !== "function")
                  || (entry.result.output.bounds && typeof setMathBounds !== "function")
                ) {
                  calculator.destroy?.();
                  setBlockError(block, "This Desmos graph needs unsupported API features.", [
                    ...(typeof setExpressions !== "function" ? ["This API build does not expose setExpressions()."] : []),
                    ...(entry.result.output.settings && typeof updateSettings !== "function" ? ["This API build does not expose updateSettings()."] : []),
                    ...(entry.result.output.bounds && typeof setMathBounds !== "function" ? ["This API build does not expose setMathBounds()."] : []),
                  ]);
                  continue;
                }
                try {
                  if (entry.result.output.settings && typeof updateSettings === "function") updateSettings.call(calculator, entry.result.output.settings);
                  setExpressions.call(calculator, lockDesmosExpressions(entry.result.output.expressions));
                  if (entry.result.output.bounds && typeof setMathBounds === "function") setMathBounds.call(calculator, entry.result.output.bounds);
                  calculators.set(block, calculator);
                  const expressionErrors = await getDesmosExpressionErrors(
                    calculator,
                    entry.result.output.expressions,
                    () => active,
                  );
                  if (expressionErrors.length) {
                    appendBlockError(block, "Malformed graph", expressionErrors);
                  }
                } catch (error) {
                  calculators.delete(block);
                  calculator.destroy?.();
                  throw error;
                }
              } catch (error) {
                console.error("Desmos block initialization failed", error);
                setBlockError(block, "This Desmos graph could not be initialized.", [
                  error instanceof Error ? error.message : String(error),
                ]);
              }
            }
          }
        }
        if (desmos3DBlocks.length) {
          const [{ compileDesmos3D }, { formatDesmosDiagnostic }] = await Promise.all([
            import("@/lib/desmos-3d"),
            import("@/lib/desmos-source"),
          ]);
          if (!active) return true;
          const compiledBlocks = desmos3DBlocks.map((block) => {
            const source = block.querySelector("pre.desmos-source")?.textContent ?? "";
            return { block, source, result: compileDesmos3D(source) };
          });
          compiledBlocks.forEach(({ block, source, result }) => {
            if (result.ok) return;
            setBlockError(block, "Malformed 3D graph", result.diagnostics.map((entry) => formatDesmosDiagnostic(source, entry)));
          });
          const runnableBlocks = compiledBlocks.filter(({ result }) => result.ok);
          if (runnableBlocks.length) {
            await loadScript("/api/desmos3d.js", 30_000);
            if (!active) return true;
          }
          const desmos = runtime.Desmos;
          if (runnableBlocks.length && !desmos?.Calculator3D) {
            const code = desmos?.enabledFeatures?.Calculator3D === false ? "This API key does not have the 3D calculator enabled." : "This Desmos API build does not expose a 3D calculator.";
            runnableBlocks.forEach(({ block }) => setBlockError(block, "Desmos 3D is unavailable.", [code]));
          } else if (runnableBlocks.length && !hasWebGL()) {
            runnableBlocks.forEach(({ block }) => setBlockError(block, "Desmos 3D needs WebGL.", [
              "WebGL is unavailable or disabled in this browser or device.",
            ]));
          } else if (runnableBlocks.length && desmos?.Calculator3D) {
            for (const entry of runnableBlocks) {
              const { block, result } = entry;
              if (!result.ok) continue;
              const calculatorHost = document.createElement("div");
              calculatorHost.className = "desmos3d-calculator";
              block.replaceChildren(calculatorHost);
              let calculator: DesmosCalculator | null = null;
              try {
                calculator = desmos.Calculator3D(
                  calculatorHost,
                  withDesmosTheme(result.output.options, document.documentElement.dataset.mode),
                );
                const setExpressions = calculator?.setExpressions;
                const updateSettings = calculator?.updateSettings;
                const setMathBounds = calculator?.setMathBounds;
                const setCamera = calculator?.setCamera;
                if (!calculator || typeof setExpressions !== "function") {
                  calculator.destroy?.();
                  setBlockError(block, "Desmos 3D could not be initialized.", [
                    "The calculator constructor did not return a valid calculator.",
                  ]);
                  continue;
                }
                const capabilityErrors: string[] = [
                  ...(result.output.settings && typeof updateSettings !== "function" ? ["Graph settings require updateSettings(), which this API build does not expose."] : []),
                  ...(result.output.bounds && typeof setMathBounds !== "function" ? ["%view requires setMathBounds(), which this API build does not expose."] : []),
                  ...(result.output.camera && typeof setCamera !== "function" ? ["%camera requires setCamera(), which this API build does not expose."] : []),
                ];
                const hasRequiredMethods =
                  (!result.output.settings || typeof updateSettings === "function")
                  && (!result.output.bounds || typeof setMathBounds === "function")
                  && (!result.output.camera || typeof setCamera === "function");
                if (result.output.zDragIds.length) {
                  const dragModes = desmos.DragModes;
                  if (!dragModes || !["Z", "XZ", "YZ", "XYZ"].every((key) => key in dragModes)) {
                    capabilityErrors.push(`3D drag modes are unavailable for: ${result.output.zDragIds.join(", ")}.`);
                  }
                }
                if (capabilityErrors.length || !hasRequiredMethods) {
                  calculator.destroy?.();
                  console.error("Desmos 3D capability check failed", capabilityErrors);
                  setBlockError(block, "This Desmos 3D block needs unsupported API features.", capabilityErrors);
                  continue;
                }
                if (result.output.settings && typeof updateSettings === "function") updateSettings.call(calculator, result.output.settings);
                setExpressions.call(calculator, lockDesmosExpressions(result.output.expressions));
                if (result.output.bounds && typeof setMathBounds === "function") setMathBounds.call(calculator, result.output.bounds);
                if (result.output.camera && typeof setCamera === "function") setCamera.call(calculator, result.output.camera);
                calculators.set(block, calculator);
                const expressionErrors = await getDesmosExpressionErrors(
                  calculator,
                  result.output.expressions,
                  () => active,
                );
                if (expressionErrors.length) {
                  appendBlockError(block, "Malformed 3D graph", expressionErrors);
                }
              } catch (error) {
                if (calculator) calculators.delete(block);
                calculator?.destroy?.();
                console.error("Desmos 3D block initialization failed", error);
                setBlockError(block, "This Desmos 3D graph could not be initialized.", [
                  error instanceof Error ? error.message : String(error),
                ]);
              }
            }
          }
        }
        const rendered = await waitForReaderLayout(root);
        if (!rendered && active) {
          [...desmosBlocks, ...desmos3DBlocks].forEach((block) => {
            if (block.querySelector(".dcg-container, .desmos-error")) return;
            calculators.get(block)?.destroy?.();
            calculators.delete(block);
            setBlockError(block, "This Desmos graph did not finish loading.", [
              "The calculator did not mount before the render timeout.",
            ]);
          });
          console.error("Markdown diagrams did not finish rendering");
          setAiNotice("Some interactive diagrams are still loading or could not be rendered.");
        }
        return rendered;
      } catch (error) {
        if (!active) return true;
        console.error("Markdown diagram initialization failed", error);
        [...desmosBlocks, ...desmos3DBlocks].forEach((block) => {
          if (block.querySelector(".desmos-loading, .desmos-source")) {
            setBlockError(block, "Desmos could not be loaded.", [
              error instanceof Error ? error.message : String(error),
            ]);
          }
        });
        setAiNotice("Some interactive diagrams could not be loaded. The rest of the note is still available.");
        return false;
      }
    })();
    return () => {
      active = false;
      calculators.forEach((calculator) => calculator.destroy?.());
    };
  }, [html]);

  useEffect(() => {
    const key = `notebooks:reader-progress:${file.owner}/${file.repository}/${file.path}`;
    let saved = 0;
    try {
      saved = Number(localStorage.getItem(key));
    } catch (error) {
      console.error("Could not restore reading progress", error);
    }
    let timer: number | null = null;
    const save = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? Math.min(1, window.scrollY / max) : 0;
        setReadingProgress(progress);
        if (max > 0) {
          try {
            localStorage.setItem(key, String(progress));
          } catch (error) {
            console.error("Could not save reading progress", error);
          }
        }
      }, 160);
    };
    let active = true;
    let userInteracted = false;
    const markInteraction = () => { userInteracted = true; };
    const onScroll = () => save();
    window.addEventListener("wheel", markInteraction, { passive: true });
    window.addEventListener("touchstart", markInteraction, { passive: true });
    window.addEventListener("pointerdown", markInteraction, { passive: true });
    window.addEventListener("keydown", markInteraction);
    void diagramInitializationRef.current.then(() => {
      if (!active) return;
      if (!userInteracted && Number.isFinite(saved) && saved > 0) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        window.scrollTo({ top: max * Math.min(saved, 1), behavior: "instant" });
      }
      save();
      window.addEventListener("scroll", onScroll, { passive: true });
    });
    return () => {
      active = false;
      window.removeEventListener("wheel", markInteraction);
      window.removeEventListener("touchstart", markInteraction);
      window.removeEventListener("pointerdown", markInteraction);
      window.removeEventListener("keydown", markInteraction);
      window.removeEventListener("scroll", onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [file, html]);

  const onReaderKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "/" && !event.metaKey && !event.ctrlKey && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) {
      event.preventDefault();
      searchRef.current?.focus();
    } else if (event.key.toLowerCase() === "o" && !event.metaKey && !event.ctrlKey && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName)) {
      toggleOutline();
    } else if (event.key === "Escape" && query) {
      setQuery("");
    } else if (event.key === "Enter" && matches.length > 0 && document.activeElement === searchRef.current) {
      event.preventDefault();
      const current = matches.findIndex((match) => match.blockId === currentSearchMatchId);
      const next = current === -1
        ? (event.shiftKey ? matches.length - 1 : 0)
        : (current + (event.shiftKey ? matches.length - 1 : 1)) % matches.length;
      jumpTo(matches[next].blockId, matches[next].sectionId);
    }
  }, [currentSearchMatchId, jumpTo, matches, query, toggleOutline]);

  const backLabel = backHref === "/" ? "Home" : "Library";
  const setContentRoot = useCallback((element: HTMLElement | null) => {
    contentRef.current = element;
    setContentElement(element);
  }, []);

  return (
    <main className={`next-note-reader ${readerFontClassName}${sepia ? " is-sepia" : ""}`} onKeyDown={onReaderKeyDown} style={{ "--reader-font-scale": fontScale } as React.CSSProperties}>
      <div className="reader-progress" aria-hidden="true" />
      <header className="next-reader-toolbar">
        <Link className="next-reader-back" href={backHref}>← <span>{backLabel}</span></Link>
        <div className="next-reader-title">
          <strong>{file.fileName}</strong>
          <span>{file.repository} / {file.path}</span>
        </div>
        <button type="button" className="next-reader-action" aria-expanded={effectiveOutlineOpen} onClick={toggleOutline}>Outline</button>
        <a className="next-reader-action" href={outlineHref(file)} target="_blank" rel="noreferrer">GitHub ↗</a>
        <details className="reader-more-menu">
          <summary className="next-reader-action">More</summary>
          <div className="reader-more-options">
            <button type="button" onClick={() => setFontScale((scale) => Math.max(0.85, Math.round((scale - 0.05) * 100) / 100))}>Smaller text</button>
            <button type="button" onClick={() => setFontScale((scale) => Math.min(1.25, Math.round((scale + 0.05) * 100) / 100))}>Larger text</button>
            <button type="button" aria-pressed={sepia} onClick={() => setSepia((enabled) => !enabled)}>Sepia reading</button>
            <button type="button" onClick={() => window.print()}>Print</button>
          </div>
        </details>
      </header>
      <div className="next-reader-progress-track" aria-label="Reading progress"><span style={{ width: `${Math.round(readingProgress * 100)}%` }} /></div>
      {aiNotice && <p className="reader-feature-notice" role="status">{aiNotice}</p>}
      <div className={`next-reader-layout${effectiveOutlineOpen ? "" : " outline-collapsed"}${isChatExpanded ? " chat-expanded" : ""}`}>
        <aside className="next-reader-outline" aria-label="Search and outline">
          <section className="reader-search" aria-labelledby="reader-search-heading">
            <h2 id="reader-search-heading">Search</h2>
            <label htmlFor="reader-search">Search this note</label>
            <input ref={searchRef} id="reader-search" type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search… (* and ?)" />
            <div className="reader-search-modes" role="group" aria-label="Search scope">
              <button type="button" aria-pressed={searchMode === "outline"} onClick={() => setSearchMode("outline")}>Outline</button>
              <button type="button" aria-pressed={searchMode === "notes"} onClick={() => setSearchMode("notes")}>Notes</button>
            </div>
            <p className="reader-mode-status" data-mode={hasSearchQuery ? "search" : "outline"} role="status" aria-live="polite">
              <span className="reader-mode-status-dot" aria-hidden="true" />
              <strong>{hasSearchQuery ? "Search mode" : "Outline mode"}</strong>
              {hasSearchQuery && <span>Searching {searchMode === "notes" ? "notes" : "outline"}</span>}
            </p>
          </section>
          {hasSearchQuery ? (
            <div className="reader-search-results" aria-live="polite">
              <p>{matches.length} matches{searchMode === "notes" ? ` in ${groupedMatches.length} sections` : ""}</p>
              {searchMode === "notes"
                ? groupedMatches.map(({ sectionId, blocks }) => {
                  const section = findSection(tree, sectionId);
                  return (
                    <div className="reader-search-group" key={sectionId}>
                      <h3>{section ? `${section.number} ${section.title}` : "Document start"}</h3>
                      {blocks.map((match) => (
                        <SearchResultButton
                          key={match.blockId}
                          blockId={match.blockId}
                          onJump={jumpTo}
                          sectionId={match.sectionId}
                          text={match.text}
                        />
                      ))}
                    </div>
                  );
                })
                : matches.map((match) => (
                  <SearchResultButton
                    key={match.blockId}
                    blockId={match.blockId}
                    onJump={jumpTo}
                    sectionId={match.sectionId}
                    sectionNumber={findSection(tree, match.sectionId)?.number}
                    text={match.text}
                  />
                ))}
            </div>
          ) : (
            <nav className="reader-outline-window" aria-label="Outline">
              {rootIndex === 0
                ? <button className="outline-edge" type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>The start of the document</button>
                : <button className="outline-neighbor" type="button" onClick={() => jumpTo(`${tree[rootIndex - 1].id}-heading`, tree[rootIndex - 1].id)}>{tree[rootIndex - 1].number} {tree[rootIndex - 1].title}</button>}
              {currentRoot && <OutlineBranch section={currentRoot} activeId={activeSectionId} onJump={jumpTo} />}
              {rootIndex >= tree.length - 1
                ? <button className="outline-edge" type="button" onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}>The end of the document</button>
                : tree[rootIndex + 1] && <button className="outline-neighbor" type="button" onClick={() => jumpTo(`${tree[rootIndex + 1].id}-heading`, tree[rootIndex + 1].id)}>{tree[rootIndex + 1].number} {tree[rootIndex + 1].title}</button>}
            </nav>
          )}
        </aside>
        <article className="next-reader-content" ref={setContentRoot}>
          <SearchHighlight query={hasSearchQuery && searchMode === "notes" ? query.trim() : ""} root={contentElement} />
          <div className="reader-document-card">
            <div className="markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
          <footer className="next-reader-footer">
            <span>{file.fileSha ? `Revision ${file.fileSha.slice(0, 12)}` : "Latest indexed revision"}</span>
            <span>{flattened.length} sections · {searchIndex.length} searchable blocks</span>
          </footer>
        </article>
        <button
          type="button"
          className="reader-chat-toggle"
          aria-label={isChatExpanded ? "Close chat" : "Open chat"}
          aria-expanded={isChatExpanded}
          onClick={() => {
            const next = !isChatExpanded;
            if (next && isOutlineCompactViewport()) setCompactOutlineOpen(false);
            setChatExpanded(next);
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6a7.5 7.5 0 1 1 17-3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M8 11h8M8 14.5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
        {shouldRenderChatPanel && (ChatPanel ? (
          <ChatPanel
            key={`${file.owner}/${file.repository}/${file.path}`}
            file={file}
            searchIndex={searchIndex}
            tree={tree}
            activeSectionId={activeSectionId}
            activeSectionTitle={activeSection?.title}
            contentElement={contentElement}
            expanded={isChatExpanded}
            aiTier={aiTier}
            onAiTierChange={(tier) => writeReaderPreference(AI_TIER_PREFERENCE_KEY, tier)}
          />
        ) : (
          <aside className={`next-reader-ai${isChatExpanded ? " chat-expanded" : ""}`} aria-label="Chat">
            <div className="ai-panel-content">
              <p className="reader-chat-notice" role="status">{chatPanelLoadFailed ? "Chat failed to load. Reload the page to try again." : "Loading chat…"}</p>
            </div>
          </aside>
        ))}
      </div>
    </main>
  );
}

function OutlineBranch({
  section,
  activeId,
  onJump,
}: {
  section: NoteSection;
  activeId: string;
  onJump: (blockId: string, sectionId: string) => void;
}) {
  return (
    <div
      className={`reader-outline-branch${section.id === activeId ? " is-current" : ""}`}
      style={{ "--outline-tone": `var(--reader-tone-${Math.min(section.level, 4)})` } as React.CSSProperties}
    >
      <button type="button" aria-current={section.id === activeId ? "location" : undefined} onClick={() => onJump(`${section.id}-heading`, section.id)}>
        <span>{section.number}</span>{section.title}
      </button>
      {section.children.map((child) => <OutlineBranch key={child.id} section={child} activeId={activeId} onJump={onJump} />)}
    </div>
  );
}
