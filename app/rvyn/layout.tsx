import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "RVYN Whitelist & Token",
  description: "Official RVYN token record, current whitelist status and planned token allocation.",
  alternates: { canonical: "/rvyn" },
};

export default function RvynLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
