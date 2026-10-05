import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Onchain Records",
  description: "Search public token launch records, original snapshots and observed chain state.",
  alternates: { canonical: "/onchain-record" },
};

export default function OnchainRecordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
