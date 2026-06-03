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
const scheduleTabs = document.querySelectorAll('.tab');

let activeStreamUrl = null;
let hlsInstance = null;
let isPlaying = false;

const scheduleData = {
  senin: [
    { time: '06:00', title: 'Selamat Pagi Sumedang', host: 'Rani Fitria' },
    { time: '09:00', title: 'Ruang Publik Daerah', host: 'Deni Pratama' },
    { time: '15:00', title: 'Musik Sore Priangan', host: 'Siska Nuraini' }
  ],
  selasa: [
    { time: '06:00', title: 'Semangat Pagi Warga', host: 'Rani Fitria' },
    { time: '10:00', title: 'Forum Layanan Publik', host: 'Deni Pratama' },
    { time: '19:00', title: 'Nada Sunda Malam', host: 'Siska Nuraini' }
  ],
  rabu: [
    { time: '07:00', title: 'Info Pasar Sumedang', host: 'Rani Fitria' },
    { time: '11:00', title: 'Dialog Pembangunan', host: 'Deni Pratama' },
    { time: '20:00', title: 'Musik Nostalgia', host: 'Siska Nuraini' }
  ],
  kamis: [
    { time: '06:00', title: 'Pagi Produktif', host: 'Rani Fitria' },
    { time: '13:00', title: 'Pojok UMKM Sumedang', host: 'Deni Pratama' },
    { time: '18:00', title: 'Siaran Aspirasi', host: 'Siska Nuraini' }
  ],
  jumat: [
    { time: '06:00', title: 'Inspirasi Jumat', host: 'Rani Fitria' },
    { time: '09:30', title: 'Khazanah Islam', host: 'Deni Pratama' },
    { time: '16:00', title: 'Rileks Weekend', host: 'Siska Nuraini' }
  ]
};

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
  const program = first.server_description || first.description || 'Inspirasi Sumedang';

  stationName.textContent = station;
  stickyStation.textContent = station;
  programTitle.textContent = program;
  stickyProgram.textContent = program;

  announcerName.textContent = 'Penyiar: Tim eRKS FM';
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

function renderSchedule(day) {
  const list = scheduleData[day] || [];
  scheduleList.innerHTML = list
    .map((item) => `
      <div class="time-item">
        <strong>${item.time} - ${item.title}</strong>
        <p>Penyiar: ${item.host}</p>
      </div>
    `)
    .join('');
}

function bindScheduleTabs() {
  scheduleTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      scheduleTabs.forEach((item) => item.classList.remove('active'));
      tab.classList.add('active');
      renderSchedule(tab.dataset.day);
    });
  });
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
  bindScheduleTabs();
  renderSchedule('senin');
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
