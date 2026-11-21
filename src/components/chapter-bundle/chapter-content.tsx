"use client";

import katex from "katex";
import { Fragment, type ReactNode } from "react";
import type { BlockNode, ChapterBundle, InlineNode } from "@/lib/chapter-bundle/schema";
import { GlossaryReference } from "@/components/chapter-bundle/glossary";
import { InteractiveErrorBoundary } from "@/components/chapter-bundle/interactive-error-boundary";
import { DesmosViewer, DiagramViewer } from "@/components/chapter-bundle/chapter-visuals";

function renderInline(node: InlineNode, key: string): ReactNode {
  switch (node.type) {
    case "text":
      return node.value;
    case "inlineCode":
      return <code key={key}>{node.value}</code>;
    case "mathInline":
      return (
        <span
          key={key}
          className="chapter-math-inline"
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(node.value, {
              displayMode: false,
              throwOnError: false,
              trust: false,
            }),
          }}
        />
      );
    case "emphasis":
      return <em key={key}>{node.children.map((child, index) => renderInline(child, `${key}-${index}`))}</em>;
    case "strong":
      return <strong key={key}>{node.children.map((child, index) => renderInline(child, `${key}-${index}`))}</strong>;
    case "link": {
      if (/^(?:javascript|data|vbscript):/i.test(node.href.trim())) {
        return <span key={key}>{node.children.map((child, index) => renderInline(child, `${key}-${index}`))}</span>;
      }
      const external = /^https?:\/\//i.test(node.href);
      return (
        <a
          key={key}
          href={node.href}
          title={node.title}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {node.children.map((child, index) => renderInline(child, `${key}-${index}`))}
        </a>
      );
    }
    case "glossaryRef":
      return (
        <GlossaryReference key={key} termId={node.termId}>
          {node.children.map((child, index) => renderInline(child, `${key}-${index}`))}
        </GlossaryReference>
      );
  }
}

function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => {
    if ("value" in node) return node.value;
    return inlineText(node.children);
  }).join("");
}

