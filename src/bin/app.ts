// @ts-nocheck
// Main JavaScript for the NoteBooks file explorer app
// This file handles the UI interactions, file fetching, previewing, and all client-side logic.

const listView = document.getElementById("listView");
const pathNav = document.getElementById("pathNav");
const splash = document.getElementById("splash");
const contextMenu = document.getElementById("contextMenu");
const previewContainer = document.getElementById("previewContainer");
const mobilePreview = document.getElementById("mobilePreview");
const mobilePreviewContent = document.getElementById("mobilePreviewContent");
const mobilePreviewTitle = document.getElementById("mobilePreviewTitle");
const taskbar = document.getElementById("taskbar");
const statusEl = document.getElementById("status");

let currentNode = null;
let pathHistory = [];
let selected = null;
let previewId = 0;
const windows = {};
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
let updateDismissed = false;

// Runtime config loaded from /api/config (populated from Vercel env vars).
// Fallbacks keep the app functional when running outside Vercel (e.g. local dev).
let appConfig = {
  GITHUB_REPO:   '',
  GITHUB_BRANCH: 'main',
  APP_URL:       '',
  GITPAGE_URL:   '',
};

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      appConfig = { ...appConfig, ...data };
    }
  } catch (e) {
    console.warn('fetchConfig failed — using defaults:', e);
  }
}

const EXCLUDED_ROOT_FILES = [
  "fmtree.py", "files.json", "index.html", "favicon.png", "tree.py", "autocommit.ps1"
];

const FILE_ICONS = {
  folder: "📁",
  md: "📝",
  markdown: "📝",
  pdf: "📕",
  txt: "📄",
  json: "🔧",
  js: "📜",
  html: "🌐",
  css: "🎨",
  py: "🐍",
  jpg: "🖼️",
  jpeg: "🖼️",
  png: "🖼️",
  gif: "🖼️",
  svg: "🖼️",
  doc:  "📘", docx: "📘",
  xls:  "📗", xlsx: "📗",
  ppt:  "📙", pptx: "📙",
  default: "📄"
};

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").then(() => {
    console.log("Service Worker registered");
  }).catch(err => {
    console.error("SW registration failed:", err);
  });
}

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

function dismissUpdateNotice() {
  document.getElementById("updateNotice").style.display = "none";
  updateDismissed = true;
}

function showStatus(message, isLoading = false) {
  statusEl.innerHTML = isLoading ? `<span class="loader"></span>${message}` : message;
  statusEl.classList.add("visible");
  setTimeout(() => {
    statusEl.classList.remove("visible");
  }, 3000);
}

async function generateFileTree() {
  showStatus("Generating file tree...", true);
  try {
    const timestamp = new Date().toISOString();
    showStatus(`Tree generated at: ${timestamp}`);
    await fetchTree();
  } catch (error) {
    showStatus("Failed to generate tree: " + error.message);
  }
}

function refreshFiles() {
  fetchTree();
  showStatus("Refreshing files list…");
}

async function fetchTree() {
  showStatus("Loading files...", true);

  try {
    let tree;

    try {
      const fallbackRes = await fetch("/files.json?" + new Date().getTime());
      if (!fallbackRes.ok) throw new Error(`Failed to fetch: ${fallbackRes.status}`);
      tree = await fallbackRes.json();
    } catch (manifestError) {
      console.warn("files.json manifest unavailable, falling back to registry:", manifestError);
      const res = await fetch("/api/registry?" + new Date().getTime());
      if (!res.ok) throw new Error(`Failed to fetch registry: ${res.status}`);
      tree = await res.json();
    }

    const raw = JSON.stringify(tree, Object.keys(tree).sort());

    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    lastHash = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
    initialLoadComplete = true;

    try {
      lastCommit = await fetchLatestCommit();
    } catch (e) {
      console.warn("Failed to fetch initial commit:", e);
    }

    currentNode = tree;
    pathHistory = [];
    renderFolder(tree);
    updatePathNav();

    const fontPromise = new Promise((resolve) => {
      const testSpan = document.createElement("span");
      testSpan.textContent = "A quick brown fox jumps";
      testSpan.style.cssText = "position:absolute;visibility:hidden;fontSize:32px;fontFamily:sans-serif";
      document.body.appendChild(testSpan);
      testSpan.style.fontFamily = '"Roboto", sans-serif';
      requestAnimationFrame(() => {
        document.body.removeChild(testSpan);
        resolve();
      });
    });

    fontPromise.then(() => {
      splash.style.opacity = 0;
      setTimeout(() => { splash.style.display = 'none'; }, 600);

      if (!window.updateCheckStarted) {
        window.updateCheckStarted = true;
        setTimeout(() => setInterval(checkForUpdate, 20000), 5000);
      }
      showStatus("Files loaded successfully!");
    });

  } catch (error) {
    showStatus("Failed to generate tree: " + error.message);
    console.error(error);
    splash.style.opacity = 0;
    setTimeout(() => { splash.style.display = 'none'; }, 600);
  }
}

