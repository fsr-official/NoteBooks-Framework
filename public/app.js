// @ts-nocheck
// Main JavaScript for the NoteBooks file explorer app
// This file handles the UI interactions, file fetching, previewing, and all client-side logic.
const listView = document.getElementById("listView");
const pathNav = document.getElementById("pathNav");
const splash = document.getElementById("splash");
const contextMenu = document.getElementById("contextMenu");
const previewContainer = document.getElementById("previewContainer");
const mobilePreview = document.getElementById("mobilePreview");
const mobilePreviewContent = document.getElementById("mobilePreviewContent");
const mobilePreviewTitle = document.getElementById("mobilePreviewTitle");
const taskbar = document.getElementById("taskbar");
const statusEl = document.getElementById("status");
let currentNode = null;
let pathHistory = [];
let selected = null;
let previewId = 0;
const windows = {};
const isMobile = /Mobi|Android/i.test(navigator.userAgent);
let updateDismissed = false;
let treeRoot = null;
let fileIndex = [];
let searchQuery = '';
let sidebarSearchInput = null;
let sidebarTree = null;
let searchDebounceTimer = null;
let treeHoverDetails = null;
let treeCurrentLocation = null;
let workspaceLocationMarker = null;
let activeTreePath = '';
let treeInteractionStarted = false;
const expandedTreePaths = new Set();
const THEME_KEY = 'notebooks-theme-global';
const THEME_COOKIE = 'notebooks-theme';
const THEME_PRESETS = {
    futuristic: { accent: '#34d399', surface: '#08111d', text: '#dbe7e5', code: '#02050a', font: 'Inter', bg: '#030811', panel: '#091827', border: '#183449', radius: '14px', density: '1', shadow: '0 18px 55px rgba(0,0,0,.38)', texture: 'grid', heading: 'Inter' },
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
    Object.entries({ '--accent': values.accent, '--item': values.surface, '--fg': values.text, '--code-bg': values.code, '--bg': values.bg, '--panel': values.panel, '--border': values.border, '--radius': values.radius, '--density': values.density, '--shadow': values.shadow, '--font-sans': values.font + ', Inter, sans-serif', '--font-heading': values.heading + ', sans-serif' }).forEach(([key, value]) => root.style.setProperty(key, value));
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
// Runtime config loaded from /api/config (populated from Vercel env vars).
// Fallbacks keep the app functional when running outside Vercel (e.g. local dev).
let appConfig = {
    GITHUB_REPO: 'fsr-science/NCERT-Science',
    GITHUB_BRANCH: 'main',
    APP_URL: '',
    GITPAGE_URL: 'https://fsr-science.github.io/NCERT-Science/',
    WORKSPACE: ''
};
function formatWorkspaceLabel(rawValue) {
    if (!rawValue) {
        return 'Workspace';
    }
    const normalized = rawValue.replace(/\\/g, '/');
    const parts = normalized.split('/').filter(Boolean);
    let label = parts.length ? parts[parts.length - 1] : normalized;
    label = label.replace(/\.json$/i, '');
    if (!label) {
        return 'Workspace';
    }
    return label;
}
function applyWorkspaceBranding() {
    const workspaceName = formatWorkspaceLabel(appConfig.WORKSPACE);
    const pageTitle = workspaceName === 'Workspace' ? 'NoteBooks' : workspaceName;
    document.title = pageTitle;

    const overlayHeading = document.getElementById('guideOverlayHeading');
    if (overlayHeading) {
        overlayHeading.textContent = `Welcome to ${pageTitle}`;
    }

    const brandSubtitle = document.getElementById('brandSubtitle');
    if (brandSubtitle) {
        brandSubtitle.textContent = `${workspaceName} workspace`;
    }

    const workspaceHeader = document.getElementById('workspaceHeader');
    if (workspaceHeader) {
        workspaceHeader.textContent = pageTitle;
    }

    const sidebarAccountMeta = document.getElementById('sidebarAccountMeta');
    if (sidebarAccountMeta) {
        sidebarAccountMeta.textContent = workspaceName === 'Workspace'
            ? 'Access your workspace'
            : `Access your ${workspaceName} workspace`;
    }

    const sidebarBrandTitle = document.getElementById('sidebarBrandTitle');
    if (sidebarBrandTitle) {
        sidebarBrandTitle.textContent = 'NoteBooks';
    }

    const installerLogoName = document.getElementById('installerLogoName');
    if (installerLogoName) {
        installerLogoName.textContent = `Setup ${pageTitle}`;
    }

    const installerSubtitle = document.getElementById('installerSubtitle');
    if (installerSubtitle) {
        installerSubtitle.textContent = `Configures your new ${pageTitle} installation`;
    }
}

function switchGuideTab(tab) {
    const desktop = document.getElementById('guideDesktop');
    const mobile = document.getElementById('guideMobile');
    const tabs = document.querySelectorAll('#guideTabDesktop, #guideTabMobile');

    if (desktop) {
        desktop.style.display = tab === 'desktop' ? '' : 'none';
    }
    if (mobile) {
        mobile.style.display = tab === 'mobile' ? '' : 'none';
    }

    tabs.forEach((button) => {
        const active = button.id === (tab === 'desktop' ? 'guideTabDesktop' : 'guideTabMobile');
        button.classList.toggle('active', active);
    });
}

function showGuidance() {
    const overlay = document.getElementById('guidanceOverlay');
    if (!overlay)
        return;
    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('active'));
}

function dismissGuidance() {
    const overlay = document.getElementById('guidanceOverlay');
    if (!overlay)
        return;
    overlay.classList.remove('active');
    setTimeout(() => { overlay.style.display = 'none'; }, 380);
}

function hideGuidance() {
    const overlay = document.getElementById('guidanceOverlay');
    if (!overlay)
        return;
    overlay.classList.remove('active');
    overlay.style.display = 'none';
}

function initialGuideState() {
    const overlay = document.getElementById('guidanceOverlay');
    if (!overlay)
        return;
    overlay.style.display = 'none';
    overlay.classList.remove('active');
    switchGuideTab('desktop');
}

window.switchGuideTab = switchGuideTab;
window.dismissGuidance = dismissGuidance;
window.showGuidance = showGuidance;
window.hideGuidance = hideGuidance;

const SUBJECT_PAGES = {
    science: { icon: '🧪', title: 'Science', description: 'Structured notes, experiments, and concept reviews.' },
    commerce: { icon: '💼', title: 'Commerce', description: 'Business, economics, and practical career knowledge.' },
    humanities: { icon: '📚', title: 'Humanities', description: 'History, civics, culture, and critical essays.' },
    community: { icon: '💬', title: 'Community', description: 'Discuss concepts, share ideas, and collaborate.' },
    issues: { icon: '🛠️', title: 'Issues', description: 'Request changes, flag gaps, and improve the portal.' },
    accounts: { icon: '🔐', title: 'Accounts', description: 'Authentication, profiles, and access management.' },
    volunteers: { icon: '🤝', title: 'Volunteers', description: 'Verified contributor opportunities and onboarding.' },
about: { icon: '◌', title: 'About NoteBooks', description: 'A shared shelf for clearer, kinder learning.' }
};

function getCurrentSubjectRoute() {
    const slug = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean)[0] || '';
    return SUBJECT_PAGES[slug] ? slug : '';
}
function initGlobalNav() {
    const current = getCurrentSubjectRoute() || (window.location.pathname === '/' ? 'home' : '');
    document.querySelectorAll('.global-nav-links a').forEach((link) => {
        const active = link.dataset.nav === current;
        link.classList.toggle('is-current', active);
        if (active) link.setAttribute('aria-current', 'page');
    });
    const toggle = document.querySelector('.global-nav-toggle');
    const links = document.querySelector('.global-nav-links');
    toggle?.addEventListener('click', () => { const open = links.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(open)); });
    document.querySelector('[data-nav="accounts"]')?.addEventListener('click', () => { setTimeout(() => { if (window.location.hash === '#settings') document.getElementById('accountSettings')?.removeAttribute('hidden'); }, 0); });
    document.querySelector('[data-close-settings]')?.addEventListener('click', () => document.getElementById('accountSettings')?.setAttribute('hidden', ''));
}

