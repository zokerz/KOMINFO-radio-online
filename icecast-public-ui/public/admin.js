const loginPanel = document.getElementById('loginPanel');
const cmsPanel = document.getElementById('cmsPanel');
const loginForm = document.getElementById('loginForm');
const loginMessage = document.getElementById('loginMessage');
const logoutBtn = document.getElementById('logoutBtn');
const adminName = document.getElementById('adminName');
const mediaForm = document.getElementById('mediaForm');
const formMessage = document.getElementById('formMessage');
const mediaList = document.getElementById('mediaList');
const resetFormBtn = document.getElementById('resetFormBtn');
const contentForm = document.getElementById('contentForm');
const contentPanel = contentForm.closest('.panel');
const contentList = document.getElementById('contentList');
const contentMessage = document.getElementById('contentMessage');
const resetContentBtn = document.getElementById('resetContentBtn');
const contentSearch = document.getElementById('contentSearch');
const contentPhoto = document.getElementById('contentPhoto');
const contentPhotoData = document.getElementById('contentPhotoData');
const contentPhotoPreview = document.getElementById('contentPhotoPreview');
const navButtons = document.querySelectorAll('.nav-btn');
const viewPanels = document.querySelectorAll('.view');
const viewTitle = document.getElementById('viewTitle');
const viewEyebrow = document.getElementById('viewEyebrow');
const recentContent = document.getElementById('recentContent');
const compactListToggle = document.getElementById('settingCompactList');
const autoRefreshToggle = document.getElementById('settingAutoRefresh');
const passwordForm = document.getElementById('passwordForm');
const passwordMessage = document.getElementById('passwordMessage');

let contentStore = {};
let mediaStore = [];
let activeContentSection = 'news';
let activeView = 'dashboard';
let contentFilter = 'all';
let refreshTimer = null;

const contentSections = ['news', 'programs', 'schedules', 'announcers', 'galleries'];
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const TARGET_PHOTO_BYTES = 100 * 1024;

const viewCopy = {
  dashboard: ['Dashboard', 'Halo Admin, Selamat Datang'],
  news: ['Kelola Berita', 'Kelola Berita'],
  programs: ['Kelola Program', 'Kelola Program'],
  schedules: ['Kelola Jadwal', 'Kelola Jadwal Siaran'],
  announcers: ['Kelola Penyiar', 'Kelola Profil Penyiar'],
  galleries: ['Kelola Galeri', 'Kelola Galeri & Video'],
  settings: ['CMS Settings', 'Pengaturan CMS']
};

const sectionConfig = {
  programs: {
    headline: 'Kelola Program',
    title: 'Nama Program',
    secondary: 'Jam Tayang',
    secondaryControl: 'time',
    tertiary: 'Penyiar',
    tertiaryControl: 'text',
    body: 'Deskripsi Singkat',
    url: false,
    type: false,
    onAir: true,
    icon: 'playlist_play'
  },
  schedules: {
    headline: 'Kelola Jadwal Siaran',
    title: 'Nama Program',
    secondary: 'Hari',
    secondaryControl: 'day',
    tertiary: 'Jam Siaran',
    tertiaryControl: 'time',
    body: 'Penyiar',
    url: false,
    type: false,
    onAir: false,
    icon: 'calendar_month'
  },
  news: {
    headline: 'Kelola Berita',
    title: 'Judul Berita',
    secondary: 'Tanggal',
    secondaryControl: 'date',
    tertiary: 'Ringkasan Pendek',
    tertiaryControl: 'text',
    body: 'Excerpt',
    url: true,
    type: false,
    onAir: false,
    icon: 'newspaper'
  },
  announcers: {
    headline: 'Kelola Penyiar',
    title: 'Nama Penyiar',
    secondary: 'Role',
    secondaryControl: 'text',
    tertiary: 'Foto Penyiar',
    tertiaryControl: 'photo',
    body: 'Bio',
    url: false,
    type: false,
    onAir: false,
    icon: 'groups'
  },
  galleries: {
    headline: 'Kelola Galeri & Video',
    title: 'Judul Media',
    secondary: 'Deskripsi Singkat',
    secondaryControl: 'text',
    tertiary: 'Foto / URL Video',
    tertiaryControl: 'photo',
    body: 'Deskripsi',
    url: false,
    type: true,
    onAir: false,
    icon: 'photo_library'
  }
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showMessage(el, text, type = '') {
  el.textContent = text;
  el.className = `message ${type}`;
}

function dataUrlBytes(dataUrl) {
  const base64 = String(dataUrl || '').split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca file foto'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('File foto tidak bisa dibuka'));
    image.src = src;
  });
}

function canvasToJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality);
}

async function compressPhoto(file) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('File harus berupa gambar');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Ukuran foto maksimal 5 MB');

  const image = await loadImage(await readFileAsDataUrl(file));
  let maxSide = Math.min(1200, Math.max(image.width, image.height));

  for (let sizeAttempt = 0; sizeAttempt < 8; sizeAttempt += 1) {
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.82; quality >= 0.42; quality -= 0.08) {
      const dataUrl = canvasToJpeg(canvas, quality);
      if (dataUrlBytes(dataUrl) <= TARGET_PHOTO_BYTES) return dataUrl;
    }

    maxSide = Math.round(maxSide * 0.78);
  }

  throw new Error('Foto tidak bisa dikompres sampai 100 KB. Coba foto lain.');
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

function formatDateForDisplay(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function dateDisplayToInput(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const months = {
    januari: 1,
    februari: 2,
    maret: 3,
    april: 4,
    mei: 5,
    juni: 6,
    juli: 7,
    agustus: 8,
    september: 9,
    oktober: 10,
    november: 11,
    desember: 12
  };
  const match = String(value).trim().toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!match || !months[match[2]]) return '';
  return `${match[3]}-${String(months[match[2]]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
}

function configureInputControl(input, control) {
  input.type = control === 'date' ? 'date' : control === 'time' ? 'time' : control === 'url' ? 'url' : 'text';
  input.placeholder = control === 'date' ? 'Pilih tanggal' : control === 'time' ? 'Pilih jam' : '';
}

function configureContentControls(cfg) {
  const secondaryInput = document.getElementById('contentSecondary');
  const secondarySelect = document.getElementById('contentSecondarySelect');
  const tertiaryField = document.getElementById('fieldTertiary');
  const tertiaryInput = document.getElementById('contentTertiary');
  const photoField = document.getElementById('fieldPhoto');
  const isGalleryVideo = activeContentSection === 'galleries' && document.getElementById('contentType').value === 'video';
  const usePhoto = cfg.tertiaryControl === 'photo' && !isGalleryVideo;
  const useDaySelect = cfg.secondaryControl === 'day';

  secondaryInput.hidden = useDaySelect;
  secondaryInput.disabled = useDaySelect;
  secondarySelect.hidden = !useDaySelect;
  secondarySelect.disabled = !useDaySelect;

  configureInputControl(secondaryInput, cfg.secondaryControl);
  tertiaryField.hidden = usePhoto;
  tertiaryInput.hidden = usePhoto;
  tertiaryInput.disabled = usePhoto;
  photoField.hidden = !usePhoto;

  configureInputControl(tertiaryInput, isGalleryVideo ? 'url' : cfg.tertiaryControl);
}

function getSecondaryValue() {
  const cfg = sectionConfig[activeContentSection];
  if (cfg.secondaryControl === 'day') return document.getElementById('contentSecondarySelect').value;
  const value = document.getElementById('contentSecondary').value;
  return cfg.secondaryControl === 'date' ? formatDateForDisplay(value) : value;
}

function setSecondaryValue(value) {
  const cfg = sectionConfig[activeContentSection];
  if (cfg.secondaryControl === 'day') {
    document.getElementById('contentSecondarySelect').value = value || 'Senin';
    return;
  }
  document.getElementById('contentSecondary').value = cfg.secondaryControl === 'date' ? dateDisplayToInput(value) : (value || '');
}

function setView(view) {
  activeView = view;
  navButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === view));
  viewPanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === view));
  const [eyebrow, title] = viewCopy[view] || viewCopy.dashboard;
  viewEyebrow.textContent = eyebrow;
  viewTitle.textContent = title;

  if (contentSections.includes(view)) {
    document.querySelector(`[data-view-panel="${view}"]`).appendChild(contentPanel);
    applyContentSection(view);
  }
}

function resetForm() {
  if (!mediaForm) return;
  mediaForm.reset();
  document.getElementById('mediaId').value = '';
  document.getElementById('mediaQueueOrder').value = '0';
  document.getElementById('mediaPriority').value = '0';
  showMessage(formMessage, '');
}

function fillForm(item) {
  if (!mediaForm) return;
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
  setView('automation');
  mediaForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    schedule: 'Berdasarkan Jam',
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
  if (!mediaList) return;
  if (!items.length) {
    mediaList.innerHTML = '<div class="empty-state">Belum ada media automation.</div>';
    return;
  }

  mediaList.innerHTML = items.map((item) => `
    <article class="cms-card">
      <div class="thumb"><span class="material-symbols-outlined">${item.type === 'video' ? 'movie' : 'music_note'}</span></div>
      <div class="card-main">
        <div class="meta-row">
          <span class="badge ${item.enabled ? '' : 'off'}">${item.enabled ? 'Aktif' : 'Nonaktif'}</span>
          <span class="badge">${escapeHtml(modeLabel(item.playbackMode))}</span>
          <span class="badge warn">Q${Number(item.queueOrder || 0)} / P${Number(item.priority || 0)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.url)}</p>
        <p>${escapeHtml(dayLabel(item.daysOfWeek))}${item.timeStart || item.timeEnd ? `, ${escapeHtml(item.timeStart || '00:00')} - ${escapeHtml(item.timeEnd || '23:59')}` : ''}</p>
      </div>
      <div class="card-actions">
        <button type="button" data-edit="${item.id}" aria-label="Edit media"><span class="material-symbols-outlined">edit</span></button>
        <button type="button" class="danger-btn" data-delete="${item.id}" aria-label="Hapus media"><span class="material-symbols-outlined">delete</span></button>
      </div>
    </article>
  `).join('');
}

async function loadMedia() {
  if (!mediaList) return;
  const data = await api('/api/admin/media');
  mediaStore = data.items || [];
  renderMedia(mediaStore);
  renderDashboard();
}

function setFieldVisibility(id, visible) {
  document.getElementById(id).hidden = !visible;
}

function applyContentSection(section) {
  activeContentSection = section;
  document.getElementById('contentSection').value = section;
  const cfg = sectionConfig[section];
  contentPanel.querySelector('.section-head h2').textContent = cfg.headline;
  document.getElementById('fieldTitle').firstChild.textContent = cfg.title;
  document.getElementById('fieldSecondary').firstChild.textContent = cfg.secondary;
  document.getElementById('fieldTertiary').firstChild.textContent = cfg.tertiary;
  document.getElementById('fieldBody').firstChild.textContent = cfg.body;
  configureContentControls(cfg);
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
  contentPhotoData.value = '';
  contentPhotoPreview.hidden = true;
  contentPhotoPreview.removeAttribute('src');
  configureContentControls(sectionConfig[activeContentSection]);
  showMessage(contentMessage, '');
}

function contentPayloadFromForm() {
  const title = document.getElementById('contentTitle').value;
  const secondary = getSecondaryValue();
  const tertiary = document.getElementById('contentTertiary').value;
  const body = document.getElementById('contentBody').value;
  const enabled = document.getElementById('contentEnabled').checked;
  const onAir = document.getElementById('contentOnAir').checked;
  const url = document.getElementById('contentUrl').value;
  const type = document.getElementById('contentType').value;
  const photoData = contentPhotoData.value;

  if (activeContentSection === 'programs') return { title, time: secondary, announcer: tertiary, description: body, onAir, enabled };
  if (activeContentSection === 'schedules') return { title, day: secondary, time: tertiary, announcer: body, enabled };
  if (activeContentSection === 'news') return { title, date: secondary, excerpt: body || tertiary, url, enabled };
  if (activeContentSection === 'announcers') return { name: title, role: secondary, imageUrl: photoData, bio: body, enabled };
  return { title, description: body || secondary, mediaUrl: type === 'video' ? tertiary : photoData, type, enabled };
}

function setPhotoValue(value) {
  contentPhoto.value = '';
  contentPhotoData.value = value || '';
  if (value) {
    contentPhotoPreview.src = value;
    contentPhotoPreview.hidden = false;
  } else {
    contentPhotoPreview.hidden = true;
    contentPhotoPreview.removeAttribute('src');
  }
}

function fillContentForm(item) {
  document.getElementById('contentId').value = item.id;
  document.getElementById('contentEnabled').checked = item.enabled !== false;
  document.getElementById('contentOnAir').checked = Boolean(item.onAir);

  if (activeContentSection === 'programs') {
    document.getElementById('contentTitle').value = item.title || '';
    setSecondaryValue(item.time);
    document.getElementById('contentTertiary').value = item.announcer || '';
    document.getElementById('contentBody').value = item.description || '';
  } else if (activeContentSection === 'schedules') {
    document.getElementById('contentTitle').value = item.title || '';
    setSecondaryValue(item.day);
    document.getElementById('contentTertiary').value = item.time || '';
    document.getElementById('contentBody').value = item.announcer || '';
  } else if (activeContentSection === 'news') {
    document.getElementById('contentTitle').value = item.title || '';
    setSecondaryValue(item.date);
    document.getElementById('contentTertiary').value = item.excerpt || '';
    document.getElementById('contentBody').value = item.excerpt || '';
    document.getElementById('contentUrl').value = item.url || '';
  } else if (activeContentSection === 'announcers') {
    document.getElementById('contentTitle').value = item.name || '';
    setSecondaryValue(item.role);
    setPhotoValue(item.imageUrl);
    document.getElementById('contentBody').value = item.bio || '';
  } else {
    document.getElementById('contentTitle').value = item.title || '';
    setSecondaryValue(item.description);
    document.getElementById('contentBody').value = item.description || '';
    document.getElementById('contentType').value = item.type || 'image';
    configureContentControls(sectionConfig[activeContentSection]);
    if (item.type === 'video') {
      document.getElementById('contentTertiary').value = item.mediaUrl || '';
      setPhotoValue('');
    } else {
      document.getElementById('contentTertiary').value = '';
      setPhotoValue(item.mediaUrl);
    }
  }
  contentForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function itemTitle(item) {
  return item.title || item.name || 'Tanpa judul';
}

function itemSubtitle(item) {
  return item.time || item.day || item.date || item.role || item.description || item.type || 'Konten website';
}

function itemImage(item) {
  return item.imageUrl || item.mediaUrl || '';
}

function passesContentFilter(item) {
  if (contentFilter === 'enabled' && item.enabled === false) return false;
  if (contentFilter === 'hidden' && item.enabled !== false) return false;
  const query = contentSearch.value.trim().toLowerCase();
  if (!query) return true;
  return [itemTitle(item), itemSubtitle(item), item.excerpt, item.bio].some((value) => String(value || '').toLowerCase().includes(query));
}

function renderContentList() {
  const cfg = sectionConfig[activeContentSection];
  const items = (contentStore[activeContentSection] || []).filter(passesContentFilter);
  if (!items.length) {
    contentList.innerHTML = '<div class="empty-state">Belum ada konten untuk section ini.</div>';
    return;
  }

  contentList.innerHTML = items.map((item) => {
    const image = itemImage(item);
    return `
      <article class="cms-card">
        <div class="thumb">${image ? `<img alt="" src="${escapeHtml(image)}">` : `<span class="material-symbols-outlined">${cfg.icon}</span>`}</div>
        <div class="card-main">
          <div class="meta-row">
            <span class="badge ${item.enabled === false ? 'off' : ''}">${item.enabled === false ? 'Hidden' : 'Tampil'}</span>
            ${item.onAir ? '<span class="badge warn">On Air</span>' : ''}
          </div>
          <h3>${escapeHtml(itemTitle(item))}</h3>
          <p>${escapeHtml(itemSubtitle(item))}</p>
        </div>
        <div class="card-actions">
          <button type="button" data-content-edit="${item.id}" aria-label="Edit konten"><span class="material-symbols-outlined">edit</span></button>
          <button type="button" class="danger-btn" data-content-delete="${item.id}" aria-label="Hapus konten"><span class="material-symbols-outlined">delete</span></button>
        </div>
      </article>
    `;
  }).join('');
}

function flattenContent() {
  return contentSections.flatMap((section) => (contentStore[section] || []).map((item) => ({ ...item, section })));
}

function renderDashboard() {
  contentSections.forEach((section) => {
    const stat = document.querySelector(`[data-stat="${section}"]`);
    if (stat) stat.textContent = contentStore[section]?.length || 0;
  });

  const latest = flattenContent()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 5);

  if (!latest.length) {
    recentContent.innerHTML = '<div class="empty-state">Belum ada aktivitas konten.</div>';
    return;
  }

  recentContent.innerHTML = latest.map((item) => {
    const cfg = sectionConfig[item.section];
    return `
      <article class="activity-card">
        <div class="thumb"><span class="material-symbols-outlined">${cfg.icon}</span></div>
        <div class="card-main">
          <div class="meta-row"><span class="badge">${escapeHtml(cfg.headline.replace('Kelola ', ''))}</span></div>
          <h3>${escapeHtml(itemTitle(item))}</h3>
          <p>${item.updatedAt ? new Date(item.updatedAt).toLocaleString('id-ID') : 'Konten website'}</p>
        </div>
      </article>
    `;
  }).join('');
}

async function loadContent() {
  contentStore = await api('/api/admin/content');
  renderContentList();
  renderDashboard();
}

async function checkSession() {
  try {
    const me = await api('/api/admin/me');
    adminName.textContent = me.username;
    loginPanel.classList.add('hidden');
    cmsPanel.classList.remove('hidden');
    await loadContent();
    setView(activeView);
    scheduleRefresh();
  } catch (e) {
    loginPanel.classList.remove('hidden');
    cmsPanel.classList.add('hidden');
  }
}

function scheduleRefresh() {
  clearInterval(refreshTimer);
  if (!autoRefreshToggle.checked) return;
  refreshTimer = setInterval(() => {
    if (cmsPanel.classList.contains('hidden')) return;
    loadContent().catch(() => {});
  }, 60000);
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
  clearInterval(refreshTimer);
  await checkSession();
});

if (mediaForm) {
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
}

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
    renderDashboard();
    showMessage(contentMessage, 'Konten berhasil disimpan.', 'ok');
  } catch (e) {
    showMessage(contentMessage, e.message, 'error');
  }
});

if (mediaList) {
  mediaList.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    const editId = button.dataset.edit;
    const deleteId = button.dataset.delete;

    if (editId) {
      const item = mediaStore.find((entry) => entry.id === editId);
      if (item) fillForm(item);
    }

    if (deleteId && confirm('Hapus media ini?')) {
      await api(`/api/admin/media/${deleteId}`, { method: 'DELETE' });
      await loadMedia();
    }
  });
}

contentList.addEventListener('click', async (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  const editId = button.dataset.contentEdit;
  const deleteId = button.dataset.contentDelete;
  const items = contentStore[activeContentSection] || [];

  if (editId) {
    const item = items.find((entry) => entry.id === editId);
    if (item) fillContentForm(item);
  }

  if (deleteId && confirm('Hapus konten ini?')) {
    contentStore = await api(`/api/admin/content/${activeContentSection}/${deleteId}`, { method: 'DELETE' });
    renderContentList();
    renderDashboard();
  }
});

navButtons.forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

document.querySelectorAll('[data-jump]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.jump));
});

document.querySelectorAll('.chip').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active'));
    button.classList.add('active');
    contentFilter = button.dataset.filter;
    renderContentList();
  });
});

contentSearch.addEventListener('input', renderContentList);
contentPhoto.addEventListener('change', async () => {
  const file = contentPhoto.files?.[0];
  if (!file) {
    setPhotoValue('');
    return;
  }
  showMessage(contentMessage, 'Mengompres foto...');
  try {
    const dataUrl = await compressPhoto(file);
    setPhotoValue(dataUrl);
    showMessage(contentMessage, `Foto siap disimpan (${Math.round(dataUrlBytes(dataUrl) / 1024)} KB).`, 'ok');
  } catch (e) {
    contentPhoto.value = '';
    setPhotoValue('');
    showMessage(contentMessage, e.message, 'error');
  }
});
document.getElementById('contentType').addEventListener('change', () => {
  configureContentControls(sectionConfig[activeContentSection]);
  setPhotoValue('');
  document.getElementById('contentTertiary').value = '';
});
if (resetFormBtn) resetFormBtn.addEventListener('click', resetForm);
resetContentBtn.addEventListener('click', resetContentForm);
compactListToggle.addEventListener('change', () => {
  document.body.classList.toggle('compact-list', compactListToggle.checked);
  localStorage.setItem('cmsCompactList', compactListToggle.checked ? '1' : '0');
});
autoRefreshToggle.addEventListener('change', () => {
  localStorage.setItem('cmsAutoRefresh', autoRefreshToggle.checked ? '1' : '0');
  scheduleRefresh();
});
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    showMessage(passwordMessage, 'Konfirmasi password baru tidak sama.', 'error');
    return;
  }

  showMessage(passwordMessage, 'Menyimpan password...');
  try {
    await api('/api/admin/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
    passwordForm.reset();
    showMessage(passwordMessage, 'Password berhasil diganti.', 'ok');
  } catch (e) {
    showMessage(passwordMessage, e.message, 'error');
  }
});

compactListToggle.checked = localStorage.getItem('cmsCompactList') === '1';
autoRefreshToggle.checked = localStorage.getItem('cmsAutoRefresh') !== '0';
document.body.classList.toggle('compact-list', compactListToggle.checked);

setView('dashboard');
checkSession();
