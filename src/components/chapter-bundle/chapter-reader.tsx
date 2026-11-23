"use client";

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ChapterContent } from "@/components/chapter-bundle/chapter-content";
import { GlossaryProvider, GlossaryText } from "@/components/chapter-bundle/glossary";
import { InteractiveErrorBoundary } from "@/components/chapter-bundle/interactive-error-boundary";
import type { AiTier } from "@/lib/ai-tiers";
import {
  isChapterOutlineId,
  type ChapterBundle,
  type BlockNode,
  type InlineNode,
} from "@/lib/chapter-bundle/schema";
import type { NoteSearchBlock, NoteSection } from "@/lib/markdown/renderer";
import type { ReaderFile } from "@/lib/reader-types";

const ReaderChatPanel = lazy(async () => {
  const chatPanelModule = await import("@/components/reader-chat-panel");
  return { default: chatPanelModule.ReaderChatPanel };
});

type Props = {
  bundle: ChapterBundle;
  sourceCommitSha: string;
  stale: boolean;
  backHref?: string;
};

type MobileTab = "notes" | "facts" | "outline" | "examples";

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if ("value" in node) return node.value;
    return inlineText(node.children);
  }).join("");
}

function headingId(node: Extract<BlockNode, { type: "heading" }>): string | undefined {
  if (node.id) return node.id;
  const match = inlineText(node.children).match(/^SECTION\s+(\d+)\b/i);
  return match ? `SECTION-${match[1]}` : undefined;
}

function blockText(node: BlockNode): string {
  switch (node.type) {
    case "paragraph":
    case "tableCell":
      return inlineText(node.children);
    case "heading":
      return inlineText(node.children);
    case "list":
    case "listItem":
    case "table":
    case "tableRow":
    case "blockquote":
      return node.children.map(blockText).join(" ");
    case "codeBlock":
    case "mathBlock":
      return node.value;
    case "image":
      return node.alt;
    case "component":
      switch (node.name) {
        case "Callout":
          return node.children?.map(blockText).join(" ") ?? "";
        case "Example":
          return [...node.props.question, ...node.props.answer].map(blockText).join(" ");
        case "Diagram":
          return node.props.title ?? "";
        case "Desmos":
          return "";
      }
    case "thematicBreak":
      return "";
  }
}

function buildReaderContext(bundle: ChapterBundle): { tree: NoteSection[]; searchIndex: NoteSearchBlock[] } {
  const sections = new Map<string, NoteSection>();
  const rootSections = bundle.outline
    .filter((entry) => /^SECTION-\d+$/.test(entry.id))
    .map((entry): NoteSection => {
      const number = entry.id.slice("SECTION-".length);
      const section = { id: entry.id, number, title: entry.title, level: 2, children: [] };
      sections.set(section.id, section);
      return section;
    });

  const addHeadings = (nodes: BlockNode[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        const id = headingId(node);
        if (id && /^\d+\.\d+(?:\.\d+)?$/.test(id)) {
          const parts = id.split(".");
          const parentId = parts.length === 2 ? `SECTION-${parts[0]}` : parts.slice(0, -1).join(".");
          const parent = sections.get(parentId) ?? rootSections.find((section) => section.number === parts[0]);
          const section: NoteSection = {
            id,
            number: id,
            title: inlineText(node.children).replace(/^\d+(?:\.\d+)+\s*/, ""),
            level: parts.length + 1,
            children: [],
          };
          sections.set(id, section);
          parent?.children.push(section);
        }
      }
      if (node.type === "component") {
        if (node.name === "Example") {
          addHeadings(node.props.question);
          addHeadings(node.props.answer);
        }
        if (node.children) addHeadings(node.children);
      } else if ("children" in node) {
        if (node.type === "tableCell" || node.type === "paragraph" || node.type === "heading") continue;
        addHeadings(node.children);
      }
    }
  };
  addHeadings(bundle.notes.tree);

  const searchIndex: NoteSearchBlock[] = bundle.facts.flatMap((fact, index) => {
    const text = [fact.brief, ...fact.points].filter(Boolean).join(" ");
    return text ? [{ sectionId: fact.sectionId, blockId: `fact-${index}`, text: text.slice(0, 2400) }] : [];
  });
  let currentSectionId = "chapter-overview";
  let blockIndex = 0;
  const addSearchBlocks = (nodes: BlockNode[]) => {
    for (const node of nodes) {
      if (node.type === "heading") {
        currentSectionId = headingId(node) ?? currentSectionId;
      } else if (node.type === "paragraph" || node.type === "codeBlock" || node.type === "mathBlock") {
        const text = blockText(node).trim();
        if (text) {
          searchIndex.push({
            sectionId: currentSectionId,
            blockId: `note-${blockIndex++}`,
            text: text.slice(0, 2400),
          });
        }
      }
      if (node.type === "component") {
        if (node.name === "Example") {
          addSearchBlocks(node.props.question);
          addSearchBlocks(node.props.answer);
        }
        if (node.children) addSearchBlocks(node.children);
      } else if ("children" in node) {
        if (node.type === "tableCell" || node.type === "paragraph" || node.type === "heading") continue;
        addSearchBlocks(node.children);
      }
      if (searchIndex.length >= 2500) return;
    }
  };
  addSearchBlocks(bundle.notes.tree);

  return { tree: rootSections, searchIndex };
}

