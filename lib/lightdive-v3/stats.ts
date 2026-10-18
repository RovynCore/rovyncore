// Operating stats for the admin page (10-19): everything is read from the public events of the v3 contracts, so it
// needs no database and holds nothing private (a player is only a wallet address). Daily buckets use the UTC game day:
// a dive carries its day; summons are dated by their drand round; other events by the nearest dated block before them.
import { formatEther, type Address } from "viem";
import { DESTINATIONS, baseTable, outcomesOf, skyOf, type Beam, type Sky } from "./rules.ts";
import { events, readWorld, roundTime, type Ctx, type Log } from "./onchain.ts";

type A = Record<string, unknown>;
const num = (v: unknown) => Number(formatEther(BigInt((v as bigint) ?? 0n)));

export type DayStats = {
  day: number;
  active: number; // wallets that dived
  fresh: number; // wallets whose first activity was this day
  dives: number;
  deep: number;
  summons: number; // cards requested
  summonPaid: number; // $RVYN
  rewards: number; // $RVYN brought back, after departure costs
  supplies: number;
  supplyPaid: number;
  commissions: number;
  sales: number;
  salesVolume: number;
  rate: number | null; // $RVYN per point of Lightdust that day
};

export type Stats = {
  readAt: number;
  pool: number;
  rate: number;
  wallets: number;
  activeToday: number;
  totals: {
    dives: number; deep: number; turnedBack: number; summons: number; summonPaid: number; rewards: number; levy: number;
    claimed: number; claimFees: number; burned: number; supplies: [number, number]; supplyPaid: number;
    commissions: number; commissionBonus: number; sales: number; salesVolume: number; salesTax: number; drips: number;
  };
  days: DayStats[]; // the last 14 days, newest first
  retention: { d1: number | null; d7: number | null; cohorts: number };
  clusters: number[]; // share of dives per cluster
  decisions: number[]; // none, steady, bold, detour
  outcomes: Record<string, number>; // tier counts by name: empty, normal...
  rarities: number[][]; // [kind][rarity] cards minted
};

const day = (ms: number) => Math.floor(ms / 86_400_000);

