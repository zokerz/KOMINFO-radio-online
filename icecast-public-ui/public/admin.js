const loginPanel = document.getElementById('loginPanel');
const cmsPanel = document.getElementById('cmsPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');
const adminName = document.getElementById('adminName');
const mediaForm = document.getElementById('mediaForm');
const formTitle = document.getElementById('formTitle');
const formMessage = document.getElementById('formMessage');
const mediaList = document.getElementById('mediaList');
const resetFormBtn = document.getElementById('resetFormBtn');
const contentForm = document.getElementById('contentForm');
const contentList = document.getElementById('contentList');
const contentMessage = document.getElementById('contentMessage');
const resetContentBtn = document.getElementById('resetContentBtn');
const contentTabs = document.querySelectorAll('.tab');

let contentStore = {};
let activeContentSection = 'programs';

const sectionConfig = {
  programs: {
    title: 'Judul Program',
    secondary: 'Waktu',
    tertiary: 'Penyiar',
    body: 'Deskripsi',
    url: false,
    type: false,
    onAir: true
  },
  schedules: {
    title: 'Nama Program',
    secondary: 'Hari',
    tertiary: 'Jam / Penyiar',
    body: 'Catatan',
    url: false,
    type: false,
    onAir: false
  },
  news: {
    title: 'Judul Berita',
    secondary: 'Tanggal',
    tertiary: 'Ringkasan Pendek',
    body: 'Excerpt',
    url: true,
    type: false,
    onAir: false
  },
  announcers: {
    title: 'Nama Penyiar',
    secondary: 'Role',
    tertiary: 'URL Foto',
    body: 'Bio',
    url: false,
    type: false,
    onAir: false
  },
  galleries: {
    title: 'Judul Media',
    secondary: 'Deskripsi Singkat',
    tertiary: 'URL Media',
    body: 'Deskripsi',
    url: false,
    type: true,
    onAir: false
  }
};

function showMessage(el, text, type = '') {
  el.textContent = text;
  el.className = `message ${type}`;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request gagal');
  return data;
}

function localToIso(value) {
  return value ? new Date(value).toISOString() : '';
}

function isoToLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function resetForm() {
  mediaForm.reset();
  document.getElementById('mediaId').value = '';
  document.getElementById('mediaQueueOrder').value = '0';
  document.getElementById('mediaPriority').value = '0';
  formTitle.textContent = 'Tambah Media';
  showMessage(formMessage, '');
}

