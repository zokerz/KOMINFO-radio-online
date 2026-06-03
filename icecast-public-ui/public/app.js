const audio = document.getElementById('radioAudio');
const heroPlay = document.getElementById('heroPlay');
const cardPlay = document.getElementById('cardPlay');
const playPauseBtn = document.getElementById('playPauseBtn');
const volumeControl = document.getElementById('volumeControl');
const stationName = document.getElementById('stationName');
const stickyStation = document.getElementById('stickyStation');
const programTitle = document.getElementById('programTitle');
const stickyProgram = document.getElementById('stickyProgram');
const announcerName = document.getElementById('announcerName');
const statusText = document.getElementById('statusText');
const equalizers = document.querySelectorAll('.equalizer');
const scheduleList = document.getElementById('scheduleList');

let activeStreamUrl = null;
let hlsInstance = null;
let isPlaying = false;

function setEqState(playing) {
  equalizers.forEach((eq) => eq.classList.toggle('paused', !playing));
}

function setUiPlaying(playing) {
  isPlaying = playing;
  const txt = playing ? 'Pause' : 'Play';
  playPauseBtn.textContent = txt;
  cardPlay.textContent = txt;
  statusText.textContent = playing ? 'Sedang siaran langsung' : 'Siaran dijeda';
  setEqState(playing);
}

async function fetchMounts() {
  const res = await fetch('/api/mounts');
  if (!res.ok) throw new Error('Gagal mengambil data stream');
  return res.json();
}

function updateNowPlaying(data) {
  const first = data?.mounts?.[0];
  if (!first) return;

  const station = first.server_name || first.title || 'eRKS FM Sumedang';
  const program = first.server_description || first.description || 'Belum ada informasi program';

  stationName.textContent = station;
  stickyStation.textContent = station;
  programTitle.textContent = program;
  stickyProgram.textContent = program;

  announcerName.textContent = 'Penyiar: Belum tersedia';
  activeStreamUrl = first.listenurl || null;
}

async function resolveStreamUrl(url) {
  if (!url) return null;
  const res = await fetch(`/api/resolve?url=${encodeURIComponent(url)}`);
  const payload = await res.json();
  return payload.url || url;
}

async function startPlayback() {
  if (!activeStreamUrl) {
    statusText.textContent = 'Stream tidak tersedia';
    return;
  }

  try {
    const resolved = await resolveStreamUrl(activeStreamUrl);
    if (resolved.endsWith('.m3u8')) {
      if (window.Hls && window.Hls.isSupported()) {
        if (hlsInstance) hlsInstance.destroy();
        hlsInstance = new window.Hls();
        hlsInstance.loadSource(resolved);
        hlsInstance.attachMedia(audio);
      } else {
        audio.src = resolved;
      }
    } else {
      audio.src = `/stream-proxy?url=${encodeURIComponent(resolved)}`;
    }

    await audio.play();
    setUiPlaying(true);
  } catch (err) {
    console.warn(err);
    statusText.textContent = 'Gagal memutar siaran';
    setUiPlaying(false);
  }
}

function togglePlayback() {
  if (isPlaying) {
    audio.pause();
    setUiPlaying(false);
    return;
  }
  startPlayback();
}

function renderScheduleEmptyState() {
  scheduleList.innerHTML = `
    <div class="empty-state schedule-empty">
      <h4>Jadwal belum tersedia</h4>
      <p>Data hari dan jam siaran akan ditampilkan setelah jadwal resmi diinput.</p>
    </div>
  `;
}

function bindEvents() {
  heroPlay.addEventListener('click', togglePlayback);
  cardPlay.addEventListener('click', togglePlayback);
  playPauseBtn.addEventListener('click', togglePlayback);

  volumeControl.addEventListener('input', () => {
    audio.volume = Number(volumeControl.value);
  });

  audio.addEventListener('play', () => setUiPlaying(true));
  audio.addEventListener('pause', () => setUiPlaying(false));
  audio.addEventListener('ended', () => setUiPlaying(false));
}

async function init() {
  bindEvents();
  renderScheduleEmptyState();
  setEqState(false);
  audio.volume = Number(volumeControl.value);

  try {
    const data = await fetchMounts();
    updateNowPlaying(data);
    statusText.textContent = activeStreamUrl ? 'Siap diputar' : 'Stream tidak tersedia';
  } catch (err) {
    console.warn(err);
    statusText.textContent = 'Tidak bisa memuat info stream';
  }
}

init();
