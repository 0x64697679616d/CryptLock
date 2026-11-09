'use strict';

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const authShell = $('#auth-shell');
const appShell = $('#app-shell');

const loginView = $('#login-view');
const registerView = $('#register-view');
const forgotView = $('#forgot-view');

let files = [];
let folders = [];
let currentPage = 'overview';
let currentFolderId = null;
let toastTimer;
let lockerName = 'My locker';

// ==========================================
// GLOBAL LOADING MANAGER
// ==========================================

let activeRequests = 0;
let loaderShowTimer = null;
let loaderHideTimer = null;
let loaderVisibleAt = 0;

const LOADER_MINIMUM_TIME = 350;
const LOADER_SHOW_DELAY = 100;

function getLoadingMessage(url) {
  if (url.includes('/api/login')) return 'Unlocking your private vault...';
  if (url.includes('/api/register')) return 'Creating your secure locker...';
  if (url.includes('/api/password/forgot')) return 'Recovering your vault...';
  if (url.includes('/api/recovery/setup')) return 'Generating your recovery key...';
  if (url.includes('/api/logout')) return 'Locking your vault...';

  if (url.includes('/api/files') && url.includes('/preview')) {
    return 'Decrypting your file preview...';
  }

  if (url.includes('/api/files') && url.includes('/download')) {
    return 'Preparing your secure download...';
  }

  if (url === '/api/files' || url.startsWith('/api/files?')) {
    return 'Processing your files securely...';
  }

  if (url.includes('/api/folders')) return 'Loading your folders...';
  if (url.includes('/api/locker')) return 'Loading your vault settings...';
  if (url.includes('/api/auth/status')) return 'Checking your secure session...';

  return 'Processing your request securely...';
}

function showGlobalLoader(text) {
  const loader = $('#global-loader');
  const messageElement = $('#loader-message');

  if (!loader || !messageElement) return;

  messageElement.textContent = text;

  clearTimeout(loaderHideTimer);
  clearTimeout(loaderShowTimer);

  loaderShowTimer = setTimeout(() => {
    if (activeRequests > 0 && loader.hidden) {
      loader.hidden = false;
      loaderVisibleAt = Date.now();
    }
  }, LOADER_SHOW_DELAY);
}

function hideGlobalLoader() {
  const loader = $('#global-loader');

  if (!loader) return;

  activeRequests = Math.max(0, activeRequests - 1);

  if (activeRequests > 0) return;

  clearTimeout(loaderShowTimer);

  const elapsed = loader.hidden
    ? 0
    : Date.now() - loaderVisibleAt;

  const remaining = Math.max(
    0,
    LOADER_MINIMUM_TIME - elapsed
  );

  clearTimeout(loaderHideTimer);

  loaderHideTimer = setTimeout(() => {
    if (activeRequests === 0) {
      loader.hidden = true;
    }
  }, remaining);
}

// ==========================================
// CENTRAL API FUNCTION WITH LOADING SCREEN
// ==========================================

async function api(url, options = {}) {
  let response;

  activeRequests++;

  showGlobalLoader(getLoadingMessage(url));

  const fetchOptions = { ...options };

  delete fetchOptions.loadingMessage;

  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...fetchOptions
    });

    const type = response.headers.get('content-type') || '';

    const data = type.includes('application/json')
      ? await response.json()
      : null;

    if (!response.ok || (data && data.ok !== true)) {
      throw new Error(
        data?.error || `Request failed (${response.status}).`
      );
    }

    return data || response;

  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        'Cannot reach CryptLock. Check that the server is running.'
      );
    }

    throw error;

  } finally {
    hideGlobalLoader();
  }
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function setFormBusy(form, busy, label) {
  const button = $('button[type="submit"]', form);
  if (!button) return;

  button.disabled = busy;
  button.classList.toggle('is-loading', busy);

  const text = $('.button-text', button);

  if (text) {
    if (!button.dataset.label) {
      button.dataset.label = text.textContent;
    }

    text.textContent = busy ? label : button.dataset.label;
  }
}

function message(id, text, success = false) {
  const el = $(id);

  if (el) {
    el.textContent = text;
    el.classList.toggle('success', success);
  }
}

// ==========================================
// AUTHENTICATION VIEW MANAGEMENT
// ==========================================

