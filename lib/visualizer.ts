import type { AudioBands } from "./audioEngine";

export type SourceImage = { img: HTMLImageElement; name: string };

export class Visualizer {
  private current = 0;
  private next = 1;
  private fade = 0;
  private lastSwitch = 0;
  private hue = 220;

  private particles: { x: number; y: number; vx: number; vy: number; life: number }[] = [];
  private rings: { r: number; alpha: number; hue: number }[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private images: SourceImage[]
  ) {
    this.next = images.length > 1 ? 1 : 0;
  }

  setImages(images: SourceImage[]) {
    this.images = images;
    this.current = 0;
    this.next = images.length > 1 ? 1 : 0;
    this.fade = 0;
  }

  private drawCover(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    scale: number,
    rotate: number,
    alpha: number
  ) {
    if (alpha <= 0) return;
    const ir = img.width / img.height;
    const cr = w / h;
    let dw: number, dh: number;
    if (ir > cr) {
      dh = h * scale;
      dw = dh * ir;
    } else {
      dw = w * scale;
      dh = dw / ir;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rotate);
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }

  render(bands: AudioBands, frame: number) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    this.hue = (this.hue + 0.1 + bands.treble * 0.6) % 360;
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, `hsl(${this.hue}, 70%, ${10 + bands.mid * 12}%)`);
    g.addColorStop(1, `hsl(${(this.hue + 60) % 360}, 70%, ${6 + bands.bass * 14}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (this.images.length > 0) {
      const now = performance.now();
      if (
        bands.beat &&
        this.images.length > 1 &&
        this.fade === 0 &&
        now - this.lastSwitch > 600
      ) {
        this.next =
          (this.current + 1 + Math.floor(Math.random() * (this.images.length - 1))) %
          this.images.length;
        this.fade = 0.001;
        this.lastSwitch = now;
      }

      if (this.fade > 0) {
        this.fade = Math.min(1, this.fade + 0.04 + bands.level * 0.04);
        if (this.fade >= 1) {
          this.current = this.next;
          this.fade = 0;
        }
      }

      const baseScale = 1.05 + bands.bass * 0.35 + Math.sin(frame * 0.02) * 0.02;
      const rotate = Math.sin(frame * 0.01) * 0.02 + (bands.mid - 0.3) * 0.04;

      const cur = this.images[this.current]?.img;
      const nxt = this.images[this.next]?.img;
      if (cur) this.drawCover(ctx, cur, w, h, baseScale, rotate, 1 - this.fade);
      if (nxt && this.fade > 0)
        this.drawCover(ctx, nxt, w, h, baseScale * (1 + this.fade * 0.05), rotate, this.fade);

      const vg = ctx.createRadialGradient(
        w / 2, h / 2, Math.min(w, h) * 0.4,
        w / 2, h / 2, Math.max(w, h) * 0.7
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, `rgba(0,0,0,${0.45 - bands.level * 0.15})`);
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    } else {
      this.renderAbstract(ctx, bands, frame, w, h);
    }

    const bars = 64;
    const bw = w / bars;
    ctx.fillStyle = `hsla(${(this.hue + 180) % 360}, 90%, 65%, 0.85)`;
    for (let i = 0; i < bars; i++) {
      const t = i / bars;
      const v =
        bands.bass * Math.max(0, 1 - t * 2) +
        bands.mid * Math.max(0, 1 - Math.abs(t - 0.5) * 2.2) +
        bands.treble * Math.max(0, t * 2 - 1);
      const bh = Math.max(2, v * h * 0.35);
      ctx.fillRect(i * bw + 2, h - bh, bw - 4, bh);
    }

    if (bands.beat) {
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.fillRect(0, 0, w, h);
    }
  }

  private renderAbstract(
    ctx: CanvasRenderingContext2D,
    bands: AudioBands,
    frame: number,
    w: number,
    h: number
  ) {
    const cx = w / 2;
    const cy = h / 2;

    // On beat, push a pulse ring outward.
    if (bands.beat) {
      this.rings.push({ r: 40, alpha: 0.9, hue: this.hue });
    }
    // Update & draw rings
    ctx.lineWidth = 3;
    this.rings = this.rings.filter((ring) => {
      ring.r += 6 + bands.level * 10;
      ring.alpha *= 0.96;
      ctx.strokeStyle = `hsla(${ring.hue}, 90%, 70%, ${ring.alpha})`;
      ctx.beginPath();
      ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
      ctx.stroke();
      return ring.alpha > 0.04 && ring.r < Math.max(w, h);
    });

    // Radial frequency bars around the centre
    const spokes = 96;
    const baseR = Math.min(w, h) * 0.18 + bands.bass * 60;
    for (let i = 0; i < spokes; i++) {
      const t = i / spokes;
      const v =
        bands.bass * Math.max(0, 1 - Math.abs(t - 0.0) * 4) +
        bands.bass * Math.max(0, 1 - Math.abs(t - 1.0) * 4) +
        bands.mid * Math.max(0, 1 - Math.abs(t - 0.5) * 3) +
        bands.treble * (Math.sin(t * Math.PI * 6 + frame * 0.05) * 0.5 + 0.5) * 0.6;
      const len = 30 + v * 220;
      const a = t * Math.PI * 2 + frame * 0.002;
      const x1 = cx + Math.cos(a) * baseR;
      const y1 = cy + Math.sin(a) * baseR;
      const x2 = cx + Math.cos(a) * (baseR + len);
      const y2 = cy + Math.sin(a) * (baseR + len);
      ctx.strokeStyle = `hsla(${(this.hue + t * 360) % 360}, 90%, 65%, 0.85)`;
      ctx.lineWidth = 2 + bands.level * 3;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Glowing core
    const coreR = 30 + bands.bass * 80;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, `hsla(${(this.hue + 30) % 360}, 100%, 80%, ${0.7 + bands.level * 0.3})`);
    coreGrad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fill();

    // Particles spawn on treble, drift outward, fade.
    const spawn = Math.floor(bands.treble * 6 + (bands.beat ? 30 : 0));
    for (let i = 0; i < spawn; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 4 + bands.level * 4;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 1,
      });
    }
    if (this.particles.length > 600) this.particles.splice(0, this.particles.length - 600);

    ctx.fillStyle = `hsla(${(this.hue + 60) % 360}, 100%, 80%, 0.9)`;
    this.particles = this.particles.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.vy *= 0.99;
      p.life *= 0.97;
      if (p.life < 0.05) return false;
      ctx.globalAlpha = p.life;
      ctx.fillRect(p.x, p.y, 2, 2);
      return true;
    });
    ctx.globalAlpha = 1;
  }
}
