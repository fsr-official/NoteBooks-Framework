"use client";

import { useEffect, useRef, useState } from "react";
import type { ChapterBundle, JsonValue } from "@/lib/chapter-bundle/schema";
import { withDesmosTheme } from "@/lib/desmos-theme";

type ChapterDiagram = ChapterBundle["diagrams"][number];
type DesmosBlock = ChapterBundle["desmos"][number];

type DesmosCalculator = {
  setExpressions?: (expressions: Array<Record<string, JsonValue> & { readonly: true }>) => void;
  updateSettings?: (settings: Record<string, string | boolean>) => void;
  setMathBounds?: (bounds: Record<string, number>) => void;
  setCamera?: (camera: { azimuth: number; elevation: number; zoom?: number }) => void;
  destroy?: () => void;
};

type ReaderWindow = Window & {
  Desmos?: {
    __notebooksUnavailable?: boolean;
    enabledFeatures?: { Calculator3D?: boolean };
    DragModes?: Record<string, unknown>;
    GraphingCalculator?: (element: HTMLElement, options?: Record<string, boolean>) => DesmosCalculator;
    Calculator3D?: (element: HTMLElement, options?: Record<string, boolean>) => DesmosCalculator;
  };
  NoteBooksMarkdownVendors?: { ensureFor: (root: Element) => Promise<void> };
  obsidianInitTikz?: (root?: Element) => void;
  obsidianInitMermaid?: (root?: Element) => void | Promise<void>;
};

const scriptLoads = new Map<string, Promise<void>>();

function loadScript(source: string): Promise<void> {
  const pending = scriptLoads.get(source);
  if (pending) return pending;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.dataset.chapterVisualRuntime = source;
    script.onload = () => resolve();
    script.onerror = () => {
      script.remove();
      scriptLoads.delete(source);
      reject(new Error(`Unable to load chapter visual runtime: ${source}`));
    };
    document.head.appendChild(script);
  });
  scriptLoads.set(source, promise);
  return promise;
}

async function loadMarkdownRuntime(root: Element, kind: "mermaid" | "tikz"): Promise<void> {
  const runtime = window as ReaderWindow;
  await Promise.all([
    runtime.NoteBooksMarkdownVendors
      ? Promise.resolve()
      : loadScript("/js/markdown-vendors.js"),
    kind === "tikz" && runtime.obsidianInitTikz
      ? Promise.resolve()
      : kind === "mermaid" && runtime.obsidianInitMermaid
        ? Promise.resolve()
        : loadScript("/js/obsidian-markdown-it.js"),
  ]);
  const loadedRuntime = window as ReaderWindow;
  if (!loadedRuntime.NoteBooksMarkdownVendors) {
    throw new Error("The Markdown vendor loader did not initialize.");
  }
  await loadedRuntime.NoteBooksMarkdownVendors.ensureFor(root);
  if (kind === "tikz" && !loadedRuntime.obsidianInitTikz) {
    throw new Error("The local TikZJax renderer did not initialize.");
  }
  if (kind === "mermaid" && !loadedRuntime.obsidianInitMermaid) {
    throw new Error("The Mermaid renderer did not initialize.");
  }
}