function showAuth(view = 'login') {
  appShell.hidden = true;
  authShell.hidden = false;

  loginView.hidden = view !== 'login';
  registerView.hidden = view !== 'register';
  forgotView.hidden = view !== 'forgot';
}

async function showApp() {
  authShell.hidden = true;
  appShell.hidden = false;

  await refreshData();
  navigate('overview');
}

$$('[data-view]').forEach(b => {
  b.addEventListener('click', () => showAuth(b.dataset.view));
});

$$('[data-toggle]').forEach(b => {
  b.addEventListener('click', () => {
    const input = $('#' + b.dataset.toggle);

    input.type = input.type === 'password'
      ? 'text'
      : 'password';

    b.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
});

// ==========================================
// PASSWORD STRENGTH
// ==========================================

const registerPassword = $('#register-password');
const strengthWrap = $('#strength-wrap');
const strengthLabel = $('#strength-label');

if (registerPassword && strengthWrap) {
  registerPassword.addEventListener('input', () => {
    const value = registerPassword.value;
    let score = 0;

    if (value.length >= 8) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;

    if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) {
      score++;
    }

    strengthWrap.dataset.level = value.length
      ? String(Math.max(1, score))
      : '0';

    strengthLabel.textContent = !value
      ? 'PASSWORD STRENGTH'
      : [
          '',
          'WEAK PASSWORD',
          'FAIR PASSWORD',
          'GOOD PASSWORD',
          'STRONG PASSWORD'
        ][Math.max(1, score)];
  });
}

$$('[data-view]').forEach(button => {
  button.addEventListener('click', () => {
    const card = $('#auth-card');

    if (card) {
      card.classList.remove('auth-card-enter');
      void card.offsetWidth;
      card.classList.add('auth-card-enter');
    }
  });
});

// ==========================================
// LOGIN
// ==========================================

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const username = $('#login-username').value.trim().toLowerCase();
  const password = $('#login-password').value;

  message('#login-message', '');

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return message(
      '#login-message',
      'Enter a valid username (3–24 letters, numbers or underscores).'
    );
  }

  if (!password) {
    return message('#login-message', 'Enter your master password.');
  }

  setFormBusy(form, true, 'Unlocking vault...');

  try {
    await api('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password
      })
    });

    form.reset();
    await showApp();

  } catch (err) {
    message('#login-message', err.message);

  } finally {
    setFormBusy(form, false);
  }
});

// ==========================================
// FORGOT PASSWORD / ACCOUNT RECOVERY
// ==========================================

// Open forgot-password screen
$('#forgot-password-link').addEventListener('click', () => {
  $('#recovery-username').value =
    $('#login-username').value.trim().toLowerCase();

  message('#forgot-message', '');
  showAuth('forgot');
});

// Return to login screen
$('#back-to-login').addEventListener('click', () => {
  showAuth('login');
});

// Reset master password using recovery key
$('#forgot-form').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.currentTarget;

  const username = $('#recovery-username')
    .value.trim().toLowerCase();

  const recoveryKey = $('#recovery-key-input')
    .value.trim();

  const newPassword = $('#recovery-new-password').value;

  const confirmPassword =
    $('#recovery-confirm-password').value;

  message('#forgot-message', '');

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return message(
      '#forgot-message',
      'Enter a valid username.'
    );
  }

  if (!recoveryKey) {
    return message(
      '#forgot-message',
      'Enter your recovery key.'
    );
  }

  if (newPassword.length < 8 || newPassword.length > 72) {
    return message(
      '#forgot-message',
      'Password must contain 8 to 72 characters.'
    );
  }

  if (newPassword !== confirmPassword) {
    return message(
      '#forgot-message',
      'Passwords do not match.'
    );
  }

  setFormBusy(form, true, 'Resetting password...');

  try {
    const result = await api('/api/password/forgot', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        recoveryKey,
        newPassword
      })
    });

    form.reset();

    $('#login-username').value = username;

    showAuth('login');

    message(
      '#login-message',
      result.message ||
        'Password reset successfully. Sign in with your new password.',
      true
    );

  } catch (error) {
    message('#forgot-message', error.message);

  } finally {
    setFormBusy(form, false);
  }
});

// ==========================================
// REGISTRATION
// ==========================================

