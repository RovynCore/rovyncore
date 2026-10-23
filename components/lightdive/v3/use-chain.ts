"use client";

// The live game: the same interface as the preview (useSim), filled from the v3 contracts and played with the
// player's wallet. Every page works unchanged on either: they read `sim.state` (rebuilt from the chain on every load)
// and call the same actions, which here send transactions. Reads: lib/lightdive-v3/onchain.ts.
//
// v3.3: only summoning, departing and claiming (plus team changes and listings) need the wallet. A dive's result and a
// summon's cards are fixed by their drand round; as soon as drand publishes it they are computed here exactly as the
// contracts will settle them and counted at once (rewards, wear, cards, commissions). The player's next transaction
// carries the signatures and settles them on chain in passing (Expedition3.Settle); nothing waits to be collected.
// Team changes are drafted locally and saved together (one transaction per changed team). A daily commission is chosen
// here and taken on chain together with the next dive.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseError, ContractFunctionRevertedError, UserRejectedRequestError, createPublicClient, createWalletClient, custom, decodeEventLog, formatEther,
  http, maxUint256, parseEther, type Abi, type Address, type Hex, type TransactionReceipt,
} from "viem";
import { usePlatform } from "@/components/platform-context";
import {
  DESTINATIONS, outcomesOf, planDive, planOf, seeded, skyOf, type Beam, type Kind, type Outcome,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { tl } from "@/lib/lightdive-v3/i18n";
import { gameChain } from "@/lib/lightdive-v3/deployment";
import {
  NO_SETTLE, SEALED, decideFeed, drandSignature, knownSignature, predictDive, predictSummon, readFeed, readLedger, readMarket, readOnTeam, readPlayer,
  readRecentSummons, readWeek, readWorld, roundTime, settleOf,
  type Contracts3, type Ctx, type FeedItem, type MarketListing, type Player, type RecentSummon, type Settle, type World,
} from "@/lib/lightdive-v3/onchain";
import type { Listing, Supply } from "./market-data";
import {
  commissionView, stabilityOf, supplyCost, teamInput,
  type Commissions, type DiveOpts, type Game, type MintRequest, type PullRecord, type SimDive, type SimNft, type SimState, type SimTeam,
} from "./sim";
import { commissionsOf, meetsCommission } from "@/lib/lightdive-v3/commissions";
import { NFT_BASE_URI } from "@/lib/lightdive-v3/metadata";
import { firstsBy, firstsOf, historiesOf, outcomeNameOf, voyagesFromLogs, type CardHistory, type First, type LedgerLogs } from "@/lib/lightdive-v3/history";

const NAMES_KEY = "lightdive:v3:team-names";
const PICK_KEY = "lightdive:v3:commission-pick";
const NO_COMMISSION = 255;
const num = (wei: bigint) => Number(formatEther(wei));

export type TxStep = { label: string; address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };
export type TxStepState = { label: string; status: "queued" | "wallet" | "pending" | "done" | "failed"; hash?: Hex };
export type TxState = { steps: TxStepState[]; error: string | null; running: boolean };

/** What only the live game has: the wallet, the faucet, transactions in progress and unsaved team changes. */
export type ChainExtras = {
  account: Address | null;
  ready: boolean; // a deployment is configured
  loaded: boolean;
  failed: boolean;
  wrongChain: boolean;
  testnet: boolean;
  testToken: boolean;
  eth: number | null; // gas balance of the wallet
  chainName: string;
  explorer: string;
  contracts: Contracts3 | null;
  drip: { amount: number; nextAt: number; run: () => Promise<void> } | null;
  saleOpen: boolean;
  prices: number[];
  renewPrices: number[];
  alive: number[];
  maxAlive: number[];
  drafts: number[];
  saveTeams: () => Promise<string | null>;
  discardTeams: () => void;
  /** Results and cards decided by drand that the next transaction will write on chain. */
  unsettled: number;
  tx: TxState | null;
  closeTx: () => void;
  join: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  reload: () => Promise<void>;
  /** Anyone's public profile, read from the chain (null while loading fails). */
  profile: (address: string) => Promise<SimState | null>;
};

/** Player-language reason for a failed transaction (the contract's custom error when there is one). */
const REVERT: Record<string, string> = {
  NoPasses: "noTickets", TeamTired: "teamLimit", Busy: "onBridge", TooWeak: "tooDim", TooManyTeams: "teamCap", BadTeam: "badTeam",
  ERC20InsufficientBalance: "balance", ERC20InsufficientAllowance: "balance", CannotRenew: "cannotRenew", Docked: "docked", CardLocked: "onTeam",
  NotSeller: "notOwned", NotOwner: "notOwned", BadPrice: "price", BadBatch: "batch", DayFull: "dayFull", SaleClosed: "saleClosed", SoldOut: "soldOut",
  EarlyLimit: "earlyLimit", NotListed: "gone", PriceChanged: "priceChanged", NotDue: "notDue", TooSoon: "dripSoon",
  BadQuantity: "batch", EnforcedPause: "paused",
  NotDeep: "notDeep", BadSupply: "badSupply", Taken: "commissionTaken", NoneActive: "commissionNone", Expired: "commissionNone",
  Sealed: "sealed", WrongKind: "sealed", NotPublished: "sealed", BadSignature: "sealed",
};
function reason(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof UserRejectedRequestError)) return "rejected";
    const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    const name = reverted?.data?.errorName;
    if (name && REVERT[name]) return REVERT[name];
    if (/insufficient funds/i.test(error.message)) return "noGas";
  }
  if ((error as { code?: number })?.code === 4001) return "rejected";
  return "chain";
}

/** The story card of a dive: fixed by its id, so every visit shows the same one. */
function cardOf(id: number, dest: number) {
  const cluster = DESTINATIONS[dest].cluster;
  const cards = TEXTS.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.cluster === -1 || c.cluster === cluster);
  return cards[Math.floor(seeded(id * 7919 + 13)() * cards.length)].i;
}

