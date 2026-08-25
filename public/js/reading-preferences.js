/* Persistent reader controls shared by Settings and every eager-loaded stream workspace. */
const READING_DEFAULTS = { readerFontScale: 'normal', readerWidth: 'comfortable', readerLineHeight: 'comfortable', readerCodeWrap: false, readerReducedMotion: false };
const READING_STORAGE_KEY = 'notebooks-reading-preferences';
let readingPreferences = { ...READING_DEFAULTS };
const SIZE_VALUES = { compact: '0.92', normal: '1', large: '1.1' };
const WIDTH_VALUES = { narrow: '68ch', comfortable: '78ch', wide: '92ch' };
const LEADING_VALUES = { compact: '1.62', comfortable: '1.88', airy: '2.08' };
function readingStatus(message) { const status = document.getElementById('readingPreferencesStatus'); if (status) status.textContent = message; }
function safeReadingPreferences(input) {
    const value = input && typeof input === 'object' ? input : {};
    return {
        readerFontScale: ['compact', 'normal', 'large'].includes(value.readerFontScale) ? value.readerFontScale : READING_DEFAULTS.readerFontScale,
        readerWidth: ['narrow', 'comfortable', 'wide'].includes(value.readerWidth) ? value.readerWidth : READING_DEFAULTS.readerWidth,
        readerLineHeight: ['compact', 'comfortable', 'airy'].includes(value.readerLineHeight) ? value.readerLineHeight : READING_DEFAULTS.readerLineHeight,
        readerCodeWrap: value.readerCodeWrap === true || value.readerCodeWrap === 'true',
        readerReducedMotion: value.readerReducedMotion === true || value.readerReducedMotion === 'true'
    };
}
function applyReadingPreferences(next, options = {}) {
    readingPreferences = safeReadingPreferences(next);
    const root = document.documentElement;
    root.dataset.readerSize = readingPreferences.readerFontScale;
    root.dataset.readerWidth = readingPreferences.readerWidth;
    root.dataset.readerLeading = readingPreferences.readerLineHeight;
    root.dataset.codeWrap = String(readingPreferences.readerCodeWrap);
    root.dataset.reducedMotion = String(readingPreferences.readerReducedMotion);
    root.style.setProperty('--reader-font-scale', SIZE_VALUES[readingPreferences.readerFontScale]);
    root.style.setProperty('--reader-content-width', WIDTH_VALUES[readingPreferences.readerWidth]);
    root.style.setProperty('--reader-line-height', LEADING_VALUES[readingPreferences.readerLineHeight]);
    const fields = {
        readingFontSize: readingPreferences.readerFontScale,
        readingWidth: readingPreferences.readerWidth,
        readingLineHeight: readingPreferences.readerLineHeight,
        readingCodeWrap: readingPreferences.readerCodeWrap,
        readingReducedMotion: readingPreferences.readerReducedMotion
    };
    Object.entries(fields).forEach(([id, value]) => { document.querySelectorAll(`#${id}`).forEach((element) => { if (element.type === 'checkbox') element.checked = Boolean(value); else element.value = value; }); });
    if (!options.skipLocal) { try { localStorage.setItem(READING_STORAGE_KEY, JSON.stringify(readingPreferences)); } catch (_) { } }
}
async function persistReadingPreferences() {
    try {
        const response = await fetch('/api/session', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ preferences: readingPreferences }) });
        readingStatus(response.ok ? 'Reading preferences saved to this browser session.' : 'Applied locally; session persistence is unavailable.');
    } catch (_) { readingStatus('Applied locally; session persistence is unavailable.'); }
}
function updateReadingPreference(key, value) { applyReadingPreferences({ ...readingPreferences, [key]: value }); persistReadingPreferences(); }
function resetReadingPreferences() { applyReadingPreferences(READING_DEFAULTS); persistReadingPreferences(); readingStatus('Reading preferences restored to defaults.'); }
function bindReadingControls() {
    const bindings = { readingFontSize: 'readerFontScale', readingWidth: 'readerWidth', readingLineHeight: 'readerLineHeight', readingCodeWrap: 'readerCodeWrap', readingReducedMotion: 'readerReducedMotion' };
    Object.entries(bindings).forEach(([id, key]) => document.querySelectorAll(`#${id}`).forEach((element) => { if (element.dataset.readingBound === 'true') return; element.dataset.readingBound = 'true'; element.addEventListener('change', () => updateReadingPreference(key, element.type === 'checkbox' ? element.checked : element.value)); }));
}
async function bootstrapReadingPreferences() {
    let local = {};
    try { local = JSON.parse(localStorage.getItem(READING_STORAGE_KEY) || '{}'); } catch (_) { }
    applyReadingPreferences(local, { skipLocal: true }); bindReadingControls();
    try {
        const response = await fetch('/api/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (response.ok) { const data = await response.json(); applyReadingPreferences(data.session?.preferences || local, { skipLocal: true }); readingStatus(data.session?.persisted ? 'Reading preferences are saved to this browser session.' : 'Reading preferences are saved locally in this browser.'); }
    } catch (_) { readingStatus('Reading preferences are saved locally in this browser.'); }
}
window.updateReadingPreference = updateReadingPreference;
window.resetReadingPreferences = resetReadingPreferences;
window.applyReadingPreferences = applyReadingPreferences;
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrapReadingPreferences, { once: true }); else bootstrapReadingPreferences();
