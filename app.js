// Radio Ruben — custom Cast Web Receiver
const NP_NAMESPACE = 'urn:x-cast:com.radioruben.np';

const context = cast.framework.CastReceiverContext.getInstance();
const playerManager = context.getPlayerManager();

// ---- RR_CAST_DEBUG: temporary diagnostics for the cast-stop-replay bug. ----
// Logs to the browser console (visible via chrome://inspect on the cast device)
// AND to the on-screen CAF debug overlay when the debug script is present.
// All hooks below are READ-ONLY / pass-through: they never alter playback.
// Remove this whole block once the bug is root-caused.
let rrLogger = null;
try {
  if (cast.debug && cast.debug.CastDebugLogger) {
    rrLogger = cast.debug.CastDebugLogger.getInstance();
  }
} catch (e) { rrLogger = null; }

function rrState() {
  try { return playerManager.getPlayerState(); } catch (e) { return '?'; }
}

function rrLog(msg, data) {
  const line = data === undefined ? msg : msg + ' ' + JSON.stringify(data);
  try { console.log('[RR_RX]', line); } catch (e) {}
  try { if (rrLogger) rrLogger.info('RR_RX', line); } catch (e) {}
}

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
    rrLog('mirrorToLockscreen', { hasInfo: !!info, playerState: rrState() });
    if (!info) return;
    const isSong = m.mode === 'song';
    const md = new cast.framework.messages.MusicTrackMediaMetadata();
    md.title = isSong && m.title ? m.title : m.stationName;
    md.artist = isSong && m.artist ? m.artist : (m.tagline || '');
    md.images = m.coverUrl ? [new cast.framework.messages.Image(m.coverUrl)] : [];
    info.metadata = md;
    playerManager.setMediaInformation(info, true);
    rrLog('mirrorToLockscreen setMediaInformation done', { playerState: rrState() });
  } catch (e) {
    console.warn('[RR] lockscreen mirror failed', e);
  }
}

// RNGC sends JSON; CAF delivers it parsed on event.data (string fallback handled).
context.addCustomMessageListener(NP_NAMESPACE, (event) => {
  try {
    const m = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    if (!m) return;
    rrLog('np message received', { mode: m.mode, station: m.stationName, playerState: rrState() });
    render(m);
    mirrorToLockscreen(m);
  } catch (e) {
    console.warn('[RR] np message failed', e);
  }
});

// RR_CAST_DEBUG: surface the on-screen overlay once the receiver is ready.
try {
  context.addEventListener(cast.framework.system.EventType.READY, () => {
    try {
      if (rrLogger) { rrLogger.setEnabled(true); rrLogger.showDebugLogs(true); }
      rrLog('receiver READY', { playerState: rrState() });
    } catch (e) {}
  });
} catch (e) {}

// RR_CAST_DEBUG: log receiver playback-lifecycle events — ground truth for
// "did Stop actually stop, and what resumed it". CAF has NO single
// PLAYER_STATE_CHANGED event; use the discrete lifecycle event types. Each log
// carries the current playerState and (on MEDIA_FINISHED) the endedReason
// (STOPPED vs INTERRUPTED — distinguishes a clean Stop from a LOAD interrupt).
try {
  const ET = cast.framework.events.EventType;
  [ET.PLAYING, ET.PAUSE, ET.BUFFERING, ET.WAITING, ET.ENDED,
   ET.MEDIA_FINISHED, ET.LOAD_START, ET.PLAYER_LOAD_COMPLETE]
    .forEach((type) => {
      if (type == null) return;
      try {
        playerManager.addEventListener(type, (e) => {
          rrLog('EVENT ' + ((e && e.type) || type), {
            playerState: rrState(),
            endedReason: (e && e.endedReason) || undefined,
          });
        });
      } catch (err) { rrLog('event listener register failed', { type: String(type), error: String(err) }); }
    });
} catch (e) {}

// RR_CAST_DEBUG: log every inbound sender command (pass-through, never blocks).
// If audio resumes right after one of these on a Stop+switch, the PHONE sent it.
try {
  const MT = cast.framework.messages.MessageType;
  [['LOAD', MT.LOAD], ['PLAY', MT.PLAY], ['PAUSE', MT.PAUSE], ['STOP', MT.STOP], ['SEEK', MT.SEEK]]
    .forEach(([name, type]) => {
      if (type == null) return;
      try {
        playerManager.setMessageInterceptor(type, (request) => {
          rrLog('MSG ' + name, { requestId: request && request.requestId, playerState: rrState() });
          return request; // pass through unchanged
        });
      } catch (e) { rrLog('interceptor register failed', { name: name, error: String(e) }); }
    });
} catch (e) {}

context.start();