function renderPublicPortal(subject) {
    const landing = document.getElementById('subjectLanding');
    if (!landing || !subject || subject === 'science' || subject === 'commerce' || subject === 'humanities') return;
    const pages = {
        community: { kicker: 'Open discussion', title: 'A thoughtful place to ask, answer, and compare notes.', copy: 'Community conversations are grounded in the three subject libraries and surfaced from the existing GitHub-backed feed.', primary: 'Start a thread', links: [{ label: 'Latest discussions', href: '/community?sort=latest' }, { label: 'Trending now', href: '/community?sort=trending' }] },
        issues: { kicker: 'Improve the shelf', title: 'Spot a gap. Make a clear request. Help the library get better.', copy: 'Issues turn reader friction into visible, actionable work for the NoteBooks community.', primary: 'Submit an issue', links: [{ label: 'Latest issues', href: '/issues?sort=latest' }, { label: 'Active work', href: '/issues?status=open' }] },
        volunteers: { kicker: 'Contribute your craft', title: 'There is more than one way to leave the shelf better.', copy: 'Help with reference books, AI support, moderation, or coding. The page is public; applications continue through your account.', primary: 'Get started', links: [{ label: 'Reference books', href: '/accounts' }, { label: 'Moderation and coding', href: '/accounts' }] },
        accounts: { kicker: 'Your NoteBooks account', title: 'Keep your learning room close at hand.', copy: 'Sign in to contribute, apply for volunteer work, upload notes, and manage your shared reading-room preferences.', primary: 'Sign in or register', links: [{ label: 'Open settings', href: '#settings' }, { label: 'Contribution access', href: '/volunteers' }] },
        about: { kicker: 'The NoteBooks mission', title: 'Knowledge becomes more useful when it is easier to enter and easier to improve.', copy: 'NoteBooks is for learners, contributors, reviewers, and maintainers who want subject libraries that are readable, structured, and open to careful improvement. Notes move through submission, validation, review, and GitHub publication; Community and Issues keep questions and gaps visible along the way.', primary: 'Start learning', links: [{ label: 'Browse subjects', href: '/science' }, { label: 'Contribute', href: '/volunteers' }] }
    };
    const page = pages[subject];
    if (!page) return;
    landing.innerHTML = `<div class="portal-page"><div class="landing-hero"><div class="landing-kicker">${page.kicker}</div><h1>${page.title}</h1><p>${page.copy}</p><div class="landing-actions"><a class="landing-primary" href="${subject === 'accounts' ? '#login' : subject === 'community' || subject === 'issues' ? '#community' : subject === 'volunteers' ? '/accounts' : '/science'}">${page.primary} <span aria-hidden="true">→</span></a><a class="landing-secondary" href="/">Back to home</a></div></div><div class="portal-grid"><section class="portal-panel portal-panel--wide"><div class="portal-panel-header"><span>${page.icon || 'NoteBooks'}</span><strong>Explore this space</strong></div><div class="portal-doc-links">${page.links.map((link) => `<a href="${link.href}">${link.label}</a>`).join('')}</div>${subject === 'community' || subject === 'issues' ? `<div class="feed-switcher" role="group" aria-label="Activity sorting"><button type="button" class="feed-switch" data-portal-sort="latest">Latest</button><button type="button" class="feed-switch" data-portal-sort="trending">Trending</button></div><div class="portal-feed" id="portalFeed" role="status" aria-live="polite">Loading the latest activity…</div>` : ''}</section><section class="portal-panel"><div class="portal-panel-header"><span>Next step</span><strong>Keep moving</strong></div><p class="mission-copy">Choose one small action. Read a page, ask a question, or make a contribution that another learner can build on.</p></section></div></div>`;
    if (subject === 'community' || subject === 'issues') {
        const initialSort = new URLSearchParams(window.location.search).get('sort') || 'latest';
        document.querySelectorAll('[data-portal-sort]').forEach((button) => { button.classList.toggle('is-active', button.dataset.portalSort === initialSort); button.addEventListener('click', () => { document.querySelectorAll('[data-portal-sort]').forEach((item) => item.classList.toggle('is-active', item === button)); loadPortalFeed(subject, 'portalFeed', button.dataset.portalSort || 'latest'); }); });
        loadPortalFeed(subject, 'portalFeed', initialSort);
    }
}

async function loadPortalFeed(subject, targetId = 'portalFeed', sort = 'latest') {
    const feed = document.getElementById(targetId);
    if (!feed) return;
    feed.innerHTML = '<p class="feed-loading">Loading live activity…</p>';
    try {
        const source = subject === 'issues' ? 'issues' : 'community';
        const response = await fetch(`/api/${source}/feed?source=${encodeURIComponent(source)}&sort=${encodeURIComponent(sort)}`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Feed unavailable (${response.status})`);
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        feed.innerHTML = items.length ? items.slice(0, 6).map((item) => `<a class="feed-item" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title || 'Untitled activity')}</strong><span>${escapeHtml(item.source || source)}${item.reply_count != null ? ` · ${item.reply_count} replies` : ''}${item.reaction_count != null ? ` · ${item.reaction_count} reactions` : ''} · ${formatFeedDate(item.updated_at || item.created_at)}</span><small>${escapeHtml(item.excerpt || '')}</small></a>`).join('') : '<p class="feed-empty">Nothing here yet — be the first to contribute.</p>';
    } catch (error) {
        feed.innerHTML = '<p class="feed-empty">Live activity is unavailable right now. You can still browse the subject libraries.</p>';
    }
}
function formatFeedDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Recently'; }
function initHomeFeed() { const feed = document.getElementById('homeFeed'); if (!feed) return; document.querySelectorAll('[data-feed-sort]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('[data-feed-sort]').forEach((item) => item.classList.toggle('is-active', item === button)); loadPortalFeed('community', 'homeFeed', button.dataset.feedSort || 'latest'); })); loadPortalFeed('community', 'homeFeed', 'latest'); }
function initPortalMotion() { const targets = document.querySelectorAll('[data-reveal], .subject-card'); if (!('IntersectionObserver' in window)) { targets.forEach((target) => target.classList.add('is-visible')); return; } const observer = new IntersectionObserver((entries, instance) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); instance.unobserve(entry.target); } }), { threshold: 0.12 }); targets.forEach((target) => observer.observe(target)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function syncSubjectLandingState() {
    const landing = document.getElementById('subjectLanding');
    const shell = document.querySelector('.app-shell');
    const subject = getCurrentSubjectRoute();
    const isPortalRoute = ['accounts', 'volunteers', 'community', 'issues', 'about'].includes(subject) || window.location.pathname === '/';
    renderPublicPortal(subject);

    if (!landing || !shell) {
        return;
    }

    landing.style.display = isPortalRoute ? 'block' : 'none';
    shell.style.display = isPortalRoute ? 'none' : 'flex';

    document.querySelectorAll('#subjectGrid a, .portal-doc-links a').forEach((link) => {
        const href = link.getAttribute('href') || '';
        const active = subject && href === `/${subject}`;
        link.classList.toggle('is-current', Boolean(active));
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    if (subject && SUBJECT_PAGES[subject]) {
        const meta = SUBJECT_PAGES[subject];
        document.title = `${meta.title} · NoteBooks`;
        if (window.location.pathname === `/${subject}`) {
            const workspaceHeader = document.getElementById('workspaceHeader');
            if (workspaceHeader) {
                workspaceHeader.textContent = `${meta.icon} ${meta.title}`;
            }
            const utilityTitle = document.getElementById('utilityWorkspaceTitle');
            if (utilityTitle) {
                utilityTitle.textContent = `${meta.title}`;
            }
        }
    }
}

async function fetchConfig() {
    try {
        const res = await fetch('/api/config');
        if (res.ok) {
            const data = await res.json();
            appConfig = { ...appConfig, ...data };
        }
    }
    catch (e) {
        console.warn('fetchConfig failed — using defaults:', e);
    }
}
const EXCLUDED_ROOT_FILES = [
    "fmtree.py", "files.json", "index.html", "favicon.png", "tree.py", "autocommit.ps1"
];
const FILE_ICONS = {
    folder: "📁",
    md: "📝",
    markdown: "��",
    pdf: "📕",
    txt: "📄",
    json: "🔧",
    js: "📜",
    html: "🌐",
    css: "🎨",
    py: "🐍",
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    svg: "🖼️",
    doc: "📘", docx: "📘",
    xls: "📗", xlsx: "📗",
    ppt: "📙", pptx: "📙",
    default: "📄"
};
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js?v=20260808-pathfix").then(() => {
        console.log("Service Worker registered");
    }).catch(err => {
        console.error("SW registration failed:", err);
    });
}
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
});
function dismissUpdateNotice() {
    document.getElementById("updateNotice").style.display = "none";
    updateDismissed = true;
}
function showStatus(message, isLoading = false) {
    statusEl.innerHTML = isLoading ? `<span class="loader"></span>${message}` : message;
    const workspaceStatus = document.getElementById('workspaceStatus');
    if (workspaceStatus) workspaceStatus.textContent = String(message).replace(/<[^>]+>/g, '');
    statusEl.classList.add("visible");
    setTimeout(() => {
        statusEl.classList.remove("visible");
    }, 3000);
}
let currentBuildTimestamp = 0;
let latestKnownSignalId = '';
const UPDATE_POLL_INTERVAL = 30_000;
const PRESERVED_LOCAL_STORAGE_KEYS = [
    'theme',
    'sidebarWidth',
    'sidebarCollapsed',
    'authToken',
    'lastViewedPath'
];

function notifyRefreshSignal(type, message) {
    if (type === 'directory') {
        showStatus(`Repository update detected: ${message}`);
    }
    else {
        showStatus(`File update detected: ${message}`);
    }
}

async function clearAppCaches() {
    try {
        if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
        }

        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage('CLEAR_CACHE');
        }

        if ('indexedDB' in window && typeof indexedDB.databases === 'function') {
            try {
                const dbs = await indexedDB.databases();
                await Promise.all(dbs.map((db) => new Promise((resolve) => {
                    if (!db.name) {
                        return resolve(null);
                    }
                    const request = indexedDB.deleteDatabase(db.name);
                    request.onsuccess = () => resolve(null);
                    request.onerror = () => resolve(null);
                    request.onblocked = () => resolve(null);
                })));
            }
            catch (error) {
                console.warn('[cache] IndexedDB purge failed', error);
            }
        }

        const preserved = {};
        PRESERVED_LOCAL_STORAGE_KEYS.forEach((key) => {
            const value = localStorage.getItem(key);
            if (value !== null) {
                preserved[key] = value;
            }
        });
        localStorage.clear();
        Object.entries(preserved).forEach(([key, value]) => {
            localStorage.setItem(key, value);
        });
    }
    catch (error) {
        console.warn('[cache] Failed to clear app caches', error);
    }
}

function showUpdateBanner(message = 'Update detected. Refresh now to apply changes.') {
    const updateNotice = document.getElementById('updateNotice');
    if (!updateNotice)
        return;
    const textNode = updateNotice.querySelector('span');
    if (textNode)
        textNode.textContent = message;
    updateNotice.style.display = 'flex';
}

function scheduleReload(delay = 3000) {
    setTimeout(() => {
        showStatus('Reloading to apply updates...');
        window.location.reload();
    }, delay);
}

async function getAppVersion() {
    try {
        const res = await fetch(`/api/version?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok)
            throw new Error(`Version check failed: ${res.status}`);
        return await res.json();
    }
    catch (error) {
        console.warn('[update] version check failed', error);
        return null;
    }
}