$('#register-form').addEventListener('submit', async e => {
  e.preventDefault();

  const form = e.currentTarget;
  const username = $('#register-username').value.trim().toLowerCase();
  const password = $('#register-password').value;
  const confirm = $('#confirm-password').value;
  const lockerName = $('#register-locker-name').value.trim();

  message('#register-message', '');

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return message(
      '#register-message',
      'Choose a username of 3–24 characters using letters, numbers or underscores.'
    );
  }

  if (!lockerName || lockerName.length > 40 || /[\\/]/.test(lockerName)) {
    return message(
      '#register-message',
      'Choose a locker name of 1 to 40 characters without slashes.'
    );
  }

  if (password.length < 8 || password.length > 72) {
    return message(
      '#register-message',
      'Use a password between 8 and 72 characters.'
    );
  }

  if (password !== confirm) {
    return message(
      '#register-message',
      'The passwords do not match.'
    );
  }

  setFormBusy(form, true, 'Creating locker...');

  try {
    await api('/api/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        password,
        lockerName
      })
    });

    form.reset();
    $('#login-username').value = username;

    showAuth('login');

    message(
      '#login-message',
      'Your locker is ready. Sign in to continue.',
      true
    );

  } catch (err) {
    message('#register-message', err.message);

  } finally {
    setFormBusy(form, false);
  }
});

// ==========================================
// FILE UTILITIES
// ==========================================

function formatBytes(n = 0) {
  const bytes = Math.max(0, Number(n) || 0);

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const u = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;

  while (value >= 1024 && i < u.length - 1) {
    value /= 1024;
    i++;
  }

  return `${value.toFixed(2)} ${u[i]}`;
}

function exactBytes(n = 0) {
  return `${(Number(n) || 0).toLocaleString()} bytes`;
}

function fileCategory(name = '') {
  const ext = name.includes('.')
    ? name.split('.').pop().toLowerCase()
    : '';

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'tif', 'tiff'].includes(ext)) return 'image';
  if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'ppt', 'pptx', 'xls', 'xlsx', 'csv'].includes(ext)) return 'document';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (['c', 'h', 'cpp', 'py', 'js', 'ts', 'html', 'css', 'java', 'json', 'xml', 'sql', 'php', 'go', 'rs'].includes(ext)) return 'code';

  return 'other';
}

function dateLabel(d) {
  return d
    ? new Date(d).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : '—';
}

function fileGlyph(name = '') {
  const ext = name.split('.').pop().toLowerCase();

  return ({
    pdf: 'PDF',
    png: 'IMG',
    jpg: 'IMG',
    jpeg: 'IMG',
    gif: 'IMG',
    webp: 'IMG',
    doc: 'DOC',
    docx: 'DOC',
    txt: 'TXT',
    csv: 'CSV',
    xlsx: 'XLS',
    xls: 'XLS',
    ppt: 'PPT',
    pptx: 'PPT',
    zip: 'ZIP',
    mp4: 'VID',
    mp3: 'AUD'
  })[ext] || 'FILE';
}

function safeText(tag, cls, text) {
  const el = document.createElement(tag);

  if (cls) {
    el.className = cls;
  }

  el.textContent = text;
  return el;
}

// ==========================================
// REFRESH DATA
// ==========================================

async function refreshData() {
  const [f, d, l] = await Promise.all([
    api('/api/files'),
    api('/api/folders'),
    api('/api/locker')
  ]);

  files = f.files;
  folders = d.folders;
  lockerName = l.lockerName || 'My locker';

  updateLockerBranding();
  renderOverview();
  renderAll();
  renderFolders();
  renderRecent();
  renderTrash();

  $('#nav-file-count').textContent =
    files.filter(x => !x.trashedAt).length;
}

// ==========================================
// NAVIGATION
// ==========================================

function navigate(page) {
  currentPage = page;

  $$('.page-view').forEach(v => {
    v.hidden = v.id !== `page-${page}`;
  });

  $$('.nav-link[data-page]').forEach(b => {
    b.classList.toggle('active', b.dataset.page === page);
  });

  const labels = {
    overview: 'Overview',
    all: 'All files',
    folders: 'Folders',
    recent: 'Recent',
    trash: 'Trash'
  };

  $('#breadcrumb-current').textContent =
    labels[page] || 'Overview';

  $('#sidebar').classList.remove('open');
}

