import type { Metadata } from "next";
import { readXUpdates } from "@/lib/x-updates-store";
import { INITIAL_X_UPDATES } from "@/lib/x-updates";

import LatestInformationContent from "../development-log/page";

export const metadata: Metadata = {
  title: "Latest Information",
  description: "Official ROVYN CORE updates and product release notes.",
  alternates: { canonical: "/latest-info" },
};

export const dynamic = "force-dynamic";

export default async function LatestInformationPage() {
  let posts = INITIAL_X_UPDATES;
  let failed = false;
  try { posts = await readXUpdates(); }
  catch { failed = true; }
  return <LatestInformationContent initialPosts={posts} initialReadFailed={failed} />;
}
