/* ===== COMMUNITY FORUM (DISCOURSE-INSPIRED SPA) ===== */

const ForumAPI = {
  async req(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    };
    const res = await fetch(`/api/forum${endpoint}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Forum API Error');
    return data;
  },
  getCategories: () => ForumAPI.req('/categories'),
  getTopics: (categoryId = '', page = 1) => ForumAPI.req(`/topics?category=${categoryId}&page=${page}`),
  getTopic: (id) => ForumAPI.req(`/topics/${id}`),
  createTopic: (payload) => ForumAPI.req('/topics', { method: 'POST', body: JSON.stringify(payload) }),
  createReply: (topicId, payload) => ForumAPI.req(`/topics/${topicId}/reply`, { method: 'POST', body: JSON.stringify(payload) }),
  react: (targetType, targetId, emoji) => ForumAPI.req('/react', { method: 'POST', body: JSON.stringify({ targetType, targetId, emoji }) }),
  search: (q) => ForumAPI.req(`/search?q=${encodeURIComponent(q)}`)
};

class CommunityForum {
  constructor() {
    this.container = document.getElementById('communityMain');
    this.sidebar = document.getElementById('communitySidebar');
    this.composer = document.getElementById('communityComposer');
    this.currentCategory = '';
    this.categories = [];
    this.setupListeners();
    
    // Inject the base layout
    document.getElementById('communityOverlayCard').innerHTML = `
      <div class="forum-header">
        <div class="forum-brand">💬 Science Community</div>
        <div class="forum-controls">
          <div class="forum-search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input type="text" id="forumSearchInput" placeholder="Search topics...">
          </div>
          <button class="forum-btn primary" id="btnNewTopic">+ New Topic</button>
          <button class="overlay-close" onclick="closeCommunity()">×</button>
        </div>
      </div>
      <div class="forum-body">
        <div class="forum-sidebar" id="communitySidebar"></div>
        <div class="forum-main" id="communityMain"></div>
      </div>
      
      <!-- Composer Modal -->
      <div class="composer-modal" id="communityComposer">
        <div class="composer-header">
          <span>Create a New Topic</span>
          <button class="composer-close" id="btnComposerClose">×</button>
        </div>
        <div class="composer-meta">
          <select id="composerCategory" class="composer-select"></select>
          <input type="text" id="composerTitle" class="composer-input" placeholder="What is this discussion about?">
        </div>
        <div class="composer-body">
          <div class="composer-editor">
            <textarea id="composerInput" placeholder="Type here. Markdown is supported."></textarea>
          </div>
          <div class="composer-preview" id="composerPreview"></div>
        </div>
        <div class="composer-footer">
          <button class="forum-btn" id="btnComposerCancel">Cancel</button>
          <button class="forum-btn primary" id="btnComposerSubmit">Create Topic</button>
        </div>
      </div>
    `;

    this.container = document.getElementById('communityMain');
    this.sidebar = document.getElementById('communitySidebar');
    this.composer = document.getElementById('communityComposer');
    
    this.bindEvents();
  }

  bindEvents() {
    document.getElementById('btnNewTopic').addEventListener('click', () => this.openComposer());
    document.getElementById('btnComposerClose').addEventListener('click', () => this.closeComposer());
    document.getElementById('btnComposerCancel').addEventListener('click', () => this.closeComposer());
    document.getElementById('btnComposerSubmit').addEventListener('click', () => this.submitComposer());
    
    const searchInput = document.getElementById('forumSearchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        if (e.target.value.trim().length >= 2) this.renderSearch(e.target.value);
        else if (e.target.value.trim() === '') this.renderHome();
      }, 300);
    });

    const composerInput = document.getElementById('composerInput');
    const composerPreview = document.getElementById('composerPreview');
    composerInput.addEventListener('input', () => {
      if (window.markdownit) {
        const md = window.markdownit({ html: true, linkify: true, typographer: true });
        composerPreview.innerHTML = md.render(composerInput.value);
        if (window.MathJax) MathJax.typesetPromise([composerPreview]);
      } else {
        composerPreview.textContent = composerInput.value;
      }
    });
  }

  setupListeners() {}

  formatTime(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diff = (now - date) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff/60) + 'm';
    if (diff < 86400) return Math.floor(diff/3600) + 'h';
    if (diff < 604800) return Math.floor(diff/86400) + 'd';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  async loadInitial() {
    try {
      this.container.innerHTML = '<div class="forum-loader"></div>';
      const data = await ForumAPI.getCategories();
      this.categories = data.categories;
      this.renderSidebar();
      this.renderHome();
    } catch (err) {
      this.container.innerHTML = `<div class="forum-empty">Error loading forum: ${err.message}</div>`;
    }
  }

  renderSidebar() {
    let html = `
      <div style="margin-bottom: 24px;">
        <div style="font-weight:700; font-size:12px; opacity:0.5; text-transform:uppercase; margin-bottom:12px;">Navigation</div>
        <div class="topic-row" style="padding: 8px 12px; border-radius:6px; font-weight:600; display:flex; align-items:center; gap:8px;" onclick="window.community.renderHome()">
          🏠 All Categories
        </div>
      </div>
      <div>
        <div style="font-weight:700; font-size:12px; opacity:0.5; text-transform:uppercase; margin-bottom:12px;">Categories</div>
    `;
    
    this.categories.forEach(cat => {
      html += `
        <div class="topic-row" style="padding: 8px 12px; border-radius:6px; display:flex; align-items:center; gap:8px;" onclick="window.community.renderCategory('${cat.id}')">
          <span class="topic-cat-indicator" style="--cat-color: ${cat.color}"></span>
          <span style="font-size:14px;">${cat.name}</span>
        </div>
      `;
    });
    html += `</div>`;
    this.sidebar.innerHTML = html;

    const catSelect = document.getElementById('composerCategory');
    catSelect.innerHTML = this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  }

  async renderHome() {
    this.currentCategory = '';
    
    let html = `
      <div class="topic-list-header">
        <div class="topic-list-title">Categories</div>
      </div>
      <div class="category-grid">
    `;

    this.categories.forEach(cat => {
      html += `
        <div class="category-card" style="--cat-color: ${cat.color}" onclick="window.community.renderCategory('${cat.id}')">
          <div class="category-header">
            <span class="category-icon">${cat.icon}</span>
            <span class="category-title">${cat.name}</span>
          </div>
          <div class="category-desc">${cat.description}</div>
          <div class="category-meta">
            <span>${cat.topicCount} topics</span>
            <span>${cat.lastActivityAt ? this.formatTime(cat.lastActivityAt) : 'No activity'}</span>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    this.container.innerHTML = html;
    
    // Also load latest topics globally below the categories
    const latestDiv = document.createElement('div');
    latestDiv.innerHTML = '<div class="topic-list-header"><div class="topic-list-title">Latest Topics</div></div><div id="latestTopicsContainer"><div class="forum-loader"></div></div>';
    this.container.appendChild(latestDiv);
    
    try {
      const data = await ForumAPI.getTopics();
      document.getElementById('latestTopicsContainer').innerHTML = this.buildTopicTable(data.topics);
    } catch (e) {
      document.getElementById('latestTopicsContainer').innerHTML = `<div class="forum-empty">Could not load topics.</div>`;
    }
  }

  async renderCategory(categoryId) {
    this.currentCategory = categoryId;
    this.container.innerHTML = '<div class="forum-loader"></div>';
    
    const cat = this.categories.find(c => c.id === categoryId);
    
    try {
      const data = await ForumAPI.getTopics(categoryId);
      
      let html = `
        <div class="topic-list-header" style="border-bottom: 2px solid ${cat ? cat.color : 'var(--border)'}">
          <div class="topic-list-title">${cat ? cat.icon + ' ' + cat.name : 'Category'}</div>
        </div>
      `;
      
      if (data.topics.length === 0) {
        html += `<div class="forum-empty"><div class="forum-empty-icon">📝</div>No topics here yet. Be the first to start a discussion!</div>`;
      } else {
        html += this.buildTopicTable(data.topics);
      }
      
      this.container.innerHTML = html;
    } catch (e) {
      this.container.innerHTML = `<div class="forum-empty">Error: ${e.message}</div>`;
    }
  }

  buildTopicTable(topics) {
    if (!topics || topics.length === 0) return '';
    
    let html = `
      <table class="topic-table">
        <thead>
          <tr>
            <th class="topic-cell-main">Topic</th>
            <th class="topic-cell-stats">Replies</th>
            <th class="topic-cell-stats">Views</th>
            <th class="topic-cell-activity">Activity</th>
          </tr>
        </thead>
        <tbody>
    `;

    topics.forEach(t => {
      const cat = this.categories.find(c => c.id === t.categoryId);
      const catColor = cat ? cat.color : '#888';
      
      html += `
        <tr class="topic-row ${t.isPinned ? 'pinned' : ''}" onclick="window.community.renderTopic('${t.id}')">
          <td class="topic-cell-main">
            <div class="topic-title">
              ${t.isPinned ? '<span class="topic-badge pinned">Pinned</span>' : ''}
              ${t.title}
            </div>
            <div class="topic-meta-tags">
              <span class="topic-cat-indicator" style="--cat-color: ${catColor}"></span>
              <span style="font-size:12px; opacity:0.8">${cat ? cat.name : ''}</span>
              ${t.tags.map(tag => `<span class="topic-tag">${tag}</span>`).join('')}
            </div>
          </td>
          <td class="topic-cell-stats">${t.replyCount}</td>
          <td class="topic-cell-stats">${t.viewCount}</td>
          <td class="topic-cell-activity">
            <div class="activity-user">${t.lastReplyAuthor || t.authorDisplayName}</div>
            <div class="activity-time">${this.formatTime(t.lastReplyAt || t.createdAt)}</div>
          </td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    return html;
  }

  async renderTopic(id) {
    this.container.innerHTML = '<div class="forum-loader"></div>';
    try {
      const data = await ForumAPI.getTopic(id);
      const t = data.topic;
      const cat = this.categories.find(c => c.id === t.categoryId);
      
      // Setup Markdown renderer
      const md = window.markdownit ? window.markdownit({ html: true, linkify: true, typographer: true }) : null;
      const renderMd = (text) => md ? md.render(text) : `<p>${text}</p>`;

      let html = `
        <div class="thread-header">
          <div class="thread-title">${t.title}</div>
          <div class="thread-meta">
            <span class="topic-cat-indicator" style="--cat-color: ${cat ? cat.color : '#888'}"></span>
            <span>${cat ? cat.name : t.categoryId}</span>
            ${t.tags.map(tag => `<span class="topic-tag">${tag}</span>`).join('')}
          </div>
        </div>
      `;

      // Original Post
      html += this.buildPostCard(t.authorDisplayName, data.authorProfile?.avatarColor, t.createdAt, t.body, renderMd, data.topicReactions, 'topic', t.id);

      // Replies
      data.replies.forEach(r => {
        html += this.buildPostCard(r.authorDisplayName, null, r.createdAt, r.body, renderMd, data.replyReactions[r.id], 'reply', r.id);
      });

      // Inline Reply Box
      if (!t.isLocked) {
        html += `
          <div style="margin-top: 32px; border-top: 1px solid var(--border); padding-top: 24px;">
            <div style="font-weight:600; margin-bottom:12px;">Reply to this topic</div>
            <textarea id="inlineReplyBody" class="composer-input" style="width:100%; height:100px; resize:vertical; margin-bottom:12px;" placeholder="Write your reply..."></textarea>
            <button class="forum-btn primary" onclick="window.community.submitReply('${t.id}')">Post Reply</button>
          </div>
        `;
      } else {
        html += `
          <div style="margin-top: 32px; padding: 16px; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 8px; text-align:center; font-weight:600;">
            🔒 This topic is locked.
          </div>
        `;
      }

      this.container.innerHTML = html;
      if (window.MathJax) MathJax.typesetPromise([this.container]);
      
    } catch (e) {
      this.container.innerHTML = `<div class="forum-empty">Error loading topic: ${e.message}</div>`;
    }
  }

  buildPostCard(authorName, avatarColor, time, body, renderMd, reactions, targetType, targetId) {
    const initial = (authorName || 'U')[0].toUpperCase();
    const color = avatarColor || '#64748b'; // fallback
    
    // Format reactions
    let reactionHtml = '';
    if (reactions) {
      for (const [emoji, users] of Object.entries(reactions)) {
        if (users.length > 0) {
          reactionHtml += `<button class="reaction-btn" onclick="window.community.toggleReaction('${targetType}', '${targetId}', '${emoji}')">${emoji} ${users.length}</button>`;
        }
      }
    }

    return `
      <div class="post-card">
        <div class="post-sidebar">
          <div class="post-avatar" style="background: ${color}">${initial}</div>
        </div>
        <div class="post-main">
          <div class="post-header">
            <div class="post-author">${authorName}</div>
            <div class="post-time">${this.formatTime(time)}</div>
          </div>
          <div class="post-body">
            ${renderMd(body)}
          </div>
          <div class="post-actions">
            ${reactionHtml}
            <button class="action-btn" onclick="window.community.toggleReaction('${targetType}', '${targetId}', '👍')">👍 Like</button>
            <button class="action-btn" onclick="window.community.toggleReaction('${targetType}', '${targetId}', '❤️')">❤️ Love</button>
          </div>
        </div>
      </div>
    `;
  }

  async submitReply(topicId) {
    const input = document.getElementById('inlineReplyBody');
    const body = input.value.trim();
    if (!body) return;
    
    if (!localStorage.getItem('token')) {
      alert("Please log in to reply.");
      return;
    }
    
    try {
      const btn = input.nextElementSibling;
      btn.disabled = true;
      btn.textContent = 'Posting...';
      
      await ForumAPI.createReply(topicId, { body });
      await this.renderTopic(topicId); // reload thread
    } catch (e) {
      alert(e.message);
      input.nextElementSibling.disabled = false;
      input.nextElementSibling.textContent = 'Post Reply';
    }
  }

  async toggleReaction(targetType, targetId, emoji) {
    if (!localStorage.getItem('token')) {
      alert("Please log in to react.");
      return;
    }
    try {
      await ForumAPI.react(targetType, targetId, emoji);
      // Cheap refresh for now (in a real app, update state locally to avoid flicker)
      if (targetType === 'topic') {
        this.renderTopic(targetId);
      } else {
        // We don't have topicId in the reply payload directly here, so we cheat and just reload current view
        const topicId = document.querySelector('.post-card .action-btn').getAttribute('onclick').match(/'topic', '([^']+)'/);
        if (topicId) this.renderTopic(topicId[1]);
        else this.renderCategory(this.currentCategory || '');
      }
    } catch (e) {
      console.error(e);
    }
  }

  openComposer() {
    if (!localStorage.getItem('token')) {
      alert("Please log in to create a topic.");
      return;
    }
    if (this.currentCategory) {
      document.getElementById('composerCategory').value = this.currentCategory;
    }
    this.composer.classList.add('active');
    document.getElementById('composerTitle').focus();
  }

  closeComposer() {
    this.composer.classList.remove('active');
    document.getElementById('composerTitle').value = '';
    document.getElementById('composerInput').value = '';
    document.getElementById('composerPreview').innerHTML = '';
  }

  async submitComposer() {
    const title = document.getElementById('composerTitle').value.trim();
    const body = document.getElementById('composerInput').value.trim();
    const categoryId = document.getElementById('composerCategory').value;
    
    if (!title || !body) {
      alert("Title and body are required.");
      return;
    }
    
    try {
      const btn = document.getElementById('btnComposerSubmit');
      btn.disabled = true;
      btn.textContent = 'Creating...';
      
      const res = await ForumAPI.createTopic({ title, body, categoryId, tags: [] });
      this.closeComposer();
      this.renderTopic(res.topic.id);
      
      btn.disabled = false;
      btn.textContent = 'Create Topic';
    } catch (e) {
      alert(e.message);
      const btn = document.getElementById('btnComposerSubmit');
      btn.disabled = false;
      btn.textContent = 'Create Topic';
    }
  }

  async renderSearch(q) {
    this.container.innerHTML = '<div class="forum-loader"></div>';
    try {
      const data = await ForumAPI.search(q);
      let html = `
        <div class="topic-list-header">
          <div class="topic-list-title">Search Results for "${q}"</div>
        </div>
      `;
      if (data.results.length === 0) {
        html += `<div class="forum-empty">No results found.</div>`;
      } else {
        html += this.buildTopicTable(data.results);
      }
      this.container.innerHTML = html;
    } catch (e) {
      this.container.innerHTML = `<div class="forum-empty">Search failed.</div>`;
    }
  }
}

// Global functions for the overlay
window.openCommunity = function() {
  const overlay = document.getElementById('communityOverlay');
  if (overlay) {
    overlay.classList.add('active');
    if (!window.community) {
      window.community = new CommunityForum();
      window.community.loadInitial();
    } else {
      window.community.loadInitial(); // Refresh on open
    }
  }
};

window.closeCommunity = function() {
  const overlay = document.getElementById('communityOverlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
};
