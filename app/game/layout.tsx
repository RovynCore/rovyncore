import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "First Game",
  description: "Our first game is in development on Robinhood Chain, with RVYN at the heart of its economy. Gameplay and release timing are not announced yet.",
  alternates: { canonical: "/game" },
};

export default function GameLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
