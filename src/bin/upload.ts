// ===== WAITING-LIST HELPERS =====
// Pending upload *metadata* stays in the repo's waiting-list/index.json (via ghProxy).
// Pending upload *file bytes* are stored in Vercel Blob Storage (via /api/blob).
// This keeps binary files out of git history and removes GitHub API size limits.

function sanitizeForPath(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64decode(b64) {
  return new TextDecoder().decode(
    Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  );
}

// ===== VERCEL BLOB HELPERS =====

// Upload a file to Vercel Blob; returns { ok, url } or { ok: false, error }
async function blobUpload(filename, base64Data) {
  try {
    const r = await fetch('/api/blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'upload', filename, content: base64Data })
    });
    const data = await r.json();
    if (!r.ok) return { ok: false, error: data.error || `Blob error (${r.status})` };
    return { ok: true, url: data.url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Delete a blob by its URL
async function blobDelete(url) {
  try {
    const r = await fetch('/api/blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', url })
    });
    const data = await r.json();
    return r.ok ? { ok: true } : { ok: false, error: data.error };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Fetch a blob's bytes as a Uint8Array (for preview / download / approve)
async function blobFetch(url) {
  try {
    const r = await fetch('/api/blob', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'fetch', url })
    });
    const data = await r.json();
    if (!r.ok || !data.content) return { ok: false, error: data.error || 'No content' };
    // data.content is base64
    const bytes = Uint8Array.from(atob(data.content), c => c.charCodeAt(0));
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ===== WAITING-LIST INDEX (still in GitHub repo) =====

async function wlReadIndex() {
  const res = await ghProxy('getFileContent', { path: 'waiting-list/index.json' });
  if (!res.ok || !res.data.content) return { sha: null, items: [] };
  try {
    return { sha: res.data.sha, items: JSON.parse(b64decode(res.data.content)) };
  } catch (e) { return { sha: res.data.sha, items: [] }; }
}

async function wlWriteIndex(items, sha, message) {
  return ghProxy('putFile', {
    path: 'waiting-list/index.json',
    content: b64encode(JSON.stringify(items, null, 2)),
    message: message || 'Update waiting-list index',
    sha: sha || null
  });
}

// ===== PENDING UPLOADS UI =====

async function loadPendingUploads() {
  const list = document.getElementById('pendingUploadsList');
  const label = document.getElementById('pendingCountLabel');
  list.innerHTML = '<div style="font-size:13px;opacity:.5;padding:6px 0">Loading…</div>';
  const { items } = await wlReadIndex();
  if (label) label.textContent = items.length ? `(${items.length})` : '';

  if (!items.length) {
    list.innerHTML = '<div style="font-size:13px;opacity:.5;padding:6px 0">No pending uploads.</div>';
    return;
  }

  list.innerHTML = items.map(u => {
    const dest = (u.destPath || '').trim();
    const destLabel = dest || '(repository root)';
    const editTag = u.reuploadCount > 0
      ? `<span style="font-size:10px;padding:1px 6px;border-radius:99px;background:#fff3e0;color:#e65100;margin-left:4px">edited ×${u.reuploadCount}</span>`
      : '';
    return `
    <div class="pending-item" id="pi-${u.id}">
      <span style="font-size:22px">${getIconForFilename(u.originalName)}</span>
      <div style="min-width:0;flex:1">
        <div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.originalName}${editTag}</div>
        <div style="font-size:11px;opacity:.5">${fmtSize(u.size)} · ${new Date(u.uploadedAt).toLocaleString()}</div>
        <div style="font-size:11px;color:var(--accent);margin-top:2px">📁 ${destLabel}</div>
      </div>
      <div class="pending-item-actions">
        <button class="pa-btn view" onclick="previewPending('${u.id}')">👁 View</button>
        <button class="pa-btn dl"   onclick="downloadPending('${u.id}')">📥 Download</button>
        <button class="pa-btn rev"  onclick="reuploadPending('${u.id}')">🔄 Re-upload</button>
        <button class="pa-btn ok"   onclick="approvePending('${u.id}')">✓ Approve</button>
        <button class="pa-btn rej"  onclick="rejectPending('${u.id}')">✗ Deny</button>
      </div>
    </div>`;
  }).join('');
  updatePendingBadge();
}

async function previewPending(id) {
  const { items } = await wlReadIndex();
  const u = items.find(x => x.id === id); if (!u) return;
  showStatus('Fetching file…', true);
  const res = await blobFetch(u.blobUrl);
  if (!res.ok) { showStatus('✗ Could not fetch file.'); return; }
  const url = URL.createObjectURL(new Blob([res.bytes]));
  if (isMobile) openMobilePreview(url, u.originalName);
  else openPreview(url, u.originalName);
}

async function downloadPending(id) {
  const { items } = await wlReadIndex();
  const u = items.find(x => x.id === id); if (!u) return;
  showStatus('Fetching file…', true);
  const res = await blobFetch(u.blobUrl);
  if (!res.ok) { showStatus('✗ Could not fetch file.'); return; }
  const url = URL.createObjectURL(new Blob([res.bytes]));
  const a = document.createElement('a'); a.href = url; a.download = u.originalName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function reuploadPending(id) {
  const inp = document.createElement('input'); inp.type = 'file';
  inp.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;

    // File size guard (25 MB)
    if (file.size > 25 * 1024 * 1024) {
      showStatus('✗ File too large. Maximum size is 25 MB.'); return;
    }

    showStatus('Re-uploading…', true);

    const { sha: idxSha, items } = await wlReadIndex();
    const u = items.find(x => x.id === id); if (!u) return;

    const count = u.reuploadCount || 0;
    const countStr = String(count).padStart(3, '0');
    const dotIdx = file.name.lastIndexOf('.');
    const newOriginalName = dotIdx > -1
      ? file.name.slice(0, dotIdx) + '-edited-' + countStr + file.name.slice(dotIdx)
      : file.name + '-edited-' + countStr;
    const newStoredName = sanitizeForPath(newOriginalName);

    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result.split(',')[1];

      // Upload new version to Vercel Blob
      const putOk = await blobUpload(`waiting-list/${id}-${newStoredName}`, b64);
      if (!putOk.ok) { showStatus(`✗ Re-upload failed: ${putOk.error}`); return; }

      // Delete old blob
      if (u.blobUrl) await blobDelete(u.blobUrl);

      // Update index with new blob URL
      const newItems = items.map(x => x.id === id
        ? { ...x, blobUrl: putOk.url, originalName: newOriginalName, size: file.size, reuploadCount: count + 1 }
        : x);
      await wlWriteIndex(newItems, idxSha, `Re-upload: ${newOriginalName}`);

      showStatus(`✓ Re-uploaded as: ${newOriginalName}`);
      loadPendingUploads();
    };
    reader.readAsDataURL(file);
  };
  inp.click();
}

