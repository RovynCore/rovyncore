"use client";

import { LightdiveAdmin } from "@/components/lightdive/lightdive-admin";
import { AdminStats } from "@/components/lightdive/v3/admin-stats";

export default function LightdiveAdminPage() {
  return (
    <>
      {/* the v3 game's operating numbers (read from the chain), then the older v2 tools */}
      <div style={{ padding: "24px 16px 0" }}><AdminStats /></div>
      <LightdiveAdmin />
    </>
  );
}