function getFileIcon(file) {
  if (file.type === "folder") return FILE_ICONS.folder;
  const ext = file.name.split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

function getFileTypeClass(file) {
  if (file.type === "folder") return "folder";
  const ext = file.name.split('.').pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) return "image";
  return ext;
}

function renderFolder(node) {
  listView.innerHTML = "";
  selected = null;

  const children = (node.children || []).filter(item => {
    if (item.type === "folder" && item.name === ".github") return false;
    if (pathHistory.length === 0 && item.type === "folder" && item.name === "waiting-list") return false;
    if (pathHistory.length === 0 && item.type === "file" && EXCLUDED_ROOT_FILES.includes(item.name)) return false;
    return true;
  });

  children.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === "folder" ? -1 : 1;
  });

  if (children.length === 0) {
    listView.innerHTML = `
      <div class="empty-state">
        <div class="icon">📂</div>
        <h3>This folder is empty</h3>
        <p>No files or folders to display</p>
      </div>
    `;
    return;
  }

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const item = document.createElement("div");
    item.className = "file-item";
    item.setAttribute("data-index", i);
    item._childData = child;

    const fileIcon = getFileIcon(child);
    const fileTypeClass = getFileTypeClass(child);

    item.innerHTML = `
      <div class="file-icon" data-type="${fileTypeClass}">${fileIcon}</div>
      <div class="file-name">${child.name}</div>
      <div class="file-actions">
        ${child.type === "file" ? `
          <div class="file-action" onclick="previewFile(event, ${i})">👁️</div>
          <div class="file-action" onclick="downloadFile(event, ${i})">📥</div>
          ${isAdmin() ? `<div class="file-action file-action--delete" onclick="deleteFile(event, ${i})" title="Delete file">🗑️</div>` : ''}
        ` : ''}
      </div>
      ${child.type === "file" ? `<div class="file-action-mob" onclick="openMobFileSheet(event, ${i})">⋯</div>` : ''}
    `;

    item.onclick = (e) => {
      document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selected = child;
      if (child.type === "folder") {
        pathHistory.push(currentNode);
        currentNode = child;
        renderFolder(child);
        updatePathNav();
      } else {
        if (!e.target.closest('.file-action')) handlePreview();
      }
    };

    item.oncontextmenu = e => {
      e.preventDefault();
      document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      selected = child;
      showContextMenu(e.pageX, e.pageY);
    };

    listView.appendChild(item);
    item.style.animationDelay = `${i * 30}ms`;
  }
}