async function approvePending(id) {
  showStatus('Approving…', true);
  const { sha: idxSha, items } = await wlReadIndex();
  const u = items.find(x => x.id === id);
  if (!u) { showStatus('✗ Item not found in waiting list.'); return; }

  // Fetch file bytes from Vercel Blob
  const fileRes = await blobFetch(u.blobUrl);
  if (!fileRes.ok) {
    showStatus(`✗ Could not fetch file from storage: ${fileRes.error}`);
    return;
  }

  // Convert bytes back to base64 for GitHub commit
  let binary = '';
  fileRes.bytes.forEach(b => binary += String.fromCharCode(b));
  const b64Content = btoa(binary);

  // Check if destination file already exists (need its sha to update)
  const destPath = (u.destPath || '').trim().replace(/^\/|\/$/g, '');
  const filePath = destPath ? `${destPath}/${u.originalName}` : u.originalName;
  const destCheck = await ghProxy('getFile', { path: filePath });
  const destSha = destCheck.ok ? destCheck.data.sha : null;

  // Commit to destination in GitHub
  const approveOk = await ghProxy('putFile', {
    path: filePath, content: b64Content,
    message: `Approve upload: ${u.originalName}`, sha: destSha
  });
  if (!approveOk.ok) { showStatus(`✗ Failed to publish: ${approveOk.error}`); return; }

  // Delete from Vercel Blob
  if (u.blobUrl) await blobDelete(u.blobUrl);

  // Remove from index
  const newItems = items.filter(x => x.id !== id);
  await wlWriteIndex(newItems, idxSha, `Approve: ${u.originalName}`);

  showStatus(`✓ "${u.originalName}" approved → published to ${destPath || 'repository root'}!`);
  loadPendingUploads(); updatePendingBadge(); fetchTree();
}

