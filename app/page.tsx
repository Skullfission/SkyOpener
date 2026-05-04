import VideoGenerator from "@/components/VideoGenerator";
import RoyaltyFreeLinks from "@/components/RoyaltyFreeLinks";

export default function Page() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
          EyeOpener
        </h1>
        <p className="mt-2 text-white/70">
          Generate an audio-reactive video from royalty-free music and your own (or rights-cleared) images.
          Everything runs locally in your browser — no upload, no server.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <VideoGenerator />
        </div>
        <aside className="space-y-6">
          <RoyaltyFreeLinks />
        </aside>
      </div>

      <footer className="mt-10 text-xs text-white/40">
        You are responsible for ensuring you have the right to use any audio or images you upload.
      </footer>
    </main>
  );
}