$$('[data-page]').forEach(b => {
  b.addEventListener('click', () => navigate(b.dataset.page));
});

$('#mobile-menu').addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
});

// ==========================================
// LOCKER BRANDING
// ==========================================

function updateLockerBranding() {
  const initial = (lockerName.trim()[0] || 'C').toUpperCase();

  $('#profile-locker-name').textContent = lockerName;
  $('#profile-avatar').textContent = initial;
  $('#top-avatar').textContent = initial;

  document.title = `${lockerName} | CryptLock`;
}

// ==========================================
// FILE PREVIEW SUPPORT
// ==========================================

function supportsPreview(name = '') {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));

  const previewable = [
    '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
    '.mp4', '.webm', '.ogv', '.mov', '.mkv', '.avi',
    '.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac',
    '.txt', '.md', '.csv', '.json', '.xml', '.log', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hxx',
    '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.java', '.cs', '.sql', '.php', '.go', '.rs',
    '.sh', '.bash', '.yaml', '.yml', '.toml', '.ini', '.conf', '.rb', '.swift', '.kt', '.dart', '.r', '.lua', '.env', '.mk'
  ];

  return previewable.includes(ext);
}

function actionButton(label, symbol, fn, danger = false) {
  const b = safeText(
    'button',
    `icon-btn${danger ? ' danger' : ''}`,
    symbol
  );

  b.type = 'button';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.addEventListener('click', fn);

  return b;
}

// ==========================================
// FILE ROWS
// ==========================================

function makeFileRow(file, mode = 'normal') {
  const row = document.createElement('div');
  row.className = 'file-row';

  const name = document.createElement('div');
  name.className = 'file-name';

  name.append(
    safeText('span', 'file-type', fileGlyph(file.name))
  );

  const text = document.createElement('div');
  text.style.minWidth = '0';

  text.append(
    safeText('strong', '', file.name),
    safeText('small', '', file.folderName || 'Personal locker')
  );

  name.append(text);

  const size = safeText(
    'span',
    'cell-muted size-cell',
    formatBytes(file.size)
  );

  size.title = exactBytes(file.size);
  size.setAttribute(
    'aria-label',
    `${formatBytes(file.size)} (${exactBytes(file.size)})`
  );

  const date = safeText(
    'span',
    'cell-muted date-cell',
    dateLabel(file.createdAt)
  );

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  if (mode === 'trash') {
    actions.append(
      actionButton('Restore', '↶', () => restoreFile(file.id)),
      actionButton(
        'Delete permanently',
        '×',
        () => permanentDelete(file.id),
        true
      )
    );
  } else {
    if (supportsPreview(file.name)) {
      actions.append(
        actionButton(
          'Preview',
          '◉',
          () => previewFile(file.id, file.name)
        )
      );
    }

    actions.append(
      actionButton(
        'Download',
        '↓',
        () => downloadFile(file.id, file.name)
      ),
      actionButton(
        'Move to folder',
        '↗',
        () => moveFile(file)
      ),
      actionButton(
        'Rename',
        '✎',
        () => renameFile(file)
      ),
      actionButton(
        'Move to trash',
        '⌫',
        () => trashFile(file.id),
        true
      )
    );
  }

  row.append(name, size, date, actions);
  return row;
}

function renderList(target, list, mode = 'normal') {
  const el = $(target);
  el.replaceChildren();

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    empty.append(
      safeText(
        'b',
        '',
        mode === 'trash' ? 'Trash is empty' : 'Nothing here yet'
      ),
      safeText(
        'p',
        '',
        mode === 'trash'
          ? 'Deleted files will appear here.'
          : 'Upload a file or create a folder to get started.'
      )
    );

    el.append(empty);
    return;
  }

  list.forEach(f => el.append(makeFileRow(f, mode)));
}

function activeFiles() {
  return files.filter(f => !f.trashedAt);
}

// ==========================================
// OVERVIEW
// ==========================================

