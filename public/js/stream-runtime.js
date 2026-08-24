/* Stream artifact runtime. Owns stream-to-JSON mapping and runtime manifest state. */
const STREAM_ARTIFACTS = Object.freeze({
    science: '/public/json/science-tree.json',
    commerce: '/public/json/commerce-tree.json',
    humanities: '/public/json/humanities-tree.json'
});
const state = { manifest: null, loadPromise: null };
function loadStreamTree() {
    if (state.loadPromise) return state.loadPromise;
    state.loadPromise = (async () => {
        try {
            const stream = (window.CURRENT_STREAM || (window.location.pathname.split('/').filter(Boolean)[0]) || '').toLowerCase();
            if (!stream || !STREAM_ARTIFACTS[stream]) return null;
            // Build-time artifacts are canonical for the browser. The runtime API is
            // only a compatibility fallback when a deployment omitted an artifact.
            const runtimeUrl = `/api/system/${stream}`;
            const jsonUrl = STREAM_ARTIFACTS[stream] || "";
            let res = await fetch(jsonUrl, { cache: 'default' });
            if (!res.ok) res = await fetch(runtimeUrl, { cache: 'no-store' });
            if (!res.ok) {
                console.debug('No stream-tree manifest at', jsonUrl, 'status', res.status);
                return null;
            }
            state.manifest = await res.json();
            if (state.manifest && Array.isArray(state.manifest.repos)) {
                appConfig.REPOS = state.manifest.repos;
                if (state.manifest.repos.length > 0) {
                    const primary = state.manifest.repos[0];
                    if (primary.repo) appConfig.GITHUB_REPO = primary.repo;
                    if (primary.branch) appConfig.GITHUB_BRANCH = primary.branch;
                    if (primary.pagesBase) appConfig.GITPAGE_URL = primary.pagesBase;
                }
                console.debug('Loaded stream tree for', stream, state.manifest.repos.length, 'repos');
            }
            return state.manifest;
        } catch (err) {
            console.warn('Failed to load stream tree manifest:', err);
            return null;
        }
    })();
    return state.loadPromise;
}

const NoteBooksStreamRuntime = {
  artifacts: STREAM_ARTIFACTS,
  streams: new Set(Object.keys(STREAM_ARTIFACTS)),
  getManifest: () => state.manifest,
  reset: () => { state.manifest = null; state.loadPromise = null; },
  streamArtifactUrl: (stream) => STREAM_ARTIFACTS[stream] || '',
  loadStreamTree
};
window.NoteBooksStreamRuntime = NoteBooksStreamRuntime;
window.loadStreamTree = loadStreamTree;
