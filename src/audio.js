// Tiny WebAudio SFX engine + master/music/sfx volume buses.
// Music is played through a separate <audio> element routed through MediaElementSource.

class AudioBus {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.musicSrc = null;
    this.musicEl = null;
    this.musicMuted = false;
    this.sfxMuted = false;
    this.masterVol = 0.8;
    this.musicVol = 0.25;
    this.sfxVol = 0.5;
  }

  ensure() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applyVolumes();
  }

  attachMusic(audioEl) {
    this.ensure();
    if (this.musicSrc) { try { this.musicSrc.disconnect(); } catch (_) {} }
    this.musicEl = audioEl;
    this.musicSrc = this.ctx.createMediaElementSource(audioEl);
    this.musicSrc.connect(this.musicGain);
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.masterVol;
    this.musicGain.gain.value = this.musicMuted ? 0 : this.musicVol;
    this.sfxGain.gain.value = this.sfxMuted ? 0 : this.sfxVol;
  }

  setMaster(v) { this.masterVol = v; this.applyVolumes(); }
  setMusic(v)  { this.musicVol  = v; this.applyVolumes(); }
  setSfx(v)    { this.sfxVol    = v; this.applyVolumes(); }
  setMusicMuted(b) { this.musicMuted = !!b; this.applyVolumes(); }
  setSfxMuted(b)   { this.sfxMuted = !!b; this.applyVolumes(); }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  // SFX primitives
  beep({ freq = 440, type = 'square', dur = 0.08, attack = 0.005, gain = 0.4, slideTo = null } = {}) {
    if (!this.ctx || this.sfxMuted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise({ dur = 0.2, gain = 0.4, lp = 1500 } = {}) {
    if (!this.ctx || this.sfxMuted) return;
    const t = this.ctx.currentTime;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = lp;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filt).connect(g).connect(this.sfxGain);
    src.start(t);
  }

  laser()     { this.beep({ freq: 880, slideTo: 220, dur: 0.09, type: 'square', gain: 0.25 }); }
  enemyHit()  { this.beep({ freq: 540, slideTo: 120, dur: 0.12, type: 'sawtooth', gain: 0.3 }); }
  explosion() { this.noise({ dur: 0.45, gain: 0.55, lp: 900 }); this.beep({ freq: 120, slideTo: 40, dur: 0.4, type: 'sawtooth', gain: 0.25 }); }
  shieldHit() { this.beep({ freq: 240, slideTo: 80, dur: 0.18, type: 'square', gain: 0.35 }); }
  deflect()   { this.beep({ freq: 1200, slideTo: 1800, dur: 0.08, type: 'triangle', gain: 0.25 }); }
}

export const audio = new AudioBus();
