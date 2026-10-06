import type { Metadata } from "next";

import LatestInformationContent from "../development-log/page";

export const metadata: Metadata = {
  title: "Latest Information",
  description: "ROVYN CORE product release notes.",
  alternates: { canonical: "/latest-info" },
};

export default function LatestInformationPage() {
  return <LatestInformationContent />;
}
