"use client";

// The live game: the same interface as the preview (useSim), filled from the v3 contracts and played with the
// player's wallet. Every page works unchanged on either: they read `sim.state` (rebuilt from the chain on every load)
// and call the same actions, which here send transactions. Reads: lib/lightdive-v3/onchain.ts.
//
// A dive's result is decided by its drand round. As soon as drand publishes it, the result is computed here exactly as
// the contract will settle it and shown as "waiting to be collected"; collecting sends the reveal transaction that
// credits it. A summon is paid first, then opened with its drand round (a second transaction, sent automatically).
// Team changes are drafted locally and saved together (one transaction per changed team).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BaseError, ContractFunctionRevertedError, UserRejectedRequestError, createPublicClient, createWalletClient, custom, decodeEventLog, formatEther,
  http, maxUint256, parseEther, type Abi, type Address, type Hex, type TransactionReceipt,
} from "viem";
import { usePlatform } from "@/components/platform-context";
import {
  DESTINATIONS, baseTable, outcomesOf, planOf, seeded, skyOf, type Beam, type Choice, type Kind,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { tl } from "@/lib/lightdive-v3/i18n";
import { gameChain } from "@/lib/lightdive-v3/deployment";
import {
  drandSignature, predictDive, readFeed, readMarket, readOnTeam, readPlayer, readRecentSummons, readWorld, roundTime,
  type Contracts3, type Ctx, type FeedItem, type MarketListing, type Player, type RecentSummon, type World,
} from "@/lib/lightdive-v3/onchain";
import type { Listing, Supply } from "./market-data";
import type { Game, MintRequest, PullRecord, SimDive, SimNft, SimState, SimTeam } from "./sim";

const CHOICES: Choice[] = ["none", "steady", "bold", "detour"];
const NAMES_KEY = "lightdive:v3:team-names";
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
  openSummons: (ids?: number[]) => Promise<void>;
  tx: TxState | null;
  closeTx: () => void;
  join: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  reload: () => Promise<void>;
};

