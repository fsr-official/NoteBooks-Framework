import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { describe, expect, it } from 'vitest';

function loadScript(relativePath: string, context: any) {
  const absolutePath = path.resolve(__dirname, '..', relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  vm.runInNewContext(source, context, { filename: absolutePath });
}

function createContext() {
  const document = {
    createElement(tagName: string) {
      return { tagName: tagName.toUpperCase(), textContent: '', id: '' };
    },
    head: {
      appendChild() {
        return null;
      }
    },
    getElementById() {
      return null;
    }
  };

  const window = {
    document,
    console,
    setTimeout,
    clearTimeout,
    matchMedia() {
      return { matches: false, addEventListener() {} };
    }
  };

  const context = {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    mermaid: undefined,
    markdownit: undefined,
    markdownitSub: undefined,
    markdownitSup: undefined,
    markdownitFootnote: undefined,
    obsidianPlugin: undefined,
    obsidianGetCSS: undefined,
    obsidianParseFrontmatter: undefined,
    global: null as any,
    self: null as any
  };

  context.window = window;
  context.document = document;
  context.global = context;
  context.self = context;
  (window as any).window = window;
  (window as any).global = context;
  (window as any).self = context;
  return context;
}

describe('markdown runtime bootstrap', () => {
  it('reports missing dependencies instead of crashing the preview renderer', () => {
    const context = createContext();
    loadScript('public/js/md-init.js', context);
    loadScript('public/js/markdown.js', context);

    context.window.obsidianParseFrontmatter = (raw: string) => ({ content: raw });

    const html = context.window.markdownToHTML('Hello world', '/notes/test.md');

    expect(html).toContain('Markdown preview unavailable');
    expect(context.window.__markdownRuntimeError).toContain('markdown-it');
  });

  it('keeps the reader controls source-aware and connected to Issues proposals', () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/js/app.js'), 'utf8');
    const styleSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/css/style.css'), 'utf8');
    const mdInitSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/js/md-init.js'), 'utf8');
    const serviceWorkerSource = fs.readFileSync(path.resolve(__dirname, '..', 'service-worker.js'), 'utf8');

    expect(appSource).toContain('data-mode="raw">Raw view');
    expect(appSource).toContain('raw-source-line');
    expect(appSource).toContain('sourceStartLine: evidence.startLine');
    expect(appSource).toContain("fetch('/api/issues/proposals'");
    expect(styleSource).toContain('.raw-markdown-line-view');
    expect(styleSource).toContain('.raw-line-number');
    expect(styleSource).toContain('.suggest-changes-dialog');
    expect(styleSource).toContain('.markdown-content .note-figure');
    expect(styleSource).toContain('.markdown-content h4 {');
    expect(styleSource).not.toContain('letter-spacing: 0.5px;\n  font-size: 0.9em;');
    expect(mdInitSource).toContain('renderDiagramFence');
    expect(mdInitSource).toContain("securityLevel: 'strict'");
    expect(serviceWorkerSource).toContain("CACHE_VERSION = 'webman-v40'");
    expect(serviceWorkerSource).toContain('public/client/observability.js');
  });
});