async function getLatestCommitSignal() {
    try {
        const res = await fetch(`/api/latest-commit?ts=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok)
            throw new Error(`Latest commit check failed: ${res.status}`);
        return await res.json();
    }
    catch (error) {
        console.warn('[update] latest commit check failed', error);
        return null;
    }
}

async function applyDirectoryUpdate(signal) {
    notifyRefreshSignal('directory', signal.reason || signal.signal);
    await clearAppCaches();
    treeRoot = null;
    fileIndex = [];
    currentNode = null;
    await fetchTree();
}

async function applyFileUpdate(signal) {
    notifyRefreshSignal('file', signal.reason || signal.signal);
    treeRoot = null;
    fileIndex = [];
    currentNode = null;
    await fetchTree();
}

async function checkForAppUpdates() {
    try {
        const version = await getAppVersion();
        if (version?.buildTimestamp) {
            if (currentBuildTimestamp && version.buildTimestamp !== currentBuildTimestamp) {
                showUpdateBanner('New deployment detected. Reloading now.');
                await clearAppCaches();
                scheduleReload(1500);
                currentBuildTimestamp = version.buildTimestamp;
                return;
            }
            currentBuildTimestamp = version.buildTimestamp;
        }

        const latest = await getLatestCommitSignal();
        if (latest?.latestSignal?.signal && latest.latestSignal.signal !== latestKnownSignalId) {
            latestKnownSignalId = latest.latestSignal.signal;
            if (latest.latestSignal.type === 'directory') {
                await applyDirectoryUpdate(latest.latestSignal);
            }
            else {
                await applyFileUpdate(latest.latestSignal);
            }
        }
    }
    catch (error) {
        console.warn('[update] polling failed', error);
    }
}

async function startUpdatePolling() {
    await checkForAppUpdates();
    setInterval(() => checkForAppUpdates(), UPDATE_POLL_INTERVAL);
}

async function refreshFromSignal(payload) {
    if (!payload || !payload.signal)
        return;
    const signalType = payload.type === 'directory' ? 'directory' : 'file';
    notifyRefreshSignal(signalType, payload.signal);
    treeRoot = null;
    fileIndex = [];
    currentNode = null;
    await fetchTree();
}
async function generateFileTree() {
    showStatus("Generating file tree...", true);
    try {
        const timestamp = new Date().toISOString();
        showStatus(`Tree generated at: ${timestamp}`);
        await fetchTree();
    }
    catch (error) {
        showStatus("Failed to generate tree: " + error.message);
    }
}
async function refreshSignalLoop() {
    try {
        const res = await fetch('/api/refresh-signal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signal: 'manual-refresh', type: 'directory' })
        });
        if (res.ok) {
            await refreshFromSignal(await res.json());
        }
    }
    catch (error) {
        console.warn('refreshSignalLoop failed', error);
    }
}
function refreshFiles() {
    fetchTree();
    showStatus("Refreshing files list…");
}
function buildPagesUrl(p) {
    if (!appConfig.GITPAGE_URL)
        return '';
    const cleanedPath = String(p || '').replace(/^\/+/, '');
    const baseUrl = appConfig.GITPAGE_URL.endsWith('/') ? appConfig.GITPAGE_URL : `${appConfig.GITPAGE_URL}/`;
    try {
        return new URL(cleanedPath, baseUrl).toString();
    }
    catch (error) {
        console.warn('buildPagesUrl error:', error);
        return '';
    }
}
async function fetchPagesManifest() {
    const urls = [];
    const pagesUrl = buildPagesUrl('files.json');
    if (pagesUrl)
        urls.push({ url: `${pagesUrl}?v=${Date.now()}`, source: 'GitHub Pages' });
    if (appConfig.GITHUB_REPO) {
        urls.push({
            url: `https://cdn.jsdelivr.net/gh/${appConfig.GITHUB_REPO}@${appConfig.GITHUB_BRANCH || 'main'}/files.json`,
            source: 'jsDelivr'
        });
    }
    if (!urls.length)
        throw new Error('No public repository manifest source is configured');
    let lastError = null;
    for (const candidate of urls) {
        try {
            const res = await fetch(candidate.url, { cache: 'no-store' });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const manifest = await res.json();
            console.info(`[tree] Loaded files.json from ${candidate.source}`);
            return manifest;
        }
        catch (error) {
            lastError = error;
            console.warn(`[tree] ${candidate.source} manifest unavailable:`, error);
        }
    }
    throw lastError || new Error('Failed to fetch public repository manifest');
}
function pagesBaseForRepository(repo) {
    const [owner, name] = String(repo || '').split('/').filter(Boolean);
    if (!owner || !name)
        return '';
    return name.toLowerCase() === `${owner.toLowerCase()}.github.io`
        ? `https://${owner}.github.io/`
        : `https://${owner}.github.io/${name}/`;
}
function annotateRepositoryTree(node, prefix, repo, branch) {
    if (!node)
        return null;
    const nodePath = String(node.path || node.name || '').replace(/^\/+/, '');
    const path = [prefix, nodePath].filter(Boolean).join('/');
    return {
        ...node,
        path,
        repo,
        branch,
        repoPath: nodePath,
        children: Array.isArray(node.children)
            ? node.children.map((child) => annotateRepositoryTree(child, prefix, repo, branch))
            : node.children
    };
}
async function appendConfiguredRepositoryTrees(localTree) {
    const registryUrl = buildPagesUrl('repo-registry.json');
    if (!registryUrl || !localTree || !Array.isArray(localTree.children))
        return localTree;
    try {
        const registryResponse = await fetch(`${registryUrl}?v=${Date.now()}`, { cache: 'no-store' });
        if (!registryResponse.ok)
            return localTree;
        const entries = await registryResponse.json();
        for (const entry of Array.isArray(entries) ? entries : []) {
            if (entry?.enabled === false || !entry?.repo || entry.repo === appConfig.GITHUB_REPO)
                continue;
            const baseUrl = pagesBaseForRepository(entry.repo);
            if (!baseUrl)
                continue;
            try {
                const response = await fetch(`${baseUrl.replace(/\/$/, '')}/files.json`, { cache: 'no-store' });
                if (!response.ok)
                    continue;
                const remoteTree = await response.json();
                const prefix = entry.name || entry.repo.split('/').pop();
                const children = Array.isArray(remoteTree?.children) ? remoteTree.children : [];
                localTree.children.push(...children.map((child) => annotateRepositoryTree(child, prefix, entry.repo, entry.branch || 'main')));
            }
            catch (error) {
                console.warn(`[tree] Unable to load configured repository ${entry.repo}:`, error);
            }
        }
    }
    catch (error) {
        console.warn('[tree] Public repo-registry.json unavailable:', error);
    }
    return localTree;
}
function buildFileIndex(node, acc = []) {
    if (!node || !node.name)
        return acc;
    const path = node.path || node.name || '';
    acc.push({
        type: node.type,
        name: node.name,
        path,
        repo: node.repo || '',
        branch: node.branch || '',
        repoPath: node.repoPath || '',
        node
    });
    if (Array.isArray(node.children)) {
        node.children.forEach((child) => buildFileIndex(child, acc));
    }
    return acc;
}
function nodeMatchesQuery(node, query) {
    if (!query)
        return true;
    const lower = String(node.name || node.path || node.repo || '').toLowerCase();
    return lower.includes(query);
}
function updateSearchResults(query) {
    searchQuery = String(query || '').trim().toLowerCase();
    if (sidebarSearchInput)
        sidebarSearchInput.value = String(query || '');
    renderSidebarTree(treeRoot, searchQuery);
    if (!searchQuery) {
        renderFolder(currentNode || treeRoot);
        updatePathNav();
        return;
    }
    const hits = fileIndex.filter((item) => nodeMatchesQuery(item, searchQuery));
    renderSearchResults(hits);
    pathNav.innerHTML = `<span class="path-segment">Search results</span>`;
}
function renderSearchResults(results) {
    listView.innerHTML = '';
    selected = null;
    if (!results || results.length === 0) {
        listView.innerHTML = `
      <div class="empty-state">
        <div class="icon">🔍</div>
        <h3>No matches found</h3>
        <p>Try a different keyword or clear the search box.</p>
      </div>
    `;
        return;
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < results.length; i++) {
        const itemData = results[i];
        const item = document.createElement('div');
        item.className = 'file-item';
        item._childData = itemData;
        const fileIcon = getFileIcon(itemData);
        const fileTypeClass = getFileTypeClass(itemData);
        const subtitle = itemData.repo ? `<div class="file-subtitle">${itemData.path} · ${itemData.repo}</div>` : `<div class="file-subtitle">${itemData.path}</div>`;
        item.innerHTML = `
      <div class="file-icon" data-type="${fileTypeClass}">${fileIcon}</div>
      <div class="file-name">
        ${itemData.name}
        ${subtitle}
      </div>
    `;
        item.onclick = () => {
            setActiveTreePath(itemData.path);
            if (itemData.type === 'folder') {
                navigateToSidebarNode(itemData.path);
            }
            else {
                openPreview(itemData.path, itemData.name, itemData.repo, itemData.branch, itemData.repoPath);
            }
        };
        listView.appendChild(item);
        item.style.animationDelay = `${i * 10}ms`;
    }
}
function findAncestors(node, targetPath, ancestors = []) {
    if (!node)
        return null;
    const normalizedTarget = String(targetPath || '').replace(/^\/+|\/+$/g, '');
    const nodePath = String(node.path || '').replace(/^\/+|\/+$/g, '');
    if (nodePath && nodePath === normalizedTarget) {
        return [...ancestors, node];
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            const result = findAncestors(child, targetPath, [...ancestors, node]);
            if (result)
                return result;
        }
    }
    return null;
}
function navigateToSidebarNode(path) {
    if (!treeRoot || !path)
        return;
    const ancestors = findAncestors(treeRoot, path);
    if (!ancestors || ancestors.length === 0)
        return;
    const nodePath = ancestors[ancestors.length - 1];
    const cleanedAncestors = ancestors.filter((n) => n.name !== 'root');
    setActiveTreePath(nodePath.path || path);
    currentNode = nodePath;
    pathHistory = cleanedAncestors.slice(0, -1);
    renderFolder(nodePath);
    updatePathNav();
}
function getNodePath(node) {
    return String(node?.path || node?.name || '').replace(/^\/+|\/+$/g, '');
}
function getNodeRepositoryPath(nodeOrPath, explicitRepoPath = '') {
    if (explicitRepoPath)
        return String(explicitRepoPath).replace(/^\/+/, '');
    const value = typeof nodeOrPath === 'object' ? nodeOrPath?.path : nodeOrPath;
    return String(value || '').replace(/^\/+/, '');
}
function getNodeDetails(node) {
    const children = Array.isArray(node?.children) ? node.children : [];
    const files = children.filter((child) => child.type === 'file').length;
    const folders = children.filter((child) => child.type === 'folder').length;
    return { children, files, folders };
}
function setActiveTreePath(path) {
    activeTreePath = String(path || '').replace(/^\/+|\/+$/g, '');
    if (activeTreePath)
        treeInteractionStarted = true;
    if (activeTreePath && treeRoot) {
        const activeAncestors = findAncestors(treeRoot, activeTreePath) || [];
        activeAncestors.forEach((ancestor) => {
            if (ancestor.type === 'folder' && getNodePath(ancestor) !== activeTreePath)
                expandedTreePaths.add(getNodePath(ancestor));
        });
    }
    if (treeCurrentLocation) {
        const activeNode = fileIndex.find((item) => getNodePath(item.node) === activeTreePath)?.node;
        const label = activeNode?.name || (activeTreePath ? activeTreePath.split('/').pop() : 'workspace root');
        treeCurrentLocation.textContent = `Current location: ${label}`;
        treeCurrentLocation.title = activeTreePath || 'workspace root';
        if (workspaceLocationMarker) {
            workspaceLocationMarker.textContent = `Inside: ${label}`;
            workspaceLocationMarker.title = activeTreePath || 'workspace root';
        }
    }
    if (sidebarTree && treeRoot)
        renderSidebarTree(treeRoot, searchQuery);
}
function showTreeHoverDetails(node) {
    if (!treeHoverDetails)
        return;
    const { children, files, folders } = getNodeDetails(node);
    const path = node.path || node.name || 'workspace root';
    const repo = node.repo || appConfig.GITHUB_REPO || 'Repository unavailable';
    const branch = node.branch || appConfig.GITHUB_BRANCH || 'default branch';
    treeHoverDetails.innerHTML = `
      <strong>${escapeHTML(node.name || 'Unnamed item')}</strong>
      <span>${escapeHTML(node.type || 'item')} · ${escapeHTML(path)}</span>
      <span>${escapeHTML(repo)} · ${escapeHTML(branch)}</span>
      <span>${node.type === 'folder' ? `${children.length} children · ${folders} folders · ${files} files` : 'File available to preview'}</span>
    `;
    treeHoverDetails.hidden = false;
}
function hideTreeHoverDetails() {
    if (treeHoverDetails)
        treeHoverDetails.hidden = true;
}
function createSidebarTreeItem(node, query) {
    if (!node)
        return null;
    const matchesSelf = nodeMatchesQuery(node, query);
    const childItems = Array.isArray(node.children)
        ? [...node.children].sort((a, b) => {
            if (a.type !== b.type)
                return a.type === 'folder' ? -1 : 1;
            return String(a.name || '').localeCompare(String(b.name || ''));
        })
            .map((child) => createSidebarTreeItem(child, query))
            .filter(Boolean)
        : [];
    if (query && !matchesSelf && childItems.length === 0) {
        return null;
    }
    const li = document.createElement('li');
    li.className = `sidebar-tree-item ${node.type}`;
    const nodePath = getNodePath(node);
    const { children } = getNodeDetails(node);
    const hasChildren = node.type === 'folder' && childItems.length > 0;
    const isActive = activeTreePath && nodePath === activeTreePath;
    const isAncestor = activeTreePath && findAncestors(treeRoot, activeTreePath)?.some((ancestor) => getNodePath(ancestor) === nodePath);
    const shouldExpandForSearch = Boolean(query && childItems.length);
    const isExpanded = hasChildren && (shouldExpandForSearch || (treeInteractionStarted && expandedTreePaths.has(nodePath)));
    if (isActive)
        li.classList.add('current');
    if (isAncestor)
        li.classList.add('active-trail');
    if (node.type === 'folder' && !isExpanded)
        li.classList.add('collapsed');
    const row = document.createElement('div');
    row.className = 'sidebar-tree-row';
    if (matchesSelf)
        row.classList.add('match');
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String((nodePath.match(/\//g) || []).length + 1));
    row.setAttribute('aria-current', isActive ? 'location' : 'false');
    if (hasChildren)
        row.setAttribute('aria-expanded', String(isExpanded));
    const toggle = document.createElement('button');
    toggle.className = 'sidebar-tree-toggle';
    toggle.type = 'button';
    toggle.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '·';
    toggle.disabled = !hasChildren;
    toggle.setAttribute('aria-label', hasChildren ? `${isExpanded ? 'Collapse' : 'Expand'} ${node.name}` : `${node.name} file`);
    toggle.onclick = (event) => {
        event.stopPropagation();
        if (!hasChildren)
            return;
        treeInteractionStarted = true;
        if (expandedTreePaths.has(nodePath))
            expandedTreePaths.delete(nodePath);
        else
            expandedTreePaths.add(nodePath);
        renderSidebarTree(treeRoot, searchQuery);
    };
    row.appendChild(toggle);
    const glyph = document.createElement('span');
    glyph.className = `sidebar-tree-glyph ${node.type === 'folder' ? 'folder' : 'file'}`;
    glyph.innerHTML = node.type === 'folder'
        ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5h7l2 2h9v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 6.5v-1a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v1"/></svg>'
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5"/></svg>';
    row.appendChild(glyph);
    const label = document.createElement('span');
    label.className = 'sidebar-tree-label';
    label.textContent = node.name;
    label.onclick = () => {
        setActiveTreePath(nodePath);
        if (node.type === 'file') {
                openPreview(node.path, node.name, node.repo, node.branch, getNodeRepositoryPath(node, node.repoPath));
        }
        else {
            navigateToSidebarNode(node.path);
        }
    };
    row.appendChild(label);
    li.appendChild(row);
    if (childItems.length > 0) {
        const ul = document.createElement('ul');
        ul.className = 'sidebar-tree-children';
        childItems.forEach((childLi) => ul.appendChild(childLi));
        li.appendChild(ul);
    }
    row.addEventListener('mouseenter', () => showTreeHoverDetails(node));
    row.addEventListener('focusin', () => showTreeHoverDetails(node));
    row.addEventListener('mouseleave', hideTreeHoverDetails);
    row.addEventListener('focusout', hideTreeHoverDetails);
    return li;
}
function renderSidebarTree(root, query = '') {
    if (!sidebarTree)
        return;
    sidebarTree.innerHTML = '';
    if (!root || !Array.isArray(root.children) || root.children.length === 0) {
        sidebarTree.innerHTML = `<div class="sidebar-tree-empty">No repository tree available.</div>`;
        return;
    }
    const ul = document.createElement('ul');
    ul.className = 'sidebar-tree-root';
    [...root.children].sort((a, b) => {
        if (a.type !== b.type)
            return a.type === 'folder' ? -1 : 1;
        return String(a.name || '').localeCompare(String(b.name || ''));
    }).forEach((child) => {
        const childLi = createSidebarTreeItem(child, query);
        if (childLi)
            ul.appendChild(childLi);
    });
    if (!ul.children.length) {
        sidebarTree.innerHTML = `<div class="sidebar-tree-empty">No matches found.</div>`;
        return;
    }
    sidebarTree.appendChild(ul);
}
function toggleSidebar() {
    const sidebar = document.getElementById('treeRail');
    const button = document.getElementById('sidebarCollapseBtn');
    if (!sidebar || !button)
        return;
    const collapsed = sidebar.classList.toggle('tree-rail--collapsed');
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', `${collapsed ? 'Expand' : 'Collapse'} repository navigator`);
    button.title = `${collapsed ? 'Expand' : 'Collapse'} repository navigator`;
    button.textContent = collapsed ? '›' : '‹';
}
async function fetchTree() {
    showStatus("Loading files...", true);
    try {
        let tree = null;
        const isGitHubPagesHost = window.location.hostname.endsWith('github.io');
        if (!isGitHubPagesHost) {
            try {
                const registryRes = await fetch(`/api/registry?${Date.now()}`, { cache: 'no-store' });
                if (registryRes.ok) {
                    tree = await registryRes.json();
                    console.info('[tree] Loaded local files plus configured repository registry');
                }
            }
            catch (registryError) {
                console.warn('[tree] Combined registry unavailable, trying public Pages manifest:', registryError);
            }
        }
        if (appConfig.GITPAGE_URL) {
            if (!tree) {
                try {
                        tree = await fetchPagesManifest();
                        // Always append configured repository entries when we successfully
                        // loaded a public Pages/jsDelivr manifest — ensure consistent tree shape
                        tree = await appendConfiguredRepositoryTrees(tree);
                    }
                catch (pagesError) {
                    console.warn("GitHub Pages manifest unavailable, falling back:", pagesError);
                }
            }
        }
        if (!tree) {
            try {
                const fallbackRes = await fetch(`/files.json?${Date.now()}`, { cache: 'no-store' });
                if (!fallbackRes.ok)
                    throw new Error(`Failed to fetch: ${fallbackRes.status}`);
                tree = await fallbackRes.json();
            }
            catch (manifestError) {
                console.warn("files.json manifest unavailable, falling back to registry:", manifestError);
            }
        }
        if (!tree) {
            const res = await fetch(`/api/registry?${Date.now()}`, { cache: 'no-store' });
            if (!res.ok)
                throw new Error(`Failed to fetch registry: ${res.status}`);
            tree = await res.json();
        }
        treeRoot = tree;
        fileIndex = buildFileIndex(treeRoot);
        currentNode = treeRoot;
        // Preserve independently collapsed folders across refreshes; remove paths no longer present.
        const validPaths = new Set(fileIndex.map((item) => getNodePath(item.node)));
        [...expandedTreePaths].forEach((path) => { if (!validPaths.has(path)) expandedTreePaths.delete(path); });
        treeInteractionStarted = treeInteractionStarted || expandedTreePaths.size > 0;
        setActiveTreePath('');
        pathHistory = [];
        renderSidebarTree(treeRoot, searchQuery);
        if (searchQuery) {
            updateSearchResults(searchQuery);
        }
        else {
            renderFolder(treeRoot);
            updatePathNav();
        }
        const fontPromise = new Promise((resolve) => {
            const testSpan = document.createElement("span");
            testSpan.textContent = "A quick brown fox jumps";
            testSpan.style.cssText = "position:absolute;visibility:hidden;fontSize:32px;fontFamily:sans-serif";
            document.body.appendChild(testSpan);
            testSpan.style.fontFamily = '"Roboto", sans-serif';
            requestAnimationFrame(() => {
                document.body.removeChild(testSpan);
                resolve();
            });
        });
        fontPromise.then(() => {
            splash.style.opacity = 0;
            setTimeout(() => { splash.style.display = 'none'; }, 600);
            const workspaceStatus = document.getElementById('workspaceStatus');
        if (workspaceStatus) workspaceStatus.textContent = 'Ready';
        });
    }
    catch (error) {
        showStatus("Failed to generate tree: " + error.message);
        console.error(error);
        splash.style.opacity = 0;
        setTimeout(() => { splash.style.display = 'none'; }, 600);
    }
}
function getFileIcon(file) {
    if (file.type === "folder")
        return FILE_ICONS.folder;
    const ext = file.name.split('.').pop().toLowerCase();
    return FILE_ICONS[ext] || FILE_ICONS.default;
}
function getFileTypeClass(file) {
    if (file.type === "folder")
        return "folder";
    const ext = file.name.split('.').pop().toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext))
        return "image";
    return ext;
}
function renderFolder(node) {
    listView.innerHTML = "";
    selected = null;
    const children = (node.children || []).filter(item => {
        if (item.type === "folder" && item.name === ".github")
            return false;
        if (pathHistory.length === 0 && item.type === "folder" && item.name === "waiting-list")
            return false;
        if (pathHistory.length === 0 && item.type === "file" && EXCLUDED_ROOT_FILES.includes(item.name))
            return false;
        return true;
    });
    children.sort((a, b) => {
        if (a.type === b.type)
            return a.name.localeCompare(b.name);
        return a.type === "folder" ? -1 : 1;
    });
    if (children.length === 0) {
        listView.innerHTML = `
      <div class="empty-state">
        <div class="icon">📂</div>
        <h3>This folder is empty</h3>
        <p>No files or folders to display</p>
      </div>
    `;
        return;
    }
    for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const item = document.createElement("div");
        item.className = "file-item";
        item.setAttribute("data-index", i);
        item._childData = child;
        const fileIcon = getFileIcon(child);
        const fileTypeClass = getFileTypeClass(child);
        item.innerHTML = `
      <div class="file-icon" data-type="${fileTypeClass}">${fileIcon}</div>
      <div class="file-name">${child.name}</div>
      <div class="file-actions">
        ${child.type === "file" ? `
          <div class="file-action" onclick="previewFile(event, ${i})">👁️</div>
          <div class="file-action" onclick="downloadFile(event, ${i})">📥</div>
          ${isAdmin() ? `<div class="file-action file-action--delete" onclick="deleteFile(event, ${i})" title="Delete file">🗑️</div>` : ''}
        ` : ''}
      </div>
      ${child.type === "file" ? `<div class="file-action-mob" onclick="openMobFileSheet(event, ${i})">⋯</div>` : ''}
    `;
        item.onclick = (e) => {
            document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selected = child;
            if (child.type === "folder") {
                setActiveTreePath(child.path);
                pathHistory.push(currentNode);
                currentNode = child;
                renderFolder(child);
                updatePathNav();
            }
            else {
                setActiveTreePath(child.path);
                if (!e.target.closest('.file-action'))
                    handlePreview();
            }
        };
        item.oncontextmenu = e => {
            e.preventDefault();
            document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            selected = child;
            showContextMenu(e.pageX, e.pageY);
        };
        listView.appendChild(item);
        item.style.animationDelay = `${i * 30}ms`;
    }
}
function startDrag(e, id) {
    const el = windows[id];
    if (!el)
        return;
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = parseInt(el.style.left, 10) || 0;
    const startTop = parseInt(el.style.top, 10) || 0;
    function onMouseMove(ev) {
        el.style.left = startLeft + (ev.clientX - startX) + "px";
        el.style.top = startTop + (ev.clientY - startY) + "px";
    }
    function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
}
function updatePathNav() {
    const allSegments = [];
    for (let i = 0; i < pathHistory.length; i++) {
        allSegments.push({ name: pathHistory[i].name, action: `goToPath(${i})` });
    }
    if (currentNode && currentNode !== pathHistory[pathHistory.length - 1]) {
        allSegments.push({ name: currentNode.name, action: null });
    }
    const maxVisible = isMobile ? 2 : Infinity;
    const truncated = allSegments.length > maxVisible;
    const visible = truncated ? allSegments.slice(-maxVisible) : allSegments;
    let html = `<span class="path-segment" onclick="goToRoot()">☁️</span>`;
    if (truncated)
        html += `<span class="path-separator">/</span><span class="path-crumb-ellipsis">…</span>`;
    visible.forEach(seg => {
        html += `<span class="path-separator">/</span>`;
        html += seg.action
            ? `<span class="path-segment" onclick="${seg.action}">${seg.name}</span>`
            : `<span class="path-segment">${seg.name}</span>`;
    });
    pathNav.innerHTML = html;
}
function goToRoot() { fetchTree(); }
function goToPath(index) {
    currentNode = pathHistory[index];
    setActiveTreePath(currentNode?.path || '');
    pathHistory = pathHistory.slice(0, index);
    renderFolder(currentNode);
    updatePathNav();
}
function goUp() {
    if (pathHistory.length > 0) {
        currentNode = pathHistory.pop();
        setActiveTreePath(currentNode?.path || '');
        renderFolder(currentNode);
        updatePathNav();
    }
}
function previewFile(e, index) {
    e.stopPropagation();
    const items = document.querySelectorAll('.file-item');
    if (index >= 0 && index < items.length)
        items[index].click();
}
function downloadFile(e, index) {
    e.stopPropagation();
    const items = document.querySelectorAll('.file-item');
    if (index >= 0 && index < items.length) {
        document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
        items[index].classList.add('selected');
        selected = items[index]._childData;
        handleDownload();
    }
}
let _pendingDeletePath = null;
let _pendingDeleteName = null;
function deleteFile(e, index) {
    e.stopPropagation();
    if (!isAdmin())
        return;
    const items = document.querySelectorAll('.file-item');
    if (index < 0 || index >= items.length)
        return;
    const child = items[index]._childData;
    _pendingDeletePath = child.path;
    _pendingDeleteName = child.name;
    if (isMobile) {
        document.getElementById('deleteMobileMsg').textContent =
            `"${child.name}" will be permanently removed from the repository.`;
        const o = document.getElementById('deleteMobileOverlay');
        o.style.display = 'flex';
        requestAnimationFrame(() => o.classList.add('active'));
    }
    else {
        document.getElementById('deleteConfirmMsg').textContent =
            `"${child.name}" will be permanently removed from the repository. This cannot be undone.`;
        document.getElementById('deleteConfirm').style.display = 'flex';
    }
}
function cancelDeleteFile() {
    _pendingDeletePath = null;
    _pendingDeleteName = null;
    document.getElementById('deleteConfirm').style.display = 'none';
    const o = document.getElementById('deleteMobileOverlay');
    o.classList.remove('active');
    setTimeout(() => { o.style.display = 'none'; }, 380);
}
async function confirmDeleteFile() {
    if (!_pendingDeletePath || !_pendingDeleteName)
        return;
    const path = _pendingDeletePath;
    const name = _pendingDeleteName;
    cancelDeleteFile();
    showStatus(`Deleting "${name}"…`, true);
    const getRes = await ghProxy('getFile', { path });
    if (!getRes.ok || !getRes.data.sha) {
        showStatus(`✗ Could not retrieve file info: ${getRes.error || 'file not found'}`);
        return;
    }
    const delRes = await ghProxy('deleteFile', { path, sha: getRes.data.sha, message: `Delete: ${path}` });
    if (delRes.ok) {
        showStatus(`✓ "${name}" deleted.`);
        fetchTree();
    }
    else {
        showStatus(`✗ Delete failed: ${delRes.error}`);
    }
}
function closeWindow(id) {
    const win = windows[id];
    if (win) {
        win.remove();
        delete windows[id];
        updateTaskbar();
    }
}
function minimizeWindow(id) {
    const win = windows[id];
    if (win) {
        win.style.display = "none";
        updateTaskbar();
    }
}
function showTaskbarContextMenu(x, y, id) {
    const menu = document.getElementById("taskbarContextMenu");
    menu.innerHTML = `
    <button onclick="restoreFromTaskbar('${id}')">🗖 Restore</button>
    <button onclick="minimizeWindow('${id}')">🗕 Minimize</button>
    <button onclick="closeWindow('${id}')">✖ Close</button>
  `;
    menu.style.top = y + "px";
    menu.style.left = x + "px";
    menu.style.display = "flex";
}
document.addEventListener("click", () => {
    document.getElementById("taskbarContextMenu").style.display = "none";
});
function restoreFromTaskbar(id) {
    const win = windows[id];
    if (win) {
        win.style.display = "block";
        updateTaskbar();
    }
}
function updateTaskbar() {
    const minimized = Object.entries(windows).filter(([_, el]) => el.style.display === "none");
    if (minimized.length === 0) {
        taskbar.style.display = "none";
        taskbar.innerHTML = "";
        return;
    }
    taskbar.style.display = "flex";
    taskbar.innerHTML = "";
    for (const [id, el] of Object.entries(windows)) {
        if (el.style.display === "none") {
            const icon = document.createElement("div");
            icon.className = "task-icon";
            icon.dataset.name = el.querySelector(".title")?.textContent || "File";
            icon.textContent = "📄";
            icon.onclick = () => { el.style.display = "block"; updateTaskbar(); };
            icon.oncontextmenu = (e) => { e.preventDefault(); showTaskbarContextMenu(e.pageX, e.pageY, id); };
            taskbar.appendChild(icon);
        }
    }
}
function toggleFullscreen(id, forceFull = false) {
    const w = windows[id];
    if (!w)
        return;
    const isFullscreen = w.classList.contains("fullscreen");
    if (forceFull && !isFullscreen) {
        w.classList.add("fullscreen");
        return;
    }
    if (isFullscreen) {
        w.classList.remove("fullscreen");
        w.style.removeProperty("top");
        w.style.removeProperty("left");
        w.style.top = "100px";
        w.style.left = "100px";
        w.style.width = "80vw";
        w.style.height = "80vh";
    }
    else {
        w.classList.add("fullscreen");
        w.style.top = "0";
        w.style.left = "0";
        w.style.width = "100vw";
        w.style.height = "100vh";
    }
}
function showContextMenu(x, y) {
    contextMenu.style.top = y + 'px';
    contextMenu.style.left = x + 'px';
    contextMenu.style.display = 'flex';
}
function handlePreview() {
    if (selected && selected.type === "file") {
        const args = [selected.path, selected.name, selected.repo || '', selected.branch || '', selected.repoPath || selected.path];
        isMobile
            ? openMobilePreview(...args)
            : openPreview(...args);
    }
    contextMenu.style.display = 'none';
}
function handleDownload() {
    if (selected && selected.type === "file") {
        const a = document.createElement("a");
        const selectedRepoPath = getNodeRepositoryPath(selected, selected.repoPath);
        let downloadUrl = `${window.location.origin}/api/raw?path=${encodeURIComponent(selected.repo ? selectedRepoPath : selected.path)}`;
        if (selected.repo) {
            const branch = selected.branch || appConfig.GITHUB_BRANCH;
            downloadUrl = `https://raw.githubusercontent.com/${selected.repo}/${branch}/${selectedRepoPath}`;
        }
        else if (appConfig.GITPAGE_URL) {
            const pagesUrl = buildPagesUrl(selectedRepoPath);
            if (pagesUrl)
                downloadUrl = pagesUrl;
        }
        a.href = downloadUrl;
        a.download = selected.name;
        a.target = '_blank';
        a.rel = 'noopener';
        a.click();
        showStatus(`Downloading: ${selected.name}`);
    }
    contextMenu.style.display = 'none';
}
function openMobilePreview(path, filename, repo = '', branch = '', repoPath = '') {
    mobilePreviewTitle.textContent = filename;
    fetchFileContent(path, filename, mobilePreviewContent, null, repo, branch, repoPath);
    mobilePreview.style.display = "flex";
}
function closeMobilePreview() {
    mobilePreview.style.display = "none";
    mobilePreviewContent.innerHTML = "";
}
// ─── Split-view editor styles (injected once) ────────────────────────────────
function injectSplitViewStyles() {
    if (document.getElementById('sv-styles'))
        return;
    const style = document.createElement('style');
    style.id = 'sv-styles';
    style.textContent = `
    /* The preview body becomes a flex column when split-view is active */
    .preview-body.sv-active {
      display: flex !important;
      flex-direction: row !important;
      padding: 0 !important;
      overflow: hidden !important;
      gap: 0;
    }

    /* Left pane: rendered markdown */
    .sv-preview-pane {
      flex: 1;
      overflow-y: auto;
      padding: 24px 28px;
      min-width: 0;
      background: linear-gradient(135deg, rgba(15, 23, 42, 0.95) 0%, rgba(30, 41, 59, 0.95) 100%);
      border-right: 1px solid rgba(52, 211, 153, 0.05);
    }

    /* Drag handle between panes */
    .sv-divider {
      width: 6px;
      background: #1e293b;
      cursor: col-resize;
      flex-shrink: 0;
      position: relative;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      border-left: 1px solid rgba(52, 211, 153, 0.1);
      border-right: 1px solid rgba(52, 211, 153, 0.1);
    }
    .sv-divider:hover, .sv-divider.dragging { 
      background: linear-gradient(180deg, rgba(52, 211, 153, 0.4) 0%, rgba(52, 211, 153, 0.2) 100%);
      border-left-color: rgba(52, 211, 153, 0.3);
      border-right-color: rgba(52, 211, 153, 0.3);
      box-shadow: inset 0 0 12px rgba(52, 211, 153, 0.2);
    }
    .sv-divider::after {
      content: '::';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #34d399;
      font-size: 12px;
      pointer-events: none;
      letter-spacing: 2px;
      font-weight: bold;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .sv-divider:hover::after { opacity: 0.7; }

    /* Right pane: markdown editor */
    .sv-editor-pane {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      min-width: 0;
      background: linear-gradient(135deg, #0f172a 0%, #1a202c 100%);
      border-left: 1px solid rgba(52, 211, 153, 0.1);
    }

    /* Edit toggle button in the title bar */
    .title-bar .btn-edit-split {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 20px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid transparent;
      background: rgba(52, 211, 153, 0.12);
      color: #34d399;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: inherit;
      height: 32px;
      position: relative;
      letter-spacing: 0px;
      text-transform: none;
      white-space: nowrap;
      flex-shrink: 0;
      min-width: fit-content;
    }
    .title-bar .btn-edit-split:hover {
      background: rgba(52, 211, 153, 0.18);
      color: #34d399;
      border-color: rgba(52, 211, 153, 0.3);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(52, 211, 153, 0.2);
    }
    .title-bar .btn-edit-split:active {
      transform: translateY(0);
    }
    .title-bar .btn-edit-split.active {
      background: linear-gradient(135deg, rgba(52, 211, 153, 0.25) 0%, rgba(34, 197, 94, 0.25) 100%);
      color: #10b981;
      border-color: #10b981;
      box-shadow: 0 0 20px rgba(52, 211, 153, 0.3);
    }
    .title-bar .btn-edit-split .sv-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #fbbf24;
      display: none;
      animation: pulse-dot 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      position: absolute;
      right: 6px;
      top: 6px;
      box-shadow: 0 0 4px #fbbf24;
    }
    .title-bar .btn-edit-split.has-edits .sv-dot { display: inline-block; }
    @keyframes pulse-dot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.7; transform: scale(1.2); }
    }
  `;
    document.head.appendChild(style);
}
// ─── openPreview ────────────────────────────────────────���────────────────────
function openPreview(path, filename, repo = '', branch = '', repoPath = '') {
    injectSplitViewStyles();
    const id = 'preview-' + (++previewId);
    const win = document.createElement("div");
    win.className = "floating-window";
    win.style.top = `${100 + previewId * 10}px`;
    win.style.left = `${100 + previewId * 10}px`;
    win.dataset.id = id;
    const ext = filename.split('.').pop().toLowerCase();
    const isMarkdown = ext === 'md' || ext === 'markdown';
    const isFullScreen = isMarkdown || ext === 'pdf' || ext === 'html' || ext === 'htm'
        || ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx'
        || ext === 'ppt' || ext === 'pptx';
    // Edit button — only for markdown files
    const editBtnHTML = isMarkdown
        ? `<button class="btn-edit-split" id="${id}-editbtn" title="Open markdown editor" aria-label="Open markdown editor" onclick="toggleSplitEditor('${id}')">
         <svg class="editor-button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span class="sv-dot"></span>
       </button>`
        : '';
    win.innerHTML = `
    <div class="title-bar" onmousedown="startDrag(event, '${id}')">
      <div class="title">${filename}</div>
      <div class="buttons">
        ${editBtnHTML}
        <button onclick="minimizeWindow('${id}')">🗕</button>
        <button onclick="toggleFullscreen('${id}')">🗖</button>
        <button onclick="closeWindow('${id}')">✖</button>
      </div>
    </div>
    <div class="preview-body" id="${id}-body">Loading...</div>
  `;
    previewContainer.appendChild(win);
    windows[id] = win;
    // Metadata stored on the element
    win._filePath = path;
    win._repo = repo;
    win._branch = branch;
    win._repoPath = repoPath || path;
    win._filename = filename;
    win._isMarkdown = isMarkdown;
    win._originalContent = null; // populated by fetchFileContent
    win._splitActive = false;
    // ✅ Pass win directly so _originalContent is set correctly after the await
    const container = document.getElementById(id + "-body");
    fetchFileContent(path, filename, container, win, repo, branch, repoPath);
    updateTaskbar();
    if (isFullScreen)
        setTimeout(() => toggleFullscreen(id, true), 100);
}
// ─── fetchFileContent ─────────────────────────────────────────────────────────
async function fetchFileContent(path, filename, container, winElement = null, repo = '', branch = '', repoPath = '') {
    const ext = (filename.includes('.') ? filename : path).split('.').pop().toLowerCase();
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;"><span class="loader"></span> Loading...</div>';
    const isGitHubPages = window.location.hostname.endsWith('github.io');
    const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const repoName = repo ? String(repo).split('/').pop() : '';
    // In local development, try direct file access first (for static servers like `serve`)
    // On GitHub Pages, use raw.githubusercontent.com
    // On Vercel, use /api/raw endpoint
    function buildPagesUrl(p) {
        if (!appConfig.GITPAGE_URL)
            return '';
        const cleanedPath = String(p || '').replace(/^\/+/, '');
        const baseUrl = appConfig.GITPAGE_URL.endsWith('/') ? appConfig.GITPAGE_URL : `${appConfig.GITPAGE_URL}/`;
        try {
            return new URL(cleanedPath, baseUrl).toString();
        }
        catch {
            return '';
        }
    }
    const localFileUrl = (p) => {
        const cleanedPath = String(p || '').replace(/^\/+/, '');
        return `${window.location.origin}/files/${cleanedPath.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
    };
    const fetchUrl = (p) => {
        if (repo) {
            const pagesBase = pagesBaseForRepository(repo);
            const rawSourcePath = String(repoPath || p || '').replace(/^\/+/, '');
            const sourcePath = repoPath
                ? rawSourcePath
                : (repoName && rawSourcePath.startsWith(`${repoName}/`) ? rawSourcePath.slice(repoName.length + 1) : rawSourcePath);
            return pagesBase
                ? `${pagesBase}${sourcePath}`
                : `https://raw.githubusercontent.com/${repo}/${branch || appConfig.GITHUB_BRANCH}/${sourcePath}`;
        }
        const pagesUrl = buildPagesUrl(p);
        if (pagesUrl) {
            return pagesUrl;
        }
        if (isGitHubPages) {
            return `https://raw.githubusercontent.com/${appConfig.GITHUB_REPO}/${appConfig.GITHUB_BRANCH}/${p}`;
        }
        return localFileUrl(p);
    };
    // Fallback to API if direct file access fails (for Vercel deployments with private repos)
    const fetchUrlWithFallback = async (p) => {
        if (repo) {
            const rawUrl = fetchUrl(p);
            try {
                const response = await fetch(rawUrl, { cache: 'no-store' });
                if (response.ok)
                    return await response.text();
            }
            catch (error) {
                console.warn('[file] Pages file read failed:', error);
            }
            const rawSourcePath = String(repoPath || p || '').replace(/^\/+/, '');
            const sourcePath = repoPath
                ? rawSourcePath
                : (repoName && rawSourcePath.startsWith(`${repoName}/`) ? rawSourcePath.slice(repoName.length + 1) : rawSourcePath);
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${repo}@${branch || appConfig.GITHUB_BRANCH || 'main'}/${sourcePath}`;
            const cdnResponse = await fetch(cdnUrl, { cache: 'no-store' });
            if (!cdnResponse.ok)
                throw new Error(`HTTP ${cdnResponse.status}`);
            return await cdnResponse.text();
        }
        const pagesUrl = buildPagesUrl(p);
        if (pagesUrl) {
            try {
                const response = await fetch(pagesUrl);
                if (response.ok) {
                    return await response.text();
                }
            }
            catch (e) {
                // Continue to fallback behavior
            }
        }
        if (appConfig.GITHUB_REPO) {
            const cdnUrl = `https://cdn.jsdelivr.net/gh/${appConfig.GITHUB_REPO}@${appConfig.GITHUB_BRANCH || 'main'}/${String(p || '').replace(/^\/+/, '')}`;
            try {
                const response = await fetch(cdnUrl, { cache: 'no-store' });
                if (response.ok)
                    return await response.text();
            }
            catch (e) {
                // Continue to local/API fallback.
            }
        }
        const apiUrl = `${window.location.origin}/api/raw?path=${encodeURIComponent(p)}`;
        const directUrl = localFileUrl(p);
        try {
            const response = await fetch(directUrl);
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (!contentType.includes('text/html') || directUrl.endsWith('.html') || directUrl.endsWith('.htm')) {
                    return await response.text();
                }
            }
        }
        catch (e) {
            // Direct access failed, try API
        }
        const apiResponse = await fetch(apiUrl);
        if (!apiResponse.ok)
            throw new Error(`HTTP ${apiResponse.status}`);
        return await apiResponse.text();
    };
    const resolvePdfPreviewUrl = async (p) => {
        const cleanedPath = String(p || '').replace(/^\/+/, '');
        const directUrl = localFileUrl(cleanedPath);
        try {
            const response = await fetch(directUrl, { method: 'HEAD', cache: 'no-store' });
            if (response.ok) {
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('application/pdf')) {
                    return directUrl;
                }
                if (!contentType.includes('text/html')) {
                    return directUrl;
                }
            }
        }
        catch (e) {
            // ignore and fallback to API or pages
        }

        const apiUrl = `${window.location.origin}/api/raw?path=${encodeURIComponent(cleanedPath)}`;
        try {
            const response = await fetch(apiUrl, { method: 'HEAD', cache: 'no-store' });
            if (response.ok) {
                return apiUrl;
            }
        }
        catch (e) {
            // ignore and fallback to static/raw path
        }

        return fetchUrl(cleanedPath);
    };
    const rawUrl = fetchUrl(path);
    try {
        if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(filename)) {
            container.innerHTML = `<img src="${fetchUrl(path)}" style="max-width:100%;height:auto;display:block;margin:auto;" alt="${filename}" />`;
        }
        else if (/\.(mp3|wav|ogg|flac)$/i.test(filename)) {
            container.innerHTML = `<audio controls src="${fetchUrl(path)}" style="width:100%;display:block;margin-top:20px"></audio>`;
        }
        else if (/\.(mp4|webm)$/i.test(filename)) {
            container.innerHTML = `<video controls src="${fetchUrl(path)}" style="max-width:100%;max-height:100%;display:block;margin:auto"></video>`;
        }
        else if (/\.(docx?|xlsx?|pptx?)$/i.test(filename.includes('.') ? filename : path)) {
            const viewerUrl = `https://docs.google.com/gviewer?embedded=true&url=${encodeURIComponent(rawUrl)}`;
            container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
            container.innerHTML = `<iframe src="${viewerUrl}" style="flex:1;min-height:0;width:100%;border:none;display:block;" allowfullscreen></iframe>`;
        }
        else if (ext === 'html' || ext === 'htm') {
            container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
            container.innerHTML = `<iframe src="${fetchUrl(path)}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;
        }
        else if (ext === 'pdf') {
            container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
            const targetPath = repo ? (repoPath || path) : path;
            const proxied = repo
                ? `${window.location.origin}/api/raw?path=${encodeURIComponent(targetPath)}`
                : await resolvePdfPreviewUrl(targetPath);
            container.innerHTML = `<iframe src="${proxied}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;
        }
        else if (ext === 'md' || ext === 'markdown') {
            const text = await fetchUrlWithFallback(path);
            if (winElement) {
                winElement._originalContent = text;
                // If there are session edits, show the unsaved dot
                if (MarkdownEditor.hasUnsavedEdits(path)) {
                    const editBtn = document.getElementById(winElement.dataset.id + '-editbtn');
                    if (editBtn)
                        editBtn.classList.add('has-edits');
                }
            }
            renderMarkdownIntoContainer(MarkdownEditor.getSavedContent(path) || text, path, container);
        }
        else {
            try {
                const text = await fetchUrlWithFallback(path);
                container.innerHTML = `<pre style="margin:0;white-space:pre-wrap;font-family:Consolas,monospace;font-size:13px;line-height:1.5">${escapeHTML(text)}</pre>`;
            }
            catch (error) {
                container.innerHTML = `<div class="error">Error loading file: ${error.message}</div>`;
            }
        }
    }
    catch (error) {
        container.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}