function renderOverview() {
  const active = activeFiles();
  const total = active.reduce((n, f) => n + (f.size || 0), 0);

  $('#stat-files').textContent = active.length;
  $('#stat-folders').textContent = folders.length;
  $('#stat-storage').textContent = formatBytes(total);

  $('#stat-storage').title =
    `${exactBytes(total)} total across ${active.length} active file(s)`;

  $('#stat-storage').setAttribute(
    'aria-label',
    `${formatBytes(total)} encrypted storage used, ${exactBytes(total)}`
  );

  const quick = $('#quick-folders');
  quick.replaceChildren();

  const top = folders.slice(0, 4);

  if (!top.length) {
    quick.append(
      safeText(
        'div',
        'empty-state',
        'No folders yet. Create one from Folders.'
      )
    );
  }

  top.forEach(folder => {
    const b = document.createElement('button');
    b.className = 'quick-folder';

    b.append(
      safeText('span', 'folder-glyph', '▱'),
      safeText('strong', '', folder.name),
      safeText('small', '', `${folder.fileCount || 0} files`)
    );

    b.addEventListener('click', () => {
      navigate('folders');
      selectFolder(folder.id);
    });

    quick.append(b);
  });

  const recent = active
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  renderList('#overview-recent', recent);
}

// ==========================================
// ALL FILES
// ==========================================

function renderAll() {
  const q = $('#file-search').value.trim().toLowerCase();
  const type = $('#file-type-filter')?.value || 'all';
  const sort = $('#file-sort')?.value || 'newest';

  const list = activeFiles().filter(f =>
    f.name.toLowerCase().includes(q) &&
    (type === 'all' || fileCategory(f.name) === type)
  );

  list.sort((a, b) =>
    sort === 'oldest'
      ? new Date(a.createdAt) - new Date(b.createdAt)
      : sort === 'name-asc'
        ? a.name.localeCompare(b.name)
        : sort === 'name-desc'
          ? b.name.localeCompare(a.name)
          : sort === 'largest'
            ? (b.size || 0) - (a.size || 0)
            : sort === 'smallest'
              ? (a.size || 0) - (b.size || 0)
              : new Date(b.createdAt) - new Date(a.createdAt)
  );

  renderList('#all-files-list', list);
}

// ==========================================
// FOLDERS
// ==========================================

function renderFolders() {
  const grid = $('#folders-grid');
  grid.replaceChildren();

  if (!folders.length) {
    grid.append(
      safeText(
        'div',
        'empty-state',
        'No folders created yet. Use “New folder” to organize your files.'
      )
    );
  }

  folders.forEach(folder => {
    const card = document.createElement('button');
    card.className = 'folder-card';

    card.append(
      safeText('span', 'folder-glyph', '▱'),
      safeText('strong', '', folder.name),
      safeText(
        'small',
        '',
        `${folder.fileCount || 0} files · Open folder`
      )
    );

    const del = actionButton(
      'Delete empty folder',
      '×',
      async e => {
        e.stopPropagation();
        await deleteFolder(folder.id);
      },
      true
    );

    del.classList.add('folder-delete');
    card.append(del);

    card.addEventListener('click', () => selectFolder(folder.id));
    grid.append(card);
  });

  if (currentFolderId) {
    const folder = folders.find(f => f.id === currentFolderId);

    $('#folder-files-title').textContent =
      folder ? folder.name : 'Folder contents';

    $('#folder-files-subtitle').textContent =
      folder
        ? 'Files in this collection.'
        : 'Choose a folder to see its files.';

    $('#clear-folder').hidden = false;

    renderList(
      '#folder-files',
      activeFiles().filter(f => f.folderId === currentFolderId)
    );

  } else {
    $('#folder-files-title').textContent = 'Folder contents';
    $('#folder-files-subtitle').textContent =
      'Choose a folder to see its files.';

    $('#clear-folder').hidden = true;
    $('#folder-files').replaceChildren();
  }
}

function selectFolder(id) {
  currentFolderId = id;
  renderFolders();
}

$('#clear-folder').addEventListener('click', () => {
  currentFolderId = null;
  renderFolders();
});

// ==========================================
// RECENT FILES AND TRASH
// ==========================================

function renderRecent() {
  const recent = activeFiles()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderList('#recent-files', recent);
}

function renderTrash() {
  renderList(
    '#trash-files',
    files.filter(f => f.trashedAt),
    'trash'
  );
}

// ==========================================
// SEARCH, FILTER AND LAYOUT
// ==========================================

$('#file-search').addEventListener('input', renderAll);