function fillForm(item) {
  document.getElementById('mediaId').value = item.id;
  document.getElementById('mediaTitle').value = item.title;
  document.getElementById('mediaUrl').value = item.url;
  document.getElementById('mediaType').value = item.type;
  document.getElementById('mediaPlaybackMode').value = item.playbackMode || 'queue';
  document.getElementById('mediaQueueOrder').value = item.queueOrder || 0;
  document.getElementById('mediaPriority').value = item.priority || 0;
  document.getElementById('mediaStart').value = isoToLocal(item.startAt);
  document.getElementById('mediaEnd').value = isoToLocal(item.endAt);
  document.getElementById('mediaTimeStart').value = item.timeStart || '';
  document.getElementById('mediaTimeEnd').value = item.timeEnd || '';
  document.getElementById('mediaEnabled').checked = item.enabled;
  document.getElementById('mediaNotes').value = item.notes || '';
  document.querySelectorAll('input[name="mediaDays"]').forEach((checkbox) => {
    checkbox.checked = Array.isArray(item.daysOfWeek) && item.daysOfWeek.includes(Number(checkbox.value));
  });
  formTitle.textContent = 'Edit Media';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getFormPayload() {
  const daysOfWeek = Array.from(document.querySelectorAll('input[name="mediaDays"]:checked')).map((checkbox) => Number(checkbox.value));
  return {
    title: document.getElementById('mediaTitle').value,
    url: document.getElementById('mediaUrl').value,
    type: document.getElementById('mediaType').value,
    playbackMode: document.getElementById('mediaPlaybackMode').value,
    queueOrder: Number(document.getElementById('mediaQueueOrder').value || 0),
    priority: Number(document.getElementById('mediaPriority').value || 0),
    startAt: localToIso(document.getElementById('mediaStart').value),
    endAt: localToIso(document.getElementById('mediaEnd').value),
    daysOfWeek,
    timeStart: document.getElementById('mediaTimeStart').value,
    timeEnd: document.getElementById('mediaTimeEnd').value,
    enabled: document.getElementById('mediaEnabled').checked,
    notes: document.getElementById('mediaNotes').value
  };
}

function modeLabel(mode) {
  return {
    schedule: 'Jam',
    queue: 'Queue',
    priority: 'Prioritas',
    loop: 'Loop'
  }[mode] || 'Queue';
}

function dayLabel(days) {
  if (!Array.isArray(days) || !days.length) return 'Setiap hari';
  const labels = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  return days.map((day) => labels[day]).filter(Boolean).join(', ');
}

function renderMedia(items) {
  if (!items.length) {
    mediaList.innerHTML = '<p>Belum ada media automation.</p>';
    return;
  }

  mediaList.innerHTML = items.map((item) => `
    <article class="media-card">
      <div>
        <span class="badge">${item.enabled ? 'Aktif' : 'Nonaktif'} • ${item.type}</span>
        <span class="badge">${modeLabel(item.playbackMode)} • Q${item.queueOrder || 0} • P${item.priority || 0}</span>
        <h3>${item.title}</h3>
        <p>${item.url}</p>
        <p>${item.startAt ? `Mulai: ${new Date(item.startAt).toLocaleString('id-ID')}` : 'Mulai: kapan saja'}</p>
        <p>${item.endAt ? `Selesai: ${new Date(item.endAt).toLocaleString('id-ID')}` : 'Selesai: tidak dibatasi'}</p>
        <p>Hari: ${dayLabel(item.daysOfWeek)}${item.timeStart || item.timeEnd ? ` • Jam: ${item.timeStart || '00:00'} - ${item.timeEnd || '23:59'}` : ''}</p>
      </div>
      <div class="card-actions">
        <button type="button" data-edit="${item.id}">Edit</button>
        <button type="button" class="danger-btn" data-delete="${item.id}">Hapus</button>
      </div>
    </article>
  `).join('');
}

async function loadMedia() {
  const data = await api('/api/admin/media');
  renderMedia(data.items || []);
}

async function checkSession() {
  try {
    const me = await api('/api/admin/me');
    adminName.textContent = me.username;
    loginPanel.classList.add('hidden');
    cmsPanel.classList.remove('hidden');
    await loadMedia();
    await loadContent();
  } catch (e) {
    loginPanel.classList.remove('hidden');
    cmsPanel.classList.add('hidden');
  }
}

function setFieldVisibility(id, visible) {
  document.getElementById(id).hidden = !visible;
}

function applyContentSection(section) {
  activeContentSection = section;
  document.getElementById('contentSection').value = section;
  const cfg = sectionConfig[section];
  document.getElementById('fieldTitle').firstChild.textContent = cfg.title;
  document.getElementById('fieldSecondary').firstChild.textContent = cfg.secondary;
  document.getElementById('fieldTertiary').firstChild.textContent = cfg.tertiary;
  document.getElementById('fieldBody').firstChild.textContent = cfg.body;
  setFieldVisibility('fieldUrl', cfg.url);
  setFieldVisibility('fieldType', cfg.type);
  document.getElementById('contentOnAir').closest('label').hidden = !cfg.onAir;
  resetContentForm();
  renderContentList();
}

function resetContentForm() {
  contentForm.reset();
  document.getElementById('contentId').value = '';
  document.getElementById('contentSection').value = activeContentSection;
  document.getElementById('contentEnabled').checked = true;
  showMessage(contentMessage, '');
}

function contentPayloadFromForm() {
  const title = document.getElementById('contentTitle').value;
  const secondary = document.getElementById('contentSecondary').value;
  const tertiary = document.getElementById('contentTertiary').value;
  const body = document.getElementById('contentBody').value;
  const enabled = document.getElementById('contentEnabled').checked;
  const onAir = document.getElementById('contentOnAir').checked;
  const url = document.getElementById('contentUrl').value;
  const type = document.getElementById('contentType').value;

  if (activeContentSection === 'programs') return { title, time: secondary, announcer: tertiary, description: body, onAir, enabled };
  if (activeContentSection === 'schedules') return { title, day: secondary, time: tertiary, announcer: body, enabled };
  if (activeContentSection === 'news') return { title, date: secondary, excerpt: body || tertiary, url, enabled };
  if (activeContentSection === 'announcers') return { name: title, role: secondary, imageUrl: tertiary, bio: body, enabled };
  return { title, description: body || secondary, mediaUrl: tertiary, type, enabled };
}

function fillContentForm(item) {
  document.getElementById('contentId').value = item.id;
  document.getElementById('contentEnabled').checked = item.enabled !== false;
  document.getElementById('contentOnAir').checked = Boolean(item.onAir);

  if (activeContentSection === 'programs') {
    document.getElementById('contentTitle').value = item.title || '';
    document.getElementById('contentSecondary').value = item.time || '';
    document.getElementById('contentTertiary').value = item.announcer || '';
    document.getElementById('contentBody').value = item.description || '';
  } else if (activeContentSection === 'schedules') {
    document.getElementById('contentTitle').value = item.title || '';
    document.getElementById('contentSecondary').value = item.day || '';
    document.getElementById('contentTertiary').value = item.time || '';
    document.getElementById('contentBody').value = item.announcer || '';
  } else if (activeContentSection === 'news') {
    document.getElementById('contentTitle').value = item.title || '';
    document.getElementById('contentSecondary').value = item.date || '';
    document.getElementById('contentTertiary').value = item.excerpt || '';
    document.getElementById('contentBody').value = item.excerpt || '';
    document.getElementById('contentUrl').value = item.url || '';
  } else if (activeContentSection === 'announcers') {
    document.getElementById('contentTitle').value = item.name || '';
    document.getElementById('contentSecondary').value = item.role || '';
    document.getElementById('contentTertiary').value = item.imageUrl || '';
    document.getElementById('contentBody').value = item.bio || '';
  } else {
    document.getElementById('contentTitle').value = item.title || '';
    document.getElementById('contentSecondary').value = item.description || '';
    document.getElementById('contentTertiary').value = item.mediaUrl || '';
    document.getElementById('contentBody').value = item.description || '';
    document.getElementById('contentType').value = item.type || 'image';
  }
}

function itemTitle(item) {
  return item.title || item.name || 'Tanpa judul';
}

function itemSubtitle(item) {
  return item.time || item.day || item.date || item.role || item.type || 'Konten website';
}

function renderContentList() {
  const items = contentStore[activeContentSection] || [];
  if (!items.length) {
    contentList.innerHTML = '<p>Belum ada konten untuk section ini.</p>';
    return;
  }

  contentList.innerHTML = items.map((item) => `
    <article class="media-card">
      <div>
        <span class="badge">${item.enabled === false ? 'Hidden' : 'Tampil'}</span>
        <h3>${itemTitle(item)}</h3>
        <p>${itemSubtitle(item)}</p>
      </div>
      <div class="card-actions">
        <button type="button" data-content-edit="${item.id}">Edit</button>
        <button type="button" class="danger-btn" data-content-delete="${item.id}">Hapus</button>
      </div>
    </article>
  `).join('');
}

async function loadContent() {
  contentStore = await api('/api/admin/content');
  renderContentList();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(loginMessage, 'Memproses login...');
  try {
    const payload = {
      username: document.getElementById('username').value,
      password: document.getElementById('password').value
    };
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify(payload) });
    loginForm.reset();
    showMessage(loginMessage, '');
    await checkSession();
  } catch (e) {
    showMessage(loginMessage, e.message, 'error');
  }
});

