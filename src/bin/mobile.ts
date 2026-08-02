// ===== MOBILE OVERFLOW MENU =====
function toggleMobOverflow() {
  document.getElementById('mobOverflowMenu').classList.toggle('open');
}
function closeMobOverflow() {
  document.getElementById('mobOverflowMenu').classList.remove('open');
}
// Close overflow menu on outside tap
document.addEventListener('click', e => {
  if (!e.target.closest('#mobOverflowBtn') && !e.target.closest('#mobOverflowMenu')) {
    closeMobOverflow();
  }
});

// ===== MOBILE FILE ACTION BOTTOM SHEET =====
let _mobSheetIndex = -1;

function openMobFileSheet(e, index) {
  e.stopPropagation();
  const items = document.querySelectorAll('.file-item');
  if (index < 0 || index >= items.length) return;
  const child = items[index]._childData;
  // Set selection
  document.querySelectorAll('.file-item.selected').forEach(el => el.classList.remove('selected'));
  items[index].classList.add('selected');
  selected = child;
  _mobSheetIndex = index;

  document.getElementById('mobFileSheetTitle').textContent = child.name;
  document.getElementById('mobSheetDelete').style.display = isAdmin() ? '' : 'none';

  const sheet = document.getElementById('mobFileSheet');
  sheet.classList.add('open');
}

function closeMobFileSheet(e) {
  // Close only if tapping the backdrop (not the card itself)
  if (e && e.target !== document.getElementById('mobFileSheet')) return;
  _closeMobFileSheet();
}

function _closeMobFileSheet() {
  document.getElementById('mobFileSheet').classList.remove('open');
  _mobSheetIndex = -1;
}

function mobSheetAction(action) {
  _closeMobFileSheet();
  if (_mobSheetIndex === -1) {
    // index was cleared — reconstruct from selected
    if (!selected) return;
    if (action === 'preview') { openMobilePreview(selected.path, selected.name); return; }
    if (action === 'download') { handleDownload(); return; }
    if (action === 'delete') { deleteFile({ stopPropagation: () => {} }, -1); return; }
    return;
  }
  // Use stored index
  const fakeEvent = { stopPropagation: () => {} };
  if (action === 'preview')  previewFile(fakeEvent, _mobSheetIndex);
  if (action === 'download') downloadFile(fakeEvent, _mobSheetIndex);
  if (action === 'delete')   deleteFile(fakeEvent, _mobSheetIndex);
}
const mobileMin = {}; // id -> { name }

function minimizeWindowMobile(id) {
  const w = windows[id]; if (!w) return;
  w.style.display = 'none';
  mobileMin[id] = { name: w.querySelector('.title')?.textContent || 'File' };
  renderMobileMinStack();
}

function restoreWindowMobile(id) {
  // Minimise anything currently visible
  for (const [wid, w] of Object.entries(windows)) {
    if (w.style.display !== 'none') {
      w.style.display = 'none';
      mobileMin[wid] = { name: w.querySelector('.title')?.textContent || 'File' };
    }
  }
  const w = windows[id];
  if (w) { w.style.display = 'flex'; delete mobileMin[id]; }
  renderMobileMinStack();
}

function renderMobileMinStack() {
  const stack = document.getElementById('mobileMinStack');
  const dropdown = document.getElementById('mobHamburgerDropdown');
  if (!isMobile) { stack.style.display = 'none'; return; }
  const entries = Object.entries(mobileMin);
  if (!entries.length) {
    stack.style.display = 'none';
    dropdown.classList.remove('open');
    return;
  }
  stack.style.display = 'flex';
  // Update badge count on hamburger button
  const btn = document.getElementById('mobHamburgerBtn');
  btn.textContent = entries.length > 0 ? `☰ ${entries.length}` : '☰';
  // Rebuild dropdown items
  dropdown.innerHTML = entries.map(([id, info]) =>
    `<button class="mob-min-btn" onclick="restoreWindowMobile('${id}')">📄 <span>${info.name}</span></button>`
  ).join('');
}

function toggleMobHamburger() {
  const dropdown = document.getElementById('mobHamburgerDropdown');
  dropdown.classList.toggle('open');
}