$('#file-type-filter')?.addEventListener('change', renderAll);
$('#file-sort')?.addEventListener('change', renderAll);

$$('[data-layout]').forEach(b => {
  b.addEventListener('click', () => {
    $$('[data-layout]').forEach(x => {
      x.classList.toggle('selected', x === b);
    });

    $('#all-files-list').classList.toggle(
      'grid-layout',
      b.dataset.layout === 'grid'
    );
  });
});

// ==========================================
// FILE UPLOAD
// ==========================================

const picker = $('#file-picker');

function chooseFiles() {
  picker.click();
}

$('#overview-upload').addEventListener('click', chooseFiles);
$('#all-upload').addEventListener('click', chooseFiles);

picker.addEventListener('change', async () => {
  const chosen = [...picker.files];

  if (!chosen.length) return;

  for (const file of chosen) {
    const data = new FormData();
    data.append('file', file);

    if (currentPage === 'folders' && currentFolderId) {
      data.append('folderId', currentFolderId);
    }

    try {
      await api('/api/files', {
        method: 'POST',
        body: data
      });

      toast(`${file.name} encrypted and uploaded`);

    } catch (err) {
      toast(`${file.name}: ${err.message}`);
    }
  }

  picker.value = '';
  await refreshData();
});

// ==========================================
// CREATE FOLDER MODAL
// ==========================================

function openModal() {
  $('#modal-backdrop').hidden = false;
  $('#folder-name').value = '';
  message('#folder-message', '');
  $('#folder-name').focus();
}

function closeModal() {
  $('#modal-backdrop').hidden = true;
}

$('#create-folder').addEventListener('click', openModal);
$('#modal-close').addEventListener('click', closeModal);

$('#modal-backdrop').addEventListener('click', e => {
  if (e.target.id === 'modal-backdrop') {
    closeModal();
  }
});

$('#folder-form').addEventListener('submit', async e => {
  e.preventDefault();

  const name = $('#folder-name').value.trim();

  if (!name) return;

  try {
    await api('/api/folders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name })
    });

    closeModal();
    await refreshData();
    toast('Folder created.');

  } catch (err) {
    message('#folder-message', err.message);
  }
});

// ==========================================
// FOLDER AND FILE ACTIONS
// ==========================================

async function deleteFolder(id) {
  if (!confirm('Delete this empty folder?')) return;

  try {
    await api(`/api/folders/${id}`, {
      method: 'DELETE'
    });

    if (currentFolderId === id) {
      currentFolderId = null;
    }

    await refreshData();
    toast('Folder deleted.');

  } catch (err) {
    toast(err.message);
  }
}

async function moveFile(file) {
  if (!folders.length) {
    toast('Create a folder first.');
    return;
  }

  const choices = folders
    .map((f, i) => `${i + 1}. ${f.name}`)
    .join('\n');

  const answer = prompt(
    `Move “${file.name}” to which folder? Enter its number:\n${choices}\n\nEnter 0 to move to All files.`
  );

  if (answer === null) return;

  const n = Number(answer);

  if (!Number.isInteger(n) || n < 0 || n > folders.length) {
    toast('Invalid folder selection.');
    return;
  }

  const folderId = n === 0 ? null : folders[n - 1].id;

  try {
    await api(`/api/files/${file.id}/folder`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ folderId })
    });

    await refreshData();
    toast('File moved.');

  } catch (err) {
    toast(err.message);
  }
}

async function renameFile(file) {
  const name = prompt('New file name:', file.name);

  if (name === null || !name.trim()) return;

  try {
    await api(`/api/files/${file.id}/rename`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name.trim()
      })
    });

    await refreshData();
    toast('File renamed.');

  } catch (err) {
    toast(err.message);
  }
}

async function trashFile(id) {
  if (!confirm('Move this file to Trash?')) return;

  try {
    await api(`/api/files/${id}`, {
      method: 'DELETE'
    });

    await refreshData();
    toast('File moved to Trash.');

  } catch (err) {
    toast(err.message);
  }
}

async function restoreFile(id) {
  try {
    await api(`/api/files/${id}/restore`, {
      method: 'POST'
    });

    await refreshData();
    toast('File restored.');

  } catch (err) {
    toast(err.message);
  }
}