function rootOutlineId(sectionId: string): string {
  if (sectionId.startsWith("SECTION-") || sectionId === "chapter-overview") return sectionId;
  const sectionNumber = sectionId.match(/^(\d+)/)?.[1];
  return sectionNumber ? `SECTION-${sectionNumber}` : "chapter-overview";
}

function findSectionTitle(sections: NoteSection[], id: string): string | undefined {
  for (const section of sections) {
    if (section.id === id) return `${section.number} ${section.title}`.trim();
    const child = findSectionTitle(section.children, id);
    if (child) return child;
  }
  return undefined;
}

function factsForSection(bundle: ChapterBundle, sectionId: string) {
  if (sectionId === "chapter-overview") return [];
  if (sectionId.startsWith("SECTION-")) {
    const number = sectionId.slice("SECTION-".length);
    return bundle.facts.filter((fact) => fact.sectionId.startsWith(`${number}.`));
  }
  return bundle.facts.filter((fact) => fact.sectionId === sectionId);
}

export function ChapterReader({ bundle, sourceCommitSha, stale, backHref }: Props) {
  const mainRef = useRef<HTMLDivElement>(null);
  const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
  const [activeSectionId, setActiveSectionId] = useState(
    bundle.outline.find((entry) => entry.id.startsWith("SECTION-"))?.id ?? "chapter-overview",
  );
  const [activeTab, setActiveTab] = useState<MobileTab>("notes");
  const [chatOpen, setChatOpen] = useState(false);
  const [aiTier, setAiTier] = useState<AiTier>("low");
  const { tree, searchIndex } = useMemo(() => buildReaderContext(bundle), [bundle]);
  const activeOutlineId = rootOutlineId(activeSectionId);
  const activeOutline = bundle.outline.find((entry) => entry.id === activeOutlineId);
  const activeFacts = factsForSection(bundle, activeSectionId);

  const chatFile = useMemo<ReaderFile>(() => ({
    owner: "fsr-official",
    repository: "NoteBooks-Developers",
    branch: sourceCommitSha,
    path: `build/${bundle.id}.json`,
    fileName: bundle.title,
    fileSha: sourceCommitSha,
  }), [bundle.id, bundle.title, sourceCommitSha]);

  useEffect(() => {
    setContentElement(mainRef.current);
    const root = mainRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const headings = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter-heading='true'][id]"));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top)[0];
      if (visible?.target instanceof HTMLElement && isChapterOutlineId(visible.target.id)) {
        setActiveSectionId(visible.target.id);
      }
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0, 1] });
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [bundle.id]);

  useEffect(() => {
    if (!chatOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [chatOpen]);

  const jumpTo = useCallback((id: string) => {
    if (!isChapterOutlineId(id)) return;
    setActiveSectionId(id);
    setActiveTab("notes");
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const goToExample = useCallback((exampleId: string) => {
    setActiveTab("examples");
    window.requestAnimationFrame(() => {
      document.getElementById(`chapter-example-${exampleId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  const mobileTabs: Array<{ id: MobileTab; label: string }> = [
    { id: "notes", label: "Notes" },
    { id: "facts", label: "Facts" },
    { id: "outline", label: "Outline" },
    { id: "examples", label: `Examples (${bundle.examples.length})` },
  ];

  return (
    <main className="next-note-reader chapter-reader-app">
      <header className="chapter-reader-toolbar">
        <div className="chapter-reader-title">
          <span className="chapter-reader-eyebrow">PRECOMPILED CHAPTER</span>
          <h1>{bundle.title}</h1>
        </div>
        <div className="chapter-reader-toolbar-actions">
          {backHref && <Link className="chapter-reader-ai-toggle" href={backHref}>Back to library</Link>}
          <button
            type="button"
            className="chapter-reader-ai-toggle"
            aria-expanded={chatOpen}
            aria-controls="chapter-reader-ai-drawer"
            onClick={() => setChatOpen((open) => !open)}
          >
            {chatOpen ? "Close AI" : "Ask AI"}
          </button>
        </div>
      </header>
      {stale && (
        <p className="chapter-reader-stale" role="status">
          Showing the last verified chapter bundle while the pinned revision is unavailable.
        </p>
      )}
      <nav className="chapter-reader-mobile-tabs" aria-label="Chapter sections">
        {mobileTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => {
              if (tab.id === "examples") {
                const firstExample = bundle.examples[0];
                if (firstExample) goToExample(firstExample.id);
                else setActiveTab("examples");
              } else {
                setActiveTab(tab.id);
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <GlossaryProvider entries={bundle.glossary}>
      <div className="chapter-reader-grid" data-active-tab={activeTab}>
        <aside className="chapter-reader-outline" aria-label="Chapter outline">
          <span className="chapter-reader-column-label">ON THIS PAGE</span>
          {bundle.outline.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`chapter-reader-outline-item${activeOutlineId === entry.id ? " is-active" : ""}`}
              data-importance={entry.importance}
              aria-current={activeOutlineId === entry.id ? "location" : undefined}
              onClick={() => jumpTo(entry.id)}
              title={entry.brief}
            >
              {entry.title}
            </button>
          ))}
        </aside>

        <section className="chapter-reader-main" aria-label="Chapter notes">
          <div className="chapter-reader-roadmap">
            <span className="chapter-reader-column-label">READING</span>
            <span>{activeOutline?.title ?? bundle.title}</span>
          </div>
          <div className="chapter-reader-scroll" ref={mainRef}>
            <ChapterContent
              bundle={bundle}
              onGoToExample={goToExample}
              onReturnToSection={jumpTo}
            />
          </div>
        </section>

        <aside className="chapter-reader-facts" aria-label="Facts for the active section">
          <span className="chapter-reader-column-label">KEY FACTS</span>
          {activeFacts.length === 0 ? (
            <p className="chapter-reader-muted">Select a section to see its facts.</p>
          ) : activeFacts.map((fact) => (
            <section className="chapter-reader-fact" key={fact.sectionId}>
              <h2>{fact.sectionId}</h2>
              {fact.brief && <p><GlossaryText text={fact.brief} references={fact.glossaryRefs.brief} /></p>}
              <ul>{fact.points.map((point, index) => (
                <li key={`${fact.sectionId}-${index}`}>
                  <GlossaryText text={point} references={fact.glossaryRefs.points[index]} />
                </li>
              ))}</ul>
            </section>
          ))}
        </aside>

      </div>
      </GlossaryProvider>

      {chatOpen && (
        <div className="chapter-reader-ai-layer">
          <button
            className="chapter-reader-ai-backdrop"
            type="button"
            aria-label="Close AI assistant"
            onClick={() => setChatOpen(false)}
          />
          <aside
            id="chapter-reader-ai-drawer"
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
            <InteractiveErrorBoundary>
              <Suspense fallback={<p className="chapter-reader-muted">Loading AI assistant…</p>}>
                <ReaderChatPanel
                  file={chatFile}
                  searchIndex={searchIndex}
                  tree={tree}
                  activeSectionId={activeSectionId}
                  activeSectionTitle={findSectionTitle(tree, activeSectionId) ?? activeOutline?.title}
                  contentElement={contentElement}
                  expanded
                  aiTier={aiTier}
                  onAiTierChange={setAiTier}
                />
              </Suspense>
            </InteractiveErrorBoundary>
          </aside>
        </div>
      )}
    </main>
  );
}
