// Lightdive v3 on chain: everything the game reads from the contracts and from drand. There is no server state: a
// player's cards, teams, dives and summons are rebuilt from the contracts' events and views every time. The site
// (components/lightdive/v3/use-chain.ts) turns this into the same SimState the preview uses; tests/lightdive-v3-chain
// runs it in Node against a local chain. Relative imports only, so Node can load this file directly.
//
// v3.3 settles lazily: a dive's result and a summon's cards are fixed by their drand round, so they are computed here
// as soon as the round is out and written on chain by the player's next transaction (`settleOf`), never by one of
// their own. drawDive and drawCard mirror the contracts exactly.
import { encodeAbiParameters, getAddress, keccak256, sha256, type Abi, type Address, type Hex, type PublicClient } from "viem";

export type Contracts3 = {
  rvyn: Address;
  rng: Address;
  config: Address;
  nft: Address;
  pool: Address;
  minter: Address;
  expedition: Address;
  market: Address;
  commissions: Address;
};
export type Deployment3 = Partial<Record<keyof Contracts3, string | null>> & {
  chainId: number;
  deploymentBlock: number;
  testToken?: boolean;
  rpcUrl?: string | null;
};
export type Abis3 = Record<
  "DrandEvmnetRandomness" | "LightdiveConfig3" | "LightdiveNFT3" | "CoreLightPool3" | "LightdiveMinter3" | "Expedition3" | "LightdiveMarket3" | "LightdiveCommissions3" | "TestRVYN",
  Abi
>;
export type Ctx = {
  client: PublicClient;
  c: Contracts3;
  abi: Abis3;
  fromBlock: bigint;
  /** Multicall3 on Robinhood Chain (both networks); absent on a local chain, where calls go one by one. */
  multicall?: Address;
};

export const MULTICALL3 = getAddress("0xcA11bde05977b3631167028862bE2a173976CA11");
export const KEYS: (keyof Contracts3)[] = ["rvyn", "rng", "config", "nft", "pool", "minter", "expedition", "market", "commissions"];

/** The contracts of a deployment file, or null while it is not filled in. */
export function contractsOf(d: Deployment3): Contracts3 | null {
  if (KEYS.some((k) => !d[k])) return null;
  return Object.fromEntries(KEYS.map((k) => [k, getAddress(d[k] as string)])) as Contracts3;
}

// ------------------------------------------------------------------ drand evmnet (mirrors DrandEvmnet.sol)

export const DRAND_GENESIS = 1727521075;
export const DRAND_PERIOD = 3;
export const DRAND_API = "https://api.drand.sh/v2/beacons/evmnet/rounds";
export const roundTime = (round: bigint | number) => DRAND_GENESIS + (Number(round) - 1) * DRAND_PERIOD;

/** Published signatures never change: each round is fetched once. */
const SIGNATURES = new Map<string, Hex>();

/** The signature of a drand evmnet round (64 bytes), or null while the round is not published yet. */
export async function drandSignature(round: bigint | number, fetcher: typeof fetch = fetch): Promise<Hex | null> {
  const known = SIGNATURES.get(String(round));
  if (known) return known;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetcher(`${DRAND_API}/${round}`, { cache: "no-store" });
      if (res.status === 404 || res.status === 425) return null;
      if (!res.ok) throw new Error(`drand ${res.status}`);
      const body = (await res.json()) as { round: number; signature: string };
      if (BigInt(body.round) !== BigInt(round) || !/^[0-9a-f]{128}$/i.test(body.signature)) throw new Error("drand: bad answer");
      const sig: Hex = `0x${body.signature}`;
      SIGNATURES.set(String(round), sig);
      return sig;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return null;
}

/** The random number a reveal draws from: Expedition3 hashes the round's randomness (sha256 of the signature) with
 *  the dive id; the minter does the same with the request id and card index. */
export const diveRandom = (signature: Hex, id: bigint) =>
  BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [sha256(signature), id])));

export type ChainTier = { probBp: number; lo: number; hi: number };
export type ChainPlan = { table: ChainTier[]; risk: number; starEvent: number; coefBp: number; levyBp: number; wear2Bp: number; wear3Bp: number };

/** A dive's result exactly as Expedition3._settle will draw it. */
export function drawDive(plan: ChainPlan, r: bigint) {
  const BP = 10_000n;
  const x = r % BP;
  let acc = 0n;
  let tier = plan.table.length - 1;
  let mult = plan.table[tier].lo;
  for (let i = 0; i < plan.table.length; i++) {
    acc += BigInt(plan.table[i].probBp);
    if (x < acc) {
      const span = BigInt(plan.table[i].hi - plan.table[i].lo + 1);
      tier = i;
      mult = plan.table[i].lo + Number((r >> 128n) % span);
      break;
    }
  }
  const w = Number((r >> 64n) % BP);
  const wear = w < plan.wear3Bp ? 3 : w < plan.wear3Bp + plan.wear2Bp ? 2 : 1;
  return { tier, multX100: mult, wear };
}

