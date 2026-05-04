# EyeOpener

Generate audio-reactive videos from royalty-free music and rights-cleared images,
entirely in your browser. No upload, no server, no third-party API.

## How it works

1. You upload an audio track (royalty-free) and one or more images (your own or
   public-domain / licensed).
2. The Web Audio API analyses the track in real time (FFT + bass-energy beat
   detection).
3. A `<canvas>` renders an audio-reactive composition: zoom-pulsing images,
   beat-driven cross-fades, frequency bars, and a hue-shifting background.
4. `MediaRecorder` records the canvas video stream + audio stream into a
   downloadable WebM file.

## Compliance

EyeOpener does not let you generate a video without affirming that:

- the audio is royalty-free or otherwise licensed for your use, and
- the images are yours or are public-domain / licensed for your use.

A sidebar links to several reputable sources of royalty-free music and
public-domain images. Always read the source&#39;s license terms.

## Run locally

Requires Node.js 18+ (tested on Node 24) and a modern Chromium-, Firefox- or
Safari-based browser.

```bash
npm install
npm run dev
# open http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

## Notes & limitations

- Recording is real-time: a 3-minute song renders in ~3 minutes.
- Output format is WebM (VP9/VP8 + Opus). It plays in all modern browsers and
  in VLC. Convert to MP4 with FFmpeg if needed:
  `ffmpeg -i eyeopener.webm -c:v libx264 -c:a aac out.mp4`
- All processing happens locally; nothing is uploaded.
