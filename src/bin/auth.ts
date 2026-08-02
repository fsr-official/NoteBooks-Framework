// ===== MODERN EMAIL + PASSWORD AUTH SYSTEM =====

// Initialize reCAPTCHA and auth system on page load
document.addEventListener('DOMContentLoaded', function() {
  const siteKey = document.querySelector('meta[name="recaptcha-sitekey"]')?.content;
  if (siteKey) {
    window.ModernAuthInstance.setRecaptchaKey(siteKey);
  }
  
  // Check if user is logged in on page load
  updateModernAuthUI();
  restoreModernSession();
});

// ===== CONFIG LOADER =====
// Placeholder for future config needs (currently unused with email-based auth)
async function loadWmConfig() {
  // Config loading handled by ModernAuthInstance
  // This function is kept for backward compatibility
}

// ===== AUTH UI FUNCTIONS =====

function showLoginScreen() {
  const o = document.getElementById('loginOverlay');
  if (window.ModernAuthInstance.isLoggedIn()) {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('registerView').style.display = 'none';
    document.getElementById('forgotView').style.display = 'none';
    document.getElementById('loggedInView').style.display = '';
    document.getElementById('loggedInEmail').textContent = window.ModernAuthInstance.getEmail();
  } else {
    document.getElementById('loginView').style.display = '';
    document.getElementById('registerView').style.display = 'none';
    document.getElementById('forgotView').style.display = 'none';
    document.getElementById('loggedInView').style.display = 'none';
    clearAuthInputs();
  }
  o.style.display = 'flex';
  requestAnimationFrame(() => o.classList.add('active'));
}

function hideLoginScreen() {
  const o = document.getElementById('loginOverlay');
  o.classList.remove('active');
  setTimeout(() => { o.style.display = 'none'; }, 380);
}

function switchAuthTab(tab) {
  const views = ['loginView', 'registerView', 'forgotView', 'loggedInView'];
  views.forEach(v => {
    document.getElementById(v).style.display = v === (tab + 'View') ? '' : 'none';
  });
  
  document.querySelectorAll('#authTabs .guide-tab').forEach((btn, i) => {
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
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = text;
    el.className = 'login-msg' + (type ? ' ' + type : '');
  }
}

// ===== LOGIN HANDLER =====

async function attemptModernLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    setAuthMsg('loginMsg', '⚠ Please enter email and password', 'err');
    return;
  }

  setAuthMsg('loginMsg', 'Signing in...', '');
  
  const result = await window.ModernAuthInstance.login(email, password);
  
  if (result.ok) {
    setAuthMsg('loginMsg', '✓ Login successful!', 'ok');
    updateModernAuthUI();
    setTimeout(() => {
      clearAuthInputs();
      showLoginScreen();
    }, 900);
  } else {
    setAuthMsg('loginMsg', '✗ ' + result.error, 'err');
  }
}

// ===== REGISTER HANDLER =====

async function attemptModernRegister() {
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const confirmPassword = document.getElementById('registerConfirmPassword').value;

  if (!email || !password || !confirmPassword) {
    setAuthMsg('registerMsg', '⚠ Please fill in all fields', 'err');
    return;
  }

  if (password.length < 8) {
    setAuthMsg('registerMsg', '⚠ Password must be at least 8 characters', 'err');
    return;
  }

  if (password !== confirmPassword) {
    setAuthMsg('registerMsg', '⚠ Passwords do not match', 'err');
    return;
  }

  setAuthMsg('registerMsg', 'Creating account...', '');
  
  const result = await window.ModernAuthInstance.register(email, password, confirmPassword);
  
  if (result.ok) {
    setAuthMsg('registerMsg', '✓ Account created! Logging in...', 'ok');
    updateModernAuthUI();
    setTimeout(() => {
      clearAuthInputs();
      showLoginScreen();
    }, 900);
  } else {
    setAuthMsg('registerMsg', '✗ ' + result.error, 'err');
  }
}

// ===== FORGOT PASSWORD HANDLER =====