// Chance of each rarity (basis points) and power band per rarity, per kind: LightdiveMinter3.RARITY_BP and *_POWER.
export const RARITY_BP = [[4800, 2900, 1500, 700, 100], [5000, 2800, 1500, 600, 100], [4400, 3500, 1500, 500, 100]] as const;
export const POWER_BANDS = [
  [[41, 55], [56, 75], [76, 95], [96, 115], [116, 140]],
  [[10, 19], [20, 29], [30, 39], [40, 49], [50, 60]],
  [[10, 39], [40, 79], [80, 119], [120, 159], [160, 200]],
] as const;
export const SEALED = 255;

const u256 = [{ type: "uint256" }, { type: "uint256" }] as const;
const word = (seed: bigint, n: bigint) => BigInt(keccak256(encodeAbiParameters(u256, [seed, n])));

/** The seed of card `index` of summon `requestId` (LightdiveMinter3._draw): the round's randomness, the request and the
 *  card's place in it. Nothing else, so the order or time of reveals changes nothing. */
export const cardSeed = (signature: Hex, requestId: bigint, index: number) =>
  BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }], [sha256(signature), requestId, BigInt(index)])));

/** One card exactly as LightdiveMinter3._card draws it. */
export function drawCard(kind: number, seed: bigint) {
  const u1 = word(seed, 1n), u2 = word(seed, 2n), u3 = word(seed, 3n);
  let x = Number(u1 % 10_000n), rarity = 0;
  const odds = RARITY_BP[kind];
  for (; rarity < 4; rarity++) {
    if (x < odds[rarity]) break;
    x -= odds[rarity];
  }
  const [lo, hi] = POWER_BANDS[kind][rarity];
  const power = lo + Number(u2 % BigInt(hi - lo + 1));
  const dna = (u3 >> 128n) & 0xffff_ffff_ffff_ffffn;
  const b = Number(u3 % 10n);
  const trait = kind === 0 ? rarity + 1 : kind === 1 ? (b < 4 ? 0 : b < 8 ? 1 : 2) : Number((u2 >> 64n) % 6n);
  return { rarity, trait, power, dna };
}

/** The cards of a summon whose round is out, in order of id. */
export const predictSummon = (r: Pick<Request3, "id" | "kind" | "qty">, signature: Hex) =>
  Array.from({ length: r.qty }, (_, i) => drawCard(r.kind, cardSeed(signature, r.id, i)));

/** What a revealed dive credits (Expedition3._settle, before the pool's own cap): reward after the departure cost. */
export function diveReward(pointsE2: bigint, multX100: number, rate: bigint, levyBp: number) {
  if (multX100 === 0) return { reward: 0n, levy: 0n };
  const gross = (pointsE2 * BigInt(multX100) * rate) / 10_000n;
  const levy = (gross * BigInt(levyBp)) / 10_000n;
  return { reward: gross - levy, levy };
}

// ------------------------------------------------------------------ reads

type Call = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

/** Many view calls at once: one Multicall3 request on Robinhood Chain, plain parallel calls elsewhere. A failed call
 *  gives null (e.g. attributes of a card that has gone home). */
export async function many<T = unknown>(ctx: Ctx, calls: Call[]): Promise<(T | null)[]> {
  if (!calls.length) return [];
  if (ctx.multicall) {
    const out: (T | null)[] = [];
    for (let i = 0; i < calls.length; i += 400) {
      const part = await ctx.client.multicall({ contracts: calls.slice(i, i + 400) as never[], allowFailure: true, multicallAddress: ctx.multicall });
      out.push(...part.map((r) => (r.status === "success" ? (r.result as T) : null)));
    }
    return out;
  }
  return Promise.all(calls.map((c) => ctx.client.readContract(c as never).then((v) => v as T).catch(() => null)));
}

export type Log<A = Record<string, unknown>> = { args: A; blockNumber: bigint; transactionHash: Hex; logIndex: number };

/** Event logs from the deployment block, in ranges the public RPC accepts (it answers up to a few million blocks). */
export async function events<A = Record<string, unknown>>(
  ctx: Ctx, address: Address, abi: Abi, eventName: string, args?: Record<string, unknown>, fromBlock = ctx.fromBlock,
): Promise<Log<A>[]> {
  const latest = await ctx.client.getBlockNumber({ cacheTime: 0 });
  const out: Log<A>[] = [];
  let step = 4_000_000n;
  for (let from = fromBlock; from <= latest; ) {
    const to = from + step - 1n > latest ? latest : from + step - 1n;
    try {
      const logs = await ctx.client.getContractEvents({ address, abi, eventName, args, fromBlock: from, toBlock: to } as never);
      out.push(...(logs as unknown as Log<A>[]));
      from = to + 1n;
    } catch (e) {
      if (step <= 10_000n) throw e;
      step /= 4n; // the RPC refused the range: ask for less
    }
  }
  return out;
}

export type Attributes3 = {
  kind: number;
  rarity: number;
  trait: number;
  renewed: boolean;
  power: number;
  voyagesLeft: number;
  deck: number;
  dockedAt: number; // seconds, 0 = not docked
  dna: bigint;
};
export const attrsOf = (a: unknown): Attributes3 => {
  const x = a as Record<string, number | bigint | boolean>;
  return {
    kind: Number(x.kind), rarity: Number(x.rarity), trait: Number(x.trait), renewed: Boolean(x.renewed), power: Number(x.power),
    voyagesLeft: Number(x.voyagesLeft), deck: Number(x.deck), dockedAt: Number(x.dockedAt), dna: BigInt(x.dna as bigint),
  };
};

