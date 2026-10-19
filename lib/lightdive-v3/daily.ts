// 觀測站日報 (10-19): one UTC day of Lightdive in numbers, read from the chain's public events alone — how many dives
// and observers, the newcomers, the Legendaries and the best multiplier, the busiest destination, deep dives, echoes
// and how many of the 24 destinations were reached. The site's home page shows the day before. Relative imports only.
import type { Address } from "viem";
import { events, type Ctx } from "./onchain.ts";
import { outcomeNameOf } from "./history.ts";

export type DailyHit = { who: string; dest: number; mult: number };
export type Daily = {
  day: number;
  dives: number;
  observers: number;
  newcomers: number;
  legends: DailyHit[]; // up to 3, best first
  legendCount: number;
  best: DailyHit | null;
  popular: { dest: number; dives: number } | null;
  places: number; // destinations reached that day, of 24
  deep: number;
  echoes: number;
};

type A = Record<string, unknown>;
const lower = (a: unknown) => String(a).toLowerCase();

/** The numbers of UTC day `day`, from the deployment's first block on. */
export async function readDaily(ctx: Ctx, day: number): Promise<Daily> {
  const { c, abi } = ctx;
  const E = abi.Expedition3;
  const [dived, revealed, details, echoed] = await Promise.all([
    events<A>(ctx, c.expedition, E, "Dived"),
    events<A>(ctx, c.expedition, E, "Revealed"),
    events<A>(ctx, c.expedition, E, "DiveDetails"),
    events<A>(ctx, c.expedition, E, "Echoed").catch(() => []),
  ]);
  const firstDay = new Map<string, number>();
  for (const l of dived) {
    const who = lower(l.args.owner), d = Number(l.args.day);
    firstDay.set(who, Math.min(firstDay.get(who) ?? d, d));
  }
  const ofDay = dived.filter((l) => Number(l.args.day) === day);
  const ids = new Set(ofDay.map((l) => String(l.args.diveId)));
  const byId = new Map(ofDay.map((l) => [String(l.args.diveId), l.args]));
  const long = new Set(details.filter((l) => l.args.long && ids.has(String(l.args.diveId))).map((l) => String(l.args.diveId)));
  const observers = new Set(ofDay.map((l) => lower(l.args.owner)));
  const perDest = new Map<number, number>();
  for (const l of ofDay) perDest.set(Number(l.args.dest), (perDest.get(Number(l.args.dest)) ?? 0) + 1);
  const popular = [...perDest.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  const hits: (DailyHit & { legend: boolean })[] = [];
  for (const l of revealed) {
    const id = String(l.args.diveId);
    const d = byId.get(id);
    if (!d) continue;
    const tier = Number(l.args.tier);
    const outcome = l.args.fallbackUsed ? "normal" : outcomeNameOf(Number(d.dest), day, Number(d.beam), long.has(id), tier);
    hits.push({ who: lower(d.owner), dest: Number(d.dest), mult: Number(l.args.multX100), legend: outcome === "legend" });
  }
  hits.sort((a, b) => b.mult - a.mult);
  const strip = ({ who, dest, mult }: DailyHit) => ({ who, dest, mult });
  return {
    day,
    dives: ofDay.length,
    observers: observers.size,
    newcomers: [...observers].filter((w) => firstDay.get(w) === day).length,
    legends: hits.filter((h) => h.legend).slice(0, 3).map(strip),
    legendCount: hits.filter((h) => h.legend).length,
    best: hits[0] ? strip(hits[0]) : null,
    popular: popular ? { dest: popular[0], dives: popular[1] } : null,
    places: perDest.size,
    deep: long.size,
    echoes: echoed.filter((l) => ids.has(String(l.args.diveId))).length,
  };
}

export const shortAddress = (a: Address | string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
