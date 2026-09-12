/* NoteBooks raw-delivery runtime. Owns source selection and fallback fetching only. */
(() => {
  const normalize = (value) => String(value || '').replace(/^\/+/, '');

  function sourcePathForRepository(path, repoPath, repo) {
    const rawPath = normalize(repoPath || path);
    const repoName = String(repo || '').split('/').pop() || '';
    return repoName && rawPath.toLowerCase().startsWith(`${repoName.toLowerCase()}/`)
      ? rawPath.slice(repoName.length + 1)
      : rawPath;
  }

  function localFileUrl(path, origin) {
    const cleaned = normalize(path);
    return `${origin}/files/${cleaned.split('/').map((segment) => encodeURIComponent(segment)).join('/')}`;
  }

  function sourceCandidates(options) {
    const path = normalize(options.path);
    const origin = options.origin || window.location.origin;
    if (options.repo) {
      const branch = options.branch || options.appConfig?.GITHUB_BRANCH || 'main';
      const sourcePath = sourcePathForRepository(path, options.repoPath, options.repo);
      const rawGithub = options.precomputedRaw || `https://raw.githubusercontent.com/${options.repo}/${branch}/${sourcePath}`;
      const jsdelivr = `https://cdn.jsdelivr.net/gh/${options.repo}@${branch}/${sourcePath}`;
      const apiRaw = `${origin}/api/raw?path=${encodeURIComponent(sourcePath)}&repo=${encodeURIComponent(options.repo)}&branch=${encodeURIComponent(branch)}&raw=${encodeURIComponent(rawGithub)}`;
      const pages = options.pagesBase ? [`${String(options.pagesBase).replace(/\/$/, '')}/${sourcePath}`] : [];
      return [apiRaw, ...pages, rawGithub, jsdelivr];
    }
    const candidates = [`${origin}/api/raw?path=${encodeURIComponent(path)}`];
    if (options.isGitHubPages && options.githubRepo) {
      candidates.push(`https://raw.githubusercontent.com/${options.githubRepo}/${options.githubBranch || 'main'}/${path}`);
    }
    candidates.push(localFileUrl(path, origin));
    if (options.pagesFallbackUrl) candidates.push(options.pagesFallbackUrl);
    return candidates;
  }

  function resolveSourceUrl(options) {
    return sourceCandidates({ ...options, forEmbed: true })[0] || localFileUrl(options.path, options.origin || window.location.origin);
  }

  function mediaSrcAttrs(candidates) {
    const [first, ...rest] = candidates;
    return `src="${first}" data-fallbacks='${JSON.stringify(rest).replace(/'/g, '&#39;')}' onerror="window.__ntbkMediaFallback(this)"`;
  }

  async function fetchText(options) {
    let lastError = null;
    for (const candidate of sourceCandidates(options)) {
      try {
        const response = await fetch(candidate, { cache: 'no-store' });
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('text/html') || candidate.endsWith('.html') || candidate.endsWith('.htm')) {
            return await response.text();
          }
        }
        lastError = new Error(`HTTP ${response.status}`);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error('Source file unavailable');
  }

  if (!window.__ntbkMediaFallback) {
    window.__ntbkMediaFallback = (element) => {
      let list;
      try { list = JSON.parse(element.dataset.fallbacks || '[]'); } catch { list = []; }
      const next = list.shift();
      if (!next) { element.removeAttribute('onerror'); return; }
      element.dataset.fallbacks = JSON.stringify(list);
      element.src = next;
    };
  }

  window.NoteBooksRawDelivery = { sourceCandidates, resolveSourceUrl, mediaSrcAttrs, fetchText, localFileUrl };
})();