type DivePrediction = { tier: number; multX100: number; wear: number; reward: bigint; levy: bigint };
type CardPrediction = { rarity: number; trait: number; power: number; dna: bigint };
type Predictions = { dives: Map<number, DivePrediction>; summons: Map<number, CardPrediction[]> };
type Loaded = { world: World; player: Player | null; market: MarketListing[]; feed: FeedItem[]; week: FeedItem[]; onTeam: [number, number, number]; summons: RecentSummon[]; histories: Map<number, CardHistory>; firsts: Map<string, First> };
const NO_LOGS = (): LedgerLogs => ({ teamSet: [], disbanded: [], dived: [], details: [], revealed: [] });
const noPredictions = (): Predictions => ({ dives: new Map(), summons: new Map() });

function readNames(): Record<number, string> {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) ?? "{}"); } catch { return {}; }
}

/** Everything of a player's that drand has decided but the chain has not settled: results and summoned cards. Known
 *  ones (in `into`) are not computed again. */
async function predictAll(ctx: Ctx, p: Player, w: World, into: Predictions, now = Date.now()) {
  await Promise.all([
    ...p.dives.filter((d) => !d.revealed && roundTime(d.round) * 1000 <= now && !into.dives.has(Number(d.id))).map(async (d) => {
      const sig = await drandSignature(d.round).catch(() => null);
      if (!sig) return;
      const r = await predictDive(ctx, d, sig, w.chartStability);
      into.dives.set(Number(d.id), { tier: r.tier, multX100: r.multX100, wear: r.wear, reward: r.reward, levy: r.levy });
    }),
    ...p.requests.filter((r) => !r.revealed && roundTime(r.round) * 1000 <= now && !into.summons.has(Number(r.id))).map(async (r) => {
      const sig = await drandSignature(r.round).catch(() => null);
      if (sig) into.summons.set(Number(r.id), predictSummon(r, sig));
    }),
  ]);
}

/** A player's chain data in the preview's shape, with everything drand has decided counted as done. Also used for
 *  anyone's public profile (no drafts, no names). */
