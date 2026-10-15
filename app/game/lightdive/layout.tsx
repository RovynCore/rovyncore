import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lightdive",
  description: "RovynCore: Lightdive, a card expedition game on Robinhood Chain played with RVYN. Now open on the testnet with test tokens that have no value; the contracts are not audited.",
  alternates: { canonical: "/game/lightdive" },
};

export default function LightdiveLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
