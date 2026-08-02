// ===== WAITING-LIST HELPERS =====
// Pending upload *metadata* stays in the repo's waiting-list/index.json (via ghProxy).
// Pending upload *file bytes* are stored in Vercel Blob Storage (via /api/blob).
// This keeps binary files out of git history and removes GitHub API size limits.
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
function sanitizeForPath(name) {
    return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}
function b64encode(str) {
    var bytes = new TextEncoder().encode(str);
    var binary = '';
    for (var i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}
function b64decode(b64) {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }));
}
// ===== VERCEL BLOB HELPERS =====
// Upload a file to Vercel Blob; returns { ok, url } or { ok: false, error }
function blobUpload(filename, base64Data) {
    return __awaiter(this, void 0, void 0, function () {
        var r, data, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/blob', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'upload', filename: filename, content: base64Data })
                        })];
                case 1:
                    r = _a.sent();
                    return [4 /*yield*/, r.json()];
                case 2:
                    data = _a.sent();
                    if (!r.ok)
                        return [2 /*return*/, { ok: false, error: data.error || "Blob error (".concat(r.status, ")") }];
                    return [2 /*return*/, { ok: true, url: data.url }];
                case 3:
                    e_1 = _a.sent();
                    return [2 /*return*/, { ok: false, error: e_1.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Delete a blob by its URL
function blobDelete(url) {
    return __awaiter(this, void 0, void 0, function () {
        var r, data, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/blob', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'delete', url: url })
                        })];
                case 1:
                    r = _a.sent();
                    return [4 /*yield*/, r.json()];
                case 2:
                    data = _a.sent();
                    return [2 /*return*/, r.ok ? { ok: true } : { ok: false, error: data.error }];
                case 3:
                    e_2 = _a.sent();
                    return [2 /*return*/, { ok: false, error: e_2.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Fetch a blob's bytes as a Uint8Array (for preview / download / approve)
function blobFetch(url) {
    return __awaiter(this, void 0, void 0, function () {
        var r, data, bytes, e_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, fetch('/api/blob', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'fetch', url: url })
                        })];
                case 1:
                    r = _a.sent();
                    return [4 /*yield*/, r.json()];
                case 2:
                    data = _a.sent();
                    if (!r.ok || !data.content)
                        return [2 /*return*/, { ok: false, error: data.error || 'No content' }];
                    bytes = Uint8Array.from(atob(data.content), function (c) { return c.charCodeAt(0); });
                    return [2 /*return*/, { ok: true, bytes: bytes }];
                case 3:
                    e_3 = _a.sent();
                    return [2 /*return*/, { ok: false, error: e_3.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ===== WAITING-LIST INDEX (still in GitHub repo) =====
function wlReadIndex() {
    return __awaiter(this, void 0, void 0, function () {
        var res;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ghProxy('getFileContent', { path: 'waiting-list/index.json' })];
                case 1:
                    res = _a.sent();
                    if (!res.ok || !res.data.content)
                        return [2 /*return*/, { sha: null, items: [] }];
                    try {
                        return [2 /*return*/, { sha: res.data.sha, items: JSON.parse(b64decode(res.data.content)) }];
                    }
                    catch (e) {
                        return [2 /*return*/, { sha: res.data.sha, items: [] }];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function wlWriteIndex(items, sha, message) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, ghProxy('putFile', {
                    path: 'waiting-list/index.json',
                    content: b64encode(JSON.stringify(items, null, 2)),
                    message: message || 'Update waiting-list index',
                    sha: sha || null
                })];
        });
    });
}
// ===== PENDING UPLOADS UI =====
function loadPendingUploads() {
    return __awaiter(this, void 0, void 0, function () {
        var list, label, items;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    list = document.getElementById('pendingUploadsList');
                    label = document.getElementById('pendingCountLabel');
                    list.innerHTML = '<div style="font-size:13px;opacity:.5;padding:6px 0">Loading…</div>';
                    return [4 /*yield*/, wlReadIndex()];
                case 1:
                    items = (_a.sent()).items;
                    if (label)
                        label.textContent = items.length ? "(".concat(items.length, ")") : '';
                    if (!items.length) {
                        list.innerHTML = '<div style="font-size:13px;opacity:.5;padding:6px 0">No pending uploads.</div>';
                        return [2 /*return*/];
                    }
                    list.innerHTML = items.map(function (u) {
                        var dest = (u.destPath || '').trim();
                        var destLabel = dest || '(repository root)';
                        var editTag = u.reuploadCount > 0
                            ? "<span style=\"font-size:10px;padding:1px 6px;border-radius:99px;background:#fff3e0;color:#e65100;margin-left:4px\">edited \u00D7".concat(u.reuploadCount, "</span>")
                            : '';
                        return "\n    <div class=\"pending-item\" id=\"pi-".concat(u.id, "\">\n      <span style=\"font-size:22px\">").concat(getIconForFilename(u.originalName), "</span>\n      <div style=\"min-width:0;flex:1\">\n        <div style=\"font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">").concat(u.originalName).concat(editTag, "</div>\n        <div style=\"font-size:11px;opacity:.5\">").concat(fmtSize(u.size), " \u00B7 ").concat(new Date(u.uploadedAt).toLocaleString(), "</div>\n        <div style=\"font-size:11px;color:var(--accent);margin-top:2px\">\uD83D\uDCC1 ").concat(destLabel, "</div>\n      </div>\n      <div class=\"pending-item-actions\">\n        <button class=\"pa-btn view\" onclick=\"previewPending('").concat(u.id, "')\">\uD83D\uDC41 View</button>\n        <button class=\"pa-btn dl\"   onclick=\"downloadPending('").concat(u.id, "')\">\uD83D\uDCE5 Download</button>\n        <button class=\"pa-btn rev\"  onclick=\"reuploadPending('").concat(u.id, "')\">\uD83D\uDD04 Re-upload</button>\n        <button class=\"pa-btn ok\"   onclick=\"approvePending('").concat(u.id, "')\">\u2713 Approve</button>\n        <button class=\"pa-btn rej\"  onclick=\"rejectPending('").concat(u.id, "')\">\u2717 Deny</button>\n      </div>\n    </div>");
                    }).join('');
                    updatePendingBadge();
                    return [2 /*return*/];
            }
        });
    });
}
function previewPending(id) {
    return __awaiter(this, void 0, void 0, function () {
        var items, u, res, url;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, wlReadIndex()];
                case 1:
                    items = (_a.sent()).items;
                    u = items.find(function (x) { return x.id === id; });
                    if (!u)
                        return [2 /*return*/];
                    showStatus('Fetching file…', true);
                    return [4 /*yield*/, blobFetch(u.blobUrl)];
                case 2:
                    res = _a.sent();
                    if (!res.ok) {
                        showStatus('✗ Could not fetch file.');
                        return [2 /*return*/];
                    }
                    url = URL.createObjectURL(new Blob([res.bytes]));
                    if (isMobile)
                        openMobilePreview(url, u.originalName);
                    else
                        openPreview(url, u.originalName);
                    return [2 /*return*/];
            }
        });
    });
}
function downloadPending(id) {
    return __awaiter(this, void 0, void 0, function () {
        var items, u, res, url, a;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, wlReadIndex()];
                case 1:
                    items = (_a.sent()).items;
                    u = items.find(function (x) { return x.id === id; });
                    if (!u)
                        return [2 /*return*/];
                    showStatus('Fetching file…', true);
                    return [4 /*yield*/, blobFetch(u.blobUrl)];
                case 2:
                    res = _a.sent();
                    if (!res.ok) {
                        showStatus('✗ Could not fetch file.');
                        return [2 /*return*/];
                    }
                    url = URL.createObjectURL(new Blob([res.bytes]));
                    a = document.createElement('a');
                    a.href = url;
                    a.download = u.originalName;
                    a.click();
                    setTimeout(function () { return URL.revokeObjectURL(url); }, 2000);
                    return [2 /*return*/];
            }
        });
    });
}
function reuploadPending(id) {
    var _this = this;
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.onchange = function (e) { return __awaiter(_this, void 0, void 0, function () {
        var file, _a, idxSha, items, u, count, countStr, dotIdx, newOriginalName, newStoredName, reader;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    file = e.target.files[0];
                    if (!file)
                        return [2 /*return*/];
                    // File size guard (25 MB)
                    if (file.size > 25 * 1024 * 1024) {
                        showStatus('✗ File too large. Maximum size is 25 MB.');
                        return [2 /*return*/];
                    }
                    showStatus('Re-uploading…', true);
                    return [4 /*yield*/, wlReadIndex()];
                case 1:
                    _a = _b.sent(), idxSha = _a.sha, items = _a.items;
                    u = items.find(function (x) { return x.id === id; });
                    if (!u)
                        return [2 /*return*/];
                    count = u.reuploadCount || 0;
                    countStr = String(count).padStart(3, '0');
                    dotIdx = file.name.lastIndexOf('.');
                    newOriginalName = dotIdx > -1
                        ? file.name.slice(0, dotIdx) + '-edited-' + countStr + file.name.slice(dotIdx)
                        : file.name + '-edited-' + countStr;
                    newStoredName = sanitizeForPath(newOriginalName);
                    reader = new FileReader();
                    reader.onload = function () { return __awaiter(_this, void 0, void 0, function () {
                        var b64, putOk, newItems;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    b64 = reader.result.split(',')[1];
                                    return [4 /*yield*/, blobUpload("waiting-list/".concat(id, "-").concat(newStoredName), b64)];
                                case 1:
                                    putOk = _a.sent();
                                    if (!putOk.ok) {
                                        showStatus("\u2717 Re-upload failed: ".concat(putOk.error));
                                        return [2 /*return*/];
                                    }
                                    if (!u.blobUrl) return [3 /*break*/, 3];
                                    return [4 /*yield*/, blobDelete(u.blobUrl)];
                                case 2:
                                    _a.sent();
                                    _a.label = 3;
                                case 3:
                                    newItems = items.map(function (x) { return x.id === id
                                        ? __assign(__assign({}, x), { blobUrl: putOk.url, originalName: newOriginalName, size: file.size, reuploadCount: count + 1 }) : x; });
                                    return [4 /*yield*/, wlWriteIndex(newItems, idxSha, "Re-upload: ".concat(newOriginalName))];
                                case 4:
                                    _a.sent();
                                    showStatus("\u2713 Re-uploaded as: ".concat(newOriginalName));
                                    loadPendingUploads();
                                    return [2 /*return*/];
                            }
                        });
                    }); };
                    reader.readAsDataURL(file);
                    return [2 /*return*/];
            }
        });
    }); };
    inp.click();
}
function approvePending(id) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, idxSha, items, u, fileRes, binary, b64Content, destPath, filePath, destCheck, destSha, approveOk, newItems;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    showStatus('Approving…', true);
                    return [4 /*yield*/, wlReadIndex()];
                case 1:
                    _a = _b.sent(), idxSha = _a.sha, items = _a.items;
                    u = items.find(function (x) { return x.id === id; });
                    if (!u) {
                        showStatus('✗ Item not found in waiting list.');
                        return [2 /*return*/];
                    }
                    return [4 /*yield*/, blobFetch(u.blobUrl)];
                case 2:
                    fileRes = _b.sent();
                    if (!fileRes.ok) {
                        showStatus("\u2717 Could not fetch file from storage: ".concat(fileRes.error));
                        return [2 /*return*/];
                    }
                    binary = '';
                    fileRes.bytes.forEach(function (b) { return binary += String.fromCharCode(b); });
                    b64Content = btoa(binary);
                    destPath = (u.destPath || '').trim().replace(/^\/|\/$/g, '');
                    filePath = destPath ? "".concat(destPath, "/").concat(u.originalName) : u.originalName;
                    return [4 /*yield*/, ghProxy('getFile', { path: filePath })];
                case 3:
                    destCheck = _b.sent();
                    destSha = destCheck.ok ? destCheck.data.sha : null;
                    return [4 /*yield*/, ghProxy('putFile', {
                            path: filePath, content: b64Content,
                            message: "Approve upload: ".concat(u.originalName), sha: destSha
                        })];
                case 4:
                    approveOk = _b.sent();
                    if (!approveOk.ok) {
                        showStatus("\u2717 Failed to publish: ".concat(approveOk.error));
                        return [2 /*return*/];
                    }
                    if (!u.blobUrl) return [3 /*break*/, 6];
                    return [4 /*yield*/, blobDelete(u.blobUrl)];
                case 5:
                    _b.sent();
                    _b.label = 6;
                case 6:
                    newItems = items.filter(function (x) { return x.id !== id; });
                    return [4 /*yield*/, wlWriteIndex(newItems, idxSha, "Approve: ".concat(u.originalName))];
                case 7:
                    _b.sent();
                    showStatus("\u2713 \"".concat(u.originalName, "\" approved \u2192 published to ").concat(destPath || 'repository root', "!"));
                    loadPendingUploads();
                    updatePendingBadge();
                    fetchTree();
                    return [2 /*return*/];
            }
        });
    });
}
function rejectPending(id) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, idxSha, items, u, newItems;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    showStatus('Removing…', true);
                    return [4 /*yield*/, wlReadIndex()];
                case 1:
                    _a = _b.sent(), idxSha = _a.sha, items = _a.items;
                    u = items.find(function (x) { return x.id === id; });
                    if (!u)
                        return [2 /*return*/];
                    if (!u.blobUrl) return [3 /*break*/, 3];
                    return [4 /*yield*/, blobDelete(u.blobUrl)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    newItems = items.filter(function (x) { return x.id !== id; });
                    return [4 /*yield*/, wlWriteIndex(newItems, idxSha, "Deny: ".concat(u.originalName))];
                case 4:
                    _b.sent();
                    loadPendingUploads();
                    updatePendingBadge();
                    showStatus('Upload denied and removed.');
                    return [2 /*return*/];
            }
        });
    });
}
function commitFileToGitHub(filePath, base64Content) {
    return __awaiter(this, void 0, void 0, function () {
        var getRes, sha, putRes;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ghProxy('getFile', { path: filePath })];
                case 1:
                    getRes = _a.sent();
                    if (!getRes.ok) {
                        showStatus("\u2717 Could not read destination: ".concat(getRes.error));
                        return [2 /*return*/, false];
                    }
                    sha = getRes.data.sha || null;
                    return [4 /*yield*/, ghProxy('putFile', { path: filePath, content: base64Content, message: "Upload: ".concat(filePath), sha: sha })];
                case 2:
                    putRes = _a.sent();
                    if (!putRes.ok) {
                        showStatus("\u2717 Could not publish file: ".concat(putRes.error));
                        return [2 /*return*/, false];
                    }
                    return [2 /*return*/, true];
            }
        });
    });
}
function updatePendingBadge() {
    return __awaiter(this, void 0, void 0, function () {
        var btn, dot, items, e_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    btn = document.getElementById('adminPanelBtn');
                    if (!btn || !isAdmin())
                        return [2 /*return*/];
                    dot = btn.querySelector('.badge-dot');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, wlReadIndex()];
                case 2:
                    items = (_a.sent()).items;
                    if (items.length > 0) {
                        if (!dot) {
                            dot = document.createElement('span');
                            dot.className = 'badge-dot';
                            btn.appendChild(dot);
                        }
                    }
                    else if (dot) {
                        dot.remove();
                    }
                    return [3 /*break*/, 4];
                case 3:
                    e_4 = _a.sent();
                    if (dot)
                        dot.remove();
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// ===== UPLOAD SCREEN =====
var _pendingFiles = [];
var _reuploadFile = null;
var MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB
function showUploadScreen() {
    _pendingFiles = [];
    _reuploadFile = null;
    uploadGoStep1();
    document.getElementById('usResult').style.display = 'none';
    var o = document.getElementById('uploadOverlay');
    o.style.display = 'flex';
    requestAnimationFrame(function () { return o.classList.add('active'); });
}
function hideUploadScreen() {
    var o = document.getElementById('uploadOverlay');
    o.classList.remove('active');
    setTimeout(function () {
        o.style.display = 'none';
        _pendingFiles = [];
        _reuploadFile = null;
        document.getElementById('filePickerInput').value = '';
        document.getElementById('us2destPath').value = '';
        document.getElementById('usResult').style.display = 'none';
        uploadGoStep1();
    }, 380);
}
function closeUploadScreen() {
    if (_pendingFiles.length) {
        document.getElementById('discardConfirm').style.display = 'flex';
    }
    else
        hideUploadScreen();
}
function confirmDiscard() {
    document.getElementById('discardConfirm').style.display = 'none';
    _pendingFiles = [];
    hideUploadScreen();
}
function setUploadDots(active) {
    for (var i = 0; i < 3; i++) {
        var d = document.getElementById('ud' + i);
        if (d)
            d.classList.toggle('on', i < active);
    }
}
function uploadGoStep1() {
    ['us1', 'us2', 'us3'].forEach(function (id, i) {
        var el = document.getElementById(id);
        if (el)
            el.style.display = i === 0 ? '' : 'none';
    });
    setUploadDots(1);
}
function uploadGoStep2() {
    ['us1', 'us2', 'us3'].forEach(function (id, i) {
        var el = document.getElementById(id);
        if (el)
            el.style.display = i === 1 ? '' : 'none';
    });
    setUploadDots(2);
}
function uploadGoStep3() {
    if (!_pendingFiles.length)
        return;
    var count = _pendingFiles.length;
    var totalSize = _pendingFiles.reduce(function (s, f) { return s + f.size; }, 0);
    document.getElementById('us3icon').textContent = count === 1 ? getIconForFilename(_pendingFiles[0].name) : '📦';
    document.getElementById('us3name').textContent = count === 1 ? _pendingFiles[0].name : "".concat(count, " files selected");
    document.getElementById('us3size').textContent = fmtSize(totalSize);
    var dest = (document.getElementById('us2destPath').value || '').trim().replace(/^\/|\/$/g, '');
    document.getElementById('us3destPath').textContent = dest || 'repository root';
    document.getElementById('us3sub').textContent = isAdmin()
        ? "".concat(count, " file").concat(count > 1 ? 's' : '', " will be published directly to the repository.")
        : "".concat(count, " file").concat(count > 1 ? 's' : '', " will be held for admin review and approval.");
    document.getElementById('us3adminNote').style.display = isAdmin() ? '' : 'none';
    document.getElementById('us3approveBtn').textContent = isAdmin() ? '✓ Publish to Repository' : '✓ Submit for Review';
    document.getElementById('us3progressWrap').style.display = 'none';
    document.getElementById('us3progressBar').style.width = '0%';
    ['us1', 'us2', 'us3'].forEach(function (id, i) {
        var el = document.getElementById(id);
        if (el)
            el.style.display = i === 2 ? '' : 'none';
    });
    setUploadDots(3);
}
function uploadDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function uploadDragLeave() { document.getElementById('dropZone').classList.remove('drag-over'); }
function uploadFileDrop(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('drag-over');
    var files = Array.from(e.dataTransfer.files).filter(function (f) {
        if (f.size > MAX_FILE_SIZE) {
            showStatus("\u2717 \"".concat(f.name, "\" exceeds 25 MB limit."));
            return false;
        }
        return true;
    });
    if (files.length) {
        _pendingFiles = files;
        populateStep2UI();
        uploadGoStep2();
    }
}
function onFilePicked(e) {
    var files = Array.from(e.target.files).filter(function (f) {
        if (f.size > MAX_FILE_SIZE) {
            showStatus("\u2717 \"".concat(f.name, "\" exceeds 25 MB limit."));
            return false;
        }
        return true;
    });
    if (!files.length)
        return;
    _pendingFiles = files;
    populateStep2UI();
    uploadGoStep2();
}
function onReuploadPicked(e) {
    var file = e.target.files[0];
    if (!file)
        return;
    if (file.size > MAX_FILE_SIZE) {
        showStatus('✗ File exceeds 25 MB limit.');
        return;
    }
    _reuploadFile = file;
    document.getElementById('reuploadInfo').textContent = "\u2713 Modified file selected: ".concat(file.name, " (").concat(fmtSize(file.size), ")");
}
function removeQueuedFile(index) {
    _pendingFiles.splice(index, 1);
    if (!_pendingFiles.length) {
        uploadGoStep1();
        return;
    }
    populateStep2UI();
}
function populateStep2UI() {
    var files = _pendingFiles;
    var count = files.length;
    var queue = document.getElementById('us2fileQueue');
    queue.innerHTML = files.map(function (f, i) { return "\n    <div class=\"fpc\" style=\"margin:0;padding:10px 12px\">\n      <div class=\"fpc-icon\" style=\"font-size:22px\">".concat(getIconForFilename(f.name), "</div>\n      <div style=\"flex:1;min-width:0\">\n        <div class=\"fpc-name\" style=\"white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">").concat(f.name, "</div>\n        <div class=\"fpc-size\">").concat(fmtSize(f.size), "</div>\n      </div>\n      <span style=\"font-size:16px;cursor:pointer;padding:4px 8px;border-radius:6px;opacity:0.45;flex-shrink:0;transition:opacity 0.15s,background 0.15s\"\n        title=\"Remove\"\n        onclick=\"removeQueuedFile(").concat(i, ")\"\n        onmouseover=\"this.style.opacity='1';this.style.background='rgba(229,57,53,0.12)'\"\n        onmouseout=\"this.style.opacity='0.45';this.style.background='none'\">\u2715</span>\n    </div>\n  "); }).join('');
    document.getElementById('us2pendingNotice').style.display = isAdmin() ? 'none' : 'flex';
    document.getElementById('us2adminNotice').style.display = isAdmin() ? '' : 'none';
    document.getElementById('us2reuploadSection').style.display = (isAdmin() && count === 1) ? '' : 'none';
    document.getElementById('us2title').textContent = isAdmin() ? 'Ready to Publish' : "".concat(count, " File").concat(count > 1 ? 's' : '', " Selected");
    document.getElementById('us2sub').textContent = isAdmin()
        ? "".concat(count, " file").concat(count > 1 ? 's' : '', " will be published directly.")
        : "".concat(count, " file").concat(count > 1 ? 's' : '', " will be held for admin review before being published.");
    document.getElementById('reuploadInfo').textContent = '';
}
function _setUploadProgress(done, total) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    document.getElementById('us3progressBar').style.width = pct + '%';
    document.getElementById('us3progressLabel').textContent = "Uploading ".concat(done, " of ").concat(total, "\u2026 (").concat(pct, "%)");
}
function finalizeUpload() {
    return __awaiter(this, void 0, void 0, function () {
        var files, btn, backBtn, dest, total, results, _loop_1, i, successes, failures, msg, _a, idxSha, items, _loop_2, i, successes, failures, idxOk, msg;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    files = (_reuploadFile && _pendingFiles.length === 1) ? [_reuploadFile] : _pendingFiles;
                    if (!files.length)
                        return [2 /*return*/];
                    btn = document.getElementById('us3approveBtn');
                    backBtn = document.getElementById('us3backBtn');
                    btn.disabled = true;
                    backBtn.disabled = true;
                    btn.textContent = 'Uploading…';
                    dest = (document.getElementById('us2destPath').value || '').trim().replace(/^\/|\/$/g, '');
                    total = files.length;
                    results = [];
                    if (!isAdmin()) return [3 /*break*/, 5];
                    // Admin: commit directly to GitHub
                    document.getElementById('us3progressWrap').style.display = '';
                    _loop_1 = function (i) {
                        var file, b64, filePath, ok;
                        return __generator(this, function (_c) {
                            switch (_c.label) {
                                case 0:
                                    file = files[i];
                                    _setUploadProgress(i, total);
                                    return [4 /*yield*/, new Promise(function (res, rej) {
                                            var r = new FileReader();
                                            r.onload = function () { return res(r.result.split(',')[1]); };
                                            r.onerror = function () { return rej(new Error('Read failed')); };
                                            r.readAsDataURL(file);
                                        })];
                                case 1:
                                    b64 = _c.sent();
                                    filePath = dest ? "".concat(dest, "/").concat(file.name) : file.name;
                                    return [4 /*yield*/, commitFileToGitHub(filePath, b64)];
                                case 2:
                                    ok = _c.sent();
                                    results.push({ name: file.name, ok: ok });
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _b.label = 1;
                case 1:
                    if (!(i < total)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(i)];
                case 2:
                    _b.sent();
                    _b.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4:
                    _setUploadProgress(total, total);
                    fetchTree();
                    successes = results.filter(function (r) { return r.ok; });
                    failures = results.filter(function (r) { return !r.ok; });
                    msg = '';
                    if (successes.length)
                        msg += "\u2713 ".concat(successes.length, " file").concat(successes.length > 1 ? 's' : '', " published to \"").concat(dest || 'repository root', "\".");
                    if (failures.length)
                        msg += "".concat(msg ? '\n' : '', "\u2717 ").concat(failures.length, " failed: ").concat(failures.map(function (r) { return r.name; }).join(', '));
                    showUploadResultUI(failures.length === 0, msg.trim());
                    return [3 /*break*/, 13];
                case 5:
                    // Anonymous: upload to Vercel Blob, record metadata in waiting-list/index.json
                    btn.textContent = 'Submitting…';
                    document.getElementById('us3progressWrap').style.display = '';
                    return [4 /*yield*/, wlReadIndex()];
                case 6:
                    _a = _b.sent(), idxSha = _a.sha, items = _a.items;
                    _loop_2 = function (i) {
                        var file, b64, id, storedName, blobOk;
                        return __generator(this, function (_d) {
                            switch (_d.label) {
                                case 0:
                                    file = files[i];
                                    _setUploadProgress(i, total);
                                    return [4 /*yield*/, new Promise(function (res, rej) {
                                            var r = new FileReader();
                                            r.onload = function () { return res(r.result.split(',')[1]); };
                                            r.onerror = function () { return rej(new Error('Read failed')); };
                                            r.readAsDataURL(file);
                                        })];
                                case 1:
                                    b64 = _d.sent();
                                    id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
                                    storedName = sanitizeForPath(file.name);
                                    return [4 /*yield*/, blobUpload("waiting-list/".concat(id, "-").concat(storedName), b64)];
                                case 2:
                                    blobOk = _d.sent();
                                    results.push({ name: file.name, ok: blobOk.ok, error: blobOk.error });
                                    if (blobOk.ok) {
                                        items.push({
                                            id: id,
                                            blobUrl: blobOk.url, // Vercel Blob URL — replaces storedName in GitHub
                                            originalName: file.name,
                                            destPath: dest,
                                            uploadedAt: new Date().toISOString(),
                                            size: file.size,
                                            reuploadCount: 0
                                        });
                                    }
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _b.label = 7;
                case 7:
                    if (!(i < total)) return [3 /*break*/, 10];
                    return [5 /*yield**/, _loop_2(i)];
                case 8:
                    _b.sent();
                    _b.label = 9;
                case 9:
                    i++;
                    return [3 /*break*/, 7];
                case 10:
                    _setUploadProgress(total, total);
                    successes = results.filter(function (r) { return r.ok; });
                    failures = results.filter(function (r) { return !r.ok; });
                    if (!successes.length) return [3 /*break*/, 12];
                    return [4 /*yield*/, wlWriteIndex(items, idxSha, "Add pending: ".concat(successes.length, " file(s)"))];
                case 11:
                    idxOk = _b.sent();
                    if (!idxOk.ok)
                        console.warn('Index update failed — admin may need to re-sync.');
                    _b.label = 12;
                case 12:
                    msg = '';
                    if (successes.length)
                        msg += "\u2713 ".concat(successes.length, " file").concat(successes.length > 1 ? 's' : '', " submitted for review.").concat(dest ? " Destination: ".concat(dest, ".") : '');
                    if (failures.length)
                        msg += "".concat(msg ? '\n' : '', "\u2717 ").concat(failures.length, " failed: ").concat(failures.map(function (r) { return r.name; }).join(', '));
                    showUploadResultUI(failures.length === 0, msg.trim());
                    updatePendingBadge();
                    _pendingFiles = [];
                    btn.disabled = false;
                    backBtn.disabled = false;
                    _b.label = 13;
                case 13: return [2 /*return*/];
            }
        });
    });
}
function showUploadResultUI(ok, msg) {
    ['us1', 'us2', 'us3'].forEach(function (id) { var el = document.getElementById(id); if (el)
        el.style.display = 'none'; });
    document.getElementById('usResult').style.display = '';
    document.getElementById('usResultIcon').textContent = ok ? '✅' : '⚠️';
    document.getElementById('usResultTitle').textContent = ok ? 'Done!' : 'Some uploads failed';
    document.getElementById('usResultMsg').style.whiteSpace = 'pre-line';
    document.getElementById('usResultMsg').textContent = msg;
    _pendingFiles = [];
}
// ===== HELPERS =====
function fmtSize(b) {
    if (b < 1024)
        return b + ' B';
    if (b < 1048576)
        return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}
function getIconForFilename(name) {
    var ext = (name || '').split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || FILE_ICONS.default;
}