// ─── Markdown render helper ───────────────────────────────────────────────────
function renderMarkdownIntoContainer(text, filePath, container) {
  const win = container.closest('.floating-window');
  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-mode-toolbar';
  toolbar.innerHTML = '<span class="markdown-mode-label">Document</span><button type="button" data-mode="preview" class="active">Preview</button><button type="button" data-mode="edit">Edit</button><button type="button" data-mode="raw">RAW</button>';
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-content';
  wrapper.innerHTML = markdownToHTML(text, filePath);
  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(wrapper);
  toolbar.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => {
      toolbar.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
      if (button.dataset.mode === 'edit' && win) { toggleSplitEditor(win.dataset.id); return; }
      if (button.dataset.mode === 'raw') {
          wrapper.classList.add('raw-markdown'); wrapper.textContent = text;
      } else {
          wrapper.classList.remove('raw-markdown'); wrapper.innerHTML = markdownToHTML(text, filePath); setTimeout(() => initMarkdownFeatures(wrapper), 0);
      }
  }));
  setTimeout(() => initMarkdownFeatures(wrapper), 0);
}
// ─── Split-view editor ────────────────────────────────────────────────────────
/**
 * Toggle the split-view editor panel for a markdown floating window.
 * Left pane = live rendered preview. Right pane = MarkdownEditor.
 */
