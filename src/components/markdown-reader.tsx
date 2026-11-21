"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import createDOMPurify from "dompurify";
import { loadMarkdownRuntime } from "@/lib/markdown-runtime";

const PdfReader = dynamic(() => import("./pdf-reader"), {
  ssr: false,
  loading: () => <div className="reader-message">Preparing the PDF reader…</div>,
});

type ReaderFile = {
  branch: string;
  fileName: string;
  filePath: string;
  fileSha: string;
  repository: string;
};

type ReaderState = "loading" | "rendering" | "ready" | "error";
type ReaderWindow = Window & {
  _currentNotePath?: string;
  __notebooksResolveEmbed?: (fileName: string) => string;
  markdownToHTML?: (source: string, filePath?: string) => string;
  initMarkdownFeatures?: (container: Element) => Promise<void>;
};

type OutlineItem = { id: string; level: number; title: string };
type HtmlSanitizer = ReturnType<typeof createDOMPurify>;

function isExternalOrSpecialUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value);
}

function resolveRepositoryPath(filePath: string, relativeTo: string): string | null {
  if (!filePath || filePath.includes("\0")) return null;
  const absolute = filePath.startsWith("/");
  const parts = absolute ? [] : relativeTo.split("/").slice(0, -1);
  for (const segment of filePath.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(segment);
    }
  }
  return parts.length > 0 ? parts.join("/") : null;
}

function publicMediaUrl(file: ReaderFile, path: string): string | null {
  const [cleanPath, fragment] = path.split("#", 2);
  const resolvedPath = resolveRepositoryPath(cleanPath, file.filePath);
  if (!resolvedPath) return null;
  const [owner, repository] = file.repository.split("/");
  if (!owner || !repository) return null;
  const params = new URLSearchParams({ owner, repo: repository, path: resolvedPath });
  return `/api/media?${params.toString()}${fragment ? `#${encodeURIComponent(fragment)}` : ""}`;
}

function catalogMediaUrl(file: ReaderFile): string {
  const [owner, repository] = file.repository.split("/");
  const params = new URLSearchParams({ owner, repo: repository, path: file.filePath });
  return `/api/media?${params.toString()}`;
}

function isMarkdownFile(path: string): boolean {
  return /\.(?:md|markdown|mdx)$/i.test(path);
}

function catalogRawUrl(file: ReaderFile, path: string): string {
  const [owner, repository] = file.repository.split("/");
  const params = new URLSearchParams({ owner, repo: repository, path });
  return `/api/raw?${params.toString()}`;
}

function configureRuntimeFile(runtimeWindow: ReaderWindow, file: ReaderFile): void {
  runtimeWindow.__notebooksResolveEmbed = (name) => {
    if (isExternalOrSpecialUrl(name)) return name;
    const path = resolveRepositoryPath(name, file.filePath);
    if (path && isMarkdownFile(path)) return catalogRawUrl(file, path);
    return publicMediaUrl(file, name) ?? name;
  };
}

function createReaderSanitizer(windowRef: Window & typeof globalThis): HtmlSanitizer {
  const purifier = createDOMPurify(windowRef);
  purifier.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName !== "IFRAME" || data.attrName !== "src") return;
    try {
      const iframeUrl = new URL(data.attrValue, windowRef.location.origin);
      if (iframeUrl.origin !== windowRef.location.origin || !iframeUrl.pathname.startsWith("/api/media")) {
        data.keepAttr = false;
      }
    } catch {
      data.keepAttr = false;
    }
  });
  return purifier;
}

async function loadNoteTransclusions(
  container: HTMLElement,
  file: ReaderFile,
  purifier: HtmlSanitizer,
  visited = new Set([file.filePath]),
  depth = 0,
  signal?: AbortSignal,
): Promise<void> {
  if (depth >= 4) return;
  const runtimeWindow = window as ReaderWindow;
  for (const block of container.querySelectorAll<HTMLElement>(".obsidian-transclusion:not([data-loaded])")) {
    const requestedPath = block.dataset.src;
    const path = requestedPath ? resolveRepositoryPath(requestedPath, file.filePath) : null;
    if (!path || !isMarkdownFile(path)) continue;
    if (visited.has(path)) {
      block.textContent = "This note embed contains a circular reference.";
      block.dataset.loaded = "true";
      continue;
    }

    try {
      const response = await fetch(catalogRawUrl(file, path), { signal });
      if (!response.ok) throw new Error(`Embedded note request failed (${response.status}).`);
      const source = await response.text();
      const fileName = path.split("/").at(-1) ?? path;
      const embeddedFile: ReaderFile = {
        ...file,
        fileName,
        filePath: path,
        fileSha: response.headers.get("x-file-sha") ?? "",
      };
      configureRuntimeFile(runtimeWindow, embeddedFile);
      const rendered = runtimeWindow.markdownToHTML?.(source, path);
      if (typeof rendered !== "string") throw new Error("The Markdown renderer is unavailable for an embedded note.");
      const safeHtml = purifier.sanitize(rendered, {
        ADD_TAGS: ["iframe"],
        ADD_ATTR: ["allowfullscreen", "loading", "sandbox"],
        USE_PROFILES: { html: true, mathMl: true, svg: true },
      });
      block.innerHTML = prepareRenderedHtml(safeHtml, embeddedFile);
      block.dataset.loaded = "true";
      const nextVisited = new Set(visited);
      nextVisited.add(path);
      await loadNoteTransclusions(block, embeddedFile, purifier, nextVisited, depth + 1, signal);
    } catch (error) {
      if (signal?.aborted) return;
      console.error("Markdown note embed failed", error);
      block.textContent = "This embedded note could not be loaded.";
      block.dataset.loaded = "true";
    }
  }
}