function startDrag(e, id) {
  const el = windows[id];
  if (!el) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const startLeft = parseInt(el.style.left, 10) || 0;
  const startTop = parseInt(el.style.top, 10) || 0;

  function onMouseMove(ev) {
    el.style.left = startLeft + (ev.clientX - startX) + "px";
    el.style.top = startTop + (ev.clientY - startY) + "px";
  }
  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function updatePathNav() {
  const allSegments = [];
  for (let i = 0; i < pathHistory.length; i++) {
    allSegments.push({ name: pathHistory[i].name, action: `goToPath(${i})` });
  }
  if (currentNode && currentNode !== pathHistory[pathHistory.length - 1]) {
    allSegments.push({ name: currentNode.name, action: null });
  }

  const maxVisible = isMobile ? 2 : Infinity;
  const truncated = allSegments.length > maxVisible;
  const visible = truncated ? allSegments.slice(-maxVisible) : allSegments;

  let html = `<span class="path-segment" onclick="goToRoot()">☁️</span>`;
  if (truncated) html += `<span class="path-separator">/</span><span class="path-crumb-ellipsis">…</span>`;
  visible.forEach(seg => {
    html += `<span class="path-separator">/</span>`;
    html += seg.action
      ? `<span class="path-segment" onclick="${seg.action}">${seg.name}</span>`
      : `<span class="path-segment">${seg.name}</span>`;
  });
  pathNav.innerHTML = html;
}

function goToRoot() { fetchTree(); }

function goToPath(index) {
  currentNode = pathHistory[index];
  pathHistory = pathHistory.slice(0, index);
  renderFolder(currentNode);
  updatePathNav();
}

function goUp() {
  if (pathHistory.length > 0) {
    currentNode = pathHistory.pop();
    renderFolder(currentNode);
    updatePathNav();
  }
}

function previewFile(e, index) {
  e.stopPropagation();
  const items = document.querySelectorAll('.file-item');
  if (index >= 0 && index < items.length) items[index].click();
}

function downloadFile(e, index) {
  e.stopPropagation();
  const items = document.querySelectorAll('.file-item');
  if (index >= 0 && index < items.length) {
    document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
    items[index].classList.add('selected');
    selected = items[index]._childData;
    handleDownload();
  }
}

let _pendingDeletePath = null;
let _pendingDeleteName = null;

function deleteFile(e, index) {
  e.stopPropagation();
  if (!isAdmin()) return;
  const items = document.querySelectorAll('.file-item');
  if (index < 0 || index >= items.length) return;
  const child = items[index]._childData;
  _pendingDeletePath = child.path;
  _pendingDeleteName = child.name;

  if (isMobile) {
    document.getElementById('deleteMobileMsg').textContent =
      `"${child.name}" will be permanently removed from the repository.`;
    const o = document.getElementById('deleteMobileOverlay');
    o.style.display = 'flex';
    requestAnimationFrame(() => o.classList.add('active'));
  } else {
    document.getElementById('deleteConfirmMsg').textContent =
      `"${child.name}" will be permanently removed from the repository. This cannot be undone.`;
    document.getElementById('deleteConfirm').style.display = 'flex';
  }
}

function cancelDeleteFile() {
  _pendingDeletePath = null;
  _pendingDeleteName = null;
  document.getElementById('deleteConfirm').style.display = 'none';
  const o = document.getElementById('deleteMobileOverlay');
  o.classList.remove('active');
  setTimeout(() => { o.style.display = 'none'; }, 380);
}

async function confirmDeleteFile() {
  if (!_pendingDeletePath || !_pendingDeleteName) return;
  const path = _pendingDeletePath;
  const name = _pendingDeleteName;
  cancelDeleteFile();
  showStatus(`Deleting "${name}"…`, true);
  const getRes = await ghProxy('getFile', { path });
  if (!getRes.ok || !getRes.data.sha) {
    showStatus(`✗ Could not retrieve file info: ${getRes.error || 'file not found'}`);
    return;
  }
  const delRes = await ghProxy('deleteFile', { path, sha: getRes.data.sha, message: `Delete: ${path}` });
  if (delRes.ok) {
    showStatus(`✓ "${name}" deleted.`);
    fetchTree();
  } else {
    showStatus(`✗ Delete failed: ${delRes.error}`);
  }
}

function closeWindow(id) {
  const win = windows[id];
  if (win) {
    win.remove();
    delete windows[id];
    updateTaskbar();
  }
}

function minimizeWindow(id) {
  const win = windows[id];
  if (win) {
    win.style.display = "none";
    updateTaskbar();
  }
}

function showTaskbarContextMenu(x, y, id) {
  const menu = document.getElementById("taskbarContextMenu");
  menu.innerHTML = `
    <button onclick="restoreFromTaskbar('${id}')">🗖 Restore</button>
    <button onclick="minimizeWindow('${id}')">🗕 Minimize</button>
    <button onclick="closeWindow('${id}')">✖ Close</button>
  `;
  menu.style.top = y + "px";
  menu.style.left = x + "px";
  menu.style.display = "flex";
}

document.addEventListener("click", () => {
  document.getElementById("taskbarContextMenu").style.display = "none";
});

function restoreFromTaskbar(id) {
  const win = windows[id];
  if (win) {
    win.style.display = "block";
    updateTaskbar();
  }
}

function updateTaskbar() {
  const minimized = Object.entries(windows).filter(([_, el]) => el.style.display === "none");

  if (minimized.length === 0) {
    taskbar.style.display = "none";
    taskbar.innerHTML = "";
    return;
  }

  taskbar.style.display = "flex";
  taskbar.innerHTML = "";

  for (const [id, el] of Object.entries(windows)) {
    if (el.style.display === "none") {
      const icon = document.createElement("div");
      icon.className = "task-icon";
      icon.dataset.name = el.querySelector(".title")?.textContent || "File";
      icon.textContent = "📄";
      icon.onclick = () => { el.style.display = "block"; updateTaskbar(); };
      icon.oncontextmenu = (e) => { e.preventDefault(); showTaskbarContextMenu(e.pageX, e.pageY, id); };
      taskbar.appendChild(icon);
    }
  }
}

function toggleFullscreen(id, forceFull = false) {
  const w = windows[id];
  if (!w) return;
  const isFullscreen = w.classList.contains("fullscreen");
  if (forceFull && !isFullscreen) { w.classList.add("fullscreen"); return; }
  if (isFullscreen) {
    w.classList.remove("fullscreen");
    w.style.removeProperty("top");
    w.style.removeProperty("left");
    w.style.top = "100px";
    w.style.left = "100px";
    w.style.width = "80vw";
    w.style.height = "80vh";
  } else {
    w.classList.add("fullscreen");
    w.style.top = "0";
    w.style.left = "0";
    w.style.width = "100vw";
    w.style.height = "100vh";
  }
}

function showContextMenu(x, y) {
  contextMenu.style.top = y + 'px';
  contextMenu.style.left = x + 'px';
  contextMenu.style.display = 'flex';
}

function handlePreview() {
  if (selected && selected.type === "file") {
    isMobile
      ? openMobilePreview(selected.path, selected.name)
      : openPreview(selected.path, selected.name);
  }
  contextMenu.style.display = 'none';
}

function handleDownload() {
  if (selected && selected.type === "file") {
    const a = document.createElement("a");
    const downloadUrl = `${window.location.origin}/api/raw?path=${encodeURIComponent(selected.path)}`;
    a.href = downloadUrl;
    a.download = selected.name;
    a.target = '_blank';
    a.rel = 'noopener';
    a.click();
    showStatus(`Downloading: ${selected.name}`);
  }
  contextMenu.style.display = 'none';
}

function openMobilePreview(path, filename) {
  mobilePreviewTitle.textContent = filename;
  fetchFileContent(path, filename, mobilePreviewContent);
  mobilePreview.style.display = "flex";
}

function closeMobilePreview() {
  mobilePreview.style.display = "none";
  mobilePreviewContent.innerHTML = "";
}

// ─── Split-view editor styles (injected once) ────────────────────────────────

function injectSplitViewStyles() {
  if (document.getElementById('sv-styles')) return;
  const style = document.createElement('style');
  style.id = 'sv-styles';
  style.textContent = `
    /* The preview body becomes a flex column when split-view is active */
    .preview-body.sv-active {
      display: flex !important;
      flex-direction: row !important;
      padding: 0 !important;
      overflow: hidden !important;
      gap: 0;
    }

    /* Left pane: rendered markdown */
    .sv-preview-pane {
      flex: 1;
      overflow-y: auto;
      padding: 24px 28px;
      min-width: 0;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);
      border-right: 1px solid rgba(52, 211, 153, 0.05);
    }

    /* Drag handle between panes */
    .sv-divider {
      width: 6px;
      background: #1e293b;
      cursor: col-resize;
      flex-shrink: 0;
      position: relative;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      border-left: 1px solid rgba(52, 211, 153, 0.1);
      border-right: 1px solid rgba(52, 211, 153, 0.1);
    }
    .sv-divider:hover, .sv-divider.dragging { 
      background: linear-gradient(180deg, rgba(52, 211, 153, 0.4) 0%, rgba(52, 211, 153, 0.2) 100%);
      border-left-color: rgba(52, 211, 153, 0.3);
      border-right-color: rgba(52, 211, 153, 0.3);
      box-shadow: inset 0 0 12px rgba(52, 211, 153, 0.2);
    }
    .sv-divider::after {
      content: '::';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #34d399;
      font-size: 12px;
      pointer-events: none;
      letter-spacing: 2px;
      font-weight: bold;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .sv-divider:hover::after { opacity: 0.7; }

    /* Right pane: markdown editor */
    .sv-editor-pane {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: linear-gradient(135deg, #0f172a 0%, #1a202c 100%);
      border-left: 1px solid rgba(52, 211, 153, 0.1);
    }

    /* Edit toggle button in the title bar */
    .title-bar .btn-edit-split {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid transparent;
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
      height: 32px;
      position: relative;
      letter-spacing: 0px;
      text-transform: none;
      white-space: nowrap;
      flex-shrink: 0;
      min-width: fit-content;
    }
    .title-bar .btn-edit-split:hover {
      background: rgba(52, 211, 153, 0.18);
      color: #34d399;
      border-color: rgba(52, 211, 153, 0.3);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(52, 211, 153, 0.2);
    }
    .title-bar .btn-edit-split:active {
      transform: translateY(0);
    }
    .title-bar .btn-edit-split.active {
      background: linear-gradient(135deg, rgba(52, 211, 153, 0.25) 0%, rgba(34, 197, 94, 0.25) 100%);
      color: #10b981;
      border-color: #10b981;
      box-shadow: 0 0 20px rgba(52, 211, 153, 0.3);
    }
    .title-bar .btn-edit-split .sv-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #fbbf24;
      display: none;
      animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      position: absolute;
      right: 6px;
      top: 6px;
      box-shadow: 0 0 4px #fbbf24;
    }
    .title-bar .btn-edit-split.has-edits .sv-dot { display: inline-block; }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.2); }
    }
  `;
  document.head.appendChild(style);
}

// ─── openPreview ─────────────────────────────────────────────────────────────

function openPreview(path, filename) {
  injectSplitViewStyles();

  const id = 'preview-' + (++previewId);
  const win = document.createElement("div");
  win.className = "floating-window";
  win.style.top = `${100 + previewId * 10}px`;
  win.style.left = `${100 + previewId * 10}px`;
  win.dataset.id = id;

  const ext = filename.split('.').pop().toLowerCase();
  const isMarkdown = ext === 'md' || ext === 'markdown';
  const isFullScreen = isMarkdown || ext === 'pdf' || ext === 'html' || ext === 'htm'
    || ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx'
    || ext === 'ppt' || ext === 'pptx';

  // Edit button — only for markdown files
  const editBtnHTML = isMarkdown
    ? `<button class="btn-edit-split" id="${id}-editbtn" title="Toggle markdown editor" onclick="toggleSplitEditor('${id}')">
         Edit<span class="sv-dot"></span>
       </button>`
    : '';

  win.innerHTML = `
    <div class="title-bar" onmousedown="startDrag(event, '${id}')">
      <div class="title">${filename}</div>
      <div class="buttons">
        ${editBtnHTML}
        <button onclick="minimizeWindow('${id}')">🗕</button>
        <button onclick="toggleFullscreen('${id}')">🗖</button>
        <button onclick="closeWindow('${id}')">✖</button>
      </div>
    </div>
    <div class="preview-body" id="${id}-body">Loading...</div>
  `;

  previewContainer.appendChild(win);
  windows[id] = win;

  // Metadata stored on the element
  win._filePath        = path;
  win._filename        = filename;
  win._isMarkdown      = isMarkdown;
  win._originalContent = null;   // populated by fetchFileContent
  win._splitActive     = false;

  // ✅ Pass win directly so _originalContent is set correctly after the await
  const container = document.getElementById(id + "-body");
  fetchFileContent(path, filename, container, win);
  updateTaskbar();

  if (isFullScreen) setTimeout(() => toggleFullscreen(id, true), 100);
}

// ─── fetchFileContent ─────────────────────────────────────────────────────────

async function fetchFileContent(path, filename, container, winElement = null) {
  const ext = (filename.includes('.') ? filename : path).split('.').pop().toLowerCase();

  container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;"><span class="loader"></span> Loading...</div>';

  const isGitHubPages = window.location.hostname.endsWith('github.io');
  const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // In local development, try direct file access first (for static servers like `serve`)
  // On GitHub Pages, use raw.githubusercontent.com
  // On Vercel, use /api/raw endpoint
  const fetchUrl = (p) => {
    if (isGitHubPages) {
      return `https://raw.githubusercontent.com/${appConfig.GITHUB_REPO}/${appConfig.GITHUB_BRANCH}/${p}`;
    }
    // For local dev or when API might not be available, try direct file path first
    return `${window.location.origin}/${p}`;
  };
  
  // Fallback to API if direct file access fails (for Vercel deployments with private repos)
  const fetchUrlWithFallback = async (p) => {
    const directUrl = `${window.location.origin}/${p}`;
    const apiUrl = `${window.location.origin}/api/raw?path=${encodeURIComponent(p)}`;
    
    // Try direct file access first
    try {
      const response = await fetch(directUrl);
      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        // Make sure we got actual file content, not an HTML error page
        if (!contentType.includes('text/html') || directUrl.endsWith('.html') || directUrl.endsWith('.htm')) {
          return await response.text();
        }
      }
    } catch (e) {
      // Direct access failed, try API
    }
    
    // Fallback to API endpoint
    const apiResponse = await fetch(apiUrl);
    if (!apiResponse.ok) throw new Error(`HTTP ${apiResponse.status}`);
    return await apiResponse.text();
  };
  
  const rawUrl = `${window.location.origin}/api/raw?path=${path}`;

  try {
    if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(filename)) {
      container.innerHTML = `<img src="${fetchUrl(path)}" style="max-width:100%;height:auto;display:block;margin:auto;" alt="${filename}" />`;

    } else if (/\.(mp3|wav|ogg|flac)$/i.test(filename)) {
      container.innerHTML = `<audio controls src="${fetchUrl(path)}" style="width:100%;display:block;margin-top:20px"></audio>`;

    } else if (/\.(mp4|webm)$/i.test(filename)) {
      container.innerHTML = `<video controls src="${fetchUrl(path)}" style="max-width:100%;max-height:100%;display:block;margin:auto"></video>`;

    } else if (/\.(docx?|xlsx?|pptx?)$/i.test(filename.includes('.') ? filename : path)) {
      const viewerUrl = `https://docs.google.com/gviewer?embedded=true&url=${encodeURIComponent(rawUrl)}`;
      container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
      container.innerHTML = `<iframe src="${viewerUrl}" style="flex:1;min-height:0;width:100%;border:none;display:block;" allowfullscreen></iframe>`;

    } else if (ext === 'html' || ext === 'htm') {
      container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
      container.innerHTML = `<iframe src="${fetchUrl(path)}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;

    } else if (ext === 'pdf') {
      container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
      container.innerHTML = `<iframe src="${fetchUrl(path)}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;

    } else if (ext === 'md' || ext === 'markdown') {
      const text = await fetchUrlWithFallback(path);

      // ✅ Fixed: use the directly-passed winElement reference, not stale previewId
      if (winElement) {
        winElement._originalContent = text;
        // If there are session edits, show the unsaved dot
        if (MarkdownEditor.hasUnsavedEdits(path)) {
          const editBtn = document.getElementById(winElement.dataset.id + '-editbtn');
          if (editBtn) editBtn.classList.add('has-edits');
        }
      }

      renderMarkdownIntoContainer(
        MarkdownEditor.getSavedContent(path) || text,
        path,
        container
      );

    } else {
      try {
        const response = await fetch(fetchUrl(path));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        container.innerHTML = `<pre style="margin:0;white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px;line-height:1.5">${escapeHTML(text)}</pre>`;
      } catch (error) {
        container.innerHTML = `<div class="error">Error loading file: ${error.message}</div>`;
      }
    }
  } catch (error) {
    container.innerHTML = `<div class="error">Error: ${error.message}</div>`;
  }
}