function toggleSplitEditor(windowId) {
    const win = windows[windowId];
    if (!win || !win._isMarkdown)
        return;
    const body = document.getElementById(windowId + '-body');
    const editBtn = document.getElementById(windowId + '-editbtn');
    if (win._splitActive) {
        // ── Close split view ─────────────────────────────────────────────────────
        win._splitActive = false;
        if (editBtn) {
            editBtn.classList.remove('active');
        }
        // Re-render plain preview into body
        body.className = 'preview-body';
        body.removeAttribute('style');
        const content = MarkdownEditor.getSavedContent(win._filePath) || win._originalContent || '';
        renderMarkdownIntoContainer(content, win._filePath, body);
        // Update unsaved dot
        if (editBtn)
            editBtn.classList.toggle('has-edits', MarkdownEditor.hasUnsavedEdits(win._filePath));
    }
    else {
        // ── Open split view ──────────────────────────────────────────────────────
        if (!win._originalContent) {
            showStatus('⏳ File still loading, please wait…');
            return;
        }
        win._splitActive = true;
        if (editBtn) {
            editBtn.classList.add('active');
        }
        // Build split layout
        body.innerHTML = '';
        body.className = 'preview-body sv-active';
        // Left: preview pane
        const previewPane = document.createElement('div');
        previewPane.className = 'sv-preview-pane';
        previewPane.id = windowId + '-sv-preview';
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'markdown-content';
        const initialContent = MarkdownEditor.getSavedContent(win._filePath) || win._originalContent;
        previewWrapper.innerHTML = markdownToHTML(initialContent, win._filePath);
        previewPane.appendChild(previewWrapper);
        setTimeout(() => initMarkdownFeatures(previewWrapper), 0);
        // Divider (draggable)
        const divider = document.createElement('div');
        divider.className = 'sv-divider';
        attachDividerDrag(divider, previewPane, body);
        // Right: editor pane
        const editorPane = document.createElement('div');
        editorPane.className = 'sv-editor-pane';
        editorPane.id = windowId + '-sv-editor';
        body.appendChild(previewPane);
        body.appendChild(divider);
        body.appendChild(editorPane);
        // Mount the MarkdownEditor into the editor pane
        // onClose = "Done Editing" button inside the editor
        const onEditorClose = (editedContent) => {
            // Update the left preview pane live
            const pw = document.getElementById(windowId + '-sv-preview');
            if (pw) {
                pw.innerHTML = '';
                const w = document.createElement('div');
                w.className = 'markdown-content';
                w.innerHTML = markdownToHTML(editedContent, win._filePath);
                pw.appendChild(w);
                setTimeout(() => initMarkdownFeatures(w), 0);
            }
            if (editBtn)
                editBtn.classList.toggle('has-edits', MarkdownEditor.hasUnsavedEdits(win._filePath));
            showStatus('✓ Changes saved to session');
        };
        MarkdownEditor.createEditorUI(editorPane, win._filePath, win._originalContent, onEditorClose);
        // Wire the editor's textarea so typing also live-updates the preview pane
        // We do this after createEditorUI mounts, so the textarea exists
        requestAnimationFrame(() => {
            const textarea = editorPane.querySelector('.mde-textarea');
            if (!textarea)
                return;
            textarea.addEventListener('input', () => {
                const pw = document.getElementById(windowId + '-sv-preview');
                if (!pw)
                    return;
                // Debounce: only re-render every 300ms to avoid layout thrashing
                clearTimeout(textarea._previewTimer);
                textarea._previewTimer = setTimeout(() => {
                    pw.innerHTML = '';
                    const w = document.createElement('div');
                    w.className = 'markdown-content';
                    w.innerHTML = markdownToHTML(textarea.value, win._filePath);
                    pw.appendChild(w);
                    setTimeout(() => initMarkdownFeatures(w), 0);
                }, 300);
            });
        });
    }
}
/**
 * Make the divider bar draggable to resize the two panes.
 */
