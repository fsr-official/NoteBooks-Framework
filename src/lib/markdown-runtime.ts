"use client";

type MarkdownWindow = Window & {
  __notebooksMarkdownScripts?: Map<string, Promise<void>>;
  initializeMarkdownRenderer?: () => { render: (source: string) => string } | null;
  markdownToHTML?: (source: string, filePath?: string) => string;
  initMarkdownFeatures?: (container: Element) => Promise<void>;
};

const CDN_SCRIPTS = [
  "https://cdn.jsdelivr.net/npm/markdown-it@14/dist/markdown-it.min.js",
  "https://cdn.jsdelivr.net/npm/markdown-it-sub@1/dist/markdown-it-sub.min.js",
  "https://cdn.jsdelivr.net/npm/markdown-it-sup@1/dist/markdown-it-sup.min.js",
  "https://cdn.jsdelivr.net/npm/markdown-it-footnote@3/dist/markdown-it-footnote.min.js",
] as const;

const LOCAL_SCRIPTS = [
  "/js/obsidian-markdown-it.js",
  "/js/markdown-vendors.js",
  "/js/md-init.js",
  "/js/markdown.js",
] as const;

function appendScript(source: string): Promise<void> {
  const runtimeWindow = window as MarkdownWindow;
  const scripts = runtimeWindow.__notebooksMarkdownScripts ?? new Map<string, Promise<void>>();
  runtimeWindow.__notebooksMarkdownScripts = scripts;

  const pending = scripts.get(source);
  if (pending) return pending;

  const scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-notebooks-markdown-src="${source}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing ?? document.createElement("script");
    script.dataset.notebooksMarkdownSrc = source;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      scripts.delete(source);
      reject(new Error(`Unable to load Markdown dependency: ${source}`));
    };
    if (!existing) {
      script.src = source;
      document.head.appendChild(script);
    }
  });

  scripts.set(source, scriptPromise);
  return scriptPromise;
}

export async function loadMarkdownRuntime(): Promise<void> {
  await Promise.all(CDN_SCRIPTS.map(appendScript));
  for (const script of LOCAL_SCRIPTS) {
    await appendScript(script);
  }

  const runtimeWindow = window as MarkdownWindow;
  if (!runtimeWindow.initializeMarkdownRenderer?.()) {
    throw new Error("Markdown renderer dependencies loaded, but the renderer could not be initialized.");
  }
  if (typeof runtimeWindow.markdownToHTML !== "function" || typeof runtimeWindow.initMarkdownFeatures !== "function") {
    throw new Error("Markdown renderer entry points are unavailable.");
  }
}
