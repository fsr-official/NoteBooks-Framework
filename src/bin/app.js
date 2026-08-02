// @ts-nocheck
// Main JavaScript for the NoteBooks file explorer app
// This file handles the UI interactions, file fetching, previewing, and all client-side logic.
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
var listView = document.getElementById("listView");
var pathNav = document.getElementById("pathNav");
var splash = document.getElementById("splash");
var contextMenu = document.getElementById("contextMenu");
var previewContainer = document.getElementById("previewContainer");
var mobilePreview = document.getElementById("mobilePreview");
var mobilePreviewContent = document.getElementById("mobilePreviewContent");
var mobilePreviewTitle = document.getElementById("mobilePreviewTitle");
var taskbar = document.getElementById("taskbar");
var statusEl = document.getElementById("status");
var currentNode = null;
var pathHistory = [];
var selected = null;
var previewId = 0;
var windows = {};
var isMobile = /Mobi|Android/i.test(navigator.userAgent);
var updateDismissed = false;
// Runtime config loaded from /api/config (populated from Vercel env vars).
// Fallbacks keep the app functional when running outside Vercel (e.g. local dev).
var appConfig = {
    GITHUB_REPO: '',
    GITHUB_BRANCH: 'main',
    APP_URL: '',
    GITPAGE_URL: '',
};
function fetchConfig() {
    return __awaiter(this, void 0, void 0, function () {
        var res, data, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, fetch('/api/config')];
                case 1:
                    res = _a.sent();
                    if (!res.ok) return [3 /*break*/, 3];
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = _a.sent();
                    appConfig = __assign(__assign({}, appConfig), data);
                    _a.label = 3;
                case 3: return [3 /*break*/, 5];
                case 4:
                    e_1 = _a.sent();
                    console.warn('fetchConfig failed — using defaults:', e_1);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
var EXCLUDED_ROOT_FILES = [
    "fmtree.py", "files.json", "index.html", "favicon.png", "tree.py", "autocommit.ps1"
];
var FILE_ICONS = {
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
    doc: "📘", docx: "📘",
    xls: "📗", xlsx: "📗",
    ppt: "📙", pptx: "📙",
    default: "📄"
};
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").then(function () {
        console.log("Service Worker registered");
    }).catch(function (err) {
        console.error("SW registration failed:", err);
    });
}
var deferredPrompt = null;
window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
});
function dismissUpdateNotice() {
    document.getElementById("updateNotice").style.display = "none";
    updateDismissed = true;
}
function showStatus(message, isLoading) {
    if (isLoading === void 0) { isLoading = false; }
    statusEl.innerHTML = isLoading ? "<span class=\"loader\"></span>".concat(message) : message;
    statusEl.classList.add("visible");
    setTimeout(function () {
        statusEl.classList.remove("visible");
    }, 3000);
}
function generateFileTree() {
    return __awaiter(this, void 0, void 0, function () {
        var timestamp, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    showStatus("Generating file tree...", true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    timestamp = new Date().toISOString();
                    showStatus("Tree generated at: ".concat(timestamp));
                    return [4 /*yield*/, fetchTree()];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    showStatus("Failed to generate tree: " + error_1.message);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function refreshFiles() {
    fetchTree();
    showStatus("Refreshing files list…");
}
function fetchTree() {
    return __awaiter(this, void 0, void 0, function () {
        var tree, res, registryError_1, fallbackRes, raw, digest, e_2, fontPromise, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    showStatus("Loading files...", true);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 14, , 15]);
                    tree = void 0;
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 5, , 8]);
                    return [4 /*yield*/, fetch("/api/registry?" + new Date().getTime())];
                case 3:
                    res = _a.sent();
                    if (!res.ok)
                        throw new Error("Failed to fetch registry: ".concat(res.status));
                    return [4 /*yield*/, res.json()];
                case 4:
                    tree = _a.sent();
                    return [3 /*break*/, 8];
                case 5:
                    registryError_1 = _a.sent();
                    console.warn("Registry fetch failed, falling back to files.json:", registryError_1);
                    return [4 /*yield*/, fetch("/files.json?" + new Date().getTime())];
                case 6:
                    fallbackRes = _a.sent();
                    if (!fallbackRes.ok)
                        throw new Error("Failed to fetch: ".concat(fallbackRes.status));
                    return [4 /*yield*/, fallbackRes.json()];
                case 7:
                    tree = _a.sent();
                    return [3 /*break*/, 8];
                case 8:
                    raw = JSON.stringify(tree, Object.keys(tree).sort());
                    return [4 /*yield*/, crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw))];
                case 9:
                    digest = _a.sent();
                    lastHash = Array.from(new Uint8Array(digest)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
                    initialLoadComplete = true;
                    _a.label = 10;
                case 10:
                    _a.trys.push([10, 12, , 13]);
                    return [4 /*yield*/, fetchLatestCommit()];
                case 11:
                    lastCommit = _a.sent();
                    return [3 /*break*/, 13];
                case 12:
                    e_2 = _a.sent();
                    console.warn("Failed to fetch initial commit:", e_2);
                    return [3 /*break*/, 13];
                case 13:
                    currentNode = tree;
                    pathHistory = [];
                    renderFolder(tree);
                    updatePathNav();
                    fontPromise = new Promise(function (resolve) {
                        var testSpan = document.createElement("span");
                        testSpan.textContent = "A quick brown fox jumps";
                        testSpan.style.cssText = "position:absolute;visibility:hidden;fontSize:32px;fontFamily:sans-serif";
                        document.body.appendChild(testSpan);
                        var baseWidth = testSpan.offsetWidth;
                        testSpan.style.fontFamily = '"Roboto", sans-serif';
                        requestAnimationFrame(function () {
                            document.body.removeChild(testSpan);
                            resolve();
                        });
                    });
                    Promise.all([fontPromise, new Promise(function (res) { return setTimeout(res, 500); })]).then(function () {
                        splash.style.opacity = 0;
                        setTimeout(function () { splash.style.display = 'none'; }, 600);
                        if (!window.updateCheckStarted) {
                            window.updateCheckStarted = true;
                            setTimeout(function () { return setInterval(checkForUpdate, 20000); }, 5000);
                        }
                        showStatus("Files loaded successfully!");
                    });
                    return [3 /*break*/, 15];
                case 14:
                    error_2 = _a.sent();
                    showStatus("Failed to generate tree: " + error_2.message);
                    console.error(error_2);
                    splash.style.opacity = 0;
                    setTimeout(function () { splash.style.display = 'none'; }, 600);
                    return [3 /*break*/, 15];
                case 15: return [2 /*return*/];
            }
        });
    });
}
function getFileIcon(file) {
    if (file.type === "folder")
        return FILE_ICONS.folder;
    var ext = file.name.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || FILE_ICONS.default;
}
function getFileTypeClass(file) {
    if (file.type === "folder")
        return "folder";
    var ext = file.name.split('.').pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext))
        return "image";
    return ext;
}
function renderFolder(node) {
    listView.innerHTML = "";
    selected = null;
    var children = (node.children || []).filter(function (item) {
        if (item.type === "folder" && item.name === ".github")
            return false;
        if (pathHistory.length === 0 && item.type === "folder" && item.name === "waiting-list")
            return false;
        if (pathHistory.length === 0 && item.type === "file" && EXCLUDED_ROOT_FILES.includes(item.name))
            return false;
        return true;
    });
    children.sort(function (a, b) {
        if (a.type === b.type)
            return a.name.localeCompare(b.name);
        return a.type === "folder" ? -1 : 1;
    });
    if (children.length === 0) {
        listView.innerHTML = "\n      <div class=\"empty-state\">\n        <div class=\"icon\">\uD83D\uDCC2</div>\n        <h3>This folder is empty</h3>\n        <p>No files or folders to display</p>\n      </div>\n    ";
        return;
    }
    var _loop_1 = function (i) {
        var child = children[i];
        var item = document.createElement("div");
        item.className = "file-item";
        item.setAttribute("data-index", i);
        item._childData = child;
        var fileIcon = getFileIcon(child);
        var fileTypeClass = getFileTypeClass(child);
        item.innerHTML = "\n      <div class=\"file-icon\" data-type=\"".concat(fileTypeClass, "\">").concat(fileIcon, "</div>\n      <div class=\"file-name\">").concat(child.name, "</div>\n      <div class=\"file-actions\">\n        ").concat(child.type === "file" ? "\n          <div class=\"file-action\" onclick=\"previewFile(event, ".concat(i, ")\">\uD83D\uDC41\uFE0F</div>\n          <div class=\"file-action\" onclick=\"downloadFile(event, ").concat(i, ")\">\uD83D\uDCE5</div>\n          ").concat(isAdmin() ? "<div class=\"file-action file-action--delete\" onclick=\"deleteFile(event, ".concat(i, ")\" title=\"Delete file\">\uD83D\uDDD1\uFE0F</div>") : '', "\n        ") : '', "\n      </div>\n      ").concat(child.type === "file" ? "<div class=\"file-action-mob\" onclick=\"openMobFileSheet(event, ".concat(i, ")\">\u22EF</div>") : '', "\n    ");
        item.onclick = function (e) {
            document.querySelectorAll('.file-item.selected').forEach(function (el) { return el.classList.remove('selected'); });
            item.classList.add('selected');
            selected = child;
            if (child.type === "folder") {
                pathHistory.push(currentNode);
                currentNode = child;
                renderFolder(child);
                updatePathNav();
            }
            else {
                if (!e.target.closest('.file-action'))
                    handlePreview();
            }
        };
        item.oncontextmenu = function (e) {
            e.preventDefault();
            document.querySelectorAll('.file-item.selected').forEach(function (el) { return el.classList.remove('selected'); });
            item.classList.add('selected');
            selected = child;
            showContextMenu(e.pageX, e.pageY);
        };
        listView.appendChild(item);
        item.style.animationDelay = "".concat(i * 30, "ms");
    };
    for (var i = 0; i < children.length; i++) {
        _loop_1(i);
    }
}
function startDrag(e, id) {
    var el = windows[id];
    if (!el)
        return;
    var startX = e.clientX;
    var startY = e.clientY;
    var startLeft = parseInt(el.style.left, 10) || 0;
    var startTop = parseInt(el.style.top, 10) || 0;
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
    var allSegments = [];
    for (var i = 0; i < pathHistory.length; i++) {
        allSegments.push({ name: pathHistory[i].name, action: "goToPath(".concat(i, ")") });
    }
    if (currentNode && currentNode !== pathHistory[pathHistory.length - 1]) {
        allSegments.push({ name: currentNode.name, action: null });
    }
    var maxVisible = isMobile ? 2 : Infinity;
    var truncated = allSegments.length > maxVisible;
    var visible = truncated ? allSegments.slice(-maxVisible) : allSegments;
    var html = "<span class=\"path-segment\" onclick=\"goToRoot()\">\u2601\uFE0F</span>";
    if (truncated)
        html += "<span class=\"path-separator\">/</span><span class=\"path-crumb-ellipsis\">\u2026</span>";
    visible.forEach(function (seg) {
        html += "<span class=\"path-separator\">/</span>";
        html += seg.action
            ? "<span class=\"path-segment\" onclick=\"".concat(seg.action, "\">").concat(seg.name, "</span>")
            : "<span class=\"path-segment\">".concat(seg.name, "</span>");
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
    var items = document.querySelectorAll('.file-item');
    if (index >= 0 && index < items.length)
        items[index].click();
}
function downloadFile(e, index) {
    e.stopPropagation();
    var items = document.querySelectorAll('.file-item');
    if (index >= 0 && index < items.length) {
        document.querySelectorAll('.file-item.selected').forEach(function (el) { return el.classList.remove('selected'); });
        items[index].classList.add('selected');
        selected = items[index]._childData;
        handleDownload();
    }
}
var _pendingDeletePath = null;
var _pendingDeleteName = null;
function deleteFile(e, index) {
    e.stopPropagation();
    if (!isAdmin())
        return;
    var items = document.querySelectorAll('.file-item');
    if (index < 0 || index >= items.length)
        return;
    var child = items[index]._childData;
    _pendingDeletePath = child.path;
    _pendingDeleteName = child.name;
    if (isMobile) {
        document.getElementById('deleteMobileMsg').textContent =
            "\"".concat(child.name, "\" will be permanently removed from the repository.");
        var o_1 = document.getElementById('deleteMobileOverlay');
        o_1.style.display = 'flex';
        requestAnimationFrame(function () { return o_1.classList.add('active'); });
    }
    else {
        document.getElementById('deleteConfirmMsg').textContent =
            "\"".concat(child.name, "\" will be permanently removed from the repository. This cannot be undone.");
        document.getElementById('deleteConfirm').style.display = 'flex';
    }
}
function cancelDeleteFile() {
    _pendingDeletePath = null;
    _pendingDeleteName = null;
    document.getElementById('deleteConfirm').style.display = 'none';
    var o = document.getElementById('deleteMobileOverlay');
    o.classList.remove('active');
    setTimeout(function () { o.style.display = 'none'; }, 380);
}
function confirmDeleteFile() {
    return __awaiter(this, void 0, void 0, function () {
        var path, name, getRes, delRes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!_pendingDeletePath || !_pendingDeleteName)
                        return [2 /*return*/];
                    path = _pendingDeletePath;
                    name = _pendingDeleteName;
                    cancelDeleteFile();
                    showStatus("Deleting \"".concat(name, "\"\u2026"), true);
                    return [4 /*yield*/, ghProxy('getFile', { path: path })];
                case 1:
                    getRes = _a.sent();
                    if (!getRes.ok || !getRes.data.sha) {
                        showStatus("\u2717 Could not retrieve file info: ".concat(getRes.error || 'file not found'));
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, ghProxy('deleteFile', { path: path, sha: getRes.data.sha, message: "Delete: ".concat(path) })];
                case 2:
                    delRes = _a.sent();
                    if (delRes.ok) {
                        showStatus("\u2713 \"".concat(name, "\" deleted."));
                        fetchTree();
                    }
                    else {
                        showStatus("\u2717 Delete failed: ".concat(delRes.error));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function closeWindow(id) {
    var win = windows[id];
    if (win) {
        win.remove();
        delete windows[id];
        updateTaskbar();
    }
}
function minimizeWindow(id) {
    var win = windows[id];
    if (win) {
        win.style.display = "none";
        updateTaskbar();
    }
}
function showTaskbarContextMenu(x, y, id) {
    var menu = document.getElementById("taskbarContextMenu");
    menu.innerHTML = "\n    <button onclick=\"restoreFromTaskbar('".concat(id, "')\">\uD83D\uDDD6 Restore</button>\n    <button onclick=\"minimizeWindow('").concat(id, "')\">\uD83D\uDDD5 Minimize</button>\n    <button onclick=\"closeWindow('").concat(id, "')\">\u2716 Close</button>\n  ");
    menu.style.top = y + "px";
    menu.style.left = x + "px";
    menu.style.display = "flex";
}
document.addEventListener("click", function () {
    document.getElementById("taskbarContextMenu").style.display = "none";
});
function restoreFromTaskbar(id) {
    var win = windows[id];
    if (win) {
        win.style.display = "block";
        updateTaskbar();
    }
}
function updateTaskbar() {
    var _a;
    var minimized = Object.entries(windows).filter(function (_a) {
        var _ = _a[0], el = _a[1];
        return el.style.display === "none";
    });
    if (minimized.length === 0) {
        taskbar.style.display = "none";
        taskbar.innerHTML = "";
        return;
    }
    taskbar.style.display = "flex";
    taskbar.innerHTML = "";
    var _loop_2 = function (id, el) {
        if (el.style.display === "none") {
            var icon = document.createElement("div");
            icon.className = "task-icon";
            icon.dataset.name = ((_a = el.querySelector(".title")) === null || _a === void 0 ? void 0 : _a.textContent) || "File";
            icon.textContent = "📄";
            icon.onclick = function () { el.style.display = "block"; updateTaskbar(); };
            icon.oncontextmenu = function (e) { e.preventDefault(); showTaskbarContextMenu(e.pageX, e.pageY, id); };
            taskbar.appendChild(icon);
        }
    };
    for (var _i = 0, _b = Object.entries(windows); _i < _b.length; _i++) {
        var _c = _b[_i], id = _c[0], el = _c[1];
        _loop_2(id, el);
    }
}
function toggleFullscreen(id, forceFull) {
    if (forceFull === void 0) { forceFull = false; }
    var w = windows[id];
    if (!w)
        return;
    var isFullscreen = w.classList.contains("fullscreen");
    if (forceFull && !isFullscreen) {
        w.classList.add("fullscreen");
        return;
    }
    if (isFullscreen) {
        w.classList.remove("fullscreen");
        w.style.removeProperty("top");
        w.style.removeProperty("left");
        w.style.top = "100px";
        w.style.left = "100px";
        w.style.width = "80vw";
        w.style.height = "80vh";
    }
    else {
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
        var a = document.createElement("a");
        a.href = selected.path;
        a.download = selected.name;
        a.click();
        showStatus("Downloading: ".concat(selected.name));
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
    if (document.getElementById('sv-styles'))
        return;
    var style = document.createElement('style');
    style.id = 'sv-styles';
    style.textContent = "\n    /* The preview body becomes a flex column when split-view is active */\n    .preview-body.sv-active {\n      display: flex !important;\n      flex-direction: row !important;\n      padding: 0 !important;\n      overflow: hidden !important;\n      gap: 0;\n    }\n\n    /* Left pane: rendered markdown */\n    .sv-preview-pane {\n      flex: 1;\n      overflow-y: auto;\n      padding: 24px 28px;\n      min-width: 0;\n      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);\n      border-right: 1px solid rgba(52, 211, 153, 0.05);\n    }\n\n    /* Drag handle between panes */\n    .sv-divider {\n      width: 6px;\n      background: #1e293b;\n      cursor: col-resize;\n      flex-shrink: 0;\n      position: relative;\n      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);\n      border-left: 1px solid rgba(52, 211, 153, 0.1);\n      border-right: 1px solid rgba(52, 211, 153, 0.1);\n    }\n    .sv-divider:hover, .sv-divider.dragging { \n      background: linear-gradient(180deg, rgba(52, 211, 153, 0.4) 0%, rgba(52, 211, 153, 0.2) 100%);\n      border-left-color: rgba(52, 211, 153, 0.3);\n      border-right-color: rgba(52, 211, 153, 0.3);\n      box-shadow: inset 0 0 12px rgba(52, 211, 153, 0.2);\n    }\n    .sv-divider::after {\n      content: '::';\n      position: absolute;\n      top: 50%;\n      left: 50%;\n      transform: translate(-50%, -50%);\n      color: #34d399;\n      font-size: 12px;\n      pointer-events: none;\n      letter-spacing: 2px;\n      font-weight: bold;\n      opacity: 0;\n      transition: opacity 0.2s;\n    }\n    .sv-divider:hover::after { opacity: 0.7; }\n\n    /* Right pane: markdown editor */\n    .sv-editor-pane {\n      flex: 1;\n      overflow: hidden;\n      display: flex;\n      flex-direction: column;\n      min-width: 0;\n      background: linear-gradient(135deg, #0f172a 0%, #1a202c 100%);\n      border-left: 1px solid rgba(52, 211, 153, 0.1);\n    }\n\n    /* Edit toggle button in the title bar */\n    .title-bar .btn-edit-split {\n      display: inline-flex;\n      align-items: center;\n      justify-content: center;\n      gap: 8px;\n      padding: 8px 20px;\n      border-radius: 8px;\n      font-size: 12px;\n      font-weight: 600;\n      border: 1px solid transparent;\n      background: rgba(52, 211, 153, 0.12);\n      color: #34d399;\n      cursor: pointer;\n      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);\n      font-family: inherit;\n      height: 32px;\n      position: relative;\n      letter-spacing: 0px;\n      text-transform: none;\n      white-space: nowrap;\n      flex-shrink: 0;\n      min-width: fit-content;\n    }\n    .title-bar .btn-edit-split:hover {\n      background: rgba(52, 211, 153, 0.18);\n      color: #34d399;\n      border-color: rgba(52, 211, 153, 0.3);\n      transform: translateY(-1px);\n      box-shadow: 0 4px 12px rgba(52, 211, 153, 0.2);\n    }\n    .title-bar .btn-edit-split:active {\n      transform: translateY(0);\n    }\n    .title-bar .btn-edit-split.active {\n      background: linear-gradient(135deg, rgba(52, 211, 153, 0.25) 0%, rgba(34, 197, 94, 0.25) 100%);\n      color: #10b981;\n      border-color: #10b981;\n      box-shadow: 0 0 20px rgba(52, 211, 153, 0.3);\n    }\n    .title-bar .btn-edit-split .sv-dot {\n      width: 7px;\n      height: 7px;\n      border-radius: 50%;\n      background: #fbbf24;\n      display: none;\n      animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;\n      position: absolute;\n      right: 6px;\n      top: 6px;\n      box-shadow: 0 0 4px #fbbf24;\n    }\n    .title-bar .btn-edit-split.has-edits .sv-dot { display: inline-block; }\n    @keyframes pulse-dot {\n      0%, 100% { opacity: 1; transform: scale(1); }\n      50% { opacity: 0.7; transform: scale(1.2); }\n    }\n  ";
    document.head.appendChild(style);
}
// ─── openPreview ─────────────────────────────────────────────────────────────
function openPreview(path, filename) {
    injectSplitViewStyles();
    var id = 'preview-' + (++previewId);
    var win = document.createElement("div");
    win.className = "floating-window";
    win.style.top = "".concat(100 + previewId * 10, "px");
    win.style.left = "".concat(100 + previewId * 10, "px");
    win.dataset.id = id;
    var ext = filename.split('.').pop().toLowerCase();
    var isMarkdown = ext === 'md' || ext === 'markdown';
    var isFullScreen = isMarkdown || ext === 'pdf' || ext === 'html' || ext === 'htm'
        || ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx'
        || ext === 'ppt' || ext === 'pptx';
    // Edit button — only for markdown files
    var editBtnHTML = isMarkdown
        ? "<button class=\"btn-edit-split\" id=\"".concat(id, "-editbtn\" title=\"Toggle markdown editor\" onclick=\"toggleSplitEditor('").concat(id, "')\">\n         Edit<span class=\"sv-dot\"></span>\n       </button>")
        : '';
    win.innerHTML = "\n    <div class=\"title-bar\" onmousedown=\"startDrag(event, '".concat(id, "')\">\n      <div class=\"title\">").concat(filename, "</div>\n      <div class=\"buttons\">\n        ").concat(editBtnHTML, "\n        <button onclick=\"minimizeWindow('").concat(id, "')\">\uD83D\uDDD5</button>\n        <button onclick=\"toggleFullscreen('").concat(id, "')\">\uD83D\uDDD6</button>\n        <button onclick=\"closeWindow('").concat(id, "')\">\u2716</button>\n      </div>\n    </div>\n    <div class=\"preview-body\" id=\"").concat(id, "-body\">Loading...</div>\n  ");
    previewContainer.appendChild(win);
    windows[id] = win;
    // Metadata stored on the element
    win._filePath = path;
    win._filename = filename;
    win._isMarkdown = isMarkdown;
    win._originalContent = null; // populated by fetchFileContent
    win._splitActive = false;
    // ✅ Pass win directly so _originalContent is set correctly after the await
    var container = document.getElementById(id + "-body");
    fetchFileContent(path, filename, container, win);
    updateTaskbar();
    if (isFullScreen)
        setTimeout(function () { return toggleFullscreen(id, true); }, 100);
}
// ─── fetchFileContent ─────────────────────────────────────────────────────────
function fetchFileContent(path_1, filename_1, container_1) {
    return __awaiter(this, arguments, void 0, function (path, filename, container, winElement) {
        var ext, isGitHubPages, isLocalDev, fetchUrl, fetchUrlWithFallback, rawUrl, viewerUrl, text, editBtn, response, text, error_3, error_4;
        var _this = this;
        if (winElement === void 0) { winElement = null; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    ext = (filename.includes('.') ? filename : path).split('.').pop().toLowerCase();
                    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;"><span class="loader"></span> Loading...</div>';
                    isGitHubPages = window.location.hostname.endsWith('github.io');
                    isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                    fetchUrl = function (p) {
                        if (isGitHubPages) {
                            return "https://raw.githubusercontent.com/".concat(appConfig.GITHUB_REPO, "/").concat(appConfig.GITHUB_BRANCH, "/").concat(p);
                        }
                        // For local dev or when API might not be available, try direct file path first
                        return "".concat(window.location.origin, "/").concat(p);
                    };
                    fetchUrlWithFallback = function (p) { return __awaiter(_this, void 0, void 0, function () {
                        var directUrl, apiUrl, response, contentType, e_3, apiResponse;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    directUrl = "".concat(window.location.origin, "/").concat(p);
                                    apiUrl = "".concat(window.location.origin, "/api/raw?path=").concat(encodeURIComponent(p));
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 5, , 6]);
                                    return [4 /*yield*/, fetch(directUrl)];
                                case 2:
                                    response = _a.sent();
                                    if (!response.ok) return [3 /*break*/, 4];
                                    contentType = response.headers.get('content-type') || '';
                                    if (!(!contentType.includes('text/html') || directUrl.endsWith('.html') || directUrl.endsWith('.htm'))) return [3 /*break*/, 4];
                                    return [4 /*yield*/, response.text()];
                                case 3: return [2 /*return*/, _a.sent()];
                                case 4: return [3 /*break*/, 6];
                                case 5:
                                    e_3 = _a.sent();
                                    return [3 /*break*/, 6];
                                case 6: return [4 /*yield*/, fetch(apiUrl)];
                                case 7:
                                    apiResponse = _a.sent();
                                    if (!apiResponse.ok)
                                        throw new Error("HTTP ".concat(apiResponse.status));
                                    return [4 /*yield*/, apiResponse.text()];
                                case 8: return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); };
                    rawUrl = "".concat(window.location.origin, "/api/raw?path=").concat(path);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 14, , 15]);
                    if (!/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(filename)) return [3 /*break*/, 2];
                    container.innerHTML = "<img src=\"".concat(fetchUrl(path), "\" style=\"max-width:100%;height:auto;display:block;margin:auto;\" alt=\"").concat(filename, "\" />");
                    return [3 /*break*/, 13];
                case 2:
                    if (!/\.(mp3|wav|ogg|flac)$/i.test(filename)) return [3 /*break*/, 3];
                    container.innerHTML = "<audio controls src=\"".concat(fetchUrl(path), "\" style=\"width:100%;display:block;margin-top:20px\"></audio>");
                    return [3 /*break*/, 13];
                case 3:
                    if (!/\.(mp4|webm)$/i.test(filename)) return [3 /*break*/, 4];
                    container.innerHTML = "<video controls src=\"".concat(fetchUrl(path), "\" style=\"max-width:100%;max-height:100%;display:block;margin:auto\"></video>");
                    return [3 /*break*/, 13];
                case 4:
                    if (!/\.(docx?|xlsx?|pptx?)$/i.test(filename.includes('.') ? filename : path)) return [3 /*break*/, 5];
                    viewerUrl = "https://docs.google.com/gviewer?embedded=true&url=".concat(encodeURIComponent(rawUrl));
                    container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
                    container.innerHTML = "<iframe src=\"".concat(viewerUrl, "\" style=\"flex:1;min-height:0;width:100%;border:none;display:block;\" allowfullscreen></iframe>");
                    return [3 /*break*/, 13];
                case 5:
                    if (!(ext === 'html' || ext === 'htm')) return [3 /*break*/, 6];
                    container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
                    container.innerHTML = "<iframe src=\"".concat(fetchUrl(path), "\" style=\"flex:1;min-height:0;width:100%;border:none;display:block;\"></iframe>");
                    return [3 /*break*/, 13];
                case 6:
                    if (!(ext === 'pdf')) return [3 /*break*/, 7];
                    container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
                    container.innerHTML = "<iframe src=\"".concat(fetchUrl(path), "\" style=\"flex:1;min-height:0;width:100%;border:none;display:block;\"></iframe>");
                    return [3 /*break*/, 13];
                case 7:
                    if (!(ext === 'md' || ext === 'markdown')) return [3 /*break*/, 9];
                    return [4 /*yield*/, fetchUrlWithFallback(path)];
                case 8:
                    text = _a.sent();
                    // ✅ Fixed: use the directly-passed winElement reference, not stale previewId
                    if (winElement) {
                        winElement._originalContent = text;
                        // If there are session edits, show the unsaved dot
                        if (MarkdownEditor.hasUnsavedEdits(path)) {
                            editBtn = document.getElementById(winElement.dataset.id + '-editbtn');
                            if (editBtn)
                                editBtn.classList.add('has-edits');
                        }
                    }
                    renderMarkdownIntoContainer(MarkdownEditor.getSavedContent(path) || text, path, container);
                    return [3 /*break*/, 13];
                case 9:
                    _a.trys.push([9, 12, , 13]);
                    return [4 /*yield*/, fetch(fetchUrl(path))];
                case 10:
                    response = _a.sent();
                    if (!response.ok)
                        throw new Error("HTTP ".concat(response.status));
                    return [4 /*yield*/, response.text()];
                case 11:
                    text = _a.sent();
                    container.innerHTML = "<pre style=\"margin:0;white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px;line-height:1.5\">".concat(escapeHTML(text), "</pre>");
                    return [3 /*break*/, 13];
                case 12:
                    error_3 = _a.sent();
                    container.innerHTML = "<div class=\"error\">Error loading file: ".concat(error_3.message, "</div>");
                    return [3 /*break*/, 13];
                case 13: return [3 /*break*/, 15];
                case 14:
                    error_4 = _a.sent();
                    container.innerHTML = "<div class=\"error\">Error: ".concat(error_4.message, "</div>");
                    return [3 /*break*/, 15];
                case 15: return [2 /*return*/];
            }
        });
    });
}
// ─── Markdown render helper ───────────────────────────────────────────────────
function renderMarkdownIntoContainer(text, filePath, container) {
    var wrapper = document.createElement('div');
    wrapper.className = 'markdown-content';
    wrapper.innerHTML = markdownToHTML(text, filePath);
    container.innerHTML = '';
    container.appendChild(wrapper);
    setTimeout(function () { return initMarkdownFeatures(wrapper); }, 0);
}
// ─── Split-view editor ────────────────────────────────────────────────────────
/**
 * Toggle the split-view editor panel for a markdown floating window.
 * Left pane = live rendered preview. Right pane = MarkdownEditor.
 */
function toggleSplitEditor(windowId) {
    var win = windows[windowId];
    if (!win || !win._isMarkdown)
        return;
    var body = document.getElementById(windowId + '-body');
    var editBtn = document.getElementById(windowId + '-editbtn');
    if (win._splitActive) {
        // ── Close split view ─────────────────────────────────────────────────────
        win._splitActive = false;
        if (editBtn) {
            editBtn.classList.remove('active');
        }
        // Re-render plain preview into body
        body.className = 'preview-body';
        body.removeAttribute('style');
        var content = MarkdownEditor.getSavedContent(win._filePath) || win._originalContent || '';
        renderMarkdownIntoContainer(content, win._filePath, body);
        // Update unsaved dot
        if (editBtn)
            editBtn.classList.toggle('has-edits', MarkdownEditor.hasUnsavedEdits(win._filePath));
    }
    else {
        // ── Open split view ──────────────────────────────────────────────────────
        if (!win._originalContent) {
            showStatus('⏳ File still loading, please wait…');
            return;
        }
        win._splitActive = true;
        if (editBtn) {
            editBtn.classList.add('active');
        }
        // Build split layout
        body.innerHTML = '';
        body.className = 'preview-body sv-active';
        // Left: preview pane
        var previewPane = document.createElement('div');
        previewPane.className = 'sv-preview-pane';
        previewPane.id = windowId + '-sv-preview';
        var previewWrapper_1 = document.createElement('div');
        previewWrapper_1.className = 'markdown-content';
        var initialContent = MarkdownEditor.getSavedContent(win._filePath) || win._originalContent;
        previewWrapper_1.innerHTML = markdownToHTML(initialContent, win._filePath);
        previewPane.appendChild(previewWrapper_1);
        setTimeout(function () { return initMarkdownFeatures(previewWrapper_1); }, 0);
        // Divider (draggable)
        var divider = document.createElement('div');
        divider.className = 'sv-divider';
        attachDividerDrag(divider, previewPane, body);
        // Right: editor pane
        var editorPane_1 = document.createElement('div');
        editorPane_1.className = 'sv-editor-pane';
        editorPane_1.id = windowId + '-sv-editor';
        body.appendChild(previewPane);
        body.appendChild(divider);
        body.appendChild(editorPane_1);
        // Mount the MarkdownEditor into the editor pane
        // onClose = "Done Editing" button inside the editor
        var onEditorClose = function (editedContent) {
            // Update the left preview pane live
            var pw = document.getElementById(windowId + '-sv-preview');
            if (pw) {
                pw.innerHTML = '';
                var w_1 = document.createElement('div');
                w_1.className = 'markdown-content';
                w_1.innerHTML = markdownToHTML(editedContent, win._filePath);
                pw.appendChild(w_1);
                setTimeout(function () { return initMarkdownFeatures(w_1); }, 0);
            }
            if (editBtn)
                editBtn.classList.toggle('has-edits', MarkdownEditor.hasUnsavedEdits(win._filePath));
            showStatus('✓ Changes saved to session');
        };
        MarkdownEditor.createEditorUI(editorPane_1, win._filePath, win._originalContent, onEditorClose);
        // Wire the editor's textarea so typing also live-updates the preview pane
        // We do this after createEditorUI mounts, so the textarea exists
        requestAnimationFrame(function () {
            var textarea = editorPane_1.querySelector('.mde-textarea');
            if (!textarea)
                return;
            textarea.addEventListener('input', function () {
                var pw = document.getElementById(windowId + '-sv-preview');
                if (!pw)
                    return;
                // Debounce: only re-render every 300ms to avoid layout thrashing
                clearTimeout(textarea._previewTimer);
                textarea._previewTimer = setTimeout(function () {
                    pw.innerHTML = '';
                    var w = document.createElement('div');
                    w.className = 'markdown-content';
                    w.innerHTML = markdownToHTML(textarea.value, win._filePath);
                    pw.appendChild(w);
                    setTimeout(function () { return initMarkdownFeatures(w); }, 0);
                }, 300);
            });
        });
    }
}
/**
 * Make the divider bar draggable to resize the two panes.
 */
function attachDividerDrag(divider, leftPane, container) {
    var dragging = false;
    divider.addEventListener('mousedown', function (e) {
        e.preventDefault();
        dragging = true;
        divider.classList.add('dragging');
        var onMove = function (ev) {
            if (!dragging)
                return;
            var rect = container.getBoundingClientRect();
            var pct = ((ev.clientX - rect.left) / rect.width) * 100;
            var clamped = Math.min(Math.max(pct, 20), 80); // 20%–80% range
            leftPane.style.flex = 'none';
            leftPane.style.width = clamped + '%';
        };
        var onUp = function () {
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
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
document.addEventListener("click", function (e) {
    var isItem = e.target.closest(".file-item");
    var isContext = e.target.closest(".context-menu");
    if (!isItem && !isContext) {
        document.querySelectorAll('.file-item.selected').forEach(function (el) { return el.classList.remove('selected'); });
        selected = null;
        contextMenu.style.display = "none";
    }
});
var manifest = {
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
    return document.cookie.split(';').some(function (c) { return c.trim().startsWith('vercel_redirect_dismissed=1'); });
}
function goToVercel() {
    document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
    window.location.href = appConfig.APP_URL;
}
function dismissVercelPopup() {
    document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
    var popup = document.getElementById('vercelPopup');
    popup.classList.remove('visible');
    setTimeout(function () { popup.style.display = 'none'; }, 400);
}
function maybeShowVercelPopup() {
    if (hasVercelDismissCookie())
        return;
    if (appConfig.GITPAGE_URL && window.location.hostname === new URL(appConfig.GITPAGE_URL).hostname) {
        setTimeout(function () { document.getElementById('vercelPopup').classList.add('visible'); }, 1800);
    }
}
// --- Community ---
function openCommunity() {
    var path = 'primenotepad.rf.gd';
    if (isMobile) {
        openMobilePreview(path, 'Community 💬');
    }
    else {
        openPreview(path, 'Community 💬');
    }
}
window.addEventListener("DOMContentLoaded", function () { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, fetchConfig()];
            case 1:
                _a.sent();
                fetchTree();
                maybeShowVercelPopup();
                return [2 /*return*/];
        }
    });
}); });
// --- Update check ---
var lastCommit = null;
var lastHash = null;
var initialLoadComplete = false;
function fetchLatestCommit() {
    return __awaiter(this, void 0, void 0, function () {
        var response, data, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/gh.js', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'latestCommit' })
                        })];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.json()];
                case 2:
                    data = _a.sent();
                    if (!response.ok || !data.sha)
                        throw new Error(data.error || 'Failed to fetch latest commit');
                    return [2 /*return*/, data.sha];
                case 3:
                    err_1 = _a.sent();
                    console.warn("[fetchLatestCommit] Could not fetch latest commit:", err_1.message);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function checkForUpdate() {
    return __awaiter(this, void 0, void 0, function () {
        var newCommit, notice;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!initialLoadComplete)
                        return [2 /*return*/];
                    return [4 /*yield*/, fetchLatestCommit()];
                case 1:
                    newCommit = _a.sent();
                    if (!newCommit)
                        return [2 /*return*/];
                    if (lastCommit && newCommit !== lastCommit) {
                        notice = document.getElementById("updateNotice");
                        if (notice && notice.style.display !== "flex")
                            notice.style.display = "flex";
                    }
                    return [2 /*return*/];
            }
        });
    });
}
