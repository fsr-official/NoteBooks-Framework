"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { InteractiveErrorBoundary } from "@/components/chapter-bundle/interactive-error-boundary";
import type { ReaderChatPanelProps } from "@/components/reader-chat-panel";
import type { AiTier } from "@/lib/ai-tiers";
import type { NoteSearchBlock, NoteSection } from "@/lib/markdown/renderer";
import type { ReaderFile } from "@/lib/reader-types";
import {
  readerRenderCacheKey,
  readerSourceRevision,
  writeRenderedNote,
} from "@/lib/reader-render-cache";

type Props = {
  html: string;
  title: string;
  owner: string;
  repository: string;
  branch: string;
  filePath: string;
  fileSha: string;
  backHref: string;
  readerFontClassName: string;
  desmosApiKey?: string;
  stale?: boolean;
};

type ReaderContext = Pick<ReaderChatPanelProps, "tree" | "searchIndex">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNoteSection(value: unknown): value is NoteSection {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.number === "string"
    && typeof value.title === "string"
    && typeof value.level === "number"
    && Array.isArray(value.children)
    && value.children.every(isNoteSection);
}

function isNoteSearchBlock(value: unknown): value is NoteSearchBlock {
  return isRecord(value)
    && typeof value.sectionId === "string"
    && typeof value.blockId === "string"
    && typeof value.text === "string";
}