export type World = {
  now: number; // chain time, seconds
  day: number;
  rate: bigint; // RVYN wei per point of Lightdust, today (as fixed, or as it would be fixed now)
  rateYesterday: bigint;
  ceiling: bigint;
  reserved: bigint;
  poolAvailable: bigint;
  poolBalance: bigint;
  alive: number[];
  maxAlive: number[];
  price: bigint[];
  renewPrice: bigint[];
  saleStart: number;
  voyageSeconds: number;
  decisionCloseSeconds: number;
  dripAmount: bigint | null; // test token only
  // v3.1
  longVoyageSeconds: number;
  longTurnSeconds: number;
  longMinCluster: number;
  bondMax: number;
  chartStability: number;
  supplyPriceBp: number[]; // [0, lamp oil, star chart]
  commissionBonusBp: number;
  // v3.2 (0 and nobody against contracts without echo bridges)
  echoStability: number;
  bridges: (string | null)[]; // per destination: the latest observer there today (lower case)
};

export async function readWorld(ctx: Ctx, testToken: boolean): Promise<World> {
  const { c, abi } = ctx;
  const block = await ctx.client.getBlock({ blockTag: "latest" });
  const now = Number(block.timestamp);
  const day = Math.floor(now / 86_400);
  const E = abi.Expedition3, N = abi.LightdiveNFT3, M = abi.LightdiveMinter3, P = abi.CoreLightPool3, C = abi.LightdiveConfig3;
  const k = [0, 1, 2];
  const r = await many<unknown>(ctx, [
    { address: c.expedition, abi: E, functionName: "rateFor", args: [day] },
    { address: c.expedition, abi: E, functionName: "dayRate", args: [day - 1] },
    { address: c.expedition, abi: E, functionName: "dayReserved", args: [day] },
    { address: c.pool, abi: P, functionName: "available" },
    { address: c.rvyn, abi: abi.TestRVYN, functionName: "balanceOf", args: [c.pool] },
    { address: c.minter, abi: M, functionName: "saleStart" },
    { address: c.config, abi: C, functionName: "voyageSeconds" },
    { address: c.config, abi: C, functionName: "decisionCloseSeconds" },
    ...(testToken ? [{ address: c.rvyn, abi: abi.TestRVYN, functionName: "dripAmount" }] : []),
    ...k.map((i) => ({ address: c.nft, abi: N, functionName: "alive", args: [i] })),
    ...k.map((i) => ({ address: c.nft, abi: N, functionName: "maxAlive", args: [i] })),
    ...k.map((i) => ({ address: c.minter, abi: M, functionName: "price", args: [i] })),
    ...k.map((i) => ({ address: c.minter, abi: M, functionName: "renewPrice", args: [i] })),
    { address: c.config, abi: C, functionName: "rules" },
    { address: c.config, abi: C, functionName: "supplyPriceBp", args: [1] },
    { address: c.config, abi: C, functionName: "supplyPriceBp", args: [2] },
    { address: c.commissions, abi: abi.LightdiveCommissions3, functionName: "bonusBp" },
    { address: c.config, abi: C, functionName: "echoStability" },
    ...Array.from({ length: 24 }, (_, i) => ({ address: c.expedition, abi: E, functionName: "lastDiver", args: [day, i] })),
  ]);
  const at = testToken ? 9 : 8;
  const rules = (r[at + 12] as Record<string, number>) ?? {};
  const [rate, ceiling] = (r[0] as [bigint, bigint]) ?? [0n, 0n];
  const y = (r[1] as bigint) ?? 0n;
  return {
    now, day, rate, ceiling,
    rateYesterday: y > 1n ? y : rate,
    reserved: (r[2] as bigint) ?? 0n,
    poolAvailable: (r[3] as bigint) ?? 0n,
    poolBalance: (r[4] as bigint) ?? 0n,
    saleStart: Number((r[5] as bigint) ?? 0n),
    voyageSeconds: Number((r[6] as bigint) ?? 300n),
    decisionCloseSeconds: Number((r[7] as bigint) ?? 60n),
    dripAmount: testToken ? ((r[8] as bigint) ?? null) : null,
    alive: k.map((i) => Number((r[at + i] as bigint) ?? 0n)),
    maxAlive: k.map((i) => Number((r[at + 3 + i] as bigint) ?? 0n)),
    price: k.map((i) => (r[at + 6 + i] as bigint) ?? 0n),
    renewPrice: k.map((i) => (r[at + 9 + i] as bigint) ?? 0n),
    longVoyageSeconds: Number(rules.longVoyageSeconds ?? 900),
    longTurnSeconds: Number(rules.longTurnSeconds ?? 600),
    longMinCluster: Number(rules.longMinCluster ?? 2),
    bondMax: Number(rules.bondMax ?? 5),
    chartStability: Number(rules.chartStability ?? 3),
    supplyPriceBp: [0, Number(r[at + 13] ?? 400), Number(r[at + 14] ?? 600)],
    commissionBonusBp: Number(r[at + 15] ?? 1000),
    echoStability: Number(r[at + 16] ?? 0),
    bridges: Array.from({ length: 24 }, (_, i) => {
      const a = r[at + 17 + i] as string | null;
      return a && !/^0x0+$/.test(a) ? a.toLowerCase() : null;
    }),
  };
}