async function rejectPending(id) {
  showStatus('Removing…', true);
  const { sha: idxSha, items } = await wlReadIndex();
  const u = items.find(x => x.id === id); if (!u) return;

  // Delete blob
  if (u.blobUrl) await blobDelete(u.blobUrl);

  // Remove from index
  const newItems = items.filter(x => x.id !== id);
  await wlWriteIndex(newItems, idxSha, `Deny: ${u.originalName}`);

  loadPendingUploads(); updatePendingBadge();
  showStatus('Upload denied and removed.');
}

async function commitFileToGitHub(filePath, base64Content) {
  const getRes = await ghProxy('getFile', { path: filePath });
  if (!getRes.ok) { showStatus(`✗ Could not read destination: ${getRes.error}`); return false; }
  const sha = getRes.data.sha || null;
  const putRes = await ghProxy('putFile', { path: filePath, content: base64Content, message: `Upload: ${filePath}`, sha });
  if (!putRes.ok) { showStatus(`✗ Could not publish file: ${putRes.error}`); return false; }
  return true;
}

async function updatePendingBadge() {
  const btn = document.getElementById('adminPanelBtn');
  if (!btn || !isAdmin()) return;
  let dot = btn.querySelector('.badge-dot');
  try {
    const { items } = await wlReadIndex();
    if (items.length > 0) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'badge-dot'; btn.appendChild(dot); }
    } else if (dot) { dot.remove(); }
  } catch (e) { if (dot) dot.remove(); }
}

// ===== UPLOAD SCREEN =====
let _pendingFiles = [];
let _reuploadFile = null;

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

function showUploadScreen() {
  _pendingFiles = []; _reuploadFile = null;
  uploadGoStep1();
  document.getElementById('usResult').style.display = 'none';
  const o = document.getElementById('uploadOverlay');
  o.style.display = 'flex';
  requestAnimationFrame(() => o.classList.add('active'));
}

function hideUploadScreen() {
  const o = document.getElementById('uploadOverlay');
  o.classList.remove('active');
  setTimeout(() => {
    o.style.display = 'none';
    _pendingFiles = []; _reuploadFile = null;
    document.getElementById('filePickerInput').value = '';
    document.getElementById('us2destPath').value = '';
    document.getElementById('usResult').style.display = 'none';
    uploadGoStep1();
  }, 380);
}

function closeUploadScreen() {
  if (_pendingFiles.length) { document.getElementById('discardConfirm').style.display = 'flex'; }
  else hideUploadScreen();
}

function confirmDiscard() {
  document.getElementById('discardConfirm').style.display = 'none';
  _pendingFiles = []; hideUploadScreen();
}

function setUploadDots(active) {
  for (let i = 0; i < 3; i++) {
    const d = document.getElementById('ud' + i);
    if (d) d.classList.toggle('on', i < active);
  }
}

function uploadGoStep1() {
  ['us1','us2','us3'].forEach((id, i) => {
    const el = document.getElementById(id); if (el) el.style.display = i === 0 ? '' : 'none';
  });
  setUploadDots(1);
}

function uploadGoStep2() {
  ['us1','us2','us3'].forEach((id, i) => {
    const el = document.getElementById(id); if (el) el.style.display = i === 1 ? '' : 'none';
  });
  setUploadDots(2);
}

