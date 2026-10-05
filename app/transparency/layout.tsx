import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Transparency",
  description: "Every RovynCore contract and wallet on Robinhood Chain, with explorer links, verification status and how to check them yourself.",
  alternates: { canonical: "/transparency" },
};

export default function TransparencyLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
