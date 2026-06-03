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
const statusEyebrow = document.getElementById('statusEyebrow');
const statusIndicator = document.getElementById('statusIndicator');
const cardPlayIcon = document.getElementById('cardPlayIcon');
const miniPlayIcon = document.getElementById('miniPlayIcon');
const equalizers = document.querySelectorAll('.equalizer');
const scheduleList = document.getElementById('scheduleList');

let activeStreamUrl = null;
let hlsInstance = null;
let isPlaying = false;
let isStopping = false;

function setPlaybackEnabled(enabled) {
  heroPlay.disabled = !enabled;
  cardPlay.disabled = !enabled;
  playPauseBtn.disabled = !enabled;
}

function setEqState(playing) {
  equalizers.forEach((eq) => eq.classList.toggle('paused', !playing));
}

function setUiPlaying(playing) {
  isPlaying = playing;
  const icon = playing ? 'pause' : 'play_arrow';
  cardPlayIcon.textContent = icon;
  miniPlayIcon.textContent = icon;
  statusText.textContent = playing ? 'Sedang siaran langsung' : 'Siaran dijeda';
  statusEyebrow.textContent = playing ? 'Sedang siaran langsung' : 'Live Radio Player';
  statusIndicator.className = playing ? 'status-dot live' : 'status-dot';
  setEqState(playing);
}

async function fetchMounts() {
  const res = await fetch('/api/mounts');
  if (!res.ok) throw new Error('Gagal mengambil data stream');
  return res.json();
}

function updateNowPlaying(data) {
  const first = data?.mounts?.[0];
  if (!first) {
    activeStreamUrl = null;
    stationName.textContent = 'eRKS FM Sumedang';
    stickyStation.textContent = 'eRKS FM Sumedang';
    programTitle.textContent = 'Tidak ada siaran aktif';
    stickyProgram.textContent = 'Tidak ada siaran aktif';
    announcerName.textContent = 'Penyiar: Belum tersedia';
    statusText.textContent = 'Tidak ada siaran aktif';
    statusEyebrow.textContent = 'Tidak ada siaran aktif';
    statusIndicator.className = 'status-dot error';
    setPlaybackEnabled(false);
    return;
  }

  const station = first.server_name || first.title || 'eRKS FM Sumedang';
  const program = first.server_description || first.description || 'Belum ada informasi program';

  stationName.textContent = station;
  stickyStation.textContent = station;
  programTitle.textContent = program;
  stickyProgram.textContent = program;

  announcerName.textContent = 'Penyiar: Belum tersedia';
  activeStreamUrl = first.listenurl || null;
  setPlaybackEnabled(Boolean(activeStreamUrl));
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

function stopPlayback() {
  isStopping = true;

  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  setUiPlaying(false);
  statusText.textContent = activeStreamUrl ? 'Siaran dijeda' : 'Tidak ada siaran aktif';

  setTimeout(() => {
    isStopping = false;
  }, 0);
}

function togglePlayback() {
  if (isPlaying) {
    stopPlayback();
    return;
  }
  startPlayback();
}

function renderScheduleEmptyState() {
  scheduleList.innerHTML = `
    <p>Jadwal belum tersedia</p>
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
  audio.addEventListener('pause', () => {
    if (!isStopping && audio.src) setUiPlaying(false);
  });
  audio.addEventListener('ended', () => setUiPlaying(false));
}

async function init() {
  bindEvents();
  renderScheduleEmptyState();
  setEqState(false);
  setPlaybackEnabled(false);
  audio.volume = Number(volumeControl.value);

  try {
    const data = await fetchMounts();
    updateNowPlaying(data);
    statusText.textContent = activeStreamUrl ? 'Siap diputar' : 'Tidak ada siaran aktif';
    statusIndicator.className = activeStreamUrl ? 'status-dot' : 'status-dot error';
  } catch (err) {
    console.warn(err);
    statusText.textContent = 'Tidak bisa memuat info stream';
    statusEyebrow.textContent = 'Koneksi stream bermasalah';
    statusIndicator.className = 'status-dot error';
  }
}

init();
