// Radio Ruben — custom Cast Web Receiver
const NP_NAMESPACE = 'urn:x-cast:com.radioruben.np';

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

const el = {
  bg: document.getElementById('bg'),
  cover: document.getElementById('cover'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  chip: document.getElementById('chip'),
};

function applyBackground(m, isSong) {
  if (isSong && m.coverUrl) {
    el.bg.style.opacity = '0';
    requestAnimationFrame(() => {
      el.bg.style.background = '';
      el.bg.style.backgroundImage = `url("${m.coverUrl}")`;
      el.bg.style.opacity = '1';
    });
  } else {
    const hue = typeof m.hue === 'number' ? m.hue : 240;
    el.bg.style.backgroundImage = 'none';
    el.bg.style.background =
      `radial-gradient(circle at 30% 20%, hsl(${hue} 55% 24%), #0A0A0B 72%)`;
    el.bg.style.opacity = '1';
  }
}

function render(m) {
  const isSong = m && m.mode === 'song';
  el.title.textContent = isSong && m.title ? m.title : m.stationName;
  el.artist.textContent = isSong && m.artist ? m.artist : (m.tagline || '');
  el.chip.textContent = m.stationName || '';

  if (isSong && m.coverUrl) {
    el.cover.src = m.coverUrl;
    el.cover.style.visibility = 'visible';
  } else {
    el.cover.removeAttribute('src');
    el.cover.style.visibility = 'hidden';
  }
  applyBackground(m, isSong);
}

// Mirror metadata onto the SENDERS' MediaStatus (phone lockscreen / expanded
// controller). DOM render is the gapless guarantee; this is an extra. If it
// blips audio on-device, delete this function + its call (the screen still works).
function mirrorToLockscreen(m) {
  try {
    const info = playerManager.getMediaInformation();
    if (!info) return;
    const isSong = m.mode === 'song';
    const md = new cast.framework.messages.MusicTrackMediaMetadata();
    md.title = isSong && m.title ? m.title : m.stationName;
    md.artist = isSong && m.artist ? m.artist : (m.tagline || '');
    md.images = m.coverUrl ? [new cast.framework.messages.Image(m.coverUrl)] : [];
    info.metadata = md;
    playerManager.setMediaInformation(info, true);
  } catch (e) {
    console.warn('[RR] lockscreen mirror failed', e);
  }
}

// RNGC sends JSON; CAF delivers it parsed on event.data (string fallback handled).
context.addCustomMessageListener(NP_NAMESPACE, (event) => {
  try {
    const m = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (!m) return;
    render(m);
    mirrorToLockscreen(m);
  } catch (e) {
    console.warn('[RR] np message failed', e);
  }
});

context.start();
