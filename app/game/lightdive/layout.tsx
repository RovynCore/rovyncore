import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Lightdive Testnet",
  description: "RovynCore: Lightdive test version on Robinhood Chain testnet. Test tokens only; contracts not audited.",
  alternates: { canonical: "/game/lightdive" },
  // Not announced yet: keep the testnet build out of search results.
  robots: { index: false, follow: false },
};

export default function LightdiveLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
