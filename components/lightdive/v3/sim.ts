"use client";

// Preview mode for rules v3: the whole game runs in this browser on simulated state, saved in localStorage.
// Nothing here sends a transaction or touches a wallet. Rewards use a fixed simulated rate and are credited
// at the reveal so the loop can be tried in minutes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DECISION_AT, DECISION_CLOSE_MS, DESTINATIONS, DIVES_PER_DAY, DIVES_PER_TEAM_PER_DAY, DOCK_DAYS, MAX_TEAMS, VOYAGE_MINUTES, EVENT_CHANCE, ODDS_BP, POWER, PRICE, RENEW_SHARE, VOYAGES,
  BOND_MAX, CHART_STABILITY, COMMISSION_BONUS, DEEP_MIN_CLUSTER, DEEP_MINUTES, DEEP_TURN_MS, SUPPLY_PRICE,
  EMISSION, basePoints, claimFee, dailyRate, planDive, resolve, seeded, skyOf, teamPower,
  type Beam, type Choice, type DivePlan, type DiveResult, type Kind, type TeamInput,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { LIST_BATCH, MARKET_TAX } from "@/lib/lightdive-v3/rules";
import { averagePrice, othersListings, simulatedSupply, type Listing, type Supply } from "./market-data";
import { chainOf, type ChainFacts } from "./chain";
import { tl } from "@/lib/lightdive-v3/i18n";
import { commissionsOf, meetsCommission, type Commission } from "@/lib/lightdive-v3/commissions";

const KEY = "lightdive:preview:v3";
const VERSION = 1;
export const REVEAL_MS = VOYAGE_MINUTES * 60_000; // the voyage log plays out over these five minutes
export const MINT_REVEAL_MS = 8_000;
export const SIM_POOL = 1_000_000;
/** The preview's rate for a day: 1% of the simulated pool shared by a simulated day of everyone's Lightdust. */
export function rateOf(day: number) {
  const r = seeded(day * 7907 + 3);
  return dailyRate(SIM_POOL, 2_000_000 * (0.75 + 0.5 * r()));
}
/** The simulated Core Light Pool at a moment: today's opening balance, minus today's 1% flowing out to divers over
 *  the day, plus summons, levies and market fees flowing back in small bursts, plus what this player has paid in. */
export function poolAt(t: number, mine = 0) {
  const day = Math.floor(t / DAY), f = (t - day * DAY) / DAY;
  const r = seeded(day * 4021 + 9);
  const open = SIM_POOL * (0.985 + 0.03 * r());
  const tick = Math.floor(t / 4_000); // inflows land every few seconds, each a different size
  const burst = seeded(tick * 131 + 7)() * 18;
  return open - open * EMISSION * f + open * (0.008 + 0.006 * r()) * f + burst + mine;
}
export const TEAM_NAME_MAX = 12;
/** A team's name: the one its owner gave it, or its spire. */
export function teamName(st: SimState, spire: number) {
  const n = st.nfts.find((x) => x.id === spire);
  return st.teamNames?.[spire] || tl("光塔 #{0}", { 0: n?.id ?? spire });
}
export const START_BALANCE = 400;
const DAY = 86_400_000;

export type SimNft = {
  id: number;
  kind: Kind;
  rarity: number;
  power: number;
  trait: number; // spire: level, prism: beam, seeker: light
  voyages: number;
  renewed: boolean;
  dockedAt?: number;
  homeAt?: number; // came home (burned)
  listed?: number; // price on the market, preview only
  soldAt?: number; // sold on the market (no longer owned)
  mint?: number; // id of the summon request it came from
};
export type SimTeam = { spire: number; prism?: number; seekers: number[]; bond?: number };
export type SimDive = {
  id: number;
  spire: number;
  dest: number;
  at: number;
  revealAt: number;
  plan: DivePlan;
  card?: number; // index into TEXTS.cards
  choice?: Choice;
  choiceAt?: number;
  result?: DiveResult;
  reward?: number; // after the supply levy
  levyPaid?: number;
  pending?: boolean; // revealed, waiting for the player to collect it
  collectedAt?: number;
  log?: string;
  rate?: number; // live game: the rate fixed for the dive's day ($RVYN per point of Lightdust)
  // v3.1
  deep?: boolean; // a deep dive (2 passes, 15 minutes, one risk level up, twice the points)
  supply?: number; // 0 none, 1 lamp oil, 2 star chart
  supplyPaid?: number;
  bond?: number; // the team's bond at departure
  turnedBack?: boolean; // a deep dive that turned back (x1.00)
  attuned?: boolean;
};
export type MintRequest = { id: number; kind: Kind; qty: number; at: number; revealAt: number; paid: number };
/** A revealed summon, kept for the summon history: the request and the ids of the cards it gave. */
export type PullRecord = MintRequest & { cards: number[] };
export type SimState = {
  version: number;
  nextId: number;
  balance: number;
  credit: number;
  lastClaimAt: number;
  nfts: SimNft[];
  teams: SimTeam[];
  dives: SimDive[];
  mints: MintRequest[];
  pulls?: PullRecord[]; // revealed summons, newest last
  claimed: number;
  levyTotal: number;
  feesPaid?: number; // claim fees
  listings?: { nftId: number; price: number; at: number }[]; // my market listings
  sold?: number[]; // ids of other sellers' listings I bought
  sales?: { nftId: number; price: number; at: number }[]; // my listings that sold
  spent?: { mint: number; renew: number; market: number; supply?: number }; // RVYN paid for summons, renewals, market buys and supplies
  teamNames?: Record<number, string>; // custom team names, kept per spire so a rebuilt team keeps its name
  commission?: { day: number; index: number; fromDive: number } | null; // the accepted daily commission
  commissionMarks?: Record<number, number>; // per day: bit i completed, bit i + 8 abandoned
  commissionsDone?: number; // live game: completed commissions read from the chain (the preview counts its marks)
};

