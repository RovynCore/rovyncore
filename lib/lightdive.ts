// Read side of RovynCore: Lightdive (testnet). Contracts: packages/contracts/lightdive.
// Everything here reads the chain directly; there is no server state. Addresses come from
// packages/web3/lightdive.json, written by scripts/lightdive-deploy.mjs.
import { getAddress, type Abi, type Address, type PublicClient } from "viem";
import deployment from "@/packages/web3/lightdive.json";
import abis from "@/packages/web3/lightdive-abi.json";
import { CHAINS, type ChainId } from "@/packages/web3/config";

export const ABI = abis as unknown as Record<
  "LightdiveConfig" | "LightdiveNFT" | "RandomnessBeacon" | "CoreLightPool" | "LightdiveMinter" | "Expedition",
  Abi
>;
export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "v", type: "uint256" }], outputs: [{ type: "bool" }] },
] as const satisfies Abi;

type Deployment = {
  chainId: ChainId;
  /** Optional read RPC override (local development); defaults to the chain's public RPC. */
  rpcUrl?: string | null;
  deploymentBlock: number;
  rvyn: Address | null;
  config: Address | null;
  nft: Address | null;
  beacon: Address | null;
  pool: Address | null;
  minter: Address | null;
  expedition: Address | null;
};
const D = deployment as Deployment;
export type Contracts = { [K in Exclude<keyof Deployment, "chainId" | "deploymentBlock" | "rpcUrl">]: Address };

/** null until scripts/lightdive-deploy.mjs has filled packages/web3/lightdive.json. */
export const CONTRACTS: Contracts | null =
  D.rvyn && D.config && D.nft && D.beacon && D.pool && D.minter && D.expedition
    ? {
        rvyn: getAddress(D.rvyn),
        config: getAddress(D.config),
        nft: getAddress(D.nft),
        beacon: getAddress(D.beacon),
        pool: getAddress(D.pool),
        minter: getAddress(D.minter),
        expedition: getAddress(D.expedition),
      }
    : null;
export const GAME_CHAIN = CHAINS[D.chainId];
export const GAME_RPC = D.rpcUrl || undefined;
export const DEPLOYMENT_BLOCK = BigInt(D.deploymentBlock);

export const KIND = { spire: 0, prism: 1, seeker: 2 } as const;
export type Kind = (typeof KIND)[keyof typeof KIND];
export const SEEKER_LUMINANCE = { lo: [20, 32, 48, 75, 120], hi: [30, 45, 68, 100, 160] };
export const DEPTH_COUNT = 6;

export type Attributes = {
  kind: number;
  rarity: number;
  trait: number;
  variant: number;
  luminance: number;
  voyagesLeft: number;
  deck: number;
  dna: bigint;
};
export type Nft = { id: bigint; attributes: Attributes };
export type Deck = { number: number; remaining: number; rarityLeft: readonly number[]; specialLeft: readonly number[]; signatureLeft: number; beamLeft: readonly (readonly number[])[] };
export type Team = { spire: Nft; prism: Nft | null; seekers: Nft[]; luminance: bigint; lastDiveDay: number | null };
export type DiveRecord = {
  id: bigint;
  spire: bigint;
  depth: number;
  coordinate: number;
  day: number;
  hour: bigint;
  beam: number;
  points: bigint;
  luminance: bigint;
  settled: boolean;
  result: { tier: number; multX100: number; lightdust: bigint; reward: bigint; fallbackUsed: boolean } | null;
};
export type MintRequest = { id: bigint; kind: number; qty: number; hour: bigint; fulfilled: boolean; ready: boolean };

export type Overview = {
  /** Chain time of the latest block, in seconds. */
  now: number;
  today: number;
  hour: bigint;
  hourScheduled: boolean;
  prices: readonly [bigint, bigint, bigint];
  firstDiscountBp: number;
  emissionRateBp: number;
  yieldCapPerPoint: bigint;
  depthMinLuminance: number[];
  depthCoefBp: number[];
  claimFeeMaxBp: number;
  claimFeeDecayDays: number;
  pool: { balance: bigint; available: bigint; reserved: bigint; owed: bigint };
  todayPoints: bigint;
  decks: [Deck, Deck, Deck];
  alive: [number, number, number];
  maxAlive: [number, number, number];
  spireSaleStart: bigint;
  paused: { minter: boolean; expedition: boolean };
};
export type PlayerState = {
  rvyn: bigint;
  allowance: bigint;
  approvedForGame: boolean;
  credit: bigint;
  lastClaimAt: bigint;
  firstMintUsed: [boolean, boolean, boolean];
  earlySpires: number;
};