/** `rarity` is SEALED until the card's summon is revealed on chain (the site predicts it from drand meanwhile). */
export type Card3 = Attributes3 & { id: bigint; locked: boolean; listedPrice?: bigint; listedAt?: number; homeAt?: number; soldAt?: number; request?: bigint; mintBlock?: bigint; mintTx?: Hex };
export type Team3 = { spire: bigint; prism: bigint; seekers: bigint[]; activeDive: bigint; divesToday: number; bond: number };
export type Dive3 = {
  id: bigint; spire: bigint; day: number; dest: number; beam: number; revealed: boolean; power: number;
  round: bigint; pointsE2: bigint; rate: bigint;
  // v3.1 (v3.3: no decisions and no turning back)
  long: boolean; attuned: boolean; supply: number; bond: number;
  // v3.2: points its echo moved (it followed someone else's bridge)
  echo: number;
  result?: { tier: number; multX100: number; wear: number; reward: bigint; levy: bigint; fallbackUsed: boolean };
};
/** The player's commission state: the active one (index and the first dive id that counts) and today's marks
 *  (bit i completed, bit i + 8 abandoned). */
export type CommissionState = { active: { day: number; index: number; fromDive: bigint } | null; marks: number };
/** A summon: its cards are firstId .. firstId + qty - 1, minted sealed at once (v3.3). */
export type Request3 = { id: bigint; kind: number; qty: number; round: bigint; paid: bigint; revealed: boolean; firstId: bigint; cards: bigint[] };
export type Player = {
  balance: bigint;
  eth: bigint;
  credit: bigint;
  lastClaimAt: number;
  passesUsed: number;
  minterAllowance: bigint;
  marketAllowance: bigint;
  marketApproved: boolean;
  poolAllowance: bigint; // supplies are paid into the pool
  nextDripAt: number | null;
  commission: CommissionState;
  commissionsDone: number; // every commission this wallet has completed
  echoesGiven: number; // v3.2: dives by others that followed this wallet's bridges
  cards: Card3[]; // owned now (in the wallet or listed by me), plus the ones that went home or were sold
  teams: Team3[];
  dives: Dive3[];
  requests: Request3[];
  claimed: bigint;
  claimFees: bigint;
  levyTotal: bigint;
  spent: { mint: bigint; renew: bigint; market: bigint };
  sales: { id: bigint; price: bigint; at: number }[];
};

const blockTime = async (ctx: Ctx, cache: Map<bigint, number>, n: bigint) => {
  if (!cache.has(n)) cache.set(n, Number((await ctx.client.getBlock({ blockNumber: n })).timestamp));
  return cache.get(n)!;
};

