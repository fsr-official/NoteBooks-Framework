// ===== MODERN EMAIL + PASSWORD AUTH SYSTEM =====
// v2 — fixed reCAPTCHA key binding, async race guard, and error propagation

class ModernAuth {
  constructor(config = {}) {
    this.token            = null;
    this.email            = null;
    this.isAuthenticated  = false;
    this.apiUrl           = config.apiUrl          || '/api/auth';
    this.recaptchaSiteKey = config.recaptchaSiteKey || null;
    this._loadStoredToken();
  }

  // ─── Token Storage ────────────────────────────────────────────────────────

  _loadStoredToken() {
    try {
      const token = localStorage.getItem('auth_token');
      const email = localStorage.getItem('auth_email');
      if (token && email) {
        this.token           = token;
        this.email           = email;
        this.isAuthenticated = true;
      }
    } catch (e) {
      console.error('[auth] Failed to load stored token:', e);
    }
  }

  _saveToken(token, email) {
    try {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_email', email);
      this.token           = token;
      this.email           = email;
      this.isAuthenticated = true;
    } catch (e) {
      console.error('[auth] Failed to save token:', e);
    }
  }

  _clearToken() {
    try {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_email');
    } catch (e) {
      console.error('[auth] Failed to clear token:', e);
    } finally {
      this.token           = null;
      this.email           = null;
      this.isAuthenticated = false;
    }
  }

  // ─── reCAPTCHA ────────────────────────────────────────────────────────────

  setRecaptchaKey(key) {
    this.recaptchaSiteKey = key;
  }

  /**
   * Returns a reCAPTCHA v3 token, or null if reCAPTCHA is not configured.
   * Rejects if the key is set but grecaptcha fails to produce a token.
   */
  _getCaptchaToken() {
    // No key configured — skip reCAPTCHA entirely (dev / test environments).
    if (!this.recaptchaSiteKey) {
      return Promise.resolve(null);
    }

    // grecaptcha script hasn't loaded yet — fail fast rather than sending null.
    if (!window.grecaptcha) {
      return Promise.reject(new Error('reCAPTCHA has not loaded yet. Please wait and try again.'));
    }

    return new Promise((resolve, reject) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(this.recaptchaSiteKey, { action: 'submit' })
          .then(resolve)
          .catch(() => reject(new Error('reCAPTCHA challenge failed. Please refresh and try again.')));
      });
    });
  }

  // ─── HTTP Helper ──────────────────────────────────────────────────────────

  async _post(action, body) {
    const response = await fetch(`${this.apiUrl}?action=${action}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    let data;
    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      data = await response.json();
    } else {
      const text = await response.text();
      data = { error: `Server error (${response.status}) — check Vercel logs` };
      console.error('[auth] Non-JSON response body:', text.substring(0, 300));
    }

    if (!response.ok) {
      return { ok: false, error: data.error || `Request failed (${response.status})` };
    }

    return { ok: true, data };
  }

  // ─── Auth Methods ─────────────────────────────────────────────────────────

  async register(email, password, confirmPassword) {
    try {
      const captchaToken = await this._getCaptchaToken();
      const result = await this._post('register', { email, password, confirmPassword, captchaToken });

      if (result.ok) {
        this._saveToken(result.data.token, result.data.email);
      }

      return result;
    } catch (error) {
      console.error('[auth] Registration error:', error);
      return { ok: false, error: error.message };
    }
  }

  async login(email, password) {
    try {
      const captchaToken = await this._getCaptchaToken();
      const result = await this._post('login', { email, password, captchaToken });

      if (result.ok) {
        this._saveToken(result.data.token, result.data.email);
      }

      return result;
    } catch (error) {
      console.error('[auth] Login error:', error);
      return { ok: false, error: error.message };
    }
  }

  async forgotPassword(email) {
    try {
      const captchaToken = await this._getCaptchaToken();
      return await this._post('forgot-password', { email, captchaToken });
    } catch (error) {
      console.error('[auth] Forgot-password error:', error);
      return { ok: false, error: error.message };
    }
  }

  async resetPassword(token, newPassword, confirmPassword) {
    try {
      const captchaToken = await this._getCaptchaToken();
      return await this._post('reset-password', { token, newPassword, confirmPassword, captchaToken });
    } catch (error) {
      console.error('[auth] Reset-password error:', error);
      return { ok: false, error: error.message };
    }
  }

  logout() {
    this._clearToken();
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getToken()    { return this.token; }
  getEmail()    { return this.email; }
  isLoggedIn()  { return this.isAuthenticated && !!this.token; }
}

// ─── Global Instance ─────────────────────────────────────────────────────────

const ModernAuthInstance = new ModernAuth({
  apiUrl:           '/api/auth',
  recaptchaSiteKey: '6LeI4QgtAAAAAIHR7fZ2uCoPNqNe3LBFLCuCBBZH', // ← paste your key here
});

window.ModernAuthInstance = ModernAuthInstance;