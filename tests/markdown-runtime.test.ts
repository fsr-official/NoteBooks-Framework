import fs from 'fs';
import path from 'path';
import vm from 'vm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import createApp from '../src/server/server';

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
  it('serves valid font assets and avoids bad vendor redirects', async () => {
    const app = createApp();
    const styleSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/css/style.css'), 'utf8');
    const tikzFontSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/bin/tikzjax/css/fonts.css'), 'utf8');

    expect(styleSource).toContain('url("/public/fonts/TestTiemposText-Regular.otf")');
    expect(styleSource).not.toContain('url("fonts/TestTiemposText-Regular.otf")');
    expect(tikzFontSource).toContain('font-family: cmr10');
    expect(tikzFontSource).not.toContain('font-family: cmr6');

    const desmosResponse = await request(app).get('/api/desmos.js');
    expect(desmosResponse.status).toBe(200);
    expect(desmosResponse.headers['content-type']).toContain('application/javascript');
    expect(desmosResponse.text).toContain('Desmos API key is not configured');
    expect(desmosResponse.text).not.toContain('res.redirect');
  });

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
    const markdownVendorsSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/js/markdown-vendors.js'), 'utf8');
    const readingPreferencesSource = fs.readFileSync(path.resolve(__dirname, '..', 'public/js/reading-preferences.js'), 'utf8');
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
    expect(markdownVendorsSource).toContain("load: ['[tex]/boldsymbol']");
    expect(markdownVendorsSource).toContain("packages: { '[+]': ['ams', 'boldsymbol'] }");
    expect(readingPreferencesSource).toContain("narrow: '72ch'");
    expect(readingPreferencesSource).toContain("comfortable: '88ch'");
    expect(readingPreferencesSource).toContain("wide: '104ch'");
    expect(styleSource).toContain('var(--reader-content-width, 88ch)');
    expect(serviceWorkerSource).toContain("CACHE_VERSION = 'webman-v47'");
    expect(serviceWorkerSource).toContain('public/client/observability.js');
  });

  it('renders svg fences as inline SVG and strips unsafe SVG content', () => {
    const context = createContext();
    const fakeMarkdownIt = function () {
      const md = {
        renderer: {
          rules: {
            fence: function () {
              return '<pre>fallback code block</pre>';
            }
          }
        },
        use() {
          return md;
        }
      };
      return md;
    };

    context.window.markdownit = fakeMarkdownIt;
    context.window.obsidianPlugin = function () {};
    context.window.obsidianGetCSS = function () { return ''; };
    context.window.obsidianParseFrontmatter = (raw: string) => ({ content: raw });
    context.markdownit = fakeMarkdownIt;
    context.obsidianPlugin = context.window.obsidianPlugin;
    context.obsidianGetCSS = context.window.obsidianGetCSS;
    context.obsidianParseFrontmatter = context.window.obsidianParseFrontmatter;

    loadScript('public/js/md-init.js', context);
    loadScript('public/js/markdown.js', context);

    const renderer = context.window.initializeMarkdownRenderer();
    const safeSvg = '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#34d399" /></svg>';
    const unsafeSvg = '<svg><script>alert(1)</script><circle cx="5" cy="5" r="4" fill="#34d399" /></svg>';

    const safeHtml = renderer.renderer.rules.fence([{ info: 'svg', content: safeSvg }], 0, {}, {}, { renderToken: () => 'token' });
    const unsafeHtml = renderer.renderer.rules.fence([{ info: 'svg', content: unsafeSvg }], 0, {}, {}, { renderToken: () => 'token' });

    expect(safeHtml).toContain('<svg');
    expect(safeHtml).toContain('viewBox="0 0 10 10"');
    expect(unsafeHtml).not.toContain('<script');
    expect(unsafeHtml).toContain('<circle');
  });
});
