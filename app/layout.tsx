import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EyeOpener — Audio-Reactive Video Generator",
  description:
    "Create audio-reactive videos from royalty-free music and rights-cleared images, entirely in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
