"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { alignPdfPage, getLastPdfSpreadStart, type PdfPageMode } from "@/lib/pdf-page-navigation";

type PdfJs = typeof import("pdfjs-dist");
type PdfMatch = { page: number; text: string };
type ReaderMode = "normal" | "fullwindow" | "fullscreen";
const THUMBNAIL_ROW_HEIGHT = 136;
const THUMBNAIL_WINDOW_SIZE = 14;

function isCancellation(error: unknown): boolean {
  return error instanceof Error && error.name === "RenderingCancelledException";
}

function PdfThumbnail({
  document,
  pageNumber,
  selected,
  onSelect,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  selected: boolean;
  onSelect: (pageNumber: number) => void;
}) {
  const containerRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!Reflect.get(window, "IntersectionObserver")) {
      const timeout = window.setTimeout(() => setVisible(true), 0);
      return () => window.clearTimeout(timeout);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvasRef.current) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    void document.getPage(pageNumber).then(async (page) => {
      if (!active || !canvasRef.current) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(1, 112 / baseViewport.width) });
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to create the PDF thumbnail canvas.");
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    }).catch((error: unknown) => {
      if (active && !isCancellation(error)) console.error("PDF thumbnail rendering failed", error);
    });
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, visible]);

  return (
    <button
      ref={containerRef}
      className={`pdf-thumbnail${selected ? " is-active" : ""}`}
      type="button"
      aria-current={selected ? "page" : undefined}
      aria-label={`Go to page ${pageNumber}`}
      onClick={() => onSelect(pageNumber)}
    >
      <span className="pdf-thumbnail-sheet"><canvas ref={canvasRef} /></span>
      <span>Page {pageNumber}</span>
    </button>
  );
}

function PdfPageView({
  document,
  pdfjs,
  pageNumber,
  availableWidth,
  zoom,
  search,
  pageMode,
  readerMode,
  onError,
}: {
  document: PDFDocumentProxy;
  pdfjs: PdfJs;
  pageNumber: number;
  availableWidth: number;
  zoom: number;
  search: string;
  pageMode: PdfPageMode;
  readerMode: ReaderMode;
  onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!canvasRef.current || !textLayerRef.current) return;
    let active = true;
    let renderTask: RenderTask | undefined;
    let textLayer: InstanceType<PdfJs["TextLayer"]> | undefined;
    const canvas = canvasRef.current;
    const textContainer = textLayerRef.current;

    void (async () => {
      const page = await document.getPage(pageNumber);
      if (!active) return;
      const baseViewport = page.getViewport({ scale: 1 });
      const pageWidth = pageMode === "dual" ? Math.max(200, (availableWidth - 20) / 2) : availableWidth;
      const widthScale = Math.min(1.7, Math.max(0.35, (pageWidth - 28) / baseViewport.width));
      const heightScale = readerMode === "normal"
        ? Number.POSITIVE_INFINITY
        : Math.max(0.25, (window.innerHeight - (readerMode === "fullscreen" ? 20 : 130)) / baseViewport.height);
      const viewport = page.getViewport({ scale: Math.min(widthScale, heightScale) * zoom / 100 });
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * outputScale);
      canvas.height = Math.ceil(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      setPageSize({ width: viewport.width, height: viewport.height });
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to create the PDF page canvas.");
      context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      textContainer.replaceChildren();
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
      if (!active) return;
      const textContent = await page.getTextContent();
      if (!active) return;
      textLayer = new pdfjs.TextLayer({ textContentSource: textContent, container: textContainer, viewport });
      await textLayer.render();
      if (!active) return;
      const normalizedSearch = search.trim().toLocaleLowerCase();
      if (normalizedSearch) {
        textLayer.textDivs.forEach((element) => {
          if (element.textContent?.toLocaleLowerCase().includes(normalizedSearch)) {
            element.classList.add("pdf-search-highlight");
          }
        });
      }
    })().catch((renderError: unknown) => {
      if (active && !isCancellation(renderError)) {
        onError(renderError instanceof Error ? renderError.message : "Unable to render this PDF page.");
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
      textLayer?.cancel();
      textContainer.replaceChildren();
    };
  }, [availableWidth, document, onError, pageMode, pageNumber, pdfjs, readerMode, search, zoom]);

  return (
    <div className="pdf-page-sheet" style={{ width: pageSize.width || undefined, height: pageSize.height || undefined }}>
      <canvas ref={canvasRef} />
      <div ref={textLayerRef} className="pdf-text-layer" />
    </div>
  );
}

