// ===== MODERN EMAIL + PASSWORD AUTH SYSTEM =====
// v2 — fixed reCAPTCHA key binding, async race guard, and error propagation
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
var ModernAuth = /** @class */ (function () {
    function ModernAuth(config) {
        if (config === void 0) { config = {}; }
        this.token = null;
        this.email = null;
        this.isAuthenticated = false;
        this.apiUrl = config.apiUrl || '/api/auth';
        this.recaptchaSiteKey = config.recaptchaSiteKey || null;
        this._loadStoredToken();
    }
    // ─── Token Storage ────────────────────────────────────────────────────────
    ModernAuth.prototype._loadStoredToken = function () {
        try {
            var token = localStorage.getItem('auth_token');
            var email = localStorage.getItem('auth_email');
            if (token && email) {
                this.token = token;
                this.email = email;
                this.isAuthenticated = true;
            }
        }
        catch (e) {
            console.error('[auth] Failed to load stored token:', e);
        }
    };
    ModernAuth.prototype._saveToken = function (token, email) {
        try {
            localStorage.setItem('auth_token', token);
            localStorage.setItem('auth_email', email);
            this.token = token;
            this.email = email;
            this.isAuthenticated = true;
        }
        catch (e) {
            console.error('[auth] Failed to save token:', e);
        }
    };
    ModernAuth.prototype._clearToken = function () {
        try {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('auth_email');
        }
        catch (e) {
            console.error('[auth] Failed to clear token:', e);
        }
        finally {
            this.token = null;
            this.email = null;
            this.isAuthenticated = false;
        }
    };
    // ─── reCAPTCHA ────────────────────────────────────────────────────────────
    ModernAuth.prototype.setRecaptchaKey = function (key) {
        this.recaptchaSiteKey = key;
    };
    /**
     * Returns a reCAPTCHA v3 token, or null if reCAPTCHA is not configured.
     * Rejects if the key is set but grecaptcha fails to produce a token.
     */
    ModernAuth.prototype._getCaptchaToken = function () {
        var _this = this;
        // No key configured — skip reCAPTCHA entirely (dev / test environments).
        if (!this.recaptchaSiteKey) {
            return Promise.resolve(null);
        }
        // grecaptcha script hasn't loaded yet — fail fast rather than sending null.
        if (!window.grecaptcha) {
            return Promise.reject(new Error('reCAPTCHA has not loaded yet. Please wait and try again.'));
        }
        return new Promise(function (resolve, reject) {
            window.grecaptcha.ready(function () {
                window.grecaptcha
                    .execute(_this.recaptchaSiteKey, { action: 'submit' })
                    .then(resolve)
                    .catch(function () { return reject(new Error('reCAPTCHA challenge failed. Please refresh and try again.')); });
            });
        });
    };
    // ─── HTTP Helper ──────────────────────────────────────────────────────────
    ModernAuth.prototype._post = function (action, body) {
        return __awaiter(this, void 0, void 0, function () {
            var response, data, ct, text;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fetch("".concat(this.apiUrl, "?action=").concat(action), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body),
                        })];
                    case 1:
                        response = _a.sent();
                        ct = response.headers.get('content-type') || '';
                        if (!ct.includes('application/json')) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = _a.sent();
                        return [3 /*break*/, 5];
                    case 3: return [4 /*yield*/, response.text()];
                    case 4:
                        text = _a.sent();
                        data = { error: "Server error (".concat(response.status, ") \u2014 check Vercel logs") };
                        console.error('[auth] Non-JSON response body:', text.substring(0, 300));
                        _a.label = 5;
                    case 5:
                        if (!response.ok) {
                            return [2 /*return*/, { ok: false, error: data.error || "Request failed (".concat(response.status, ")") }];
                        }
                        return [2 /*return*/, { ok: true, data: data }];
                }
            });
        });
    };
    // ─── Auth Methods ─────────────────────────────────────────────────────────
    ModernAuth.prototype.register = function (email, password, confirmPassword) {
        return __awaiter(this, void 0, void 0, function () {
            var captchaToken, result, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this._getCaptchaToken()];
                    case 1:
                        captchaToken = _a.sent();
                        return [4 /*yield*/, this._post('register', { email: email, password: password, confirmPassword: confirmPassword, captchaToken: captchaToken })];
                    case 2:
                        result = _a.sent();
                        if (result.ok) {
                            this._saveToken(result.data.token, result.data.email);
                        }
                        return [2 /*return*/, result];
                    case 3:
                        error_1 = _a.sent();
                        console.error('[auth] Registration error:', error_1);
                        return [2 /*return*/, { ok: false, error: error_1.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ModernAuth.prototype.login = function (email, password) {
        return __awaiter(this, void 0, void 0, function () {
            var captchaToken, result, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this._getCaptchaToken()];
                    case 1:
                        captchaToken = _a.sent();
                        return [4 /*yield*/, this._post('login', { email: email, password: password, captchaToken: captchaToken })];
                    case 2:
                        result = _a.sent();
                        if (result.ok) {
                            this._saveToken(result.data.token, result.data.email);
                        }
                        return [2 /*return*/, result];
                    case 3:
                        error_2 = _a.sent();
                        console.error('[auth] Login error:', error_2);
                        return [2 /*return*/, { ok: false, error: error_2.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ModernAuth.prototype.forgotPassword = function (email) {
        return __awaiter(this, void 0, void 0, function () {
            var captchaToken, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this._getCaptchaToken()];
                    case 1:
                        captchaToken = _a.sent();
                        return [4 /*yield*/, this._post('forgot-password', { email: email, captchaToken: captchaToken })];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_3 = _a.sent();
                        console.error('[auth] Forgot-password error:', error_3);
                        return [2 /*return*/, { ok: false, error: error_3.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ModernAuth.prototype.resetPassword = function (token, newPassword, confirmPassword) {
        return __awaiter(this, void 0, void 0, function () {
            var captchaToken, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this._getCaptchaToken()];
                    case 1:
                        captchaToken = _a.sent();
                        return [4 /*yield*/, this._post('reset-password', { token: token, newPassword: newPassword, confirmPassword: confirmPassword, captchaToken: captchaToken })];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3:
                        error_4 = _a.sent();
                        console.error('[auth] Reset-password error:', error_4);
                        return [2 /*return*/, { ok: false, error: error_4.message }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ModernAuth.prototype.logout = function () {
        this._clearToken();
    };
    // ─── Accessors ────────────────────────────────────────────────────────────
    ModernAuth.prototype.getToken = function () { return this.token; };
    ModernAuth.prototype.getEmail = function () { return this.email; };
    ModernAuth.prototype.isLoggedIn = function () { return this.isAuthenticated && !!this.token; };
    return ModernAuth;
}());
// ─── Global Instance ─────────────────────────────────────────────────────────
var ModernAuthInstance = new ModernAuth({
    apiUrl: '/api/auth',
    recaptchaSiteKey: '6LeI4QgtAAAAAIHR7fZ2uCoPNqNe3LBFLCuCBBZH', // ← paste your key here
});
window.ModernAuthInstance = ModernAuthInstance;