// ─── Markdown render helper ───────────────────────────────────────────────────

function renderMarkdownIntoContainer(text, filePath, container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-content';
  wrapper.innerHTML = markdownToHTML(text, filePath);
  container.innerHTML = '';
  container.appendChild(wrapper);
  setTimeout(() => initMarkdownFeatures(wrapper), 0);
}

// ─── Split-view editor ────────────────────────────────────────────────────────

/**
 * Toggle the split-view editor panel for a markdown floating window.
 * Left pane = live rendered preview. Right pane = MarkdownEditor.
 */
function toggleSplitEditor(windowId) {
  const win = windows[windowId];
  if (!win || !win._isMarkdown) return;

  const body    = document.getElementById(windowId + '-body');
  const editBtn = document.getElementById(windowId + '-editbtn');

  if (win._splitActive) {
    // ── Close split view ─────────────────────────────────────────────────────
    win._splitActive = false;
    if (editBtn) { editBtn.classList.remove('active'); }

    // Re-render plain preview into body
    body.className = 'preview-body';
    body.removeAttribute('style');

    const content = MarkdownEditor.getSavedContent(win._filePath) || win._originalContent || '';
    renderMarkdownIntoContainer(content, win._filePath, body);

    // Update unsaved dot
    if (editBtn) editBtn.classList.toggle('has-edits', MarkdownEditor.hasUnsavedEdits(win._filePath));

  } else {
    // ── Open split view ──────────────────────────────────────────────────────
    if (!win._originalContent) {
      showStatus('⏳ File still loading, please wait…');
      return;
    }

    win._splitActive = true;
    if (editBtn) { editBtn.classList.add('active'); }

    // Build split layout
    body.innerHTML = '';
    body.className = 'preview-body sv-active';

    // Left: preview pane
    const previewPane = document.createElement('div');
    previewPane.className = 'sv-preview-pane';
    previewPane.id = windowId + '-sv-preview';

    const previewWrapper = document.createElement('div');
    previewWrapper.className = 'markdown-content';
    const initialContent = MarkdownEditor.getSavedContent(win._filePath) || win._originalContent;
    previewWrapper.innerHTML = markdownToHTML(initialContent, win._filePath);
    previewPane.appendChild(previewWrapper);
    setTimeout(() => initMarkdownFeatures(previewWrapper), 0);

    // Divider (draggable)
    const divider = document.createElement('div');
    divider.className = 'sv-divider';
    attachDividerDrag(divider, previewPane, body);

    // Right: editor pane
    const editorPane = document.createElement('div');
    editorPane.className = 'sv-editor-pane';
    editorPane.id = windowId + '-sv-editor';

    body.appendChild(previewPane);
    body.appendChild(divider);
    body.appendChild(editorPane);

    // Mount the MarkdownEditor into the editor pane
    // onClose = "Done Editing" button inside the editor
    const onEditorClose = (editedContent) => {
      // Update the left preview pane live
      const pw = document.getElementById(windowId + '-sv-preview');
      if (pw) {
        pw.innerHTML = '';
        const w = document.createElement('div');
        w.className = 'markdown-content';
        w.innerHTML = markdownToHTML(editedContent, win._filePath);
        pw.appendChild(w);
        setTimeout(() => initMarkdownFeatures(w), 0);
      }
      if (editBtn) editBtn.classList.toggle('has-edits', MarkdownEditor.hasUnsavedEdits(win._filePath));
      showStatus('✓ Changes saved to session');
    };

    MarkdownEditor.createEditorUI(editorPane, win._filePath, win._originalContent, onEditorClose);

    // Wire the editor's textarea so typing also live-updates the preview pane
    // We do this after createEditorUI mounts, so the textarea exists
    requestAnimationFrame(() => {
      const textarea = editorPane.querySelector('.mde-textarea');
      if (!textarea) return;

      textarea.addEventListener('input', () => {
        const pw = document.getElementById(windowId + '-sv-preview');
        if (!pw) return;
        // Debounce: only re-render every 300ms to avoid layout thrashing
        clearTimeout(textarea._previewTimer);
        textarea._previewTimer = setTimeout(() => {
          pw.innerHTML = '';
          const w = document.createElement('div');
          w.className = 'markdown-content';
          w.innerHTML = markdownToHTML(textarea.value, win._filePath);
          pw.appendChild(w);
          setTimeout(() => initMarkdownFeatures(w), 0);
        }, 300);
      });
    });
  }
}