async function attemptModernForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();

  if (!email) {
    setAuthMsg('forgotMsg', '⚠ Please enter your email', 'err');
    return;
  }

  setAuthMsg('forgotMsg', 'Sending reset link...', '');
  
  const result = await window.ModernAuthInstance.forgotPassword(email);
  
  if (result.ok) {
    setAuthMsg('forgotMsg', '✓ Check your email for the reset link!', 'ok');
    setTimeout(() => {
      document.getElementById('forgotEmail').value = '';
      switchAuthTab('login');
    }, 2000);
  } else {
    setAuthMsg('forgotMsg', '✗ ' + result.error, 'err');
  }
}

// ===== LOGOUT HANDLER =====

function attemptModernLogout() {
  window.ModernAuthInstance.logout();
  updateModernAuthUI();
  hideLoginScreen();
}

// ===== UPDATE AUTH UI =====

function showAdminPanel() {
  const overlay = document.getElementById('adminOverlay');
  if (!overlay) return;
  overlay.style.display = 'flex';
  requestAnimationFrame(() => overlay.classList.add('active'));
}

function hideAdminPanel() {
  const overlay = document.getElementById('adminOverlay');
  if (!overlay) return;
  overlay.classList.remove('active');
  setTimeout(() => { overlay.style.display = 'none'; }, 380);
}

function updateShellSidebar() {
  const nameEl = document.getElementById('sidebarAccountName');
  const metaEl = document.getElementById('sidebarAccountMeta');
  const avatarEl = document.getElementById('sidebarAvatar');
  const loginBtn = document.getElementById('loginBtnToolbar');
  const sidebarLoginBtn = document.getElementById('sidebarLoginBtn');
  const sidebarAdminBtn = document.getElementById('sidebarAdminBtn');
  const adminToolbarBtn = document.getElementById('adminPanelBtn');
  const mobileAdminBtn = document.getElementById('mobOverflowAdminBtn');

  if (!nameEl || !metaEl || !avatarEl) return;

  const loggedIn = window.ModernAuthInstance.isLoggedIn();
  const email = window.ModernAuthInstance.getEmail();

  if (loggedIn) {
    nameEl.textContent = email || 'Signed in';
    metaEl.textContent = 'Authenticated and ready';
    avatarEl.textContent = (email || 'U').charAt(0).toUpperCase();
    if (loginBtn) {
      loginBtn.textContent = '👤 Account';
      loginBtn.style.background = 'var(--selected)';
      loginBtn.style.color = 'var(--accent)';
    }
    if (sidebarLoginBtn) sidebarLoginBtn.textContent = '👤 Account';
    if (sidebarAdminBtn) sidebarAdminBtn.style.display = 'flex';
    if (adminToolbarBtn) adminToolbarBtn.style.display = 'flex';
    if (mobileAdminBtn) mobileAdminBtn.style.display = 'block';
  } else {
    nameEl.textContent = 'Sign in';
    metaEl.textContent = 'Access your workspace';
    avatarEl.textContent = 'U';
    if (loginBtn) {
      loginBtn.textContent = '🔐 Account';
      loginBtn.style.background = '';
      loginBtn.style.color = '';
    }
    if (sidebarLoginBtn) sidebarLoginBtn.textContent = '🔐 Login / Account';
    if (sidebarAdminBtn) sidebarAdminBtn.style.display = 'none';
    if (adminToolbarBtn) adminToolbarBtn.style.display = 'none';
    if (mobileAdminBtn) mobileAdminBtn.style.display = 'none';
  }
}

function updateModernAuthUI() {
  const loginBtn = document.getElementById('loginBtnToolbar');
  if (!loginBtn) return;

  if (window.ModernAuthInstance.isLoggedIn()) {
    loginBtn.textContent = '👤 ' + window.ModernAuthInstance.getEmail();
    loginBtn.style.background = 'var(--selected)';
    loginBtn.style.color = 'var(--accent)';
  } else {
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
  } else {
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
  const siteKey = document.querySelector('meta[name="recaptcha-sitekey"]')?.content || '6LeI4QgtAAAAAIHR7fZ2uCoPNqNe3LBFLCuCBBZH';
  window.ModernAuthInstance.setRecaptchaKey(siteKey);
}

initRecaptcha();