// Close the hamburger dropdown when tapping outside it
document.addEventListener('click', (e) => {
  if (!e.target.closest('#mobileMinStack')) {
    document.getElementById('mobHamburgerDropdown')?.classList.remove('open');
  }
});

// ===== OVERRIDE openPreview FOR MOBILE MINIMIZE SUPPORT =====
function openPreview(path, filename) {
  const id = 'preview-' + (++previewId);
  const win = document.createElement('div');
  win.className = 'floating-window';

  if (isMobile) {
    win.style.cssText = 'top:0;left:0;width:100vw;height:100vh;border-radius:0;';
  } else {
    win.style.top  = `${100 + previewId * 10}px`;
    win.style.left = `${100 + previewId * 10}px`;
  }

  win.dataset.id = id;
  const ext = filename.split('.').pop().toLowerCase();

  const minBtn = isMobile
    ? `<button onclick="minimizeWindowMobile('${id}')">🗕</button>`
    : `<button onclick="minimizeWindow('${id}')">🗕</button>`;
  const fsBtn  = isMobile ? '' : `<button onclick="toggleFullscreen('${id}')">🗖</button>`;

  win.innerHTML = `
    <div class="title-bar" onmousedown="${isMobile ? '' : `startDrag(event,'${id}')`}">
      <div class="title">${filename}</div>
      <div class="buttons">${minBtn}${fsBtn}<button onclick="closeWindow('${id}')">✖</button></div>
    </div>
    <div class="preview-body" id="${id}-body">Loading...</div>`;

  previewContainer.appendChild(win);
  windows[id] = win;
  fetchFileContent(path, filename, document.getElementById(id + '-body'));

  if (!isMobile) {
    updateTaskbar();
    if (['md','markdown','pdf','html','htm','doc','docx','xls','xlsx','ppt','pptx'].includes(ext)) setTimeout(() => toggleFullscreen(id, true), 100);
  }
}

// ===== OVERRIDE handlePreview — always use openPreview (handles mobile internally) =====
function handlePreview() {
  if (selected && selected.type === 'file') openPreview(selected.path, selected.name);
  contextMenu.style.display = 'none';
}

// ===== OVERRIDE closeWindow — handle mobile min stack =====
function closeWindow(id) {
  const w = windows[id];
  if (w) { w.remove(); delete windows[id]; delete mobileMin[id]; }
  isMobile ? renderMobileMinStack() : updateTaskbar();
}

// ===== OVERRIDE minimizeWindow — handle mobile fallthrough =====
function minimizeWindow(id) {
  const w = windows[id]; if (!w) return;
  if (isMobile) { minimizeWindowMobile(id); return; }
  w.style.display = 'none';
  updateTaskbar();
}

// ===== OVERRIDE updateTaskbar — fix names + scrollable =====
function updateTaskbar() {
  if (isMobile) return;
  const minimised = Object.entries(windows).filter(([,el]) => el.style.display === 'none');
  if (!minimised.length) { taskbar.style.display = 'none'; taskbar.innerHTML = ''; return; }

  taskbar.style.display = 'flex';
  taskbar.style.overflowX = 'auto';
  taskbar.style.flexWrap = 'nowrap';
  taskbar.innerHTML = '';

  for (const [id, el] of Object.entries(windows)) {
    if (el.style.display !== 'none') continue;
    const name = el.querySelector('.title')?.textContent || 'File';
    const icon = document.createElement('div');
    icon.className = 'task-icon';
    icon.dataset.name = name;
    icon.style.cssText = 'width:auto;padding:0 10px;gap:5px;font-size:12px;white-space:nowrap;display:flex;align-items:center;min-width:auto;';
    icon.innerHTML = `<span>📄</span><span>${name}</span>`;
    icon.onclick = () => { el.style.display = 'block'; updateTaskbar(); };
    icon.oncontextmenu = e => { e.preventDefault(); showTaskbarContextMenu(e.pageX, e.pageY, id); };
    taskbar.appendChild(icon);
  }
}

// ===== INIT =====
window.addEventListener('DOMContentLoaded', async () => {
  restoreModernSession();
  await updatePendingBadge();
});