async function permanentDelete(id) {
  if (!confirm('Permanently delete this encrypted file? This cannot be undone.')) {
    return;
  }

  try {
    await api(`/api/files/${id}/permanent`, {
      method: 'DELETE'
    });

    await refreshData();
    toast('File permanently deleted.');

  } catch (err) {
    toast(err.message);
  }
}

// ==========================================
// FILE PREVIEW
// ==========================================

async function previewFile(id, name) {
  const tab = window.open('about:blank', '_blank');

  if (!tab) {
    toast('Allow pop-ups to open file previews.');
    return;
  }

  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));

  const textExtensions = [
    '.txt', '.md', '.csv', '.json', '.xml', '.log', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hxx',
    '.py', '.js', '.ts', '.jsx', '.tsx', '.html', '.css', '.java', '.cs', '.sql', '.php', '.go', '.rs',
    '.sh', '.bash', '.yaml', '.yml', '.toml', '.ini', '.conf', '.rb', '.swift', '.kt', '.dart', '.r', '.lua', '.env', '.mk'
  ];

  const videoExtensions = [
    '.mp4', '.webm', '.ogv', '.mov', '.mkv', '.avi'
  ];

  const audioExtensions = [
    '.mp3', '.wav', '.ogg', '.oga', '.m4a', '.aac', '.flac'
  ];

  const doc = tab.document;

  doc.title = `Preview · ${name}`;

  doc.documentElement.style.cssText =
    'min-height:100%;background:#0b0d16;color:#e7e9f5;';

  doc.body.style.cssText =
    'margin:0;min-height:100vh;background:#0b0d16;color:#e7e9f5;font:14px/1.5 system-ui, sans-serif;';

  const header = doc.createElement('header');
  header.textContent = `${name} · Decrypted preview`;

  header.style.cssText =
    'position:sticky;top:0;z-index:2;padding:15px 22px;background:#151827;border-bottom:1px solid #30334a;color:#c8b4ff;font-weight:600;';

  const main = doc.createElement('main');

  main.style.cssText =
    'box-sizing:border-box;min-height:calc(100vh - 54px);padding:20px;display:flex;align-items:center;justify-content:center;';

  const status = doc.createElement('p');
  status.textContent = 'Decrypting secure preview…';

  main.append(status);
  doc.body.replaceChildren(header, main);

  let objectUrl = null;

  const releaseUrl = () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };

  tab.addEventListener('pagehide', releaseUrl, { once: true });

  try {
   const response = await api(
  `/api/files/${encodeURIComponent(id)}/preview`
);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Preview failed.');
    }

    main.replaceChildren();

    if (textExtensions.includes(ext)) {
      const source = await response.text();

      const pre = doc.createElement('pre');
      pre.textContent = source;

      pre.style.cssText =
        'box-sizing:border-box;width:100%;max-width:1200px;max-height:calc(100vh - 110px);overflow:auto;margin:0;padding:24px;background:#111522;border:1px solid #30334a;border-radius:12px;white-space:pre;tab-size:4;font:13px/1.65 ui-monospace,SFMono-Regular,Consolas,monospace;';

      main.append(pre);
      return;
    }

    const blob = await response.blob();
    objectUrl = URL.createObjectURL(blob);

    if (videoExtensions.includes(ext)) {
      const video = doc.createElement('video');

      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.src = objectUrl;

      video.style.cssText =
        'display:block;width:100%;max-width:1200px;max-height:calc(100vh - 110px);background:#000;border-radius:12px;';

      const note = doc.createElement('p');

      note.textContent =
        'If this video format or codec is unsupported by your browser, download the file and try MP4 (H.264/AAC) or WebM.';

      note.style.cssText =
        'position:fixed;bottom:8px;left:20px;right:20px;text-align:center;color:#aab0c5;font:12px system-ui;';

      main.append(video);
      doc.body.append(note);

    } else if (audioExtensions.includes(ext)) {
      const audio = doc.createElement('audio');

      audio.controls = true;
      audio.preload = 'metadata';
      audio.src = objectUrl;
      audio.style.cssText = 'width:min(720px,100%);';

      main.append(audio);

    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
      const image = doc.createElement('img');

      image.src = objectUrl;
      image.alt = name;

      image.style.cssText =
        'display:block;max-width:100%;max-height:calc(100vh - 110px);object-fit:contain;border-radius:10px;';

      main.append(image);

    } else if (ext === '.pdf') {
      const frame = doc.createElement('iframe');

      frame.src = objectUrl;
      frame.title = name;

      frame.style.cssText =
        'width:100%;height:calc(100vh - 100px);border:0;background:#fff;';

      main.style.cssText = 'display:block;padding:0;min-height:0;';
      main.append(frame);

    } else {
      throw new Error(
        'This format does not have a built-in browser preview yet. Download it instead.'
      );
    }

  } catch (error) {
    tab.close();
    toast(error.message);
  }
}

