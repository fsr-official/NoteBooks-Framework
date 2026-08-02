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
// ===== MOBILE OVERFLOW MENU =====
function toggleMobOverflow() {
    document.getElementById('mobOverflowMenu').classList.toggle('open');
}
function closeMobOverflow() {
    document.getElementById('mobOverflowMenu').classList.remove('open');
}
// Close overflow menu on outside tap
document.addEventListener('click', function (e) {
    if (!e.target.closest('#mobOverflowBtn') && !e.target.closest('#mobOverflowMenu')) {
        closeMobOverflow();
    }
});
// ===== MOBILE FILE ACTION BOTTOM SHEET =====
var _mobSheetIndex = -1;
function openMobFileSheet(e, index) {
    e.stopPropagation();
    var items = document.querySelectorAll('.file-item');
    if (index < 0 || index >= items.length)
        return;
    var child = items[index]._childData;
    // Set selection
    document.querySelectorAll('.file-item.selected').forEach(function (el) { return el.classList.remove('selected'); });
    items[index].classList.add('selected');
    selected = child;
    _mobSheetIndex = index;
    document.getElementById('mobFileSheetTitle').textContent = child.name;
    document.getElementById('mobSheetDelete').style.display = isAdmin() ? '' : 'none';
    var sheet = document.getElementById('mobFileSheet');
    sheet.classList.add('open');
}
function closeMobFileSheet(e) {
    // Close only if tapping the backdrop (not the card itself)
    if (e && e.target !== document.getElementById('mobFileSheet'))
        return;
    _closeMobFileSheet();
}
function _closeMobFileSheet() {
    document.getElementById('mobFileSheet').classList.remove('open');
    _mobSheetIndex = -1;
}
function mobSheetAction(action) {
    _closeMobFileSheet();
    if (_mobSheetIndex === -1) {
        // index was cleared — reconstruct from selected
        if (!selected)
            return;
        if (action === 'preview') {
            openMobilePreview(selected.path, selected.name);
            return;
        }
        if (action === 'download') {
            handleDownload();
            return;
        }
        if (action === 'delete') {
            deleteFile({ stopPropagation: function () { } }, -1);
            return;
        }
        return;
    }
    // Use stored index
    var fakeEvent = { stopPropagation: function () { } };
    if (action === 'preview')
        previewFile(fakeEvent, _mobSheetIndex);
    if (action === 'download')
        downloadFile(fakeEvent, _mobSheetIndex);
    if (action === 'delete')
        deleteFile(fakeEvent, _mobSheetIndex);
}
var mobileMin = {}; // id -> { name }
function minimizeWindowMobile(id) {
    var _a;
    var w = windows[id];
    if (!w)
        return;
    w.style.display = 'none';
    mobileMin[id] = { name: ((_a = w.querySelector('.title')) === null || _a === void 0 ? void 0 : _a.textContent) || 'File' };
    renderMobileMinStack();
}
function restoreWindowMobile(id) {
    var _a;
    // Minimise anything currently visible
    for (var _i = 0, _b = Object.entries(windows); _i < _b.length; _i++) {
        var _c = _b[_i], wid = _c[0], w_1 = _c[1];
        if (w_1.style.display !== 'none') {
            w_1.style.display = 'none';
            mobileMin[wid] = { name: ((_a = w_1.querySelector('.title')) === null || _a === void 0 ? void 0 : _a.textContent) || 'File' };
        }
    }
    var w = windows[id];
    if (w) {
        w.style.display = 'flex';
        delete mobileMin[id];
    }
    renderMobileMinStack();
}
function renderMobileMinStack() {
    var stack = document.getElementById('mobileMinStack');
    var dropdown = document.getElementById('mobHamburgerDropdown');
    if (!isMobile) {
        stack.style.display = 'none';
        return;
    }
    var entries = Object.entries(mobileMin);
    if (!entries.length) {
        stack.style.display = 'none';
        dropdown.classList.remove('open');
        return;
    }
    stack.style.display = 'flex';
    // Update badge count on hamburger button
    var btn = document.getElementById('mobHamburgerBtn');
    btn.textContent = entries.length > 0 ? "\u2630 ".concat(entries.length) : '☰';
    // Rebuild dropdown items
    dropdown.innerHTML = entries.map(function (_a) {
        var id = _a[0], info = _a[1];
        return "<button class=\"mob-min-btn\" onclick=\"restoreWindowMobile('".concat(id, "')\">\uD83D\uDCC4 <span>").concat(info.name, "</span></button>");
    }).join('');
}
function toggleMobHamburger() {
    var dropdown = document.getElementById('mobHamburgerDropdown');
    dropdown.classList.toggle('open');
}
// Close the hamburger dropdown when tapping outside it
document.addEventListener('click', function (e) {
    var _a;
    if (!e.target.closest('#mobileMinStack')) {
        (_a = document.getElementById('mobHamburgerDropdown')) === null || _a === void 0 ? void 0 : _a.classList.remove('open');
    }
});
// ===== OVERRIDE openPreview FOR MOBILE MINIMIZE SUPPORT =====
function openPreview(path, filename) {
    var id = 'preview-' + (++previewId);
    var win = document.createElement('div');
    win.className = 'floating-window';
    if (isMobile) {
        win.style.cssText = 'top:0;left:0;width:100vw;height:100vh;border-radius:0;';
    }
    else {
        win.style.top = "".concat(100 + previewId * 10, "px");
        win.style.left = "".concat(100 + previewId * 10, "px");
    }
    win.dataset.id = id;
    var ext = filename.split('.').pop().toLowerCase();
    var minBtn = isMobile
        ? "<button onclick=\"minimizeWindowMobile('".concat(id, "')\">\uD83D\uDDD5</button>")
        : "<button onclick=\"minimizeWindow('".concat(id, "')\">\uD83D\uDDD5</button>");
    var fsBtn = isMobile ? '' : "<button onclick=\"toggleFullscreen('".concat(id, "')\">\uD83D\uDDD6</button>");
    win.innerHTML = "\n    <div class=\"title-bar\" onmousedown=\"".concat(isMobile ? '' : "startDrag(event,'".concat(id, "')"), "\">\n      <div class=\"title\">").concat(filename, "</div>\n      <div class=\"buttons\">").concat(minBtn).concat(fsBtn, "<button onclick=\"closeWindow('").concat(id, "')\">\u2716</button></div>\n    </div>\n    <div class=\"preview-body\" id=\"").concat(id, "-body\">Loading...</div>");
    previewContainer.appendChild(win);
    windows[id] = win;
    fetchFileContent(path, filename, document.getElementById(id + '-body'));
    if (!isMobile) {
        updateTaskbar();
        if (['md', 'markdown', 'pdf', 'html', 'htm', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext))
            setTimeout(function () { return toggleFullscreen(id, true); }, 100);
    }
}
// ===== OVERRIDE handlePreview — always use openPreview (handles mobile internally) =====
function handlePreview() {
    if (selected && selected.type === 'file')
        openPreview(selected.path, selected.name);
    contextMenu.style.display = 'none';
}
// ===== OVERRIDE closeWindow — handle mobile min stack =====
function closeWindow(id) {
    var w = windows[id];
    if (w) {
        w.remove();
        delete windows[id];
        delete mobileMin[id];
    }
    isMobile ? renderMobileMinStack() : updateTaskbar();
}
// ===== OVERRIDE minimizeWindow — handle mobile fallthrough =====
function minimizeWindow(id) {
    var w = windows[id];
    if (!w)
        return;
    if (isMobile) {
        minimizeWindowMobile(id);
        return;
    }
    w.style.display = 'none';
    updateTaskbar();
}
// ===== OVERRIDE updateTaskbar — fix names + scrollable =====
function updateTaskbar() {
    var _a;
    if (isMobile)
        return;
    var minimised = Object.entries(windows).filter(function (_a) {
        var el = _a[1];
        return el.style.display === 'none';
    });
    if (!minimised.length) {
        taskbar.style.display = 'none';
        taskbar.innerHTML = '';
        return;
    }
    taskbar.style.display = 'flex';
    taskbar.style.overflowX = 'auto';
    taskbar.style.flexWrap = 'nowrap';
    taskbar.innerHTML = '';
    var _loop_1 = function (id, el) {
        if (el.style.display !== 'none')
            return "continue";
        var name_1 = ((_a = el.querySelector('.title')) === null || _a === void 0 ? void 0 : _a.textContent) || 'File';
        var icon = document.createElement('div');
        icon.className = 'task-icon';
        icon.dataset.name = name_1;
        icon.style.cssText = 'width:auto;padding:0 10px;gap:5px;font-size:12px;white-space:nowrap;display:flex;align-items:center;min-width:auto;';
        icon.innerHTML = "<span>\uD83D\uDCC4</span><span>".concat(name_1, "</span>");
        icon.onclick = function () { el.style.display = 'block'; updateTaskbar(); };
        icon.oncontextmenu = function (e) { e.preventDefault(); showTaskbarContextMenu(e.pageX, e.pageY, id); };
        taskbar.appendChild(icon);
    };
    for (var _i = 0, _b = Object.entries(windows); _i < _b.length; _i++) {
        var _c = _b[_i], id = _c[0], el = _c[1];
        _loop_1(id, el);
    }
}
// ===== INIT =====
window.addEventListener('DOMContentLoaded', function () { return __awaiter(_this, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                restoreModernSession();
                return [4 /*yield*/, updatePendingBadge()];
            case 1:
                _a.sent();
                return [2 /*return*/];
        }
    });
}); });