export async function readPlayer(ctx: Ctx, me: Address, world: World, testToken: boolean): Promise<Player> {
  const { c, abi } = ctx;
  const E = abi.Expedition3, N = abi.LightdiveNFT3, M = abi.LightdiveMinter3, K = abi.LightdiveMarket3, T = abi.TestRVYN;
  type A = Record<string, unknown>;
  const [minted, received, homecomings, soldMine, bought, dived, revealed, claimed, requested, renewals, completed] = await Promise.all([
    events<A>(ctx, c.nft, N, "Minted", { to: me }),
    events<A>(ctx, c.nft, N, "Transfer", { to: me }),
    events<A>(ctx, c.nft, N, "Homecoming", { owner: me }),
    events<A>(ctx, c.market, K, "Sold", { seller: me }),
    events<A>(ctx, c.market, K, "Sold", { buyer: me }),
    events<A>(ctx, c.expedition, E, "Dived", { owner: me }),
    events<A>(ctx, c.expedition, E, "Revealed", { owner: me }),
    events<A>(ctx, c.expedition, E, "Claimed", { owner: me }),
    events<A>(ctx, c.minter, M, "SummonRequested", { player: me }),
    events<A>(ctx, c.minter, M, "Renewal", { owner: me }),
    events<A>(ctx, c.commissions, abi.LightdiveCommissions3, "Completed", { player: me }).catch(() => []),
  ]);

  // Every card that has ever been mine; its attributes at mint come from Minted (it may have gone home since).
  const ids = [...new Set([...minted, ...received].map((l) => BigInt((l.args.id ?? l.args.tokenId) as bigint)))];
  const mintedById = new Map(minted.map((l) => [BigInt(l.args.id as bigint), l]));
  const foreign = ids.filter((id) => !mintedById.has(id));
  if (foreign.length) for (const l of await events<A>(ctx, c.nft, N, "Minted", { id: foreign })) mintedById.set(BigInt(l.args.id as bigint), l);

  const views = await many<unknown>(ctx, ids.flatMap((id) => [
    { address: c.nft, abi: N, functionName: "ownerOf", args: [id] },
    { address: c.nft, abi: N, functionName: "attributes", args: [id] },
    { address: c.nft, abi: N, functionName: "locked", args: [id] },
    { address: c.market, abi: K, functionName: "listings", args: [id] },
  ]));
  const times = new Map<bigint, number>();
  const homeAt = new Map<bigint, number>();
  for (const l of homecomings) homeAt.set(BigInt(l.args.id as bigint), await blockTime(ctx, times, l.blockNumber));
  const soldAt = new Map<bigint, { price: bigint; at: number }>();
  for (const l of soldMine) soldAt.set(BigInt(l.args.id as bigint), { price: BigInt(l.args.price as bigint), at: await blockTime(ctx, times, l.blockNumber) });

  // which summon each card came from: its id is within the request's range
  const revealedReq = requested.length
    ? await events<A>(ctx, c.minter, M, "SummonRevealed", { requestId: requested.map((l) => BigInt(l.args.requestId as bigint)) })
    : [];
  const ranges = requested.map((l) => ({ id: BigInt(l.args.requestId as bigint), first: BigInt(l.args.firstId as bigint), qty: BigInt(l.args.qty as number) }));
  const requestOf = (id: bigint) => ranges.find((r) => id >= r.first && id < r.first + r.qty)?.id;
  // a card that went home or was sold: its attributes as unsealed (Minted has them sealed)
  const gone = ids.filter((id) => homeAt.has(id) || soldAt.has(id));
  const unsealed = new Map<bigint, Record<string, unknown>>();
  if (gone.length) for (const l of await events<A>(ctx, c.nft, N, "Unsealed", { id: gone })) unsealed.set(BigInt(l.args.id as bigint), l.args.attributes as Record<string, unknown>);

  const cards: Card3[] = [];
  ids.forEach((id, i) => {
    const owner = views[i * 4] as Address | null;
    const listing = views[i * 4 + 3] as [Address, bigint, bigint] | null;
    const mine = owner?.toLowerCase() === me.toLowerCase();
    const listedByMe = owner?.toLowerCase() === c.market.toLowerCase() && listing?.[0]?.toLowerCase() === me.toLowerCase();
    const m = mintedById.get(id);
    const request = requestOf(id);
    const origin = m ? { mintBlock: m.blockNumber, mintTx: m.transactionHash } : {};
    if (mine || listedByMe) {
      cards.push({ id, ...attrsOf(views[i * 4 + 1]), locked: Boolean(views[i * 4 + 2]), listedPrice: listedByMe ? listing![1] : undefined, listedAt: listedByMe ? Number(listing![2]) : undefined, request, ...origin });
    } else if (m && (homeAt.has(id) || soldAt.has(id))) {
      const a = attrsOf(unsealed.get(id) ?? m.args.attributes);
      cards.push({ id, ...a, voyagesLeft: 0, locked: false, homeAt: homeAt.get(id), soldAt: soldAt.get(id)?.at, request, ...origin });
    }
  });

  const spires = cards.filter((x) => x.kind === 0 && !x.homeAt && !x.soldAt && x.listedPrice === undefined).map((x) => x.id);
  const diveIds = dived.map((l) => BigInt(l.args.diveId as bigint));
  const [teamViews, diveViews, echoViews, own] = await Promise.all([
    many<unknown>(ctx, spires.flatMap((s) => [
      { address: c.expedition, abi: E, functionName: "team", args: [s] },
      { address: c.expedition, abi: E, functionName: "teamDives", args: [s, world.day] },
    ])),
    many<unknown>(ctx, diveIds.map((id) => ({ address: c.expedition, abi: E, functionName: "diveInfo", args: [id] }))),
    world.echoStability ? many<unknown>(ctx, diveIds.map((id) => ({ address: c.expedition, abi: E, functionName: "echoed", args: [id] }))) : Promise.resolve([]),
    many<unknown>(ctx, [
      { address: c.rvyn, abi: T, functionName: "balanceOf", args: [me] },
      { address: c.expedition, abi: E, functionName: "credit", args: [me] },
      { address: c.expedition, abi: E, functionName: "lastClaimAt", args: [me] },
      { address: c.expedition, abi: E, functionName: "passesUsed", args: [me, world.day] },
      { address: c.rvyn, abi: T, functionName: "allowance", args: [me, c.minter] },
      { address: c.rvyn, abi: T, functionName: "allowance", args: [me, c.market] },
      { address: c.nft, abi: N, functionName: "isApprovedForAll", args: [me, c.market] },
      { address: c.rvyn, abi: T, functionName: "allowance", args: [me, c.pool] },
      { address: c.commissions, abi: abi.LightdiveCommissions3, functionName: "active", args: [me] },
      { address: c.commissions, abi: abi.LightdiveCommissions3, functionName: "marks", args: [me, world.day] },
      { address: c.expedition, abi: E, functionName: "echoesGiven", args: [me] },
      ...(testToken ? [{ address: c.rvyn, abi: T, functionName: "nextDripAt", args: [me] }] : []),
    ]),
  ]);

  const teams: Team3[] = [];
  spires.forEach((spire, i) => {
    const t = teamViews[i * 2] as { owner: Address; prism: bigint; seekers: readonly bigint[]; activeDive: bigint; bond: number } | null;
    if (!t || t.owner.toLowerCase() !== me.toLowerCase()) return;
    teams.push({ spire, prism: t.prism, seekers: [...t.seekers], activeDive: t.activeDive, divesToday: Number((teamViews[i * 2 + 1] as bigint) ?? 0n), bond: Number(t.bond ?? 0) });
  });

  const results = new Map(revealed.map((l) => [BigInt(l.args.diveId as bigint), l.args]));
  const dives: Dive3[] = diveIds.map((id, i) => {
    const d = diveViews[i] as Record<string, unknown>;
    const res = results.get(id);
    return {
      id, spire: BigInt(d.spire as bigint), day: Number(d.day), dest: Number(d.dest), beam: Number(d.beam),
      revealed: Boolean(d.revealed), power: Number(d.power), round: BigInt(d.round as bigint), pointsE2: BigInt(d.pointsE2 as bigint), rate: BigInt(d.rate as bigint),
      long: Boolean(d.long), attuned: Boolean(d.attuned), supply: Number(d.supply ?? 0), bond: Number(d.bond ?? 0),
      echo: echoViews[i] ? world.echoStability : 0,
      result: res ? {
        tier: Number(res.tier), multX100: Number(res.multX100), wear: Number(res.wear), reward: BigInt(res.reward as bigint), levy: BigInt(res.levy as bigint),
        fallbackUsed: Boolean(res.fallbackUsed),
      } : undefined,
    };
  });

  const doneReq = new Set(revealedReq.map((l) => BigInt(l.args.requestId as bigint)));
  const requests: Request3[] = requested.map((l) => {
    const id = BigInt(l.args.requestId as bigint);
    const firstId = BigInt(l.args.firstId as bigint), qty = Number(l.args.qty);
    return {
      id, kind: Number(l.args.kind), qty, round: BigInt(l.args.round as bigint), paid: BigInt(l.args.paid as bigint),
      revealed: doneReq.has(id), firstId, cards: Array.from({ length: qty }, (_, i) => firstId + BigInt(i)),
    };
  });

  const sum = (logs: Log<A>[], key: string) => logs.reduce((a, l) => a + BigInt(l.args[key] as bigint), 0n);
  return {
    balance: (own[0] as bigint) ?? 0n,
    eth: await ctx.client.getBalance({ address: me }),
    credit: (own[1] as bigint) ?? 0n,
    lastClaimAt: Number((own[2] as bigint) ?? 0n),
    passesUsed: Number((own[3] as bigint) ?? 0n),
    minterAllowance: (own[4] as bigint) ?? 0n,
    marketAllowance: (own[5] as bigint) ?? 0n,
    marketApproved: Boolean(own[6]),
    poolAllowance: (own[7] as bigint) ?? 0n,
    commission: commissionState(own[8], own[9], world.day),
    commissionsDone: completed.length,
    echoesGiven: Number(own[10] ?? 0),
    nextDripAt: testToken ? Number((own[11] as bigint) ?? 0n) : null,
    cards, teams, dives, requests,
    claimed: sum(claimed, "gross") - sum(claimed, "fee"),
    claimFees: sum(claimed, "fee"),
    levyTotal: sum(revealed, "levy"),
    spent: { mint: sum(requested, "paid"), renew: sum(renewals, "paid"), market: sum(bought, "price") },
    sales: [...soldAt].map(([id, s]) => ({ id, ...s })),
  };
}