function readerContext(html: string): ReaderContext {
  if (!/<article\b[^>]*\bdata-kind=["'](?:chapter|page)["']/i.test(html)) {
    throw new Error("The compiled HTML does not contain a readable document.");
  }
  const data = html.match(/<script\b(?=[^>]*\bdata-chapter-data\b)[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!data) throw new Error("The compiled HTML has no reader context.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch (error) {
    throw new Error("The compiled HTML reader context is malformed.", { cause: error });
  }
  if (
    !isRecord(parsed)
    || !Array.isArray(parsed.tree)
    || !parsed.tree.every(isNoteSection)
    || !Array.isArray(parsed.searchIndex)
    || !parsed.searchIndex.every(isNoteSearchBlock)
  ) {
    throw new Error("The compiled HTML reader context has an unsupported format.");
  }
  return {
    tree: parsed.tree,
    searchIndex: parsed.searchIndex,
  };
}

function findSectionTitle(tree: NoteSection[], sectionId: string): string | undefined {
  for (const section of tree) {
    if (section.id === sectionId) return `${section.number} ${section.title}`.trim();
    const childTitle = findSectionTitle(section.children, sectionId);
    if (childTitle) return childTitle;
  }
  return undefined;
}

export function PrecompiledHtmlReader({
  html,
  title,
  owner,
  repository,
  branch,
  filePath,
  fileSha,
  backHref,
  readerFontClassName,
  desmosApiKey,
  stale = false,
}: Props) {
  const [runtimeError, setRuntimeError] = useState<{ html: string; message: string } | null>(null);
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
  const [activeSection, setActiveSection] = useState<{ html: string; id: string } | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [ChatPanel, setChatPanel] = useState<ComponentType<ReaderChatPanelProps> | null>(null);
  const [chatPanelLoadFailed, setChatPanelLoadFailed] = useState(false);
  const [aiTier, setAiTier] = useState<AiTier>("low");
  const contextResult = useMemo(() => {
    try {
      return { context: readerContext(html), error: null };
    } catch (error) {
      return {
        context: null,
        error: error instanceof Error ? error.message : "The compiled HTML reader context could not be read.",
      };
    }
  }, [html]);
  const context = contextResult.context;
  const activeSectionId = activeSection?.html === html
    ? activeSection.id
    : context?.tree[0]?.id ?? "";
  const visibleRuntimeError = runtimeError?.html === html ? runtimeError.message : contextResult.error;
  const setContentRef = useCallback((container: HTMLDivElement | null) => {
    const article = container?.querySelector("article[data-kind]");
    setContentElement(article instanceof HTMLElement ? article : null);
  }, []);

  useEffect(() => {
    let active = true;
    let detach: (() => void) | undefined;
    let activeSectionObserver: MutationObserver | IntersectionObserver | undefined;
    const article = contentElement;
    if (!article || !context) return;

    const facts = article.querySelector<HTMLElement>("[data-facts]");
    if (facts) {
      const update = () => {
        if (facts.dataset.activeSection) {
          setActiveSection({ html, id: facts.dataset.activeSection });
        }
      };
      activeSectionObserver = new MutationObserver(update);
      activeSectionObserver.observe(facts, { attributes: true, attributeFilter: ["data-active-section"] });
    } else if (typeof IntersectionObserver !== "undefined") {
      const headings = article.querySelectorAll<HTMLElement>("[data-section-id]");
      activeSectionObserver = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
        if (visible?.target instanceof HTMLElement) {
          setActiveSection({ html, id: visible.target.dataset.sectionId ?? "" });
        }
      }, { rootMargin: "-15% 0px -70% 0px", threshold: 0 });
      headings.forEach((heading) => activeSectionObserver?.observe(heading));
    }

    import("./runtime/chapter-reader.js")
      .then(({ attachChapterReader }) => {
        if (active) detach = attachChapterReader(article, { desmosApiKey });
      })
      .catch((error: unknown) => {
        if (active) {
          setRuntimeError({
            html,
            message: error instanceof Error ? error.message : "The HTML reader could not be initialized.",
          });
        }
      });

    return () => {
      active = false;
      activeSectionObserver?.disconnect();
      detach?.();
    };
  }, [contentElement, context, desmosApiKey, html]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const revision = await readerSourceRevision(fileSha, html);
      if (!active) return;
      const key = readerRenderCacheKey({
        owner,
        repository,
        path: filePath,
        revision: revision ?? "",
        renderer: "precompiled-html",
      });
      await writeRenderedNote(key, html);
    })();
    return () => { active = false; };
  }, [filePath, fileSha, html, owner, repository]);

  useEffect(() => {
    if (document.querySelector('link[data-precompiled-tikz-fonts="true"]')) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = "/bin/tikzjax/output/fonts.css";
    stylesheet.dataset.precompiledTikzFonts = "true";
    stylesheet.onerror = () => console.error("Could not load the compiled reader TikZ fonts");
    document.head.appendChild(stylesheet);
  }, []);

  useEffect(() => {
    if (!contentElement?.querySelector(".katex, .katex-display")) return;
    let active = true;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void import("katex/dist/katex.min.css").catch((error: unknown) => {
          if (!active) return;
          console.error("Could not load compiled reader math styles", error);
          setRuntimeError({
            html,
            message: "Some equations could not be styled. Please reload the note.",
          });
        });
      });
    });
    return () => {
      active = false;
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [contentElement, html]);

  useEffect(() => {
    if (!chatOpen || ChatPanel) return;
    let active = true;
    import("../reader-chat-panel")
      .then(({ ReaderChatPanel }) => {
        if (active) setChatPanel(() => ReaderChatPanel);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Could not load the compiled reader chat panel", error);
        setChatPanelLoadFailed(true);
      });
    return () => { active = false; };
  }, [ChatPanel, chatOpen]);

  useEffect(() => {
    if (!chatOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatOpen]);

  const chatFile: ReaderFile = {
    owner,
    repository,
    branch,
    path: filePath,
    fileName: title,
    fileSha,
  };

  return (
    <main className={`next-note-reader precompiled-note-reader ${readerFontClassName}`}>
        <header className="next-reader-toolbar">
          <div className="next-reader-title">
            <strong>{title}</strong>
            <span>{owner}/{repository} · compiled HTML</span>
          </div>
          <div className="chapter-reader-toolbar-actions">
            <button
              type="button"
              className="chapter-reader-ai-toggle"
              aria-controls="precompiled-html-ai-drawer"
              aria-expanded={chatOpen}
              onClick={() => setChatOpen((open) => !open)}
            >
              {chatOpen ? "Close AI" : "Ask AI"}
            </button>
            <Link className="next-reader-back" href={backHref}>Back</Link>
          </div>
        </header>
        {stale && (
          <p className="precompiled-html-warning" role="status">
            Showing the last verified copy while the latest version is unavailable.
          </p>
        )}
        {visibleRuntimeError && <p className="precompiled-html-error" role="alert">{visibleRuntimeError}</p>}
        <div
          ref={setContentRef}
          className="precompiled-html-reader"
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {chatOpen && (
          <div className="chapter-reader-ai-layer">
            <button
              className="chapter-reader-ai-backdrop"
              type="button"
              aria-label="Close AI assistant"
              onClick={() => setChatOpen(false)}
            />
            <aside
              id="precompiled-html-ai-drawer"
              className="chapter-reader-ai-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="NoteBooks AI assistant"
            >
              <button
                type="button"
                className="chapter-reader-ai-close"
                onClick={() => setChatOpen(false)}
              >
                Close
              </button>
              {chatPanelLoadFailed ? (
                <p className="chapter-reader-error" role="alert">The AI assistant could not be loaded.</p>
              ) : ChatPanel && context ? (
                <InteractiveErrorBoundary>
                  <ChatPanel
                    file={chatFile}
                    searchIndex={context.searchIndex}
                    tree={context.tree}
                    activeSectionId={activeSectionId}
                    activeSectionTitle={findSectionTitle(context.tree, activeSectionId)}
                    contentElement={contentElement}
                    expanded
                    aiTier={aiTier}
                    onAiTierChange={setAiTier}
                  />
                </InteractiveErrorBoundary>
              ) : (
                <p className="chapter-reader-muted" role="status">Loading AI assistant…</p>
              )}
            </aside>
          </div>
        )}
    </main>
  );
}
