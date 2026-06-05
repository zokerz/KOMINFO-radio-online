const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ICECAST_URL = process.env.ICECAST_URL || 'http://127.0.0.1:8099/status-json.xsl';
const STREAM_BASE = process.env.ICECAST_BASE || 'http://127.0.0.1:8099';
const PUBLIC_BASE = process.env.ICECAST_PUBLIC_BASE || STREAM_BASE;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'erks-cms.sqlite');
const MEDIA_FILE = path.join(DATA_DIR, 'media-automation.json');
const CONTENT_FILE = path.join(DATA_DIR, 'site-content.json');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const CMS_ADMIN_USER = process.env.CMS_ADMIN_USER || 'admin';
const CMS_ADMIN_PASSWORD_HASH = process.env.CMS_ADMIN_PASSWORD_HASH || '';
const CMS_ADMIN_PASSWORD = process.env.CMS_ADMIN_PASSWORD || '';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const MAX_IMAGE_DATA_BYTES = 100 * 1024;

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

const sessions = new Map();
let dbInitialized = false;

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSql(sql) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  return execFileSync('sqlite3', [DB_FILE, sql], { encoding: 'utf8' });
}

function runSqlJson(sql) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const output = execFileSync('sqlite3', ['-json', DB_FILE, sql], { encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

function parseJsonRow(row) {
  try {
    return JSON.parse(row);
  } catch (e) {
    return null;
  }
}

function ensureDatabase() {
  if (dbInitialized) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  runSql(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS media_items (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS media_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_items (
      section TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (section, id)
    );
    CREATE TABLE IF NOT EXISTS cms_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  dbInitialized = true;
  migrateJsonStores();
}

function getMeta(key) {
  return runSql(`SELECT value FROM cms_meta WHERE key = ${sqlValue(key)} LIMIT 1;`).trim();
}

function setMeta(key, value) {
  runSql(`INSERT OR REPLACE INTO cms_meta (key, value) VALUES (${sqlValue(key)}, ${sqlValue(value)});`);
}

function migrateJsonStores() {
  if (!getMeta('json_migrated_at') && fs.existsSync(MEDIA_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(MEDIA_FILE, 'utf8'));
      if (Array.isArray(data.items) && data.items.length) writeMediaStore(data.items, data.state || { queueCursor: 0 });
    } catch (e) {
      // Ignore old JSON import errors; SQLite starts empty.
    }
  }

  if (!getMeta('json_migrated_at') && fs.existsSync(CONTENT_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
      writeContentStore({
        programs: Array.isArray(data.programs) ? data.programs : [],
        schedules: Array.isArray(data.schedules) ? data.schedules : [],
        news: Array.isArray(data.news) ? data.news : [],
        announcers: Array.isArray(data.announcers) ? data.announcers : [],
        galleries: Array.isArray(data.galleries) ? data.galleries : []
      });
    } catch (e) {
      // Ignore old JSON import errors; SQLite starts empty.
    }
  }

  if (!getMeta('json_migrated_at')) setMeta('json_migrated_at', new Date().toISOString());
}

function readMediaStore() {
  ensureDatabase();
  try {
    const rows = runSql('SELECT payload FROM media_items ORDER BY updated_at DESC;')
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean)
      .map(parseJsonRow)
      .filter(Boolean);
    const stateRaw = runSql("SELECT value FROM media_state WHERE key = 'state' LIMIT 1;").trim();
    return {
      items: rows,
      state: stateRaw ? JSON.parse(stateRaw) : { queueCursor: 0 },
      updatedAt: getMeta('media_updated_at') || null
    };
  } catch (e) {
    return { items: [], state: { queueCursor: 0 }, updatedAt: null };
  }
}

function writeMediaStore(items, state = { queueCursor: 0 }) {
  ensureDatabase();
  const updatedAt = new Date().toISOString();
  const statements = [
    'BEGIN;',
    'DELETE FROM media_items;',
    'DELETE FROM media_state;',
    ...items.map((item) => `INSERT INTO media_items (id, payload, updated_at) VALUES (${sqlValue(item.id)}, ${sqlValue(JSON.stringify(item))}, ${sqlValue(item.updatedAt || updatedAt)});`),
    `INSERT INTO media_state (key, value) VALUES ('state', ${sqlValue(JSON.stringify(state))});`,
    'COMMIT;'
  ];
  runSql(statements.join('\n'));
  setMeta('media_updated_at', updatedAt);
  return { items, state, updatedAt };
}

function readContentStore() {
  ensureDatabase();
  try {
    const store = { programs: [], schedules: [], news: [], announcers: [], galleries: [], updatedAt: getMeta('content_updated_at') || null };
    const rows = runSqlJson('SELECT section, payload FROM content_items ORDER BY updated_at DESC;');
    rows.forEach((row) => {
      const section = row.section;
      const payload = parseJsonRow(row.payload);
      if (payload && Array.isArray(store[section])) store[section].push(payload);
    });
    return store;
  } catch (e) {
    return { programs: [], schedules: [], news: [], announcers: [], galleries: [], updatedAt: null };
  }
}

function writeContentStore(store) {
  ensureDatabase();
  const payload = {
    programs: store.programs || [],
    schedules: store.schedules || [],
    news: store.news || [],
    announcers: store.announcers || [],
    galleries: store.galleries || [],
    updatedAt: new Date().toISOString()
  };
  const statements = ['BEGIN;', 'DELETE FROM content_items;'];
  ['programs', 'schedules', 'news', 'announcers', 'galleries'].forEach((section) => {
    payload[section].forEach((item) => {
      statements.push(`INSERT INTO content_items (section, id, payload, updated_at) VALUES (${sqlValue(section)}, ${sqlValue(item.id)}, ${sqlValue(JSON.stringify(item))}, ${sqlValue(item.updatedAt || payload.updatedAt)});`);
    });
  });
  statements.push('COMMIT;');
  runSql(statements.join('\n'));
  setMeta('content_updated_at', payload.updatedAt);
  return payload;
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf('=');
        return idx === -1 ? [part, ''] : [part.slice(0, idx), decodeURIComponent(part.slice(idx + 1))];
      })
  );
}

