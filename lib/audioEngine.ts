export type AudioBands = {
  bass: number;
  mid: number;
  treble: number;
  level: number;
  beat: boolean;
};

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  readonly destination: MediaStreamAudioDestinationNode;
  private source: MediaElementAudioSourceNode;
  private freq: Uint8Array;
  private bassEnergyHistory: number[] = [];
  private lastBeatTime = 0;

  constructor(public readonly audio: HTMLAudioElement) {
    const Ctor: typeof AudioContext =
      // @ts-expect-error webkit fallback
      window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctor();
    this.source = this.ctx.createMediaElementSource(audio);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.75;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);

    this.destination = this.ctx.createMediaStreamDestination();

    this.source.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.analyser.connect(this.destination);
  }

  async resume() {
    if (this.ctx.state !== "running") await this.ctx.resume();
  }

  read(): AudioBands {
    this.analyser.getByteFrequencyData(this.freq);
    const bins = this.freq.length;
    const bassEnd = Math.floor(bins * 0.08);
    const midEnd = Math.floor(bins * 0.35);

    let bSum = 0, mSum = 0, tSum = 0;
    for (let i = 0; i < bassEnd; i++) bSum += this.freq[i];
    for (let i = bassEnd; i < midEnd; i++) mSum += this.freq[i];
    for (let i = midEnd; i < bins; i++) tSum += this.freq[i];

    const bass = bSum / (bassEnd * 255 || 1);
    const mid = mSum / ((midEnd - bassEnd) * 255 || 1);
    const treble = tSum / ((bins - midEnd) * 255 || 1);
    const level = (bass + mid + treble) / 3;

    const now = performance.now();
    this.bassEnergyHistory.push(bass);
    if (this.bassEnergyHistory.length > 43) this.bassEnergyHistory.shift();
    const avg =
      this.bassEnergyHistory.reduce((a, b) => a + b, 0) /
      Math.max(1, this.bassEnergyHistory.length);
    const beat =
      bass > 0.35 &&
      bass > avg * 1.35 &&
      now - this.lastBeatTime > 220;
    if (beat) this.lastBeatTime = now;

    return { bass, mid, treble, level, beat };
  }

  dispose() {
    try { this.source.disconnect(); } catch {}
    try { this.analyser.disconnect(); } catch {}
    try { this.destination.disconnect(); } catch {}
    if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
  }
}
