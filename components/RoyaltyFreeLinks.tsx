type Source = { name: string; url: string; note: string };

const audioSources: Source[] = [
  { name: "Free Music Archive", url: "https://freemusicarchive.org/", note: "Curated CC / royalty-free tracks." },
  { name: "Pixabay Music", url: "https://pixabay.com/music/", note: "Free for commercial use, no attribution required." },
  { name: "ccMixter", url: "https://ccmixter.org/", note: "Creative Commons remixable music." },
  { name: "YouTube Audio Library", url: "https://studio.youtube.com/channel/UC/music", note: "Free music & SFX (login required)." },
  { name: "Incompetech", url: "https://incompetech.com/music/royalty-free/", note: "Kevin MacLeod — CC-BY tracks." },
];

const imageSources: Source[] = [
  { name: "Unsplash", url: "https://unsplash.com/", note: "Free to use, no attribution required." },
  { name: "Pexels", url: "https://www.pexels.com/", note: "Free stock photos & videos." },
  { name: "Pixabay", url: "https://pixabay.com/images/search/", note: "Royalty-free images." },
  { name: "Openverse", url: "https://openverse.org/", note: "Search openly licensed media." },
  { name: "NASA Image Library", url: "https://images.nasa.gov/", note: "Public domain (most assets)." },
];

function List({ title, items }: { title: string; items: Source[] }) {
  return (
    <div className="card">
      <h3 className="font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.map((s) => (
          <li key={s.url} className="text-sm">
            <a
              className="text-accent2 hover:underline"
              href={s.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {s.name}
            </a>
            <span className="text-white/50"> — {s.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function RoyaltyFreeLinks() {
  return (
    <>
      <List title="Royalty-free music" items={audioSources} />
      <List title="Royalty-free / public-domain images" items={imageSources} />
      <div className="card">
        <h3 className="font-semibold text-white">Before you upload</h3>
        <p className="mt-2 text-sm text-white/70">
          Always read the license terms on the source site. &quot;Free&quot; doesn&apos;t always mean
          &quot;free for any use&quot; — some assets require attribution or forbid commercial use.
        </p>
      </div>
    </>
  );
}