const addSpent = (st: SimState, key: "mint" | "renew" | "market" | "supply", v: number) => {
  st.spent = { mint: 0, renew: 0, market: 0, supply: 0, ...st.spent };
  st.spent[key] = (st.spent[key] ?? 0) + v;
};

/** Owned: not come home, not sold. */
export const owned = (n: SimNft) => !n.homeAt && !n.soldAt;
/** Idle: owned, on no team, not docked, not listed. These are the cards that hold a place under the cap unused. */
export const idleCards = (s: SimState) =>
  s.nfts.filter((n) => owned(n) && n.dockedAt === undefined && n.listed === undefined && !s.teams.some((t) => t.spire === n.id || t.prism === n.id || t.seekers.includes(n.id)));

export const dayOf = (ms: number) => Math.floor(ms / DAY);

function roll(r: () => number, kind: Kind) {
  let x = Math.floor(r() * 10000), rarity = 0;
  for (; rarity < 4; rarity++) { if (x < ODDS_BP[kind][rarity]) break; x -= ODDS_BP[kind][rarity]; }
  const [lo, hi] = POWER[kind][rarity];
  const power = lo + Math.floor(r() * (hi - lo + 1));
  const trait = kind === 0 ? rarity + 1 : kind === 1 ? (r() < 0.4 ? 0 : r() < 0.667 ? 1 : 2) : Math.floor(r() * 6);
  return { kind, rarity, power, trait };
}

/** A starter collection so the preview is playable at once: three spires of different levels, prisms and seekers. */
function starter(): SimState {
  const r = seeded(Date.now() % 1e9);
  let id = 1;
  const nft = (kind: Kind, rarity: number, trait?: number): SimNft => {
    const [lo, hi] = POWER[kind][rarity];
    return { id: id++, kind, rarity, power: lo + Math.floor(r() * (hi - lo + 1)), trait: trait ?? (kind === 0 ? rarity + 1 : kind === 1 ? 1 : Math.floor(r() * 6)), voyages: VOYAGES[kind], renewed: false };
  };
  const nfts = [
    nft(0, 0), nft(0, 1), nft(0, 2),
    nft(1, 0, 0), nft(1, 1, 2),
    ...[0, 0, 0, 1, 1, 1, 2, 3].map((rar) => nft(2, rar)),
  ];
  const s = nfts.filter((n) => n.kind === 2).sort((a, b) => b.power - a.power);
  const teams: SimTeam[] = [
    { spire: nfts[2].id, prism: nfts[4].id, seekers: [s[0].id, s[1].id, s[2].id] },
    { spire: nfts[1].id, prism: nfts[3].id, seekers: [s[3].id, s[4].id] },
    { spire: nfts[0].id, seekers: [s[5].id] },
  ];
  return { version: VERSION, nextId: id, balance: START_BALANCE, credit: 0, lastClaimAt: Date.now(), nfts, teams, dives: [], mints: [], claimed: 0, levyTotal: 0 };
}

function load(): SimState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as SimState;
      if (s.version === VERSION) return s;
    }
  } catch {}
  return starter();
}

const pickLine = <T,>(list: readonly T[], seed: number): T => list[Math.abs(seed) % list.length];

