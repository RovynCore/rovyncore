import { redirect } from "next/navigation";

export default async function LegacyMyTokens({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams({ view: "mine" });
  const wallet = query.wallet || query.address;
  if (typeof wallet === "string") params.set("creator", wallet);
  redirect(`/onchain-record?${params}`);
}
