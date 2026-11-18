"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { NoteSearchBlock, NoteSection } from "@/lib/markdown/renderer";
import { compileDesmos2D } from "@/lib/desmos-2d";
import { compileDesmos3D } from "@/lib/desmos-3d";
import { formatDesmosDiagnostic } from "@/lib/desmos-source";
import { AI_TIERS, isAiTier, type AiTier } from "@/lib/ai-tiers";
import { renderChatMarkdown } from "@/lib/markdown/chat";
import { createWildcardMatcher } from "@/lib/markdown/search";
import { getRelevantNoteContext } from "@/lib/reader-ai-context";
import { READER_CHAT_STORAGE_PREFIX } from "@/lib/reader-chat-storage";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type ReaderFile = {
  owner: string;
  repository: string;
  branch: string;
  path: string;
  fileName: string;
  fileSha: string;
};

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
type ReaderChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  tier?: AiTier;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
};

const CHAT_CONSENT_KEY = "notebooks:ai-chat:consent:v1";
const AI_TIER_PREFERENCE_KEY = "notebooks:reader:ai-tier:v1";
const CHAT_WELCOME_LINES = [
  "Hi, I’m your NoteBooks study companion. Ask me to explain an idea or connect it to this note.",
  "Welcome! I’m ready to help you explore this note, one question at a time.",
  "Let’s make this topic clearer. What would you like to understand first?",
] as const;

function getChatStorageKey(file: ReaderFile): string {
  return `${READER_CHAT_STORAGE_PREFIX}${file.owner}/${file.repository}/${file.path}`;
}

function getChatWelcomeLine(storageKey: string): string {
  const hash = Array.from(storageKey).reduce((total, character) => total + character.charCodeAt(0), 0);
  return CHAT_WELCOME_LINES[hash % CHAT_WELCOME_LINES.length];
}