type Read = (address: Address, abi: Abi, functionName: string, args?: readonly unknown[]) => Promise<unknown>;
const reader = (client: PublicClient): Read => (address, abi, functionName, args = []) =>
  client.readContract({ address, abi, functionName, args });

export async function readOverview(client: PublicClient, c: Contracts): Promise<Overview> {
  const r = reader(client);
  const [block, hour, prices, discount, rate, cap, feeMax, feeDays, today, saleStart, mPaused, ePaused] = await Promise.all([
    client.getBlock(),
    r(c.beacon, ABI.RandomnessBeacon, "currentHour"),
    r(c.config, ABI.LightdiveConfig, "prices"),
    r(c.config, ABI.LightdiveConfig, "firstDiscountBp"),
    r(c.config, ABI.LightdiveConfig, "emissionRateBp"),
    r(c.config, ABI.LightdiveConfig, "yieldCapPerPoint"),
    r(c.config, ABI.LightdiveConfig, "claimFeeMaxBp"),
    r(c.config, ABI.LightdiveConfig, "claimFeeDecayDays"),
    r(c.expedition, ABI.Expedition, "today"),
    r(c.minter, ABI.LightdiveMinter, "spireSaleStart"),
    r(c.minter, ABI.LightdiveMinter, "paused"),
    r(c.expedition, ABI.Expedition, "paused"),
  ]);
  const depths = [...Array(DEPTH_COUNT).keys()];
  const [scheduled, minLum, coef, balance, available, reserved, owed, todayPoints, decks, alive, maxAlive] = await Promise.all([
    r(c.beacon, ABI.RandomnessBeacon, "hasCommitment", [hour]),
    Promise.all(depths.map((i) => r(c.config, ABI.LightdiveConfig, "depthMinLuminance", [BigInt(i)]))),
    Promise.all(depths.map((i) => r(c.config, ABI.LightdiveConfig, "depthCoefBp", [BigInt(i)]))),
    r(c.rvyn, ERC20_ABI, "balanceOf", [c.pool]),
    r(c.pool, ABI.CoreLightPool, "available"),
    r(c.pool, ABI.CoreLightPool, "reserved"),
    r(c.pool, ABI.CoreLightPool, "owed"),
    r(c.expedition, ABI.Expedition, "dayPoints", [today]),
    Promise.all([0, 1, 2].map((k) => r(c.minter, ABI.LightdiveMinter, "deckOf", [k]))),
    Promise.all([0, 1, 2].map((k) => r(c.nft, ABI.LightdiveNFT, "alive", [BigInt(k)]))),
    Promise.all([0, 1, 2].map((k) => r(c.nft, ABI.LightdiveNFT, "maxAlive", [BigInt(k)]))),
  ]);
  return {
    now: Number(block.timestamp),
    today: Number(today),
    hour: hour as bigint,
    hourScheduled: scheduled as boolean,
    prices: prices as readonly [bigint, bigint, bigint],
    firstDiscountBp: Number(discount),
    emissionRateBp: Number(rate),
    yieldCapPerPoint: cap as bigint,
    depthMinLuminance: (minLum as unknown[]).map(Number),
    depthCoefBp: (coef as unknown[]).map(Number),
    claimFeeMaxBp: Number(feeMax),
    claimFeeDecayDays: Number(feeDays),
    pool: { balance: balance as bigint, available: available as bigint, reserved: reserved as bigint, owed: owed as bigint },
    todayPoints: todayPoints as bigint,
    decks: decks as [Deck, Deck, Deck],
    alive: (alive as unknown[]).map(Number) as [number, number, number],
    maxAlive: (maxAlive as unknown[]).map(Number) as [number, number, number],
    spireSaleStart: saleStart as bigint,
    paused: { minter: mPaused as boolean, expedition: ePaused as boolean },
  };
}