function mediaPreviewKind(path: string): "image" | "audio" | "video" | "pdf" | "download" | null {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (!extension) return null;
  if (["bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"].includes(extension)) return "image";
  if (["flac", "m4a", "mp3", "ogg", "wav"].includes(extension)) return "audio";
  if (["mkv", "mov", "mp4", "webm"].includes(extension)) return "video";
  if (extension === "pdf") return "pdf";
  if (["doc", "docx", "ppt", "pptx", "xls", "xlsx"].includes(extension)) return "download";
  return null;
}

function prepareRenderedHtml(html: string, file: ReaderFile): string {
  const template = document.createElement("template");
  template.innerHTML = html;

  template.content.querySelectorAll<HTMLElement>("img[src], audio[src], video[src], audio source[src], video source[src], iframe[src]").forEach((element) => {
    const source = element.getAttribute("src");
    if (!source || isExternalOrSpecialUrl(source) || source.startsWith("/api/")) return;
    if (source.startsWith("/bin/") || source.startsWith("/fonts/")) return;
    const mediaUrl = publicMediaUrl(file, source);
    if (mediaUrl) element.setAttribute("src", mediaUrl);
  });

  template.content.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((link) => {
    const href = link.getAttribute("href");
    if (!href || isExternalOrSpecialUrl(href) || href.startsWith("/api/")) return;
    const path = resolveRepositoryPath(href, file.filePath);
    if (!path) return;
    if (mediaPreviewKind(path)) {
      const mediaUrl = publicMediaUrl(file, path);
      if (mediaUrl) {
        link.href = mediaUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        return;
      }
    }
    const [owner, repository] = file.repository.split("/");
    if (!owner || !repository) return;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const branch = file.branch.split("/").map(encodeURIComponent).join("/");
    link.href = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/blob/${branch}/${encodedPath}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  });

  return template.innerHTML;
}

function makeOutline(container: HTMLElement): OutlineItem[] {
  const usedIds = new Set<string>();
  return Array.from(container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")).map((heading) => {
    const title = heading.textContent?.trim() || "Untitled section";
    const baseId = heading.id || title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "section";
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    heading.id = id;
    return { id, level: Number(heading.tagName.slice(1)), title };
  });
}