function readChatMessages(storageKey: string): ReaderChatMessage[] {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return [];
    const value: unknown = JSON.parse(stored);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ReaderChatMessage => (
      Boolean(item)
      && typeof item === "object"
      && typeof item.id === "string"
      && (item.role === "user" || item.role === "assistant")
      && typeof item.content === "string"
      && item.content.length <= 8000
      && (item.tier === undefined || isAiTier(item.tier))
      && (item.model === undefined
        || (typeof item.model === "string" && /^[A-Za-z0-9._/-]{1,100}$/.test(item.model)))
      && (item.promptTokens === undefined
        || (typeof item.promptTokens === "number" && Number.isSafeInteger(item.promptTokens) && item.promptTokens >= 0))
      && (item.completionTokens === undefined
        || (typeof item.completionTokens === "number" && Number.isSafeInteger(item.completionTokens) && item.completionTokens >= 0))
    )).slice(-30);
  } catch (error) {
    console.error("Could not read the saved reader chat", error);
    return [];
  }
}

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
  const diagrams = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-mermaid, .tikz-wrapper, .obsidian-desmos, .obsidian-desmos3d"));
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
      return () => { css.highlights?.delete("reader-search"); };
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
    return () => {
      for (const mark of marks) {
        const parent = mark.parentNode;
        mark.replaceWith(...Array.from(mark.childNodes));
        parent?.normalize();
      }
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
  const effectiveOutlineOpen = isOutlineCompact ? compactOutlineOpen : outlineOpen;
  const isChatExpanded = isChatCompact && chatExpanded;
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
  const [messageDraft, setMessageDraft] = useState("");
  const [chatNotice, setChatNotice] = useState("");
  const [chatMessages, setChatMessages] = useState<ReaderChatMessage[]>([]);
  const [chatLoadedKey, setChatLoadedKey] = useState("");
  const [chatPending, setChatPending] = useState(false);
  const [selectedChatText, setSelectedChatText] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [chatActionsOpen, setChatActionsOpen] = useState(false);
  const [chatPoliciesAccepted, setChatPoliciesAccepted] = useState(false);
  const [usagePolicyChecked, setUsagePolicyChecked] = useState(false);
  const [privacyPolicyChecked, setPrivacyPolicyChecked] = useState(false);
  const [welcomeText, setWelcomeText] = useState("");
  const [requestsRemaining, setRequestsRemaining] = useState<number | null>(null);
  const visitorIdRef = useRef("");
  const [aiNotice, setAiNotice] = useState("");
  const [currentSearchMatchId, setCurrentSearchMatchId] = useState<string | null>(null);
  const fontPreferenceKey = `notebooks:reader-font:${file.owner}/${file.repository}/${file.path}`;
  const chatStorageKey = getChatStorageKey(file);
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
    setChatMessages(readChatMessages(chatStorageKey));
    setChatLoadedKey(chatStorageKey);
    setSelectedChatText("");
  }, [chatStorageKey]);

  useEffect(() => {
    try {
      setChatPoliciesAccepted(localStorage.getItem(CHAT_CONSENT_KEY) === "accepted");
    } catch (error) {
      console.error("Could not read the AI chat policy acceptance", error);
    }
  }, []);

  const chatWelcomeLine = getChatWelcomeLine(chatStorageKey);
  useEffect(() => {
    setWelcomeText("");
    if (chatLoadedKey !== chatStorageKey || chatMessages.length > 0) return;
    let position = 0;
    const timer = window.setInterval(() => {
      position = Math.min(position + 2, chatWelcomeLine.length);
      setWelcomeText(chatWelcomeLine.slice(0, position));
      if (position === chatWelcomeLine.length) window.clearInterval(timer);
    }, 24);
    return () => window.clearInterval(timer);
  }, [chatLoadedKey, chatMessages.length, chatStorageKey, chatWelcomeLine]);

  useEffect(() => {
    if (!contentElement) return;
    const updateSelection = () => {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const focus = selection?.focusNode;
      if (!selection || selection.isCollapsed
          || !anchor || !focus
          || !contentElement.contains(anchor)
          || !contentElement.contains(focus)) {
        return;
      }
      const text = selection.toString().trim();
      if (text) setSelectedChatText(text.slice(0, 8000));
    };
    document.addEventListener("selectionchange", updateSelection);
    return () => document.removeEventListener("selectionchange", updateSelection);
  }, [contentElement]);

  useEffect(() => {
    if (chatLoadedKey !== chatStorageKey) return;
    try {
      if (chatMessages.length === 0) localStorage.removeItem(chatStorageKey);
      else localStorage.setItem(chatStorageKey, JSON.stringify(chatMessages.slice(-30)));
    } catch (error) {
      console.error("Could not save the reader chat locally", error);
    }
  }, [chatLoadedKey, chatMessages, chatStorageKey]);

  const flattened = useMemo(() => flattenTree(tree), [tree]);
  const activeSection = findSection(tree, activeSectionId);
  const currentRoot = rootSection(tree, activeSection);
  const rootIndex = currentRoot ? tree.findIndex((section) => section.id === currentRoot.id) : 0;
  const matcher = useMemo(() => createWildcardMatcher(query.trim()), [query]);
  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = messageDraft.trim();
    if (!message || chatPending) return;
    if (!chatPoliciesAccepted) {
      setChatNotice("Accept the AI usage and privacy policies before chatting.");
      return;
    }

    setChatPending(true);
    setChatNotice("");
    const userMessage: ReaderChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: message,
    };
    const priorMessages = chatMessages.slice(-6).map(({ role, content }) => ({
      role,
      content: content.slice(0, 2000),
    }));
    setChatMessages((current) => [...current, userMessage].slice(-30));
    setMessageDraft("");
    try {
      let visitorId = visitorIdRef.current;
      try {
        visitorId = localStorage.getItem("notebooks:ai-chat:visitor-id") ?? visitorId;
      } catch (error) {
        console.error("Could not read the AI chat visitor ID", error);
      }
      if (!/^[0-9a-f-]{36}$/i.test(visitorId)) {
        visitorId = crypto.randomUUID();
      }
      visitorIdRef.current = visitorId;
      try {
        localStorage.setItem("notebooks:ai-chat:visitor-id", visitorId);
      } catch (error) {
        console.error("Could not save the AI chat visitor ID", error);
      }

      const { data: sessionData, error: sessionError } = await getSupabaseBrowserClient().auth.getSession();
      if (sessionError) throw sessionError;
      if (aiTier !== "low" && !sessionData.session) {
        throw new Error("Sign in to use Medium, High, or Extra AI effort. Low is available without an account.");
      }
      const context = getRelevantNoteContext(message, searchIndex, tree, activeSectionId, selectedChatText);
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          ...(sessionData.session
            ? { authorization: `Bearer ${sessionData.session.access_token}` }
            : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({
          context,
          history: priorMessages,
          tier: aiTier,
          message,
          noteTitle: `${file.fileName} (${file.repository}/${file.path})`,
          visitorId,
          webSearch: webSearchEnabled,
        }),
      });
      const result = await response.json() as {
        answer?: string;
        model?: string;
        tier?: string;
        usage?: { promptTokens?: number; completionTokens?: number; requestsRemaining?: number };
        error?: string;
      };
      const answer = typeof result.answer === "string" ? result.answer : "";
      const model = typeof result.model === "string" ? result.model : "";
      if (!response.ok || !answer || !/^[A-Za-z0-9._/-]{1,100}$/.test(model)) {
        throw new Error(result.error || "The AI service could not answer this question.");
      }
      setChatMessages((current) => [...current, {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: answer,
        tier: isAiTier(result.tier) ? result.tier : aiTier,
        model,
        promptTokens: result.usage?.promptTokens,
        completionTokens: result.usage?.completionTokens,
      }].slice(-30));
      if (typeof result.usage?.requestsRemaining === "number") {
        setRequestsRemaining(result.usage.requestsRemaining);
      }
      setSelectedChatText("");
    } catch (error) {
      setChatNotice(error instanceof Error ? error.message : "The AI service could not answer this question.");
    } finally {
      setChatPending(false);
    }
  }
  function acceptChatPolicies() {
    if (!usagePolicyChecked || !privacyPolicyChecked) return;
    try {
      localStorage.setItem(CHAT_CONSENT_KEY, "accepted");
    } catch (error) {
      console.error("Could not save the AI chat policy acceptance", error);
      setChatNotice("Policy acceptance could not be saved in this browser. You can continue for this visit.");
    }
    setChatPoliciesAccepted(true);
  }
  const matches = useMemo(() => {
    if (!matcher) return [];
    if (searchMode === "outline") {
      return flattened
        .filter(({ section }) => matcher.test(`${section.number} ${section.title}`))
        .slice(0, 200)
        .map(({ section }) => ({ sectionId: section.id, blockId: `${section.id}-heading`, text: `${section.number} ${section.title}` }));
    }
    return searchIndex.filter((block) => matcher.test(block.text)).slice(0, 200);
  }, [flattened, matcher, searchIndex, searchMode]);
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
      let activeHeading: HTMLElement | null = null;
      let activeTop = Number.NEGATIVE_INFINITY;
      let nextHeading: HTMLElement | null = null;
      let nextTop = Number.POSITIVE_INFINITY;
      for (const heading of headings) {
        const top = heading.getBoundingClientRect().top;
        if (top <= focusLine && top > activeTop) {
          activeHeading = heading;
          activeTop = top;
        } else if (top > focusLine && top < nextTop) {
          nextHeading = heading;
          nextTop = top;
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
    if (!root) {
      diagramInitializationRef.current = Promise.resolve(true);
      return;
    }
    const hasLegacyDiagrams = Boolean(root.querySelector(".obsidian-mermaid, .tikz-wrapper"));
    const desmosBlocks = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-desmos"));
    const desmos3DBlocks = Array.from(root.querySelectorAll<HTMLElement>(".obsidian-desmos3d"));
    if (!hasLegacyDiagrams && !desmosBlocks.length && !desmos3DBlocks.length) {
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
        if (hasLegacyDiagrams) {
          await Promise.all([
            loadScript("/js/markdown-vendors.js"),
            loadScript("/js/obsidian-markdown-it.js"),
          ]);
          if (!active) return true;
          await runtime.NoteBooksMarkdownVendors?.ensureFor(root);
          if (!active) return true;
          await runtime.obsidianInitMermaid?.(root);
          if (!active) return true;
          runtime.obsidianInitTikz?.(root);
        }
        if (desmosBlocks.length) {
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
            await loadScript("/api/desmos.js", 15_000);
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
                const calculator = desmos.GraphingCalculator(graph, entry.result.output.options);
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
            await loadScript("/api/desmos3d.js", 15_000);
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
                calculator = desmos.Calculator3D(calculatorHost, result.output.options);
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
        <aside className="next-reader-outline" aria-label="Section outline">
          <div className="reader-search">
            <label htmlFor="reader-search">Search this note</label>
            <input ref={searchRef} id="reader-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search… (* and ?)" />
            <div className="reader-search-modes" role="group" aria-label="Search mode">
              <button type="button" aria-pressed={searchMode === "outline"} onClick={() => setSearchMode("outline")}>Outline</button>
              <button type="button" aria-pressed={searchMode === "notes"} onClick={() => setSearchMode("notes")}>Notes</button>
            </div>
          </div>
          {query ? (
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
            <nav className="reader-outline-window">
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
          <SearchHighlight query={searchMode === "notes" ? query : ""} root={contentElement} />
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
        <aside className={`next-reader-ai${isChatExpanded ? " chat-expanded" : ""}`} aria-label="Chat">
          <div className="ai-panel-content">
            <header className="reader-chat-header">
              <span className="reader-chat-brand-mark" aria-hidden="true">n</span>
              <div>
                <h2>NoteBooks AI Assistant</h2>
                <p>Study companion · grounded in this note</p>
              </div>
            </header>
            <div className="reader-chat-messages" role="log" aria-live="polite">
              {!chatPoliciesAccepted && (
                <section className="reader-chat-consent" aria-labelledby="reader-chat-consent-title">
                  <span className="reader-chat-consent-mark" aria-hidden="true">n</span>
                  <h3 id="reader-chat-consent-title">A quick note before we begin</h3>
                  <p>Your question, recent chat messages, and relevant note excerpts will be sent to Groq to generate an answer. Chat history stays in this browser.</p>
                  <label>
                    <input
                      type="checkbox"
                      checked={usagePolicyChecked}
                      onChange={(event) => setUsagePolicyChecked(event.target.checked)}
                    />
                    I agree to the                     <Link href="/ai-usage-policy" target="_blank" rel="noreferrer">AI Usage Policy</Link>.
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={privacyPolicyChecked}
                      onChange={(event) => setPrivacyPolicyChecked(event.target.checked)}
                    />
                    I agree to the                     <Link href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</Link>.
                  </label>
                  <button
                    type="button"
                    onClick={acceptChatPolicies}
                    disabled={!usagePolicyChecked || !privacyPolicyChecked}
                  >
                    Agree and continue
                  </button>
                </section>
              )}
              {chatMessages.length === 0 && (
                <div className="reader-chat-welcome">
                  <span className="reader-chat-avatar" aria-hidden="true">n</span>
                  <div>
                    <strong>NoteBooks AI</strong>
                    <p>{welcomeText}<span className="reader-chat-caret" aria-hidden="true">▋</span></p>
                  </div>
                  <div className="reader-chat-starters" aria-label="Conversation starters">
                    {[
                      "Explain the key idea",
                      "Give me a quick summary",
                      "Quiz me on this note",
                    ].map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => setMessageDraft(starter)}
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((chatMessage) => (
                <article className={`reader-chat-message is-${chatMessage.role}`} key={chatMessage.id}>
                  <strong>
                    {chatMessage.role === "assistant" && <span className="reader-chat-avatar is-small" aria-hidden="true">n</span>}
                    {chatMessage.role === "user" ? "You" : "NoteBooks AI"}
                  </strong>
                  <div
                    className="reader-chat-markdown"
                    dangerouslySetInnerHTML={{ __html: renderChatMarkdown(chatMessage.content) }}
                  />
                  {chatMessage.role === "assistant" && (
                    <small className="reader-chat-message-meta">
                      <span>
                        {chatMessage.tier ? `${AI_TIERS[chatMessage.tier].label} · ` : ""}
                        {chatMessage.model ? `Model: ${chatMessage.model}` : "Model info unavailable for this saved reply"}
                      </span>
                      {chatMessage.promptTokens !== undefined && chatMessage.completionTokens !== undefined
                        && <span>{(chatMessage.promptTokens + chatMessage.completionTokens).toLocaleString()} tokens</span>}
                    </small>
                  )}
                </article>
              ))}
              {chatPending && (
                <div className="reader-chat-pending" role="status">
                  <span className="reader-chat-avatar is-typing" aria-hidden="true">n</span>
                  <span>NoteBooks AI is reading and writing</span>
                  <span className="reader-chat-typing-dots" aria-hidden="true"><i /><i /><i /></span>
                </div>
              )}
              {requestsRemaining !== null && requestsRemaining <= 3 && (
                <p className="reader-chat-usage-warning" role="status">
                  {requestsRemaining === 0
                    ? "You’re at the limit for your current AI chat allowance."
                    : `You have ${requestsRemaining} AI chat ${requestsRemaining === 1 ? "request" : "requests"} left in your current allowance.`}
                </p>
              )}
            </div>
            <form
              className="reader-chat-composer"
              onSubmit={(event) => void sendChatMessage(event)}
            >
              <div className="reader-chat-tier-control">
                <label htmlFor="reader-chat-tier">AI effort</label>
                <select
                  id="reader-chat-tier"
                  aria-label="AI effort and token ceiling"
                  value={aiTier}
                  onChange={(event) => {
                    if (isAiTier(event.target.value)) {
                      writeReaderPreference(AI_TIER_PREFERENCE_KEY, event.target.value);
                    }
                  }}
                  disabled={chatPending}
                >
                  {Object.entries(AI_TIERS).map(([tier, option]) => (
                    <option key={tier} value={tier}>{option.label}</option>
                  ))}
                </select>
                <p>
                  Up to {AI_TIERS[aiTier].maxOutputTokens.toLocaleString()} answer tokens;
                  input is fitted to about {AI_TIERS[aiTier].maxInputTokens.toLocaleString()} tokens.
                  {aiTier !== "low" && " Sign-in required."}
                </p>
              </div>
              {selectedChatText && (
                <p className="reader-chat-selection">
                  <span><b>#Selected-Text</b> · {selectedChatText.length.toLocaleString()} characters</span>
                  <button type="button" onClick={() => setSelectedChatText("")} aria-label="Remove selected text">×</button>
                </p>
              )}
              <div className="reader-chat-input-shell">
                <textarea
                  id="reader-chat-message"
                  aria-label="Message"
                  value={messageDraft}
                  onChange={(event) => {
                    setMessageDraft(event.target.value);
                    setChatNotice("");
                  }}
                  placeholder="Ask anything about this note…"
                  rows={4}
                  maxLength={4000}
                  disabled={chatPending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <div className="reader-chat-input-actions">
                  <span className="reader-chat-shortcut">Enter to send · Shift + Enter for a new line</span>
                  <button
                    type="submit"
                    className="reader-chat-send-button"
                    aria-label={chatPending ? "Sending message" : "Send message"}
                    disabled={!messageDraft.trim() || chatPending || !chatPoliciesAccepted}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                      <path d="M4.5 12 20 4l-4.1 16-3.1-6.2L4.5 12Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                      <path d="m12.8 13.8 7.2-9.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                  <div className="reader-chat-action-wrap">
                    <button
                      type="button"
                      className="reader-chat-add-button"
                      aria-label="More chat actions"
                      aria-haspopup="menu"
                      aria-expanded={chatActionsOpen}
                      onClick={() => setChatActionsOpen((open) => !open)}
                      disabled={chatPending}
                    >
                      +
                    </button>
                    {chatActionsOpen && (
                      <div className="reader-chat-action-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            if (!selectedChatText) setChatNotice("Select text in the note to attach it.");
                            else setChatNotice("");
                            setChatActionsOpen(false);
                          }}
                        >
                          {selectedChatText ? "Selected text attached" : "Attach selected text"}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMessageDraft(`Explain this section: ${activeSection?.title ?? file.fileName}`);
                            setChatActionsOpen(false);
                          }}
                        >
                          Explain this section
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setMessageDraft(`Summarize this section: ${activeSection?.title ?? file.fileName}`);
                            setChatActionsOpen(false);
                          }}
                        >
                          Summarize this section
                        </button>
                        <button
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={webSearchEnabled}
                          onClick={() => {
                            setWebSearchEnabled((enabled) => !enabled);
                            setChatActionsOpen(false);
                          }}
                        >
                          {webSearchEnabled ? "✓ Web search on" : "Search the web"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <p className="reader-chat-disclaimer">
                AI can make mistakes. Check important information against the note and trusted sources.
              </p>
              {chatNotice && <p className="reader-chat-notice" role="status">{chatNotice}</p>}
            </form>
          </div>
        </aside>
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
