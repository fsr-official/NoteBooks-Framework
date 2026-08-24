(function () {
  // Shared runtime configuration boundary. Every browser module uses this promise
  // rather than starting its own /api/config request.
  window.appConfig = window.appConfig || {
    GITHUB_REPO: '',
    GITHUB_BRANCH: 'main',
    APP_URL: '',
    GITPAGE_URL: '',
    WORKSPACE: '',
    REPOS: []
  };

  if (!window.appConfigPromise) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);
    window.appConfigPromise = fetch('/api/config', { cache: 'default', credentials: 'same-origin', signal: controller.signal })
      .then((response) => response.ok ? response.json() : {})
      .then((data) => {
        Object.assign(window.appConfig, data || {});
        return window.appConfig;
      })
      .catch((error) => {
        console.warn('[config] shared config request failed; using defaults', error);
        return window.appConfig;
      })
      .finally(() => clearTimeout(timeoutId));
  }
})();