export async function readPlayer(client: PublicClient, c: Contracts, account: Address): Promise<PlayerState> {
  const r = reader(client);
  const [rvyn, allowance, approved, credit, lastClaimAt, used, early] = await Promise.all([
    r(c.rvyn, ERC20_ABI, "balanceOf", [account]),
    r(c.rvyn, ERC20_ABI, "allowance", [account, c.minter]),
    r(c.nft, ABI.LightdiveNFT, "isApprovedForAll", [account, c.expedition]),
    r(c.expedition, ABI.Expedition, "credit", [account]),
    r(c.expedition, ABI.Expedition, "lastClaimAt", [account]),
    Promise.all([0, 1, 2].map((k) => r(c.minter, ABI.LightdiveMinter, "firstMintUsed", [account, k]))),
    r(c.minter, ABI.LightdiveMinter, "earlySpires", [account]),
  ]);
  return {
    rvyn: rvyn as bigint,
    allowance: allowance as bigint,
    approvedForGame: approved as boolean,
    credit: credit as bigint,
    lastClaimAt: BigInt(lastClaimAt as number | bigint),
    firstMintUsed: used as [boolean, boolean, boolean],
    earlySpires: Number(early),
  };
}

/** Event logs in chunks, so public RPCs that cap the block range still answer. */
async function logs<T>(client: PublicClient, fetch: (from: bigint, to: bigint) => Promise<T[]>): Promise<T[]> {
  const latest = await client.getBlockNumber({ cacheTime: 0 }); // the default cache would miss a transaction confirmed seconds ago
  const step = 50_000n;
  const out: T[] = [];
  for (let from = DEPLOYMENT_BLOCK; from <= latest; from += step) {
    const to = from + step - 1n > latest ? latest : from + step - 1n;
    out.push(...(await fetch(from, to)));
  }
  return out;
}

async function attributesOf(client: PublicClient, c: Contracts, ids: bigint[]): Promise<Nft[]> {
  const r = reader(client);
  const found = await Promise.all(
    ids.map((id) => r(c.nft, ABI.LightdiveNFT, "attributes", [id]).then((a) => ({ id, attributes: normalize(a) })).catch(() => null)),
  );
  return found.filter((x): x is Nft => x !== null);
}

function normalize(a: unknown): Attributes {
  const x = a as Record<string, number | bigint>;
  return {
    kind: Number(x.kind),
    rarity: Number(x.rarity),
    trait: Number(x.trait),
    variant: Number(x.variant),
    luminance: Number(x.luminance),
    voyagesLeft: Number(x.voyagesLeft),
    deck: Number(x.deck),
    dna: BigInt(x.dna),
  };
}

/** NFTs currently in the player's wallet (not the ones equipped in a team). */
export async function readWalletNfts(client: PublicClient, c: Contracts, account: Address): Promise<Nft[]> {
  const transfers = await logs(client, (fromBlock, toBlock) =>
    client.getContractEvents({ address: c.nft, abi: ABI.LightdiveNFT, eventName: "Transfer", args: { to: account }, fromBlock, toBlock }),
  );
  const ids = [...new Set(transfers.map((l) => (l.args as { tokenId?: bigint; id?: bigint }).tokenId ?? (l.args as { id: bigint }).id))];
  const r = reader(client);
  const owners = await Promise.all(ids.map((id) => r(c.nft, ABI.LightdiveNFT, "ownerOf", [id]).catch(() => null)));
  const mine = ids.filter((_, i) => typeof owners[i] === "string" && (owners[i] as string).toLowerCase() === account.toLowerCase());
  return (await attributesOf(client, c, mine)).sort((a, b) => a.attributes.kind - b.attributes.kind || b.attributes.rarity - a.attributes.rarity || Number(a.id - b.id));
}

export async function readTeams(client: PublicClient, c: Contracts, account: Address): Promise<Team[]> {
  const equipped = await logs(client, (fromBlock, toBlock) =>
    client.getContractEvents({ address: c.expedition, abi: ABI.Expedition, eventName: "Equipped", args: { owner: account }, fromBlock, toBlock }),
  );
  const spires = [...new Set(equipped.map((l) => (l.args as { spire: bigint }).spire))];
  const r = reader(client);
  const teams: Team[] = [];
  for (const spire of spires) {
    const t = (await r(c.expedition, ABI.Expedition, "team", [spire])) as { owner: Address; prism: bigint; seekers: readonly bigint[] };
    if (t.owner.toLowerCase() !== account.toLowerCase()) continue;
    const [members, luminance, lastPlusOne] = await Promise.all([
      attributesOf(client, c, [spire, ...(t.prism ? [t.prism] : []), ...t.seekers]),
      r(c.expedition, ABI.Expedition, "teamLuminance", [spire]),
      r(c.expedition, ABI.Expedition, "lastDiveDayPlusOne", [spire]),
    ]);
    const spireNft = members.find((m) => m.id === spire);
    if (!spireNft) continue;
    teams.push({
      spire: spireNft,
      prism: t.prism ? members.find((m) => m.id === t.prism) ?? null : null,
      seekers: members.filter((m) => m.attributes.kind === KIND.seeker),
      luminance: luminance as bigint,
      lastDiveDay: Number(lastPlusOne) === 0 ? null : Number(lastPlusOne) - 1,
    });
  }
  return teams;
}