export type MarketListing = Attributes3 & { id: bigint; seller: Address; price: bigint; listedAt: number };

/** Every card on the market now. */
export async function readMarket(ctx: Ctx): Promise<MarketListing[]> {
  const { c, abi } = ctx;
  const K = abi.LightdiveMarket3;
  const listed = await events<Record<string, unknown>>(ctx, c.market, K, "Listed");
  const ids = [...new Set(listed.map((l) => BigInt(l.args.id as bigint)))];
  const views = await many<unknown>(ctx, ids.flatMap((id) => [
    { address: c.market, abi: K, functionName: "listings", args: [id] },
    { address: c.nft, abi: abi.LightdiveNFT3, functionName: "attributes", args: [id] },
  ]));
  const out: MarketListing[] = [];
  ids.forEach((id, i) => {
    const l = views[i * 2] as [Address, bigint, bigint] | null;
    if (!l || /^0x0+$/.test(l[0]) || !views[i * 2 + 1]) return;
    out.push({ id, ...attrsOf(views[i * 2 + 1]), seller: l[0], price: l[1], listedAt: Number(l[2]) });
  });
  return out;
}

/** One dive in the live log. `decided`: the result is drand's, not yet settled on chain (v3.3); `long`: a deep dive
 *  (known once decideFeed has read it). */
export type FeedItem = { id: bigint; owner: Address; dest: number; beam: number; day: number; round: bigint; tier?: number; multX100?: number; long?: boolean; decided?: boolean };

/** Everyone's recent dives for the live log: departures and results in the last `blocks` blocks. */
export async function readFeed(ctx: Ctx, blocks = 400_000n): Promise<FeedItem[]> {
  const { c, abi } = ctx;
  const latest = await ctx.client.getBlockNumber({ cacheTime: 0 });
  const from = latest > blocks ? (latest - blocks > ctx.fromBlock ? latest - blocks : ctx.fromBlock) : ctx.fromBlock;
  const [dived, revealed] = await Promise.all([
    events<Record<string, unknown>>(ctx, c.expedition, abi.Expedition3, "Dived", undefined, from),
    events<Record<string, unknown>>(ctx, c.expedition, abi.Expedition3, "Revealed", undefined, from),
  ]);
  const res = new Map(revealed.map((l) => [BigInt(l.args.diveId as bigint), l.args]));
  return dived.map((l) => {
    const id = BigInt(l.args.diveId as bigint);
    const r = res.get(id);
    return { id, owner: l.args.owner as Address, dest: Number(l.args.dest), beam: Number(l.args.beam), day: Number(l.args.day), round: BigInt(l.args.round as bigint), tier: r ? Number(r.tier) : undefined, multX100: r ? Number(r.multX100) : undefined };
  });
}