function playerState(p: Player, w: World, drafts: Record<number, SimTeam | null>, names: Record<number, string>, pr: Predictions): SimState {
  // cards: a sealed card shows as drand decided it; one whose round is not out yet waits in `mints`
  const sealedCards = new Map<bigint, CardPrediction>();
  for (const r of p.requests) {
    const cards = !r.revealed ? pr.summons.get(Number(r.id)) : undefined;
    cards?.forEach((c, i) => sealedCards.set(r.firstId + BigInt(i), c));
  }
  const nfts: SimNft[] = [];
  for (const x of p.cards) {
    const seen = x.rarity === SEALED ? sealedCards.get(x.id) : x;
    if (!seen) continue;
    nfts.push({
      id: Number(x.id), kind: x.kind as Kind, rarity: seen.rarity, power: seen.power, trait: seen.trait, voyages: x.voyagesLeft, renewed: x.renewed,
      dockedAt: x.dockedAt ? x.dockedAt * 1000 : undefined,
      homeAt: x.homeAt ? x.homeAt * 1000 : undefined,
      soldAt: x.soldAt ? x.soldAt * 1000 : undefined,
      listed: x.listedPrice !== undefined ? num(x.listedPrice) : undefined,
      mint: x.request !== undefined ? Number(x.request) : undefined,
    });
  }
  const card = (id: number) => nfts.find((n) => n.id === id);
  let onChain: SimTeam[] = p.teams.map((t) => ({ spire: Number(t.spire), prism: t.prism ? Number(t.prism) : undefined, seekers: t.seekers.map(Number), bond: t.bond }));

  // results drand has decided, in order: wear and bond as Expedition3._wear will apply them (a team cannot change while
  // its dive is out, so the team now is the team that sailed), and the commission they complete
  let credit = p.credit, levy = p.levyTotal;
  const active = p.commission.active;
  let commission = active ? { ...active } : null;
  let marks = p.commission.marks;
  const completed = new Map<number, { index: number; bonus: number }>();
  for (const d of [...p.dives].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const r = !d.revealed ? pr.dives.get(Number(d.id)) : undefined;
    if (!r) continue;
    credit += r.reward;
    levy += r.levy;
    const at = roundTime(d.round) * 1000;
    const team = onChain.find((t) => t.spire === Number(d.spire));
    if (team) {
      const out = (id: number) => {
        const n = card(id);
        if (!n) return false;
        n.voyages = Math.max(0, n.voyages - r.wear);
        if (n.voyages > 0) return false;
        if (n.renewed) n.homeAt = at; else n.dockedAt = at;
        return true;
      };
      const left = team.seekers.filter(out);
      const prismOut = team.prism !== undefined && out(team.prism);
      if (out(team.spire)) onChain = onChain.filter((t) => t !== team);
      else {
        team.seekers = team.seekers.filter((s) => !left.includes(s));
        if (prismOut) team.prism = undefined;
        team.bond = left.length || prismOut ? 0 : Math.min(w.bondMax, (team.bond ?? 0) + 1);
      }
    }
    // LightdiveCommissions3.settled: the active one, taken the same day before this dive departed, met by it
    if (commission && d.day === commission.day && d.id >= commission.fromDive) {
      const c = commissionsOf(commission.day)[commission.index];
      const outcome = outcomeNameOf(d.dest, d.day, d.beam, d.long, r.tier) as Outcome;
      const view = { dest: d.dest, at: d.day * 86_400_000, bond: d.bond, deep: d.long, supply: d.supply, attuned: d.attuned, result: { outcome, multX100: r.multX100, tier: r.tier } };
      if (meetsCommission(c, view)) {
        const bonus = (d.pointsE2 * d.rate / 100n * BigInt(w.commissionBonusBp)) / 10_000n;
        credit += bonus;
        completed.set(Number(d.id), { index: commission.index, bonus: num(bonus) });
        marks |= 1 << commission.index;
        commission = null;
      }
    }
  }

  let teams = onChain.filter((t) => !(t.spire in drafts));
  // a draft keeps the bond only when it is the same crew
  for (const t of Object.values(drafts)) {
    if (!t) continue;
    const was = onChain.find((x) => x.spire === t.spire);
    teams.push({ ...t, bond: was && was.prism === t.prism && was.seekers.join() === t.seekers.join() ? was.bond : 0 });
  }
  teams = teams.filter((t) => nfts.some((n) => n.id === t.spire && !n.dockedAt && !n.homeAt));
  const dives: SimDive[] = p.dives.map((d) => {
    const id = Number(d.id), dest = d.dest;
    // attunement is not stored on its own: recover it from the recorded points (power + attunement) x weight
    // (a deep dive records twice the points)
    const coefBp = planOf({ power: d.power, bonus: 0, beam: d.beam as Beam }, DESTINATIONS[dest], skyOf(d.day)).coefBp;
    const bonus = Math.max(0, Math.round((Number(d.pointsE2) * 10_000) / coefBp / (d.long ? 2 : 1)) / 100 - d.power);
    const mods = { stability: stabilityOf(d.bond, d.supply, d.echo), deep: d.long };
    const plan = planOf({ power: d.power, bonus, beam: d.beam as Beam }, DESTINATIONS[dest], skyOf(d.day), "none", mods);
    const voyageMs = (d.long ? w.longVoyageSeconds : w.voyageSeconds) * 1000;
    const names = plan.names ?? outcomesOf(plan.table);
    const revealAt = roundTime(d.round) * 1000;
    const settled = d.result;
    const predicted = !d.revealed ? pr.dives.get(id) : undefined;
    const r = settled ?? predicted;
    const outcome = r ? (settled?.fallbackUsed ? "empty" : names[r.tier] ?? "normal") : undefined;
    const lines = TEXTS.logs[dest] as Record<string, readonly string[]>;
    const done = completed.get(id);
    return {
      id, spire: Number(d.spire), dest, at: revealAt - voyageMs, revealAt, plan, card: cardOf(id, dest), rate: num(d.rate),
      deep: d.long, supply: d.supply, bond: d.bond, attuned: d.attuned, ...(d.echo ? { echo: d.echo } : {}),
      result: r && outcome ? { outcome, tier: r.tier, multX100: r.multX100, wear: r.wear } : undefined,
      reward: r ? num(r.reward) : undefined,
      levyPaid: r ? num(r.levy) : undefined,
      ...(predicted ? { unsettled: true } : {}),
      ...(done ? { commission: done } : {}),
      log: r && outcome ? (lines[outcome] ?? lines.normal)[id % (lines[outcome] ?? lines.normal).length] : undefined,
    } as SimDive;
  });
  const open = (r: Player["requests"][number]) => r.revealed || pr.summons.has(Number(r.id));
  const mints: MintRequest[] = p.requests.filter((r) => !open(r)).map((r) => ({
    id: Number(r.id), kind: r.kind as Kind, qty: r.qty, at: (roundTime(r.round) - 6) * 1000, revealAt: roundTime(r.round) * 1000, paid: num(r.paid),
  }));
  const pulls: PullRecord[] = p.requests.filter(open).map((r) => ({
    id: Number(r.id), kind: r.kind as Kind, qty: r.qty, at: (roundTime(r.round) - 6) * 1000, revealAt: roundTime(r.round) * 1000, paid: num(r.paid), cards: r.cards.map(Number),
  }));
  return {
    version: 1,
    nextId: 0,
    balance: num(p.balance),
    credit: num(credit),
    lastClaimAt: p.lastClaimAt * 1000,
    nfts, teams, dives, mints, pulls,
    claimed: num(p.claimed),
    levyTotal: num(levy),
    feesPaid: num(p.claimFees),
    listings: p.cards.filter((x) => x.listedPrice !== undefined).map((x) => ({ nftId: Number(x.id), price: num(x.listedPrice!), at: (x.listedAt ?? 0) * 1000 })),
    sold: [],
    sales: p.sales.map((s) => ({ nftId: Number(s.id), price: num(s.price), at: s.at * 1000 })),
    spent: { mint: num(p.spent.mint), renew: num(p.spent.renew), market: num(p.spent.market) },
    teamNames: names,
    commission: commission ? { day: commission.day, index: commission.index, fromDive: Number(commission.fromDive) } : null,
    commissionMarks: { [w.day]: marks },
    commissionsDone: p.commissionsDone + completed.size,
    echoesGiven: w.echoStability ? p.echoesGiven : undefined,
  };
}

