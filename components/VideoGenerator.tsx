"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audioEngine";
import { Visualizer, type SourceImage } from "@/lib/visualizer";
import { StreamRecorder } from "@/lib/recorder";

type Status = "idle" | "ready" | "recording" | "finalizing" | "done" | "error";

export default function VideoGenerator() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const visRef = useRef<Visualizer | null>(null);
  const recRef = useRef<StreamRecorder | null>(null);
  const rafRef = useRef<number | null>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [images, setImages] = useState<SourceImage[]>([]);
  const [audioOk, setAudioOk] = useState(false);
  const [imagesOk, setImagesOk] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultExt, setResultExt] = useState<string>("webm");

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      images.forEach((i) => URL.revokeObjectURL(i.img.src));
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canGenerate = useMemo(
    () =>
      !!audioFile &&
      audioOk &&
      (images.length === 0 || imagesOk) &&
      (status === "idle" || status === "ready" || status === "done"),
    [audioFile, images, audioOk, imagesOk, status]
  );

  function onAudioChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioFile(f);
    setAudioUrl(f ? URL.createObjectURL(f) : null);
    setStatus(f ? "ready" : "idle");
    setError(null);
  }

  async function onImagesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    try {
      const loaded: SourceImage[] = await Promise.all(
        files.map(
          (f) =>
            new Promise<SourceImage>((resolve, reject) => {
              const url = URL.createObjectURL(f);
              const img = new Image();
              img.onload = () => resolve({ img, name: f.name });
              img.onerror = () => reject(new Error(`Failed to load ${f.name}`));
              img.src = url;
            })
        )
      );
      images.forEach((i) => URL.revokeObjectURL(i.img.src));
      setImages(loaded);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Image load failed");
    }
  }

  function removeImage(idx: number) {
    setImages((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.img.src);
      return copy;
    });
  }

  function stopAll() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioElRef.current?.pause(); } catch {}
    try { engineRef.current?.dispose(); } catch {}
    engineRef.current = null;
    visRef.current = null;
  }

  const generate = useCallback(async () => {
    if (!canvasRef.current || !audioElRef.current) return;
    setError(null);
    if (resultUrl) {
      URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
    }
    setStatus("recording");
    setElapsed(0);

    try {
      const canvas = canvasRef.current;
      canvas.width = 1280;
      canvas.height = 720;

      const audioEl = audioElRef.current;
      audioEl.currentTime = 0;

      const engine = new AudioEngine(audioEl);
      engineRef.current = engine;
      await engine.resume();

      const vis = new Visualizer(canvas, images);
      visRef.current = vis;

      const videoStream = canvas.captureStream(60);
      const audioTracks = engine.destination.stream.getAudioTracks();
      audioTracks.forEach((t) => videoStream.addTrack(t));

      const rec = new StreamRecorder(videoStream);
      recRef.current = rec;

      const ext = rec.mimeType.includes("webm") ? "webm" : "mp4";
      setResultExt(ext);

      const start = performance.now();
      let frame = 0;
      const tick = () => {
        if (!engineRef.current || !visRef.current) return;
        const bands = engineRef.current.read();
        visRef.current.render(bands, frame++);
        setElapsed((performance.now() - start) / 1000);
        rafRef.current = requestAnimationFrame(tick);
      };

      const onEnded = async () => {
        audioEl.removeEventListener("ended", onEnded);
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setStatus("finalizing");
        const blob = await rec.stop();
        const url = URL.createObjectURL(blob);
        setResultUrl(url);
        setStatus("done");
        try { engineRef.current?.dispose(); } catch {}
        engineRef.current = null;
      };
      audioEl.addEventListener("ended", onEnded);

      rec.start();
      await audioEl.play();
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      setStatus("error");
      stopAll();
    }
  }, [images, resultUrl]);

  async function cancel() {
    if (status !== "recording") return;
    setStatus("finalizing");
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioElRef.current?.pause(); } catch {}
    if (recRef.current) {
      const blob = await recRef.current.stop();
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
    }
    setStatus("done");
    try { engineRef.current?.dispose(); } catch {}
    engineRef.current = null;
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-lg font-semibold">1. Add your audio</h2>
        <p className="hint mt-1">
          Use only royalty-free / rights-cleared music. Suggested sources are listed in the sidebar.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="audio/*"
            onChange={onAudioChange}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white hover:file:bg-white/20"
          />
          {audioFile && (
            <span className="text-sm text-white/70">
              {audioFile.name} ({Math.round(audioFile.size / 1024)} KB)
            </span>
          )}
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={audioOk}
            onChange={(e) => setAudioOk(e.target.checked)}
            className="mt-1"
          />
          <span>
            I confirm that this audio is royalty-free or otherwise licensed for my use, and that I will
            comply with the source&apos;s license terms (including any attribution requirements).
          </span>
        </label>

        {audioUrl && (
          <audio
            ref={audioElRef}
            src={audioUrl}
            controls
            preload="auto"
            className="mt-3 w-full"
          />
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">2. Add source images <span className="text-white/40 text-sm font-normal">(optional)</span></h2>
        <p className="hint mt-1">
          Optional — leave empty for a pure abstract audio-reactive visualizer.
          If you upload images, they must be your own, public-domain, or licensed for your use.
        </p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={onImagesChange}
          className="mt-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-white hover:file:bg-white/20"
        />
        {images.length > 0 && (
          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {images.map((im, i) => (
              <li key={i} className="group relative overflow-hidden rounded-md border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={im.img.src} alt={im.name} className="aspect-square w-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute right-1 top-1 hidden rounded bg-black/60 px-1.5 py-0.5 text-xs group-hover:block"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {images.length > 0 && (
          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={imagesOk}
              onChange={(e) => setImagesOk(e.target.checked)}
              className="mt-1"
            />
            <span>
              I confirm that I own these images, or they are public-domain / licensed for my use. They are
              not someone else&apos;s copyrighted property used without permission.
            </span>
          </label>
        )}
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">3. Generate</h2>
            <p className="hint mt-1">
              Recording happens in real time — a 3-minute song takes ~3 minutes to render.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={generate} disabled={!canGenerate} className="btn-primary">
              {status === "recording" ? "Recording…" : status === "finalizing" ? "Finalizing…" : "Generate video"}
            </button>
            {status === "recording" && (
              <button onClick={cancel} className="btn-ghost">Stop</button>
            )}
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black">
          <canvas
            ref={canvasRef}
            width={1280}
            height={720}
            className="aspect-video w-full"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-white/70">
          <div>
            Status: <span className="text-white">{status}</span>
            {status === "recording" && (
              <> · elapsed: <span className="text-white">{elapsed.toFixed(1)}s</span></>
            )}
          </div>
          {resultUrl && (
            <a
              href={resultUrl}
              download={`eyeopener-${Date.now()}.${resultExt}`}
              className="btn-primary"
            >
              Download .{resultExt}
            </a>
          )}
        </div>

        {resultUrl && (
          <video src={resultUrl} controls className="mt-4 w-full rounded-xl border border-white/10" />
        )}

        {error && (
          <p className="mt-3 text-sm text-red-300">Error: {error}</p>
        )}
      </section>
    </div>
  );
}
