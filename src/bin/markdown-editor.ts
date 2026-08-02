// Markdown Editor Module
// Provides an in-browser editor pane for markdown files.
// Edits are stored in sessionStorage and survive page navigation within the session.
// The split-view wiring (left preview ↔ right editor) is handled by app.js;
// this module is responsible only for the editor pane itself.

const MarkdownEditor = (() => {
  const EDITOR_STORAGE_PREFIX = 'md-editor-';
  const MAX_HISTORY_SIZE = 50;
  const HISTORY_DEBOUNCE = 300;

  // ─── Undo/Redo History System ─────────────────────────────────────────────
  const EditorHistory = (() => {
    let stack = [];
    let currentIndex = -1;
    let debounceTimer = null;

    return {
      init: function(initialValue) {
        stack = [initialValue];
        currentIndex = 0;
      },
      push: function(value) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          // Remove any future states if user made changes after undo
          stack = stack.slice(0, currentIndex + 1);
          // Add new state
          stack.push(value);
          if (stack.length > MAX_HISTORY_SIZE) {
            stack.shift();
          } else {
            currentIndex++;
          }
        }, HISTORY_DEBOUNCE);
      },
      undo: function() {
        clearTimeout(debounceTimer);
        if (currentIndex > 0) {
          currentIndex--;
          return stack[currentIndex];
        }
        return null;
      },
      redo: function() {
        clearTimeout(debounceTimer);
        if (currentIndex < stack.length - 1) {
          currentIndex++;
          return stack[currentIndex];
        }
        return null;
      },
      canUndo: function() { return currentIndex > 0; },
      canRedo: function() { return currentIndex < stack.length - 1; }
    };
  })();

  // ─── Format action table ──────────────────────────────────────────────────
  const FORMAT_ACTIONS = {
    bold:    { before: '**',  after: '**'  },
    italic:  { before: '*',   after: '*'   },
    strike:  { before: '~~',  after: '~~'  },
    heading: { before: '# ',  after: ''    },
    code:    { before: '`',   after: '`'   },
    quote:   { before: '> ',  after: ''    },
    ul:      { before: '- ',  after: ''    },
    ol:      { before: '1. ', after: ''    },
    h2:      { before: '## ', after: ''    },
    h3:      { before: '### ', after: ''   },
    codeblock: { before: '```\n', after: '\n```' },
  };

  // ─── Internal helpers ─────────────────────────────────────────────────────

  function showToast(wrapper, message, type) {
    type = type || 'success';
    const bar = wrapper && wrapper.querySelector('.mde-status-bar');
    if (!bar) return;
    bar.textContent = message;
    bar.className = 'mde-status-bar mde-status-' + type + ' mde-status-visible';
    clearTimeout(bar._hide);
    bar._hide = setTimeout(function() { bar.className = 'mde-status-bar'; }, 2500);
  }

  // ─── Text insertion helpers ───────────────────────────────────────────────

  function insertFormat(before, after, ta) {
    if (!ta) return;
    var start = ta.selectionStart;
    var end   = ta.selectionEnd;
    var text  = ta.value;
    var sel   = text.substring(start, end) || 'text';
    ta.value = text.substring(0, start) + before + sel + after + text.substring(end);
    ta.selectionStart = start + before.length;
    ta.selectionEnd   = start + before.length + sel.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertLink(ta) {
    if (!ta) return;
    var url = prompt('Enter URL:', 'https://');
    if (!url) return;
    var linkText = prompt('Enter link text:', ta.value.substring(ta.selectionStart, ta.selectionEnd) || 'link');
    if (linkText == null) return;
    var start = ta.selectionStart;
    var md    = '[' + linkText + '](' + url + ')';
    ta.value  = ta.value.substring(0, start) + md + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + md.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertTable(ta) {
    if (!ta) return;
    var cols = parseInt(prompt('Number of columns:', '3'), 10);
    var rows = parseInt(prompt('Number of data rows:', '2'), 10);
    if (!cols || !rows || cols < 1 || rows < 1) return;
    var header  = '| ' + Array.from({ length: cols }, function(_, i) { return 'Header ' + (i + 1); }).join(' | ') + ' |';
    var divider = '| ' + Array(cols).fill('---').join(' | ') + ' |';
    var dataRow = '| ' + Array(cols).fill('Cell').join(' | ') + ' |';
    var table   = [header, divider].concat(Array(rows).fill(dataRow)).join('\n');
    var start   = ta.selectionStart;
    ta.value = ta.value.substring(0, start) + '\n' + table + '\n' + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + table.length + 2;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertMath(ta, isBlock) {
    if (!ta) return;
    var before = isBlock ? '\n$$\n' : '$';
    var after = isBlock ? '\n$$\n' : '$';
    var start = ta.selectionStart;
    var sel = ta.value.substring(start, ta.selectionEnd) || 'a^2 + b^2 = c^2';
    ta.value = ta.value.substring(0, start) + before + sel + after + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + sel.length;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertDesmos(ta) {
    if (!ta) return;
    var desmosCode = '```desmos\n// Graph goes here\ny = x^2\n```';
    var start = ta.selectionStart;
    ta.value = ta.value.substring(0, start) + '\n' + desmosCode + '\n' + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + desmosCode.length + 2;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertTikz(ta) {
    if (!ta) return;
    var tikzCode = '```tikz\n\\draw (0,0) -- (1,1);\n\\draw (1,0) -- (0,1);\n```';
    var start = ta.selectionStart;
    ta.value = ta.value.substring(0, start) + '\n' + tikzCode + '\n' + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + tikzCode.length + 2;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  function insertCallout(ta, type) {
    if (!ta) return;
    type = type || 'note';
    var titles = {
      note: 'Note',
      info: 'Info',
      tip: 'Tip',
      warning: 'Warning',
      danger: 'Danger',
      example: 'Example'
    };
    var calloutText = '> [!' + type.toUpperCase() + '] ' + titles[type] + '\n> Your content here';
    var start = ta.selectionStart;
    ta.value = ta.value.substring(0, start) + '\n' + calloutText + '\n' + ta.value.substring(ta.selectionEnd);
    ta.selectionStart = ta.selectionEnd = start + calloutText.length + 2;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  function updateStats(ta, statsEl) {
    if (!statsEl) return;
    var text  = ta.value;
    var words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    var lines = text === '' ? 0 : text.split('\n').length;
    statsEl.innerHTML = '<span class="mde-stat"><strong>' + words + '</strong> W</span>' +
                        '<span class="mde-stat-sep">|</span>' +
                        '<span class="mde-stat"><strong>' + text.length + '</strong> C</span>' +
                        '<span class="mde-stat-sep">|</span>' +
                        '<span class="mde-stat"><strong>' + lines + '</strong> L</span>';
  }

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  function attachShortcuts(ta, wrapper, storageKey, onClose) {
    ta.addEventListener('keydown', function(e) {
      if (!e.ctrlKey && !e.metaKey) return;
      var k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); insertFormat('**', '**', ta); return; }
      if (k === 'i') { e.preventDefault(); insertFormat('*',  '*',  ta); return; }
      if (k === 'k') { e.preventDefault(); insertLink(ta); return; }
      if (k === 'm') { 
        e.preventDefault(); 
        if (e.shiftKey) {
          insertMath(ta, true); // Ctrl+Shift+M = block math
        } else {
          insertMath(ta, false); // Ctrl+M = inline math
        }
        return; 
      }
      if (k === 'd') { e.preventDefault(); insertDesmos(ta); return; }
      if (k === 't') { e.preventDefault(); insertTikz(ta); return; }
      if (k === 'z') { 
        e.preventDefault(); 
        var undoVal = EditorHistory.undo();
        if (undoVal !== null) {
          ta.value = undoVal;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          showToast(wrapper, 'Undo');
        }
        return; 
      }
      if (k === 'y') { 
        e.preventDefault(); 
        var redoVal = EditorHistory.redo();
        if (redoVal !== null) {
          ta.value = redoVal;
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          showToast(wrapper, 'Redo');
        }
        return; 
      }
      if (k === 's') {
        e.preventDefault();
        sessionStorage.setItem(storageKey, ta.value);
        if (onClose) onClose(ta.value);
        showToast(wrapper, '\u2713 Saved');
        return;
      }
    });

    // Tab → 2 spaces
    ta.addEventListener('keydown', function(e) {
      if (e.key !== 'Tab') return;
      e.preventDefault();
      var s = ta.selectionStart;
      ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 2;
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // ─── CSS injection (once) ─────────────────────────────────────────────────

  function buildStyles() {
    if (document.getElementById('mde-styles')) return;
    var style = document.createElement('style');
    style.id = 'mde-styles';
    style.textContent = [
      ':root{--mde-bg:#ffffff;--mde-bg-secondary:#f5f7fa;--mde-text:#1a1a2e;--mde-text-secondary:#5a5a7a;',
        '--mde-border:#d9dce5;--mde-toolbar:#ffffff;--mde-btn-bg:#f0f2f8;--mde-btn-hover:#e5e8f2;',
        '--mde-input-bg:#ffffff;--mde-accent:#10b981;--mde-shadow:0 2px 8px rgba(0,0,0,0.08);}',
      '@media(prefers-color-scheme:dark){:root{--mde-bg:#0f1419;--mde-bg-secondary:#1a1f2e;--mde-text:#e8eaed;',
        '--mde-text-secondary:#a8aac0;--mde-border:#2a2d3a;--mde-toolbar:#1a1f2e;--mde-btn-bg:#252d3d;',
        '--mde-btn-hover:#303849;--mde-input-bg:#0f1419;--mde-accent:#10b981;--mde-shadow:0 8px 24px rgba(0,0,0,0.3);}}',
      '.mde-wrapper{display:flex;flex-direction:column;height:100%;font-family:"JetBrains Mono","Fira Code","Consolas",monospace;',
        'background:var(--mde-bg);color:var(--mde-text);overflow:hidden;position:relative;transition:background-color 0.3s,color 0.3s;}',
      '.mde-toolbar{display:flex;align-items:center;gap:6px;padding:10px 14px;background:var(--mde-toolbar);',
        'border-bottom:1px solid var(--mde-border);flex-shrink:0;flex-wrap:wrap;row-gap:8px;overflow-x:auto;max-width:100%;',
        'box-shadow:var(--mde-shadow);transition:background-color 0.3s;}',
      '.mde-toolbar-sep{width:1px;height:20px;background:var(--mde-border);margin:0 2px;flex-shrink:0;opacity:0.2;}',
      '.mde-toolbar-right{margin-left:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap;}',
      '.mde-btn{display:inline-flex;align-items:center;justify-content:center;gap:3px;',
        'padding:6px 10px;border:1.5px solid var(--mde-border);border-radius:6px;font-size:13px;font-weight:500;',
        'cursor:pointer;background:var(--mde-btn-bg);color:var(--mde-text-secondary);line-height:1;font-family:inherit;',
        'min-width:auto;height:32px;transition:all 0.2s cubic-bezier(0.4,0,0.2,1);',
        'white-space:nowrap;flex-shrink:0;position:relative;}',
      '.mde-btn:hover{background:var(--mde-btn-hover);color:var(--mde-text);border-color:var(--mde-accent);',
        'transform:translateY(-2px);box-shadow:0 4px 16px rgba(16,185,129,0.15);}',
      '.mde-btn:active{transform:translateY(0);opacity:0.9;}',
      '.mde-btn-primary{background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;border-color:#10b981;padding:8px 16px;}',
      '.mde-btn-primary:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(16,185,129,0.4);border-color:#059669;}',
      '.mde-btn-danger{color:#ef4444;border-color:var(--mde-border);}',
      '.mde-btn-danger:hover{background:rgba(239,68,68,0.08);border-color:#ef4444;color:#ef4444;}',
      '.mde-textarea{width:100%;flex:1;resize:none;border:none;outline:none;background:var(--mde-input-bg);',
        'color:var(--mde-text);font-family:inherit;font-size:14px;line-height:1.85;padding:18px 20px;box-sizing:border-box;',
        'tab-size:2;caret-color:var(--mde-accent);transition:all 0.3s;}',
      '.mde-textarea::selection{background:rgba(16,185,129,0.25);}',
      '.mde-textarea::placeholder{color:var(--mde-text-secondary);opacity:0.5;}',
      '.mde-footer{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;',
        'background:var(--mde-toolbar);border-top:1px solid var(--mde-border);font-size:11px;color:var(--mde-text-secondary);',
        'flex-shrink:0;gap:12px;transition:all 0.3s;}',
      '.mde-stats{flex:1;display:flex;gap:8px;align-items:center;}',
      '.mde-stat{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--mde-text-secondary);}',
      '.mde-stat strong{color:var(--mde-text);font-weight:600;font-size:12px;}',
      '.mde-stat-sep{color:var(--mde-border);opacity:0.5;}',
      '.mde-hint{font-size:11px;color:var(--mde-text-secondary);white-space:nowrap;overflow:auto;text-overflow:ellipsis;}',
      '.mde-unsaved-dot{width:8px;height:8px;border-radius:50%;background:#f59e0b;',
        'display:inline-block;margin-left:6px;vertical-align:middle;opacity:0;transition:opacity 0.2s;',
        'box-shadow:0 0 8px rgba(245,158,11,0.7);animation:pulse-indicator 2s cubic-bezier(0.4,0,0.6,1) infinite;}',
      '.mde-unsaved-dot.visible{opacity:1;}',
      '@keyframes pulse-indicator{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.25);opacity:0.6;}}',
      '.mde-status-bar{position:absolute;bottom:48px;left:50%;transform:translateX(-50%);',
        'background:var(--mde-toolbar);border:1px solid var(--mde-border);color:var(--mde-text-secondary);font-size:12px;font-weight:500;',
        'padding:10px 18px;border-radius:7px;opacity:0;transition:opacity 0.18s,transform 0.18s;',
        'pointer-events:none;white-space:nowrap;z-index:20;box-shadow:var(--mde-shadow);}',
      '.mde-status-bar.mde-status-visible{opacity:1;}',
      '.mde-status-success{color:#10b981;border-color:rgba(16,185,129,0.2);background:rgba(16,185,129,0.08);}',
      '.mde-status-error{color:#ef4444;border-color:rgba(239,68,68,0.2);background:rgba(239,68,68,0.08);}',
    ].join('');
    document.head.appendChild(style);
  }

  // ─── Public: createEditorUI ───────────────────────────────────────────────

  function createEditorUI(container, filePath, originalContent, onClose) {
    buildStyles();

    var storageKey   = EDITOR_STORAGE_PREFIX + btoa(unescape(encodeURIComponent(filePath)));
    var savedContent = sessionStorage.getItem(storageKey);
    if (savedContent === null) savedContent = originalContent || '';

    // Wrapper
    var wrapper = document.createElement('div');
    wrapper.className = 'mde-wrapper';

    // Toolbar
    var toolbar = document.createElement('div');
    toolbar.className = 'mde-toolbar';

    function makeBtn(html, title, cls, onClick) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = ('mde-btn ' + (cls || '')).trim();
      btn.title = title || '';
      btn.innerHTML = html;
      btn.addEventListener('click', onClick);
      return btn;
    }

    var fmtButtons = [
      { html: '<strong>B</strong>', title: 'Bold (Ctrl+B)',  key: 'bold'    },
      { html: '<em>I</em>', title: 'Italic (Ctrl+I)',key: 'italic'  },
      { html: '<del>S</del>', title: 'Strikethrough',  key: 'strike'  },
      { html: '&lt;/&gt;', title: 'Code',        key: 'code'    },
    ];

    var headingButtons = [
      { html: 'H1', title: 'Heading 1', key: 'heading' },
      { html: 'H2', title: 'Heading 2', key: 'h2' },
      { html: 'H3', title: 'Heading 3', key: 'h3' },
    ];

    var listButtons = [
      { html: '&#10625;', title: 'Bullet list', key: 'ul' },
      { html: '1.', title: 'Numbered list', key: 'ol' },
      { html: '&#10625;', title: 'Quote', key: 'quote' },
    ];

    var insertButtons = [
      { html: '🔗', title: 'Link' },
      { html: '▦', title: 'Table' },
      { html: '∑', title: 'Math' },
      { html: '∑∑', title: 'Block Math' },
    ];

    var advancedButtons = [
      { html: '📊', title: 'Graph' },
      { html: '📐', title: 'Diagram' },
    ];

    var calloutButtons = [
      { html: '📝', title: 'Note' },
      { html: '⚠️', title: 'Warning' },
      { html: 'ℹ️', title: 'Info' },
      { html: '✓', title: 'Tip' },
    ];

    // textarea is declared here so closures below can reference it
    var textarea = document.createElement('textarea');

    // Helper function to create button groups
    function createButtonGroup(buttons, formatActions) {
      buttons.forEach(function(item) {
        var before = formatActions ? formatActions[item.key].before : undefined;
        var after = formatActions ? formatActions[item.key].after : undefined;
        toolbar.appendChild(makeBtn(item.html, item.title, '', function() {
          if (formatActions) {
            insertFormat(before, after, textarea);
          }
        }));
      });
    }

    // GROUP 1: Text Formatting (Bold, Italic, Strike, Code)
    createButtonGroup(fmtButtons, FORMAT_ACTIONS);
    
    var sep1 = document.createElement('div');
    sep1.className = 'mde-toolbar-sep';
    toolbar.appendChild(sep1);

    // GROUP 2: Structure (Headings, Lists, Quote)
    createButtonGroup(headingButtons, FORMAT_ACTIONS);
    
    var sep2 = document.createElement('div');
    sep2.className = 'mde-toolbar-sep';
    toolbar.appendChild(sep2);

    createButtonGroup(listButtons, FORMAT_ACTIONS);
    
    var sep3 = document.createElement('div');
    sep3.className = 'mde-toolbar-sep';
    toolbar.appendChild(sep3);

    // GROUP 3: Inserts (Link, Table, Math)
    toolbar.appendChild(makeBtn(insertButtons[0].html, insertButtons[0].title, '', function() { insertLink(textarea); }));
    toolbar.appendChild(makeBtn(insertButtons[1].html, insertButtons[1].title, '', function() { insertTable(textarea); }));
    toolbar.appendChild(makeBtn(insertButtons[2].html, insertButtons[2].title, '', function() { insertMath(textarea, false); }));
    toolbar.appendChild(makeBtn(insertButtons[3].html, insertButtons[3].title, '', function() { insertMath(textarea, true); }));
    
    var sep4 = document.createElement('div');
    sep4.className = 'mde-toolbar-sep';
    toolbar.appendChild(sep4);

    // GROUP 4: Advanced (Graphs, Diagrams)
    toolbar.appendChild(makeBtn(advancedButtons[0].html, advancedButtons[0].title, '', function() { insertDesmos(textarea); }));
    toolbar.appendChild(makeBtn(advancedButtons[1].html, advancedButtons[1].title, '', function() { insertTikz(textarea); }));
    
    var sep5 = document.createElement('div');
    sep5.className = 'mde-toolbar-sep';
    toolbar.appendChild(sep5);

    // GROUP 5: Callouts (Note, Warning, Info, Tip)
    toolbar.appendChild(makeBtn(calloutButtons[0].html, calloutButtons[0].title, '', function() { insertCallout(textarea, 'note'); }));
    toolbar.appendChild(makeBtn(calloutButtons[1].html, calloutButtons[1].title, '', function() { insertCallout(textarea, 'warning'); }));
    toolbar.appendChild(makeBtn(calloutButtons[2].html, calloutButtons[2].title, '', function() { insertCallout(textarea, 'info'); }));
    toolbar.appendChild(makeBtn(calloutButtons[3].html, calloutButtons[3].title, '', function() { insertCallout(textarea, 'tip'); }));

    var right = document.createElement('div');
    right.className = 'mde-toolbar-right';

    var unsavedDot = document.createElement('span');
    unsavedDot.className = 'mde-unsaved-dot' + (savedContent !== (originalContent || '') ? ' visible' : '');
    unsavedDot.title = 'Unsaved changes';

    var doneBtn = makeBtn('\u2713 Done', 'Save & close (Ctrl+S)', 'mde-btn-primary', function() {
      sessionStorage.setItem(storageKey, textarea.value);
      if (onClose) onClose(textarea.value);
      showToast(wrapper, '\u2713 Applied');
      unsavedDot.classList.remove('visible');
    });

    var revertBtn = makeBtn('\u21bb Revert', 'Revert to original', 'mde-btn-danger', function() {
      if (!confirm('Revert all edits and restore original content?')) return;
      textarea.value = originalContent || '';
      sessionStorage.removeItem(storageKey);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      showToast(wrapper, '\u21bb Reverted');
      unsavedDot.classList.remove('visible');
    });

    var prBtn = makeBtn('\u2191 Submit PR', 'Push changes as pull request', 'mde-btn-primary', function() {
      if (textarea.value === originalContent) {
        showToast(wrapper, 'No changes to submit', 'error');
        return;
      }
      prBtn.disabled = true;
      prBtn.textContent = '\u2191 Submitting...';
      fetch('/api/submit-pr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: filePath,
          content: textarea.value,
          originalContent: originalContent
        })
      })
      .then(r => r.json())
      .then(data => {
        prBtn.disabled = false;
        prBtn.textContent = '\u2191 Submit PR';
        if (data.success) {
          showToast(wrapper, 'PR created: ' + (data.prUrl || 'Check GitHub'));
          window.open(data.prUrl, '_blank');
        } else {
          showToast(wrapper, data.error || 'Failed to create PR', 'error');
        }
      })
      .catch(err => {
        prBtn.disabled = false;
        prBtn.textContent = '\u2191 Submit PR';
        showToast(wrapper, 'Error: ' + err.message, 'error');
      });
    });

    right.appendChild(unsavedDot);
    right.appendChild(doneBtn);
    right.appendChild(revertBtn);
    right.appendChild(prBtn);
    toolbar.appendChild(right);

    // Textarea
    textarea.className   = 'mde-textarea';
    textarea.value       = savedContent;
    textarea.spellcheck  = true;
    textarea.placeholder = '// Start editing your markdown here...\n// Use Ctrl+B for bold, Ctrl+I for italic\n// Press Ctrl+S to save changes';

    // Footer
    var footer = document.createElement('div');
    footer.className = 'mde-footer';

    var statsEl = document.createElement('span');
    statsEl.className = 'mde-stats';

    var hint = document.createElement('span');
    hint.className = 'mde-hint';
    hint.textContent = '// Keyboard: Ctrl+B bold • Ctrl+I italic • Ctrl+K link • Ctrl+M math • Ctrl+S save • Tab indent';

    footer.appendChild(statsEl);
    footer.appendChild(hint);

    // Toast
    var toast = document.createElement('div');
    toast.className = 'mde-status-bar';

    // Assemble
    wrapper.appendChild(toolbar);
    wrapper.appendChild(textarea);
    wrapper.appendChild(footer);
    wrapper.appendChild(toast);

    // Events
    // Initialize history with starting content
    EditorHistory.init(originalContent);
    
    textarea.addEventListener('input', function() {
      sessionStorage.setItem(storageKey, textarea.value);
      updateStats(textarea, statsEl);
      unsavedDot.classList.add('visible');
      // Track change in history
      EditorHistory.push(textarea.value);
    });

    attachShortcuts(textarea, wrapper, storageKey, onClose);

    // Mount
    container.innerHTML = '';
    container.appendChild(wrapper);

    // Initial render
    updateStats(textarea, statsEl);
    requestAnimationFrame(function() { textarea.focus(); });

    // External references
    wrapper._textarea        = textarea;
    wrapper._originalContent = originalContent;
    wrapper._filePath        = filePath;
    wrapper._storageKey      = storageKey;
    wrapper._onClose         = onClose;

    return wrapper;
  }

  // ─── Session helpers ──────────────────────────────────────────────────────

  function _key(filePath) {
    return EDITOR_STORAGE_PREFIX + btoa(unescape(encodeURIComponent(filePath)));
  }

  function clearSession(filePath)     { sessionStorage.removeItem(_key(filePath)); }
  function hasUnsavedEdits(filePath)  { return sessionStorage.getItem(_key(filePath)) !== null; }
  function getSavedContent(filePath)  { return sessionStorage.getItem(_key(filePath)); }

  // ─── Public API ───────────────────────────────────────────────────────────

  return {
    createEditorUI,
    clearSession,
    hasUnsavedEdits,
    getSavedContent,
    insertFormat: function(before, after, ta) { insertFormat(before, after, ta); },
    insertLink:   function(ta) { insertLink(ta); },
    insertTable:  function(ta) { insertTable(ta); },
  };
})();