/** Player-language reason for a failed transaction (the contract's custom error when there is one). */
const REVERT: Record<string, string> = {
  NoPasses: "noTickets", TeamTired: "teamLimit", Busy: "onBridge", TooWeak: "tooDim", TooManyTeams: "teamCap", BadTeam: "badTeam",
  ERC20InsufficientBalance: "balance", ERC20InsufficientAllowance: "balance", CannotRenew: "cannotRenew", Docked: "docked", CardLocked: "onTeam",
  NotSeller: "notOwned", NotOwner: "notOwned", BadPrice: "price", BadBatch: "batch", DayFull: "dayFull", SaleClosed: "saleClosed", SoldOut: "soldOut",
  EarlyLimit: "earlyLimit", DecisionClosed: "decisionClosed", NotListed: "gone", PriceChanged: "priceChanged", NotDue: "notDue", TooSoon: "dripSoon",
  BadQuantity: "batch", EnforcedPause: "paused",
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

/** The decision card of a dive: fixed by its id, so every visit shows the same one. */
function cardOf(id: number, dest: number) {
  const cluster = DESTINATIONS[dest].cluster;
  const cards = TEXTS.cards.map((c, i) => ({ c, i })).filter(({ c }) => c.cluster === -1 || c.cluster === cluster);
  return cards[Math.floor(seeded(id * 7919 + 13)() * cards.length)].i;
}
const riskOf = (beam: number, dest: number, day: number) => {
  const ev = skyOf(day).events.get(dest);
  return Math.max(0, Math.min(2, beam + (ev === "storm" ? 1 : ev === "calm" ? -1 : 0))) as Beam;
};

type Prediction = { tier: number; multX100: number; wear: number; reward: bigint; levy: bigint; signature: Hex };
type Loaded = { world: World; player: Player | null; market: MarketListing[]; feed: FeedItem[]; onTeam: [number, number, number]; summons: RecentSummon[] };

function readNames(): Record<number, string> {
  try { return JSON.parse(localStorage.getItem(NAMES_KEY) ?? "{}"); } catch { return {}; }
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
  const predictions = useRef(new Map<number, Prediction>());
  const [drafts, setDrafts] = useState<Record<number, SimTeam | null>>({}); // spire -> unsaved team (null = take apart)
  const [names, setNames] = useState<Record<number, string>>({});
  const [tx, setTx] = useState<TxState | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  useEffect(() => { queueMicrotask(() => setNames(readNames())); }, []);

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
        const [player, market, feed, onTeam, summons, chainId] = await Promise.all([
          account ? readPlayer(ctx, account, world, G.testToken) : Promise.resolve(null),
          readMarket(ctx),
          readFeed(ctx).catch(() => []),
          readOnTeam(ctx).catch(() => [0, 0, 0] as [number, number, number]),
          readRecentSummons(ctx).catch(() => [] as RecentSummon[]),
          account ? platform.walletProvider().request({ method: "eth_chainId" }).then(Number).catch(() => null) : Promise.resolve(null),
        ]);
        // results already decided by drand but not collected yet
        if (player) {
          const due = player.dives.filter((d) => !d.revealed && roundTime(d.round) * 1000 <= Date.now() && !predictions.current.has(Number(d.id)));
          await Promise.all(due.map(async (d) => {
            const sig = await drandSignature(d.round).catch(() => null);
            if (!sig) return;
            const p = await predictDive(ctx, d, sig);
            predictions.current.set(Number(d.id), { tier: p.tier, multX100: p.multX100, wear: p.wear, reward: p.reward, levy: p.levy, signature: sig });
          }));
        }
        setData({ world, player, market, feed, onTeam, summons });
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

  // load on start, when the wallet changes, every 20 s, and right after a voyage's round is due
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
  const dueRef = useRef<number[]>([]);
  useEffect(() => {
    const p = data?.player;
    if (!p || !now) return;
    // a round comes out a few seconds after its time; look a little later
    const due = p.dives.filter((d) => !d.revealed && !predictions.current.has(Number(d.id)) && now >= roundTime(d.round) * 1000 + 4000).map((d) => Number(d.id));
    const fresh = due.filter((id) => !dueRef.current.includes(id));
    dueRef.current = due;
    if (fresh.length) void load();
  }, [now, data, load]);

  // ---------------------------------------------------------------- state in the preview's shape

  const today = Math.floor((now || Date.now()) / 86_400_000);
  const state = useMemo<SimState | null>(() => {
    if (!data) return null;
    const p = data.player;
    const w = data.world;
    if (!p) {
      return { version: 1, nextId: 1, balance: 0, credit: 0, lastClaimAt: 0, nfts: [], teams: [], dives: [], mints: [], pulls: [], claimed: 0, levyTotal: 0, listings: [], sales: [], spent: { mint: 0, renew: 0, market: 0 }, teamNames: names };
    }
    const nfts: SimNft[] = p.cards.map((x) => ({
      id: Number(x.id), kind: x.kind as Kind, rarity: x.rarity, power: x.power, trait: x.trait, voyages: x.voyagesLeft, renewed: x.renewed,
      dockedAt: x.dockedAt ? x.dockedAt * 1000 : undefined,
      homeAt: x.homeAt ? x.homeAt * 1000 : undefined,
      soldAt: x.soldAt ? x.soldAt * 1000 : undefined,
      listed: x.listedPrice !== undefined ? num(x.listedPrice) : undefined,
      mint: x.request !== undefined ? Number(x.request) : undefined,
    }));
    const onChain: SimTeam[] = p.teams.map((t) => ({ spire: Number(t.spire), prism: t.prism ? Number(t.prism) : undefined, seekers: t.seekers.map(Number) }));
    let teams = onChain.filter((t) => !(t.spire in drafts));
    for (const t of Object.values(drafts)) if (t) teams.push(t);
    teams = teams.filter((t) => nfts.some((n) => n.id === t.spire));
    const voyageMs = w.voyageSeconds * 1000;
    const dives: SimDive[] = p.dives.map((d) => {
      const id = Number(d.id), dest = d.dest;
      const choice = d.decision ? CHOICES[d.decision] : undefined;
      // attunement is not stored on its own: recover it from the recorded points (power + attunement) x weight
      const coefBp = planOf({ power: d.power, bonus: 0, beam: d.beam as Beam }, DESTINATIONS[dest], skyOf(d.day)).coefBp;
      const bonus = Math.max(0, Math.round((Number(d.pointsE2) * 10_000) / coefBp) / 100 - d.power);
      const plan = planOf({ power: d.power, bonus, beam: d.beam as Beam }, DESTINATIONS[dest], skyOf(d.day), choice ?? "none");
      const names = plan.names ?? outcomesOf(plan.table);
      const revealAt = roundTime(d.round) * 1000;
      const settled = d.result;
      const predicted = predictions.current.get(id);
      const r = settled ?? predicted;
      const outcome = r ? (settled?.fallbackUsed ? "normal" : names[r.tier] ?? "normal") : undefined;
      const lines = TEXTS.logs[dest] as Record<string, readonly string[]>;
      return {
        id, spire: Number(d.spire), dest, at: revealAt - voyageMs, revealAt, plan, card: cardOf(id, dest), choice, rate: num(d.rate),
        result: r && outcome ? { outcome, tier: r.tier, multX100: r.multX100, wear: r.wear } : undefined,
        reward: r ? num(r.reward) : undefined,
        levyPaid: r ? num(r.levy) : undefined,
        pending: !d.revealed && !!predicted ? true : undefined,
        collectedAt: d.revealed ? revealAt : undefined,
        log: r && outcome ? (lines[outcome] ?? lines.normal)[id % (lines[outcome] ?? lines.normal).length] : undefined,
      };
    });
    const mints: MintRequest[] = p.requests.filter((r) => !r.revealed).map((r) => ({
      id: Number(r.id), kind: r.kind as Kind, qty: r.qty, at: (roundTime(r.round) - 6) * 1000, revealAt: roundTime(r.round) * 1000, paid: num(r.paid),
    }));
    const pulls: PullRecord[] = p.requests.filter((r) => r.revealed).map((r) => ({
      id: Number(r.id), kind: r.kind as Kind, qty: r.qty, at: (roundTime(r.round) - 6) * 1000, revealAt: roundTime(r.round) * 1000, paid: num(r.paid), cards: r.cards.map(Number),
    }));
    return {
      version: 1,
      nextId: 0,
      balance: num(p.balance),
      credit: num(p.credit),
      lastClaimAt: p.lastClaimAt * 1000,
      nfts, teams, dives, mints, pulls,
      claimed: num(p.claimed),
      levyTotal: num(p.levyTotal),
      feesPaid: num(p.claimFees),
      listings: p.cards.filter((x) => x.listedPrice !== undefined).map((x) => ({ nftId: Number(x.id), price: num(x.listedPrice!), at: (x.listedAt ?? 0) * 1000 })),
      sold: [],
      sales: p.sales.map((s) => ({ nftId: Number(s.id), price: num(s.price), at: s.at * 1000 })),
      spent: { mint: num(p.spent.mint), renew: num(p.spent.renew), market: num(p.spent.market) },
      teamNames: names,
    };
    // predictions are read through the ref; `data` changes whenever one is added
  }, [data, drafts, names]);

  const market = useMemo<Listing[]>(() => (data?.market ?? [])
    .filter((l) => !account || l.seller.toLowerCase() !== account.toLowerCase())
    .map((l) => ({ id: Number(l.id), nftId: Number(l.id), kind: l.kind as Kind, rarity: l.rarity, power: l.power, trait: l.trait, voyages: l.voyagesLeft, renewed: l.renewed, price: num(l.price), seller: l.seller, listedAt: l.listedAt * 1000 })), [data, account]);

  // everyone else's dives (the pages add the player's own from state)
  const feedRows = useMemo(() => (data?.feed ?? []).filter((f) => !account || f.owner.toLowerCase() !== account.toLowerCase()).map((f) => {
    const names = outcomesOf(baseTable(DESTINATIONS[f.dest].cluster, riskOf(f.beam, f.dest, f.day)));
    return {
      id: String(f.id), who: `${f.owner.slice(0, 6)}…${f.owner.slice(-4)}`, dest: f.dest,
      outcome: f.tier !== undefined ? names[f.tier] ?? "normal" : undefined, mult: f.multX100,
      at: (roundTime(f.round) - (data?.world.voyageSeconds ?? 300)) * 1000,
      choice: f.decision !== undefined ? CHOICES[f.decision] : "none",
    };
  }).sort((a, b) => b.at - a.at), [data, account]);

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

  const revealing = useRef(new Set<number>());
  /** Opens summons whose drand round is out (anyone may; the player's wallet does it here). */
  const openSummons = useCallback(async (ids?: number[]) => {
    if (!c || !p) return;
    const open = p.requests.filter((r) => !r.revealed && (!ids || ids.includes(Number(r.id))) && !revealing.current.has(Number(r.id)));
    for (const r of open) {
      revealing.current.add(Number(r.id));
      try {
        let sig: Hex | null = null;
        for (let tries = 0; !sig && tries < 40; tries++) {
          sig = Date.now() >= roundTime(r.round) * 1000 ? await drandSignature(r.round).catch(() => null) : null;
          if (!sig) await new Promise((res) => setTimeout(res, 1500));
        }
        if (sig) await run([step(tl("開啟召喚陣"), c.minter, A.LightdiveMinter3, "reveal", [r.id, sig])]);
      } finally {
        revealing.current.delete(Number(r.id));
      }
    }
  }, [c, p, A, run]);

  const mint = useCallback(async (kind: Kind, qty: number) => {
    const e = ready();
    if (e) return { error: e };
    const w = data!.world;
    if (!w.saleStart || w.now < w.saleStart) return { error: "saleClosed" };
    const cost = w.price[kind] * BigInt(qty);
    if (p!.balance < cost) return { error: "balance" };
    const { receipts, error } = await run([
      ...pay(c!.minter, p!.minterAllowance, cost, tl("允許召喚使用 $RVYN")),
      step(tl("付款召喚"), c!.minter, A.LightdiveMinter3, "summon", [kind, qty]),
    ]);
    if (!receipts) return { error };
    const req = logArgs(receipts, A.LightdiveMinter3, "SummonRequested")[0];
    const id = Number(req?.requestId);
    // open it as soon as drand publishes its round (a few seconds)
    void (async () => {
      const round = BigInt(req.round as bigint);
      let sig: Hex | null = null;
      for (let tries = 0; !sig && tries < 40; tries++) {
        sig = Date.now() >= roundTime(round) * 1000 ? await drandSignature(round).catch(() => null) : null;
        if (!sig) await new Promise((res) => setTimeout(res, 1500));
      }
      if (sig) await run([step(tl("開啟召喚陣"), c!.minter, A.LightdiveMinter3, "reveal", [BigInt(id), sig])]);
    })();
    return { error: null, id };
  }, [data, p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Every unsaved team change as transactions: teams taken apart first, so cards moving between teams are free when
   *  the team they join is set. */
  const draftSteps = (): TxStep[] => {
    const entries = Object.entries(drafts);
    const order = [...entries.filter(([, t]) => !t), ...entries.filter(([, t]) => t)];
    return order.map(([spire, t]) => (t
      ? step(tl("儲存隊伍 光塔 #{0}", { 0: spire }), c!.expedition, A.Expedition3, "setTeam", [BigInt(spire), BigInt(t.prism ?? 0), t.seekers.map(BigInt)])
      : step(tl("解散隊伍 光塔 #{0}", { 0: spire }), c!.expedition, A.Expedition3, "disband", [BigInt(spire)])));
  };

  const dive = useCallback(async (spire: number, dest: number) => {
    const e = ready();
    if (e) return { error: e };
    const st = state!;
    const team = st.teams.find((t) => t.spire === spire);
    if (!team || !team.seekers.length) return { error: "noTeam" };
    if (p!.passesUsed >= 3) return { error: "noTickets" };
    if ((p!.teams.find((t) => Number(t.spire) === spire)?.divesToday ?? 0) >= 3) return { error: "teamLimit" };
    if (st.dives.some((d) => d.spire === spire && !d.result)) return { error: "onBridge" };
    if (st.dives.some((d) => d.spire === spire && d.pending)) return { error: "uncollected" };
    // unsaved team changes are saved in the same go, right before the team departs
    const save = draftSteps();
    const { receipts, error } = await run([...save, step(tl("派隊伍出發"), c!.expedition, A.Expedition3, "dive", [BigInt(spire), dest])]);
    if (!receipts) return { error };
    if (save.length) setDrafts({});
    const id = Number(logArgs(receipts, A.Expedition3, "Dived")[0]?.diveId);
    return { error: null, id, card: cardOf(id, dest) };
  }, [state, data, p, c, A, run, drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  const diveMany = useCallback(async (list: { spire: number; dest: number }[]) => {
    const e = ready();
    if (e) return list.map(() => ({ error: e }));
    const st = state!;
    const blocked = (spire: number) =>
      !st.teams.find((t) => t.spire === spire)?.seekers.length ? "noTeam"
          : st.dives.some((d) => d.spire === spire && !d.result) ? "onBridge"
            : st.dives.some((d) => d.spire === spire && d.pending) ? "uncollected" : null;
    const errors = list.map((t) => blocked(t.spire));
    const go = list.filter((_, i) => !errors[i]);
    if (go.length > 3 - p!.passesUsed) return list.map(() => ({ error: "noTickets" }));
    if (!go.length) return errors.map((error) => ({ error }));
    const saves = draftSteps();
    const { receipts, error } = await run([...saves, step(tl("一次派遣 {0} 支隊伍", { 0: go.length }), c!.expedition, A.Expedition3, "diveMany", [go.map((t) => BigInt(t.spire)), go.map((t) => t.dest)])]);
    if (receipts && saves.length) setDrafts({});
    const ids = receipts ? logArgs(receipts, A.Expedition3, "Dived").map((x) => Number(x.diveId)) : [];
    let k = 0;
    return list.map((t, i) => {
      if (errors[i]) return { error: errors[i] };
      if (!receipts) return { error };
      const id = ids[k++];
      return { error: null, id, card: cardOf(id, t.dest) };
    });
  }, [state, p, c, A, run, drafts]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback(async (diveId: number, choice: Choice) => {
    if (ready()) return;
    await run([step(tl("航行抉擇"), c!.expedition, A.Expedition3, "decide", [BigInt(diveId), CHOICES.indexOf(choice)])]);
  }, [c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const collect = useCallback(async (ids?: number[]) => {
    if (ready()) return 0;
    const due = (state?.dives ?? []).filter((d) => d.pending && (!ids || ids.includes(d.id)));
    const sigs = due.map((d) => predictions.current.get(d.id)?.signature).filter((s): s is Hex => !!s);
    if (!due.length || sigs.length !== due.length) return 0;
    const { receipts } = await run([step(due.length > 1 ? tl("收取 {0} 趟結果", { 0: due.length }) : tl("收取結果"), c!.expedition, A.Expedition3, "revealMany", [due.map((d) => BigInt(d.id)), sigs])]);
    if (!receipts) return 0;
    return logArgs(receipts, A.Expedition3, "Revealed").reduce((a, r) => a + num(r.reward as bigint), 0);
  }, [state, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const claim = useCallback(async () => {
    if (ready() || !p || p.credit === 0n) return;
    await run([step(tl("領取到錢包"), c!.expedition, A.Expedition3, "claim")]);
  }, [p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const renew = useCallback(async (id: number) => {
    const e = ready();
    if (e) return e;
    const card = p!.cards.find((x) => Number(x.id) === id);
    if (!card || !card.dockedAt || card.renewed) return "cannotRenew";
    const cost = data!.world.renewPrice[card.kind];
    if (p!.balance < cost) return "balance";
    const { error } = await run([
      ...pay(c!.minter, p!.minterAllowance, cost, tl("允許續航使用 $RVYN")),
      step(tl("續航"), c!.minter, A.LightdiveMinter3, "renew", [BigInt(id)]),
    ]);
    return error;
  }, [p, data, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendHome = useCallback(async (id: number) => {
    if (ready()) return;
    const card = p?.cards.find((x) => Number(x.id) === id);
    if (!card?.dockedAt || (now || Date.now()) / 1000 < card.dockedAt + 7 * 86_400) { setTx({ steps: [], error: "notDue", running: false }); return; }
    await run([step(tl("歸航"), c!.expedition, A.Expedition3, "sendHome", [BigInt(id)])]);
  }, [p, now, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps

  const approveCards = (): TxStep[] => (p?.marketApproved ? [] : [step(tl("允許市集保管上架的卡"), c!.nft, A.LightdiveNFT3, "setApprovalForAll", [c!.market, true])]);
  const listNft = useCallback(async (id: number, price: number) => {
    const e = ready();
    if (e) return e;
    if (!(price > 0)) return "price";
    const { error } = await run([...approveCards(), step(tl("上架"), c!.market, A.LightdiveMarket3, "list", [BigInt(id), parseEther(String(Math.round(price * 100) / 100))])]);
    return error;
  }, [p, c, A, run]); // eslint-disable-line react-hooks/exhaustive-deps
  const listMany = useCallback(async (items: { id: number; price: number }[]) => {
    const e = ready();
    if (e) return e;
    if (!items.length || items.length > 20) return "batch";
    if (items.some((x) => !(x.price > 0))) return "price";
    const { error } = await run([...approveCards(), step(tl("一次上架 {0} 張", { 0: items.length }), c!.market, A.LightdiveMarket3, "listMany", [
      items.map((x) => BigInt(x.id)), items.map((x) => parseEther(String(Math.round(x.price * 100) / 100))),
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
    if (st.dives.some((d) => d.spire === t.spire && (!d.result || d.pending))) return "onBridge";
    const onChain = p?.teams.find((x) => Number(x.spire) === t.spire);
    const same = onChain && Number(onChain.prism) === (t.prism ?? 0) && onChain.seekers.length === t.seekers.length && onChain.seekers.every((s, i) => Number(s) === t.seekers[i]);
    setDrafts((d) => {
      const next = { ...d };
      if ((!keep && !onChain) || same) delete next[t.spire];
      else next[t.spire] = keep ? t : null;
      return next;
    });
    return null;
  }, [state, p]);
  const saveTeams = useCallback(async () => {
    if (ready()) return ready();
    if (Object.values(drafts).some((t) => t && !t.seekers.length)) return "needSeeker";
    const { error } = await run(draftSteps());
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
    summons: (data?.summons ?? []).map((x) => ({ id: Number(x.id), who: account && x.who.toLowerCase() === account.toLowerCase() ? tl("你") : `${x.who.slice(0, 6)}…${x.who.slice(-4)}`, kind: x.kind as Kind, rarity: x.rarity, at: x.at * 1000 })),
    chainOf: (n) => {
      const raw = data?.player?.cards.find((x) => Number(x.id) === n.id);
      return {
        tokenId: n.id,
        contract: c?.nft ?? "",
        owner: account ?? "",
        standard: "ERC-721（RVDIV）",
        chain: `${G.chain.name}（${G.chain.id}）`,
        mintBlock: raw?.mintBlock !== undefined ? Number(raw.mintBlock) : null,
        mintTx: raw?.mintTx ?? null,
        dna: raw ? `0x${raw.dna.toString(16).padStart(16, "0")}` : null,
        deck: raw?.deck ?? null,
        tokenUri: null,
        royalty: "5%（ERC-2981）",
        explorer: G.explorer && c ? `${G.explorer}/token/${c.nft}/instance/${n.id}` : null,
      };
    },
    dive, diveMany, choose, collect, setTeam, nameTeam, mint, renew, sendHome, claim, listNft, listMany, unlist, buy,
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
      openSummons,
      tx,
      closeTx: () => setTx(null),
      join,
      switchNetwork,
      reload: load,
    },
  };
}

