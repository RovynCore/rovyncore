import { redirect } from "next/navigation";

export default async function LegacyTokenDetail({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  redirect(`/assets/robinhood/${encodeURIComponent(address)}`);
}
