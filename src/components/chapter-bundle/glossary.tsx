"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChapterBundle, GlossaryMatch } from "@/lib/chapter-bundle/schema";

type GlossaryEntries = ChapterBundle["glossary"];
type GlossaryState = {
  entries: GlossaryEntries;
  activeReference: string | null;
  show: (reference: string) => void;
  dismiss: (reference?: string) => void;
};

const GlossaryContext = createContext<GlossaryState | null>(null);

export function GlossaryProvider({
  entries,
  children,
}: {
  entries: GlossaryEntries;
  children: ReactNode;
}) {
  const [activeReference, setActiveReference] = useState<string | null>(null);
  const show = useCallback((reference: string) => setActiveReference(reference), []);
  const dismiss = useCallback((reference?: string) => {
    setActiveReference((active) => !reference || active === reference ? null : active);
  }, []);

  useEffect(() => {
    const hideOnScroll = () => setActiveReference(null);
    window.addEventListener("scroll", hideOnScroll, true);
    return () => window.removeEventListener("scroll", hideOnScroll, true);
  }, []);

  const value = useMemo(() => ({ entries, activeReference, show, dismiss }), [
    entries, activeReference, show, dismiss,
  ]);
  return <GlossaryContext.Provider value={value}>{children}</GlossaryContext.Provider>;
}

function useGlossary(): GlossaryState {
  const value = useContext(GlossaryContext);
  if (!value) throw new Error("Glossary references must be rendered inside GlossaryProvider.");
  return value;
}

export function GlossaryReference({
  termId,
  children,
}: {
  termId: string;
  children: ReactNode;
}) {
  const { entries, activeReference, show, dismiss } = useGlossary();
  const reference = useId();
  const entry = entries[termId];
  if (!entry) throw new Error(`Missing glossary entry '${termId}'.`);
  const isOpen = activeReference === reference;
  const tooltipId = `${reference}-definition`;

  return (
    <span
      className="chapter-glossary-reference-wrap"
      onMouseEnter={() => show(reference)}
      onMouseLeave={() => dismiss(reference)}
    >
      <button
        type="button"
        className="chapter-glossary-reference"
        aria-expanded={isOpen}
        aria-describedby={isOpen ? tooltipId : undefined}
        onFocus={() => show(reference)}
        onBlur={() => dismiss(reference)}
        onClick={() => show(reference)}
      >
        {children}
      </button>
      {isOpen && (
        <span className="chapter-glossary-popover" id={tooltipId} role="tooltip">
          <strong>{entry.term}</strong>
          <span>{entry.definition}</span>
        </span>
      )}
    </span>
  );
}

export function GlossaryText({
  text,
  references,
}: {
  text: string;
  references: GlossaryMatch[];
}) {
  if (references.length === 0) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const [index, reference] of references.entries()) {
    if (reference.start > cursor) nodes.push(text.slice(cursor, reference.start));
    nodes.push(
      <GlossaryReference key={`${reference.termId}-${reference.start}-${index}`} termId={reference.termId}>
        {text.slice(reference.start, reference.end)}
      </GlossaryReference>,
    );
    cursor = reference.end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}