logoutBtn.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
  await checkSession();
});

mediaForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.getElementById('mediaId').value;
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/admin/media/${id}` : '/api/admin/media';
  try {
    await api(url, { method, body: JSON.stringify(getFormPayload()) });
    resetForm();
    showMessage(formMessage, 'Media berhasil disimpan.', 'ok');
    await loadMedia();
  } catch (e) {
    showMessage(formMessage, e.message, 'error');
  }
});

resetFormBtn.addEventListener('click', resetForm);
resetContentBtn.addEventListener('click', resetContentForm);

contentTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    contentTabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    applyContentSection(tab.dataset.section);
  });
});

contentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const id = document.getElementById('contentId').value;
  const section = activeContentSection;
  const url = id ? `/api/admin/content/${section}/${id}` : `/api/admin/content/${section}`;
  const method = id ? 'PUT' : 'POST';

  try {
    contentStore = await api(url, { method, body: JSON.stringify(contentPayloadFromForm()) });
    resetContentForm();
    renderContentList();
    showMessage(contentMessage, 'Konten berhasil disimpan.', 'ok');
  } catch (e) {
    showMessage(contentMessage, e.message, 'error');
  }
});

mediaList.addEventListener('click', async (event) => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.delete;
  const data = await api('/api/admin/media');

  if (editId) {
    const item = data.items.find((entry) => entry.id === editId);
    if (item) fillForm(item);
  }

  if (deleteId && confirm('Hapus media ini?')) {
    await api(`/api/admin/media/${deleteId}`, { method: 'DELETE' });
    await loadMedia();
  }
});

contentList.addEventListener('click', async (event) => {
  const editId = event.target.dataset.contentEdit;
  const deleteId = event.target.dataset.contentDelete;
  const items = contentStore[activeContentSection] || [];

  if (editId) {
    const item = items.find((entry) => entry.id === editId);
    if (item) fillContentForm(item);
  }

  if (deleteId && confirm('Hapus konten ini?')) {
    contentStore = await api(`/api/admin/content/${activeContentSection}/${deleteId}`, { method: 'DELETE' });
    renderContentList();
  }
});

applyContentSection('programs');
checkSession();
