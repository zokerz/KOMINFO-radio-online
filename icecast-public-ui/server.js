const express = require('express');
const axios = require('axios');
const path = require('path');
const cors = require('cors');

const ICECAST_URL = process.env.ICECAST_URL || 'http://127.0.0.1:8099/status-json.xsl';
const STREAM_BASE = process.env.ICECAST_BASE || 'http://127.0.0.1:8099';
const PUBLIC_BASE = process.env.ICECAST_PUBLIC_BASE || STREAM_BASE;

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

function replaceOrigin(target, base) {
  const targetUrl = new URL(target);
  const baseUrl = new URL(base);
  targetUrl.protocol = baseUrl.protocol;
  targetUrl.host = baseUrl.host;
  return targetUrl.toString();
}

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
    const r = await axios.get(internal, { responseType: 'stream', timeout: 10000 });
    // Copy important headers
    const ct = r.headers['content-type'] || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'no-cache');
    // Allow cross-origin from UI
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Pipe stream
    r.data.pipe(res);
    r.data.on('end', () => res.end());
    r.data.on('error', () => res.end());
  } catch (e) {
    res.status(502).json({ error: 'proxy_failed', detail: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Public UI server running on http://localhost:${port}`));