export function teamInput(s: SimState, team: SimTeam): TeamInput {
  const byId = (id: number) => s.nfts.find((n) => n.id === id)!;
  const prism = team.prism ? byId(team.prism) : undefined;
  return {
    spire: byId(team.spire).power,
    prism: prism ? { power: prism.power, beam: prism.trait as Beam } : undefined,
    seekers: team.seekers.map(byId).map((n) => ({ power: n.power, light: n.trait })),
  };
}

export const divesOn = (s: SimState, day: number) => s.dives.filter((d) => dayOf(d.at) === day);
/** Dive Passes used on a day (a deep dive uses two), for the wallet or for one team. */
export const passesOn = (s: SimState, day: number, spire?: number) =>
  divesOn(s, day).filter((d) => spire === undefined || d.spire === spire).reduce((a, d) => a + (d.deep ? 2 : 1), 0);
/** A deep dive's turn-back window: from DEEP_TURN_MS until a minute before the reveal. */
export const turnOpenAt = (d: SimDive) => d.revealAt - DEEP_TURN_MS;
export const turning = (d: SimDive, now: number) => !!d.deep && !d.result && now >= turnOpenAt(d) && now < d.revealAt - DECISION_CLOSE_MS;
/** Points of empty-handed chance a dive moves to "normal": its crew bond and a star chart. */
export const stabilityOf = (bond: number | undefined, supply: number | undefined) => (bond ?? 0) + (supply === 2 ? CHART_STABILITY : 0);
export type DiveOpts = { supply?: number; deep?: boolean };
/** A supply's price: its share of the dive's x1.00 reward (twice the points on a deep dive). */
export const supplyCost = (plan: DivePlan, deep: boolean | undefined, rate: number, supply: number) =>
  basePoints(plan) * (deep ? 2 : 1) * rate * (SUPPLY_PRICE[supply] ?? 0);
/** Results the player has collected (the only ones that count as earnings). */
export const collected = (d: SimDive) => !!d.result && !d.pending;
/** The team is out: on the bridge, or back with a result nobody has collected yet. */
export const teamOut = (s: SimState, spire: number) => s.dives.some((d) => d.spire === spire && (!d.result || d.pending));
/** When the voyage decision opens (it stays open until the reveal). */
export const decisionAt = (d: SimDive) => d.at + (d.revealAt - d.at) * (d.deep ? 0.1 : DECISION_AT); // a deep dive asks early
/** A decision is waiting for the player. */
/** When the decision closes: one minute before the reveal, as on chain. */
export const decisionCloseAt = (d: SimDive) => d.revealAt - (d.deep ? DEEP_TURN_MS : DECISION_CLOSE_MS);
export const deciding = (d: SimDive, now: number) => !d.result && d.card !== undefined && !d.choice && now >= decisionAt(d) && now < decisionCloseAt(d);

export type ActResult = { error: string | null; id?: number; card?: number };
export type FeedRow = { id: string; who: string; owner?: string; dest: number; outcome?: string; mult?: number; at: number; choice?: string };

/** What every page plays with: the preview (useSim, simulated in this browser) or the live game (useChain, the v3
 *  contracts). Actions are async because on chain they wait for the wallet and the transaction. */
export type Game = {
  mode: "preview" | "chain";
  state: SimState | null;
  now: number;
  today: number;
  sky: ReturnType<typeof skyOf>;
  rate: number;
  rateYesterday: number;
  pool: number;
  /** The rate that applied to dives of a given UTC day. */
  rateOn: (day: number) => number;
  /** Other players' cards on the market now. */
  market: Listing[];
  supply: (listed: [number, number, number]) => [Supply, Supply, Supply];
  /** Everyone's recent dives (the live log). */
  feed: (now: number, count?: number, hours?: number) => FeedRow[];
  /** Everyone else's dives of the last 7 days (the weekly boards). */
  week: FeedRow[];
  chainOf: (n: Pick<SimNft, "id" | "kind" | "rarity">) => ChainFacts;
  /** Live game: the latest summons by anyone (the preview simulates its own). */
  summons?: { id: number; who: string; owner?: string; kind: Kind; rarity: number; at: number }[];
  dive: (spire: number, dest: number, opts?: DiveOpts) => Promise<ActResult>;
  /** A deep dive's second decision: turn back (true) or press on. */
  turnBack: (diveId: number, back: boolean) => Promise<void>;
  /** The day's commissions and the player's progress on them. */
  commissions: Commissions;
  /** Several teams at once (one transaction on chain); one result per team, in order. */
  diveMany: (teams: { spire: number; dest: number }[], supply?: number) => Promise<ActResult[]>;
  choose: (diveId: number, choice: Choice) => Promise<void>;
  collect: (ids?: number[]) => Promise<number>;
  setTeam: (team: SimTeam) => Promise<string | null>;
  nameTeam: (spire: number, name: string) => void;
  mint: (kind: Kind, qty: number) => Promise<ActResult>;
  renew: (id: number) => Promise<string | null>;
  sendHome: (id: number) => Promise<void>;
  claim: () => Promise<void>;
  listNft: (id: number, price: number) => Promise<string | null>;
  listMany: (items: { id: number; price: number }[]) => Promise<string | null>;
  unlist: (id: number) => Promise<void>;
  buy: (l: Listing) => Promise<ActResult>;
  /** Preview tools. */
  hurry?: (id: number, ms: number) => void;
  skipDay?: () => void;
  reset?: () => void;
  /** Live game only: wallet, faucet, transactions and drafts. */
  chain?: import("./use-chain").ChainExtras;
};
export type Sim = Game;

