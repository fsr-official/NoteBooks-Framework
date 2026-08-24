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
function hideSplash() {
    if (typeof window.__notebooksHideSplash === 'function' && window.__notebooksHideSplash !== hideSplash) {
        window.__notebooksHideSplash();
        return;
    }
    if (!splash) return;
    splash.style.opacity = '0';
    setTimeout(() => { splash.style.display = 'none'; }, 180);
}
window.__notebooksHideSplash = hideSplash;
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
// Runtime config loaded from /api/config (populated from Vercel env vars).
// Fallbacks keep the app functional when running outside Vercel (e.g. local dev).
// Runtime configuration. Avoid hardcoded repo/page defaults; load per-stream trees at runtime.
const appConfig = window.appConfig || {
    GITHUB_REPO: '',
    GITHUB_BRANCH: 'main',
    APP_URL: '',
    GITPAGE_URL: '',
    WORKSPACE: '',
    REPOS: [] // populated from <stream>-tree.json when available
};
window.appConfig = appConfig;

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

const SHARED_SHELL_ROUTES = new Set(['science', 'commerce', 'humanities', 'community', 'issues', 'volunteers', 'accounts', 'about']);
function isSharedShellRoute(pathname) {
    const slug = pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0]?.toLowerCase() || '';
    return pathname === '/' || SHARED_SHELL_ROUTES.has(slug);
}
function getCurrentStreamRoute() {
    // Prefer the explicit stream set by the shell
    if (window.CURRENT_STREAM) return window.CURRENT_STREAM;
    const slug = window.location.pathname.replace(/\/+$/, '').split('/').filter(Boolean)[0] || '';
    return slug || '';
}
function updateNavigationState() {
    const current = getCurrentStreamRoute() || (window.location.pathname === '/' ? 'home' : '');
    document.querySelectorAll('.global-nav-links a').forEach((link) => {
        const active = link.dataset.nav === current;
        link.classList.toggle('is-current', active);
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });
}
let routeTransitionSerial = 0;
async function navigateToRoute(href, { replace = false } = {}) {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/')) return;
    const transitionId = ++routeTransitionSerial;
    if (replace) window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    else window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);

    const slug = url.pathname.replace(/^\/+|\/+$/g, '').split('/')[0]?.toLowerCase() || '';
    window.CURRENT_STREAM = slug;
    document.body.dataset.stream = slug;
    NoteBooksStreamRuntime.reset();
    appConfig.REPOS = [];
    updateNavigationState();
    syncStreamLandingState();

    const shouldLoadWorkspace = NoteBooksStreamRuntime.streams.has(slug);
    if (shouldLoadWorkspace) {
        await fetchTree(transitionId);
    }
}
function initGlobalNav() {
    updateNavigationState();
    const toggle = document.querySelector('.global-nav-toggle');
    const links = document.querySelector('.global-nav-links');
    toggle?.addEventListener('click', () => { const open = links.classList.toggle('is-open'); toggle.setAttribute('aria-expanded', String(open)); });
    document.querySelector('[data-nav="accounts"]')?.addEventListener('click', () => { setTimeout(() => { if (window.location.hash === '#settings') document.getElementById('accountSettings')?.removeAttribute('hidden'); }, 0); });
    document.querySelector('[data-close-settings]')?.addEventListener('click', () => document.getElementById('accountSettings')?.setAttribute('hidden', ''));
    document.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const link = target?.closest('a[data-nav], a.stream-card, a.landing-primary, a.landing-secondary, a.portal-inline-link, .portal-doc-links a');
        if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#')) return;
        const targetUrl = new URL(href, window.location.href);
        // Dashboard, Settings, and admin routes have standalone HTML shells. Let the
        // browser perform a real navigation so their DOM and ownership boundaries load.
        if (!isSharedShellRoute(targetUrl.pathname) || !isSharedShellRoute(window.location.pathname)) return;
        event.preventDefault();
        navigateToRoute(href).catch((error) => console.warn('[navigation] route transition failed', error));
    });
    window.addEventListener('popstate', () => {
        if (isSharedShellRoute(window.location.pathname)) navigateToRoute(window.location.href, { replace: true }).catch((error) => console.warn('[navigation] history transition failed', error));
    });
}