export function DiagramViewer({ diagram, title }: { diagram: ChapterDiagram; title?: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const renderRoot = useRef<HTMLDivElement>(null);
  const modal = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const displayTitle = title ?? diagram.title ?? `${diagram.kind} diagram`;

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) trigger.current?.focus();
      wasOpen.current = false;
      return;
    }
    wasOpen.current = true;
    modal.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open || !renderRoot.current) return;
    let active = true;
    const root = renderRoot.current;
    setError(null);
    void (async () => {
      try {
        await loadMarkdownRuntime(root, diagram.kind);
        if (!active) return;
        const runtime = window as ReaderWindow;
        if (diagram.kind === "tikz") runtime.obsidianInitTikz?.(root);
        else await runtime.obsidianInitMermaid?.(root);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [open, diagram.kind, diagram.source]);

  return (
    <>
      <figure className="chapter-visual-placeholder">
        <button
          type="button"
          ref={trigger}
          className="chapter-visual-trigger"
          onClick={() => setOpen(true)}
          aria-label={`Open ${displayTitle}`}
        >
          <span aria-hidden="true">{diagram.kind === "tikz" ? "◇" : "↗"}</span>
          <span>{displayTitle}</span>
          <small>Open diagram</small>
        </button>
      </figure>
      {open && (
        <div className="chapter-visual-modal-layer">
          <button
            type="button"
            className="chapter-visual-modal-backdrop"
            aria-label="Close diagram"
            onClick={() => setOpen(false)}
          />
          <section
            ref={modal}
            className="chapter-visual-modal"
            role="dialog"
            aria-modal="true"
            aria-label={displayTitle}
            tabIndex={-1}
          >
            <header>
              <h2>{displayTitle}</h2>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </header>
            <div className="chapter-visual-modal-content" ref={renderRoot}>
              {diagram.kind === "tikz" ? (
                <div className="tikz-wrapper">
                  <div className="tikz-loading" role="status">Rendering diagram…</div>
                  <div className="tikz-source" style={{ display: "none" }}>{diagram.source}</div>
                </div>
              ) : (
                <div className="obsidian-mermaid mermaid">{diagram.source}</div>
              )}
              {error && <p className="chapter-reader-error" role="alert">{error}</p>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function record(value: JsonValue | undefined, field: string): Record<string, JsonValue> | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Invalid compiled Desmos ${field}.`);
  }
  return value;
}

function booleanRecord(value: JsonValue | undefined, field: string): Record<string, boolean> | undefined {
  const source = record(value, field);
  if (!source) return undefined;
  const result: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== "boolean") throw new Error(`Invalid compiled Desmos ${field}.${key}.`);
    result[key] = entry;
  }
  return result;
}

function settingsRecord(value: JsonValue | undefined): Record<string, string | boolean> | undefined {
  const source = record(value, "settings");
  if (!source) return undefined;
  const result: Record<string, string | boolean> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== "string" && typeof entry !== "boolean") {
      throw new Error(`Invalid compiled Desmos settings.${key}.`);
    }
    result[key] = entry;
  }
  return result;
}

function expressionsFrom(data: JsonValue): Array<Record<string, JsonValue>> {
  const source = record(data, "graph data");
  if (!source || !Array.isArray(source.expressions)) {
    throw new Error("Compiled Desmos data has no expressions.");
  }
  return source.expressions.map((expression, index) => {
    if (typeof expression !== "object" || expression === null || Array.isArray(expression)) {
      throw new Error(`Invalid compiled Desmos expression at index ${index}.`);
    }
    return expression;
  });
}

function numericRecord(value: JsonValue | undefined, field: string): Record<string, number> | undefined {
  const source = record(value, field);
  if (!source) return undefined;
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (typeof entry !== "number" || !Number.isFinite(entry)) {
      throw new Error(`Invalid compiled Desmos ${field}.${key}.`);
    }
    result[key] = entry;
  }
  return result;
}

function cameraFrom(data: JsonValue): { azimuth: number; elevation: number; zoom?: number } | undefined {
  const source = record(record(data, "graph data")?.camera, "camera");
  if (!source) return undefined;
  const { azimuth, elevation, zoom } = source;
  if (typeof azimuth !== "number" || !Number.isFinite(azimuth)
    || typeof elevation !== "number" || !Number.isFinite(elevation)
    || (zoom !== undefined && (typeof zoom !== "number" || !Number.isFinite(zoom)))) {
    throw new Error("Invalid compiled Desmos camera settings.");
  }
  return { azimuth, elevation, ...(typeof zoom === "number" ? { zoom } : {}) };
}

function requiredMethods(
  calculator: DesmosCalculator,
  settings: Record<string, string | boolean> | undefined,
  bounds: Record<string, number> | undefined,
  camera: ReturnType<typeof cameraFrom>,
) {
  if (typeof calculator.setExpressions !== "function") {
    throw new Error("The Desmos API does not expose setExpressions().");
  }
  if (settings && typeof calculator.updateSettings !== "function") {
    throw new Error("The Desmos API does not expose updateSettings().");
  }
  if (bounds && typeof calculator.setMathBounds !== "function") {
    throw new Error("The Desmos API does not expose setMathBounds().");
  }
  if (camera && typeof calculator.setCamera !== "function") {
    throw new Error("The Desmos API does not expose setCamera().");
  }
}

function hasWebGL(): boolean {
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const loseContext = context?.getExtension("WEBGL_lose_context");
    loseContext?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

export function DesmosViewer({ block }: { block: DesmosBlock }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !host.current) return;
    let active = true;
    let calculator: DesmosCalculator | undefined;
    const root = host.current;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        await loadScript("/js/markdown-vendors.js");
        const vendors = (window as ReaderWindow).NoteBooksMarkdownVendors;
        if (!vendors) throw new Error("The Markdown vendor loader did not initialize.");
        await vendors.ensureFor(root);
        if (!active) return;

        const runtime = (window as ReaderWindow).Desmos;
        if (!runtime || runtime.__notebooksUnavailable) {
          throw new Error("Desmos is unavailable; check the configured API key and network connection.");
        }
        const source = record(block.data, "graph data");
        if (!source) throw new Error("Compiled Desmos data is missing.");
        if (block.kind === "3d" && source.target !== "3d") {
          throw new Error("Compiled Desmos 3D data has an invalid target.");
        }
        const expressions = expressionsFrom(block.data);
        const settings = settingsRecord(source.settings);
        const bounds = numericRecord(source.bounds, "bounds");
        const camera = block.kind === "3d" ? cameraFrom(block.data) : undefined;
        const constructor = block.kind === "3d" ? runtime.Calculator3D : runtime.GraphingCalculator;
        if (!constructor || (block.kind === "3d" && runtime.enabledFeatures?.Calculator3D === false)) {
          throw new Error(`Desmos ${block.kind === "3d" ? "3D" : "graphing"} calculator is unavailable.`);
        }
        if (block.kind === "3d" && !hasWebGL()) {
          throw new Error("Desmos 3D needs WebGL, which is unavailable in this browser or device.");
        }
        if (block.kind === "3d" && source.zDragIds !== undefined) {
          if (!Array.isArray(source.zDragIds) || !source.zDragIds.every((id) => typeof id === "string")) {
            throw new Error("Compiled Desmos 3D data has invalid drag-mode IDs.");
          }
          if (source.zDragIds.length > 0) {
            const dragModes = runtime.DragModes;
            if (!dragModes || !["Z", "XZ", "YZ", "XYZ"].every((mode) => mode in dragModes)) {
              throw new Error("This Desmos API build does not support the graph's 3D drag modes.");
            }
          }
        }

        calculator = constructor(root, withDesmosTheme(booleanRecord(source.options, "options"), document.documentElement.dataset.mode));
        requiredMethods(calculator, settings, bounds, camera);
        calculator.setExpressions?.(expressions.map((expression) => ({ ...expression, readonly: true })));
        if (settings) calculator.updateSettings?.(settings);
        if (bounds) calculator.setMathBounds?.(bounds);
        if (camera) calculator.setCamera?.(camera);
        if (active) setLoading(false);
      } catch (cause) {
        calculator?.destroy?.();
        calculator = undefined;
        if (active) {
          setError(cause instanceof Error ? cause.message : String(cause));
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
      calculator?.destroy?.();
    };
  }, [enabled, block.id, block.kind, block.data]);

  return (
    <figure className="chapter-visual-placeholder chapter-desmos-figure">
      {!enabled && (
        <button
          type="button"
          className="chapter-visual-trigger"
          onClick={() => setEnabled(true)}
          aria-label={`Load Desmos ${block.kind === "3d" ? "3D " : ""}graph`}
        >
          <span aria-hidden="true">ƒ(x)</span>
          <span>{block.kind === "3d" ? "Desmos 3D" : "Desmos graph"}</span>
          <small>Load interactive graph</small>
        </button>
      )}
      {enabled && (
        <div
          className={`chapter-desmos-host ${block.kind === "3d" ? "desmos3d-block" : "desmos-block"}`}
          ref={host}
        />
      )}
      {loading && <p role="status">Loading interactive graph…</p>}
      {error && <p className="chapter-reader-error" role="alert">{error}</p>}
    </figure>
  );
}