export async function readDives(client: PublicClient, c: Contracts, account: Address): Promise<DiveRecord[]> {
  const [dived, settled] = await Promise.all([
    logs(client, (fromBlock, toBlock) =>
      client.getContractEvents({ address: c.expedition, abi: ABI.Expedition, eventName: "Dived", args: { owner: account }, fromBlock, toBlock })),
    logs(client, (fromBlock, toBlock) =>
      client.getContractEvents({ address: c.expedition, abi: ABI.Expedition, eventName: "Settled", args: { owner: account }, fromBlock, toBlock })),
  ]);
  const results = new Map(settled.map((l) => {
    const a = l.args as { diveId: bigint; tier: number; multX100: number; lightdust: bigint; reward: bigint; fallbackUsed: boolean };
    return [a.diveId, { tier: Number(a.tier), multX100: Number(a.multX100), lightdust: a.lightdust, reward: a.reward, fallbackUsed: a.fallbackUsed }];
  }));
  return dived
    .map((l) => {
      const a = l.args as { diveId: bigint; spire: bigint; depth: number; coordinate: number; luminance: bigint; points: bigint; beam: number; day: number; hour: bigint };
      const result = results.get(a.diveId) ?? null;
      return { id: a.diveId, spire: a.spire, depth: Number(a.depth), coordinate: Number(a.coordinate), day: Number(a.day), hour: a.hour, beam: Number(a.beam), points: a.points, luminance: a.luminance, settled: result !== null, result };
    })
    .sort((a, b) => Number(b.id - a.id));
}

export async function readMintRequests(client: PublicClient, c: Contracts, account: Address): Promise<MintRequest[]> {
  const requested = await logs(client, (fromBlock, toBlock) =>
    client.getContractEvents({ address: c.minter, abi: ABI.LightdiveMinter, eventName: "MintRequested", args: { player: account }, fromBlock, toBlock }),
  );
  const r = reader(client);
  const out: MintRequest[] = [];
  for (const l of requested) {
    const id = (l.args as { requestId: bigint }).requestId;
    const req = (await r(c.minter, ABI.LightdiveMinter, "request", [id])) as { kind: number; qty: number; hour: bigint; fulfilled: boolean; entropy: `0x${string}` };
    let ready = false;
    if (!req.fulfilled) {
      const [ok] = (await r(c.beacon, ABI.RandomnessBeacon, "randomFor", [req.hour, req.entropy])) as [boolean, boolean, bigint];
      ready = ok;
    }
    out.push({ id, kind: Number(req.kind), qty: Number(req.qty), hour: req.hour, fulfilled: req.fulfilled, ready });
  }
  return out.sort((a, b) => Number(b.id - a.id));
}

/** Whether a dive can be settled now: its day is over and its hour revealed (or expired after 48h). */
export async function diveSettleable(client: PublicClient, c: Contracts, dive: DiveRecord, today: number): Promise<boolean> {
  if (dive.settled || dive.day >= today) return false;
  const info = (await client.readContract({ address: c.expedition, abi: ABI.Expedition, functionName: "diveInfo", args: [dive.id] })) as { entropy: `0x${string}` };
  const [ok] = (await client.readContract({ address: c.beacon, abi: ABI.RandomnessBeacon, functionName: "randomFor", args: [dive.hour, info.entropy] })) as [boolean, boolean, bigint];
  return ok;
}

/** Team luminance as the contract computes it, for previews before equipping. */
export function previewLuminance(spire: Nft, prism: Nft | null, seekers: Nft[]): number {
  const fixed = spire.attributes.luminance + (prism?.attributes.luminance ?? 0);
  return Math.floor((fixed * seekers.length) / spire.attributes.trait) + seekers.reduce((s, n) => s + n.attributes.luminance, 0);
}
