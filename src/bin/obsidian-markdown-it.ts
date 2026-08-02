/**
 * obsidian-markdown-it.js  (IIFE / plain-script build)
 * ─────────────────────────────────────────────────────
 * Obsidian-syntax compatibility layer for markdown-it.
 * Load with a plain <script> tag (no type="module" needed).
 * Must be loaded AFTER markdown-it.
 *
 * Exposes on window:
 *   obsidianPlugin(md, opts)          – md.use() plugin function
 *   obsidianParseFrontmatter(raw)     – strips YAML front-matter
 *   obsidianGetCSS()                  – companion stylesheet string
 *   obsidianGetToggleScript()         – callout fold JS string
 *   obsidianInitCalloutFolds(root)    – activate foldable callout toggles
 *   obsidianInitMath(root)            – render math with MathJax (async, returns Promise)
 *   obsidianInitMermaid(root)         – render Mermaid diagrams (if loaded)
 *   obsidianInitHighlight(root)       – apply highlight.js to code blocks
 *
 * Supported Obsidian features:
 *   ✓ [[Wikilinks]] / [[Page|Alias]] / [[Page#Heading]]
 *   ✓ ![[Embeds]] — image, audio, video, PDF, note transclusion
 *   ✓ Callouts > [!NOTE] / [!TIP]+ (foldable) / [!WARN]-
 *   ✓ ==Highlight==
 *   ✓ ~~Strikethrough~~
 *   ✓ Task lists [ ] [x] [/] [-] [!] [>] [<] [?] + more
 *   ✓ #Tags
 *   ✓ Block IDs  ^blockid
 *   ✓ %% Comments %%
 *   ✓ $inline math$ and $$block math$$  (MathJax rendering when available)
 *   ✓ ```tikz blocks                       (TikZJax rendering when available)
 *   ✓ ```mermaid blocks  (Mermaid.js rendering when available)
 *   ✓ Syntax-highlighted code blocks (highlight.js when available)
 *   ✓ YAML front-matter stripping
 */