export function MarkdownReader({ file, onClose }: { file: ReaderFile; onClose: () => void }) {
  const [state, setState] = useState<ReaderState>(() => mediaPreviewKind(file.filePath) ? "ready" : "loading");
  const [error, setError] = useState("");
  const [source, setSource] = useState("");
  const [html, setHtml] = useState("");
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [owner, repository] = file.repository.split("/");
  const sourceUrl = useMemo(() => {
    const params = new URLSearchParams({ owner, repo: repository, path: file.filePath });
    return `/api/raw?${params.toString()}`;
  }, [file.filePath, owner, repository]);
  const markdownFile = isMarkdownFile(file.filePath);
  const previewKind = mediaPreviewKind(file.filePath);
  const mediaUrl = useMemo(() => catalogMediaUrl(file), [file]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    if (previewKind) {
      return () => {
        active = false;
        controller.abort();
      };
    }

    void (async () => {
      try {
        const [response] = await Promise.all([
          fetch(sourceUrl, { signal: controller.signal, cache: "force-cache" }),
          markdownFile ? loadMarkdownRuntime() : Promise.resolve(),
        ]);
        if (!active) return;
        if (!response.ok) throw new Error(`Unable to open this note (${response.status}).`);
        const markdown = await response.text();
        if (!active) return;

        if (!markdownFile) {
          setSource(markdown);
          setState("ready");
          return;
        }

        const runtimeWindow = window as ReaderWindow;
        const purifier = createReaderSanitizer(window);
        configureRuntimeFile(runtimeWindow, file);
        const rendered = runtimeWindow.markdownToHTML?.(markdown, file.filePath);
        if (typeof rendered !== "string") throw new Error("The Markdown renderer did not return a document.");
        const sanitized = purifier.sanitize(rendered, {
          ADD_TAGS: ["iframe"],
          ADD_ATTR: ["allowfullscreen", "loading", "sandbox"],
          USE_PROFILES: { html: true, mathMl: true, svg: true },
        });
        if (!active) return;

        setSource(markdown);
        setHtml(prepareRenderedHtml(sanitized, file));
        setState("rendering");
      } catch (loadError) {
        if (!active || controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to open this note.");
        setState("error");
      }
    })();

    return () => {
      active = false;
      controller.abort();
      window.speechSynthesis?.cancel();
    };
  }, [file, markdownFile, previewKind, sourceUrl, reloadKey]);

  useEffect(() => {
    if (state !== "rendering" || !contentRef.current) return;
    const container = contentRef.current;
    const controller = new AbortController();
    let active = true;
    const runtimeWindow = window as ReaderWindow;
    void (async () => {
      try {
        await loadNoteTransclusions(container, file, createReaderSanitizer(window), undefined, 0, controller.signal);
        await runtimeWindow.initMarkdownFeatures?.(container);
      } catch (featureError) {
        if (controller.signal.aborted) return;
        console.error("Markdown feature initialization failed", featureError);
        if (!active) return;
        setError("A required Markdown rendering library could not be loaded. Check your connection and try again.");
        setState("error");
        return;
      }
      if (!active) return;
      setOutline(makeOutline(container));
      setState("ready");
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [file, html, state]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.document.fullscreenElement) return;
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const toggleSpeech = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = contentRef.current?.innerText || source;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }, [source, speaking]);

  const goToHeading = useCallback((id: string) => {
    setShowOutline(false);
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  return (
    <section className="reader-overlay" role="dialog" aria-modal="true" aria-label={`Reading ${file.fileName}`}>
      <header className="reader-toolbar">
        <button ref={closeButtonRef} className="reader-action reader-close" type="button" onClick={onClose} aria-label="Close reader">← <span>Library</span></button>
        <div className="reader-title">
          <strong>{file.fileName}</strong>
          <span>{file.repository} / {file.filePath}</span>
        </div>
        <div className="reader-actions">
          <button className={`reader-action ${showOutline ? "is-active" : ""}`} type="button" onClick={() => setShowOutline((shown) => !shown)} disabled={outline.length === 0} aria-expanded={showOutline}>Outline</button>
          <button className={`reader-action ${showRaw ? "is-active" : ""}`} type="button" onClick={() => setShowRaw((raw) => !raw)} disabled={state !== "ready" || !markdownFile} aria-pressed={showRaw}>{showRaw ? "Rendered" : "Raw"}</button>
          <button className="reader-action" type="button" onClick={toggleSpeech} disabled={state !== "ready" || typeof window === "undefined" || !("speechSynthesis" in window) || Boolean(previewKind)}>{speaking ? "Stop reading" : "Read aloud"}</button>
          <a className="reader-action reader-github" href={`https://github.com/${file.repository}/blob/${file.branch.split("/").map(encodeURIComponent).join("/")}/${file.filePath.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer">GitHub ↗</a>
        </div>
      </header>

      <div className="reader-layout">
        <main className="reader-main" aria-live="polite">
          {(state === "loading" || state === "rendering") && (
            <div className="reader-loading-overlay" role="status" aria-live="polite" aria-busy="true">
              <span className="reader-loading-mark" aria-hidden="true">&gt;</span>
              <strong>Rendering your file</strong>
              <span>{state === "loading" ? "Opening the file…" : "Preparing diagrams and math…"}</span>
            </div>
          )}
          {state === "error" && (
            <div className="reader-message reader-error" role="alert">
              <strong>Could not open this note</strong>
              <span>{error}</span>
              <button type="button" className="reader-action" onClick={() => { setState("loading"); setReloadKey((key) => key + 1); }}>Try again</button>
            </div>
          )}
          {state === "ready" && previewKind === "image" && <Image className="reader-media-image" src={mediaUrl} width={1200} height={900} unoptimized alt={file.fileName} />}
          {state === "ready" && previewKind === "audio" && <audio className="reader-media-audio" src={mediaUrl} controls />}
          {state === "ready" && previewKind === "video" && <video className="reader-media-video" src={mediaUrl} controls />}
          {state === "ready" && previewKind === "pdf" && (
            <PdfReader
              key={file.repository + "/" + file.filePath}
              src={mediaUrl}
              fileName={file.fileName}
              fileKey={`${file.repository}/${file.filePath}`}
            />
          )}
          {state === "ready" && previewKind === "download" && <a className="reader-media-download" href={mediaUrl}>Download {file.fileName}</a>}
          {showRaw && state === "ready" && markdownFile ? (
            <pre className="reader-raw"><code>{source}</code></pre>
          ) : state === "ready" && !markdownFile && !previewKind ? (
            <pre className="reader-raw"><code>{source}</code></pre>
          ) : markdownFile ? (
            <div
              className="markdown-reader"
              hidden={showRaw}
            >
              <div
                ref={contentRef}
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ) : null}
        </main>
        {showOutline && outline.length > 0 && (
          <aside className="reader-outline" aria-label="Document outline">
            <div className="reader-outline-heading">ON THIS PAGE</div>
            {outline.map((item) => (
              <button
                className="reader-outline-item"
                key={item.id}
                style={{ "--outline-depth": item.level - 1 } as CSSProperties}
                type="button"
                onClick={() => goToHeading(item.id)}
              >
                {item.title}
              </button>
            ))}
          </aside>
        )}
      </div>
    </section>
  );
}
