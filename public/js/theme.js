/* NoteBooks theme runtime. Loaded before app.js and intentionally exposes its compatibility API globally. */
const THEME_KEY = 'notebooks-theme-global';
const THEME_COOKIE = 'notebooks-theme';
const THEME_PRESETS = {
    futuristic: { accent: '#34d399', surface: '#050c14', text: '#dbe7e5', code: '#010307', font: 'Inter', bg: '#02050a', panel: '#07111b', border: '#112a3b', radius: '14px', density: '1', shadow: '0 18px 55px rgba(0,0,0,.38)', texture: 'grid', heading: 'Inter' },
    contrast: { accent: '#f8fafc', surface: '#050505', text: '#ffffff', code: '#000000', font: 'system-ui', bg: '#000000', panel: '#0a0a0a', border: '#5b5b5b', radius: '2px', density: '.92', shadow: '0 0 0 transparent', texture: 'none', heading: 'system-ui' },
    neon: { accent: '#f472b6', surface: '#17112d', text: '#fdf4ff', code: '#0b0618', font: 'JetBrains Mono', bg: '#0b0618', panel: '#21143b', border: '#8b5cf6', radius: '22px', density: '1.12', shadow: '0 0 28px rgba(244,114,182,.24)', texture: 'scanlines', heading: 'JetBrains Mono' },
    professional: { accent: '#60a5fa', surface: '#172033', text: '#e5edf8', code: '#0d1524', font: 'Inter', bg: '#111827', panel: '#1f2937', border: '#334155', radius: '8px', density: '.98', shadow: '0 10px 28px rgba(0,0,0,.2)', texture: 'none', heading: 'Inter' },
    classic: { accent: '#0969da', surface: '#ffffff', text: '#1f2328', code: '#f6f8fa', font: 'system-ui', bg: '#f6f8fa', panel: '#ffffff', border: '#d0d7de', radius: '6px', density: '.94', shadow: '0 1px 2px rgba(31,35,40,.08)', texture: 'none', heading: 'system-ui' }
};
function themeControls(id) {
    return Array.from(document.querySelectorAll(`#${id}, #${id}Rail`));
}
function getCookie(name) {
    const m = document.cookie.match('(?:^|; )' + name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1') + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name, value, days = 365) {
    const d = new Date();
    d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax; expires=${d.toUTCString()}`;
}

function readSavedTheme() {
    try {
        const local = localStorage.getItem(THEME_KEY);
        if (local) return JSON.parse(local);
    } catch (_) { /* ignore */ }
    try {
        const cookie = getCookie(THEME_COOKIE);
        if (cookie) return JSON.parse(cookie);
    } catch (_) { /* ignore */ }
    return null;
}
function applyTheme(theme, options = {}) {
    const root = document.documentElement;
    const values = { ...THEME_PRESETS.futuristic, ...theme };
    root.dataset.theme = values.texture || 'none';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', values.bg);
    // theme.css owns the fallback contract; runtime presets override the same tokens as one batch.
    const tokenValues = {
        '--accent': values.accent,
        '--accent-hover': values.accentHover || values.accent,
        '--accent-subtle': values.accentSubtle || `color-mix(in srgb, ${values.accent} 14%, transparent)`,
        '--item': values.surface,
        '--panel': values.panel,
        '--surface-muted': values.surfaceMuted || `color-mix(in srgb, ${values.surface} 86%, ${values.bg})`,
        '--fg': values.text,
        '--text-muted': values.textMuted || `color-mix(in srgb, ${values.text} 64%, transparent)`,
        '--code-bg': values.code,
        '--bg': values.bg,
        '--hover': values.hover || values.surface,
        '--selected': values.selected || `color-mix(in srgb, ${values.accent} 18%, transparent)`,
        '--btn-bg': values.btnBg || values.panel,
        '--btn-hover': values.btnHover || values.surface,
        '--border': values.border,
        '--border-subtle': values.borderSubtle || `color-mix(in srgb, ${values.border} 48%, transparent)`,
        '--radius': values.radius,
        '--density': values.density,
        '--shadow': values.shadow,
        '--font-sans': values.font + ', Inter, sans-serif',
        '--font-heading': values.heading + ', sans-serif'
    };
    Object.entries(tokenValues).forEach(([key, value]) => root.style.setProperty(key, value));
    [['themeAccent', values.accent], ['themeSurface', values.surface], ['themeText', values.text], ['themeCode', values.code]].forEach(([id, value]) => themeControls(id).forEach((el) => { el.value = value; }));
    themeControls('themeFont').forEach((el) => { el.value = values.font; });
    const selectedPreset = Object.keys(THEME_PRESETS).find((name) => JSON.stringify(THEME_PRESETS[name]) === JSON.stringify(values)) || 'custom';
    themeControls('themePreset').forEach((el) => { el.value = selectedPreset; });
    if (!options.skipPersist) {
        try { localStorage.setItem(THEME_KEY, JSON.stringify(values)); } catch (_) { }
        try { setCookie(THEME_COOKIE, JSON.stringify(values), 365); } catch (_) { }
    }
}
function applyThemePreset(name) { applyTheme(THEME_PRESETS[name] || THEME_PRESETS.futuristic); }
function updateCustomTheme(key, value) { applyTheme({ ...readSavedTheme(), [key]: value }); themeControls('themePreset').forEach((el) => { el.value = 'custom'; }); }
function restoreTheme() { applyTheme(readSavedTheme() || THEME_PRESETS.futuristic, { skipPersist: true }); }
window.addEventListener('storage', (event) => { if (event.key === THEME_KEY && event.newValue) applyTheme(JSON.parse(event.newValue), { skipPersist: true }); });