function renderBlock(node: BlockNode, bundle: ChapterBundle, key: string): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{node.children.map((child, index) => renderInline(child, `${key}-${index}`))}</p>;
    case "heading": {
      const headingText = inlineText(node.children);
      const sectionMatch = headingText.match(/^SECTION\s+(\d+)\b/i);
      const id = node.id ?? (sectionMatch ? `SECTION-${sectionMatch[1]}` : undefined);
      const children = node.children.map((child, index) => renderInline(child, `${key}-${index}`));
      const attributes = {
        id,
        "data-chapter-heading": id ? "true" : undefined,
      };
      switch (node.depth) {
        case 1: return <h1 key={key} {...attributes}>{children}</h1>;
        case 2: return <h2 key={key} {...attributes}>{children}</h2>;
        case 3: return <h3 key={key} {...attributes}>{children}</h3>;
        case 4: return <h4 key={key} {...attributes}>{children}</h4>;
        case 5: return <h5 key={key} {...attributes}>{children}</h5>;
        case 6: return <h6 key={key} {...attributes}>{children}</h6>;
      }
    }
    case "list": {
      const children = node.children.map((child, index) => renderBlock(child, bundle, `${key}-${index}`));
      return node.ordered
        ? <ol key={key} start={node.start}>{children}</ol>
        : <ul key={key}>{children}</ul>;
    }
    case "listItem":
      return <li key={key}>{node.children.map((child, index) => renderBlock(child, bundle, `${key}-${index}`))}</li>;
    case "table":
      return (
        <div key={key} className="markdown-table-scroll">
          <table>
            <tbody>{node.children.map((child, index) => renderBlock(child, bundle, `${key}-${index}`))}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return <tr key={key}>{node.children.map((child, index) => renderBlock(child, bundle, `${key}-${index}`))}</tr>;
    case "tableCell":
      return <td key={key}>{node.children.map((child, index) => renderInline(child, `${key}-${index}`))}</td>;
    case "blockquote":
      return <blockquote key={key}>{node.children.map((child, index) => renderBlock(child, bundle, `${key}-${index}`))}</blockquote>;
    case "thematicBreak":
      return <hr key={key} />;
    case "codeBlock":
      return <pre key={key}><code className={node.lang ? `language-${node.lang}` : undefined}>{node.value}</code></pre>;
    case "mathBlock":
      return (
        <div
          key={key}
          className="chapter-math-block"
          dangerouslySetInnerHTML={{
            __html: katex.renderToString(node.value, {
              displayMode: true,
              throwOnError: false,
              trust: false,
            }),
          }}
        />
      );
    case "image":
      return (
        <a key={key} className="chapter-image-link" href={node.src} title={node.title}>
          Open image: {node.alt || node.src}
        </a>
      );
    case "component":
      switch (node.name) {
        case "Callout":
          return (
            <aside key={key} className={`chapter-callout chapter-callout-${node.props.type}`}>
              <strong className="chapter-callout-label">{node.props.type}</strong>
              {node.children?.map((child, index) => renderBlock(child, bundle, `${key}-${index}`))}
            </aside>
          );
        case "Example":
          return (
            <details key={key} className="chapter-inline-example">
              <summary>{node.props.title}</summary>
              {node.props.question.map((child, index) => renderBlock(child, bundle, `${key}-q-${index}`))}
              <details>
                <summary>Show answer</summary>
                {node.props.answer.map((child, index) => renderBlock(child, bundle, `${key}-a-${index}`))}
              </details>
            </details>
          );
        case "Diagram": {
          const diagram = bundle.diagrams.find((item) => item.id === node.props.id);
          if (!diagram) return <p key={key} className="chapter-reader-error" role="alert">Missing compiled diagram: {node.props.id}</p>;
          return <InteractiveErrorBoundary key={key}><DiagramViewer diagram={diagram} title={node.props.title} /></InteractiveErrorBoundary>;
        }
        case "Desmos": {
          const block = bundle.desmos.find((item) => item.id === node.props.id);
          if (!block) return <p key={key} className="chapter-reader-error" role="alert">Missing compiled Desmos graph: {node.props.id}</p>;
          return <InteractiveErrorBoundary key={key}><DesmosViewer block={block} /></InteractiveErrorBoundary>;
        }
      }
  }
}

function sectionTitle(nodes: BlockNode[], sectionId: string): string {
  for (const node of nodes) {
    if (node.type === "heading" && node.id === sectionId) {
      return inlineText(node.children).replace(/^\d+(?:\.\d+)+\s*/, "");
    }
    if (node.type === "component" && node.children) {
      const nested = sectionTitle(node.children, sectionId);
      if (nested) return nested;
    } else if (
      "children" in node
      && node.type !== "component"
      && node.type !== "heading"
      && node.type !== "paragraph"
      && node.type !== "tableCell"
    ) {
      const nested = sectionTitle(node.children, sectionId);
      if (nested) return nested;
    }
  }
  return "";
}

function sectionNodes(nodes: BlockNode[], sectionId: string): BlockNode[] {
  const start = nodes.findIndex((node) => node.type === "heading" && node.id === sectionId);
  if (start < 0) return [];
  const heading = nodes[start];
  if (heading.type !== "heading") return [];
  let end = start + 1;
  while (end < nodes.length) {
    const node = nodes[end];
    if (node.type === "heading" && node.depth <= heading.depth) break;
    end += 1;
  }
  return nodes.slice(start, end);
}