export type Commissions = {
  list: Commission[];
  active: number | null; // index of the accepted one
  done: number[];
  abandoned: number[];
  /** A revealed dive that meets the accepted commission (the "complete" button collects it first if needed). */
  ready: number | null;
  bonus: number; // share of the dive's x1.00 reward a completed commission pays
  accept: (index: number) => Promise<string | null>;
  abandon: () => Promise<void>;
  complete: () => Promise<string | null>;
};

/** The commission state any game derives from its dives (the preview keeps it in state; the chain reads it). */
export function commissionView(s: SimState, today: number, active: { index: number; fromDive: number } | null, marks: number): Pick<Commissions, "list" | "active" | "done" | "abandoned" | "ready"> {
  const list = commissionsOf(today);
  const bits = (o: number) => [0, 1, 2].filter((i) => marks & (1 << (i + o)));
  const c = active ? list[active.index] : null;
  // a collected one first; a result still waiting is collected by the same button
  const ready = c && active
    ? s.dives.filter((d) => d.id >= active.fromDive && dayOf(d.at) === today && d.result && meetsCommission(c, d))
        .sort((a, b) => Number(!!a.pending) - Number(!!b.pending))[0]?.id ?? null
    : null;
  return { list, active: active?.index ?? null, done: bits(0), abandoned: bits(8), ready };
}

