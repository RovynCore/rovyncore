import { redirect } from "next/navigation";

export default async function LegacyExplore({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const key of ["q", "creator", "cursor"]) {
    const value = query[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  redirect(`/onchain-record${params.size ? `?${params}` : ""}`);
}