/** Anyone's dives whose drand round is out but that nobody has settled yet: their results are already decided, so
 *  the live log shows them at once (the latest `max`; each needs the dive's view and its plan). */
export async function decideFeed(ctx: Ctx, items: FeedItem[], w: World, max = 40): Promise<FeedItem[]> {
  const now = Date.now() / 1000;
  const due = items.filter((f) => f.tier === undefined && roundTime(f.round) <= now).slice(-max);
  if (!due.length) return items;
  const E = ctx.abi.Expedition3;
  const [infos, echoes] = await Promise.all([
    many<Record<string, unknown>>(ctx, due.map((f) => ({ address: ctx.c.expedition, abi: E, functionName: "diveInfo", args: [f.id] }))),
    w.echoStability ? many<boolean>(ctx, due.map((f) => ({ address: ctx.c.expedition, abi: E, functionName: "echoed", args: [f.id] }))) : Promise.resolve([] as (boolean | null)[]),
  ]);
  await Promise.all(due.map(async (f, i) => {
    const d = infos[i];
    if (!d || d.revealed) return;
    const sig = await drandSignature(f.round).catch(() => null);
    if (!sig) return;
    const dive: Dive3 = {
      id: f.id, spire: BigInt(d.spire as bigint), day: Number(d.day), dest: Number(d.dest), beam: Number(d.beam), revealed: false, power: Number(d.power),
      round: f.round, pointsE2: BigInt(d.pointsE2 as bigint), rate: BigInt(d.rate as bigint), long: Boolean(d.long), attuned: Boolean(d.attuned),
      supply: Number(d.supply ?? 0), bond: Number(d.bond ?? 0), echo: echoes[i] ? w.echoStability : 0,
    };
    const r = await predictDive(ctx, dive, sig, w.chartStability).catch(() => null);
    if (!r) return;
    f.tier = r.tier;
    f.multX100 = r.multX100;
    f.long = dive.long;
    f.decided = true;
  }));
  return items;
}

/** Cards of each kind locked on teams right now (for the supply panel), from the lock events and the team rosters. */
export async function readOnTeam(ctx: Ctx): Promise<[number, number, number]> {
  const { c, abi } = ctx;
  const [locks, sets] = await Promise.all([
    events<Record<string, unknown>>(ctx, c.nft, abi.LightdiveNFT3, "Locked"),
    events<Record<string, unknown>>(ctx, c.expedition, abi.Expedition3, "TeamSet"),
  ]);
  const kind = new Map<bigint, number>();
  for (const l of sets) {
    kind.set(BigInt(l.args.spire as bigint), 0);
    if (BigInt(l.args.prism as bigint) !== 0n) kind.set(BigInt(l.args.prism as bigint), 1);
    for (const s of l.args.seekers as bigint[]) kind.set(BigInt(s), 2);
  }
  const state = new Map<bigint, boolean>();
  for (const l of locks) state.set(BigInt(l.args.id as bigint), Boolean(l.args.locked));
  const out: [number, number, number] = [0, 0, 0];
  for (const [id, on] of state) if (on && kind.has(id)) out[kind.get(id)!] += 1;
  return out;
}

/** The exact plan of a dive as the contract will settle it. */
/** Points of empty-handed chance a dive moves to "normal": its crew bond, a star chart and an echo. */
export const stabilityOf = (d: Pick<Dive3, "bond" | "supply" | "echo">, chartStability: number) => d.bond + (d.supply === 2 ? chartStability : 0) + d.echo;

export async function readPlan(ctx: Ctx, d: Pick<Dive3, "dest" | "power" | "beam" | "day" | "bond" | "supply" | "long" | "echo">, chartStability: number): Promise<ChainPlan> {
  const p = (await ctx.client.readContract({
    address: ctx.c.config, abi: ctx.abi.LightdiveConfig3, functionName: "plan",
    args: [d.dest, BigInt(d.power), d.beam, d.day, 0, stabilityOf(d, chartStability), d.long], // 0: no decision (v3.3)
  })) as Record<string, unknown>;
  return {
    table: (p.table as Record<string, number>[]).map((t) => ({ probBp: Number(t.probBp), lo: Number(t.lo), hi: Number(t.hi) })),
    risk: Number(p.risk), starEvent: Number(p.starEvent), coefBp: Number(p.coefBp), levyBp: Number(p.levyBp), wear2Bp: Number(p.wear2Bp), wear3Bp: Number(p.wear3Bp),
  };
}

/** A dive whose drand round is out but that is not settled on chain yet: its result is already decided and counted
 *  (the player's next transaction settles it). Lamp oil caps the wear at 1. */
export async function predictDive(ctx: Ctx, d: Dive3, signature: Hex, chartStability: number) {
  const plan = await readPlan(ctx, d, chartStability);
  const drawn = drawDive(plan, diveRandom(signature, d.id));
  const draw = { ...drawn, wear: d.supply === 1 ? 1 : drawn.wear };
  return { ...draw, ...diveReward(d.pointsE2, draw.multX100, d.rate, plan.levyBp), plan };
}