// ==========================================
// FILE DOWNLOAD
// ==========================================

async function downloadFile(id, name) {
  try {
    const response = await api(
  `/api/files/${encodeURIComponent(id)}/download`
  );

    if (!response.ok) {
      const d = await response.json().catch(() => ({}));
      throw new Error(d.error || 'Download failed.');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = name;

    document.body.append(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast('Decrypted download ready.');

  } catch (err) {
    toast(err.message);
  }
}

// ==========================================
// RECOVERY KEY GENERATION
// ==========================================

$('#generate-recovery-key').addEventListener('click', async () => {
  const confirmed = confirm(
    'Generate a new recovery key? Any previously saved recovery key will stop working.'
  );

  if (!confirmed) return;

  message(
    '#recovery-setup-message',
    'Generating recovery key...'
  );

  $('#recovery-key-result').hidden = true;

  try {
    const result = await api('/api/recovery/setup', {
      method: 'POST'
    });

    $('#recovery-key-output').value = result.recoveryKey;
    $('#recovery-key-result').hidden = false;

    message(
      '#recovery-setup-message',
      'Recovery key generated. Save it now.',
      true
    );

  } catch (error) {
    message(
      '#recovery-setup-message',
      error.message
    );
  }
});

// ==========================================
// COPY RECOVERY KEY
// ==========================================

$('#copy-recovery-key').addEventListener('click', async () => {
  const recoveryKey = $('#recovery-key-output').value;

  if (!recoveryKey) return;

  try {
    await navigator.clipboard.writeText(recoveryKey);

    toast('Recovery key copied. Store it securely.');

  } catch (error) {
    message(
      '#recovery-setup-message',
      'Clipboard unavailable. Select and copy the key manually.'
    );
  }
});

// ==========================================
// LOCKER SETTINGS
// ==========================================

function closeLockerSettings() {
  $('#locker-settings-backdrop').hidden = true;
}

$('#locker-settings-button').addEventListener('click', () => {
  $('#locker-name-input').value = lockerName;

  message('#locker-settings-message', '');

  $('#locker-settings-backdrop').hidden = false;
  $('#locker-name-input').focus();
});

$('#locker-settings-close').addEventListener(
  'click',
  closeLockerSettings
);

$('#locker-settings-backdrop').addEventListener('click', e => {
  if (e.target.id === 'locker-settings-backdrop') {
    closeLockerSettings();
  }
});

$('#locker-settings-form').addEventListener('submit', async e => {
  e.preventDefault();

  const name = $('#locker-name-input').value.trim();

  if (!name || name.length > 40 || /[\\/]/.test(name)) {
    return message(
      '#locker-settings-message',
      'Use 1 to 40 characters without slashes.'
    );
  }

  try {
    const result = await api('/api/locker', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lockerName: name })
    });

    lockerName = result.lockerName;

    updateLockerBranding();
    closeLockerSettings();

    toast('Locker name updated.');

  } catch (err) {
    message('#locker-settings-message', err.message);
  }
});

// ==========================================
// LOGOUT
// ==========================================

$('#logout-button').addEventListener('click', async () => {
  try {
    await api('/api/logout', {
      method: 'POST'
    });

    files = [];
    folders = [];
    currentFolderId = null;

    showAuth('login');
    toast('Your locker is locked.');

  } catch (err) {
    toast(err.message);
  }
});

// ==========================================
// CHECK EXISTING AUTHENTICATION SESSION
// ==========================================

(async () => {
  try {
    const s = await api('/api/auth/status');

    if (s.authenticated) {
      await showApp();
    }

  } catch {
    showAuth('login');
  }
})();