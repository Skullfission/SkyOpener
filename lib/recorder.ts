export function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "video/webm";
}

export class StreamRecorder {
  private rec: MediaRecorder;
  private chunks: BlobPart[] = [];
  readonly mimeType: string;

  constructor(stream: MediaStream, bitsPerSecond = 6_000_000) {
    this.mimeType = pickMimeType();
    this.rec = new MediaRecorder(stream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: bitsPerSecond,
    });
    this.rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
  }

  start() {
    this.chunks = [];
    this.rec.start(100);
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      this.rec.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      if (this.rec.state !== "inactive") this.rec.stop();
      else resolve(new Blob(this.chunks, { type: this.mimeType }));
    });
  }
}
