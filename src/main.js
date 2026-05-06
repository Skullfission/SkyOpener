import { Game } from './game.js';
import { audio } from './audio.js';

const canvas = document.getElementById('game');
const startOverlay = document.getElementById('startOverlay');
const pauseOverlay = document.getElementById('pauseOverlay');
const startBtn = document.getElementById('startBtn');
const resumeBtn = document.getElementById('resumeBtn');
const restartBtn = document.getElementById('restartBtn');
const hudEl = document.getElementById('hud');
const reticle = document.getElementById('reticle');

const hud = {
  score: document.getElementById('score'),
  shield: document.getElementById('shield'),
  speed: document.getElementById('speed'),
  missiles: document.getElementById('missiles'),
  msg: document.getElementById('msg'),
};

let audioEl = null;
let game = null;

async function tryDefaultMusic() {
  const candidates = [
    'assets/music/SkyOpener.mp3', 'assets/music/SkyOpener.ogg', 'assets/music/SkyOpener.wav',
    'assets/music/track.mp3',  'assets/music/track.ogg',  'assets/music/track.wav',
  ];
  for (const url of candidates) {
    try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return url; } catch (_) {}
  }
  // directory index fallback (works with `npx serve`, `python -m http.server`)
  try {
    const r = await fetch('assets/music/');
    if (r.ok) {
      const html = await r.text();
      const m = [...html.matchAll(/href="([^"?#]+\.(?:mp3|ogg|wav|m4a|flac))"/gi)];
      if (m.length) {
        const name = decodeURIComponent(m[0][1].split('/').pop());
        return 'assets/music/' + name;
      }
    }
  } catch (_) {}
  return null;
}

function startMusic(url) {
  if (!url) return;
  if (audioEl) { audioEl.pause(); audioEl.src = ''; }
  audioEl = new Audio(url);
  audioEl.loop = true;
  audioEl.crossOrigin = 'anonymous';
  audio.ensure();
  try { audio.attachMusic(audioEl); } catch (_) { /* if attach fails, fall back to element volume */ }
  // Fallback: also set element volume in case AudioContext attach failed
  audioEl.volume = audio.musicVol;
  audioEl.play().catch(() => {});
}

function pickMusic(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  startMusic(URL.createObjectURL(f));
}

// --- Pause menu wiring ---
function bindSlider(slider, label, fn) {
  const fmt = () => { label.textContent = Math.round(parseFloat(slider.value) * 100) + '%'; };
  slider.addEventListener('input', () => { fn(parseFloat(slider.value)); fmt(); });
  fmt();
}
const sMaster = document.getElementById('volMaster');
const sMusic  = document.getElementById('volMusic');
const sSfx    = document.getElementById('volSfx');
const lMaster = document.getElementById('volMasterVal');
const lMusic  = document.getElementById('volMusicVal');
const lSfx    = document.getElementById('volSfxVal');
const muteMusic = document.getElementById('muteMusic');
const muteSfx   = document.getElementById('muteSfx');

bindSlider(sMaster, lMaster, v => audio.setMaster(v));
bindSlider(sMusic,  lMusic,  v => { audio.setMusic(v); if (audioEl) audioEl.volume = v; });
bindSlider(sSfx,    lSfx,    v => audio.setSfx(v));
muteMusic.addEventListener('change', () => audio.setMusicMuted(muteMusic.checked));
muteSfx.addEventListener('change',   () => audio.setSfxMuted(muteSfx.checked));

function setPaused(p) {
  if (!game) return;
  game.setPaused(p);
  pauseOverlay.classList.toggle('hide', !p);
  reticle.classList.toggle('hide', p);
  if (audioEl) {
    if (p) audioEl.pause(); else audioEl.play().catch(() => {});
  }
  // After toggling, blur the active button so Space/Enter don't re-trigger it
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
}

resumeBtn.addEventListener('click', () => setPaused(false));
restartBtn.addEventListener('click', () => { game.reset(); setPaused(false); });

startBtn.addEventListener('click', launchGame);

// Title screen alternate start methods: Enter, Space, gamepad Start (button 9) or A (0)
function isTitleVisible() { return !startOverlay.classList.contains('hide'); }
window.addEventListener('keydown', (e) => {
  if (!isTitleVisible() || e.repeat) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    launchGame();
  }
});
function pollGamepadStart() {
  if (isTitleVisible()) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      // 9 = Start, 0 = A on the standard mapping
      if ((p.buttons[9] && p.buttons[9].pressed) || (p.buttons[0] && p.buttons[0].pressed)) {
        launchGame();
        break;
      }
    }
  }
  requestAnimationFrame(pollGamepadStart);
}
requestAnimationFrame(pollGamepadStart);

async function launchGame() {
  if (!isTitleVisible()) return;
  startOverlay.classList.add('hide');
  hudEl.classList.remove('hide');
  reticle.classList.remove('hide');
  audio.ensure();
  audio.resume();
  if (!audioEl) {
    const url = await tryDefaultMusic();
    if (url) startMusic(url);
  } else {
    audioEl.play().catch(() => {});
  }
  game = new Game(canvas, hud, {
    onPauseToggle: () => setPaused(!game.paused),
    onDeath: () => {},
  });
  game.start();
  startBtn.blur();
  canvas.focus();
}

// Make the canvas focusable
canvas.tabIndex = 0;

// --- Fullscreen ---
const fsBtn = document.getElementById('fsBtn');
function isFullscreen() { return !!document.fullscreenElement; }
async function toggleFullscreen() {
  try {
    if (isFullscreen()) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (_) {}
}
fsBtn.addEventListener('click', toggleFullscreen);
window.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'f' && !e.repeat) toggleFullscreen();
});
document.addEventListener('fullscreenchange', () => {
  fsBtn.textContent = isFullscreen() ? '⤢ Exit Fullscreen' : '⛶ Fullscreen';
  // Force a resize on the renderer
  if (game) game.resize();
});