export async function readStats(ctx: Ctx, testToken: boolean): Promise<Stats> {
  const { c, abi } = ctx;
  const E = abi.Expedition3, M = abi.LightdiveMinter3, K = abi.LightdiveMarket3, N = abi.LightdiveNFT3, P = abi.CoreLightPool3, C = abi.LightdiveCommissions3;
  const [world, dived, details, decided, turned, revealed, claimed, opened, requested, minted, sold, burned, collected, paid, completed, drips] = await Promise.all([
    readWorld(ctx, testToken),
    events<A>(ctx, c.expedition, E, "Dived"),
    events<A>(ctx, c.expedition, E, "DiveDetails"),
    events<A>(ctx, c.expedition, E, "Decided"),
    events<A>(ctx, c.expedition, E, "TurnedBack"),
    events<A>(ctx, c.expedition, E, "Revealed"),
    events<A>(ctx, c.expedition, E, "Claimed"),
    events<A>(ctx, c.expedition, E, "DayOpened"),
    events<A>(ctx, c.minter, M, "SummonRequested"),
    events<A>(ctx, c.nft, N, "Minted"),
    events<A>(ctx, c.market, K, "Sold"),
    events<A>(ctx, c.pool, P, "Burned").catch(() => [] as Log<A>[]),
    events<A>(ctx, c.pool, P, "Collected").catch(() => [] as Log<A>[]),
    events<A>(ctx, c.pool, P, "Paid").catch(() => [] as Log<A>[]),
    events<A>(ctx, c.commissions, C, "Completed").catch(() => [] as Log<A>[]),
    testToken ? events<A>(ctx, c.rvyn, abi.TestRVYN, "Dripped").catch(() => [] as Log<A>[]) : Promise.resolve([] as Log<A>[]),
  ]);
  const args = (l: Log<A>) => (l as unknown as { args: A }).args;
  const blockOf = (l: Log<A>) => Number(l.blockNumber ?? 0n);

  // dated blocks: dives carry their day, summons their round; anything else takes the latest dated block before it
  const anchors: [number, number][] = [];
  for (const l of dived) anchors.push([blockOf(l), Number(args(l).day)]);
  for (const l of requested) anchors.push([blockOf(l), day((roundTime(BigInt(args(l).round as bigint)) - 6) * 1000)]);
  anchors.sort((a, b) => a[0] - b[0]);
  const today = day(world.now * 1000);
  const dayAt = (block: number) => {
    let lo = 0, hi = anchors.length - 1, best = anchors.length ? anchors[0][1] : today;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (anchors[mid][0] <= block) { best = anchors[mid][1]; lo = mid + 1; } else hi = mid - 1;
    }
    return best;
  };

  const diveDay = new Map<string, number>();
  const diveDest = new Map<string, number>();
  const diveBeam = new Map<string, number>();
  const longDive = new Set<string>();
  for (const l of dived) { const a = args(l); diveDay.set(String(a.diveId), Number(a.day)); diveDest.set(String(a.diveId), Number(a.dest)); diveBeam.set(String(a.diveId), Number(a.beam)); }
  for (const l of details) if (args(l).long) longDive.add(String(args(l).diveId));
  // the outcome name of a tier depends on the table the dive drew from (cluster and risk, as the game shows it)
  const skies = new Map<number, Sky>();
  const sky = (d: number) => { if (!skies.has(d)) skies.set(d, skyOf(d)); return skies.get(d)!; };
  const outcomeName = (id: string, tier: number) => {
    const dest = diveDest.get(id), d = diveDay.get(id);
    if (dest === undefined || d === undefined) return `t${tier}`;
    const ev = sky(d).events.get(dest);
    const risk = Math.max(0, Math.min(2, (diveBeam.get(id) ?? 1) + (ev === "storm" ? 1 : ev === "calm" ? -1 : 0) + (longDive.has(id) ? 1 : 0))) as Beam;
    return outcomesOf(baseTable(DESTINATIONS[dest].cluster, risk))[tier] ?? `t${tier}`;
  };

  // per wallet: the days it was active (any dive or summon), for "new" and retention
  const activeDays = new Map<string, Set<number>>();
  const touch = (who: unknown, d: number) => {
    const k = String(who).toLowerCase();
    if (!activeDays.has(k)) activeDays.set(k, new Set());
    activeDays.get(k)!.add(d);
  };
  for (const l of dived) touch(args(l).owner, Number(args(l).day));
  for (const l of requested) touch(args(l).player, dayAt(blockOf(l)));
  const firstDay = new Map([...activeDays].map(([k, s]) => [k, Math.min(...s)]));

  const blank = (d: number): DayStats => ({ day: d, active: 0, fresh: 0, dives: 0, deep: 0, summons: 0, summonPaid: 0, rewards: 0, supplies: 0, supplyPaid: 0, commissions: 0, sales: 0, salesVolume: 0, rate: null });
  const days = new Map<number, DayStats>();
  const at = (d: number) => { if (!days.has(d)) days.set(d, blank(d)); return days.get(d)!; };
  const divers = new Map<number, Set<string>>();
  for (const l of dived) {
    const a = args(l), d = Number(a.day);
    at(d).dives += 1;
    if (!divers.has(d)) divers.set(d, new Set());
    divers.get(d)!.add(String(a.owner).toLowerCase());
  }
  for (const [d, s] of divers) at(d).active = s.size;
  for (const [, d] of firstDay) at(d).fresh += 1;
  const supplyCount: [number, number] = [0, 0];
  let deep = 0, supplyPaid = 0;
  for (const l of details) {
    const a = args(l), d = diveDay.get(String(a.diveId)) ?? dayAt(blockOf(l));
    if (a.long) { deep += 1; at(d).deep += 1; }
    const s = Number(a.supply);
    if (s === 1 || s === 2) { supplyCount[s - 1] += 1; at(d).supplies += 1; }
    const p = num(a.supplyPaid); supplyPaid += p; at(d).supplyPaid += p;
  }
  let rewards = 0, levy = 0;
  const outcomes: Record<string, number> = {};
  for (const l of revealed) {
    const a = args(l), d = diveDay.get(String(a.diveId)) ?? dayAt(blockOf(l));
    const r = num(a.reward); rewards += r; levy += num(a.levy); at(d).rewards += r;
    const tier = Number(a.tier);
    const name = tier === 254 ? "turnedBack" : a.fallbackUsed ? "normal" : outcomeName(String(a.diveId), tier);
    outcomes[name] = (outcomes[name] ?? 0) + 1;
  }
  let summons = 0, summonPaid = 0;
  for (const l of requested) {
    const a = args(l), d = dayAt(blockOf(l));
    const q = Number(a.qty), p = num(a.paid);
    summons += q; summonPaid += p; at(d).summons += q; at(d).summonPaid += p;
  }
  let salesVolume = 0, salesTax = 0;
  for (const l of sold) { const a = args(l), d = dayAt(blockOf(l)); salesVolume += num(a.price); salesTax += num(a.tax); at(d).sales += 1; at(d).salesVolume += num(a.price); }
  let commissionBonus = 0;
  for (const l of completed) { const a = args(l); commissionBonus += num(a.bonus); at(Number(a.day)).commissions += 1; }
  for (const l of opened) { const a = args(l); at(Number(a.day)).rate = num(a.rate); }

  const clusters = [0, 0, 0, 0, 0, 0];
  for (const [, dest] of diveDest) clusters[DESTINATIONS[dest]?.cluster ?? 0] += 1;
  const decisions = [0, 0, 0, 0];
  for (const l of decided) decisions[Number(args(l).decision)] = (decisions[Number(args(l).decision)] ?? 0) + 1;
  decisions[0] = Math.max(0, dived.length - decisions[1] - decisions[2] - decisions[3]);
  const rarities = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  for (const l of minted) {
    const at2 = args(l).attributes as { kind: number; rarity: number } | undefined;
    if (at2 && rarities[Number(at2.kind)]) rarities[Number(at2.kind)][Number(at2.rarity)] += 1;
  }

  // retention: of the wallets that started on day D (with D+1 / D+7 already over), the share active again then
  const cohort = (offset: number) => {
    let n = 0, back = 0;
    for (const [k, d] of firstDay) {
      if (d + offset >= today) continue;
      n += 1;
      if (activeDays.get(k)!.has(d + offset)) back += 1;
    }
    return n ? back / n : null;
  };

  return {
    readAt: world.now * 1000,
    pool: num(world.poolBalance),
    rate: num(world.rate),
    wallets: activeDays.size,
    activeToday: divers.get(today)?.size ?? 0,
    totals: {
      dives: dived.length, deep, turnedBack: turned.filter((l) => args(l).turnBack).length, summons, summonPaid, rewards, levy,
      claimed: claimed.reduce((a, l) => a + num(args(l).gross), 0), claimFees: claimed.reduce((a, l) => a + num(args(l).fee), 0),
      burned: burned.reduce((a, l) => a + num(args(l).amount), 0) + collected.reduce((a, l) => a + num(args(l).burned), 0) + paid.reduce((a, l) => a + num(args(l).burned), 0),
      supplies: supplyCount, supplyPaid, commissions: completed.length, commissionBonus,
      sales: sold.length, salesVolume, salesTax, drips: drips.length,
    },
    days: Array.from({ length: 14 }, (_, i) => days.get(today - i) ?? blank(today - i)),
    retention: { d1: cohort(1), d7: cohort(7), cohorts: firstDay.size },
    clusters,
    decisions,
    outcomes,
    rarities,
  };
}

export type { Address };
