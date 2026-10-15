import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lightdive Preview",
  description: "RovynCore: Lightdive played on simulated state in the browser, for development. No wallet, no transactions.",
  alternates: { canonical: "/game/lightdive/preview" },
  // A development tool, not a page to find: the game itself is /game/lightdive.
  robots: { index: false, follow: false },
};

export default function LightdivePreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
