// ===== MODERN EMAIL + PASSWORD AUTH SYSTEM =====
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
// Initialize reCAPTCHA and auth system on page load
document.addEventListener('DOMContentLoaded', function () {
    var _a;
    var siteKey = (_a = document.querySelector('meta[name="recaptcha-sitekey"]')) === null || _a === void 0 ? void 0 : _a.content;
    if (siteKey) {
        window.ModernAuthInstance.setRecaptchaKey(siteKey);
    }
    // Check if user is logged in on page load
    updateModernAuthUI();
    restoreModernSession();
});
// ===== CONFIG LOADER =====
// Placeholder for future config needs (currently unused with email-based auth)
function loadWmConfig() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/];
        });
    });
}
// ===== AUTH UI FUNCTIONS =====
function showLoginScreen() {
    var o = document.getElementById('loginOverlay');
    if (window.ModernAuthInstance.isLoggedIn()) {
        document.getElementById('loginView').style.display = 'none';
        document.getElementById('registerView').style.display = 'none';
        document.getElementById('forgotView').style.display = 'none';
        document.getElementById('loggedInView').style.display = '';
        document.getElementById('loggedInEmail').textContent = window.ModernAuthInstance.getEmail();
    }
    else {
        document.getElementById('loginView').style.display = '';
        document.getElementById('registerView').style.display = 'none';
        document.getElementById('forgotView').style.display = 'none';
        document.getElementById('loggedInView').style.display = 'none';
        clearAuthInputs();
    }
    o.style.display = 'flex';
    requestAnimationFrame(function () { return o.classList.add('active'); });
}
function hideLoginScreen() {
    var o = document.getElementById('loginOverlay');
    o.classList.remove('active');
    setTimeout(function () { o.style.display = 'none'; }, 380);
}
function switchAuthTab(tab) {
    var views = ['loginView', 'registerView', 'forgotView', 'loggedInView'];
    views.forEach(function (v) {
        document.getElementById(v).style.display = v === (tab + 'View') ? '' : 'none';
    });
    document.querySelectorAll('#authTabs .guide-tab').forEach(function (btn, i) {
        btn.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
    });
}
function clearAuthInputs() {
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirmPassword').value = '';
    document.getElementById('forgotEmail').value = '';
    setAuthMsg('loginMsg', '', '');
    setAuthMsg('registerMsg', '', '');
    setAuthMsg('forgotMsg', '', '');
}
function setAuthMsg(elementId, text, type) {
    var el = document.getElementById(elementId);
    if (el) {
        el.textContent = text;
        el.className = 'login-msg' + (type ? ' ' + type : '');
    }
}
// ===== LOGIN HANDLER =====
function attemptModernLogin() {
    return __awaiter(this, void 0, void 0, function () {
        var email, password, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    email = document.getElementById('loginEmail').value.trim();
                    password = document.getElementById('loginPassword').value;
                    if (!email || !password) {
                        setAuthMsg('loginMsg', '⚠ Please enter email and password', 'err');
                        return [2 /*return*/];
                    }
                    setAuthMsg('loginMsg', 'Signing in...', '');
                    return [4 /*yield*/, window.ModernAuthInstance.login(email, password)];
                case 1:
                    result = _a.sent();
                    if (result.ok) {
                        setAuthMsg('loginMsg', '✓ Login successful!', 'ok');
                        updateModernAuthUI();
                        setTimeout(function () {
                            clearAuthInputs();
                            showLoginScreen();
                        }, 900);
                    }
                    else {
                        setAuthMsg('loginMsg', '✗ ' + result.error, 'err');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// ===== REGISTER HANDLER =====
function attemptModernRegister() {
    return __awaiter(this, void 0, void 0, function () {
        var email, password, confirmPassword, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    email = document.getElementById('registerEmail').value.trim();
                    password = document.getElementById('registerPassword').value;
                    confirmPassword = document.getElementById('registerConfirmPassword').value;
                    if (!email || !password || !confirmPassword) {
                        setAuthMsg('registerMsg', '⚠ Please fill in all fields', 'err');
                        return [2 /*return*/];
                    }
                    if (password.length < 8) {
                        setAuthMsg('registerMsg', '⚠ Password must be at least 8 characters', 'err');
                        return [2 /*return*/];
                    }
                    if (password !== confirmPassword) {
                        setAuthMsg('registerMsg', '⚠ Passwords do not match', 'err');
                        return [2 /*return*/];
                    }
                    setAuthMsg('registerMsg', 'Creating account...', '');
                    return [4 /*yield*/, window.ModernAuthInstance.register(email, password, confirmPassword)];
                case 1:
                    result = _a.sent();
                    if (result.ok) {
                        setAuthMsg('registerMsg', '✓ Account created! Logging in...', 'ok');
                        updateModernAuthUI();
                        setTimeout(function () {
                            clearAuthInputs();
                            showLoginScreen();
                        }, 900);
                    }
                    else {
                        setAuthMsg('registerMsg', '✗ ' + result.error, 'err');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// ===== FORGOT PASSWORD HANDLER =====
function attemptModernForgotPassword() {
    return __awaiter(this, void 0, void 0, function () {
        var email, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    email = document.getElementById('forgotEmail').value.trim();
                    if (!email) {
                        setAuthMsg('forgotMsg', '⚠ Please enter your email', 'err');
                        return [2 /*return*/];
                    }
                    setAuthMsg('forgotMsg', 'Sending reset link...', '');
                    return [4 /*yield*/, window.ModernAuthInstance.forgotPassword(email)];
                case 1:
                    result = _a.sent();
                    if (result.ok) {
                        setAuthMsg('forgotMsg', '✓ Check your email for the reset link!', 'ok');
                        setTimeout(function () {
                            document.getElementById('forgotEmail').value = '';
                            switchAuthTab('login');
                        }, 2000);
                    }
                    else {
                        setAuthMsg('forgotMsg', '✗ ' + result.error, 'err');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
// ===== LOGOUT HANDLER =====
function attemptModernLogout() {
    window.ModernAuthInstance.logout();
    updateModernAuthUI();
    hideLoginScreen();
}
// ===== UPDATE AUTH UI =====
function showAdminPanel() {
    var overlay = document.getElementById('adminOverlay');
    if (!overlay)
        return;
    overlay.style.display = 'flex';
    requestAnimationFrame(function () { return overlay.classList.add('active'); });
}
function hideAdminPanel() {
    var overlay = document.getElementById('adminOverlay');
    if (!overlay)
        return;
    overlay.classList.remove('active');
    setTimeout(function () { overlay.style.display = 'none'; }, 380);
}
function updateShellSidebar() {
    var nameEl = document.getElementById('sidebarAccountName');
    var metaEl = document.getElementById('sidebarAccountMeta');
    var avatarEl = document.getElementById('sidebarAvatar');
    var loginBtn = document.getElementById('loginBtnToolbar');
    var sidebarLoginBtn = document.getElementById('sidebarLoginBtn');
    var sidebarAdminBtn = document.getElementById('sidebarAdminBtn');
    var adminToolbarBtn = document.getElementById('adminPanelBtn');
    var mobileAdminBtn = document.getElementById('mobOverflowAdminBtn');
    if (!nameEl || !metaEl || !avatarEl)
        return;
    var loggedIn = window.ModernAuthInstance.isLoggedIn();
    var email = window.ModernAuthInstance.getEmail();
    if (loggedIn) {
        nameEl.textContent = email || 'Signed in';
        metaEl.textContent = 'Authenticated and ready';
        avatarEl.textContent = (email || 'U').charAt(0).toUpperCase();
        if (loginBtn) {
            loginBtn.textContent = '👤 Account';
            loginBtn.style.background = 'var(--selected)';
            loginBtn.style.color = 'var(--accent)';
        }
        if (sidebarLoginBtn)
            sidebarLoginBtn.textContent = '👤 Account';
        if (sidebarAdminBtn)
            sidebarAdminBtn.style.display = 'flex';
        if (adminToolbarBtn)
            adminToolbarBtn.style.display = 'flex';
        if (mobileAdminBtn)
            mobileAdminBtn.style.display = 'block';
    }
    else {
        nameEl.textContent = 'Sign in';
        metaEl.textContent = 'Access your workspace';
        avatarEl.textContent = 'U';
        if (loginBtn) {
            loginBtn.textContent = '🔐 Account';
            loginBtn.style.background = '';
            loginBtn.style.color = '';
        }
        if (sidebarLoginBtn)
            sidebarLoginBtn.textContent = '🔐 Login / Account';
        if (sidebarAdminBtn)
            sidebarAdminBtn.style.display = 'none';
        if (adminToolbarBtn)
            adminToolbarBtn.style.display = 'none';
        if (mobileAdminBtn)
            mobileAdminBtn.style.display = 'none';
    }
}
function updateModernAuthUI() {
    var loginBtn = document.getElementById('loginBtnToolbar');
    if (!loginBtn)
        return;
    if (window.ModernAuthInstance.isLoggedIn()) {
        loginBtn.textContent = '👤 ' + window.ModernAuthInstance.getEmail();
        loginBtn.style.background = 'var(--selected)';
        loginBtn.style.color = 'var(--accent)';
    }
    else {
        loginBtn.textContent = '🔐 Login';
        loginBtn.style.background = '';
        loginBtn.style.color = '';
    }
    updateShellSidebar();
}
// ===== RESTORE SESSION =====
function restoreModernSession() {
    // Try to restore from localStorage if available
    if (window.ModernAuthInstance.isLoggedIn()) {
        updateModernAuthUI();
    }
    else {
        updateShellSidebar();
    }
}
// ===== COMPATIBILITY WITH OLD ADMIN SYSTEM =====
// Keep legacy functions but update them to check both auth systems
function isLoggedIn() {
    return window.ModernAuthInstance.isLoggedIn();
}
function isAdmin() {
    // For now, only modern auth users can be admins
    // This can be extended to check a roles database
    return window.ModernAuthInstance.isLoggedIn();
}
function isSuperAdmin() {
    // Super admin logic - can be expanded with database
    return false;
}
function hasPerm(p) {
    // Permission logic can be expanded with roles
    return window.ModernAuthInstance.isLoggedIn();
}
// ===== RECAPTCHA INITIALIZATION =====
// Set reCAPTCHA site key from environment
function initRecaptcha() {
    var _a;
    var siteKey = ((_a = document.querySelector('meta[name="recaptcha-sitekey"]')) === null || _a === void 0 ? void 0 : _a.content) || '6LeI4QgtAAAAAIHR7fZ2uCoPNqNe3LBFLCuCBBZH';
    window.ModernAuthInstance.setRecaptchaKey(siteKey);
}
initRecaptcha();
