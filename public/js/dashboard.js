(() => {
  const root = document.getElementById('dashboardRoot') || document.getElementById('personal-space');
  const status = document.getElementById('dashboardStatus');
  const overview = document.getElementById('dashboardOverview');
  const metrics = document.getElementById('dashboardMetrics');
  const streams = document.getElementById('dashboardStreams');
  const activity = document.getElementById('dashboardActivity');

  if (!root || !status || !overview || !metrics || !streams || !activity) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);

  const formatDate = (value) => {
    if (!value) return 'recently';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const render = (data) => {
    const viewer = data.viewer || {};
    const counts = data.metrics || {};
    status.innerHTML = viewer.signedIn
      ? `<strong>${escapeHtml(viewer.email || 'Signed in')}</strong>Personal activity is connected to this view.`
      : '<strong>Guest view</strong>Sign in later to connect activity and votes.';

    overview.textContent = data.capabilities?.database
      ? 'Your project view is connected to persisted activity and the current NoteBooks data layer.'
      : 'The project view is ready. Persistent activity will appear after the database foundation is connected.';

    const metricItems = [
      ['streams', 'Learning streams'],
      ['communityPosts', 'Community posts'],
      ['issueProposals', 'Issue proposals'],
      ['activeThemePresets', 'Active themes'],
    ];
    metrics.innerHTML = metricItems.map(([key, label]) => `<div class="dashboard-metric"><strong>${escapeHtml(counts[key] ?? 0)}</strong><span>${label}</span></div>`).join('');

    streams.innerHTML = (data.streams || []).map((stream) => `<a class="dashboard-link" href="${escapeHtml(stream.href)}"><span>${escapeHtml(stream.label)}</span><span aria-hidden="true">→</span></a>`).join('');

    const items = Array.isArray(data.activity) ? data.activity : [];
    activity.innerHTML = items.length
      ? items.map((item) => `<div class="dashboard-activity-item"><div><strong>${escapeHtml(item.action || 'Project activity')}</strong><small>${escapeHtml([item.area, item.stream, item.repository, item.file_path].filter(Boolean).join(' · '))}</small></div><small>${escapeHtml(formatDate(item.created_at))}</small></div>`).join('')
      : `<div class="dashboard-empty">${viewer.signedIn ? 'No linked activity has been recorded yet.' : 'Sign in to connect your activity to this Dashboard.'}</div>`;
  };

  const request = typeof window.noteBooksRequestJson === 'function'
    ? window.noteBooksRequestJson('/api/dashboard', { headers: { Accept: 'application/json' }, credentials: 'same-origin' }, 1800)
    : fetch('/api/dashboard', { headers: { Accept: 'application/json' }, credentials: 'same-origin' }).then((response) => {
      if (!response.ok) throw new Error(`Dashboard request failed (${response.status})`);
      return response.json();
    });
  request.then(render).catch((error) => {
      status.innerHTML = '<strong>Dashboard unavailable</strong>Showing the offline project outline.';
      overview.textContent = error?.message || 'The Dashboard data service is temporarily unavailable.';
      metrics.innerHTML = '<div class="dashboard-empty">Project metrics are unavailable.</div>';
      streams.innerHTML = '<a class="dashboard-link" href="/science"><span>Open Science</span><span aria-hidden="true">→</span></a>';
    });
})();