function signSession(id) {
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('hex');
  return `${id}.${sig}`;
}

function verifySessionToken(token) {
  if (!token || !token.includes('.')) return null;
  const [id, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(id).digest('hex');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const session = sessions.get(id);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(id);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return session;
}

function passwordHash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function makePasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${passwordHash(password, salt)}`;
}

function verifyPasswordWithHash(password, storedHash) {
  if (storedHash) {
    const [salt, hash] = storedHash.split(':');
    if (!salt || !hash) return false;
    const candidate = passwordHash(password, salt);
    if (candidate.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'));
  }

  return false;
}

function getAdminPasswordHash() {
  try {
    return getMeta('admin_password_hash');
  } catch (e) {
    return '';
  }
}

function verifyPassword(password) {
  const storedHash = getAdminPasswordHash();
  if (storedHash) return verifyPasswordWithHash(password, storedHash);
  if (CMS_ADMIN_PASSWORD_HASH) return verifyPasswordWithHash(password, CMS_ADMIN_PASSWORD_HASH);

  if (!CMS_ADMIN_PASSWORD) return false;
  const expected = crypto.createHash('sha256').update(CMS_ADMIN_PASSWORD).digest();
  const candidate = crypto.createHash('sha256').update(password).digest();
  return crypto.timingSafeEqual(candidate, expected);
}

function requireAdmin(req, res, next) {
  const session = verifySessionToken(parseCookies(req).cms_session);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  req.admin = session;
  next();
}

function requireSameOrigin(req, res, next) {
  const origin = req.headers.origin || '';
  if (!origin) return next();

  try {
    const originHost = new URL(origin).host;
    if (originHost !== req.headers.host) return res.status(403).json({ error: 'forbidden_origin' });
  } catch (e) {
    return res.status(403).json({ error: 'forbidden_origin' });
  }

  next();
}

function sanitizeMediaItem(input, existing = {}) {
  const title = String(input.title || '').trim();
  const url = String(input.url || '').trim();
  if (!title || title.length > 120) throw new Error('Judul wajib diisi dan maksimal 120 karakter');
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('URL media wajib berupa http/https');

  const type = ['audio', 'video', 'stream'].includes(input.type) ? input.type : 'audio';
  const playbackMode = ['schedule', 'queue', 'priority', 'loop'].includes(input.playbackMode) ? input.playbackMode : 'queue';
  const daysOfWeek = Array.isArray(input.daysOfWeek)
    ? input.daysOfWeek.map(Number).filter((day) => day >= 0 && day <= 6)
    : [];
  const now = new Date().toISOString();
  return {
    id: existing.id || crypto.randomUUID(),
    title,
    url,
    type,
    playbackMode,
    priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 0,
    queueOrder: Number.isFinite(Number(input.queueOrder)) ? Number(input.queueOrder) : 0,
    enabled: Boolean(input.enabled),
    startAt: input.startAt ? String(input.startAt) : '',
    endAt: input.endAt ? String(input.endAt) : '',
    daysOfWeek,
    timeStart: String(input.timeStart || '').slice(0, 5),
    timeEnd: String(input.timeEnd || '').slice(0, 5),
    notes: String(input.notes || '').slice(0, 500),
    createdAt: existing.createdAt || now,
    updatedAt: now
  };
}

function cleanText(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function cleanImageData(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,[a-z0-9+/=]+$/i.test(text)) return text.slice(0, 140000);
  return text.slice(0, 140000);
}

function imageDataBytes(value) {
  const base64 = String(value || '').split(',')[1] || '';
  return Math.ceil((base64.length * 3) / 4);
}

function sanitizeContentItem(section, input, existing = {}) {
  const now = new Date().toISOString();
  const base = {
    id: existing.id || crypto.randomUUID(),
    enabled: input.enabled !== false,
    createdAt: existing.createdAt || now,
    updatedAt: now
  };

  if (section === 'programs') {
    return {
      ...base,
      title: cleanText(input.title, 120),
      time: cleanText(input.time, 80),
      announcer: cleanText(input.announcer, 120),
      description: cleanText(input.description, 500),
      onAir: Boolean(input.onAir)
    };
  }

  if (section === 'schedules') {
    return {
      ...base,
      day: cleanText(input.day, 40),
      time: cleanText(input.time, 80),
      title: cleanText(input.title, 120),
      announcer: cleanText(input.announcer, 120)
    };
  }

  if (section === 'news') {
    return {
      ...base,
      title: cleanText(input.title, 140),
      date: cleanText(input.date, 40),
      excerpt: cleanText(input.excerpt, 500),
      url: cleanText(input.url, 500)
    };
  }

  if (section === 'announcers') {
    return {
      ...base,
      name: cleanText(input.name, 120),
      role: cleanText(input.role, 120),
      bio: cleanText(input.bio, 500),
      imageUrl: cleanImageData(input.imageUrl)
    };
  }

  if (section === 'galleries') {
    return {
      ...base,
      title: cleanText(input.title, 120),
      type: ['image', 'video'].includes(input.type) ? input.type : 'image',
      mediaUrl: input.type === 'video' ? cleanText(input.mediaUrl, 500) : cleanImageData(input.mediaUrl),
      description: cleanText(input.description, 500)
    };
  }

  throw new Error('Section tidak valid');
}

function validateContentItem(section, item) {
  const main = section === 'announcers' ? item.name : item.title;
  if (!main) throw new Error('Judul/nama wajib diisi');
  if (section === 'galleries' && item.type === 'video' && item.mediaUrl && !/^https?:\/\//i.test(item.mediaUrl)) throw new Error('URL media wajib berupa http/https');
  if (section === 'galleries' && item.type !== 'video' && item.mediaUrl && !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(item.mediaUrl)) throw new Error('Foto wajib diunggah dari file gambar');
  if (section === 'announcers' && item.imageUrl && !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(item.imageUrl)) throw new Error('Foto wajib diunggah dari file gambar');
  if (section === 'galleries' && item.type !== 'video' && item.mediaUrl && imageDataBytes(item.mediaUrl) > MAX_IMAGE_DATA_BYTES) throw new Error('Ukuran foto hasil kompresi maksimal 100 KB');
  if (section === 'announcers' && item.imageUrl && imageDataBytes(item.imageUrl) > MAX_IMAGE_DATA_BYTES) throw new Error('Ukuran foto hasil kompresi maksimal 100 KB');
  if (section === 'news' && item.url && !/^https?:\/\//i.test(item.url)) throw new Error('URL berita wajib berupa http/https');
}

function isInsideClockWindow(item, date) {
  if (!item.timeStart && !item.timeEnd) return true;

  const current = date.getHours() * 60 + date.getMinutes();
  const toMinutes = (value) => {
    const [hour, minute] = String(value || '').split(':').map(Number);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return hour * 60 + minute;
  };

  const start = toMinutes(item.timeStart);
  const end = toMinutes(item.timeEnd);
  if (start === null && end === null) return true;
  if (start !== null && end === null) return current >= start;
  if (start === null && end !== null) return current <= end;
  if (start <= end) return current >= start && current <= end;
  return current >= start || current <= end;
}

function activeMediaItems(items, date = new Date()) {
  const now = Date.now();
  return items.filter((item) => {
    if (!item.enabled) return false;
    const start = item.startAt ? new Date(item.startAt).getTime() : null;
    const end = item.endAt ? new Date(item.endAt).getTime() : null;
    if (start && now < start) return false;
    if (end && now > end) return false;
    if (Array.isArray(item.daysOfWeek) && item.daysOfWeek.length && !item.daysOfWeek.includes(date.getDay())) return false;
    if (!isInsideClockWindow(item, date)) return false;
    return true;
  });
}

function buildAutomationPayload(store) {
  const items = activeMediaItems(store.items);
  const byMode = {
    schedule: items.filter((item) => item.playbackMode === 'schedule').sort((a, b) => b.priority - a.priority || a.queueOrder - b.queueOrder),
    queue: items.filter((item) => item.playbackMode === 'queue').sort((a, b) => a.queueOrder - b.queueOrder || a.createdAt.localeCompare(b.createdAt)),
    priority: items.filter((item) => item.playbackMode === 'priority').sort((a, b) => b.priority - a.priority || a.queueOrder - b.queueOrder),
    loop: items.filter((item) => item.playbackMode === 'loop').sort((a, b) => a.queueOrder - b.queueOrder || a.createdAt.localeCompare(b.createdAt))
  };

  const nextItem = byMode.schedule[0] || byMode.queue[0] || byMode.priority[0] || byMode.loop[0] || null;
  return {
    items,
    nextItem,
    groups: byMode,
    updatedAt: store.updatedAt,
    generatedAt: new Date().toISOString()
  };
}

function replaceOrigin(target, base) {
  const targetUrl = new URL(target);
  const baseUrl = new URL(base);
  targetUrl.protocol = baseUrl.protocol;
  targetUrl.host = baseUrl.host;
  return targetUrl.toString();
}

app.post('/api/admin/login', requireSameOrigin, (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (username !== CMS_ADMIN_USER || !verifyPassword(password)) {
    return res.status(401).json({ error: 'Login tidak valid' });
  }

  const id = crypto.randomUUID();
  sessions.set(id, { username, expiresAt: Date.now() + SESSION_TTL_MS });
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `cms_session=${encodeURIComponent(signSession(id))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure ? '; Secure' : ''}`);
  res.json({ ok: true, username });
});

app.post('/api/admin/logout', requireSameOrigin, requireAdmin, (req, res) => {
  const token = parseCookies(req).cms_session || '';
  const id = token.split('.')[0];
  sessions.delete(id);
  res.setHeader('Set-Cookie', 'cms_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ username: req.admin.username });
});

app.post('/api/admin/password', requireSameOrigin, requireAdmin, (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const newPassword = String(req.body?.newPassword || '');
  if (!verifyPassword(currentPassword)) return res.status(401).json({ error: 'Password lama tidak valid' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter' });
  if (newPassword === currentPassword) return res.status(400).json({ error: 'Password baru harus berbeda' });

  setMeta('admin_password_hash', makePasswordHash(newPassword));
  res.json({ ok: true });
});

app.get('/api/admin/media', requireAdmin, (req, res) => {
  res.json(readMediaStore());
});

app.post('/api/admin/media', requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const store = readMediaStore();
    const item = sanitizeMediaItem(req.body);
    const payload = writeMediaStore([item, ...store.items], store.state);
    res.status(201).json(payload);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/media/:id', requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const store = readMediaStore();
    const idx = store.items.findIndex((item) => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Media tidak ditemukan' });
    store.items[idx] = sanitizeMediaItem(req.body, store.items[idx]);
    res.json(writeMediaStore(store.items, store.state));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/media/:id', requireSameOrigin, requireAdmin, (req, res) => {
  const store = readMediaStore();
  res.json(writeMediaStore(store.items.filter((item) => item.id !== req.params.id), store.state));
});

app.get('/api/admin/content', requireAdmin, (req, res) => {
  res.json(readContentStore());
});

app.post('/api/admin/content/:section', requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const section = req.params.section;
    const store = readContentStore();
    if (!Array.isArray(store[section])) return res.status(404).json({ error: 'Section tidak ditemukan' });
    const item = sanitizeContentItem(section, req.body);
    validateContentItem(section, item);
    store[section] = [item, ...store[section]];
    res.status(201).json(writeContentStore(store));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put('/api/admin/content/:section/:id', requireSameOrigin, requireAdmin, (req, res) => {
  try {
    const section = req.params.section;
    const store = readContentStore();
    if (!Array.isArray(store[section])) return res.status(404).json({ error: 'Section tidak ditemukan' });
    const idx = store[section].findIndex((item) => item.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Konten tidak ditemukan' });
    const item = sanitizeContentItem(section, req.body, store[section][idx]);
    validateContentItem(section, item);
    store[section][idx] = item;
    res.json(writeContentStore(store));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/admin/content/:section/:id', requireSameOrigin, requireAdmin, (req, res) => {
  const section = req.params.section;
  const store = readContentStore();
  if (!Array.isArray(store[section])) return res.status(404).json({ error: 'Section tidak ditemukan' });
  store[section] = store[section].filter((item) => item.id !== req.params.id);
  res.json(writeContentStore(store));
});

app.get('/api/site-content', (req, res) => {
  const store = readContentStore();
  const visible = {};
  ['programs', 'schedules', 'news', 'announcers', 'galleries'].forEach((section) => {
    visible[section] = store[section].filter((item) => item.enabled !== false);
  });
  visible.updatedAt = store.updatedAt;
  res.json(visible);
});

app.get('/api/automation-media', (req, res) => {
  const store = readMediaStore();
  res.json(buildAutomationPayload(store));
});

app.get('/api/automation-media/next', (req, res) => {
  const store = readMediaStore();
  const payload = buildAutomationPayload(store);
  res.json({ item: payload.nextItem, generatedAt: payload.generatedAt });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

function toInternalIcecastUrl(target) {
  try {
    const targetUrl = new URL(target, STREAM_BASE);
    const publicUrl = new URL(PUBLIC_BASE);

    if (process.env.ICECAST_PUBLIC_BASE && targetUrl.origin === publicUrl.origin) {
      return replaceOrigin(targetUrl.toString(), STREAM_BASE);
    }

    if ((targetUrl.hostname === 'localhost' || targetUrl.hostname === '127.0.0.1') && (targetUrl.port === '8099' || targetUrl.port === '8000')) {
      return replaceOrigin(targetUrl.toString(), STREAM_BASE);
    }

    return targetUrl.toString();
  } catch (e) {
    return target;
  }
}

function isPlaylistUrl(target) {
  try {
    const pathname = new URL(target, STREAM_BASE).pathname.toLowerCase();
    return pathname.endsWith('.m3u') || pathname.endsWith('.m3u8') || pathname.endsWith('.xspf');
  } catch (e) {
    return false;
  }
}

app.get('/api/status', async (req, res) => {
  try {
    const r = await axios.get(ICECAST_URL, { timeout: 5000 });
    res.json(r.data);
  } catch (e) {
    res.status(502).json({ error: 'Failed to fetch from Icecast', detail: e.message });
  }
});

app.get('/api/mounts', async (req, res) => {
  try {
    const r = await axios.get(ICECAST_URL, { timeout: 5000 });
    const icestats = r.data.icestats || {};
    let sources = icestats.source ? (Array.isArray(icestats.source) ? icestats.source : [icestats.source]) : [];
    const mounts = sources.map(s => {
      let listen = s.listenurl || s.listen_url || (STREAM_BASE + (s.mount || ''));
      try {
        const parsed = new URL(listen, STREAM_BASE);
        if (process.env.ICECAST_PUBLIC_BASE) {
          const pub = new URL(PUBLIC_BASE);
          parsed.protocol = pub.protocol;
          parsed.host = pub.host;
        } else if (parsed.port === '8000') {
          // Common Docker internal port -> map to host port 8099
          parsed.port = '8099';
        }
        listen = parsed.toString();
      } catch (e) {
        // leave listen as-is
      }
      return ({
        mount: s.mount,
        listeners: s.listeners,
        title: s.server_name || s.title || s.server_title || '',
        description: s.server_description || s.description || '',
        listenurl: listen,
        format: s.format || '',
        bitrate: s.bitrate || s.bitrate_sum || ''
      });
    });
    res.json({ mounts });
  } catch (e) {
    res.status(502).json({ error: 'Failed', detail: e.message });
  }
});

// Resolve playlist URLs (m3u, xspf) to direct stream URL
app.get('/api/resolve', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });
  if (!isPlaylistUrl(url)) return res.json({ url });

  try {
    const internalUrl = toInternalIcecastUrl(url);
    const r = await axios.get(internalUrl, { timeout: 5000, responseType: 'text' });
    const ct = (r.headers['content-type'] || '').toLowerCase();
    // M3U / M3U8
    if (ct.includes('audio/x-mpegurl') || ct.includes('application/vnd.apple.mpegurl') || url.endsWith('.m3u') || url.endsWith('.m3u8')) {
      const lines = r.data.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(l => !l.startsWith('#'));
      const first = lines[0] ? new URL(lines[0], internalUrl).toString() : url;
      return res.json({ url: first });
    }
    // XSPF (XML) - do a simple parse to find <location>
    if (ct.includes('xml') || url.endsWith('.xspf')) {
      const match = r.data.match(/<location>([^<]+)<\/location>/i);
      if (match) return res.json({ url: match[1] });
    }
    // Otherwise return original URL
    return res.json({ url });
  } catch (e) {
    return res.status(502).json({ error: 'resolve_failed', detail: e.message });
  }
});

// Proxy a stream through this server so browsers can play same-origin and CORS is handled
app.get('/stream-proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url');
  try {
    const internal = toInternalIcecastUrl(target);
    const r = await axios.get(internal, { responseType: 'stream', timeout: 0 });
    // Copy important headers
    const ct = r.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache');
    // Allow cross-origin from UI
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Pipe stream
    r.data.pipe(res);
    req.on('close', () => {
      r.data.destroy();
    });
    r.data.on('end', () => res.end());
    r.data.on('error', () => res.end());
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', detail: e.message });
  }
});

const port = process.env.PORT || 3000;
ensureDatabase();
if (!CMS_ADMIN_PASSWORD_HASH && !CMS_ADMIN_PASSWORD) {
  console.warn('CMS login disabled: set CMS_ADMIN_PASSWORD_HASH or CMS_ADMIN_PASSWORD.');
}
if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set; sessions will reset when the server restarts.');
}
app.listen(port, () => console.log(`Public UI server running on http://localhost:${port}`));
