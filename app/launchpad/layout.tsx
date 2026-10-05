import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Launchpad",
  description: "Create a fixed-supply token from your wallet and publish its onchain record.",
  alternates: { canonical: "/launchpad" },
};

export default function LaunchpadLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
