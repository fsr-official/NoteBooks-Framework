(() => {
  const root = document.getElementById('portalRoot');
  if (!root) return;

  const pages = {
    community: {
      kicker: 'Open discussion',
      title: 'A thoughtful place to ask, answer, and compare notes.',
      copy: 'Community conversations are grounded in the three stream libraries and surfaced from the GitHub-backed feed.',
      links: [{ label: 'Latest discussions', href: '/community?sort=latest' }, { label: 'Trending now', href: '/community?sort=trending' }],
      feed: 'community'
    },
    issues: {
      kicker: 'Improve the shelf',
      title: 'Spot a gap. Make a clear request. Help the library get better.',
      copy: 'Issues turn reader friction into visible, actionable work for the NoteBooks community.',
      links: [{ label: 'Latest issues', href: '/issues?sort=latest' }, { label: 'Active work', href: '/issues?status=open' }],
      feed: 'issues'
    },
    volunteers: {
      kicker: 'Contribute your craft',
      title: 'There is more than one way to leave the shelf better.',
      copy: 'Help with reference books, AI support, moderation, or coding. Applications continue through your account.',
      links: [{ label: 'Reference books', href: '/accounts' }, { label: 'Moderation and coding', href: '/accounts' }]
    },
    accounts: {
      kicker: 'Your NoteBooks account',
      title: 'Keep your learning room close at hand.',
      copy: 'Sign in to contribute, apply for volunteer work, upload notes, and manage your shared reading-room preferences.',
      links: [{ label: 'Open personal space', href: '/settings#personal-space' }, { label: 'Contribution access', href: '/volunteers' }]
    },
    about: {
      kicker: 'The NoteBooks mission',
      title: 'Knowledge becomes more useful when it is easier to enter and easier to improve.',
      copy: 'NoteBooks is for learners, contributors, reviewers, and maintainers who want stream libraries that are readable, structured, and open to careful improvement.',
      links: [{ label: 'Browse streams', href: '/science' }, { label: 'Contribute', href: '/volunteers' }]
    }
  };

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const formatDate = (value) => { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : 'Recently'; };
  const slug = window.location.pathname.replace(/^\/+|\/+$/g, '').split('/')[0] || 'about';
  const page = pages[slug] || pages.about;

  if (slug === 'about') {
    root.innerHTML = `<div class="portal-page about-page"><section class="about-hero" aria-labelledby="about-title"><div class="landing-kicker">About NoteBooks</div><h1 id="about-title">An open reading room for learning, making, and improving knowledge together.</h1><p>NoteBooks brings curriculum-aligned libraries, a careful Markdown reader, and community-led improvement into one readable place.</p></section><div class="about-sections"><section class="about-section about-section--idea" aria-labelledby="about-idea-title"><div class="about-section-index">01</div><div><div class="about-section-kicker">The idea</div><h2 id="about-idea-title">Make good knowledge easier to enter and easier to improve.</h2><p>NoteBooks organizes Science, Commerce, and Humanities as eager, searchable stream libraries. Learners can read structured notes, follow source files, discuss gaps, and propose careful improvements without losing the connection to the original repository.</p><p>The project is built around a simple principle: open educational material becomes more useful when its structure, source, and path to improvement are visible.</p></div></section><section class="about-section" aria-labelledby="about-inspirations-title"><div class="about-section-index">02</div><div><div class="about-section-kicker">Inspirations</div><h2 id="about-inspirations-title">A practical blend of open learning and thoughtful software.</h2><p>The early direction and parts of the frontend and rendering foundation were inspired by <a href="https://github.com/Pratyush-Chanda/Ada" target="_blank" rel="noreferrer">Pratyush Chanda’s Ada project</a>. NoteBooks has since developed its own Express, registry, raw-delivery, community, Issues, authentication, and persistence boundaries.</p><p>It is also inspired by open-source documentation, repository-based collaboration, and the everyday need for learning material that feels less like a file dump and more like a welcoming reading room.</p></div></section><section class="about-section" aria-labelledby="about-contributors-title"><div class="about-section-index">03</div><div><div class="about-section-kicker">Coding contributors</div><h2 id="about-contributors-title">Built through shared implementation work.</h2><p class="about-contributors-note">This list reflects named contributors in the repository history. It is intentionally separate from inspiration and attribution notices.</p><div class="about-contributors" role="list"><div class="about-contributor" role="listitem"><strong>FSR Official</strong><span>NoteBooks Framework core development</span></div><div class="about-contributor" role="listitem"><strong>Harshit Saha</strong><span>Application development and integration</span></div><div class="about-contributor" role="listitem"><strong>Pratyush Chanda</strong><span>Source project and NoteBooks collaboration</span></div><div class="about-contributor" role="listitem"><strong>SlickMojang11</strong><span>Repository contributions</span></div></div></div></section></div></div>`;
    return;
  }

  if (slug === 'accounts') {
    root.innerHTML = `<div class="portal-page accounts-page"><section class="accounts-hero" aria-labelledby="accounts-title"><div class="landing-kicker">Your NoteBooks account</div><h1 id="accounts-title">Sign in when you are ready to contribute.</h1><p>Accounts are the home for identity, profile presence, volunteer access, and contribution permissions. Reading preferences and your personal dashboard remain in Settings.</p><div class="accounts-actions"><button class="landing-primary" id="accountsSignIn" type="button">Sign in or create an account <span aria-hidden="true">→</span></button><a class="landing-secondary" href="/settings#personal-space">Open personal space</a></div></section><section class="accounts-panel" aria-labelledby="accounts-access-title"><div class="portal-panel-header"><span>Account access</span><strong id="accounts-access-title">Identity and participation</strong></div><div class="accounts-access-grid"><article><h2>Sign in</h2><p>Use your account to join conversations, maintain your profile, apply for volunteer work, and submit improvements.</p><button class="landing-primary" type="button" id="accountsSignInSecondary">Open sign-in</button></article><article><h2>Keep Settings personal</h2><p>Theme, reading controls, activity, and dashboard information stay in Settings. Account authentication does not appear there.</p><a class="portal-doc-link" href="/settings#appearance">View preferences</a></article></div></section></div>`;
    document.querySelectorAll('#accountsSignIn, #accountsSignInSecondary').forEach((button) => button.addEventListener('click', () => window.showLoginScreen?.()));
    return;
  }

  root.innerHTML = `<div class="portal-page"><div class="landing-hero"><div class="landing-kicker">${escapeHtml(page.kicker)}</div><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.copy)}</p><div class="landing-actions"><a class="landing-secondary" href="/">Back to home</a></div></div><div class="portal-grid"><section class="portal-panel portal-panel--wide"><div class="portal-panel-header"><span>NoteBooks</span><strong>Explore this space</strong></div><div class="portal-doc-links">${page.links.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('')}</div>${page.feed ? `<div class="feed-switcher" role="group" aria-label="Activity sorting"><button type="button" class="feed-switch is-active" data-portal-sort="latest">Latest</button><button type="button" class="feed-switch" data-portal-sort="trending">Trending</button></div><div class="portal-feed" id="portalFeed" role="status" aria-live="polite">Loading live activity…</div>${page.feed === 'community' ? `<section class="community-profile-tools" aria-labelledby="community-profiles-title"><div class="portal-panel-header"><span>Member profiles</span><strong id="community-profiles-title">Presence and roles</strong></div><div id="ownProfileEditor" class="own-profile-editor"></div><div id="communityProfiles" class="community-profiles" role="list" aria-live="polite">Loading public profiles…</div></section>` : ''}` : ''}</section><section class="portal-panel"><div class="portal-panel-header"><span>Next step</span><strong>Keep moving</strong></div><p class="mission-copy">Choose one small action. Read a page, ask a question, or make a contribution that another learner can build on.</p></section></div></div>`;

  const feed = document.getElementById('portalFeed');
  const profileList = document.getElementById('communityProfiles');
  const ownProfileEditor = document.getElementById('ownProfileEditor');
  const authToken = () => window.ModernAuthInstance?.getToken?.() || '';
  let activeChannel = null;
  let availableChannels = [];

  function renderChannelWorkspace() {
    if (page.feed !== 'community') return;
    const panel = root.querySelector('.portal-panel--wide');
    const feedSwitcher = root.querySelector('.feed-switcher');
    if (!panel || !feedSwitcher || document.getElementById('communityChannelWorkspace')) return;
    feedSwitcher.insertAdjacentHTML('beforebegin', `<section class="community-channel-workspace" id="communityChannelWorkspace" aria-labelledby="community-channels-title"><div class="portal-panel-header"><span>Community</span><strong id="community-channels-title">Channels</strong></div><div class="channel-layout"><nav class="channel-list" id="communityChannelList" aria-label="Community channels"><p class="feed-loading">Loading channels…</p></nav><section class="channel-room" aria-live="polite"><div class="channel-room-header"><div><strong id="activeChannelName">Select a channel</strong><span id="activeChannelDescription"></span></div><span id="channelReadStatus" class="channel-read-status"></span></div><div class="channel-messages" id="communityChannelMessages"><p class="feed-empty">Choose a channel to read messages.</p></div><form class="channel-composer" id="communityChannelComposer"><label id="channelProposalLinkWrap" for="channelProposalId" hidden>Issue proposal ID<input id="channelProposalId" name="issueProposalId" type="number" min="1" inputmode="numeric" placeholder="Optional proposal reference" /></label><label for="channelMessageInput">Message</label><div class="channel-composer-row"><textarea id="channelMessageInput" name="body" maxlength="4000" rows="2" placeholder="Sign in to join the conversation…" disabled></textarea><button type="submit" class="landing-primary" disabled>Send</button></div><span class="channel-composer-status" id="channelComposerStatus" role="status"></span></form></section></div><section class="community-moderation-panel" id="communityModerationPanel" hidden aria-labelledby="community-moderation-title"><div class="portal-panel-header"><span>Governance</span><strong id="community-moderation-title">Report queue</strong></div><div id="communityModerationReports"><p class="feed-empty">Moderator access is checked securely.</p></div></section></section>`);
  }

  async function loadChannels() {
    const list = document.getElementById('communityChannelList');
    if (!list || page.feed !== 'community') return;
    try {
      const response = await fetch('/api/community/channels', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Channels unavailable');
      availableChannels = Array.isArray(data.channels) ? data.channels : [];
      list.innerHTML = availableChannels.length ? availableChannels.map((channel) => `<button type="button" class="channel-list-item" data-channel-slug="${escapeHtml(channel.slug)}"><span># ${escapeHtml(channel.name)}${channel.unreadCount ? ` <em class="channel-unread-count">${escapeHtml(channel.unreadCount)}</em>` : ''}</span><small>${escapeHtml(channel.description || '')}</small></button>`).join('') : '<p class="feed-empty">No channels are available.</p>';
      list.querySelectorAll('[data-channel-slug]').forEach((button) => button.addEventListener('click', () => selectChannel(button.dataset.channelSlug)));
      if (availableChannels.length) selectChannel(availableChannels[0].slug);
    } catch (error) { list.innerHTML = `<p class="feed-empty">${escapeHtml(error.message || 'Channels are unavailable right now.')}</p>`; }
  }

  async function selectChannel(slug) {
    const channel = availableChannels.find((item) => item.slug === slug);
    if (!channel) return;
    activeChannel = channel;
    document.querySelectorAll('[data-channel-slug]').forEach((button) => button.classList.toggle('is-active', button.dataset.channelSlug === slug));
    const name = document.getElementById('activeChannelName');
    const description = document.getElementById('activeChannelDescription');
    const messageList = document.getElementById('communityChannelMessages');
    const input = document.getElementById('channelMessageInput');
    const send = document.querySelector('#communityChannelComposer button[type="submit"]');
    if (name) name.textContent = `# ${channel.name}`;
    if (description) description.textContent = channel.description || '';
    const proposalLinkWrap = document.getElementById('channelProposalLinkWrap');
    if (proposalLinkWrap) proposalLinkWrap.hidden = channel.slug !== 'issue-triage';
    if (input) input.disabled = !authToken();
    if (send) send.disabled = !authToken();
    if (messageList) messageList.innerHTML = '<p class="feed-loading">Loading messages…</p>';
    try {
      const response = await fetch(`/api/community/channels/${encodeURIComponent(slug)}/messages`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Messages unavailable');
      const messages = Array.isArray(data.messages) ? data.messages : [];
      if (messageList) messageList.innerHTML = messages.length ? messages.map((message) => `<article class="channel-message" data-message-id="${escapeHtml(message.id)}"><div class="channel-message-meta"><strong>${escapeHtml(message.author || 'Member')}</strong><time>${formatDate(message.createdAt)}</time></div><p>${escapeHtml(message.body)}</p>${authToken() ? `<button type="button" class="message-report-button" data-report-message="${escapeHtml(message.id)}">Report</button>` : ''}</article>`).join('') : '<p class="feed-empty">No messages yet. Start the conversation.</p>';
      messageList?.querySelectorAll('[data-report-message]').forEach((button) => button.addEventListener('click', () => reportMessage(button.dataset.reportMessage)));
      const token = authToken();
      if (token) {
        const readResponse = await fetch(`/api/community/channels/${encodeURIComponent(slug)}/read`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, credentials: 'same-origin' });
        if (readResponse.ok) document.querySelector(`[data-channel-slug="${CSS.escape(slug)}"] .channel-unread-count`)?.remove();
      }
    } catch (error) { if (messageList) messageList.innerHTML = `<p class="feed-empty">${escapeHtml(error.message || 'Messages are unavailable right now.')}</p>`; }
  }

  async function reportMessage(messageId) {
    const token = authToken();
    if (!token) return;
    const reason = window.prompt('Why should this message be reviewed?');
    if (!reason || reason.trim().length < 5) return;
    try {
      const response = await fetch(`/api/community/messages/${encodeURIComponent(messageId)}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ reason: reason.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not report message');
      window.alert('Report submitted for moderator review.');
      loadModerationQueue();
    } catch (error) { window.alert(error.message || 'Could not report message'); }
  }

  async function loadModerationQueue() {
    const panel = document.getElementById('communityModerationPanel');
    const list = document.getElementById('communityModerationReports');
    const token = authToken();
    if (!panel || !list || !token) return;
    try {
      const response = await fetch('/api/community/moderation/reports?status=open', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, credentials: 'same-origin' });
      if (response.status === 401 || response.status === 403) return;
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Report queue unavailable');
      panel.hidden = false;
      const reports = Array.isArray(data.reports) ? data.reports : [];
      list.innerHTML = reports.length ? reports.map((report) => `<article class="moderation-report"><div><strong>Message #${escapeHtml(report.message_id || report.messageId)}</strong><span>${escapeHtml(report.reason)}</span><small>Reported by ${escapeHtml(report.reporter_email || report.reporterEmail || 'member')} · ${formatDate(report.created_at || report.createdAt)}</small></div><div class="moderation-report-actions"><button type="button" data-moderate-report="${escapeHtml(report.id)}" data-report-status="resolved">Resolve</button><button type="button" data-moderate-report="${escapeHtml(report.id)}" data-report-status="dismissed">Dismiss</button></div></article>`).join('') : '<p class="feed-empty">No open reports.</p>';
      list.querySelectorAll('[data-moderate-report]').forEach((button) => button.addEventListener('click', async () => {
        const update = await fetch(`/api/community/moderation/reports/${encodeURIComponent(button.dataset.moderateReport)}/resolve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: JSON.stringify({ status: button.dataset.reportStatus }) });
        if (update.ok) loadModerationQueue();
      }));
    } catch { /* A non-moderator simply does not receive this panel. */ }
  }

  function bindChannelComposer() {
    const form = document.getElementById('communityChannelComposer');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const token = authToken();
      const input = document.getElementById('channelMessageInput');
      const status = document.getElementById('channelComposerStatus');
      if (!token) { if (status) status.textContent = 'Sign in from Settings to send a message.'; return; }
      if (!activeChannel || !input || !String(input.value || '').trim()) return;
        const body = String(input.value).trim();
        const proposalId = document.getElementById('channelProposalId')?.value;
        const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      if (status) status.textContent = 'Sending…';
      try {
        const response = await fetch(`/api/community/channels/${encodeURIComponent(activeChannel.slug)}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ body, ...(proposalId ? { issueProposalId: Number(proposalId) } : {}) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not send message');
        input.value = '';
        const proposalField = document.getElementById('channelProposalId');
        if (proposalField) proposalField.value = '';
        if (status) status.textContent = 'Sent';
        await selectChannel(activeChannel.slug);
      } catch (error) { if (status) status.textContent = error.message || 'Could not send message'; }
      finally { if (button) button.disabled = !authToken(); }
    });
  }

  renderChannelWorkspace();
  bindChannelComposer();
  if (page.feed === 'community') { loadChannels(); loadModerationQueue(); }

  async function loadCommunityProfiles() {
    if (!profileList) return;
    try {
      const response = await fetch('/api/community/profiles?limit=50', { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Profiles unavailable (${response.status})`);
      const data = await response.json();
      const profiles = Array.isArray(data.profiles) ? data.profiles : [];
      profileList.innerHTML = profiles.length ? profiles.map((profile) => `<article class="community-profile" role="listitem"><div class="community-profile-heading"><span class="profile-avatar" style="--profile-color:${escapeHtml(profile.avatarColor)}">${escapeHtml((profile.displayName || 'M').charAt(0).toUpperCase())}</span><div><strong>${escapeHtml(profile.displayName)}</strong><span class="profile-presence profile-presence--${escapeHtml(profile.presence)}">${escapeHtml(profile.presence === 'dnd' ? 'Do Not Disturb' : 'Online')}</span></div></div><p>${escapeHtml(profile.bio || 'No public bio yet.')}</p><div class="profile-roles">${(profile.roles || []).map((role) => `<span>${escapeHtml(role.label)}</span>`).join('')}</div></article>`).join('') : '<p class="feed-empty">No public profiles yet.</p>';
    } catch { profileList.innerHTML = '<p class="feed-empty">Public profiles are unavailable right now.</p>'; }
  }

  async function loadOwnProfile() {
    if (!ownProfileEditor) return;
    const token = authToken();
    if (!token) { ownProfileEditor.innerHTML = '<p class="profile-signin">Sign in from <a href="/settings#account">Settings</a> to set your profile and presence.</p>'; return; }
    try {
      const response = await fetch('/api/community/profile', { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, credentials: 'same-origin' });
      if (!response.ok) throw new Error('Profile unavailable');
      const { profile } = await response.json();
      ownProfileEditor.innerHTML = `<form class="profile-form" id="profileForm"><label>Display name<input name="displayName" maxlength="60" value="${escapeHtml(profile.displayName)}" /></label><label>Bio<textarea name="bio" maxlength="240">${escapeHtml(profile.bio || '')}</textarea></label><label>Presence<select name="presence"><option value="online"${profile.presence === 'online' ? ' selected' : ''}>Online</option><option value="dnd"${profile.presence === 'dnd' ? ' selected' : ''}>Do Not Disturb</option></select></label><label class="profile-checkbox"><input type="checkbox" name="profilePublic"${profile.profilePublic ? ' checked' : ''} /> Show my profile publicly</label><button type="submit" class="landing-secondary">Save profile</button><span class="profile-form-status" role="status"></span></form>`;
      document.getElementById('profileForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const status = form.querySelector('.profile-form-status');
        try {
          const update = await fetch('/api/community/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${token}` }, credentials: 'same-origin', body: JSON.stringify({ displayName: formData.get('displayName'), bio: formData.get('bio'), presence: formData.get('presence'), profilePublic: formData.get('profilePublic') === 'on' }) });
          const data = await update.json();
          if (!update.ok) throw new Error(data.error || 'Could not save profile');
          if (status) status.textContent = 'Saved';
          loadCommunityProfiles();
        } catch (error) { if (status) status.textContent = error.message || 'Could not save profile'; }
      });
    } catch { ownProfileEditor.innerHTML = '<p class="profile-signin">Your profile could not be loaded. Please sign in again from Settings.</p>'; }
  }

  if (page.feed === 'community') { loadCommunityProfiles(); loadOwnProfile(); }
  if (!feed || !page.feed) return;

  async function loadFeed(sort = 'latest') {
    feed.innerHTML = '<p class="feed-loading">Loading live activity…</p>';
    try {
      const response = await fetch(`/api/${page.feed}/feed?sort=${encodeURIComponent(sort)}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
      if (!response.ok) throw new Error(`Feed unavailable (${response.status})`);
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) { feed.innerHTML = '<p class="feed-empty">Nothing here yet — be the first to contribute.</p>'; return; }
      feed.innerHTML = items.slice(0, 8).map((item) => {
        if (page.feed === 'issues') {
          const votes = item.votes || {};
          return `<article class="feed-item issue-feed-item"><a href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title || 'Untitled issue')}</strong><span>Issues${item.state ? ` · ${escapeHtml(item.state)}` : ''} · ${formatDate(item.updatedAt || item.updated_at)}</span><small>${escapeHtml(item.body || item.excerpt || '')}</small></a><div class="issue-vote-controls" aria-label="Issue voting"><button type="button" disabled title="Sign in to vote">▲ <span>${escapeHtml(votes.upvotes || 0)}</span></button><strong>${escapeHtml(votes.score || 0)}</strong><button type="button" disabled title="Sign in to vote">▼ <span>${escapeHtml(votes.downvotes || 0)}</span></button></div></article>`;
        }
        return `<a class="feed-item" href="${escapeHtml(item.url || '#')}" target="_blank" rel="noreferrer"><strong>${escapeHtml(item.title || 'Untitled activity')}</strong><span>${escapeHtml(item.source || page.feed)} · ${formatDate(item.updated_at || item.created_at)}</span><small>${escapeHtml(item.excerpt || '')}</small></a>`;
      }).join('');
    } catch { feed.innerHTML = '<p class="feed-empty">Live activity is unavailable right now. You can still browse the stream libraries.</p>'; }
  }

  document.querySelectorAll('[data-portal-sort]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-portal-sort]').forEach((item) => item.classList.toggle('is-active', item === button));
    loadFeed(button.dataset.portalSort || 'latest');
  }));
  loadFeed(new URLSearchParams(window.location.search).get('sort') || 'latest');
})();
