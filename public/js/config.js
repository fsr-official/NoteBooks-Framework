// Config and subject manifest loader
(function(){
  window.appConfig = window.appConfig || {
    GITHUB_REPO: '',
    GITHUB_BRANCH: 'main',
    APP_URL: '',
    GITPAGE_URL: '',
    WORKSPACE: '',
    REPOS: []
  };

  async function loadSubjectTree() {
    try {
      const subject = (window.CURRENT_SUBJECT || (window.location.pathname.split('/').filter(Boolean)[0]) || 'science').toLowerCase();
      const jsonUrl = `/public/json/${subject}-tree.json`;
      const rootUrl = `/public/${subject}-tree.json`;
      let res = await fetch(jsonUrl, { cache: 'no-store' });
      if (!res.ok) res = await fetch(rootUrl, { cache: 'no-store' });
      if (!res.ok) {
        console.debug('No subject-tree manifest at', jsonUrl, 'or', rootUrl, 'status', res.status);
        return null;
      }
      const subjectTreeManifest = await res.json();
      if (subjectTreeManifest && Array.isArray(subjectTreeManifest.repos)) {
        window.appConfig.REPOS = subjectTreeManifest.repos;
        const primary = subjectTreeManifest.repos[0];
        if (primary?.repo) window.appConfig.GITHUB_REPO = primary.repo;
        if (primary?.branch) window.appConfig.GITHUB_BRANCH = primary.branch;
        if (primary?.pagesBase) window.appConfig.GITPAGE_URL = primary.pagesBase;
      }
      return subjectTreeManifest;
    } catch (err) {
      console.warn('Failed to load subject tree manifest in config.js:', err);
      return null;
    }
  }

  // expose
  window.loadSubjectTree = loadSubjectTree;
  // best-effort load
  loadSubjectTree().catch(()=>{});
})();