/**
 * Make the divider bar draggable to resize the two panes.
 */
function attachDividerDrag(divider, leftPane, container) {
  let dragging = false;

  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    divider.classList.add('dragging');

    const onMove = (ev) => {
      if (!dragging) return;
      const rect = container.getBoundingClientRect();
      const pct  = ((ev.clientX - rect.left) / rect.width) * 100;
      const clamped = Math.min(Math.max(pct, 20), 80); // 20%–80% range
      leftPane.style.flex = 'none';
      leftPane.style.width = clamped + '%';
    };

    const onUp = () => {
      dragging = false;
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

function escapeHTML(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

document.addEventListener("click", (e) => {
  const isItem = e.target.closest(".file-item");
  const isContext = e.target.closest(".context-menu");
  if (!isItem && !isContext) {
    document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
    selected = null;
    contextMenu.style.display = "none";
  }
});

const manifest = {
  name: "Root",
  short_name: "Root",
  start_url: ".",
  display: "standalone",
  background_color: "#1e1e1e",
  theme_color: "#1e1e1e",
  icons: [{ src: "favicon.png", sizes: "192x192", type: "image/png" }]
};

// --- GitHub Pages → Vercel popup ---
function hasVercelDismissCookie() {
  return document.cookie.split(';').some(c => c.trim().startsWith('vercel_redirect_dismissed=1'));
}

function goToVercel() {
  document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
  window.location.href = appConfig.APP_URL;
}

function dismissVercelPopup() {
  document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
  const popup = document.getElementById('vercelPopup');
  popup.classList.remove('visible');
  setTimeout(() => { popup.style.display = 'none'; }, 400);
}

function maybeShowVercelPopup() {
  if (hasVercelDismissCookie()) return;
  if (appConfig.GITPAGE_URL && window.location.hostname === new URL(appConfig.GITPAGE_URL).hostname) {
    setTimeout(() => { document.getElementById('vercelPopup').classList.add('visible'); }, 1800);
  }
}

// --- Community ---
function openCommunity() {
  const path = 'primenotepad.rf.gd';
  if (isMobile) {
    openMobilePreview(path, 'Community 💬');
  } else {
    openPreview(path, 'Community 💬');
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await fetchConfig();
  fetchTree();
  maybeShowVercelPopup();
});

// --- Update check ---
let lastCommit = null;
let lastHash = null;
let initialLoadComplete = false;

async function fetchLatestCommit() {
  try {
    const response = await fetch('/api/gh.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'latestCommit' })
    });
    const data = await response.json();
    if (!response.ok || !data.sha) throw new Error(data.error || 'Failed to fetch latest commit');
    return data.sha;
  } catch (err) {
    console.warn("[fetchLatestCommit] Could not fetch latest commit:", err.message);
    return null;
  }
}

async function checkForUpdate() {
  if (!initialLoadComplete) return;
  const newCommit = await fetchLatestCommit();
  if (!newCommit) return;
  if (lastCommit && newCommit !== lastCommit) {
    const notice = document.getElementById("updateNotice");
    if (notice && notice.style.display !== "flex") notice.style.display = "flex";
  }
}