export function useSim(): Game {
  const [state, setState] = useState<SimState | null>(null);
  const [now, setNow] = useState(0);
  const ref = useRef<SimState | null>(null);

  useEffect(() => {
    // localStorage only exists in the browser, so the saved game is read after mount.
    queueMicrotask(() => {
      const s = load();
      ref.current = s;
      setState(s);
      setNow(Date.now());
    });
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const commit = useCallback((f: (s: SimState) => SimState | void) => {
    const cur = ref.current;
    if (!cur) return;
    const draft = structuredClone(cur);
    const next = f(draft) ?? draft;
    ref.current = next;
    setState(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  // Reveal dives and mints whose time has come.
  useEffect(() => {
    const s = ref.current;
    if (!s || !now) return;
    const dueDives = s.dives.some((d) => !d.result && d.revealAt <= now);
    const dueMints = s.mints.some((m) => m.revealAt <= now);
    if (!dueDives && !dueMints) return;
    commit((st) => {
      for (const d of st.dives) if (!d.result && d.revealAt <= now) reveal(st, d, now);
      for (const m of st.mints.filter((m) => m.revealAt <= now)) {
        const r = seeded(m.id * 7919 + m.at);
        const cards: number[] = [];
        for (let i = 0; i < m.qty; i++) {
          cards.push(st.nextId);
          st.nfts.push({ id: st.nextId++, ...roll(r, m.kind), voyages: VOYAGES[m.kind], renewed: false, mint: m.id });
        }
        st.pulls = [...(st.pulls ?? []), { ...m, cards }];
      }
      st.mints = st.mints.filter((m) => m.revealAt > now);
    });
  }, [now, commit]);

  const today = dayOf(now);
  const sky = skyOf(today);
  const rate = rateOf(today);
  const rateYesterday = rateOf(today - 1);
  const sp = state?.spent;
  const pool = poolAt(now, sp ? (sp.mint + sp.renew + sp.market) * 0.95 : 0);

  const dive = useCallback((spire: number, dest: number, opts: DiveOpts = {}): { error: string | null; id?: number; card?: number } => {
    let error: string | null = null;
    let made: SimDive | undefined;
    commit((st) => {
      const t = Date.now(), day = dayOf(t);
      const team = st.teams.find((x) => x.spire === spire);
      const uses = opts.deep ? 2 : 1;
      if (!team || team.seekers.length === 0) { error = "noTeam"; return; }
      if (opts.deep && DESTINATIONS[dest].cluster < DEEP_MIN_CLUSTER) { error = "notDeep"; return; }
      if (passesOn(st, day) + uses > DIVES_PER_DAY) { error = "noTickets"; return; }
      if (passesOn(st, day, spire) + uses > DIVES_PER_TEAM_PER_DAY) { error = "teamLimit"; return; }
      if (st.dives.some((d) => d.spire === spire && !d.result)) { error = "onBridge"; return; }
      if (st.dives.some((d) => d.spire === spire && d.pending)) { error = "uncollected"; return; }
      const input = teamInput(st, team);
      const d = DESTINATIONS[dest];
      if (teamPower(input) < d.threshold) { error = "tooDim"; return; }
      const supply = opts.supply ?? 0;
      const plan = planDive(input, d, skyOf(day), "none", { stability: stabilityOf(team.bond, supply), deep: opts.deep });
      const paid = supplyCost(plan, opts.deep, rateOf(day), supply);
      if (paid > st.balance) { error = "balance"; return; }
      st.balance -= paid;
      if (paid) addSpent(st, "supply", paid);
      const r = seeded(st.nextId * 104729 + t);
      const cards = TEXTS.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.cluster === -1 || c.cluster === d.cluster);
      const card = r() < EVENT_CHANCE ? cards[Math.floor(r() * cards.length)].i : undefined;
      made = {
        id: st.nextId++, spire, dest, at: t, revealAt: t + (opts.deep ? DEEP_MINUTES * 60_000 : REVEAL_MS), plan, card,
        deep: !!opts.deep, supply, supplyPaid: paid, bond: team.bond ?? 0, attuned: plan.bonus > 0,
      };
      st.dives.push(made);
    });
    return { error, id: made?.id, card: made?.card };
  }, [commit]);

  const choose = useCallback((diveId: number, choice: Choice) => {
    commit((st) => {
      const d = st.dives.find((x) => x.id === diveId);
      if (!d || d.result || d.choice || Date.now() < decisionAt(d) || Date.now() >= decisionCloseAt(d)) return;
      const team = st.teams.find((x) => x.spire === d.spire);
      d.choice = choice;
      d.choiceAt = Date.now();
      if (team) d.plan = planDive(teamInput(st, team), DESTINATIONS[d.dest], skyOf(dayOf(d.at)), choice, { stability: stabilityOf(d.bond, d.supply), deep: d.deep });
    });
  }, [commit]);

  /** A deep dive's second decision, inside its turn-back window. */
  const turnBack = useCallback((diveId: number, back: boolean) => {
    commit((st) => {
      const d = st.dives.find((x) => x.id === diveId);
      if (!d || !turning(d, Date.now())) return;
      d.turnedBack = back;
    });
  }, [commit]);

  // 每日委託: the same rules as LightdiveCommissions3 (one at a time, a dive after accepting, abandon blocks for the day)
  const commission = state?.commission && state.commission.day === today ? state.commission : null;
  const marks = state?.commissionMarks?.[today] ?? 0;
  const acceptCommission = useCallback((index: number): string | null => {
    let error: string | null = null;
    commit((st) => {
      const day = dayOf(Date.now());
      const m = st.commissionMarks?.[day] ?? 0;
      if (st.commission && st.commission.day === day) { error = "commissionActive"; return; }
      if (m & ((1 << index) | (1 << (index + 8)))) { error = "commissionTaken"; return; }
      st.commission = { day, index, fromDive: st.nextId };
    });
    return error;
  }, [commit]);
  const abandonCommission = useCallback(() => {
    commit((st) => {
      const day = dayOf(Date.now());
      if (!st.commission || st.commission.day !== day) return;
      st.commissionMarks = { ...st.commissionMarks, [day]: (st.commissionMarks?.[day] ?? 0) | (1 << (st.commission.index + 8)) };
      st.commission = null;
    });
  }, [commit]);
  const completeCommission = useCallback((): string | null => {
    let error: string | null = null;
    commit((st) => {
      const day = dayOf(Date.now());
      const v = commissionView(st, day, st.commission?.day === day ? st.commission : null, st.commissionMarks?.[day] ?? 0);
      const d = st.dives.find((x) => x.id === v.ready);
      if (!st.commission || !d) { error = "commissionNotMet"; return; }
      if (d.pending) collectInto(st, d);
      const bonus = basePoints(d.plan) * (d.deep ? 2 : 1) * rateOf(dayOf(d.at)) * COMMISSION_BONUS;
      st.credit += bonus;
      st.commissionMarks = { ...st.commissionMarks, [day]: (st.commissionMarks?.[day] ?? 0) | (1 << st.commission.index) };
      st.commission = null;
    });
    return error;
  }, [commit]);
  const commissions: Commissions = {
    ...(state ? commissionView(state, today, commission, marks) : { list: commissionsOf(today), active: null, done: [], abandoned: [], ready: null }),
    bonus: COMMISSION_BONUS,
    accept: async (i) => acceptCommission(i),
    abandon: async () => abandonCommission(),
    complete: async () => completeCommission(),
  };

  const setTeam = useCallback((team: SimTeam): string | null => {
    let error: string | null = null;
    commit((st) => {
      const others = st.teams.filter((x) => x.spire !== team.spire);
      const keep = team.seekers.length > 0 || team.prism !== undefined;
      if (keep && others.length >= MAX_TEAMS) { error = "teamCap"; return; }
      const was = st.teams.find((x) => x.spire === team.spire);
      const same = !!was && was.prism === team.prism && was.seekers.join() === team.seekers.join();
      st.teams = keep ? [...others, { ...team, bond: same ? was!.bond : 0 }] : others;
    });
    return error;
  }, [commit]);

  const nameTeam = useCallback((spire: number, name: string) => {
    commit((st) => {
      const v = name.trim().slice(0, TEAM_NAME_MAX);
      const names = { ...st.teamNames };
      if (v) names[spire] = v; else delete names[spire];
      st.teamNames = names;
    });
  }, [commit]);

  const mint = useCallback((kind: Kind, qty: number): { error: string | null; id?: number } => {
    let error: string | null = null;
    let id: number | undefined;
    commit((st) => {
      const cost = PRICE[kind] * qty;
      if (st.balance < cost) { error = "balance"; return; }
      st.balance -= cost;
      addSpent(st, "mint", cost);
      const t = Date.now();
      id = st.nextId++;
      st.mints.push({ id, kind, qty, at: t, revealAt: t + MINT_REVEAL_MS, paid: cost });
    });
    return { error, id };
  }, [commit]);

  const renew = useCallback((id: number): string | null => {
    let error: string | null = null;
    commit((st) => {
      const n = st.nfts.find((x) => x.id === id);
      if (!n || n.dockedAt === undefined || n.renewed) { error = "cannotRenew"; return; }
      const cost = PRICE[n.kind] * RENEW_SHARE;
      if (st.balance < cost) { error = "balance"; return; }
      st.balance -= cost;
      addSpent(st, "renew", cost);
      n.voyages = VOYAGES[n.kind];
      n.renewed = true;
      delete n.dockedAt;
    });
    return error;
  }, [commit]);

  const sendHome = useCallback((id: number) => {
    commit((st) => {
      const n = st.nfts.find((x) => x.id === id);
      if (n && n.dockedAt !== undefined) n.homeAt = Date.now();
    });
  }, [commit]);

  const claim = useCallback(() => {
    commit((st) => {
      if (st.credit <= 0) return;
      const fee = st.credit * claimFee((Date.now() - st.lastClaimAt) / DAY);
      st.balance += st.credit - fee;
      st.claimed += st.credit - fee;
      st.feesPaid = (st.feesPaid ?? 0) + fee;
      st.credit = 0;
      st.lastClaimAt = Date.now();
    });
  }, [commit]);

  const listNft = useCallback((id: number, price: number): string | null => {
    let error: string | null = null;
    commit((st) => {
      const n = st.nfts.find((x) => x.id === id);
      if (!n || !owned(n)) { error = "notOwned"; return; }
      if (st.teams.some((t) => t.spire === id || t.prism === id || t.seekers.includes(id))) { error = "onTeam"; return; }
      if (n.dockedAt !== undefined) { error = "docked"; return; }
      if (!(price > 0)) { error = "price"; return; }
      st.listings = (st.listings ?? []).filter((l) => l.nftId !== id);
      st.listings.push({ nftId: id, price: Math.round(price * 100) / 100, at: Date.now() });
      n.listed = price;
    });
    return error;
  }, [commit]);

  /** Lists several cards at once, all or nothing, at most LIST_BATCH (one listMany transaction on chain). */
  const listMany = useCallback((items: { id: number; price: number }[]): string | null => {
    let error: string | null = null;
    commit((st) => {
      if (!items.length || items.length > LIST_BATCH || new Set(items.map((x) => x.id)).size !== items.length) { error = "batch"; return; }
      for (const { id, price } of items) {
        const n = st.nfts.find((x) => x.id === id);
        if (!n || !owned(n)) { error = "notOwned"; return; }
        if (st.teams.some((t) => t.spire === id || t.prism === id || t.seekers.includes(id))) { error = "onTeam"; return; }
        if (n.dockedAt !== undefined) { error = "docked"; return; }
        if (!(price > 0)) { error = "price"; return; }
      }
      const at = Date.now();
      const ids = new Set(items.map((x) => x.id));
      st.listings = (st.listings ?? []).filter((l) => !ids.has(l.nftId));
      for (const { id, price } of items) {
        const p = Math.round(price * 100) / 100;
        st.listings.push({ nftId: id, price: p, at });
        st.nfts.find((x) => x.id === id)!.listed = p;
      }
    });
    return error;
  }, [commit]);

  const unlist = useCallback((id: number) => {
    commit((st) => {
      st.listings = (st.listings ?? []).filter((l) => l.nftId !== id);
      const n = st.nfts.find((x) => x.id === id);
      if (n) delete n.listed;
    });
  }, [commit]);

  const buy = useCallback((l: Listing): { error: string | null; id?: number } => {
    let error: string | null = null;
    let id: number | undefined;
    commit((st) => {
      if (st.balance < l.price) { error = "balance"; return; }
      st.balance -= l.price;
      addSpent(st, "market", l.price);
      st.sold = [...(st.sold ?? []), l.id];
      id = st.nextId;
      st.nfts.push({ id: st.nextId++, kind: l.kind, rarity: l.rarity, power: l.power, trait: l.trait, voyages: l.voyages, renewed: l.renewed });
    });
    return { error, id };
  }, [commit]);

  /** Collects revealed results (all of them, or the given dives): only now does the reward go to the treasury. */
  const collect = useCallback((ids?: number[]) => {
    let total = 0;
    commit((st) => {
      for (const d of st.dives) {
        if (!d.pending || (ids && !ids.includes(d.id))) continue;
        total += d.reward ?? 0;
        collectInto(st, d);
      }
    });
    return total;
  }, [commit]);

  /** Preview tool: move one voyage forward in time (never past its reveal). */
  const hurry = useCallback((id: number, ms: number) => {
    commit((st) => {
      const d = st.dives.find((x) => x.id === id);
      if (!d || d.result) return;
      const shift = Math.max(0, Math.min(ms, d.revealAt - Date.now()));
      d.at -= shift;
      d.revealAt -= shift;
      if (d.choiceAt) d.choiceAt -= shift;
    });
  }, [commit]);

  /** Preview tool: move everything one day into the past, so tickets reset and docking, fees and lives move on. */
  const skipDay = useCallback(() => {
    commit((st) => {
      for (const d of st.dives) { d.at -= DAY; d.revealAt -= DAY; if (d.choiceAt) d.choiceAt -= DAY; }
      for (const m of st.mints) { m.at -= DAY; m.revealAt -= DAY; }
      for (const p of st.pulls ?? []) { p.at -= DAY; p.revealAt -= DAY; }
      for (const n of st.nfts) { if (n.dockedAt !== undefined) n.dockedAt -= DAY; if (n.homeAt) n.homeAt -= DAY; }
      st.lastClaimAt -= DAY;
    });
  }, [commit]);

  const reset = useCallback(() => {
    const s = starter();
    ref.current = s;
    setState(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
  }, []);

  // Docked NFTs past the 7-day window come home on their own.
  useEffect(() => {
    const s = ref.current;
    if (!s || !now) return;
    if (s.nfts.some((n) => n.dockedAt !== undefined && !n.homeAt && now - n.dockedAt > DOCK_DAYS * DAY)) {
      commit((st) => { for (const n of st.nfts) if (n.dockedAt !== undefined && !n.homeAt && now - n.dockedAt > DOCK_DAYS * DAY) n.homeAt = now; });
    }
  }, [now, commit]);

  // Simulated buyers: a listing priced at or under 115% of the market average sells after about two minutes.
  useEffect(() => {
    const s = ref.current;
    if (!s || !now || !s.listings?.length) return;
    const market = othersListings(now, s.sold ?? []);
    const due = s.listings.filter((l) => {
      const n = s.nfts.find((x) => x.id === l.nftId);
      if (!n || now - l.at < 120_000) return false;
      const avg = averagePrice(market, n.kind, n.rarity);
      return !avg || l.price <= avg.average * 1.15;
    });
    if (!due.length) return;
    commit((st) => {
      for (const l of due) {
        const n = st.nfts.find((x) => x.id === l.nftId);
        if (!n) continue;
        n.soldAt = now;
        delete n.listed;
        st.balance += l.price * (1 - MARKET_TAX);
        st.sales = [...(st.sales ?? []), { nftId: l.nftId, price: l.price, at: now }];
      }
      st.listings = (st.listings ?? []).filter((l) => !due.some((d) => d.nftId === l.nftId));
    });
  }, [now, commit]);

  const hour = Math.floor(now / 3_600_000);
  // the clock starts at 0 until the page mounts; nothing to show before that
  const week = useMemo(() => (now ? otherDives(hour * 3_600_000, 4000, 168) : []), [hour, now ? 1 : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const sold = state?.sold;
  const market = useMemo(() => othersListings(today * DAY + DAY - 1000, sold ?? []), [today, sold]);
  const a = <A extends unknown[], R>(f: (...args: A) => R) => async (...args: A) => f(...args);
  return {
    mode: "preview", state, now, today, sky, rate, rateYesterday, pool,
    rateOn: rateOf,
    market,
    supply: (listed: [number, number, number]) => simulatedSupply(today, listed),
    feed: otherDives,
    week,
    chainOf,
    dive: a(dive), diveMany: async (teams, supply) => teams.map((t) => dive(t.spire, t.dest, { supply })), turnBack: a(turnBack), commissions, choose: a(choose), collect: a(collect), setTeam: a(setTeam), nameTeam, mint: a(mint), renew: a(renew), sendHome: a(sendHome),
    claim: a(claim), listNft: a(listNft), listMany: a(listMany), unlist: a(unlist), buy: a(buy),
    hurry, reset, skipDay,
  } satisfies Game;
}

function collectInto(st: SimState, d: SimDive) {
  st.credit += d.reward ?? 0;
  st.levyTotal += d.levyPaid ?? 0;
  delete d.pending;
  d.collectedAt = Date.now();
}

/** Reveals one dive: draws the result and spends voyages (docking NFTs that run out). The reward waits for collect(). */
function reveal(st: SimState, d: SimDive, now: number) {
  const r = seeded(d.id * 15485863 + d.at);
  d.result = d.turnedBack ? { outcome: "normal", tier: 254, multX100: 100, wear: 1 } : resolve(d.plan, r(), r());
  if (d.supply === 1) d.result.wear = 1; // lamp oil
  const gross = basePoints(d.plan) * (d.deep ? 2 : 1) * (d.result.multX100 / 100) * rateOf(dayOf(d.at));
  d.levyPaid = gross * d.plan.levy;
  d.reward = gross - d.levyPaid;
  d.pending = true; // the reward waits until the player collects it
  const lines = TEXTS.logs[d.dest] as Record<string, readonly string[]>;
  const pool = lines[d.result.outcome] ?? lines.normal;
  d.log = pickLine(pool, d.id);
  const team = st.teams.find((x) => x.spire === d.spire);
  if (!team) return;
  for (const id of [team.spire, ...(team.prism ? [team.prism] : []), ...team.seekers]) {
    const n = st.nfts.find((x) => x.id === id);
    if (!n) continue;
    n.voyages = Math.max(0, n.voyages - d.result.wear);
    if (n.voyages === 0) n.dockedAt = now;
  }
  // Docked NFTs leave the team; a team with no spire left is dissolved.
  const docked = (id: number) => st.nfts.find((x) => x.id === id)?.dockedAt !== undefined;
  if (docked(team.spire)) { st.teams = st.teams.filter((x) => x !== team); return; }
  const left = (team.prism !== undefined && docked(team.prism)) || team.seekers.some(docked);
  if (team.prism && docked(team.prism)) delete team.prism;
  team.seekers = team.seekers.filter((id) => !docked(id));
  // crew bond: one level more when everyone comes back on board, reset when anyone leaves
  team.bond = left ? 0 : Math.min(BOND_MAX, (team.bond ?? 0) + 1);
}

/** Simulated other observers for the live log: a few dives an hour, the same for everyone in a given hour. */
export function otherDives(now: number, count = 18, hours = 6) {
  const out: { id: string; who: string; dest: number; outcome?: string; mult?: number; at: number; choice?: string }[] = [];
  const hour = Math.floor(now / 3_600_000);
  for (let h = hour; h > hour - hours && out.length < count; h--) {
    const r = seeded(h * 7777);
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const at = h * 3_600_000 + Math.floor(r() * 3_600_000);
      if (at > now) continue;
      const dest = Math.min(23, Math.floor(r() ** 1.8 * 20));
      const plan = planDive({ spire: 60, seekers: [{ power: 400, light: 0 }] }, DESTINATIONS[dest], skyOf(dayOf(at)));
      const res = now - at > 3 * 60_000 ? resolve(plan, r(), r()) : undefined;
      const addr = Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0");
      out.push({ id: `${h}-${i}`, who: `0x${addr.slice(0, 4)}…${addr.slice(4, 8)}`, dest, outcome: res?.outcome, mult: res?.multX100, at, choice: ["steady", "bold", "detour", "none"][Math.floor(r() * 4)] });
    }
  }
  return out.sort((a, b) => b.at - a.at).slice(0, count);
}
