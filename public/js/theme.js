/* NoteBooks theme runtime. Theme families expose both dark and light variants. */
const THEME_KEY = 'notebooks-theme-global';
const THEME_FAMILY_KEY = 'notebooks-theme-family';
const THEME_MODE_KEY = 'notebooks-theme-mode';
const THEME_COOKIE = 'notebooks-theme';
const THEME_PRESETS = {
    futuristic: { dark: { accent: '#34d399', surface: '#050c14', text: '#dbe7e5', code: '#010307', font: 'Inter', bg: '#02050a', panel: '#07111b', border: '#112a3b', radius: '14px', density: '1', shadow: '0 18px 55px rgba(0,0,0,.38)', texture: 'grid', heading: 'Inter' }, light: { accent: '#047857', surface: '#f4faf8', text: '#102a24', code: '#e7f3ef', font: 'Inter', bg: '#f8fcfb', panel: '#ffffff', border: '#b8d8cc', radius: '14px', density: '1', shadow: '0 14px 38px rgba(16,42,36,.12)', texture: 'none', heading: 'Inter' } },
    contrast: { dark: { accent: '#f8fafc', surface: '#050505', text: '#ffffff', code: '#000000', font: 'system-ui', bg: '#000000', panel: '#0a0a0a', border: '#5b5b5b', radius: '2px', density: '.92', shadow: '0 0 0 transparent', texture: 'none', heading: 'system-ui' }, light: { accent: '#000000', surface: '#ffffff', text: '#000000', code: '#f5f5f5', font: 'system-ui', bg: '#ffffff', panel: '#ffffff', border: '#000000', radius: '2px', density: '.92', shadow: '0 0 0 transparent', texture: 'none', heading: 'system-ui' } },
    neon: { dark: { accent: '#f472b6', surface: '#17112d', text: '#fdf4ff', code: '#0b0618', font: 'JetBrains Mono', bg: '#0b0618', panel: '#21143b', border: '#8b5cf6', radius: '22px', density: '1.12', shadow: '0 0 28px rgba(244,114,182,.24)', texture: 'scanlines', heading: 'JetBrains Mono' }, light: { accent: '#a21caf', surface: '#fff7ff', text: '#29132f', code: '#f8eafa', font: 'JetBrains Mono', bg: '#fffaff', panel: '#ffffff', border: '#d8a8e6', radius: '22px', density: '1.12', shadow: '0 12px 30px rgba(162,28,175,.14)', texture: 'none', heading: 'JetBrains Mono' } },
    professional: { dark: { accent: '#60a5fa', surface: '#172033', text: '#e5edf8', code: '#0d1524', font: 'Inter', bg: '#111827', panel: '#1f2937', border: '#334155', radius: '8px', density: '.98', shadow: '0 10px 28px rgba(0,0,0,.2)', texture: 'none', heading: 'Inter' }, light: { accent: '#1d4ed8', surface: '#f1f5fb', text: '#162033', code: '#eaf0f8', font: 'Inter', bg: '#f7faff', panel: '#ffffff', border: '#b9c9df', radius: '8px', density: '.98', shadow: '0 10px 28px rgba(31,41,55,.12)', texture: 'none', heading: 'Inter' } },
    classic: { dark: { accent: '#79c0ff', surface: '#262b32', surfaceStrong: '#30363d', surfaceMuted: '#20252b', inputBg: '#1d2228', cardBg: '#2b3138', cardHover: '#343b44', link: '#79c0ff', focus: '#58a6ff', accentSubtle: 'rgba(88,166,255,.16)', text: '#e6edf3', textMuted: '#aab4c0', code: '#161b22', codeText: '#e6edf3', overlay: 'rgba(13,17,23,.82)', font: 'system-ui', bg: '#1b1f24', panel: '#2b3138', border: '#4b5563', borderSubtle: 'rgba(139,148,158,.35)', radius: '6px', density: '.94', shadow: '0 8px 24px rgba(0,0,0,.28)', texture: 'none', heading: 'system-ui' }, light: { accent: '#0969da', surface: '#ffffff', text: '#1f2328', code: '#f6f8fa', font: 'system-ui', bg: '#f6f8fa', panel: '#ffffff', border: '#d0d7de', radius: '6px', density: '.94', shadow: '0 1px 2px rgba(31,35,40,.08)', texture: 'none', heading: 'system-ui' } }
};
let themeMode = 'dark';
let THEME_CATALOG = Object.entries(THEME_PRESETS).map(([slug, variants]) => ({ slug, name: slug, description: '', tokens: variants.dark, variants, source: 'built-in' }));
function themeControls(id) { return Array.from(document.querySelectorAll(`#${id}, #${id}Rail`)); }
function getCookie(name) { const m = document.cookie.match('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)'); return m ? decodeURIComponent(m[1]) : null; }
function setCookie(name, value, days = 365) { const d = new Date(); d.setTime(d.getTime() + days * 86400000); document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax; expires=${d.toUTCString()}`; }
function readSavedTheme() { try { const local = localStorage.getItem(THEME_KEY); if (local) return JSON.parse(local); } catch (_) { } try { const cookie = getCookie(THEME_COOKIE); if (cookie) return JSON.parse(cookie); } catch (_) { } return null; }
function savedFamily() { try { return localStorage.getItem(THEME_FAMILY_KEY) || 'futuristic'; } catch (_) { return 'futuristic'; } }
function savedMode() { try { return localStorage.getItem(THEME_MODE_KEY) === 'light' ? 'light' : 'dark'; } catch (_) { return 'dark'; } }
function findCatalogTheme(slug) { return THEME_CATALOG.find((theme) => theme.slug === slug) || null; }
function tokensFor(theme, mode = themeMode) { return theme?.variants?.[mode] || theme?.variants?.dark || theme?.tokens || theme || {}; }
function setThemeStatus(message) { const status = document.getElementById('themePersistenceStatus'); if (status) status.textContent = message; }
function syncThemeModeControl() {
    const toggle = document.getElementById('themeModeToggle');
    const label = document.getElementById('themeModeLabel');
    if (toggle) { toggle.setAttribute('aria-pressed', String(themeMode === 'light')); toggle.dataset.mode = themeMode; }
    if (label) label.textContent = themeMode === 'light' ? 'Light mode' : 'Dark mode';
}
function syncThemeSelection(slug) {
    themeControls('themePreset').forEach((el) => { el.value = slug; });
    document.querySelectorAll('[data-theme-preset]').forEach((el) => {
        const active = el.getAttribute('data-theme-preset') === slug;
        el.classList.toggle('is-active', active);
        el.setAttribute('aria-pressed', String(active));
    });
}
function renderThemePresetGallery() {
    const gallery = document.getElementById('themePresetGallery');
    if (!gallery) return;
    gallery.replaceChildren();
    THEME_CATALOG.forEach((theme) => {
        const tokens = tokensFor(theme);
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'theme-preset-tile'; button.setAttribute('data-theme-preset', theme.slug); button.setAttribute('aria-pressed', 'false'); button.setAttribute('aria-label', `Use ${theme.name || theme.slug} theme in ${themeMode} mode`);
        const swatch = document.createElement('span'); swatch.className = 'theme-preset-swatch'; swatch.style.setProperty('--preview-bg', tokens.bg || '#02050a'); swatch.style.setProperty('--preview-panel', tokens.panel || tokens.surface || '#07111b'); swatch.style.setProperty('--preview-accent', tokens.accent || '#34d399');
        const copy = document.createElement('span'); copy.className = 'theme-preset-copy'; const name = document.createElement('strong'); name.textContent = theme.name || theme.slug; const description = document.createElement('small'); description.textContent = `${themeMode} · ${theme.description || 'Reading-room preset'}`; copy.append(name, description); button.append(swatch, copy); button.addEventListener('click', () => applyThemePreset(theme.slug)); gallery.append(button);
    });
    syncThemeSelection(document.querySelector('#themePreset')?.value || savedFamily());
}
function applyTheme(theme, options = {}) {
    const root = document.documentElement;
    const fallback = THEME_PRESETS.futuristic[themeMode];
    const values = { ...fallback, ...theme };
    root.dataset.theme = themeMode;
    root.dataset.themeMode = themeMode;
    root.dataset.themeTexture = values.texture || 'none';
    root.classList.toggle('theme-light', themeMode === 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', values.bg);
    const tokenValues = {
        '--accent': values.accent,
        '--accent-hover': values.accentHover || values.accent,
        '--accent-subtle': values.accentSubtle || `color-mix(in srgb, ${values.accent} 14%, transparent)`,
        '--item': values.surface,
        '--surface': values.surface || values.bg,
        '--panel': values.panel || values.surface,
        '--surface-strong': values.surfaceStrong || values.panel || values.surface,
        '--surface-muted': values.surfaceMuted || `color-mix(in srgb, ${values.surface} 86%, ${values.bg})`,
        '--input-bg': values.inputBg || values.surfaceMuted || `color-mix(in srgb, ${values.surface} 86%, ${values.bg})`,
        '--card-bg': values.cardBg || values.panel || values.surface,
        '--card-hover': values.cardHover || values.hover || values.surface,
        '--fg': values.text,
        '--text-muted': values.textMuted || `color-mix(in srgb, ${values.text} 64%, transparent)`,
        '--code-bg': values.code,
        '--code-fg': values.codeText || values.text,
        '--bg': values.bg,
        '--hover': values.hover || values.surface,
        '--selected': values.selected || `color-mix(in srgb, ${values.accent} 18%, transparent)`,
        '--btn-bg': values.btnBg || values.panel,
        '--btn-hover': values.btnHover || values.surface,
        '--link': values.link || values.accent,
        '--focus': values.focus || values.accent,
        '--overlay': values.overlay || `color-mix(in srgb, ${values.bg} 78%, transparent)`,
        '--border': values.border,
        '--border-subtle': values.borderSubtle || `color-mix(in srgb, ${values.border} 48%, transparent)`,
        '--danger': values.danger || '#ef4444',
        '--success': values.success || '#22c55e',
        '--warning': values.warning || '#f59e0b',
        '--radius': values.radius,
        '--density': values.density,
        '--shadow': values.shadow,
        '--font-sans': values.font + ', Inter, sans-serif',
        '--font-heading': values.heading + ', sans-serif'
    };
    Object.entries(tokenValues).forEach(([key, value]) => root.style.setProperty(key, value));
    [['themeAccent', values.accent], ['themeSurface', values.surface], ['themeText', values.text], ['themeCode', values.code]].forEach(([id, value]) => themeControls(id).forEach((el) => { el.value = value; })); themeControls('themeFont').forEach((el) => { el.value = values.font; });
    const selected = THEME_CATALOG.find((candidate) => JSON.stringify(tokensFor(candidate)) === JSON.stringify(values)); syncThemeSelection(selected?.slug || (theme === readSavedTheme() ? 'custom' : 'custom')); syncThemeModeControl();
    if (!options.skipPersist) { try { localStorage.setItem(THEME_KEY, JSON.stringify(values)); localStorage.setItem(THEME_MODE_KEY, themeMode); } catch (_) { } try { setCookie(THEME_COOKIE, JSON.stringify(values), 365); } catch (_) { } }
}
async function persistThemeSelection(slug) { try { localStorage.setItem(THEME_FAMILY_KEY, slug); } catch (_) { } try { const response = await (window.noteBooksRequest || fetch)('/api/themes/select', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ slug, mode: themeMode }) }); setThemeStatus(response.ok ? `${themeMode === 'light' ? 'Light' : 'Dark'} mode saved to this browser session.` : 'Theme applied locally; session persistence is unavailable.'); } catch (_) { setThemeStatus('Theme applied locally; session persistence is unavailable.'); } }
async function persistCustomTheme(theme) { try { const response = await (window.noteBooksRequest || fetch)('/api/theme', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ theme, mode: themeMode }) }); setThemeStatus(response.ok ? 'Custom theme saved to this browser session.' : 'Custom theme applied locally; session persistence is unavailable.'); } catch (_) { setThemeStatus('Custom theme applied locally; session persistence is unavailable.'); } }
async function persistThemeMode() { try { localStorage.setItem(THEME_MODE_KEY, themeMode); } catch (_) { } const family = document.querySelector('#themePreset')?.value || savedFamily(); if (family && family !== 'custom') return persistThemeSelection(family); try { const response = await (window.noteBooksRequest || fetch)('/api/session', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ themeMode }) }); setThemeStatus(response.ok ? `${themeMode === 'light' ? 'Light' : 'Dark'} mode saved to this browser session.` : 'Mode applied locally; session persistence is unavailable.'); } catch (_) { setThemeStatus('Mode applied locally; session persistence is unavailable.'); } }
async function setThemeMode(mode) { themeMode = mode === 'light' ? 'light' : 'dark'; const family = document.querySelector('#themePreset')?.value || savedFamily(); const preset = findCatalogTheme(family); if (preset) applyTheme(tokensFor(preset), { skipPersist: false }); else applyTheme(readSavedTheme() || THEME_PRESETS.futuristic[themeMode], { skipPersist: false }); renderThemePresetGallery(); await persistThemeMode(); }
function toggleThemeMode() { return setThemeMode(themeMode === 'dark' ? 'light' : 'dark'); }
async function loadThemeCatalog() { try { const request = window.noteBooksRequestJson; const data = request ? await request('/api/themes', { credentials: 'same-origin', headers: { Accept: 'application/json' } }, 1800) : await (window.noteBooksRequest || fetch)('/api/themes', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then((response) => response.ok ? response.json() : null); if (!data) return; if (Array.isArray(data.themes) && data.themes.length) THEME_CATALOG = data.themes; setThemeStatus('Theme catalog ready.'); themeControls('themePreset').forEach((select) => { const current = select.value || savedFamily(); select.innerHTML = THEME_CATALOG.map((theme) => `<option value="${String(theme.slug).replace(/"/g, '&quot;')}">${String(theme.name || theme.slug).replace(/</g, '&lt;')}</option>`).join('') + '<option value="custom">Custom theme</option>'; select.value = current; }); renderThemePresetGallery(); } catch (_) { } }
async function bootstrapThemeState() { themeMode = savedMode(); syncThemeModeControl(); restoreTheme(); const catalogPromise = loadThemeCatalog(); const sessionPromise = typeof window.noteBooksSession === 'function' ? window.noteBooksSession() : (window.noteBooksRequest || fetch)('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then((response) => response.ok ? response.json() : { session: {}, persisted: false }).catch(() => ({ session: {}, persisted: false })); await catalogPromise; try { const data = await sessionPromise; const session = data.session || {}; const hasServerTheme = Boolean(session.selectedThemeSlug || (session.customTheme && Object.keys(session.customTheme).length)); if (hasServerTheme && (session.themeMode === 'light' || session.themeMode === 'dark')) themeMode = session.themeMode; syncThemeModeControl(); const selected = session.selectedThemeSlug && findCatalogTheme(session.selectedThemeSlug); if (selected) { try { localStorage.setItem(THEME_FAMILY_KEY, selected.slug); } catch (_) { } applyTheme(tokensFor(selected), { skipPersist: true }); setThemeStatus(session.persisted ? `Using saved ${themeMode} mode.` : `Using local ${themeMode} mode.`); return; } if (session.customTheme && Object.keys(session.customTheme).length) { try { localStorage.setItem(THEME_FAMILY_KEY, 'custom'); } catch (_) { } applyTheme(session.customTheme, { skipPersist: true }); setThemeStatus(session.persisted ? `Using saved custom ${themeMode} theme.` : `Using local custom ${themeMode} theme.`); return; } } catch (_) { } restoreTheme(); }
function applyThemePreset(name) { if (name === 'custom') { restoreTheme(); syncThemeSelection('custom'); return; } const preset = findCatalogTheme(name) || { slug: name, variants: THEME_PRESETS[name] }; if (!preset?.variants && !preset?.tokens) return; try { localStorage.setItem(THEME_FAMILY_KEY, name); } catch (_) { } applyTheme(tokensFor(preset), { skipPersist: false }); renderThemePresetGallery(); persistThemeSelection(name); }
function updateCustomTheme(key, value) { const next = { ...(readSavedTheme() || {}), [key]: value }; try { localStorage.setItem(THEME_FAMILY_KEY, 'custom'); } catch (_) { } applyTheme(next); syncThemeSelection('custom'); persistCustomTheme(next); }
function restoreTheme() { const family = savedFamily(); const preset = findCatalogTheme(family); const theme = family === 'custom' ? (readSavedTheme() || THEME_PRESETS.futuristic[themeMode]) : tokensFor(preset || { variants: THEME_PRESETS.futuristic }); applyTheme(theme, { skipPersist: true }); syncThemeModeControl(); }
window.addEventListener('storage', (event) => { if (event.key === THEME_KEY && event.newValue) applyTheme(JSON.parse(event.newValue), { skipPersist: true }); if (event.key === THEME_MODE_KEY) setThemeMode(event.newValue === 'light' ? 'light' : 'dark'); });
window.loadThemeCatalog = loadThemeCatalog; window.toggleThemeMode = toggleThemeMode; window.setThemeMode = setThemeMode;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', renderThemePresetGallery, { once: true }); else renderThemePresetGallery();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapThemeState, { once: true }); else bootstrapThemeState();