export default function PdfReader({ src, fileName }: { src: string; fileName: string }) {
  const [pdfjs, setPdfjs] = useState<PdfJs | null>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [availableWidth, setAvailableWidth] = useState(900);
  const [pageMode, setPageMode] = useState<PdfPageMode>(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches ? "single" : "dual"
  ));
  const [readerMode, setReaderMode] = useState<ReaderMode>("normal");
  const [pageDirection, setPageDirection] = useState<"next" | "previous">("next");
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<PdfMatch[]>([]);
  const [matchIndex, setMatchIndex] = useState(-1);
  const [searchStatus, setSearchStatus] = useState("");
  const [modeError, setModeError] = useState("");
  const readerRef = useRef<HTMLElement>(null);
  const previousReaderModeRef = useRef<ReaderMode>("normal");
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const thumbnailListRef = useRef<HTMLElement>(null);
  const [thumbnailStart, setThumbnailStart] = useState(0);
  const searchIdRef = useRef(0);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;
    void import("pdfjs-dist").then((module) => {
      if (!active) return;
      setPdfjs(module);
      module.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.mjs";
      loadingTask = module.getDocument({
        url: src,
        rangeChunkSize: 64 * 1024,
        disableAutoFetch: true,
        disableStream: true,
        cMapUrl: "/js/pdfjs-cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "/js/pdfjs-standard-fonts/",
      });
      return loadingTask.promise;
    }).then((loadedDocument) => {
      if (active && loadedDocument) {
        setDocument(loadedDocument);
        setError("");
      }
    }).catch((loadError: unknown) => {
      if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load this PDF.");
    });
    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [src]);

  useEffect(() => {
    const container = pageContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, [document]);

  useEffect(() => {
    const updatePageMode = () => {
      const nextMode: PdfPageMode = window.innerWidth <= 760 ? "single" : "dual";
      setPageMode(nextMode);
      setPageNumber((current) => alignPdfPage(current, current, nextMode));
    };
    window.addEventListener("resize", updatePageMode);
    return () => window.removeEventListener("resize", updatePageMode);
  }, []);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (window.document.fullscreenElement === readerRef.current) {
        setReaderMode("fullscreen");
      } else {
        setReaderMode((current) => current === "fullscreen" ? previousReaderModeRef.current : current);
      }
    };
    window.document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => window.document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const changePage = useCallback((nextPage: number) => {
    if (!document || !Number.isFinite(nextPage)) return;
    const alignedPage = alignPdfPage(nextPage, document.numPages, pageMode);
    if (pageNumber === alignedPage) return;
    setPageDirection(alignedPage > pageNumber ? "next" : "previous");
    setPageNumber(alignedPage);
  }, [document, pageMode, pageNumber]);

  const step = pageMode === "dual" ? 2 : 1;
  const lastPageStart = document
    ? getLastPdfSpreadStart(document.numPages, pageMode)
    : 1;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        if (window.document.fullscreenElement === readerRef.current) {
          return;
        }
        if (readerMode === "fullwindow") {
          event.preventDefault();
          event.stopPropagation();
          setReaderMode("normal");
          return;
        }
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement
        && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))
      ) return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key === "ArrowRight" && pageNumber < lastPageStart) {
        event.preventDefault();
        changePage(pageNumber + step);
      } else if (event.key === "ArrowLeft" && pageNumber > 1) {
        event.preventDefault();
        changePage(pageNumber - step);
      }
    };
    window.document.addEventListener("keydown", onKeyDown);
    return () => window.document.removeEventListener("keydown", onKeyDown);
  }, [changePage, lastPageStart, pageNumber, readerMode, step]);

  const setDisplayMode = useCallback((nextMode: ReaderMode) => {
    setModeError("");
    setReaderMode(nextMode);
    if (window.document.fullscreenElement && nextMode !== "fullscreen") {
      void window.document.exitFullscreen();
    }
  }, []);

  const enterFullscreen = useCallback(async () => {
    const element = readerRef.current;
    if (!element) return;
    setModeError("");
    try {
      previousReaderModeRef.current = readerMode;
      await element.requestFullscreen();
      setReaderMode("fullscreen");
    } catch (fullscreenError) {
      setModeError(fullscreenError instanceof Error ? fullscreenError.message : "Fullscreen mode could not be opened.");
    }
  }, [readerMode]);

  const setPagesMode = useCallback((nextMode: PdfPageMode) => {
    setPageMode(nextMode);
    if (document) setPageNumber((current) => alignPdfPage(current, document.numPages, nextMode));
  }, [document]);

  useEffect(() => {
    if (thumbnailListRef.current) {
      thumbnailListRef.current.scrollTop = Math.max(0, (pageNumber - 1) * THUMBNAIL_ROW_HEIGHT);
    }
  }, [pageNumber, showThumbnails]);

  const thumbnailCount = document
    ? Math.min(THUMBNAIL_WINDOW_SIZE, document.numPages)
    : 0;
  const thumbnailEnd = document
    ? Math.min(document.numPages, thumbnailStart + thumbnailCount)
    : 0;
  const firstThumbnail = Math.min(
    thumbnailStart,
    Math.max(0, (document?.numPages ?? 0) - thumbnailCount),
  );

  const searchDocument = useCallback(async () => {
    if (!document || !search.trim()) {
      setMatches([]);
      setMatchIndex(-1);
      setSearchStatus("");
      return;
    }
    const searchId = ++searchIdRef.current;
    const query = search.trim().toLocaleLowerCase();
    const found: PdfMatch[] = [];
    setMatches([]);
    setMatchIndex(-1);
    setSearchStatus("Searching…");
    try {
      for (let page = 1; page <= document.numPages; page += 1) {
        const content = await (await document.getPage(page)).getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        if (text.toLocaleLowerCase().includes(query)) found.push({ page, text });
        if (searchId !== searchIdRef.current) return;
        if (page % 8 === 0) setSearchStatus(`Searching page ${page} of ${document.numPages}…`);
      }
      if (searchId !== searchIdRef.current) return;
      setMatches(found);
      setMatchIndex(found.length ? 0 : -1);
      setSearchStatus(found.length ? `${found.length} matching page${found.length === 1 ? "" : "s"}` : "No matches found");
      if (found[0]) changePage(found[0].page);
    } catch (searchError) {
      if (searchId === searchIdRef.current) {
        setSearchStatus(searchError instanceof Error ? searchError.message : "Search failed.");
      }
    }
  }, [changePage, document, search]);

  const moveMatch = useCallback((direction: -1 | 1) => {
    if (!matches.length) return;
    const nextIndex = (matchIndex + direction + matches.length) % matches.length;
    setMatchIndex(nextIndex);
    changePage(matches[nextIndex].page);
  }, [changePage, matchIndex, matches]);

  return (
    <section ref={readerRef} className={`pdf-reader is-${readerMode}`} aria-label={`PDF reader for ${fileName}`}>
      <div className="pdf-reader-toolbar">
        <div className="pdf-toolbar-start">
          <button
            className={`reader-action pdf-icon-action${showThumbnails ? " is-active" : ""}`}
            type="button"
            onClick={() => setShowThumbnails((shown) => !shown)}
            aria-expanded={showThumbnails}
            aria-label={showThumbnails ? "Hide page thumbnails" : "Show page thumbnails"}
            title={showThumbnails ? "Hide page thumbnails" : "Show page thumbnails"}
          >
            <span aria-hidden="true">▤</span>
          </button>
          <div className="pdf-control-group" role="group" aria-label="Page navigation">
            <button
              className="reader-action pdf-icon-action"
              type="button"
              onClick={() => changePage(pageNumber - step)}
              disabled={!document || pageNumber <= 1}
              aria-label="Previous page"
              title="Previous page (←)"
            >
              <span aria-hidden="true">←</span>
            </button>
            <label className="pdf-page-control">
              <input
                type="number"
                min={1}
                max={document?.numPages ?? 1}
                value={pageNumber}
                onChange={(event) => changePage(Number(event.currentTarget.value))}
                aria-label="Current page"
                disabled={!document}
              />
              <span>
                {pageMode === "dual" && pageNumber < (document?.numPages ?? 0) ? `–${pageNumber + 1} ` : ""}
                of {document?.numPages ?? "…"}
              </span>
            </label>
            <button
              className="reader-action pdf-icon-action"
              type="button"
              onClick={() => changePage(pageNumber + step)}
              disabled={!document || pageNumber >= lastPageStart}
              aria-label="Next page"
              title="Next page (→)"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
          <div className="pdf-control-group" role="group" aria-label="Zoom controls">
            <button className="reader-action pdf-icon-action" type="button" onClick={() => setZoom((value) => Math.max(50, value - 10))} disabled={zoom <= 50} aria-label="Zoom out" title="Zoom out">
              <span aria-hidden="true">−</span>
            </button>
            <span className="pdf-zoom-value">{zoom}%</span>
            <button className="reader-action pdf-icon-action" type="button" onClick={() => setZoom((value) => Math.min(200, value + 10))} disabled={zoom >= 200} aria-label="Zoom in" title="Zoom in">
              <span aria-hidden="true">+</span>
            </button>
            <button className="reader-action pdf-fit-action" type="button" onClick={() => setZoom(100)}>Fit</button>
          </div>
        </div>
        <div className="pdf-toolbar-end">
          {readerMode !== "normal" && <span className="pdf-document-name" title={fileName}>{fileName}</span>}
          <form className="pdf-search" onSubmit={(event) => { event.preventDefault(); void searchDocument(); }}>
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                searchIdRef.current += 1;
                setMatches([]);
                setMatchIndex(-1);
                setSearchStatus("");
              }}
              placeholder="Find in PDF"
              aria-label="Find in PDF"
            />
            <button className="reader-action pdf-find-action" type="submit" disabled={!document || !search.trim()}>Find</button>
          </form>
          <span className="pdf-search-status" aria-live="polite">{searchStatus}</span>
          <div className="pdf-search-nav">
            <button className="reader-action pdf-icon-action" type="button" onClick={() => moveMatch(-1)} disabled={!matches.length} aria-label="Previous match" title="Previous match">
              <span aria-hidden="true">↑</span>
            </button>
            <button className="reader-action pdf-icon-action" type="button" onClick={() => moveMatch(1)} disabled={!matches.length} aria-label="Next match" title="Next match">
              <span aria-hidden="true">↓</span>
            </button>
          </div>
          <div className="pdf-control-group pdf-page-mode" role="group" aria-label="Page layout">
            <button className={`reader-action${pageMode === "single" ? " is-active" : ""}`} type="button" onClick={() => setPagesMode("single")} aria-pressed={pageMode === "single"}>Single</button>
            <button className={`reader-action${pageMode === "dual" ? " is-active" : ""}`} type="button" onClick={() => setPagesMode("dual")} aria-pressed={pageMode === "dual"}>Two pages</button>
          </div>
          <a className="reader-action pdf-download-action" href={src} download={fileName}>Download</a>
          <div className="pdf-control-group pdf-reader-mode" role="group" aria-label="Reader display mode">
            <button className={`reader-action${readerMode === "normal" ? " is-active" : ""}`} type="button" onClick={() => setDisplayMode("normal")} aria-pressed={readerMode === "normal"} title="Default reader layout">Normal</button>
            <button className={`reader-action${readerMode === "fullwindow" ? " is-active" : ""}`} type="button" onClick={() => setDisplayMode("fullwindow")} aria-pressed={readerMode === "fullwindow"} title="Fill the browser window">Window</button>
            <button className={`reader-action${readerMode === "fullscreen" ? " is-active" : ""}`} type="button" onClick={() => readerMode === "fullscreen" ? void window.document.exitFullscreen() : void enterFullscreen()} aria-pressed={readerMode === "fullscreen"} title={readerMode === "fullscreen" ? "Exit fullscreen" : "Enter fullscreen"}>Fullscreen</button>
          </div>
          {readerMode === "fullwindow" && (
            <button className="reader-action pdf-mode-cancel" type="button" onClick={() => setDisplayMode("normal")}>
              <span aria-hidden="true">×</span> Cancel
            </button>
          )}
        </div>
        {modeError && <span className="pdf-mode-error" role="alert">{modeError}</span>}
      </div>
      {readerMode === "fullscreen" && (
        <button
          className="reader-action pdf-mode-cancel is-floating"
          type="button"
          onClick={() => void window.document.exitFullscreen()}
          aria-label="Cancel fullscreen and return to the reader"
          title="Exit fullscreen"
        >
          <span aria-hidden="true">×</span> Cancel
        </button>
      )}
      {error ? (
        <div className="reader-message reader-error" role="alert">
          <strong>Could not open this PDF</strong>
          <span>{error}</span>
        </div>
      ) : (
        <div className="pdf-reader-body">
          {showThumbnails && document && (
            <aside
              ref={thumbnailListRef}
              className="pdf-thumbnails"
              aria-label="PDF pages"
              onScroll={(event) => {
                const nextStart = Math.max(0, Math.floor(event.currentTarget.scrollTop / THUMBNAIL_ROW_HEIGHT) - 2);
                setThumbnailStart((current) => current === nextStart ? current : nextStart);
              }}
            >
              <div aria-hidden="true" style={{ height: firstThumbnail * THUMBNAIL_ROW_HEIGHT, flex: "0 0 auto" }} />
              {Array.from({ length: thumbnailEnd - firstThumbnail }, (_, index) => {
                const thumbnailPage = firstThumbnail + index + 1;
                return (
                  <PdfThumbnail
                    key={thumbnailPage}
                    document={document}
                    pageNumber={thumbnailPage}
                    selected={thumbnailPage === pageNumber}
                    onSelect={changePage}
                  />
                );
              })}
              <div aria-hidden="true" style={{ height: (document.numPages - thumbnailEnd) * THUMBNAIL_ROW_HEIGHT, flex: "0 0 auto" }} />
            </aside>
          )}
          <div className="pdf-page-viewport" ref={pageContainerRef} tabIndex={0} aria-label="PDF page canvas">
            {document && pdfjs ? (
              <div key={pageNumber} className="pdf-page-spread" data-direction={pageDirection}>
                <PdfPageView
                  document={document}
                  pdfjs={pdfjs}
                  pageNumber={pageNumber}
                  availableWidth={availableWidth}
                  zoom={zoom}
                  search={search}
                  pageMode={pageMode}
                  readerMode={readerMode}
                  onError={setError}
                />
                {pageMode === "dual" && pageNumber < document.numPages && (
                  <PdfPageView
                    document={document}
                    pdfjs={pdfjs}
                    pageNumber={pageNumber + 1}
                    availableWidth={availableWidth}
                    zoom={zoom}
                    search={search}
                    pageMode={pageMode}
                    readerMode={readerMode}
                    onError={setError}
                  />
                )}
              </div>
            ) : (
              <div className="reader-message">Loading PDF…</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
