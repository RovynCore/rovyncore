import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lightdive",
  description: "RovynCore: Lightdive, a card expedition game on Robinhood Chain played with RVYN. Now open on the testnet with test tokens that have no value; the contracts are not audited.",
  alternates: { canonical: "/game/lightdive" },
  // the game's own link preview (the founder's art, 10-18): the Stele Plain, its spires and the night sky
  openGraph: {
    type: "website",
    siteName: "ROVYN CORE",
    title: "Lightdive — ROVYN CORE",
    description: "A card expedition game on Robinhood Chain played with RVYN. Open on the testnet with test tokens that have no value.",
    url: "https://www.rovyncore.com/game/lightdive",
    images: [{ url: "/lightdive/og-lightdive.jpg", width: 1200, height: 630, alt: "Lightdive: spires on the Stele Plain under the night sky" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@RovynCORE",
    title: "Lightdive — ROVYN CORE",
    description: "A card expedition game on Robinhood Chain played with RVYN. Open on the testnet.",
    images: ["/lightdive/og-lightdive.jpg"],
  },
};

export default function LightdiveLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
