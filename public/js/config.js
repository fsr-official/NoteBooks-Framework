(function () {
  // app.js owns subject-tree fetching and startup ordering. This file only
  // provides the shared config object for pages that load before app.js.
  window.appConfig = window.appConfig || {
    GITHUB_REPO: '',
    GITHUB_BRANCH: 'main',
    APP_URL: '',
    GITPAGE_URL: '',
    WORKSPACE: '',
    REPOS: []
  };
})();