function renderPublicPortal(subject) {
    const landing = document.getElementById('streamLanding');
    if (!landing || !subject) return;
    const pages = {
        community: { kicker: 'Open discussion', title: 'A thoughtful place to ask, answer, and compare notes.', copy: 'Community conversations are grounded in the three stream libraries and surfaced from the existing GitHub-backed feed.', primary: 'Start a thread', links: [{ label: 'Latest discussions', href: '/community?sort=latest' }, { label: 'Trending now', href: '/community?sort=trending' }] },
        issues: { kicker: 'Improve the shelf', title: 'Spot a gap. Make a clear request. Help the library get better.', copy: 'Issues turn reader friction into visible, actionable work for the NoteBooks community.', primary: 'Submit an issue', links: [{ label: 'Latest issues', href: '/issues?sort=latest' }, { label: 'Active work', href: '/issues?status=open' }] },
        volunteers: { kicker: 'Contribute your craft', title: 'There is more than one way to leave the shelf better.', copy: 'Help with reference books, AI support, moderation, or coding. The page is public; applications continue through your account.', primary: 'Get started', links: [{ label: 'Reference books', href: '/accounts' }, { label: 'Moderation and coding', href: '/accounts' }] },
        accounts: { kicker: 'Your NoteBooks account', title: 'Keep your learning room close at hand.', copy: 'Sign in to contribute, apply for volunteer work, upload notes, and manage your shared reading-room preferences.', primary: 'Sign in or register', links: [{ label: 'Open settings', href: '#settings' }, { label: 'Contribution access', href: '/volunteers' }] },
        about: { kicker: 'The NoteBooks mission', title: 'Knowledge becomes more useful when it is easier to enter and easier to improve.', copy: 'NoteBooks is for learners, contributors, reviewers, and maintainers who want stream libraries that are readable, structured, and open to careful improvement. Notes move through submission, validation, review, and GitHub publication; Community and Issues keep questions and gaps visible along the way.', primary: 'Start learning', links: [{ label: 'Browse streams', href: '/science' }, { label: 'Contribute', href: '/volunteers' }] }
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
        if (!items.length) {
            feed.innerHTML = '<p class="feed-empty">Nothing here yet — be the first to contribute.</p>';
            return;
        }
        feed.innerHTML = items.slice(0, 6).map((item) => {
            if (source === 'issues') {
                const votes = item.votes || {};
                const issueId = escapeHtml(item.id || item.githubIssueNumber || '');
                return `<article class="feed-item issue-feed-item"><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title || 'Untitled issue')}</strong><span>Issues${item.state ? ` · ${escapeHtml(item.state)}` : ''} · ${formatFeedDate(item.updatedAt || item.updated_at)}</span><small>${escapeHtml(item.body || item.excerpt || '')}</small></a><div class="issue-vote-controls" data-issue-id="${issueId}" aria-label="Issue voting"><button type="button" data-issue-vote="1" title="Upvote this issue">▲ <span>${escapeHtml(votes.upvotes || 0)}</span></button><strong>${escapeHtml(votes.score || 0)}</strong><button type="button" data-issue-vote="-1" title="Downvote this issue">▼ <span>${escapeHtml(votes.downvotes || 0)}</span></button></div></article>`;
            }
            return `<a class="feed-item" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title || 'Untitled activity')}</strong><span>${escapeHtml(item.source || source)}${item.reply_count != null ? ` · ${item.reply_count} replies` : ''}${item.reaction_count != null ? ` · ${item.reaction_count} reactions` : ''} · ${formatFeedDate(item.updated_at || item.created_at)}</span><small>${escapeHtml(item.excerpt || '')}</small></a>`;
        }).join('');
        if (source === 'issues') attachIssueVoteHandlers(feed);
    } catch (error) {
        feed.innerHTML = '<p class="feed-empty">Live activity is unavailable right now. You can still browse the stream libraries.</p>';
    }
}
function attachIssueVoteHandlers(feed) {
    feed.querySelectorAll('[data-issue-vote]').forEach((button) => button.addEventListener('click', async () => {
        const controls = button.closest('[data-issue-id]');
        const issueId = controls?.getAttribute('data-issue-id');
        if (!issueId) return;
        button.disabled = true;
        try {
            const response = await fetch(`/api/issues/${encodeURIComponent(issueId)}/vote`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ value: Number(button.dataset.issueVote) }) });
            const data = await response.json().catch(() => ({}));
            if (response.status === 401) throw new Error('Sign in to vote on issues.');
            if (!response.ok) throw new Error(data.error || 'Vote could not be recorded.');
            const up = controls.querySelector('[data-issue-vote="1"] span');
            const down = controls.querySelector('[data-issue-vote="-1"] span');
            const score = controls.querySelector('strong');
            if (up) up.textContent = String(data.votes?.upvotes || 0);
            if (down) down.textContent = String(data.votes?.downvotes || 0);
            if (score) score.textContent = String(data.votes?.score || 0);
        } catch (error) {
            window.alert(error?.message || 'Vote could not be recorded.');
        } finally {
            button.disabled = false;
        }
    }));
}
function formatFeedDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Recently'; }
function initHomeFeed() {
    const feed = document.getElementById('homeFeed');
    if (!feed) return;
    document.querySelectorAll('[data-feed-sort]').forEach((button) => button.addEventListener('click', () => {
        document.querySelectorAll('[data-feed-sort]').forEach((item) => item.classList.toggle('is-active', item === button));
        loadPortalFeed('community', 'homeFeed', button.dataset.feedSort || 'latest');
    }));
}
function initPortalMotion() { const targets = document.querySelectorAll('[data-reveal], .stream-card'); if (!('IntersectionObserver' in window)) { targets.forEach((target) => target.classList.add('is-visible')); return; } const observer = new IntersectionObserver((entries, instance) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); instance.unobserve(entry.target); } }), { threshold: 0.12 }); targets.forEach((target) => observer.observe(target)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

function syncStreamLandingState() {
    const landing = document.getElementById('streamLanding');
    const shell = document.querySelector('.app-shell');
    const routeKey = getCurrentStreamRoute();
    const isPortalRoute = ['accounts', 'volunteers', 'community', 'issues', 'about'].includes(routeKey) || window.location.pathname === '/';
    renderPublicPortal(routeKey);

    if (!landing || !shell) {
        return;
    }

    landing.style.display = isPortalRoute ? 'block' : 'none';
    shell.style.display = isPortalRoute ? 'none' : 'flex';

    document.querySelectorAll('#streamGrid a, .portal-doc-links a').forEach((link) => {
        const href = link.getAttribute('href') || '';
        const active = routeKey && href === `/${routeKey}`;
        link.classList.toggle('is-current', Boolean(active));
        if (active) link.setAttribute('aria-current', 'page');
        else link.removeAttribute('aria-current');
    });

    if (routeKey && SUBJECT_PAGES[routeKey]) {
        const meta = SUBJECT_PAGES[routeKey];
        document.title = `${meta.title} · NoteBooks`;
        if (window.location.pathname === `/${routeKey}`) {
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
        const data = window.appConfigPromise ? await window.appConfigPromise : window.appConfig;
        Object.assign(appConfig, data || {});
        window.appConfig = appConfig;
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
  const text = String(message).replace(/<[^>]+>/g, '');
  const workspaceStatus = document.getElementById('workspaceStatus');
  if (workspaceStatus) workspaceStatus.textContent = text;
  if (!statusEl) {
    console.debug('[app] status host is not present on this focused shell:', text);
    return;
  }
  statusEl.innerHTML = isLoading ? `<span class="loader"></span>${message}` : message;
  statusEl.classList.add("visible");
  setTimeout(() => statusEl.classList.remove("visible"), 3000);
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

let updatePollingStarted = false;
let updatePollingTimer = null;
async function startUpdatePolling() {
    if (updatePollingStarted) return;
    updatePollingStarted = true;
    await checkForAppUpdates();
    updatePollingTimer = window.setInterval(() => checkForAppUpdates(), UPDATE_POLL_INTERVAL);
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
    row.tabIndex = 0;
    if (hasChildren)
        row.setAttribute('aria-expanded', String(isExpanded));
    const activateNode = () => {
        setActiveTreePath(nodePath);
        if (node.type === 'file')
            openPreview(node.path, node.name, node.repo, node.branch, getNodeRepositoryPath(node, node.repoPath));
        else
            navigateToSidebarNode(node.path);
    };
    row.onclick = activateNode;
    row.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activateNode();
        }
    };
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
    const label = document.createElement('span');
    label.className = 'sidebar-tree-label';
    label.textContent = node.name;
    label.title = node.name;
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
  async function fetchTree(routeToken = 0) {
  const routeAtStart = getCurrentStreamRoute();
  showStatus("Loading files...", true);
  try {
    let tree = null;
    const requestedSlug = (window.CURRENT_STREAM || document.body?.dataset.subject || window.location.pathname.replace(/^\/+/, '').split('/')[0])?.toLowerCase() || '';
    const streamSlug = NoteBooksStreamRuntime.streams.has(requestedSlug) ? requestedSlug : '';
    if (streamSlug) {
        try {
            const streamPayload = NoteBooksStreamRuntime.getManifest() || await NoteBooksStreamRuntime.loadStreamTree();
            const hasStreamManifest = Boolean(streamPayload && Array.isArray(streamPayload.repos));
            const repoEntry = hasStreamManifest ? streamPayload.repos[0] : null;
            if (hasStreamManifest) {
                // An empty subject manifest is still authoritative: do not leak the
                // combined registry into another subject workspace. Phase-I payloads
                // expose a stream root so all configured repositories remain visible.
                tree = streamPayload.root || repoEntry?.tree || { type: 'folder', name: streamSlug, children: [] };
                console.info('[tree] Reused stream-scoped', streamSlug, 'workspace manifest');
            }
        } catch (streamTreeError) {
            console.warn('[tree] Stream tree unavailable, continuing with normal registry loading:', streamTreeError);
        }
    }
  const isGitHubPagesHost = window.location.hostname.endsWith('github.io');
        if (!tree && !isGitHubPagesHost) {
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
        if (routeToken && routeToken !== routeTransitionSerial) return;
        if (routeAtStart !== getCurrentStreamRoute()) return;
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
            if (splash) {
                splash.style.opacity = 0;
                setTimeout(() => { splash.style.display = 'none'; }, 600);
            }
            const workspaceStatus = document.getElementById('workspaceStatus');
            if (workspaceStatus) workspaceStatus.textContent = 'Ready';
        });
    }
    catch (error) {
        showStatus("Failed to generate tree: " + error.message);
        console.error(error);
        if (splash) {
            splash.style.opacity = 0;
            setTimeout(() => { splash.style.display = 'none'; }, 600);
        }
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
  if (!menu) return;
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
  const menu = document.getElementById("taskbarContextMenu");
  if (menu) menu.style.display = "none";
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
        const args = [selected.path, selected.name, selected.repo || '', selected.branch || '', selected.repoPath || selected.path, selected.raw || ''];
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
        const downloadPath = selected.repo ? selectedRepoPath : selected.path;
        let downloadUrl = `${window.location.origin}/api/raw?path=${encodeURIComponent(downloadPath)}`;
        if (selected.repo) {
            const branch = selected.branch || appConfig.GITHUB_BRANCH || 'main';
            const rawUrl = selected.raw || `https://raw.githubusercontent.com/${selected.repo}/${branch}/${downloadPath}`;
            downloadUrl += `&repo=${encodeURIComponent(selected.repo)}&branch=${encodeURIComponent(branch)}&raw=${encodeURIComponent(rawUrl)}`;
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
function openMobilePreview(path, filename, repo = '', branch = '', repoPath = '', precomputedRaw = '') {
    mobilePreviewTitle.textContent = filename;
    mobilePreview._filePath = path;
    mobilePreview._repo = repo;
    mobilePreview._branch = branch;
    mobilePreview._repoPath = repoPath || path;
    mobilePreview._filename = filename;
    fetchFileContent(path, filename, mobilePreviewContent, mobilePreview, repo, branch, repoPath, precomputedRaw);
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
function openNewMarkdownEditor() {
    const subject = getCurrentStreamRoute() || 'science';
    const suggestedPath = `notes/${subject}-new-note.md`;
    const requestedPath = window.prompt('Repository path for the new Markdown note:', suggestedPath);
    if (!requestedPath)
        return;
    const targetPath = String(requestedPath).trim().replace(/^\/+/, '').replace(/\\+/g, '/');
    if (!/^([a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.md$/i.test(targetPath) || targetPath.split('/').some((part) => part === '..')) {
        window.alert('Use a relative .md path without .. segments.');
        return;
    }
    const id = 'editor-' + (++previewId);
    const win = document.createElement('div');
    win.className = 'floating-window';
    win.style.top = `${100 + previewId * 10}px`;
    win.style.left = `${100 + previewId * 10}px`;
    win.dataset.id = id;
    win.innerHTML = `
    <div class="title-bar" onmousedown="startDrag(event, '${id}')">
      <div class="title">New Markdown note — ${escapeHTML(targetPath)}</div>
      <div class="buttons"><button onclick="minimizeWindow('${id}')">🗕</button><button onclick="toggleFullscreen('${id}')">🗖</button><button onclick="closeWindow('${id}')">✖</button></div>
    </div>
    <div class="preview-body sv-active" id="${id}-body"></div>`;
    previewContainer.appendChild(win);
    windows[id] = win;
    win._filePath = targetPath;
    win._repo = '';
    win._branch = appConfig.GITHUB_BRANCH || 'main';
    win._repoPath = targetPath;
    win._filename = targetPath.split('/').pop();
    win._isMarkdown = true;
    win._originalContent = '';
    win._splitActive = true;
    const body = document.getElementById(`${id}-body`);
    const editorPane = document.createElement('div');
    editorPane.className = 'sv-editor-pane sv-editor-pane-full';
    body.appendChild(editorPane);
    const onEditorClose = (editedContent) => {
        if (body) {
            body.innerHTML = '';
            const previewPane = document.createElement('div');
            previewPane.className = 'sv-preview-pane sv-preview-pane-full';
            previewPane.innerHTML = `<div class="markdown-content">${markdownToHTML(editedContent, targetPath)}</div>`;
            body.appendChild(previewPane);
            setTimeout(() => initMarkdownFeatures(previewPane), 0);
        }
        showStatus('✓ Draft updated — submit it as a pull request from the editor toolbar.');
    };
    MarkdownEditor.createEditorUI(editorPane, targetPath, '', onEditorClose, {
        subject,
        submissionPath: targetPath,
        branch: win._branch,
        isNewFile: true
    });
    updateTaskbar();
    setTimeout(() => toggleFullscreen(id, true), 100);
}

function openPreview(path, filename, repo = '', branch = '', repoPath = '', precomputedRaw = '') {
    injectSplitViewStyles();
    const id = 'preview-' + (++previewId);
    const win = document.createElement("div");
    win.className = "floating-window";
    win.style.top = `${100 + previewId * 10}px`;
    win.style.left = `${100 + previewId * 10}px`;
    win.dataset.id = id;
    const ext = filename.split('.').pop().toLowerCase();
    const isMarkdown = ext === 'md' || ext === 'mdx' || ext === 'markdown';
    const isFullScreen = isMarkdown || ext === 'pdf' || ext === 'html' || ext === 'htm'
        || ext === 'doc' || ext === 'docx' || ext === 'xls' || ext === 'xlsx'
        || ext === 'ppt' || ext === 'pptx';
    // Edit button — only for markdown files
    const editBtnHTML = isMarkdown
        ? `<button class="btn-edit-split" id="${id}-editbtn" title="Edit existing Markdown file" aria-label="Edit existing Markdown file" onclick="toggleSplitEditor('${id}')">
         <svg class="editor-button-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg><span class="edit-label">Open editor</span><span class="sv-dot"></span>
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
    fetchFileContent(path, filename, container, win, repo, branch, repoPath, precomputedRaw);
    updateTaskbar();
    if (isFullScreen)
        setTimeout(() => toggleFullscreen(id, true), 100);
}
// ─── fetchFileContent ─────────────────────────────────────────────────────────
async function fetchFileContent(path, filename, container, winElement = null, repo = '', branch = '', repoPath = '', precomputedRaw = '') {
    const ext = (filename.includes('.') ? filename : path).split('.').pop().toLowerCase();
    container.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100%;"><span class="loader"></span> Loading...</div>';
    const delivery = window.NoteBooksRawDelivery;
    if (!delivery) throw new Error('Raw delivery module is unavailable');
    const deliveryOptions = {
        repo,
        branch,
        repoPath,
        precomputedRaw,
        origin: window.location.origin,
        appConfig,
        isGitHubPages: window.location.hostname.endsWith('github.io'),
        githubRepo: appConfig.GITHUB_REPO,
        githubBranch: appConfig.GITHUB_BRANCH || 'main',
        pagesBase: repo ? pagesBaseForRepository(repo) : '',
        pagesFallbackUrl: buildPagesUrl(path)
    };
    const sourceCandidates = (p) => delivery.sourceCandidates({ ...deliveryOptions, path: p });
    const resolveSourceUrl = (p) => delivery.resolveSourceUrl({ ...deliveryOptions, path: p });
    const mediaSrcAttrs = (candidates) => delivery.mediaSrcAttrs(candidates);
    const fetchUrlWithFallback = (p) => delivery.fetchText({ ...deliveryOptions, path: p });
    const rawUrl = await resolveSourceUrl(path);
    try {
        if (/\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(filename)) {
            container.innerHTML = `<img ${mediaSrcAttrs(sourceCandidates(path, true))} style="max-width:100%;height:auto;display:block;margin:auto;" alt="${filename}" />`;
        }
        else if (/\.(mp3|wav|ogg|flac)$/i.test(filename)) {
            container.innerHTML = `<audio controls ${mediaSrcAttrs(sourceCandidates(path, true))} style="width:100%;display:block;margin-top:20px"></audio>`;
        }
        else if (/\.(mp4|webm)$/i.test(filename)) {
            container.innerHTML = `<video controls ${mediaSrcAttrs(sourceCandidates(path, true))} style="max-width:100%;max-height:100%;display:block;margin:auto"></video>`;
        }
        else if (/\.(docx?|xlsx?|pptx?)$/i.test(filename.includes('.') ? filename : path)) {
            const viewerUrl = `https://docs.google.com/gviewer?embedded=true&url=${encodeURIComponent(rawUrl)}`;
            container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
            container.innerHTML = `<iframe src="${viewerUrl}" style="flex:1;min-height:0;width:100%;border:none;display:block;" allowfullscreen></iframe>`;
        }
        else if (ext === 'html' || ext === 'htm') {
            container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
            container.innerHTML = `<iframe src="${await resolveSourceUrl(path)}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;
        }
        else if (ext === 'pdf') {
            container.style.cssText = 'padding:0;overflow:hidden;display:flex;flex-direction:column;flex-grow:1;min-height:0;';
            const targetPath = repo ? (repoPath || path) : path;
            const proxied = await resolveSourceUrl(targetPath);
            container.innerHTML = `<iframe src="${proxied}" style="flex:1;min-height:0;width:100%;border:none;display:block;"></iframe>`;
        }
        else if (ext === 'md' || ext === 'mdx' || ext === 'markdown') {
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
function sourceLineFromNode(node) {
  const element = node && node.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  const line = element?.closest?.('[data-source-line]')?.dataset.sourceLine;
  return line ? Number(line) : null;
}

function sourceRangeForSelection(selection, sourceText) {
  if (!selection || selection.isCollapsed || !selection.toString().trim()) return null;
  const selectedText = selection.toString();
  const rawStart = sourceLineFromNode(selection.anchorNode);
  const rawEnd = sourceLineFromNode(selection.focusNode);
  if (rawStart && rawEnd) {
    const startLine = Math.min(rawStart, rawEnd);
    const endLine = Math.max(rawStart, rawEnd);
    const lines = String(sourceText || '').split(/\r?\n/);
    return { startLine, endLine, selectedText, sourceText: lines.slice(startLine - 1, endLine).join('\n') };
  }
  const normalized = selectedText.replace(/\s+/g, ' ').trim();
  const sourceLines = String(sourceText || '').split(/\r?\n/);
  let startIndex = String(sourceText || '').indexOf(selectedText);
  if (startIndex < 0) {
    startIndex = sourceLines.findIndex((line) => line.replace(/\s+/g, ' ').trim().includes(normalized));
    if (startIndex >= 0) return { startLine: startIndex + 1, endLine: startIndex + 1, selectedText, sourceText: sourceLines[startIndex] };
  }
  if (startIndex < 0) return null;
  const endIndex = startIndex + selectedText.length;
  return { startLine: String(sourceText).slice(0, startIndex).split(/\r?\n/).length, endLine: String(sourceText).slice(0, endIndex).split(/\r?\n/).length, selectedText, sourceText: String(sourceText).slice(startIndex, endIndex) };
}

function openSuggestChangesComposer(win, sourceText, filePath, evidence) {
  const existing = document.getElementById('suggest-changes-dialog');
  if (existing) existing.remove();
  if (!evidence) {
    showStatus('Select source text that maps to a source line, or use Raw view for exact line selection.');
    return;
  }
  const dialog = document.createElement('div');
  dialog.id = 'suggest-changes-dialog';
  dialog.className = 'suggest-changes-dialog';
  const repo = win?._repo || appConfig.GITHUB_REPO || '';
  const branch = win?._branch || appConfig.GITHUB_BRANCH || 'main';
  const stream = typeof getCurrentStreamRoute === 'function' ? getCurrentStreamRoute() : '';
  dialog.innerHTML = `<div class="suggest-changes-card" role="dialog" aria-modal="true" aria-labelledby="suggest-changes-title"><div class="suggest-changes-header"><div><span class="markdown-mode-label">Issues</span><h2 id="suggest-changes-title">Suggest changes</h2></div><button type="button" class="suggest-changes-close" aria-label="Close">×</button></div><p class="suggest-changes-context">${escapeHTML(repo || 'Source repository')} · ${escapeHTML(filePath)} · lines ${evidence.startLine}–${evidence.endLine}</p><pre class="suggest-changes-selection">${escapeHTML(evidence.sourceText)}</pre><form id="suggest-changes-form"><label>Short title<input name="title" maxlength="200" required placeholder="What should be improved?" /></label><label>Why should this change? <textarea name="body" maxlength="20000" minlength="20" required placeholder="Explain the issue for the reviewer."></textarea></label><div class="suggest-changes-actions"><button type="button" class="landing-secondary" data-suggest-cancel>Cancel</button><button type="submit" class="landing-primary">Raise issue</button><span class="suggest-changes-status" role="status"></span></div></form></div>`;
  document.body.appendChild(dialog);
  const close = () => dialog.remove();
  dialog.querySelector('.suggest-changes-close')?.addEventListener('click', close);
  dialog.querySelector('[data-suggest-cancel]')?.addEventListener('click', close);
  dialog.querySelector('#suggest-changes-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('.suggest-changes-status');
    const token = window.ModernAuthInstance?.getToken?.() || '';
    if (!token) { if (status) status.textContent = 'Sign in from Settings before raising an issue.'; return; }
    const values = Object.fromEntries(new FormData(form).entries());
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Submitting to NoteBooks-Issues…';
    try {
      const response = await fetch('/api/issues/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, credentials: 'same-origin', body: JSON.stringify({ title: values.title, body: values.body, stream, sourceRepository: repo, sourceBranch: branch, sourcePath: win?._repoPath || filePath, sourceStartLine: evidence.startLine, sourceEndLine: evidence.endLine, sourceText: evidence.sourceText, sourceCommit: win?._commit || '' }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Issue submission failed (${response.status})`);
      if (status) status.textContent = 'Issue raised for review.';
      setTimeout(close, 900);
    } catch (error) { if (status) status.textContent = error.message || 'Issue submission failed.'; if (button) button.disabled = false; }
  });
  dialog.querySelector('input')?.focus();
}

function renderRawMarkdown(text) {
  const lines = String(text || '').split(/\r?\n/);
  const renderedLines = lines.map((line, index) => `<span class="raw-source-line" data-source-line="${index + 1}"><span class="raw-line-number" aria-hidden="true">${index + 1}</span><span class="raw-line-text">${escapeHTML(line) || ' '}</span></span>`).join('');
  return `<pre class="raw-markdown-line-view" data-raw-source="true"><code>${renderedLines}</code></pre>`;
}

function renderMarkdownIntoContainer(text, filePath, container) {
  const win = container.closest('.floating-window');
  const toolbar = document.createElement('div');
  toolbar.className = 'markdown-mode-toolbar';
  toolbar.innerHTML = '<span class="markdown-mode-label">Document</span><button type="button" data-mode="preview" class="active">Reader</button><button type="button" data-mode="raw">Raw view</button>';
  const wrapper = document.createElement('div');
  wrapper.className = 'markdown-content';
  wrapper.dataset.sourceFile = filePath || '';
  let lastEvidence = null;
  wrapper.innerHTML = markdownToHTML(text, filePath);
  container.innerHTML = '';
  container.appendChild(toolbar);
  container.appendChild(wrapper);

  const suggestButton = document.createElement('button');
  suggestButton.type = 'button';
  suggestButton.dataset.mode = 'suggest';
  suggestButton.textContent = 'Suggest changes';
  suggestButton.className = 'markdown-suggest-button';
  suggestButton.disabled = true;
  suggestButton.title = 'Select source text first';
  suggestButton.addEventListener('mousedown', (event) => event.preventDefault());
  suggestButton.addEventListener('click', () => openSuggestChangesComposer(win, text, filePath, lastEvidence));
  toolbar.appendChild(suggestButton);
  wrapper.addEventListener('mouseup', () => {
    const selection = window.getSelection();
    if (!selection || !wrapper.contains(selection.anchorNode) || !wrapper.contains(selection.focusNode)) return;
    lastEvidence = sourceRangeForSelection(selection, text);
    suggestButton.disabled = !lastEvidence;
    suggestButton.title = lastEvidence ? `Suggest changes for lines ${lastEvidence.startLine}–${lastEvidence.endLine}` : 'Select source text that maps to source lines';
  });

  const setMode = (mode) => {
    toolbar.querySelectorAll('button[data-mode="preview"], button[data-mode="raw"]').forEach((item) => item.classList.toggle('active', item.dataset.mode === mode));
    if (mode === 'raw') {
      wrapper.classList.add('raw-markdown');
      wrapper.innerHTML = renderRawMarkdown(text);
      return;
    }
    wrapper.classList.remove('raw-markdown');
    wrapper.innerHTML = markdownToHTML(text, filePath);
    setTimeout(() => initMarkdownFeatures(wrapper), 0);
  };

  toolbar.querySelectorAll('button[data-mode="preview"], button[data-mode="raw"]').forEach((button) => button.addEventListener('click', () => {
    setMode(button.dataset.mode || 'preview');
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
        if (win._originalContent === null || win._originalContent === undefined) {
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
        MarkdownEditor.createEditorUI(editorPane, win._filePath, win._originalContent, onEditorClose, {
            subject: getCurrentStreamRoute(),
            submissionPath: win._repoPath || win._filePath,
            repo: win._repo || '',
            branch: win._branch || '',
            isNewFile: false
        });
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
    if (contextMenu) contextMenu.style.display = "none";
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
async function bootNoteBooks() {
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
  if (typeof initLocalLandingDocs === 'function') initLocalLandingDocs();
  initPortalMotion();
  await fetchConfig();
  applyWorkspaceBranding();
  syncStreamLandingState();
  const isPortalRoute = ['accounts', 'volunteers', 'community', 'issues', 'about'].includes(getCurrentStreamRoute()) || window.location.pathname === '/';
  if (isPortalRoute) hideSplash();
    // Subject pages are rendered into the dedicated content mount in the shared app shell.
    // We intentionally do not replace the whole app shell here, because that destroys
    // the existing navigation and workspace state and causes the placeholder issue.
    const streamContentRoot = document.getElementById('streamContentRoot');
    if (streamContentRoot && getCurrentStreamRoute()) {
        streamContentRoot.hidden = false;
        const landing = document.getElementById('streamLanding');
        if (landing)
            landing.hidden = true;
    }
  const utilityTitle = document.getElementById('utilityWorkspaceTitle');
  if (utilityTitle) utilityTitle.textContent = document.getElementById('workspaceHeader')?.textContent || 'NoteBooks';
  const activeRoute = getCurrentStreamRoute();
    const shouldLoadWorkspace = NoteBooksStreamRuntime.streams.has(activeRoute);
  if (shouldLoadWorkspace) {
    await NoteBooksStreamRuntime.loadStreamTree();
    await startUpdatePolling();
    await fetchTree();
  }
  maybeShowVercelPopup();
}
void bootNoteBooks();
