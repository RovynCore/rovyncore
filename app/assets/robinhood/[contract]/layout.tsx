import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Asset Record",
  description: "Public asset origin, issuance snapshot and current observed onchain state.",
};

export default function AssetRecordLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