(function (global) {
  'use strict';

  /* ── Constants ─────────────────────────────────────────────────────────── */

  var CALLOUT_TYPES = {
    note:1, abstract:1, summary:1, tldr:1,
    info:1, todo:1,
    tip:1, hint:1, important:1,
    success:1, check:1, done:1,
    question:1, help:1, faq:1,
    warning:1, caution:1, attention:1,
    failure:1, fail:1, missing:1,
    danger:1, error:1,
    bug:1, example:1, quote:1, cite:1
  };

  var CALLOUT_ICONS = {
    note:'📝', abstract:'📋', summary:'📋', tldr:'📋',
    info:'ℹ️',  todo:'☑️',
    tip:'💡',  hint:'💡',  important:'💡',
    success:'✅', check:'✅', done:'✅',
    question:'❓', help:'❓', faq:'❓',
    warning:'⚠️', caution:'⚠️', attention:'⚠️',
    failure:'❌', fail:'❌', missing:'❌',
    danger:'🔥', error:'🔥',
    bug:'🐛', example:'📌', quote:'💬', cite:'💬'
  };

  var EMBED_EXTS = {
    image: /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i,
    audio: /\.(mp3|wav|ogg|flac|aac|m4a|opus)$/i,
    video: /\.(mp4|webm|ogv|mov|mkv)$/i,
    pdf  : /\.pdf$/i,
    note : /\.(md|markdown)$/i
  };

  /**
   * Obsidian extended task-list states.
   * Key = character inside [ ], value = { class, checked, icon, label }.
   */
  var TASK_STATES = {
    ' ': { cls: 'task-open',        checked: false, icon: '○', label: 'Open'        },
    'x': { cls: 'task-done',        checked: true,  icon: '✓', label: 'Done'        },
    'X': { cls: 'task-done',        checked: true,  icon: '✓', label: 'Done'        },
    '/': { cls: 'task-in-progress', checked: false, icon: '◑', label: 'In Progress' },
    '-': { cls: 'task-cancelled',   checked: false, icon: '—', label: 'Cancelled'   },
    '!': { cls: 'task-important',   checked: false, icon: '!', label: 'Important'   },
    '>': { cls: 'task-deferred',    checked: false, icon: '»', label: 'Deferred'    },
    '<': { cls: 'task-scheduled',   checked: false, icon: '◷', label: 'Scheduled'   },
    '?': { cls: 'task-question',    checked: false, icon: '?', label: 'Question'    },
    'f': { cls: 'task-fun',         checked: false, icon: '★', label: 'Fun'         },
    'i': { cls: 'task-info',        checked: false, icon: 'i', label: 'Info'        },
    'l': { cls: 'task-location',    checked: false, icon: '⌖', label: 'Location'    },
    'p': { cls: 'task-pro',         checked: false, icon: '↑', label: 'Pro'         },
    'c': { cls: 'task-con',         checked: false, icon: '↓', label: 'Con'         },
    'b': { cls: 'task-bookmark',    checked: false, icon: '🔖', label: 'Bookmark'   },
    '*': { cls: 'task-star',        checked: false, icon: '⭐', label: 'Star'        },
    'u': { cls: 'task-up',          checked: false, icon: '↑', label: 'Up-vote'     },
    'd': { cls: 'task-down',        checked: false, icon: '↓', label: 'Down-vote'   }
  };

  /* ── Utility helpers ───────────────────────────────────────────────────── */

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function detectEmbedType(name) {
    var clean = name.split('|')[0].split('#')[0].trim();
    for (var t in EMBED_EXTS) {
      if (Object.prototype.hasOwnProperty.call(EMBED_EXTS, t) && EMBED_EXTS[t].test(clean)) return t;
    }
    return 'unknown';
  }

  function parseEmbedSize(str) {
    if (!str) return { width:null, height:null };
    var p = str.split('x');
    return { width: parseInt(p[0],10)||null, height: parseInt(p[1],10)||null };
  }

  function splitWikilink(inner) {
    var pipeIdx = inner.indexOf('|');
    var alias   = pipeIdx >= 0 ? inner.slice(pipeIdx+1).trim() : null;
    var core    = pipeIdx >= 0 ? inner.slice(0,pipeIdx).trim() : inner.trim();
    var hashIdx = core.indexOf('#');
    var target  = hashIdx >= 0 ? core.slice(0,hashIdx).trim() : core;
    var anchor  = hashIdx >= 0 ? core.slice(hashIdx+1).trim() : null;
    return { target:target, anchor:anchor, alias:alias };
  }

  /* Walk inline children; if handler(child) returns an array, replace it */
  function processInline(children, state, handler) {
    var out = [], i, rep;
    for (i = 0; i < children.length; i++) {
      rep = handler(children[i], state);
      if (rep === null) { out.push(children[i]); }
      else { out = out.concat(rep); }
    }
    return out;
  }

  /* Split a text token by a regex; odd slots become html_inline via makeHtml */
  function splitInlineText(child, state, re, makeHtml) {
    if (child.type !== 'text') return null;
    var parts = child.content.split(re);
    if (parts.length === 1) return null;
    var result = [], i, html, t;
    for (i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        html = makeHtml(parts[i]);
        if (html === null) {
          t = new state.Token('text','',0); t.content = parts[i]; result.push(t);
        } else {
          t = new state.Token('html_inline','',0); t.content = html; result.push(t);
        }
      } else {
        if (!parts[i]) continue;
        t = new state.Token('text','',0); t.content = parts[i]; result.push(t);
      }
    }
    return result;
  }

  /* ── Rule: Obsidian comments  %% ... %% ────────────────────────────────── */

  function ruleComments(md) {
    md.core.ruler.push('obs_comments', function (state) {
      var i, bt;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        bt.children = processInline(bt.children, state, function (child) {
          if (child.type !== 'text') return null;
          var stripped = child.content.replace(/%%[\s\S]*?%%/g, '');
          if (stripped === child.content) return null;
          if (!stripped) return [];
          var t = new state.Token('text','',0); t.content = stripped; return [t];
        });
      }
    });
  }

  /* ── Rule: highlight  ==text== ─────────────────────────────────────────── */

  function ruleHighlight(md) {
    md.core.ruler.push('obs_highlight', function (state) {
      var i, bt;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        bt.children = processInline(bt.children, state, function (child, st) {
          return splitInlineText(child, st, /==((?!\s)[\s\S]*?(?<!\s))==/g, function (m) {
            return '<mark>' + state.md.renderInline(m) + '</mark>';
          });
        });
      }
    });
  }

  /* ── Rule: strikethrough  ~~text~~ ─────────────────────────────────────── */
  /* Handles plain-text content within ~~...~~.                               */
  /* For rich inline content (bold inside strikethrough), use the            */
  /* markdown-it-strikethrough-alt CDN plugin loaded before this file.        */

  function ruleStrikethrough(md) {
    md.core.ruler.push('obs_strikethrough', function (state) {
      var i, bt;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        bt.children = processInline(bt.children, state, function (child, st) {
          return splitInlineText(child, st, /~~((?!~)[\s\S]+?)~~/g, function (m) {
            return '<del>' + state.md.renderInline(m) + '</del>';
          });
        });
      }
    });
  }

  /* ── Rule: tags  #tag  #nested/tag ─────────────────────────────────────── */

  function ruleTags(md, opts) {
    md.core.ruler.push('obs_tags', function (state) {
      var i, bt;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        bt.children = processInline(bt.children, state, function (child, st) {
          return splitInlineText(child, st, /(?<![&\w#])(#[a-zA-Z_][a-zA-Z0-9_/\-]*)/g, function (m) {
            /* Skip CSS hex colour values (#rgb / #rrggbb) */
            if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(m)) return null;
            var tagName = m.slice(1);
            var href = opts.resolveTag ? opts.resolveTag(tagName) : ('#tag-' + tagName);
            return '<a href="' + esc(href) + '" class="obsidian-tag" data-tag="' + esc(tagName) + '">' + esc(m) + '</a>';
          });
        });
      }
    });
  }

  /* ── Rule: block IDs  paragraph ending with  ^blockid ──────────────────── */

  function ruleBlockIds(md) {
    md.core.ruler.push('obs_blockids', function (state) {
      var i, bt, children, last, m, anchor;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        children = bt.children;
        last = children[children.length - 1];
        if (!last || last.type !== 'text') continue;
        m = last.content.match(/\s+\^([\w-]+)$/);
        if (!m) continue;
        last.content = last.content.slice(0, -m[0].length);
        anchor = new state.Token('html_inline','',0);
        anchor.content = '<span class="obsidian-block-id" id="^' + esc(m[1]) + '" data-block-id="' + esc(m[1]) + '"></span>';
        children.push(anchor);
      }
    });
  }

  /* ── Rule: math block promotion ──────────────────────────────────────────
     Runs as a CORE rule (after the paragraph/inline pass) so it can see the
     *actual* raw text of every paragraph regardless of what container it's
     nested inside — blockquote, callout, list item, whatever. If a whole
     paragraph's raw content is nothing but `$$...$$` (or `\[...\]`), we
     promote it from an inline "<span>" into a real block-level "<div>",
     matching Obsidian's own behaviour. This complements — and covers gaps
     left by — the block-level obs_math_block rule below, which can only see
     raw source lines and therefore misses cases where our syntax doesn't get
     a chance to interrupt an already-open paragraph (e.g. a callout's
     "> [!NOTE]" title line followed by "> $$ ... $$" on the next line —
     without this, the two lines get glued into one paragraph). ── */

  function ruleMathBlockPromote(md) {
    md.core.ruler.push('obs_math_block_promote', function (state) {
      var tokens = state.tokens;
      for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'inline') continue;
        var prev = tokens[i - 1];
        var next = tokens[i + 1];
        if (!prev || prev.type !== 'paragraph_open') continue;
        if (!next || next.type !== 'paragraph_close') continue;

        var raw = tokens[i].content;
        if (typeof raw !== 'string') continue;
        var trimmed = raw.trim();
        if (!trimmed) continue;

        var math = null;
        var m = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
        if (m && trimmed.length >= 4 && trimmed !== '$$') {
          math = m[1].trim();
        } else {
          var m2 = trimmed.match(/^\\\[([\s\S]+)\\\]$/);
          if (m2) math = m2[1].trim();
        }
        if (math === null || math === '') continue;

        var tok = new state.Token('obs_math_block', '', 0);
        tok.content = math;
        tok.block = true;
        tok.map = prev.map;

        tokens.splice(i - 1, 3, tok);
        i -= 1; /* the token that followed paragraph_close is now at index i */
      }
    });
  }

  /* ── Rule: raw LaTeX delimiters \(...\) and \[...\] ──────────────────────── */
  /* Handles math pasted from other editors / AI outputs that use backslash      */
  /* delimiter style rather than dollar-sign style.                               */
  /*                                                                              */
  /* IMPORTANT: this must be a real INLINE-ruler rule, registered *before*        */
  /* markdown-it's own built-in 'escape' rule — not a core rule operating on      */
  /* already-tokenized text children. `(`, `)`, `[`, `]` are all in CommonMark's  */
  /* standard escapable-punctuation set, so by the time any core rule sees a      */
  /* paragraph's `.children`, "\(" and "\[" have *already* been consumed by the   */
  /* built-in escape rule and turned into a plain "(" / "[" with no trace of the  */
  /* backslash. A core-rule regex like /\\\(.../ against that text can never      */
  /* match — this is why raw \( \) / \[ \] math silently failed to render at all. */

  function ruleMathRawDelimiters(md) {
    function mathRawInline(state, silent) {
      var src = state.src, pos = state.pos;
      if (src.charCodeAt(pos) !== 0x5C /* \ */ || src[pos + 1] !== '(') return false;
      var end = src.indexOf('\\)', pos + 2);
      if (end === -1) return false;
      if (!silent) {
        var inner = src.slice(pos + 2, end).trim();
        var token = state.push('html_inline', '', 0);
        token.content = '<span class="math math-inline" data-math="' + esc(inner) + '">\\(' + esc(inner) + '\\)</span>';
      }
      state.pos = end + 2;
      return true;
    }

    function mathRawBlock(state, silent) {
      var src = state.src, pos = state.pos;
      if (src.charCodeAt(pos) !== 0x5C /* \ */ || src[pos + 1] !== '[') return false;
      var end = src.indexOf('\\]', pos + 2);
      if (end === -1) return false;
      if (!silent) {
        var inner = src.slice(pos + 2, end).trim();
        var token = state.push('html_inline', '', 0);
        token.content = '<span class="math math-block math-inline-display" data-math="' + esc(inner) + '">\\[' + esc(inner) + '\\]</span>';
      }
      state.pos = end + 2;
      return true;
    }

    md.inline.ruler.before('escape', 'obs_math_raw_bracket', mathRawBlock);
    md.inline.ruler.before('escape', 'obs_math_raw_paren', mathRawInline);
  }

  /* ── Rule: inline display math  $$...$$  (inline within a paragraph) ────── */
  /* The block rule only fires when $$ starts a line, and the promotion rule    */
  /* only fires when $$...$$ is a whole paragraph's entire content. This one    */
  /* catches $$...$$ that appears mid-paragraph, e.g.                          */
  /* "Heat capacity: $$S=\frac{…}{}$$ Unit: J K⁻¹".                            */
  /*                                                                           */
  /* Implemented as a real INLINE-ruler rule (not a core rule scanning already-*/
  /* tokenized text) for the same reason as the raw \( \)/\[ \] delimiters      */
  /* above: any *other* inline plugin the host app also loads — a caret-based  */
  /* superscript plugin being the most common real-world case — runs during    */
  /* the same initial tokenization pass. If our detection ran afterward (as a  */
  /* core rule), a stray "^" pair inside the LaTeX (e.g. two separate "^2"      */
  /* exponents in one expression) gets mistaken for a superscript span first,   */
  /* splitting the math across multiple text tokens so the two "$$" can never   */
  /* be reunited. Claiming the whole "$$...$$" span atomically, before any      */
  /* other rule gets a look at its interior, makes it immune to that — and to   */
  /* any other inline plugin, not just this one specific one. Ruler *position*  */
  /* (anchored right before 'escape', which sits ahead of essentially every     */
  /* other inline rule including third-party ones) determines precedence here, */
  /* not which plugin called `.use()` first, so this holds regardless of load   */
  /* order in the host app. */

  function ruleMathInlineDisplay(md) {
    function mathInlineDouble(state, silent) {
      var src = state.src, pos = state.pos, max = state.posMax;
      if (src.charCodeAt(pos) !== 0x24 /* $ */ || src.charCodeAt(pos + 1) !== 0x24) return false;

      var closeIdx = src.indexOf('$$', pos + 2);
      if (closeIdx === -1 || closeIdx + 2 > max) return false;
      if (closeIdx === pos + 2) return false; /* "$$$$" — empty, not real math */

      if (!silent) {
        var inner = src.slice(pos + 2, closeIdx).trim();
        var token = state.push('html_inline', '', 0);
        token.content = '<span class="math math-block math-inline-display" data-math="' + esc(inner) + '">\\[' + esc(inner) + '\\]</span>';
      }
      state.pos = closeIdx + 2;
      return true;
    }

    md.inline.ruler.before('escape', 'obs_math_dollar_display', mathInlineDouble);
  }

  /* ── Rule: inline math  $...$  (not $$) ────────────────────────────────── */
  /* Same inline-ruler approach as above, for the same reason: claim the span   */
  /* atomically before any other plugin's rule can slice up its interior.       */
  /* Registered *after* the $$ rule above (both anchored before 'escape'),      */
  /* so $$ always gets first crack at a position — though the explicit "next    */
  /* char is $" bail-out below means the order wouldn't actually matter either  */
  /* way; a "$$" is never mistaken for two single "$"s. */

  function ruleMathInline(md) {
    function mathInlineSingle(state, silent) {
      var src = state.src, pos = state.pos, max = state.posMax;
      if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;
      if (src.charCodeAt(pos + 1) === 0x24) return false; /* leave "$$" to the display rule */

      var searchPos = pos + 1, closeIdx = -1;
      while (searchPos < max) {
        var idx = src.indexOf('$', searchPos);
        if (idx === -1 || idx >= max) break;
        /* an odd number of backslashes right before this "$" means it's an
           escaped "\$" — a literal dollar sign inside the math, not a closer */
        var bsCount = 0, k = idx - 1;
        while (k >= pos + 1 && src[k] === '\\') { bsCount++; k--; }
        if (bsCount % 2 === 1) { searchPos = idx + 1; continue; }
        closeIdx = idx;
        break;
      }
      if (closeIdx === -1 || closeIdx === pos + 1) return false; /* no close, or empty "$$" */

      if (!silent) {
        var inner = src.slice(pos + 1, closeIdx);
        var token = state.push('html_inline', '', 0);
        token.content = '<span class="math math-inline" data-math="' + esc(inner) + '">\\(' + esc(inner) + '\\)</span>';
      }
      state.pos = closeIdx + 1;
      return true;
    }

    md.inline.ruler.before('escape', 'obs_math_dollar_inline', mathInlineSingle);
  }

  /* ── Rule: block math  $$ ... $$ ───────────────────────────────────────── */

  function ruleMathBlock(md) {
    md.block.ruler.before('fence', 'obs_math_block', function (state, startLine, endLine, silent) {
      var max   = state.eMarks[startLine];
      /* bMarks[startLine] alone can still include an un-stripped list marker
         ("- ", "1. ") — tShift[startLine] is what accounts for that (and for
         blockquote indent). Reading only bMarks was why "$$...$$" silently
         failed to become block math inside list items. */
      var start = state.bMarks[startLine] + state.tShift[startLine];
      var line  = state.src.slice(start, max).trim();
      if (line.slice(0, 2) !== '$$') return false;

      /* Single-line  $$...$$ */
      if (line.length >= 4 && line.slice(-2) === '$$' && line !== '$$') {
        if (silent) return true;
        var math = line.slice(2, -2).trim();
        var tok  = state.push('obs_math_block', '', 0);
        tok.content = math; tok.map = [startLine, startLine + 1];
        state.line = startLine + 1;
        return true;
      }
      if (line !== '$$') return false;

      /* Multi-line */
      var nextLine = startLine + 1;
      while (nextLine < endLine) {
        var lpos = state.bMarks[nextLine] + state.tShift[nextLine];
        var lmax = state.eMarks[nextLine];
        if (state.src.slice(lpos, lmax).trim() === '$$') break;
        nextLine++;
      }
      if (nextLine >= endLine) return false;
      if (silent) return true;

      var content = state.getLines(startLine + 1, nextLine, 0, true).trim();
      var tok2    = state.push('obs_math_block', '', 0);
      tok2.content = content; tok2.map = [startLine, nextLine + 1];
      state.line = nextLine + 1;
      return true;
    }, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
    /* Registering `alt` lets this rule be tried as a paragraph *terminator*,
       not just a fresh-block starter — otherwise a "$$ ... $$" line sitting
       right under other text (e.g. a callout's "[!NOTE]" title line) just
       gets glued onto that text as lazy paragraph continuation instead of
       ever being tried as its own block. */

    md.renderer.rules['obs_math_block'] = function (tokens, idx) {
      var m = esc(tokens[idx].content);
      return '<div class="math math-block" data-math="' + m + '">\\[' + m + '\\]</div>\n';
    };
  }

  /* ── Rule: wikilinks  [[Page]]  [[Page|Alias]]  [[Page#Heading]] ────────── */

  function ruleWikilinks(md, opts) {
    md.core.ruler.push('obs_wikilinks', function (state) {
      var i, bt;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        bt.children = processInline(bt.children, state, function (child, st) {
          /* Only plain wikilinks — not starting with ! (embeds) */
          return splitInlineText(child, st, /(?<!!)\[\[([^\]]+)\]\]/g, function (inner) {
            var parts = splitWikilink(inner);
            var label = parts.alias || (parts.anchor ? (parts.target + '#' + parts.anchor) : parts.target);
            var href  = opts.resolveWikilink
              ? opts.resolveWikilink(parts.target, parts.alias, parts.anchor)
              : ('#' + encodeURIComponent(parts.target));
            var anc = parts.anchor ? ' data-anchor="' + esc(parts.anchor) + '"' : '';
            return '<a href="' + esc(href) + '" class="obsidian-wikilink" data-target="' + esc(parts.target) + '"' + anc + '>' + esc(label) + '</a>';
          });
        });
      }
    });
  }

  /* ── Rule: embeds  ![[file]]  ![[img|300]]  ![[img|300x200]] ───────────── */

  function ruleEmbeds(md, opts) {
    md.core.ruler.push('obs_embeds', function (state) {
      var i, bt;
      for (i = 0; i < state.tokens.length; i++) {
        bt = state.tokens[i];
        if (bt.type !== 'inline' || !bt.children) continue;
        bt.children = processInline(bt.children, state, function (child, st) {
          return splitInlineText(child, st, /!\[\[([^\]]+)\]\]/g, function (inner) {
            var pipeIdx  = inner.indexOf('|');
            var filePart = pipeIdx >= 0 ? inner.slice(0, pipeIdx).trim() : inner.trim();
            var rawSuffix = pipeIdx >= 0 ? inner.slice(pipeIdx + 1).trim() : null;
            /* Numeric suffix → size ("300" / "300x200"); anything else → alt text */
            var sizePart = (rawSuffix && /^\d+(x\d+)?$/.test(rawSuffix)) ? rawSuffix : null;
            var altText  = (rawSuffix && !sizePart) ? rawSuffix : null;
            var hashIdx  = filePart.indexOf('#');
            var fileName = hashIdx >= 0 ? filePart.slice(0, hashIdx) : filePart;
            var anchor   = hashIdx >= 0 ? filePart.slice(hashIdx + 1) : null;
            var type     = detectEmbedType(fileName);
            var src      = opts.resolveEmbed ? opts.resolveEmbed(fileName, type) : fileName;
            return renderEmbed(src, type, fileName, sizePart, anchor, opts, altText);
          });
        });
      }
    });
  }

  function renderEmbed(src, type, fileName, sizeStr, anchor, opts, altText) {
    var sz   = parseEmbedSize(sizeStr);
    var wA   = sz.width  ? ' width="'  + sz.width  + '"' : '';
    var hA   = sz.height ? ' height="' + sz.height + '"' : '';
    var safe = esc(src);
    var name = esc(fileName);
    var alt  = altText ? esc(altText) : name;
    switch (type) {
      case 'image':
        return '<img src="' + safe + '" alt="' + alt + '" class="obsidian-embed obsidian-image"' + wA + hA + ' loading="lazy">';
      case 'audio':
        return '<audio controls class="obsidian-embed obsidian-audio"><source src="' + safe + '"><em>Audio: <a href="' + safe + '">' + name + '</a></em></audio>';
      case 'video':
        return '<video controls class="obsidian-embed obsidian-video"' + wA + hA + '><source src="' + safe + '"><em>Video: <a href="' + safe + '">' + name + '</a></em></video>';
      case 'pdf': {
        var pg = anchor ? '#page=' + encodeURIComponent(anchor) : '';
        return '<iframe src="' + safe + pg + '" class="obsidian-embed obsidian-pdf"' + wA + hA + ' loading="lazy">PDF: <a href="' + safe + '">' + name + '</a></iframe>';
      }
      case 'note':
        if (opts.resolveTransclusion) {
          return '<div class="obsidian-embed obsidian-transclusion" data-src="' + name + '">' + opts.resolveTransclusion(fileName, anchor) + '</div>';
        }
        return '<div class="obsidian-embed obsidian-transclusion" data-src="' + name + '" data-anchor="' + esc(anchor||'') + '"><em>Transclusion: <a href="' + safe + '">' + name + '</a>' + (anchor ? '#' + esc(anchor) : '') + '</em></div>';
      default:
        return '<a href="' + safe + '" class="obsidian-embed obsidian-file">' + name + '</a>';
    }
  }

  /* ── Rule: callouts  > [!NOTE]  > [!TIP]+  > [!WARN]- ─────────────────── */

  function ruleCallouts(md, opts) {
    md.core.ruler.push('obs_callout_annotate', function (state) {
      var tokens = state.tokens, i, j, bt, inlineTok, firstText, m, rawType;
      for (i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'blockquote_open') continue;
        j = i + 1;
        while (j < tokens.length && tokens[j].type !== 'inline') {
          if (tokens[j].type === 'blockquote_close') break;
          j++;
        }
        if (j >= tokens.length || tokens[j].type !== 'inline') continue;
        inlineTok  = tokens[j];
        firstText  = (inlineTok.children && inlineTok.children[0] && inlineTok.children[0].content) || '';
        m = firstText.replace(/^\s+/,'').match(/^\[!([a-zA-Z]+)\]([+-])?\s*(.*)?$/);
        if (!m) continue;
        rawType = m[1].toLowerCase();
        if (!CALLOUT_TYPES[rawType]) continue;

        var type      = rawType;
        var foldState = m[2] || null;
        var title     = (m[3] && m[3].trim()) || (m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase());

        tokens[i].attrSet('data-callout', type);
        tokens[i].attrSet('data-callout-fold', foldState || '');
        if (!tokens[i].meta) tokens[i].meta = {};
        tokens[i].meta.callout = { type:type, foldState:foldState, title:title };

        if (inlineTok.children && inlineTok.children[0]) {
          inlineTok.children[0].content = inlineTok.children[0].content
            .replace(/^\[![a-zA-Z]+\][+-]?\s*.*/, '').replace(/^\s+/,'');
          if (!inlineTok.children[0].content) inlineTok.children.shift();
        }

        /* If nothing was left after stripping the title marker (either the
           title was on its own line, or — now that obs_math_block can
           interrupt a paragraph — the next line became its own separate
           block) the title's paragraph is completely empty. Drop the whole
           paragraph_open/inline/paragraph_close triple so we don't emit a
           stray empty "<p></p>" above the callout's real content. */
        if (!inlineTok.children || inlineTok.children.length === 0) {
          var pOpenIdx = j - 1;
          if (pOpenIdx >= 0 && tokens[pOpenIdx].type === 'paragraph_open' &&
              tokens[j + 1] && tokens[j + 1].type === 'paragraph_close') {
            tokens.splice(pOpenIdx, 3);
            /* i (< pOpenIdx) is unaffected by this splice, loop continues normally */
          }
        }
      }
    });

    var origOpen  = md.renderer.rules.blockquote_open;
    var origClose = md.renderer.rules.blockquote_close;

    md.renderer.rules.blockquote_open = function (tokens, idx, options, env, self) {
      var token = tokens[idx];
      var meta  = token.meta && token.meta.callout;
      if (!meta) {
        return origOpen ? origOpen(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      }
      var icon       = (opts.calloutIcons && opts.calloutIcons[meta.type]) || CALLOUT_ICONS[meta.type] || '📌';
      var isFoldable = meta.foldState !== null;
      var isOpen     = meta.foldState !== '-';
      var foldAttr   = isFoldable ? ' data-foldable="true" data-open="' + isOpen + '"' : '';
      var chevron    = isFoldable ? '<span class="callout-fold-icon">' + (isOpen ? '▾' : '▸') + '</span>' : '';
      var titleStyle = isFoldable ? ' style="cursor:pointer"' : '';
      var bodyStyle  = (isFoldable && !isOpen) ? ' style="display:none"' : '';
      return [
        '<div class="callout callout-' + esc(meta.type) + '" data-callout="' + esc(meta.type) + '"' + foldAttr + '>',
        '<div class="callout-title"' + titleStyle + '>',
        '<span class="callout-icon">' + icon + '</span>',
        '<span class="callout-title-text">' + esc(meta.title) + '</span>',
        chevron + '</div>',
        '<div class="callout-content"' + bodyStyle + '>'
      ].join('');
    };

    md.renderer.rules.blockquote_close = function (tokens, idx, options, env, self) {
      var depth = 0, i;
      for (i = idx; i >= 0; i--) {
        if (tokens[i].type === 'blockquote_close') depth++;
        if (tokens[i].type === 'blockquote_open') {
          depth--;
          if (depth === 0) {
            if (tokens[i].meta && tokens[i].meta.callout) return '</div></div>';
            break;
          }
        }
      }
      return origClose ? origClose(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
    };
  }

  /* ── Rule: task lists  - [ ]  - [x]  - [/]  - [-]  etc. ───────────────── */
  /*                                                                           */
  /* Supports Obsidian's extended task states. Each state renders a custom    */
  /* checkbox with a data-task attribute for CSS styling.                      */

  function ruleTaskLists(md) {
    md.core.ruler.push('obs_tasklists', function (state) {
      var tokens = state.tokens;

      /* Find the enclosing list_item_open for a given inline token index */
      function findListItem(inlineIdx) {
        var depth = 0;
        for (var k = inlineIdx - 1; k >= 0; k--) {
          var tt = tokens[k].type;
          if (tt === 'list_item_close') { depth++; continue; }
          if (tt === 'list_item_open')  {
            if (depth === 0) return k;
            depth--;
          }
        }
        return -1;
      }

      for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'inline') continue;
        var children = tokens[i].children;
        if (!children || !children.length) continue;

        /* First child must be a text token */
        var firstChild = children[0];
        if (!firstChild || firstChild.type !== 'text') continue;

        /* Must start with [<char>] pattern */
        var m = firstChild.content.match(/^\[(.)\]\s*/);
        if (!m) continue;

        /* Must be inside a list item */
        var liIdx = findListItem(i);
        if (liIdx === -1) continue;

        var stateChar = m[1];
        var info = TASK_STATES[stateChar] || TASK_STATES[' '];

        /* Strip the checkbox text from the first child */
        firstChild.content = firstChild.content.slice(m[0].length);

        /* Annotate list_item_open with task classes */
        var liTok   = tokens[liIdx];
        var liClass = (liTok.attrGet('class') || '').trim();
        liTok.attrSet('class', ('task-list-item ' + info.cls + (liClass ? ' ' + liClass : '')).trim());
        liTok.attrSet('data-task', stateChar);

        /* Annotate the parent bullet/ordered list */
        for (var j = liIdx - 1; j >= 0; j--) {
          var lt = tokens[j].type;
          if (lt === 'bullet_list_open' || lt === 'ordered_list_open') {
            var ulClass = tokens[j].attrGet('class') || '';
            if (ulClass.indexOf('task-list') === -1) {
              tokens[j].attrSet('class', (ulClass ? ulClass + ' ' : '') + 'task-list');
            }
            break;
          }
          /* If we cross a list_item boundary at depth 0, stop */
          if (lt === 'list_item_close') break;
        }

        /* Prepend a checkbox <input> HTML token */
        var chkTok = new state.Token('html_inline', '', 0);
        var checkedAttr = info.checked ? ' checked' : '';
        chkTok.content =
          '<input class="task-list-checkbox" type="checkbox"' +
          ' data-task="' + esc(stateChar) + '"' +
          ' aria-label="' + esc(info.label) + '"' +
          checkedAttr + ' disabled> ';
        children.unshift(chkTok);
      }
    });
  }

  /* ── Rule: mermaid fence ────────────────────────────────────────────────── */

  function ruleMermaid(md) {
    var orig = md.renderer.rules.fence;
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      var token = tokens[idx];
      var lang  = token.info.trim().split(/\s+/)[0].toLowerCase();
      if (lang !== 'mermaid') {
        return orig ? orig(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      }
      /* Render mermaid blocks as a div; obsidianInitMermaid() will process them */
      return '<div class="obsidian-mermaid mermaid">' + esc(token.content.trim()) + '</div>\n';
    };
  }

  /* ── Rule: tikz fence ───────────────────────────────────────────────────── */

  function ruleTikz(md) {
    var orig = md.renderer.rules.fence;
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      var token = tokens[idx];
      var lang  = token.info.trim().split(/\s+/)[0].toLowerCase();
      if (lang !== 'tikz') {
        return orig ? orig(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      }
      /* Emit a placeholder div — script tags injected via innerHTML are inert.
         obsidianInitTikz() will swap these for real <script type="text/tikz">
         elements created via document.createElement, which TikZJax picks up. */
      return '<div class="tikz-wrapper"><div class="tikz-loading">&#8987; Rendering diagram…</div><div class="tikz-source" style="display:none">' + esc(token.content.trim()) + '</div></div>\n';
    };
  }

  // --- DESMOS fence handler ---
  function ruleDesmos(md) {
    var orig = md.renderer.rules.fence;
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      var token = tokens[idx];
      var lang  = token.info.trim().split(/\s+/)[0].toLowerCase();
      if (lang !== 'desmos') {
        return orig ? orig(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      }

      /* ── Parse key=value options from info string ── */
      var opts = { lock: 'none', zoom: 'true', height: '400' };
      token.info.trim().split(/\s+/).slice(1).forEach(function (part) {
        var kv = part.split('=');
        if (kv.length === 2) opts[kv[0]] = kv[1];
      });
      /* Render desmos blocks as a div; obsidianInitDesmos() will process them */
      var expressions = token.content
        .trim()
        .split('\n')
        .filter(function (line) { return line.trim() !== ''; })
        .map(function (latex, i) { return { id: 'expr-' + i, latex: latex.trim() }; });

      var stateJson = JSON.stringify({ expressions: { list: expressions } });
      var uid = 'desmos-' + Math.random().toString(36).slice(2, 9);

      return '<div class="desmos-block" id="' + uid + '"'
        + ' data-state=\'' + stateJson.replace(/'/g, '&#39;') + '\''
        + ' data-lock="'   + opts.lock + '"'
        + ' data-zoom="'   + opts.zoom + '"'
        + ' style="width:100%;height:' + opts.height + 'px;border-radius:10px;overflow:hidden;">'
        + '</div>\n';
    };                  // ← closes md.renderer.rules.fence = function(...)
  }                     // ← closes ruleDesmos

  // --- DESMOS 3D fence handler ---
  /* Same idea as ruleDesmos above, but targets Desmos.Calculator3D instead of
     Desmos.GraphingCalculator. Uses a separate fence language ("desmos3d") so
     existing ```desmos blocks keep behaving exactly as before — nothing about
     2D graphs changes. Good for VSEPR-style spatial modeling: atoms as sphere
     inequalities, bonds as finite-cylinder ("capsule") inequalities, orbitals
     as double-cone surfaces — see initDesmos3D()'s doc comment for ready-made
     templates. */
  function ruleDesmos3D(md) {
    var orig = md.renderer.rules.fence;
    md.renderer.rules.fence = function (tokens, idx, options, env, self) {
      var token = tokens[idx];
      var lang  = token.info.trim().split(/\s+/)[0].toLowerCase();
      if (lang !== 'desmos3d') {
        return orig ? orig(tokens, idx, options, env, self) : self.renderToken(tokens, idx, options);
      }

      /* ── Parse key=value options from info string ── */
      var opts = { lock: 'none', zoom: 'true', height: '720' };
      token.info.trim().split(/\s+/).slice(1).forEach(function (part) {
        var kv = part.split('=');
        if (kv.length === 2) opts[kv[0]] = kv[1];
      });
      var expressions = token.content
        .trim()
        .split('\n')
        .filter(function (line) { return line.trim() !== ''; })
        .map(function (latex, i) { return { id: 'expr3d-' + i, latex: latex.trim() }; });

      var stateJson = JSON.stringify({ expressions: { list: expressions } });
      var uid = 'desmos3d-' + Math.random().toString(36).slice(2, 9);

      return '<div class="desmos3d-block" id="' + uid + '"'
        + ' data-state=\'' + stateJson.replace(/'/g, '&#39;') + '\''
        + ' data-lock="'   + opts.lock + '"'
        + ' data-zoom="'   + opts.zoom + '"'
        + ' style="width:100%;height:' + opts.height + 'px;min-height:' + opts.height + 'px;border-radius:18px;overflow:hidden;background:var(--bg);border:1px solid var(--border);box-shadow:var(--shadow);">'
        + '</div>\n';
    };
  }

  /* ── Rule: heading IDs — stamp id="..." on <h1>–<h6> for wikilink anchors ─ */

  function ruleHeadingIds(md) {
    md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
      var token  = tokens[idx];
      var inline = tokens[idx + 1];
      if (inline && inline.type === 'inline') {
        /* Collect plain text from all inline children (strip HTML tokens) */
        var text = (inline.children || [])
          .filter(function (t) { return t.type === 'text' || t.type === 'softbreak'; })
          .map(function (t)    { return t.type === 'softbreak' ? ' ' : t.content; })
          .join('');
        var id = text.trim()
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^\w\-]/g, '');
        if (id) token.attrSet('id', id);
      }
      return self.renderToken(tokens, idx, options);
    };
  }

  /* ── Front-matter parser ────────────────────────────────────────────────── */

  function parseFrontmatter(raw) {
    var m = raw.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
    if (!m) return { content: raw, frontmatter: {}, rawFrontmatter: '' };
    var rawFM   = m[1];
    var content = raw.slice(m[0].length);
    var fm = {};
    rawFM.split(/\r?\n/).forEach(function (line) {
      var kv = line.match(/^([\w-]+)\s*:\s*(.*)/);
      if (!kv) return;
      var key = kv[1], val = kv[2].trim();
      if (val.charAt(0) === '[' && val.charAt(val.length-1) === ']') {
        fm[key] = val.slice(1,-1).split(',').map(function(s){ return s.trim().replace(/^['"]|['"]$/g,''); }).filter(Boolean);
      } else {
        fm[key] = val.replace(/^['"]|['"]$/g,'');
      }
    });
    return { content: content, frontmatter: fm, rawFrontmatter: rawFM };
  }

  /* ── Post-render init: MathJax math ─────────────────────────────────────── */
  /*                                                                           */
  /* Call after inserting rendered HTML into the DOM.                          */
  /* Requires MathJax 3 (tex-svg build) to be loaded.                         */
  /* Returns a Promise that resolves when typesetting is complete.             */

  function initMath(root) {
    var el = root || document;

    /* Skip if MathJax not loaded yet — caller can retry. Nothing is marked
       here, so the retry will still see these nodes as pending; previously
       this marked every node "rendered" even on this early-exit path, which
       made the marker meaningless and (if a caller ever trusted it) able to
       permanently skip math that was never actually typeset. */
    if (typeof MathJax === 'undefined') return Promise.resolve();

    var ready = (MathJax.startup && MathJax.startup.promise)
      ? MathJax.startup.promise
      : Promise.resolve();

    return ready.then(function () {
      if (typeof MathJax.typesetPromise !== 'function') return;
      /* Only nodes not already marked — lets repeat calls (e.g. after more
         content streams into the page) skip math that's already typeset
         instead of re-scanning/re-typesetting the whole root every time. */
      var pending = Array.from(el.querySelectorAll('.math[data-math]:not([data-mj-rendered])'));
      if (!pending.length) return;
      /* Mark right before handing off to MathJax, so a node only ever
         counts as "rendered" once it's actually been queued for typeset. */
      pending.forEach(function (node) { node.setAttribute('data-mj-rendered', 'true'); });
      return MathJax.typesetPromise(pending.length < 50 ? pending : [el]);
    }).catch(function (e) {
      console.warn('[obsidian-markdown-it] MathJax typeset error:', e);
    });
  }

  /* ── Post-render init: Mermaid diagrams ─────────────────────────────────── */
  /*                                                                           */
  /* Call after inserting rendered HTML into the DOM.                          */
  /* Requires mermaid.min.js to be loaded (mermaid CDN).                      */

  /* ── Pan/zoom engine for Mermaid diagrams ───────────────────────────────── */

  function _mermaidPanZoom(wrap, canvas, svg, isMindmap) {
    var scale = 1, tx = 0, ty = 0;
    var dragging = false, startX, startY, startTx, startTy;
    var lastTouchDist = null;
    var DRAG_RESISTANCE = 0.75;  /* 0-1: lower = more resistance */

    function applyTransform() {
      canvas.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    }

    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

    function zoomAt(factor, cx, cy) {
      var rect = wrap.getBoundingClientRect();
      var ox = cx - rect.left, oy = cy - rect.top;
      var ns = clamp(scale * factor, 0.08, 12);
      var r  = ns / scale;
      var svgW = parseFloat(svg.getAttribute('width'))  || 600;
      var svgH = parseFloat(svg.getAttribute('height')) || 400;
      
      /* Adjust center of zoom to be viewport-center relative */
      var centerX = wrap.clientWidth / 2;
      var centerY = wrap.clientHeight / 2;
      
      tx = (1 - r) * (ox - centerX) + r * tx;
      ty = (1 - r) * (oy - centerY) + r * ty
      scale = ns;
      applyTransform();
    }

    /* Wheel zoom */
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, e.clientX, e.clientY);
    }, { passive: false });

    /* Mouse drag */
    canvas.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true; startX = e.clientX; startY = e.clientY; startTx = tx; startTy = ty;
      canvas.classList.add('is-dragging');
      e.preventDefault();
    });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      tx = startTx + (e.clientX - startX) * DRAG_RESISTANCE;
      ty = startTy + (e.clientY - startY) * DRAG_RESISTANCE;
      applyTransform();
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false; canvas.classList.remove('is-dragging');
    });

    /* Touch pan + pinch-zoom */
    canvas.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1) {
        dragging = true;
        startX = e.touches[0].clientX; startY = e.touches[0].clientY;
        startTx = tx; startTy = ty;
      } else if (e.touches.length === 2) {
        dragging = false;
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length === 1 && dragging) {
        tx = startTx + (e.touches[0].clientX - startX) * DRAG_RESISTANCE;
        ty = startTy + (e.touches[0].clientY - startY) * DRAG_RESISTANCE;
        applyTransform();
      } else if (e.touches.length === 2 && lastTouchDist) {
        var d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY);
        var cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        var cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        zoomAt(d / lastTouchDist, cx, cy);
        lastTouchDist = d;
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function () {
      dragging = false; lastTouchDist = null;
    }, { passive: true });

    /* Toolbar buttons */
    function tbClick(action) {
      var cx = wrap.getBoundingClientRect().left + wrap.clientWidth  / 2;
      var cy = wrap.getBoundingClientRect().top  + wrap.clientHeight / 2;
      if (action === 'zin')   zoomAt(1.35, cx, cy);
      if (action === 'zout')  zoomAt(1 / 1.35, cx, cy);
      if (action === 'fit')   fitToView();
      if (action === 'reset') { scale = 1; tx = 0; ty = 0; applyTransform(); }
    }
    wrap.querySelectorAll('.mermaid-tb-btn[data-a]').forEach(function (btn) {
      btn.addEventListener('click', function (e) { e.stopPropagation(); tbClick(btn.dataset.a); });
    });

    var fitAttempts = 0;
    function fitToView() {
      var svgW = parseFloat(svg.getAttribute('width'))  || 0;
      var svgH = parseFloat(svg.getAttribute('height')) || 0;
      
      /* viewBox fallback — mindmaps often omit explicit w/h */
      if (!svgW || !svgH) {
        var vb = svg.getAttribute('viewBox');
        if (vb) {
          var pts = vb.trim().split(/[\s,]+/);
          svgW = parseFloat(pts[2]) || 0;
          svgH = parseFloat(pts[3]) || 0;
        }
      }
      /* getBBox / getBoundingClientRect as last resort */
      if (!svgW || !svgH) {
        try { var bb = svg.getBBox(); svgW = bb.width; svgH = bb.height; } catch(e) {}
      }
      if (!svgW || !svgH) {
        var bcr = svg.getBoundingClientRect();
        svgW = bcr.width; svgH = bcr.height;
      }

      var wrapW = wrap.clientWidth;
      var wrapH = wrap.clientHeight;

      if (!svgW || !svgH || !wrapW || !wrapH) {
        if (fitAttempts++ < 30) requestAnimationFrame(fitToView);
        return;
      }

      var pad = 48;
      var ns  = Math.min((wrapW - pad) / svgW, (wrapH - pad) / svgH, 1.8);
      ns      = Math.max(ns, 0.08);
      scale   = ns;
      tx      = -(svgW * scale) / 2;
      ty      = -(svgH * scale) / 2;
      applyTransform();
    }
    requestAnimationFrame(fitToView);   // kick it off (retry loop handles the rest)
  }

  function _sizeMermaidSVG(svg) {
    var wAttr = svg.getAttribute('width');
    var hAttr = svg.getAttribute('height');
    var w = parseFloat(wAttr) || 0;
    var h = parseFloat(hAttr) || 0;
    // Already has concrete pixel dims (not "%" or 0) — leave them
    if (w > 1 && h > 1 && wAttr && wAttr.indexOf('%') === -1) return;

    var vb = svg.getAttribute('viewBox');
    if (!vb) return;
    var pts = vb.trim().split(/[\s,]+/);
    if (pts.length < 4) return;
    // viewBox = "min-x min-y width height"
    var vbW = parseFloat(pts[2]) || 0;
    var vbH = parseFloat(pts[3]) || 0;
    if (!vbW || !vbH) return;

    // Stamp a canonical 1000px-wide render size so the pan/zoom engine
    // always gets concrete pixel values from getAttribute()
    var targetW = 1000;
    var targetH = Math.round(targetW * vbH / vbW);
    svg.setAttribute('width',  targetW);
    svg.setAttribute('height', targetH);
  }

  function _wrapMermaidDiagram(el) {
    var svg = el.querySelector('svg');
    if (!svg || el.querySelector('.mermaid-viewer-wrap')) return;

    _sizeMermaidSVG(svg);

    /* Detect mindmap: look for rotate transforms which are unique to mindmaps */
    var isMindmap = false;
    var groups = svg.querySelectorAll('g');
    for (var g = 0; g < groups.length && !isMindmap; g++) {
      var transform = groups[g].getAttribute('transform') || '';
      if (transform.indexOf('rotate(') !== -1) {
        isMindmap = true;
      }
    }

    /* Set a sensible fixed height so the viewer doesn't collapse */
    var svgH = parseFloat(svg.getAttribute('height')) || 0;
    if (!svgH) {
      var _vb = svg.getAttribute('viewBox');
      if (_vb) { var _p = _vb.trim().split(/[\s,]+/); svgH = parseFloat(_p[3]) || 0; }
    }
    if (!svgH) svgH = svg.getBoundingClientRect().height || 0;
    var viewH = Math.min(Math.max(svgH + 80, isMindmap ? 400 : 260), window.innerHeight * 0.78);

    var wrap = document.createElement('div');
    wrap.className = 'mermaid-viewer-wrap' + (isMindmap ? ' mermaid-mindmap' : '');
    wrap.style.height = viewH + 'px';

    var toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';
    toolbar.innerHTML =
      '<button class="mermaid-tb-btn" data-a="zin"  title="Zoom in">+</button>' +
      '<button class="mermaid-tb-btn" data-a="zout" title="Zoom out">−</button>' +
      '<button class="mermaid-tb-btn" data-a="fit"  title="Fit to view" style="font-size:12px">⊡</button>' +
      '<button class="mermaid-tb-btn" data-a="reset" title="Reset" style="font-size:11px">↺</button>';

    var canvas = document.createElement('div');
    canvas.className = 'mermaid-canvas' + (isMindmap ? ' mermaid-canvas-centered' : '');

    var hint = document.createElement('div');
    hint.className = 'mermaid-hint';
    hint.textContent = 'Scroll to zoom · Drag to pan';

    /* Move all SVG content into the canvas */
    while (el.firstChild) canvas.appendChild(el.firstChild);

    wrap.appendChild(toolbar);
    wrap.appendChild(canvas);
    wrap.appendChild(hint);
    el.appendChild(wrap);

    _mermaidPanZoom(wrap, canvas, svg, isMindmap);
  }

  function initMermaid(root) {
    if (typeof mermaid === 'undefined') return;
    var els = Array.from(
      (root || document).querySelectorAll('.obsidian-mermaid:not([data-mermaid-processed])')
    );
    if (!els.length) return;
    els.forEach(function (el) { el.setAttribute('data-mermaid-processed', 'true'); });
    try {
      if (typeof mermaid.run === 'function') {
        /* Mermaid v10+: run() returns a Promise */
        mermaid.run({ nodes: els }).then(function () {
          els.forEach(_wrapMermaidDiagram);
        }).catch(function (e) {
          console.warn('[obsidian-markdown-it] Mermaid render error:', e);
          /* Still try to wrap whatever rendered */
          els.forEach(_wrapMermaidDiagram);
        });
      } else if (typeof mermaid.init === 'function') {
        /* Mermaid v9: no Promise; use a short observer per element */
        els.forEach(function (el) {
          mermaid.init(undefined, [el]);
          var obs = new MutationObserver(function (_, o) {
            if (el.querySelector('svg')) { o.disconnect(); _wrapMermaidDiagram(el); }
          });
          obs.observe(el, { childList: true, subtree: true });
          /* Fallback: disconnect after 8s to avoid leaks */
          setTimeout(function () { obs.disconnect(); _wrapMermaidDiagram(el); }, 8000);
        });
      }
    } catch (e) {
      console.warn('[obsidian-markdown-it] Mermaid render error:', e);
    }
  }

  function initDesmos(root) {
    if (typeof Desmos === 'undefined') return;
    requestAnimationFrame(function () {
      (root || document).querySelectorAll('.desmos-block:not([data-desmos-ready])').forEach(function (elt) {
        elt.setAttribute('data-desmos-ready', 'true');
        var lock      = elt.getAttribute('data-lock') || 'none';
        var allowZoom = elt.getAttribute('data-zoom') !== 'false';
        var calc = Desmos.GraphingCalculator(elt, {
          invertedColors:       true,
          settingsMenu:         false,
          zoomButtons:          allowZoom,
          lockViewport:         lock === 'all',
          expressions:          true,
          keypad:               lock === 'none',
          expressionsCollapsed: false,
        });
        try {
          var state = JSON.parse(elt.getAttribute('data-state'));
          state.expressions.list.forEach(function (expr) {
          var isSlider = expr.latex && /^[a-zA-Z](\s*)=(\s*)[0-9]/.test(expr.latex);

          if (lock === 'none') {
            // everything visible and editable — do nothing
          } else if (lock === 'expressions') {
            if (!isSlider) expr.secret = true;   // hide only non-slider lines
          } else if (lock === 'sliders') {
            if (!isSlider) expr.secret = true;   // hide formulas
            if (isSlider)  expr.readonly = true; // freeze sliders but keep visible
          } else if (lock === 'all') {
            expr.secret = true;                  // hide absolutely everything
          }

          calc.setExpression(expr);
        });
        } catch (e) {
          console.warn('[obsidian-markdown-it] Desmos expr error:', e);
        }
      });
    });
  }

  /* ── Post-render init: Desmos 3D blocks ──────────────────────────────────── */
  /*                                                                           */
  /* Same lock/zoom/expression wiring as initDesmos() above, but instantiates  */
  /* Desmos.Calculator3D instead of Desmos.GraphingCalculator.                 */
  /*                                                                           */
  /* IMPORTANT: 3D calculator access must be enabled *per API key* on Desmos's */
  /* side (desmos.com/my-api) — separately from graphing-calculator access —  */
  /* and the proxied script (see api/desmos.js) needs to be a version that     */
  /* actually ships Calculator3D (v1.11+; the docs confirm v1.11, v1.12, and   */
  /* v1.13 all include it — older pinned versions like v1.9 do not). Calling   */
  /* Desmos.Calculator3D() for a key without 3D enabled throws, so this checks */
  /* Desmos.enabledFeatures.Calculator3D first and renders a plain-language    */
  /* notice in the block instead of letting an exception break the page.      */
  /*                                                                           */
  /* Ready-to-use templates for spatial chemistry modeling — drop any of these */
  /* into a ```desmos3d fence:                                                 */
  /*                                                                           */
  /*   Atom (sphere), centered at (a,b,c) with radius r:                       */
  /*     a=0                                                                   */
  /*     b=0                                                                   */
  /*     c=0                                                                   */
  /*     r=1                                                                   */
  /*     (x-a)^2+(y-b)^2+(z-c)^2\le r^2                                        */
  /*                                                                           */
  /*   Bond (finite cylinder / "capsule" between two atom centers P1, P2):     */
  /*   given endpoints (x_1,y_1,z_1) and (x_2,y_2,z_2) and bond radius r_b,     */
  /*   a point (x,y,z) is inside the bond when its perpendicular distance to   */
  /*   the P1–P2 segment is ≤ r_b AND its projection falls between the two     */
  /*   endpoints (0≤t≤1) — this keeps it a finite stick, not an infinite line: */
  /*     t=\frac{(x-x_1)(x_2-x_1)+(y-y_1)(y_2-y_1)+(z-z_1)(z_2-z_1)}{(x_2-x_1)^2+(y_2-y_1)^2+(z_2-z_1)^2} */
  /*     d^2=(x-x_1-t(x_2-x_1))^2+(y-y_1-t(y_2-y_1))^2+(z-z_1-t(z_2-z_1))^2     */
  /*     \left\{0\le t\le1\right\}\left\{d^2\le r_b^2\right\}                   */
  /*                                                                           */
  /*   p-orbital lobe (double cone along the z-axis), height h controls taper: */
  /*     z^2=h^2(x^2+y^2)                                                      */
  /*                                                                           */
  /* Wrap repeated atoms/bonds with named constants (a, b, c, r, etc. per      */
  /* instance, e.g. a_1, a_2...) the same way sliders are used elsewhere —     */
  /* Desmos 3D treats each as an independent, draggable parameter.             */

  function initDesmos3D(root) {
    if (typeof Desmos === 'undefined') return;
    requestAnimationFrame(function () {
      (root || document).querySelectorAll('.desmos3d-block:not([data-desmos-ready])').forEach(function (elt) {
        elt.setAttribute('data-desmos-ready', 'true');

        if (!Desmos.Calculator3D || (Desmos.enabledFeatures && Desmos.enabledFeatures.Calculator3D === false)) {
          elt.style.display = 'flex';
          elt.style.alignItems = 'center';
          elt.style.justifyContent = 'center';
          elt.style.padding = '1em';
          elt.style.textAlign = 'center';
          elt.style.background = 'rgba(239,83,80,.08)';
          elt.style.color = '#ef5350';
          elt.style.fontSize = '.85em';
          elt.textContent = '3D Calculator isn\u2019t enabled for this Desmos API key (or the loaded API version predates it) \u2014 check desmos.com/my-api and the version pinned in api/desmos.js.';
          return;
        }

        var lock      = elt.getAttribute('data-lock') || 'none';
        var allowZoom = elt.getAttribute('data-zoom') !== 'false';
        var prefersDark = typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : false;
        var calc = Desmos.Calculator3D(elt, {
          invertedColors:       prefersDark,
          settingsMenu:         false,
          zoomButtons:          allowZoom,
          lockViewport:         lock === 'all',
          expressions:          true,
          keypad:               lock === 'none',
          expressionsCollapsed: false,
        });
        requestAnimationFrame(function () {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new Event('resize'));
          }
        });
        try {
          var state = JSON.parse(elt.getAttribute('data-state'));
          state.expressions.list.forEach(function (expr) {
            var isSlider = expr.latex && /^[a-zA-Z_0-9]+(\s*)=(\s*)[0-9]/.test(expr.latex);

            if (lock === 'none') {
              // everything visible and editable — do nothing
            } else if (lock === 'expressions') {
              if (!isSlider) expr.secret = true;
            } else if (lock === 'sliders') {
              if (!isSlider) expr.secret = true;
              if (isSlider)  expr.readonly = true;
            } else if (lock === 'all') {
              expr.secret = true;
            }

            calc.setExpression(expr);
          });
        } catch (e) {
          console.warn('[obsidian-markdown-it] Desmos 3D expr error:', e);
        }
      });
    });
  }

  /* ── Post-render init: highlight.js code blocks ─────────────────────────── */
  /*                                                                           */
  /* Wraps every <pre><code> in a styled shell with:                          */
  /*   • Language badge (top-right)                                            */
  /*   • Copy-to-clipboard button                                              */
  /*   • Per-language accent colour on the top border                          */
  /*   • Terminal-style chrome for shell/bash/console/output blocks            */

  /* Language → { accent colour, label, terminal? } */
  var LANG_META = {
    python:     { color: '#3b82f6', label: 'Python'     },
    py:         { color: '#3b82f6', label: 'Python'     },
    javascript: { color: '#f59e0b', label: 'JavaScript' },
    js:         { color: '#f59e0b', label: 'JavaScript' },
    typescript: { color: '#3b82f6', label: 'TypeScript' },
    ts:         { color: '#3b82f6', label: 'TypeScript' },
    rust:       { color: '#f97316', label: 'Rust'       },
    cpp:        { color: '#6366f1', label: 'C++'        },
    c:          { color: '#6366f1', label: 'C'          },
    java:       { color: '#ef4444', label: 'Java'       },
    go:         { color: '#06b6d4', label: 'Go'         },
    ruby:       { color: '#ef4444', label: 'Ruby'       },
    rb:         { color: '#ef4444', label: 'Ruby'       },
    php:        { color: '#8b5cf6', label: 'PHP'        },
    swift:      { color: '#f97316', label: 'Swift'      },
    kotlin:     { color: '#a855f7', label: 'Kotlin'     },
    css:        { color: '#06b6d4', label: 'CSS'        },
    html:       { color: '#f97316', label: 'HTML'       },
    xml:        { color: '#f97316', label: 'XML'        },
    json:       { color: '#22c55e', label: 'JSON'       },
    yaml:       { color: '#22c55e', label: 'YAML'       },
    yml:        { color: '#22c55e', label: 'YAML'       },
    toml:       { color: '#22c55e', label: 'TOML'       },
    sql:        { color: '#06b6d4', label: 'SQL'        },
    bash:       { color: '#22c55e', label: 'bash', terminal: true  },
    sh:         { color: '#22c55e', label: 'shell', terminal: true },
    shell:      { color: '#22c55e', label: 'shell', terminal: true },
    zsh:        { color: '#22c55e', label: 'zsh',   terminal: true },
    console:    { color: '#22c55e', label: 'terminal', terminal: true },
    terminal:   { color: '#22c55e', label: 'terminal', terminal: true },
    output:     { color: '#94a3b8', label: 'output', terminal: true  },
    text:       { color: '#94a3b8', label: 'text'       },
    plain:      { color: '#94a3b8', label: 'text'       },
    latex:      { color: '#10b981', label: 'LaTeX'      },
    tex:        { color: '#10b981', label: 'LaTeX'      },
    tikz:       { color: '#10b981', label: 'TikZ'       },
    r:          { color: '#3b82f6', label: 'R'          },
    matlab:     { color: '#f59e0b', label: 'MATLAB'     },
    haskell:    { color: '#8b5cf6', label: 'Haskell'    },
    lua:        { color: '#6366f1', label: 'Lua'        },
    markdown:   { color: '#94a3b8', label: 'Markdown'   },
    md:         { color: '#94a3b8', label: 'Markdown'   },
    diff:       { color: '#f59e0b', label: 'diff'       },
    makefile:   { color: '#ef4444', label: 'Makefile'   },
    dockerfile: { color: '#06b6d4', label: 'Dockerfile' },
    nginx:      { color: '#22c55e', label: 'nginx'      },
    graphql:    { color: '#e879f9', label: 'GraphQL'    },
  };

  function _wrapCodeBlock(pre) {
    /* Don't double-wrap */
    if (pre.parentNode && pre.parentNode.classList &&
        pre.parentNode.classList.contains('code-block-shell')) return;

    var code   = pre.querySelector('code');
    if (!code) return;

    /* Detect language from class="language-xxx" */
    var lang = '';
    code.classList.forEach(function (c) {
      var m = c.match(/^language-(.+)$/);
      if (m) lang = m[1].toLowerCase();
    });
    /* Also try hljs detected class */
    if (!lang && code.dataset.highlighted) {
      code.classList.forEach(function (c) {
        if (c !== 'hljs' && c !== 'language-plaintext') lang = lang || c;
      });
    }

    var meta      = LANG_META[lang] || { color: '#64748b', label: lang || 'code' };
    var isTerminal = !!meta.terminal;

    /* Outer shell */
    var shell = document.createElement('div');
    shell.className = isTerminal ? 'code-block-shell code-block-terminal' : 'code-block-shell';
    shell.style.setProperty('--lang-accent', meta.color);

    /* Header bar */
    var header = document.createElement('div');
    header.className = 'code-block-header';

    if (isTerminal) {
      /* macOS-style traffic lights */
      var dots = document.createElement('div');
      dots.className = 'code-block-dots';
      dots.innerHTML =
        '<span class="dot dot-red"></span>' +
        '<span class="dot dot-yellow"></span>' +
        '<span class="dot dot-green"></span>';
      header.appendChild(dots);
    }

    /* Language badge */
    var badge = document.createElement('span');
    badge.className = 'code-block-badge';
    badge.textContent = meta.label;
    header.appendChild(badge);

    /* Copy button */
    var btn = document.createElement('button');
    btn.className  = 'code-block-copy';
    btn.title      = 'Copy';
    btn.innerHTML  = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
    btn.addEventListener('click', function () {
      var text = code.innerText || code.textContent || '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
          btn.classList.add('copied');
          setTimeout(function () {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
            btn.classList.remove('copied');
          }, 2000);
        });
      } else {
        /* Fallback for non-HTTPS */
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        btn.classList.add('copied');
        setTimeout(function () { btn.classList.remove('copied'); }, 2000);
      }
    });
    header.appendChild(btn);

    /* Wrap pre in shell */
    pre.parentNode.insertBefore(shell, pre);
    shell.appendChild(header);
    shell.appendChild(pre);
  }

  function initHighlight(root) {
    var el = root || document;
    /* First apply highlight.js syntax colouring */
    if (typeof hljs !== 'undefined') {
      el.querySelectorAll('pre code:not([data-highlighted])').forEach(function (block) {
        hljs.highlightElement(block);
      });
    }
    /* Then wrap every pre in the language-aware shell */
    el.querySelectorAll('pre:not([data-code-wrapped])').forEach(function (pre) {
      pre.setAttribute('data-code-wrapped', 'true');
      _wrapCodeBlock(pre);
    });
  }

  /* ── Default CSS ────────────────────────────────────────────────────────── */

  var DEFAULT_CSS = [
    /* ── Callouts ─────────────────────────────────────────────────────────── */
    '.callout{border-left:4px solid var(--callout-color,#448aff);border-radius:6px;margin:1.2em 0;overflow:hidden;background:var(--callout-bg,rgba(68,138,255,.08))}',
    '.callout-title{display:flex;align-items:center;gap:.4em;padding:.55em .9em;font-weight:600;font-size:.95em;background:var(--callout-title-bg,rgba(68,138,255,.15));color:var(--callout-color,#448aff);user-select:none}',
    '.callout-content{padding:.65em .9em}',
    '.callout-fold-icon{font-size:.8em;margin-left:auto}',
    '.callout-note{--callout-color:#448aff;--callout-bg:rgba(68,138,255,.07);--callout-title-bg:rgba(68,138,255,.13)}',
    '.callout-info,.callout-todo{--callout-color:#29b6f6;--callout-bg:rgba(41,182,246,.07);--callout-title-bg:rgba(41,182,246,.13)}',
    '.callout-tip,.callout-hint,.callout-important{--callout-color:#26a69a;--callout-bg:rgba(38,166,154,.07);--callout-title-bg:rgba(38,166,154,.13)}',
    '.callout-success,.callout-check,.callout-done{--callout-color:#66bb6a;--callout-bg:rgba(102,187,106,.07);--callout-title-bg:rgba(102,187,106,.13)}',
    '.callout-warning,.callout-caution,.callout-attention{--callout-color:#ffa726;--callout-bg:rgba(255,167,38,.07);--callout-title-bg:rgba(255,167,38,.13)}',
    '.callout-danger,.callout-error{--callout-color:#ef5350;--callout-bg:rgba(239,83,80,.07);--callout-title-bg:rgba(239,83,80,.13)}',
    '.callout-failure,.callout-fail,.callout-missing{--callout-color:#ec407a;--callout-bg:rgba(236,64,122,.07);--callout-title-bg:rgba(236,64,122,.13)}',
    '.callout-question,.callout-help,.callout-faq{--callout-color:#ab47bc;--callout-bg:rgba(171,71,188,.07);--callout-title-bg:rgba(171,71,188,.13)}',
    '.callout-bug{--callout-color:#f44336;--callout-bg:rgba(244,67,54,.07);--callout-title-bg:rgba(244,67,54,.13)}',
    '.callout-example{--callout-color:#7e57c2;--callout-bg:rgba(126,87,194,.07);--callout-title-bg:rgba(126,87,194,.13)}',
    '.callout-quote,.callout-cite{--callout-color:#78909c;--callout-bg:rgba(120,144,156,.07);--callout-title-bg:rgba(120,144,156,.13)}',
    '.callout-abstract,.callout-summary,.callout-tldr{--callout-color:#26c6da;--callout-bg:rgba(38,198,218,.07);--callout-title-bg:rgba(38,198,218,.13)}',
    /* ── Footnotes ──────────────────────────────────────────────────────────── */
    '.footnotes{border-top:1px solid var(--border,#dadce0);margin-top:2em;padding-top:1em;font-size:.88em;opacity:.85}',
    '.footnotes-sep{display:none}',
    '.footnotes ol{padding-left:1.5em}',
    '.footnotes li{margin-bottom:.35em}',
    'a.footnote-ref{font-size:.8em;vertical-align:super;text-decoration:none;font-weight:600;color:var(--accent,#1a73e8);padding:0 1px}',
    'a.footnote-ref:hover{text-decoration:underline}',
    'a.footnote-backref{text-decoration:none;margin-left:.25em;opacity:.7}',
    /* ── Links & tags ──────────────────────────────────────────────────────── */
    '.obsidian-wikilink{color:var(--wikilink-color,#7c4dff);text-decoration:none;border-bottom:1px dashed currentColor}',
    '.obsidian-wikilink:hover{border-bottom-style:solid}',
    '.obsidian-tag{display:inline-block;background:var(--tag-bg,rgba(124,77,255,.12));color:var(--tag-color,#7c4dff);padding:1px 7px;border-radius:12px;font-size:.82em;text-decoration:none;font-weight:500}',
    /* ── Inline / block formatting ─────────────────────────────────────────── */
    'mark{background:var(--highlight-bg,#fff59d);color:var(--highlight-color,inherit);padding:0 2px;border-radius:2px}',
    'del{text-decoration:line-through;opacity:.7}',
    /* ── Math ──────────────────────────────────────────────────────────────── */
    '.math-block{display:block;overflow-x:auto;padding:.5em 0;text-align:center}',
    '.math-inline{font-style:italic}',
    '.math-inline-display{display:inline-block;vertical-align:middle;font-style:normal}',
    /* ── Embeds ─────────────────────────────────────────────────────────────── */
    '.obsidian-image{max-width:100%;height:auto;border-radius:4px;display:block;margin:.5em auto}',
    '.obsidian-audio,.obsidian-video{display:block;max-width:100%;margin:.5em 0}',
    '.obsidian-pdf{width:100%;min-height:500px;border:1px solid #ccc;border-radius:4px}',
    '.obsidian-transclusion{border-left:3px solid #ccc;padding:.5em .8em;background:rgba(0,0,0,.03);border-radius:0 4px 4px 0;margin:.5em 0}',
    '.obsidian-block-id{display:none}',
    /* ── Mermaid viewer (pan/zoom) ──────────────────────────────────────────── */
    '.obsidian-mermaid{margin:1.5em 0}',
    '.mermaid-viewer-wrap{position:relative;border-radius:10px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.07);overflow:hidden;user-select:none;touch-action:none;min-height:180px}',
    '.mermaid-canvas{position:absolute;top:50%;left:50%;cursor:grab;transform-origin:0 0;will-change:transform;margin:0}',
    '.mermaid-canvas.is-dragging{cursor:grabbing}',
    '.mermaid-canvas svg{max-width:none!important;display:block}',
    '.mermaid-toolbar{position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:10;opacity:0;transition:opacity .2s;pointer-events:none}',
    '.mermaid-viewer-wrap:hover .mermaid-toolbar{opacity:1;pointer-events:auto}',
    '.mermaid-tb-btn{background:rgba(15,15,25,0.78);color:rgba(255,255,255,0.9);border:1px solid rgba(255,255,255,0.18);border-radius:5px;width:30px;height:30px;cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}',
    '.mermaid-tb-btn:hover{background:rgba(80,80,140,0.75)}',
    '.mermaid-hint{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);font-size:.72em;color:rgba(255,255,255,0.35);pointer-events:none;white-space:nowrap}',
    /* ── TikZ diagram wrapper ────────────────────────────────────────────────── */
    '.tikz-wrapper{position:relative;margin:1.5em 0;background:rgba(0,0,0,0.30);border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;user-select:none}',
    /* Dark-mode invert: TikZJax emits black-on-white SVGs; flip them for dark themes */
    '@media (prefers-color-scheme:dark){.tikz-wrapper svg{filter:invert(1) hue-rotate(180deg)}}',
    '.tikz-loading{color:rgba(255,255,255,0.45);font-size:.85em;padding:2.5em 0;text-align:center}',
    /* Pan/zoom canvas — same model as Mermaid viewer */
    '.tikz-panzoom-wrap{position:relative;overflow:hidden;min-height:200px;touch-action:none}',
    '.tikz-canvas{display:block;transform-origin:0 0;will-change:transform;cursor:grab;padding:0;margin:0}',
    '.tikz-canvas.is-dragging{cursor:grabbing}',
    /* SVG base sizes: width-driven, height is always auto from aspect ratio.
       Large enough to be readable at fit() scale, but fit() will scale them
       down to fill the viewer so the actual rendered size adjusts automatically. */
    '.tikz-canvas svg{display:block}',
    '.tikz-canvas svg.tikz-tall{width:700px;height:auto}',
    '.tikz-canvas svg.tikz-wide{width:1100px;height:auto}',
    '.tikz-canvas svg.tikz-square{width:860px;height:auto}',
    /* Toolbar (appears on hover) */
    '.tikz-toolbar{position:absolute;top:8px;right:8px;display:flex;gap:4px;z-index:10;opacity:0;transition:opacity .2s;pointer-events:none}',
    '.tikz-wrapper:hover .tikz-toolbar{opacity:1;pointer-events:auto}',
    '.tikz-tb-btn{background:rgba(15,15,25,0.78);color:rgba(255,255,255,0.88);border:1px solid rgba(255,255,255,0.18);border-radius:5px;width:28px;height:28px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:0}',
    '.tikz-tb-btn:hover{background:rgba(80,80,140,0.75)}',
    '.tikz-tb-btn svg{pointer-events:none}',
    /* Scroll hint */
    '.tikz-hint{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-size:.7em;color:rgba(255,255,255,0.32);pointer-events:none;white-space:nowrap;transition:opacity .4s}',
    '.tikz-hint.tikz-hint-gone{opacity:0}',
    /* -- TikZ error block -- */
    '.tikz-error{display:flex;align-items:flex-start;gap:.6em;margin:.5em;padding:.7em 1em;border-left:4px solid #ef5350;border-radius:4px;background:rgba(239,83,80,.07);color:#ef5350;font-size:.85em;font-family:monospace}',
    '.tikz-error-icon{font-size:1.1em;flex-shrink:0;margin-top:.05em}',
    '.tikz-error-body{display:flex;flex-direction:column;gap:.35em}',
    '.tikz-error-msg{opacity:.9;font-weight:600}',
    '.tikz-error-src{opacity:.6;white-space:pre-wrap;font-size:.92em;max-height:6em;overflow-y:auto;border-top:1px solid rgba(239,83,80,.2);padding-top:.35em;margin-top:.1em}',
    /* ── Language-aware code blocks ──────────────────────────────────────────── */
    '.code-block-shell{border-radius:9px;overflow:hidden;margin:1em 0;border:1px solid rgba(255,255,255,0.07);background:rgba(0,0,0,0.35)}',
    '.code-block-terminal{background:#0d1117}',
    '.code-block-header{display:flex;align-items:center;gap:.5em;padding:.45em .75em;background:rgba(255,255,255,0.04);border-bottom:2px solid var(--lang-accent,#64748b)}',
    '.code-block-terminal .code-block-header{background:#161b22;border-bottom-color:var(--lang-accent,#22c55e)}',
    '.code-block-dots{display:flex;gap:5px;margin-right:.25em}',
    '.dot{width:11px;height:11px;border-radius:50%}',
    '.dot-red{background:#ff5f56}.dot-yellow{background:#ffbd2e}.dot-green{background:#27c93f}',
    '.code-block-badge{font-size:.72em;font-weight:600;letter-spacing:.04em;color:var(--lang-accent,#94a3b8);text-transform:uppercase;margin-right:auto;opacity:.9}',
    '.code-block-copy{background:transparent;border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.5);border-radius:4px;padding:3px 6px;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:.75em;transition:color .15s,background .15s}',
    '.code-block-copy:hover{background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.85)}',
    '.code-block-copy.copied{color:#22c55e;border-color:rgba(34,197,94,.35)}',
    '.code-block-shell pre{margin:0!important;border-radius:0!important;border:none!important;background:transparent!important}',
    '.code-block-shell pre code{background:transparent!important;font-size:.82em!important;line-height:1.65!important}',
    /* ── Task lists ──────────────────────────────────────────────────────────── */
    'ul.task-list{list-style:none;padding-left:1.2em}',
    'li.task-list-item{display:flex;align-items:baseline;gap:.45em;padding:.1em 0}',
    '.task-list-checkbox{flex-shrink:0;appearance:none;-webkit-appearance:none;width:1em;height:1em;border:1.5px solid currentColor;border-radius:3px;vertical-align:middle;position:relative;cursor:default;opacity:.75}',
    '.task-list-checkbox[checked],.task-list-checkbox:checked{background:var(--accent,#1a73e8);border-color:var(--accent,#1a73e8)}',
    '.task-list-checkbox[checked]::after,.task-list-checkbox:checked::after{content:"✓";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#fff;font-weight:700}',
    /* Extended task state colours */
    'li.task-done>.task-list-checkbox{background:var(--accent,#1a73e8);border-color:var(--accent,#1a73e8)}',
    'li.task-done>.task-list-checkbox::after{content:"✓";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#fff;font-weight:700}',
    'li.task-done{opacity:.65;text-decoration:none}',
    'li.task-in-progress>.task-list-checkbox{border-color:#ffa726;background:rgba(255,167,38,.15)}',
    'li.task-in-progress>.task-list-checkbox::after{content:"◑";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#ffa726}',
    'li.task-cancelled{opacity:.5;text-decoration:line-through}',
    'li.task-cancelled>.task-list-checkbox{border-color:#78909c;background:rgba(120,144,156,.12)}',
    'li.task-cancelled>.task-list-checkbox::after{content:"—";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#78909c}',
    'li.task-important>.task-list-checkbox{border-color:#ef5350;background:rgba(239,83,80,.12)}',
    'li.task-important>.task-list-checkbox::after{content:"!";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#ef5350;font-weight:900}',
    'li.task-deferred>.task-list-checkbox{border-color:#ab47bc}',
    'li.task-deferred>.task-list-checkbox::after{content:"»";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#ab47bc}',
    'li.task-scheduled>.task-list-checkbox{border-color:#29b6f6}',
    'li.task-scheduled>.task-list-checkbox::after{content:"◷";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#29b6f6}',
    'li.task-question>.task-list-checkbox{border-color:#ffd54f}',
    'li.task-question>.task-list-checkbox::after{content:"?";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.75em;color:#ffd54f;font-weight:900}',
    'li.task-star>.task-list-checkbox{border-color:#ffa726;background:rgba(255,167,38,.1)}',
    'li.task-star>.task-list-checkbox::after{content:"★";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.7em;color:#ffa726}',
    'li.task-bookmark>.task-list-checkbox{border-color:#7c4dff}',
    'li.task-bookmark>.task-list-checkbox::after{content:"🔖";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.65em}'
  ].join('\n');

  /* ── Callout fold toggle script ─────────────────────────────────────────── */

  var TOGGLE_JS = '(function(){' +
    'function init(root){' +
      '(root||document).querySelectorAll(\'.callout[data-foldable="true"] .callout-title\').forEach(function(el){' +
        'if(el._obsOk)return;el._obsOk=true;' +
        'el.addEventListener("click",function(){' +
          'var c=el.closest(".callout"),body=c.querySelector(".callout-content"),icon=c.querySelector(".callout-fold-icon"),open=c.dataset.open==="true";' +
          'c.dataset.open=open?"false":"true";body.style.display=open?"none":"";' +
          'if(icon)icon.textContent=open?"\u25b8":"\u25be";' +
        '});' +
      '});' +
    '}' +
    'window.obsidianInitCalloutFolds=init;' +
    'init(document);' +
  '})();';

  /* ── Main plugin ────────────────────────────────────────────────────────── */

  function obsidianPlugin(md, options) {
    var opts = {
      resolveWikilink: null, resolveEmbed: null, resolveTag: null,
      resolveTransclusion: null, calloutIcons: {},
      enableMath: true, enableTags: true, enableComments: true, enableTikz: true,
      enableHighlight: true, enableStrikethrough: true,
      enableTaskLists: true, enableMermaid: true, enableBlockIds: true
    };
    if (options) {
      for (var k in options) {
        if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];
      }
    }

    if (opts.enableMath)            ruleMathBlockPromote(md); /* must run before any other custom core rule */
    if (opts.enableComments)       ruleComments(md);
    if (opts.enableMath)           { ruleMathRawDelimiters(md); ruleMathBlock(md); ruleMathInlineDisplay(md); ruleMathInline(md); }
    if (opts.enableHighlight)      ruleHighlight(md);
    if (opts.enableStrikethrough)  ruleStrikethrough(md);
    if (opts.enableBlockIds)       ruleBlockIds(md);
    if (opts.enableTags)           ruleTags(md, opts);
    if (opts.enableTaskLists)      ruleTaskLists(md);
    ruleWikilinks(md, opts);
    ruleEmbeds(md, opts);
    ruleCallouts(md, opts);
    if (opts.enableMermaid)        ruleMermaid(md);
    if (opts.enableTikz)          ruleTikz(md);
    ruleDesmos(md);   
    ruleDesmos3D(md);
    ruleHeadingIds(md);
  }

  /* ── Expose globals ─────────────────────────────────────────────────────── */

  global.obsidianPlugin             = obsidianPlugin;
  global.obsidianParseFrontmatter   = parseFrontmatter;
  global.obsidianGetCSS             = function () { return DEFAULT_CSS; };
  global.obsidianGetToggleScript    = function () { return TOGGLE_JS; };
  /* Post-render init helpers */
  global.obsidianInitCalloutFolds   = function (root) {
    /* Inline version — also injected as a <script> via obsidianGetToggleScript */
    (root || document)
      .querySelectorAll('.callout[data-foldable="true"] .callout-title')
      .forEach(function (el) {
        if (el._obsOk) return; el._obsOk = true;
        el.addEventListener('click', function () {
          var c    = el.closest('.callout');
          var body = c.querySelector('.callout-content');
          var icon = c.querySelector('.callout-fold-icon');
          var open = c.dataset.open === 'true';
          c.dataset.open = open ? 'false' : 'true';
          body.style.display = open ? 'none' : '';
          if (icon) icon.textContent = open ? '\u25b8' : '\u25be';
        });
      });
  };
  global.obsidianInitMath           = initMath;
  global.obsidianInitTikz           = function (root) {
    /* ── Smart SVG sizer ─────────────────────────────────────────────────── */
    function _tikzSizeSVG(svg) {
      /* Ensure viewBox exists */
      var vb = svg.getAttribute('viewBox');
      if (!vb) {
        var w0 = parseFloat(svg.getAttribute('width'))  || 0;
        var h0 = parseFloat(svg.getAttribute('height')) || 0;
        if (w0 > 0 && h0 > 0) {
          svg.setAttribute('viewBox', '0 0 ' + w0 + ' ' + h0);
          vb = '0 0 ' + w0 + ' ' + h0;
        }
      }

      /* Read aspect ratio from viewBox */
      var svgW = 0, svgH = 0;
      if (vb) {
        var pts = vb.trim().split(/[\s,]+/);
        svgW = parseFloat(pts[2]) || 0;
        svgH = parseFloat(pts[3]) || 0;
      }
      if (!svgW) svgW = parseFloat(svg.getAttribute('width'))  || 300;
      if (!svgH) svgH = parseFloat(svg.getAttribute('height')) || 300;

      var ratio = svgW / (svgH || 1);

      /* Intelligent sizing: Scale based on viewport width and aspect ratio.
         Aim for readable size while staying within reasonable bounds.
         The baseW values are now max widths; they'll scale down if needed. */
      var viewportW = window.innerWidth * 0.92;  /* Account for scrollbar & margins */
      var maxW, baseW;
      
      if      (ratio < 0.8)  maxW = 375;   /* tall/portrait  — less wide */
      else if (ratio > 1.25) maxW = 600;   /* wide/landscape — more wide */
      else                   maxW = 450;   /* squarish — balanced */

      /* Scale down if viewport is too narrow */
      baseW = Math.min(maxW, Math.max(viewportW, 400));
      /* For very small viewports, use a more conservative approach */
      if (viewportW < 600) {
        baseW = Math.min(maxW, viewportW - 30);
      }

      baseW *= 0.3;  /* Adjust overall size (0.3 is a good balance for most cases) */ 
      var baseH = Math.round(baseW / ratio);

      /* Write explicit pixel width/height so fitToView can read them with
         getAttribute — same pattern Mermaid uses, avoids CSS sizing conflicts */
      svg.setAttribute('width',  baseW);
      svg.setAttribute('height', baseH);
      /* Remove CSS classes that would override these attrs */
      svg.classList.remove('tikz-tall', 'tikz-wide', 'tikz-square');
    }

    /* ── Pan / zoom engine ───────────────────────────────────────────────── */
    function _tikzPanZoom(wrap, canvas, svg) {
      var scale = 1, tx = 0, ty = 0;
      var dragging = false, startX, startY, startTx, startTy;
      var lastTouchDist = null;
      var SNAP_MS  = 240;
      var ELASTIC  = 0.28;
      var LEASH    = 80;
      var DRAG_RESISTANCE = 0.75;  /* 0-1: lower = more resistance */

      function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

      function applyT(animated) {
        if (animated) {
          canvas.style.transition = 'transform ' + SNAP_MS + 'ms cubic-bezier(0.25,0.46,0.45,0.94)';
          setTimeout(function () { canvas.style.transition = 'none'; }, SNAP_MS + 16);
        } else {
          canvas.style.transition = 'none';
        }
        canvas.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
      }

      /* Read SVG pixel size the same way Mermaid does — from the attribute */
      function svgSize() {
        var w = parseFloat(svg.getAttribute('width'))  || 860;
        var h = parseFloat(svg.getAttribute('height')) || 400;
        return { w: w, h: h };
      }

      function bounds() {
        var s  = svgSize();
        var dW = s.w * scale, dH = s.h * scale;
        var vW = wrap.clientWidth  || 800;
        var vH = wrap.clientHeight || 400;
        var txMin, txMax, tyMin, tyMax;
        if (dW <= vW) { var cx = (vW-dW)/2; txMin = cx-LEASH; txMax = cx+LEASH; }
        else          { txMin = vW-dW-LEASH; txMax = LEASH; }
        if (dH <= vH) { var cy = (vH-dH)/2; tyMin = cy-LEASH; tyMax = cy+LEASH; }
        else          { tyMin = vH-dH-LEASH; tyMax = LEASH; }
        return { txMin: txMin, txMax: txMax, tyMin: tyMin, tyMax: tyMax };
      }

      function snapBack() {
        var b = bounds();
        var nx = clamp(tx, b.txMin, b.txMax);
        var ny = clamp(ty, b.tyMin, b.tyMax);
        if (nx === tx && ny === ty) return;
        tx = nx; ty = ny; applyT(true);
      }

      function elasticClamp(v, lo, hi) {
        if (v < lo) return lo + (v - lo) * ELASTIC;
        if (v > hi) return hi + (v - hi) * ELASTIC;
        return v;
      }

      function zoomAt(factor, cx, cy) {
        var rect = wrap.getBoundingClientRect();
        var ox = cx - rect.left, oy = cy - rect.top;
        var ns = clamp(scale * factor, 0.06, 12);
        var r  = ns / scale;
        tx = ox - r * (ox - tx);
        ty = oy - r * (oy - ty);
        scale = ns;
        applyT(false);
        snapBack();
      }

      /* Exact same math as Mermaid fitToView — getAttribute gives px values */
      function fitToView() {
        var s     = svgSize();
        var wrapW = wrap.clientWidth  || 800;
        var wrapH = wrap.clientHeight || 400;
        if (!wrapW || !wrapH) { requestAnimationFrame(fitToView); return; }
        var pad   = 48;
        var ns    = Math.min((wrapW - pad) / s.w, (wrapH - pad) / s.h, 2.5);
        ns        = Math.max(ns, 0.06);
        scale     = ns;
        tx        = (wrapW - s.w * scale) / 2;
        ty        = (wrapH - s.h * scale) / 2;
        applyT(true);
      }

      /* Wheel zoom */
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1.14 : 1 / 1.14, e.clientX, e.clientY);
      }, { passive: false });

      /* Mouse drag */
      canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        dragging = true;
        startX = e.clientX; startY = e.clientY;
        startTx = tx; startTy = ty;
        canvas.classList.add('is-dragging');
        e.preventDefault();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var b = bounds();
        tx = elasticClamp(startTx + (e.clientX - startX) * DRAG_RESISTANCE, b.txMin, b.txMax);
        ty = elasticClamp(startTy + (e.clientY - startY) * DRAG_RESISTANCE, b.tyMin, b.tyMax);
        applyT(false);
      });
      window.addEventListener('mouseup', function () {
        if (!dragging) return;
        dragging = false;
        canvas.classList.remove('is-dragging');
        snapBack();
      });

      /* Touch pan + pinch-zoom */
      canvas.addEventListener('touchstart', function (e) {
        if (e.touches.length === 1) {
          dragging = true;
          startX = e.touches[0].clientX; startY = e.touches[0].clientY;
          startTx = tx; startTy = ty;
        } else if (e.touches.length === 2) {
          dragging = false;
          lastTouchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY);
        }
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (e.touches.length === 1 && dragging) {
          var b = bounds();
          tx = elasticClamp(startTx + (e.touches[0].clientX - startX) * DRAG_RESISTANCE, b.txMin, b.txMax);
          ty = elasticClamp(startTy + (e.touches[0].clientY - startY) * DRAG_RESISTANCE, b.tyMin, b.tyMax);
          applyT(false);
        } else if (e.touches.length === 2 && lastTouchDist) {
          var d = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY);
          zoomAt(d / lastTouchDist,
            (e.touches[0].clientX + e.touches[1].clientX) / 2,
            (e.touches[0].clientY + e.touches[1].clientY) / 2);
          lastTouchDist = d;
        }
      }, { passive: true });
      canvas.addEventListener('touchend', function () {
        dragging = false; lastTouchDist = null; snapBack();
      }, { passive: true });

      /* Toolbar */
      wrap.querySelectorAll('.tikz-tb-btn[data-a]').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var cx = wrap.getBoundingClientRect().left + wrap.clientWidth  / 2;
          var cy = wrap.getBoundingClientRect().top  + wrap.clientHeight / 2;
          var a  = btn.dataset.a;
          if (a === 'zin')              zoomAt(1.35, cx, cy);
          if (a === 'zout')             zoomAt(1 / 1.35, cx, cy);
          if (a === 'fit' || a === 'reset') fitToView();
          if (a === 'dl') {
            var blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
            var url  = URL.createObjectURL(blob);
            var dl   = document.createElement('a');
            dl.href = url; dl.download = 'diagram.svg';
            document.body.appendChild(dl); dl.click(); document.body.removeChild(dl);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          }
        });
      });

      /* Hint fade */
      var hint = wrap.querySelector('.tikz-hint');
      function fadeHint() { if (hint) hint.classList.add('tikz-hint-gone'); }
      ['wheel', 'mousedown', 'touchstart'].forEach(function (ev) {
        canvas.addEventListener(ev, fadeHint, { once: true });
      });

      /* Initial fit — single rAF is enough since getAttribute doesn't need layout */
      requestAnimationFrame(fitToView);
    }

    function _wrapTikZ(wrapper, svg) {
      if (wrapper.querySelector('.tikz-panzoom-wrap')) return;

      /* _tikzSizeSVG already wrote explicit px width/height attrs on the SVG */
      var rawW  = parseFloat(svg.getAttribute('width'))  || 860;
      var rawH  = parseFloat(svg.getAttribute('height')) || 400;
      var wW    = wrapper.clientWidth || window.innerWidth;
      var pad   = 56;
      var maxH  = Math.floor(window.innerHeight * 0.82);
      var minH  = 220;

      /* Compute the scale fit() will use, then size the container to match */
      var fitScale = Math.min((wW - pad) / rawW, maxH / rawH, 2.5);
      fitScale     = Math.max(fitScale, 0.06);
      var vH = Math.min(Math.max(Math.ceil(rawH * fitScale) + pad, minH), maxH);

      var wrap = document.createElement('div');
      wrap.className    = 'tikz-panzoom-wrap';
      wrap.style.height = vH + 'px';

      var icon = function (paths) {
        return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
      };
      var tb = document.createElement('div');
      tb.className = 'tikz-toolbar';
      tb.innerHTML =
        '<button class="tikz-tb-btn" data-a="zin"   title="Zoom in">'     + icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>') + '</button>' +
        '<button class="tikz-tb-btn" data-a="zout"  title="Zoom out">'    + icon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>') + '</button>' +
        '<button class="tikz-tb-btn" data-a="fit"   title="Fit to view">' + icon('<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>') + '</button>' +
        '<button class="tikz-tb-btn" data-a="reset" title="Reset">'       + icon('<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>') + '</button>' +
        '<button class="tikz-tb-btn" data-a="dl"    title="Download SVG">'+ icon('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>') + '</button>';

      var canvas = document.createElement('div');
      canvas.className = 'tikz-canvas';

      var hint = document.createElement('div');
      hint.className   = 'tikz-hint';
      hint.textContent = 'Scroll to zoom · Drag to pan';

      canvas.appendChild(svg);
      wrap.appendChild(tb);
      wrap.appendChild(canvas);
      wrap.appendChild(hint);
      wrapper.appendChild(wrap);

      _tikzPanZoom(wrap, canvas, svg);
    }

    /* ── Preamble extractor ──────────────────────────────────────────────── */
    function extractPreamble(raw) {
      var lines = raw.split('\n'), preamble = [], bodyLines = [], inBody = false;
      for (var i = 0; i < lines.length; i++) {
        var line = lines[i], trimmed = line.trim();
        if (inBody) { bodyLines.push(line); continue; }
        if (/^\\usepackage\b/.test(trimmed) || /^\\usetikzlibrary\b/.test(trimmed)) { preamble.push(trimmed); continue; }
        if (/^\\[a-zA-Z]/.test(trimmed) && !/^\\begin\b/.test(trimmed)) { preamble.push(trimmed); continue; }
        inBody = true; bodyLines.push(line);
      }
      var body = bodyLines.join('\n').trimRight();
      if (body.indexOf('\\end{document}') === -1) body += '\n\\end{document}';
      return { preamble: preamble.join('') + '\\begin{document}', body: body };
    }

    var el = root || document;
    el.querySelectorAll('.tikz-source:not([data-tikz-rendered])').forEach(function (div) {
      div.setAttribute('data-tikz-rendered', 'true');
      var wrapper   = div.closest('.tikz-wrapper') || div.parentNode;
      var rawSource = div.textContent;
      var parsed    = extractPreamble(rawSource);

      var s = document.createElement('script');
      s.type = 'text/tikz';
      s.setAttribute('data-add-to-preamble', parsed.preamble);
      s.textContent = parsed.body;

      var obs = new MutationObserver(function (mutations) {
        for (var m = 0; m < mutations.length; m++) {
          var added = mutations[m].addedNodes;
          for (var n = 0; n < added.length; n++) {
            var node = added[n];
            /* Error: tikzjax inserts a broken IMG */
            if (node.nodeName === 'IMG') {
              obs.disconnect();
              var ld = wrapper.querySelector('.tikz-loading');
              if (ld) ld.parentNode.removeChild(ld);
              var err = document.createElement('div');
              err.className = 'tikz-error';
              var srcSafe = rawSource.trim().replace(/&/g,'&amp;').replace(/</g,'&lt;');
              err.innerHTML =
                '<span class="tikz-error-icon">⚠️</span>' +
                '<div class="tikz-error-body">' +
                  '<span class="tikz-error-msg">TikZ render failed — check diagram syntax.</span>' +
                  '<pre class="tikz-error-src">' + srcSafe + '</pre>' +
                '</div>';
              if (node.parentNode) node.parentNode.replaceChild(err, node);
              else wrapper.appendChild(err);
              return;
            }
            /* Success: SVG appeared */
            if (node.nodeName === 'svg' || (node.querySelector && node.querySelector('svg'))) {
              var svg2 = node.nodeName === 'svg' ? node : node.querySelector('svg');
              if (svg2) _tikzSizeSVG(svg2);
              var ld2 = wrapper.querySelector('.tikz-loading');
              if (ld2) ld2.parentNode.removeChild(ld2);
            }
          }
        }
      });
      obs.observe(wrapper, { childList: true, subtree: true });

      wrapper.addEventListener('tikzjax-load-finished', function cleanup() {
        wrapper.removeEventListener('tikzjax-load-finished', cleanup);
        obs.disconnect();
        var svg = wrapper.querySelector('svg');
        if (svg) {
          _tikzSizeSVG(svg);
          var ld3 = wrapper.querySelector('.tikz-loading');
          if (ld3) ld3.parentNode.removeChild(ld3);
          _wrapTikZ(wrapper, svg);
        }
      });

      div.parentNode.replaceChild(s, div);
    });
  };
  global.obsidianInitMermaid        = initMermaid;
  global.obsidianInitHighlight      = initHighlight;
  global.obsidianInitDesmos         = initDesmos;
  global.obsidianInitDesmos3D       = initDesmos3D;

}(window));