/** The reveals a transaction carries (Expedition3.Settle): dives and summons whose drand round is out. */
export type Settle = { dives: bigint[]; diveProofs: Hex[]; summons: bigint[]; summonProofs: Hex[] };
export const NO_SETTLE: Settle = { dives: [], diveProofs: [], summons: [], summonProofs: [] };

/** Everything of a player's that is decided by drand but not settled on chain, with the signatures already known. */
export function settleOf(p: Pick<Player, "dives" | "requests">, signature: (round: bigint) => Hex | undefined): Settle {
  const out: Settle = { dives: [], diveProofs: [], summons: [], summonProofs: [] };
  for (const d of p.dives) {
    const sig = d.revealed ? undefined : signature(d.round);
    if (sig) { out.dives.push(d.id); out.diveProofs.push(sig); }
  }
  for (const r of p.requests) {
    const sig = r.revealed ? undefined : signature(r.round);
    if (sig) { out.summons.push(r.id); out.summonProofs.push(sig); }
  }
  return out;
}

/** A signature already fetched (null while unknown), for building a Settle without waiting. */
export const knownSignature = (round: bigint) => SIGNATURES.get(String(round));

function commissionState(active: unknown, marks: unknown, day: number): CommissionState {
  const a = active as [number, number, boolean, bigint] | Record<string, unknown> | null;
  const on = a ? Boolean(Array.isArray(a) ? a[2] : a.on) : false;
  const aDay = a ? Number(Array.isArray(a) ? a[0] : a.day) : 0;
  return {
    active: a && on && aDay === day ? { day: aDay, index: Number(Array.isArray(a) ? a[1] : a.index), fromDive: BigInt((Array.isArray(a) ? a[3] : a.fromDive) as bigint) } : null,
    marks: Number(marks ?? 0),
  };
}

export type RecentSummon = { id: bigint; who: Address; kind: number; rarity: number; at: number };

/** The latest cards summoned by anyone (newest first), for the summon page's live feed: each summon's cards as drand
 *  decided them (v3.3: they may still be sealed on chain); summons whose round is not out yet are left out. */
export async function readRecentSummons(ctx: Ctx, count = 6, blocks = 400_000n): Promise<RecentSummon[]> {
  const latest = await ctx.client.getBlockNumber({ cacheTime: 0 });
  const from = latest > blocks && latest - blocks > ctx.fromBlock ? latest - blocks : ctx.fromBlock;
  const requested = (await events<Record<string, unknown>>(ctx, ctx.c.minter, ctx.abi.LightdiveMinter3, "SummonRequested", undefined, from)).slice(-count).reverse();
  const times = new Map<bigint, number>();
  const out: RecentSummon[] = [];
  for (const l of requested) {
    const r = { id: BigInt(l.args.requestId as bigint), kind: Number(l.args.kind), qty: Number(l.args.qty) };
    const sig = Date.now() / 1000 >= roundTime(l.args.round as bigint) ? await drandSignature(l.args.round as bigint).catch(() => null) : null;
    if (!sig) continue;
    const at = await blockTime(ctx, times, l.blockNumber);
    const first = BigInt(l.args.firstId as bigint);
    predictSummon(r, sig).forEach((c, i) => out.push({ id: first + BigInt(i), who: l.args.player as Address, kind: r.kind, rarity: c.rarity, at }));
    if (out.length >= count) break;
  }
  return out.slice(0, count);
}

/** Everyone's dives of the last `days` days (for the weekly boards): the block range is estimated from the chain's
 *  recent block rate, then the feed is read over it. */
export async function readWeek(ctx: Ctx, days = 7): Promise<FeedItem[]> {
  const latest = await ctx.client.getBlockNumber({ cacheTime: 0 });
  const span = 200_000n;
  const back = latest > ctx.fromBlock + span ? latest - span : ctx.fromBlock;
  let from = ctx.fromBlock;
  if (back > ctx.fromBlock) {
    const [a, b] = await Promise.all([ctx.client.getBlock({ blockNumber: latest }), ctx.client.getBlock({ blockNumber: back })]);
    const perBlock = Number(a.timestamp - b.timestamp) / Number(latest - back) || 1;
    const blocks = BigInt(Math.ceil((days * 86_400) / perBlock));
    from = latest > blocks && latest - blocks > ctx.fromBlock ? latest - blocks : ctx.fromBlock;
  }
  return readFeed(ctx, latest - from + 1n);
}

/** The events the card histories are built from (lib/lightdive-v3/history.ts), from a block on: the caller keeps
 *  what it already has and asks only for what is new. */
export async function readLedger(ctx: Ctx, from: bigint) {
  const { c, abi } = ctx;
  const E = abi.Expedition3;
  type A = Record<string, unknown>;
  const latest = await ctx.client.getBlockNumber({ cacheTime: 0 });
  if (from > latest) return { latest, logs: { teamSet: [], disbanded: [], dived: [], details: [], revealed: [] } };
  const [teamSet, disbanded, dived, details, revealed] = await Promise.all(
    ["TeamSet", "TeamDisbanded", "Dived", "DiveDetails", "Revealed"].map((n) => events<A>(ctx, c.expedition, E, n, undefined, from)),
  );
  return { latest, logs: { teamSet, disbanded, dived, details, revealed } };
}
