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
/**
   * Render raw Markdown to an HTML string.
   * The caller must insert the HTML into the DOM, then call
   * initMarkdownFeatures(containerEl) to activate MathJax / TikZJax / Mermaid / hljs / folds.
   * @param {string}  rawText   – Markdown source (may include YAML front-matter)
   * @param {string}  [filePath] – source file path; used to resolve ![[embed]] URLs
   */
function markdownToHTML(rawText, filePath) {
    /* Expose current file path so resolveEmbed can build correct relative URLs */
    window._currentNotePath = filePath || '';
    /* Strip YAML front-matter before rendering */
    var parsed = window.obsidianParseFrontmatter(rawText);
    /* Render via markdown-it + Obsidian plugin */
    return window.md.render(parsed.content);
}
/**
 * Activate all post-render Obsidian features scoped to a specific DOM element.
 * Must be called AFTER the rendered HTML has been inserted into the DOM.
 * @param {Element} container – the wrapper element that received the HTML
 */
function initMarkdownFeatures(container) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (typeof window.obsidianInitCalloutFolds === 'function') {
                        window.obsidianInitCalloutFolds(container);
                    }
                    /* TikZ MUST run before MathJax — obsidianInitMath processes the entire
                       container including hidden .tikz-source divs. MathJax corrupts their
                       textContent by replacing egin{tikzpicture} with error messages.
                       Running TikZ first moves the source into <script> elements that
                       MathJax skips entirely.                                               */
                    if (typeof window.obsidianInitTikz === 'function') {
                        window.obsidianInitTikz(container);
                    }
                    if (!(typeof window.obsidianInitMath === 'function')) return [3 /*break*/, 2];
                    return [4 /*yield*/, window.obsidianInitMath(container)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    if (typeof window.obsidianInitMermaid === 'function') {
                        window.obsidianInitMermaid(container);
                    }
                    if (typeof window.obsidianInitDesmos === 'function') {
                        window.obsidianInitDesmos(container);
                    }
                    if (typeof window.obsidianInitDesmos3D === 'function') {
                        window.obsidianInitDesmos3D(container);
                    }
                    if (typeof window.obsidianInitHighlight === 'function') {
                        window.obsidianInitHighlight(container);
                    }
                    return [2 /*return*/];
            }
        });
    });
}
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
                    if (!response.ok || !data.sha) {
                        throw new Error(data.error || 'Failed to fetch latest commit');
                    }
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
                        if (notice && notice.style.display !== "flex") {
                            notice.style.display = "flex";
                        }
                    }
                    return [2 /*return*/];
            }
        });
    });
}