function uploadGoStep3() {
  if (!_pendingFiles.length) return;
  const count = _pendingFiles.length;
  const totalSize = _pendingFiles.reduce((s, f) => s + f.size, 0);
  document.getElementById('us3icon').textContent = count === 1 ? getIconForFilename(_pendingFiles[0].name) : '📦';
  document.getElementById('us3name').textContent = count === 1 ? _pendingFiles[0].name : `${count} files selected`;
  document.getElementById('us3size').textContent = fmtSize(totalSize);
  const dest = (document.getElementById('us2destPath').value || '').trim().replace(/^\/|\/$/g, '');
  document.getElementById('us3destPath').textContent = dest || 'repository root';
  document.getElementById('us3sub').textContent = isAdmin()
    ? `${count} file${count > 1 ? 's' : ''} will be published directly to the repository.`
    : `${count} file${count > 1 ? 's' : ''} will be held for admin review and approval.`;
  document.getElementById('us3adminNote').style.display = isAdmin() ? '' : 'none';
  document.getElementById('us3approveBtn').textContent = isAdmin() ? '✓ Publish to Repository' : '✓ Submit for Review';
  document.getElementById('us3progressWrap').style.display = 'none';
  document.getElementById('us3progressBar').style.width = '0%';
  ['us1','us2','us3'].forEach((id, i) => {
    const el = document.getElementById(id); if (el) el.style.display = i === 2 ? '' : 'none';
  });
  setUploadDots(3);
}

function uploadDragOver(e) { e.preventDefault(); document.getElementById('dropZone').classList.add('drag-over'); }
function uploadDragLeave() { document.getElementById('dropZone').classList.remove('drag-over'); }
function uploadFileDrop(e) {
  e.preventDefault(); document.getElementById('dropZone').classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f => {
    if (f.size > MAX_FILE_SIZE) { showStatus(`✗ "${f.name}" exceeds 25 MB limit.`); return false; }
    return true;
  });
  if (files.length) { _pendingFiles = files; populateStep2UI(); uploadGoStep2(); }
}

function onFilePicked(e) {
  const files = Array.from(e.target.files).filter(f => {
    if (f.size > MAX_FILE_SIZE) { showStatus(`✗ "${f.name}" exceeds 25 MB limit.`); return false; }
    return true;
  });
  if (!files.length) return;
  _pendingFiles = files; populateStep2UI(); uploadGoStep2();
}

function onReuploadPicked(e) {
  const file = e.target.files[0]; if (!file) return;
  if (file.size > MAX_FILE_SIZE) { showStatus('✗ File exceeds 25 MB limit.'); return; }
  _reuploadFile = file;
  document.getElementById('reuploadInfo').textContent = `✓ Modified file selected: ${file.name} (${fmtSize(file.size)})`;
}

function removeQueuedFile(index) {
  _pendingFiles.splice(index, 1);
  if (!_pendingFiles.length) { uploadGoStep1(); return; }
  populateStep2UI();
}

function populateStep2UI() {
  const files = _pendingFiles;
  const count = files.length;
  const queue = document.getElementById('us2fileQueue');
  queue.innerHTML = files.map((f, i) => `
    <div class="fpc" style="margin:0;padding:10px 12px">
      <div class="fpc-icon" style="font-size:22px">${getIconForFilename(f.name)}</div>
      <div style="flex:1;min-width:0">
        <div class="fpc-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f.name}</div>
        <div class="fpc-size">${fmtSize(f.size)}</div>
      </div>
      <span style="font-size:16px;cursor:pointer;padding:4px 8px;border-radius:6px;opacity:0.45;flex-shrink:0;transition:opacity 0.15s,background 0.15s"
        title="Remove"
        onclick="removeQueuedFile(${i})"
        onmouseover="this.style.opacity='1';this.style.background='rgba(229,57,53,0.12)'"
        onmouseout="this.style.opacity='0.45';this.style.background='none'">✕</span>
    </div>
  `).join('');
  document.getElementById('us2pendingNotice').style.display = isAdmin() ? 'none' : 'flex';
  document.getElementById('us2adminNotice').style.display   = isAdmin() ? '' : 'none';
  document.getElementById('us2reuploadSection').style.display = (isAdmin() && count === 1) ? '' : 'none';
  document.getElementById('us2title').textContent = isAdmin() ? 'Ready to Publish' : `${count} File${count > 1 ? 's' : ''} Selected`;
  document.getElementById('us2sub').textContent   = isAdmin()
    ? `${count} file${count > 1 ? 's' : ''} will be published directly.`
    : `${count} file${count > 1 ? 's' : ''} will be held for admin review before being published.`;
  document.getElementById('reuploadInfo').textContent = '';
}

function _setUploadProgress(done, total) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('us3progressBar').style.width = pct + '%';
  document.getElementById('us3progressLabel').textContent = `Uploading ${done} of ${total}… (${pct}%)`;
}

