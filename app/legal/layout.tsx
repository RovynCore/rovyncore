import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms, Privacy & Risks",
  description: "ROVYN CORE terms, privacy and risk disclosures, including the RVYN sale contract terms and whitelist stages.",
  alternates: { canonical: "/legal" },
};

export default function LegalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
