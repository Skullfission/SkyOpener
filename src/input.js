// Unified input: keyboard + mouse + gamepad.

const keys = new Set();
const pressedThisFrame = new Set();
const releasedThisFrame = new Set();
const tapTimes = { a: [], d: [], w: [], s: [], arrowleft: [], arrowright: [], arrowup: [], arrowdown: [] };
const TAP_WINDOW = 0.28;

const PREVENT_DEFAULT_KEYS = new Set([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);

const mouse = { x: 0, y: 0, nx: 0, ny: 0, down: false, downEdge: false, rightDownEdge: false };

function normKey(e) {
  return e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
}

window.addEventListener('keydown', (e) => {
  const k = normKey(e);
  if (PREVENT_DEFAULT_KEYS.has(k)) e.preventDefault();
  if (e.repeat) return;
  keys.add(k);
  pressedThisFrame.add(k);
  if (tapTimes[k]) {
    tapTimes[k].push(performance.now() / 1000);
    if (tapTimes[k].length > 4) tapTimes[k].shift();
  }
}, { passive: false });
window.addEventListener('keyup', (e) => {
  const k = normKey(e);
  keys.delete(k);
  releasedThisFrame.add(k);
});
window.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.ny = -((e.clientY / window.innerHeight) * 2 - 1);
});
window.addEventListener('mousedown', (e) => {
  if (e.button === 0) { mouse.down = true; mouse.downEdge = true; }
  if (e.button === 2) { mouse.rightDownEdge = true; }
});
window.addEventListener('mouseup',   (e) => { if (e.button === 0) { mouse.down = false; } });
window.addEventListener('contextmenu', (e) => { e.preventDefault(); });
window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

function getGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p) return p;
  return null;
}

const gpPrev = { buttons: {} };

export const Input = {
  steerX: 0, steerY: 0,
  rollRequest: 0,
  loopRequest: 0, // +1 forward (W/Up double-tap), -1 backward (S/Down double-tap)
  fire: false,
  fireEdge: false,
  missileFireEdge: false,
  boost: false,
  brake: false,
  aimNX: 0, aimNY: 0,

  // edge events
  pausePressed: false,
  resetPressed: false,

  enabled: true,

  setEnabled(v) {
    this.enabled = v;
    if (!v) { keys.clear(); mouse.down = false; }
  },

  // Allow consumers (e.g. pause menu) to peek at and consume edge keys directly
  consumePressed(key) {
    if (pressedThisFrame.has(key)) { pressedThisFrame.delete(key); return true; }
    return false;
  },

  update(dt) {
    // Edge events that always fire (even when disabled, except via menu logic)
    this.pausePressed = pressedThisFrame.has('escape') || pressedThisFrame.has('p');
    this.resetPressed = pressedThisFrame.has('r');

    if (!this.enabled) {
      this.steerX = this.steerY = 0;
      this.rollRequest = 0;
      this.loopRequest = 0;
      this.fire = false; this.fireEdge = false;
      this.missileFireEdge = false;
      this.boost = false; this.brake = false;
      pressedThisFrame.clear();
      releasedThisFrame.clear();
      mouse.downEdge = false;
      mouse.rightDownEdge = false;
      return;
    }

    let sx = 0, sy = 0;
    if (keys.has('a') || keys.has('arrowleft'))  sx -= 1;
    if (keys.has('d') || keys.has('arrowright')) sx += 1;
    if (keys.has('w') || keys.has('arrowup'))    sy -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  sy += 1;

    let roll = 0;
    if (pressedThisFrame.has('q')) roll = -1;
    if (pressedThisFrame.has('e')) roll = +1;
    const now = performance.now() / 1000;
    for (const [k, dir] of [['a',-1],['arrowleft',-1],['d',+1],['arrowright',+1]]) {
      const arr = tapTimes[k];
      if (arr && arr.length >= 2 && now - arr[arr.length - 2] < TAP_WINDOW && pressedThisFrame.has(k)) {
        roll = dir;
        arr.length = 0;
      }
    }

    let loop = 0;
    for (const [k, dir] of [['w',+1],['arrowup',+1],['s',-1],['arrowdown',-1]]) {
      const arr = tapTimes[k];
      if (arr && arr.length >= 2 && now - arr[arr.length - 2] < TAP_WINDOW && pressedThisFrame.has(k)) {
        loop = dir;
        arr.length = 0;
      }
    }

    let fire = keys.has(' ') || mouse.down;
    let fireEdge = pressedThisFrame.has(' ') || mouse.downEdge;
    let missileEdge = pressedThisFrame.has('m') || mouse.rightDownEdge;

    let boost = keys.has('shift');
    let brake = keys.has('control');

    const gp = getGamepad();
    if (gp) {
      const lx = Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      const ly = Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      sx += lx; sy += ly;
      const btn = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const edge = (i) => {
        const cur = !!btn(i);
        const prev = !!gpPrev.buttons[i];
        gpPrev.buttons[i] = cur;
        return cur && !prev;
      };
      if (btn(0) || btn(7)) fire = true;
      if (edge(0) || edge(7)) fireEdge = true;
      if (edge(2)) missileEdge = true; // X / Square = missile
      if (edge(4)) roll = -1;
      if (edge(5)) roll = +1;
      if (btn(7)) boost = true;
      if (btn(6)) brake = true;
    }

    sx = Math.max(-1, Math.min(1, sx));
    sy = Math.max(-1, Math.min(1, sy));

    this.steerX = sx; this.steerY = sy;
    this.rollRequest = roll;
    this.loopRequest = loop;
    this.fire = fire;
    this.fireEdge = fireEdge;
    this.missileFireEdge = missileEdge;
    this.boost = boost;
    this.brake = brake;
    this.aimNX = mouse.nx;
    this.aimNY = mouse.ny;

    pressedThisFrame.clear();
    releasedThisFrame.clear();
    mouse.downEdge = false;
    mouse.rightDownEdge = false;
  }
};