async function finalizeUpload() {
  const files = (_reuploadFile && _pendingFiles.length === 1) ? [_reuploadFile] : _pendingFiles;
  if (!files.length) return;
  const btn     = document.getElementById('us3approveBtn');
  const backBtn = document.getElementById('us3backBtn');
  btn.disabled = true; backBtn.disabled = true;
  btn.textContent = 'Uploading…';
  const dest  = (document.getElementById('us2destPath').value || '').trim().replace(/^\/|\/$/g, '');
  const total = files.length;
  const results = [];

  if (isAdmin()) {
    // Admin: commit directly to GitHub
    document.getElementById('us3progressWrap').style.display = '';
    for (let i = 0; i < total; i++) {
      const file = files[i];
      _setUploadProgress(i, total);
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(file);
      });
      const filePath = dest ? `${dest}/${file.name}` : file.name;
      const ok = await commitFileToGitHub(filePath, b64);
      results.push({ name: file.name, ok });
    }
    _setUploadProgress(total, total);
    fetchTree();

    const successes = results.filter(r => r.ok);
    const failures  = results.filter(r => !r.ok);
    let msg = '';
    if (successes.length) msg += `✓ ${successes.length} file${successes.length > 1 ? 's' : ''} published to "${dest || 'repository root'}".`;
    if (failures.length)  msg += `${msg ? '\n' : ''}✗ ${failures.length} failed: ${failures.map(r => r.name).join(', ')}`;
    showUploadResultUI(failures.length === 0, msg.trim());

  } else {
    // Anonymous: upload to Vercel Blob, record metadata in waiting-list/index.json
    btn.textContent = 'Submitting…';
    document.getElementById('us3progressWrap').style.display = '';
    const { sha: idxSha, items } = await wlReadIndex();

    for (let i = 0; i < total; i++) {
      const file = files[i];
      _setUploadProgress(i, total);
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(file);
      });
      const id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
      const storedName = sanitizeForPath(file.name);

      // Upload bytes to Vercel Blob
      const blobOk = await blobUpload(`waiting-list/${id}-${storedName}`, b64);
      results.push({ name: file.name, ok: blobOk.ok, error: blobOk.error });

      if (blobOk.ok) {
        items.push({
          id,
          blobUrl: blobOk.url,    // Vercel Blob URL — replaces storedName in GitHub
          originalName: file.name,
          destPath: dest,
          uploadedAt: new Date().toISOString(),
          size: file.size,
          reuploadCount: 0
        });
      }
    }
    _setUploadProgress(total, total);

    // Write all new index entries in a single commit
    const successes = results.filter(r => r.ok);
    const failures  = results.filter(r => !r.ok);
    if (successes.length) {
      const idxOk = await wlWriteIndex(items, idxSha, `Add pending: ${successes.length} file(s)`);
      if (!idxOk.ok) console.warn('Index update failed — admin may need to re-sync.');
    }

    let msg = '';
    if (successes.length) msg += `✓ ${successes.length} file${successes.length > 1 ? 's' : ''} submitted for review.${dest ? ` Destination: ${dest}.` : ''}`;
    if (failures.length)  msg += `${msg ? '\n' : ''}✗ ${failures.length} failed: ${failures.map(r => r.name).join(', ')}`;
    showUploadResultUI(failures.length === 0, msg.trim());

    updatePendingBadge();
    _pendingFiles = []; btn.disabled = false; backBtn.disabled = false;
  }
}

function showUploadResultUI(ok, msg) {
  ['us1','us2','us3'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
  document.getElementById('usResult').style.display = '';
  document.getElementById('usResultIcon').textContent  = ok ? '✅' : '⚠️';
  document.getElementById('usResultTitle').textContent = ok ? 'Done!' : 'Some uploads failed';
  document.getElementById('usResultMsg').style.whiteSpace = 'pre-line';
  document.getElementById('usResultMsg').textContent   = msg;
  _pendingFiles = [];
}

// ===== HELPERS =====
function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b/1024).toFixed(1) + ' KB';
  return (b/1048576).toFixed(1) + ' MB';
}

function getIconForFilename(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS.default;
}