function renderNoteSequence(
  nodes: BlockNode[],
  bundle: ChapterBundle,
  keyPrefix: string,
  onGoToExample: (exampleId: string) => void,
): ReactNode[] {
  const rendered: ReactNode[] = [];
  let index = 0;
  while (index < nodes.length) {
    const node = nodes[index];
    const sectionId = node.type === "heading" ? node.id : undefined;
    const examples = sectionId
      ? bundle.examples.filter((example) => example.from.includes(sectionId))
      : [];
    if (node.type !== "heading" || !sectionId || examples.length === 0) {
      rendered.push(renderBlock(node, bundle, `${keyPrefix}-${index}`));
      index += 1;
      continue;
    }

    let end = index + 1;
    while (end < nodes.length) {
      const next = nodes[end];
      if (next.type === "heading" && next.depth <= node.depth) break;
      end += 1;
    }
    rendered.push(
      <Fragment key={`${keyPrefix}-section-${sectionId}`}>
        {nodes.slice(index, end).map((child, childIndex) => (
          renderBlock(child, bundle, `${keyPrefix}-${index + childIndex}`)
        ))}
        <div className="chapter-example-links">
          {examples.map((example) => (
            <button
              key={example.id}
              type="button"
              onClick={() => onGoToExample(example.id)}
            >
              Go to example: {example.title}
            </button>
          ))}
        </div>
      </Fragment>,
    );
    index = end;
  }
  return rendered;
}

function ExamplesSection({
  bundle,
  onReturnToSection,
}: {
  bundle: ChapterBundle;
  onReturnToSection: (sectionId: string) => void;
}) {
  return (
    <section className="chapter-example-list" id="chapter-examples" aria-label="Worked examples">
      <h2>Worked examples</h2>
      {bundle.examples.length === 0 && <p>No worked examples are available in this chapter.</p>}
      {bundle.examples.map((example) => (
        <article className="chapter-example-card" id={`chapter-example-${example.id}`} key={example.id}>
          <h3>{example.title}</h3>
          <div className="chapter-example-columns">
            <section>
              <span className="chapter-reader-column-label">FROM SECTION</span>
              {example.from.map((sectionId) => (
                <button
                  type="button"
                  className="chapter-example-section-link"
                  key={sectionId}
                  onClick={() => onReturnToSection(sectionId)}
                >
                  {sectionId}: {sectionTitle(bundle.notes.tree, sectionId) || "Notes"}
                </button>
              ))}
            </section>
            <section className="chapter-example-question">
              <span className="chapter-reader-column-label">QUESTION</span>
              {example.question.map((node, index) => renderBlock(node, bundle, `${example.id}-question-${index}`))}
              <details className="chapter-example-answer">
                <summary>Reveal answer</summary>
                {example.answer.map((node, index) => renderBlock(node, bundle, `${example.id}-answer-${index}`))}
              </details>
            </section>
            <section>
              <span className="chapter-reader-column-label">CONCEPTS USED</span>
              {example.concepts.map((sectionId) => {
                const content = sectionNodes(bundle.notes.tree, sectionId);
                return (
                  <div className="chapter-example-concept" key={sectionId}>
                    <h4>{sectionId}: {sectionTitle(bundle.notes.tree, sectionId) || "Concept"}</h4>
                    {content.map((node, index) => renderBlock(node, bundle, `${example.id}-concept-${sectionId}-${index}`))}
                  </div>
                );
              })}
            </section>
          </div>
          <div className="chapter-example-return-row">
            <button type="button" onClick={() => onReturnToSection(example.from[0] ?? "chapter-overview")}>
              Return to section
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

export function ChapterContent({
  bundle,
  onGoToExample,
  onReturnToSection,
}: {
  bundle: ChapterBundle;
  onGoToExample: (exampleId: string) => void;
  onReturnToSection: (sectionId: string) => void;
}) {
  return (
    <div className="markdown-reader">
      <article className="markdown-content chapter-reader-content">
        {renderNoteSequence(bundle.notes.tree, bundle, "note", onGoToExample)}
        <ExamplesSection bundle={bundle} onReturnToSection={onReturnToSection} />
      </article>
    </div>
  );
}
