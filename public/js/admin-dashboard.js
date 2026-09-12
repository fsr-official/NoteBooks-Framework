(() => {
  const status = document.getElementById('adminDashboardStatus');
  const overview = document.getElementById('adminDashboardOverview');
  const metrics = document.getElementById('adminDashboardMetrics');
  const modules = document.getElementById('adminDashboardModules');
  if (!status || !overview || !metrics || !modules) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const render = (data) => {
    status.innerHTML = '<strong>Administrator boundary verified</strong>Control-center data loaded securely.';
    overview.textContent = data.persisted
      ? 'The control center is connected to the persisted Phase-2 foundation.'
      : 'The control-center shell is ready; connect the production database to populate operational counts.';

    const countItems = [
      ['users', 'Users'],
      ['pendingCommunityPosts', 'Pending posts'],
      ['submittedIssues', 'Issue queue'],
      ['openPullRequests', 'Open PRs'],
      ['activeThemePresets', 'Active themes'],
      ['auditEvents', 'Audit events'],
    ];
    metrics.innerHTML = countItems.map(([key, label]) => `<div class="dashboard-metric"><strong>${escapeHtml(data.counts?.[key] ?? 0)}</strong><span>${label}</span></div>`).join('');

    modules.innerHTML = (data.modules || []).map((module) => `<a class="dashboard-module" href="${escapeHtml(module.href || '#')}"><span><strong>${escapeHtml(module.label)}</strong><small>${escapeHtml(module.key)}</small></span><span class="dashboard-module-status">${escapeHtml(module.status)}</span></a>`).join('');
  };

  fetch('/api/admin/dashboard', { headers: { Accept: 'application/json' }, credentials: 'same-origin' })
    .then((response) => {
      if (response.status === 401 || response.status === 403) throw new Error('Administrator authentication is required for this control center.');
      if (!response.ok) throw new Error(`Admin Dashboard request failed (${response.status})`);
      return response.json();
    })
    .then(render)
    .catch((error) => {
      status.innerHTML = '<strong>Guarded surface</strong>Administrator verification is required.';
      overview.textContent = error?.message || 'The admin control-center data service is unavailable.';
      metrics.innerHTML = '<div class="dashboard-empty">No privileged data was exposed.</div>';
      modules.innerHTML = '<a class="dashboard-module" href="/accounts"><span><strong>Sign in to continue</strong><small>identity and security</small></span><span class="dashboard-module-status">guarded</span></a>';
    });
})();