function attachDividerDrag(divider, leftPane, container) {
    let dragging = false;
    divider.addEventListener('mousedown', (e) => {
        e.preventDefault();
        dragging = true;
        divider.classList.add('dragging');
        const onMove = (ev) => {
            if (!dragging)
                return;
            const rect = container.getBoundingClientRect();
            const pct = ((ev.clientX - rect.left) / rect.width) * 100;
            const clamped = Math.min(Math.max(pct, 20), 80); // 20%–80% range
            leftPane.style.flex = 'none';
            leftPane.style.width = clamped + '%';
        };
        const onUp = () => {
            dragging = false;
            divider.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
function escapeHTML(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
document.addEventListener("click", (e) => {
    const isItem = e.target.closest(".file-item");
    const isContext = e.target.closest(".context-menu");
    if (!isItem && !isContext) {
        document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
        selected = null;
        contextMenu.style.display = "none";
    }
});
const manifest = {
    name: "Root",
    short_name: "Root",
    start_url: ".",
    display: "standalone",
    background_color: "#1e1e1e",
    theme_color: "#1e1e1e",
    icons: [{ src: "favicon.png", sizes: "192x192", type: "image/png" }]
};
// --- GitHub Pages → Vercel popup ---
function hasVercelDismissCookie() {
    return document.cookie.split(';').some(c => c.trim().startsWith('vercel_redirect_dismissed=1'));
}
function goToVercel() {
    document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
    window.location.href = appConfig.APP_URL;
}
function dismissVercelPopup() {
    document.cookie = 'vercel_redirect_dismissed=1; max-age=31536000; path=/; SameSite=Lax';
    const popup = document.getElementById('vercelPopup');
    popup.classList.remove('visible');
    setTimeout(() => { popup.style.display = 'none'; }, 400);
}
function maybeShowVercelPopup() {
    if (hasVercelDismissCookie())
        return;
    if (appConfig.GITPAGE_URL && window.location.hostname === new URL(appConfig.GITPAGE_URL).hostname) {
        setTimeout(() => { document.getElementById('vercelPopup').classList.add('visible'); }, 1800);
    }
}
// --- Community ---
function openCommunity() {
    const path = 'primenotepad.rf.gd';
    if (isMobile) {
        openMobilePreview(path, 'Community 💬');
    }
    else {
        openPreview(path, 'Community 💬');
    }
}
window.addEventListener("DOMContentLoaded", async () => {
    const treeRail = document.getElementById('treeRail');
    const treeRailToggle = document.getElementById('treeRailToggle');
    treeRailToggle?.addEventListener('click', () => {
        const collapsed = treeRail?.classList.toggle('is-collapsed') ?? false;
        if (treeRailToggle) {
            treeRailToggle.textContent = collapsed ? '›' : '‹';
            treeRailToggle.setAttribute('aria-label', collapsed ? 'Expand repository tree' : 'Collapse repository tree');
            treeRailToggle.title = collapsed ? 'Expand repository tree' : 'Collapse repository tree';
        }
    });
    sidebarSearchInput = document.getElementById("sidebarSearch");
    sidebarTree = document.getElementById("sidebarTree");
    treeHoverDetails = document.getElementById("treeHoverDetails");
    treeCurrentLocation = document.getElementById("treeCurrentLocation");
    workspaceLocationMarker = document.getElementById("workspaceLocationMarker");
    document.getElementById('sidebarCollapseBtn')?.addEventListener('click', toggleSidebar);
    if (sidebarSearchInput) {
        sidebarSearchInput.addEventListener('input', (event) => {
            const target = event.target;
            const query = target && 'value' in target ? target.value : '';
            if (searchDebounceTimer)
                clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => updateSearchResults(query), 120);
        });
    }
  restoreTheme();
  initialGuideState();
  initGlobalNav();
  initHomeFeed();
  initPortalMotion();
  await fetchConfig();
  applyWorkspaceBranding();
  syncSubjectLandingState();
    // Subject pages are rendered into the dedicated content mount in the shared app shell.
    // We intentionally do not replace the whole app shell here, because that destroys
    // the existing navigation and workspace state and causes the placeholder issue.
    const subjectContentRoot = document.getElementById('subjectContentRoot');
    if (subjectContentRoot && getCurrentSubjectRoute()) {
        subjectContentRoot.hidden = false;
        const landing = document.getElementById('subjectLanding');
        if (landing)
            landing.hidden = true;
    }
  const utilityTitle = document.getElementById('utilityWorkspaceTitle');
  if (utilityTitle) utilityTitle.textContent = document.getElementById('workspaceHeader')?.textContent || 'NoteBooks';
  if (window.location.pathname === '/' || getCurrentSubjectRoute()) {
    await startUpdatePolling();
    await fetchTree();
  }
  maybeShowVercelPopup();
});