export function useChain(): Game {
  const platform = usePlatform();
  const account = platform.account;
  // the committed deployment for the first render (as on the server); a localhost override after mount
  const [G, setG] = useState(() => gameChain());
  useEffect(() => {
    const g = gameChain(true);
    if (g.deployment !== G.deployment) queueMicrotask(() => setG(g));
  }, [G]);
  const client = useMemo(() => createPublicClient({ chain: G.chain, transport: http(G.rpcUrl), cacheTime: 0 }), [G]);
  const ctx = useMemo<Ctx | null>(() => (G.contracts ? { client: client as never, c: G.contracts, abi: G.abi, fromBlock: BigInt(G.deployment.deploymentBlock), multicall: G.multicall } : null), [G, client]);

  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [walletChain, setWalletChain] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const offset = useRef(0); // chain time minus local time, ms
  const predictions = useRef<Predictions>(noPredictions());
  const ledger = useRef<{ next: bigint; logs: LedgerLogs; seen: Set<string> }>({ next: BigInt(G.deployment.deploymentBlock ?? 0), logs: NO_LOGS(), seen: new Set() });
  const [drafts, setDrafts] = useState<Record<number, SimTeam | null>>({}); // spire -> unsaved team (null = take apart)
  const [names, setNames] = useState<Record<number, string>>({});
  const [pick, setPick] = useState<{ account: string; day: number; index: number } | null>(null); // the commission for the next dive
  const [tx, setTx] = useState<TxState | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      setNames(readNames());
      try { setPick(JSON.parse(localStorage.getItem(PICK_KEY) ?? "null")); } catch { /* none */ }
    });
  }, []);
  const savePick = useCallback((v: { account: string; day: number; index: number } | null) => {
    setPick(v);
    try { localStorage.setItem(PICK_KEY, JSON.stringify(v)); } catch {}
  }, []);

  const load = useCallback(async (): Promise<void> => {
    if (!ctx) return;
    if (inflight.current) { again.current = true; return inflight.current; }
    const run = (async () => {
      try {
        const world = await readWorld(ctx, G.testToken);
        // chain time drives the day and the countdowns; a quiet chain's latest block can be old, so only follow it
        // when it is close to the wall clock (drand itself runs on wall-clock time)
        const skew = world.now * 1000 - Date.now();
        offset.current = Math.abs(skew) < 120_000 ? skew : 0;
        const [player, market, feed, week, onTeam, summons, chainId] = await Promise.all([
          account ? readPlayer(ctx, account, world, G.testToken) : Promise.resolve(null),
          readMarket(ctx),
          readFeed(ctx).then((f) => decideFeed(ctx, f, world)).catch(() => []),
          readWeek(ctx).catch(() => []),
          readOnTeam(ctx).catch(() => [0, 0, 0] as [number, number, number]),
          readRecentSummons(ctx).catch(() => [] as RecentSummon[]),
          account ? platform.walletProvider().request({ method: "eth_chainId" }).then(Number).catch(() => null) : Promise.resolve(null),
        ]);
        // results and cards drand has decided that the chain has not settled yet
        if (player) await predictAll(ctx, player, world, predictions.current);
        // card histories: only the new blocks each time, merged without duplicates
        const led = ledger.current;
        const fresh = await readLedger(ctx, led.next).catch(() => null);
        if (fresh) {
          for (const k of Object.keys(fresh.logs) as (keyof LedgerLogs)[]) {
            for (const e of fresh.logs[k]) {
              const key = `${k}:${e.transactionHash}:${e.logIndex}`;
              if (led.seen.has(key)) continue;
              led.seen.add(key);
              led.logs[k].push(e);
            }
          }
          led.next = fresh.latest + 1n;
        }
        const decided = new Map([...predictions.current.dives].map(([id, r]) => [String(id), r]));
        const histories = historiesOf(voyagesFromLogs(led.logs, decided));
        const firsts = firstsOf(led.logs.dived);
        setData({ world, player, market, feed, week, onTeam, summons, histories, firsts });
        setWalletChain(chainId);
        setFailed(false);
      } catch (e) {
        console.warn("lightdive load", e);
        setFailed(true);
      } finally {
        inflight.current = null;
        if (again.current) { again.current = false; queueMicrotask(() => void load()); }
      }
    })();
    inflight.current = run;
    return run;
  }, [ctx, account, G, platform]);

  // load on start, when the wallet changes, every 20 s, and right after a voyage's or a summon's round is due
  useEffect(() => {
    queueMicrotask(() => void load());
    const t = window.setInterval(() => { if (!document.hidden) void load(); }, 20_000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now() + offset.current), 1000);
    queueMicrotask(() => setNow(Date.now() + offset.current));
    return () => window.clearInterval(t);
  }, []);
  const dueRef = useRef<string[]>([]);
  useEffect(() => {
    const p = data?.player;
    if (!p || !now) return;
    // a round comes out a few seconds after its time; look a little later (and again while drand is slow)
    const due = [
      ...p.dives.filter((d) => !d.revealed && !predictions.current.dives.has(Number(d.id)) && now >= roundTime(d.round) * 1000 + 4000).map((d) => `d${d.id}`),
      ...p.requests.filter((r) => !r.revealed && !predictions.current.summons.has(Number(r.id)) && now >= roundTime(r.round) * 1000 + 3000).map((r) => `s${r.id}`),
    ];
    const fresh = due.filter((id) => !dueRef.current.includes(id));
    if (fresh.length || (due.length && Math.floor(now / 1000) % 5 === 0)) void load();
    dueRef.current = due;
  }, [now, data, load]);

  // ---------------------------------------------------------------- state in the preview's shape

  const today = Math.floor((now || Date.now()) / 86_400_000);
  /** The teams as they are (or will be once the pending results settle), without unsaved changes. */
  const baseTeams = useMemo(() => (data?.player ? playerState(data.player, data.world, {}, {}, predictions.current).teams : []), [data]);
  const state = useMemo<SimState | null>(() => {
    if (!data) return null;
    if (!data.player) {
      return { version: 1, nextId: 1, balance: 0, credit: 0, lastClaimAt: 0, nfts: [], teams: [], dives: [], mints: [], pulls: [], claimed: 0, levyTotal: 0, listings: [], sales: [], spent: { mint: 0, renew: 0, market: 0 }, teamNames: names };
    }
    // predictions are read through the ref; `data` changes whenever one is added
    const st = playerState(data.player, data.world, drafts, names, predictions.current);
    // 今日首航: the player's first arrivals, and which of their dives were first there that day
    const firstIds = new Set([...data.firsts.values()].map((f) => f.id));
    for (const d of st.dives) if (firstIds.has(d.id)) d.first = true;
    return account ? { ...st, firsts: firstsBy(data.firsts, account) } : st;
  }, [data, drafts, names, account]);

  const profile = useCallback(async (address: string): Promise<SimState | null> => {
    if (!ctx || !data || !/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
    try {
      const p = await readPlayer(ctx, address as Address, data.world, G.testToken);
      const pr = noPredictions();
      await predictAll(ctx, p, data.world, pr);
      return { ...playerState(p, data.world, {}, {}, pr), firsts: firstsBy(data.firsts, address) };
    } catch (e) {
      console.warn("lightdive profile", e);
      return null;
    }
  }, [ctx, data, G.testToken]);

  const market = useMemo<Listing[]>(() => (data?.market ?? [])
    .filter((l) => (!account || l.seller.toLowerCase() !== account.toLowerCase()) && l.rarity !== SEALED)
    .map((l) => ({ id: Number(l.id), nftId: Number(l.id), kind: l.kind as Kind, rarity: l.rarity, power: l.power, trait: l.trait, voyages: l.voyagesLeft, renewed: l.renewed, price: num(l.price), seller: l.seller, listedAt: l.listedAt * 1000 })), [data, account]);

  // everyone else's dives (the pages add the player's own from state)
  const toRows = useCallback((list: FeedItem[]) => list.filter((f) => !account || f.owner.toLowerCase() !== account.toLowerCase()).map((f) => {
    return {
      id: String(f.id), who: `${f.owner.slice(0, 6)}…${f.owner.slice(-4)}`, owner: f.owner, dest: f.dest,
      outcome: f.tier !== undefined ? outcomeNameOf(f.dest, f.day, f.beam, !!f.long, f.tier) : undefined, mult: f.multX100,
      at: (roundTime(f.round) - ((f.long ? data?.world.longVoyageSeconds : data?.world.voyageSeconds) ?? 300)) * 1000,
    };
  }).sort((a, b) => b.at - a.at), [data, account]);
  const feedRows = useMemo(() => toRows(data?.feed ?? []), [toRows, data]);
  const weekRows = useMemo(() => toRows(data?.week ?? []), [toRows, data]);

  // ---------------------------------------------------------------- transactions

  const wrongChain = !!account && walletChain !== null && walletChain !== G.chain.id;

  const run = useCallback(async (steps: TxStep[]): Promise<{ receipts: TransactionReceipt[] | null; error: string | null }> => {
    const states: TxStepState[] = steps.map((s) => ({ label: s.label, status: "queued" }));
    const show = (error: string | null, running: boolean) => setTx({ steps: [...states], error, running });
    show(null, true);
    const receipts: TransactionReceipt[] = [];
    let i = 0;
    try {
      const from = account ?? (await platform.connect());
      await platform.switchWalletChain(G.chain);
      const wallet = createWalletClient({ chain: G.chain, transport: custom(platform.walletProvider()) });
      for (; i < steps.length; i++) {
        const s = steps[i];
        states[i] = { ...states[i], status: "wallet" };
        show(null, true);
        const { request } = await client.simulateContract({ account: from, address: s.address, abi: s.abi, functionName: s.functionName, args: s.args ?? [] } as never);
        const gas = await client.estimateContractGas({ account: from, address: s.address, abi: s.abi, functionName: s.functionName, args: s.args ?? [] } as never);
        const hash = await wallet.writeContract({ ...(request as object), account: from, chain: G.chain, gas: (gas * 13n) / 10n } as never);
        states[i] = { ...states[i], status: "pending", hash };
        show(null, true);
        const receipt = await client.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("reverted");
        receipts.push(receipt);
        states[i] = { ...states[i], status: "done" };
      }
      show(null, false);
      window.setTimeout(() => setTx((cur) => (cur && !cur.running && !cur.error ? null : cur)), 1200);
      await load();
      return { receipts, error: null };
    } catch (error) {
      console.warn("lightdive transaction", steps[i]?.functionName, error);
      const key = reason(error);
      states[Math.min(i, steps.length - 1)] = { ...states[Math.min(i, steps.length - 1)], status: "failed" };
      show(key, false);
      void load();
      return { receipts: null, error: key };
    }
  }, [account, platform, G, client, load]);

  const c = G.contracts;
  const A = G.abi;
  const p = data?.player ?? null;
  const step = (label: string, address: Address, abi: Abi, functionName: string, args?: readonly unknown[]): TxStep => ({ label, address, abi, functionName, args });
  const logArgs = (receipts: TransactionReceipt[], abi: Abi, eventName: string) => receipts.flatMap((r) => r.logs.flatMap((log) => {
    try {
      const d = decodeEventLog({ abi, data: log.data, topics: log.topics }) as unknown as { eventName: string; args: Record<string, unknown> };
      return d.eventName === eventName ? [d.args] : [];
    } catch { return []; }
  }));
  /** An approval step when the allowance does not cover `cost` (one approval for all later payments). */
  const pay = (spender: Address, allowance: bigint, cost: bigint, label: string): TxStep[] =>
    allowance >= cost ? [] : [step(label, c!.rvyn, A.TestRVYN, "approve", [spender, maxUint256])];
  const ready = (): string | null => {
    if (!c) return "notDeployed";
    if (!account) return "connect";
    if (p && p.eth === 0n) return "noGas";
    return null;
  };
  /** The reveals the player's next transaction carries: every result and summon drand has decided, not yet settled. */
  const pending = (): Settle => (p ? settleOf(p, knownSignature) : NO_SETTLE);
  const unsettled = p ? (() => { const s = pending(); return s.dives.length + s.summons.length; })() : 0;
  /** A transaction of its own that only settles (when the next step cannot carry the reveals itself). */
  const settleStep = (s: Settle): TxStep[] => (s.dives.length || s.summons.length ? [step(tl("寫入航行結果"), c!.expedition, A.Expedition3, "settle", [s])] : []);

  const mint = useCallback(async (kind: Kind, qty: number) => {
    const e = ready();
    if (e) return { error: e };
    const w = data!.world;
    if (!w.saleStart || w.now < w.saleStart) return { error: "saleClosed" };
    const cost = w.price[kind] * BigInt(qty);
    if (p!.balance < cost) return { error: "balance" };
    const s = pending();
    const { receipts, error } = await run([
      ...pay(c!.minter, p!.minterAllowance, cost, tl("允許召喚使用 $RVYN")),
      step(tl("付款召喚"), c!.minter, A.LightdiveMinter3, "summon", [kind, qty, s.summons, s.summonProofs]),
    ]);
    if (!receipts) return { error };
    // the cards exist at once, sealed; drand decides them a few seconds later and the page shows them then
    const req = logArgs(receipts, A.LightdiveMinter3, "SummonRequested")[0];
    return { error: null, id: Number(req?.requestId) };
  }, [data, p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Every unsaved team change as transactions: teams taken apart first, so cards moving between teams are free when
   *  the team they join is set. The first team set carries the pending reveals; taking apart a team whose last result
   *  is not settled needs them first, in a step of its own. */
  const draftSteps = (s: Settle): { steps: TxStep[]; carried: boolean } => {
    const entries = Object.entries(drafts);
    const order = [...entries.filter(([, t]) => !t), ...entries.filter(([, t]) => t)];
    const busy = new Set(p?.dives.filter((d) => !d.revealed).map((d) => Number(d.spire)) ?? []);
    const pre = order.some(([spire, t]) => !t && busy.has(Number(spire))) ? settleStep(s) : [];
    let carried = pre.length > 0;
    const steps = order.map(([spire, t]) => {
      if (!t) return step(tl("解散隊伍 光塔 #{0}", { 0: spire }), c!.expedition, A.Expedition3, "disband", [BigInt(spire)]);
      const settle = carried ? NO_SETTLE : s;
      carried = true;
      return step(tl("儲存隊伍 光塔 #{0}", { 0: spire }), c!.expedition, A.Expedition3, "setTeam", [BigInt(spire), BigInt(t.prism ?? 0), t.seekers.map(BigInt), settle]);
    });
    return { steps: [...pre, ...steps], carried };
  };

  /** The RVYN a supply costs for one team's dive (paid into the pool on departure). */
  const supplyWei = (spire: number, dest: number, supply: number, deep?: boolean) => {
    const st = state!;
    const team = st.teams.find((t) => t.spire === spire);
    if (!supply || !team) return 0n;
    const plan = planDive(teamInput(st, team), DESTINATIONS[dest], skyOf(today), "none", { stability: stabilityOf(team.bond, supply), deep });
    return parseEther(supplyCost(plan, deep, num(data!.world.rate), supply).toFixed(6));
  };
  /** One approval when the pool allowance does not cover the supplies (10% headroom for the day's rounding). */
  const supplySteps = (cost: bigint): TxStep[] | string =>
    cost === 0n ? [] : p!.balance < cost ? "balance" : pay(c!.pool, p!.poolAllowance, cost + cost / 10n, tl("允許補給使用 $RVYN"));

  // 每日委託: chosen here, taken on chain with the next dive (or already active on chain)
  const C3 = A.LightdiveCommissions3;
  const chainActive = state?.commission && state.commission.day === today ? state.commission : null;
  const marks = state?.commissionMarks?.[today] ?? 0;
  const picked = !chainActive && pick && account && pick.account === account.toLowerCase() && pick.day === today && !(marks & ((1 << pick.index) | (1 << (pick.index + 8)))) ? pick.index : null;
  /** The commission index a dive takes with it (NO_COMMISSION: none). */
  const carry = () => (picked ?? NO_COMMISSION);

  const dive = useCallback(async (spire: number, dest: number, opts: DiveOpts = {}) => {
    const e = ready();
    if (e) return { error: e };
    const st = state!;
    const team = st.teams.find((t) => t.spire === spire);
    const uses = opts.deep ? 2 : 1;
    if (!team || !team.seekers.length) return { error: "noTeam" };
    if (opts.deep && DESTINATIONS[dest].cluster < data!.world.longMinCluster) return { error: "notDeep" };
    if (p!.passesUsed + uses > 3) return { error: "noTickets" };
    if ((p!.teams.find((t) => Number(t.spire) === spire)?.divesToday ?? 0) + uses > 3) return { error: "teamLimit" };
    if (st.dives.some((d) => d.spire === spire && !d.result)) return { error: "onBridge" };
    // unsaved team changes are saved in the same go, right before the team departs; the reveals ride along
    const s = pending();
    const save = draftSteps(s);
    const supply = opts.supply ?? 0;
    const approve = supplySteps(supplyWei(spire, dest, supply, opts.deep));
    if (typeof approve === "string") return { error: approve };
    const label = opts.deep ? tl("派隊伍深潛") : tl("派隊伍出發");
    const { receipts, error } = await run([...save.steps, ...approve, step(label, c!.expedition, A.Expedition3, "dive", [BigInt(spire), dest, supply, !!opts.deep, carry(), save.carried ? NO_SETTLE : s])]);
    if (!receipts) return { error };
    if (save.steps.length) setDrafts({});
    if (picked !== null) savePick(null);
    const id = Number(logArgs(receipts, A.Expedition3, "Dived")[0]?.diveId);
    return { error: null, id, card: cardOf(id, dest) };
  }, [state, data, p, c, A, run, drafts, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const diveMany = useCallback(async (list: { spire: number; dest: number }[], supply = 0) => {
    const e = ready();
    if (e) return list.map(() => ({ error: e }));
    const st = state!;
    const blocked = (spire: number) =>
      !st.teams.find((t) => t.spire === spire)?.seekers.length ? "noTeam"
        : st.dives.some((d) => d.spire === spire && !d.result) ? "onBridge" : null;
    const errors = list.map((t) => blocked(t.spire));
    const go = list.filter((_, i) => !errors[i]);
    if (go.length > 3 - p!.passesUsed) return list.map(() => ({ error: "noTickets" }));
    if (!go.length) return errors.map((error) => ({ error }));
    const s = pending();
    const saves = draftSteps(s);
    const approve = supplySteps(go.reduce((a, t) => a + supplyWei(t.spire, t.dest, supply), 0n));
    if (typeof approve === "string") return list.map(() => ({ error: approve }));
    const { receipts, error } = await run([...saves.steps, ...approve, step(tl("一次派遣 {0} 支隊伍", { 0: go.length }), c!.expedition, A.Expedition3, "diveMany", [go.map((t) => BigInt(t.spire)), go.map((t) => t.dest), supply, carry(), saves.carried ? NO_SETTLE : s])]);
    if (receipts && saves.steps.length) setDrafts({});
    if (receipts && picked !== null) savePick(null);
    const ids = receipts ? logArgs(receipts, A.Expedition3, "Dived").map((x) => Number(x.diveId)) : [];
    let k = 0;
    return list.map((t, i) => {
      if (errors[i]) return { error: errors[i] };
      if (!receipts) return { error };
      const id = ids[k++];
      return { error: null, id, card: cardOf(id, t.dest) };
    });
  }, [state, p, c, A, run, drafts, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  const commissions: Commissions = {
    ...commissionView(chainActive ?? (picked !== null ? { index: picked } : null), marks, today),
    queued: picked !== null,
    bonus: (data?.world.commissionBonusBp ?? 1000) / 10_000,
    accept: async (index) => {
      const e = ready();
      if (e) return e;
      if (chainActive) return "commissionActive";
      if (marks & ((1 << index) | (1 << (index + 8)))) return "commissionTaken";
      savePick({ account: account!.toLowerCase(), day: today, index });
      return null;
    },
    abandon: async () => {
      if (picked !== null) { savePick(null); return; }
      if (!ready() && chainActive) await run([step(tl("放棄委託"), c!.commissions, C3, "abandon")]);
    },
  };

  const claim = useCallback(async () => {
    if (ready() || !p || !state || state.credit <= 0) return;
    await run([step(tl("領取到錢包"), c!.expedition, A.Expedition3, "claim", [pending()])]);
  }, [p, state, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const renew = useCallback(async (id: number) => {
    const e = ready();
    if (e) return e;
    const card = state?.nfts.find((x) => x.id === id);
    if (!card || card.dockedAt === undefined || card.renewed) return "cannotRenew";
    const cost = data!.world.renewPrice[card.kind];
    if (p!.balance < cost) return "balance";
    // docked by a result not settled yet: settle it first
    const onChain = p!.cards.find((x) => Number(x.id) === id);
    const { error } = await run([
      ...(onChain?.dockedAt ? [] : settleStep(pending())),
      ...pay(c!.minter, p!.minterAllowance, cost, tl("允許續航使用 $RVYN")),
      step(tl("續航"), c!.minter, A.LightdiveMinter3, "renew", [BigInt(id)]),
    ]);
    return error;
  }, [state, p, data, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendHome = useCallback(async (id: number) => {
    if (ready()) return;
    const card = state?.nfts.find((x) => x.id === id);
    if (!card?.dockedAt || (now || Date.now()) < card.dockedAt + 7 * 86_400_000) { setTx({ steps: [], error: "notDue", running: false }); return; }
    const onChain = p?.cards.find((x) => Number(x.id) === id);
    await run([...(onChain?.dockedAt ? [] : settleStep(pending())), step(tl("歸航"), c!.expedition, A.Expedition3, "sendHome", [BigInt(id)])]);
  }, [state, p, now, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const approveCards = (): TxStep[] => (p?.marketApproved ? [] : [step(tl("允許市集保管上架的卡"), c!.nft, A.LightdiveNFT3, "setApprovalForAll", [c!.market, true])]);
  const listNft = useCallback(async (id: number, price: number) => {
    const e = ready();
    if (e) return e;
    if (!(price > 0)) return "price";
    const s = pending();
    const { error } = await run([...approveCards(), step(tl("上架"), c!.market, A.LightdiveMarket3, "list", [BigInt(id), parseEther(String(Math.round(price * 100) / 100)), s.summons, s.summonProofs])]);
    return error;
  }, [p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const listMany = useCallback(async (items: { id: number; price: number }[]) => {
    const e = ready();
    if (e) return e;
    if (!items.length || items.length > 20) return "batch";
    if (items.some((x) => !(x.price > 0))) return "price";
    const s = pending();
    const { error } = await run([...approveCards(), step(tl("一次上架 {0} 張", { 0: items.length }), c!.market, A.LightdiveMarket3, "listMany", [
      items.map((x) => BigInt(x.id)), items.map((x) => parseEther(String(Math.round(x.price * 100) / 100))), s.summons, s.summonProofs,
    ])]);
    return error;
  }, [p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const unlist = useCallback(async (id: number) => {
    if (ready()) return;
    await run([step(tl("取消上架"), c!.market, A.LightdiveMarket3, "cancel", [BigInt(id)])]);
  }, [c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const buy = useCallback(async (l: Listing) => {
    const e = ready();
    if (e) return { error: e };
    const price = parseEther(String(l.price));
    if (p!.balance < price) return { error: "balance" };
    const { error } = await run([
      ...pay(c!.market, p!.marketAllowance, price, tl("允許市集使用 $RVYN")),
      step(tl("購買 #{0}", { 0: l.id }), c!.market, A.LightdiveMarket3, "buy", [BigInt(l.id), price]),
    ]);
    return error ? { error } : { error: null, id: l.id };
  }, [p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Team changes stay a local draft until saved (each changed team is one transaction). */
  const setTeam = useCallback(async (t: SimTeam) => {
    const st = state;
    if (!st) return "chain";
    const others = st.teams.filter((x) => x.spire !== t.spire);
    const keep = t.seekers.length > 0 || t.prism !== undefined;
    if (keep && others.length >= 5) return "teamCap";
    if (st.dives.some((d) => d.spire === t.spire && !d.result)) return "onBridge";
    const onChain = baseTeams.find((x) => x.spire === t.spire);
    const same = onChain && (onChain.prism ?? 0) === (t.prism ?? 0) && onChain.seekers.length === t.seekers.length && onChain.seekers.every((s, i) => s === t.seekers[i]);
    setDrafts((d) => {
      const next = { ...d };
      if ((!keep && !onChain) || same) delete next[t.spire];
      else next[t.spire] = keep ? t : null;
      return next;
    });
    return null;
  }, [state, baseTeams]);
  const saveTeams = useCallback(async () => {
    if (ready()) return ready();
    if (Object.values(drafts).some((t) => t && !t.seekers.length)) return "needSeeker";
    const { error } = await run(draftSteps(pending()).steps);
    if (!error) setDrafts({});
    return error;
  }, [drafts, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const nameTeam = useCallback((spire: number, name: string) => {
    setNames((cur) => {
      const v = name.trim().slice(0, 12);
      const next = { ...cur };
      if (v) next[spire] = v; else delete next[spire];
      try { localStorage.setItem(NAMES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const drip = useCallback(async () => {
    if (!c || !G.testToken) return;
    await run([step(tl("領取測試 $RVYN"), c.rvyn, A.TestRVYN, "drip")]);
  }, [c, G, A, run]);
  const join = useCallback(async () => {
    try { await platform.connect(); await platform.switchWalletChain(G.chain); } catch { /* the wallet dialog shows why */ }
    void load();
  }, [platform, G, load]);
  const switchNetwork = useCallback(async () => {
    try { await platform.switchWalletChain(G.chain); } catch { /* declined */ }
    void load();
  }, [platform, G, load]);

  const w = data?.world;
  const supply = useCallback((listed: [number, number, number]) => [0, 1, 2].map((k) => ({
    alive: w?.alive[k] ?? 0, onTeam: data?.onTeam[k] ?? 0, listed: listed[k],
  })) as [Supply, Supply, Supply], [w, data]);

  return {
    mode: "chain",
    state,
    now: now || Date.now(),
    today,
    sky: skyOf(today),
    rate: w ? num(w.rate) : 0,
    rateYesterday: w ? num(w.rateYesterday) : 0,
    pool: w ? num(w.poolBalance) : 0,
    rateOn: (day: number) => {
      const d = state?.dives.find((x) => Math.floor(x.at / 86_400_000) === day);
      const raw = d ? data?.player?.dives.find((x) => Number(x.id) === d.id)?.rate : undefined;
      return raw !== undefined ? num(raw) : w ? num(w.rate) : 0;
    },
    market,
    supply,
    feed: (_now: number, count = 18) => feedRows.slice(0, count),
    week: weekRows,
    summons: (data?.summons ?? []).map((x) => ({ id: Number(x.id), who: account && x.who.toLowerCase() === account.toLowerCase() ? tl("你") : `${x.who.slice(0, 6)}…${x.who.slice(-4)}`, owner: account && x.who.toLowerCase() === account.toLowerCase() ? undefined : x.who, kind: x.kind as Kind, rarity: x.rarity, at: x.at * 1000 })),
    chainOf: (n) => {
      const raw = data?.player?.cards.find((x) => Number(x.id) === n.id);
      const sealed = raw?.rarity === SEALED;
      const req = sealed ? data?.player?.requests.find((r) => raw!.id >= r.firstId && raw!.id < r.firstId + BigInt(r.qty)) : undefined;
      const dna = sealed && req ? predictions.current.summons.get(Number(req.id))?.[Number(raw!.id - req.firstId)]?.dna : raw?.dna;
      return {
        tokenId: n.id,
        contract: c?.nft ?? "",
        owner: account ?? "",
        standard: "ERC-721（RVDIV）",
        chain: `${G.chain.name}（${G.chain.id}）`,
        mintBlock: raw?.mintBlock !== undefined ? Number(raw.mintBlock) : null,
        mintTx: raw?.mintTx ?? null,
        dna: dna !== undefined ? `0x${dna.toString(16).padStart(16, "0")}` : null,
        deck: null,
        tokenUri: `${NFT_BASE_URI}${n.id}`,
        royalty: "5%（ERC-2981）",
        explorer: G.explorer && c ? `${G.explorer}/token/${c.nft}/instance/${n.id}` : null,
      };
    },
    history: (id: number) => data?.histories.get(id) ?? null,
    first: (dest: number) => {
      const f = data?.firsts.get(`${today}:${dest}`);
      if (!f) return null;
      const me = !!account && f.owner === account.toLowerCase();
      return { who: me ? tl("你") : `${f.owner.slice(0, 6)}…${f.owner.slice(-4)}`, owner: me ? undefined : f.owner, me };
    },
    bridge: (dest: number) => {
      const w = data?.world;
      const last = w?.bridges[dest];
      return w && w.echoStability && last && (!account || last !== account.toLowerCase()) ? w.echoStability : 0;
    },
    dive, diveMany, commissions, setTeam, nameTeam, mint, renew, sendHome, claim, listNft, listMany, unlist, buy,
    chain: {
      account,
      ready: !!c,
      loaded: !!data,
      failed,
      wrongChain,
      testnet: G.testnet,
      testToken: G.testToken,
      eth: p ? num(p.eth) : null,
      chainName: G.chain.name,
      explorer: G.explorer,
      contracts: c,
      drip: G.testToken ? { amount: w?.dripAmount ? num(w.dripAmount) : 0, nextAt: p?.nextDripAt ? p.nextDripAt * 1000 : 0, run: drip } : null,
      saleOpen: !!w && w.saleStart > 0 && w.now >= w.saleStart,
      prices: w ? w.price.map(num) : [0, 0, 0],
      renewPrices: w ? w.renewPrice.map(num) : [0, 0, 0],
      alive: w?.alive ?? [0, 0, 0],
      maxAlive: w?.maxAlive ?? [0, 0, 0],
      drafts: Object.keys(drafts).map(Number),
      saveTeams,
      discardTeams: () => setDrafts({}),
      unsettled,
      tx,
      closeTx: () => setTx(null),
      join,
      switchNetwork,
      reload: load,
      profile,
    },
  };
}
