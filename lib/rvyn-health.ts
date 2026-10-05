import { formatUnits, parseAbi, type Address } from "viem";

// Read-only RVYN health snapshot. Every figure comes from a contract getter at the latest block;
// nothing here is a rating, a price or a promise. A failed read is reported as unavailable, never guessed.

export const TOKEN_DECIMALS = 18;
export const TOTAL_SUPPLY = 10_000_000n * 10n ** 18n;
export const HARD_CAP_WEI = 100n * 10n ** 18n;
export const DAY = 86_400;
// RovynTeamVesting constants in packages/contracts/v5/RovynPresaleV5.sol.
export const VESTING_CLIFF = 365 * DAY;
export const VESTING_INTERVAL = 30 * DAY;
export const VESTING_RELEASES = 24;
// Per-category caps defined by RovynPresaleV5.
export const ALLOCATION_CAPS = {
  manager: 500_000n * 10n ** 18n,
  product: 1_000_000n * 10n ** 18n,
  community: 1_000_000n * 10n ** 18n,
  airdrop: 500_000n * 10n ** 18n,
} as const;

export const SALE_STATES = ["pending", "open", "closed", "settled", "cancelled"] as const;
export type SaleStateName = (typeof SALE_STATES)[number];

const ZERO = "0x0000000000000000000000000000000000000000";

export const tokenAbi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);
export const saleAbi = parseAbi([
  "function state() view returns (uint8)",
  "function raised() view returns (uint256)",
  "function openedAt() view returns (uint256)",
  "function endsAt() view returns (uint256)",
  "function closedAt() view returns (uint256)",
  "function allowlistRoot() view returns (bytes32)",
  "function inventoryDeposited() view returns (bool)",
  "function managerAllocationReleased() view returns (bool)",
  "function pair() view returns (address)",
  "function initialLpLock() view returns (address)",
  "function teamVesting() view returns (address)",
  "function initialPoolEth() view returns (uint256)",
  "function initialPoolTokens() view returns (uint256)",
  "function projectEthWithdrawn() view returns (uint256)",
  "function withdrawableProjectEth() view returns (uint256)",
  "function liquidityRevenueReceived() view returns (uint256)",
  "function unsoldBurned() view returns (uint256)",
  "function airdropSpent() view returns (uint256)",
  "function productSpent() view returns (uint256)",
  "function communitySpent() view returns (uint256)",
]);
export const vestingAbi = parseAbi([
  "function allocation() view returns (uint256)",
  "function start() view returns (uint256)",
  "function released() view returns (uint256)",
  "function vested() view returns (uint256)",
  "function releasable() view returns (uint256)",
]);
export const lockAbi = parseAbi([
  "function start() view returns (uint256)",
  "function duration() view returns (uint256)",
  "function released() view returns (uint256)",
]);
export const pairAbi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

export type HealthConfig = {
  chainId: number;
  token: Address;
  sale: Address;
  /** Wallets whose RVYN balance is shown, keyed by a stable id the UI translates. */
  wallets: { id: "admin" | "safe"; address: Address }[];
};

/** Minimal read surface so tests can supply a fake chain. */
export type HealthClient = {
  readContract(args: { address: Address; abi: readonly unknown[]; functionName: string; args?: readonly unknown[] }): Promise<unknown>;
  getBlock(): Promise<{ number: bigint; timestamp: bigint }>;
};

export type Read<T> = { ok: true; value: T } | { ok: false };
const unavailable = { ok: false } as const;

async function attempt<T>(promise: Promise<unknown>, cast: (value: unknown) => T): Promise<Read<T>> {
  try {
    return { ok: true, value: cast(await promise) };
  } catch {
    return unavailable;
  }
}
const asBigint = (value: unknown) => {
  if (typeof value !== "bigint") throw new Error("expected bigint");
  return value;
};
const asBool = (value: unknown) => {
  if (typeof value !== "boolean") throw new Error("expected bool");
  return value;
};
const asNumber = (value: unknown) => {
  if (typeof value !== "number" && typeof value !== "bigint") throw new Error("expected number");
  return Number(value);
};
const asAddress = (value: unknown) => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("expected address");
  return value as Address;
};
const asBytes32 = (value: unknown) => {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error("expected bytes32");
  return value;
};

export type RawHealth = {
  chainId: number;
  block: { number: bigint; timestamp: number } | null;
  supply: Read<bigint>;
  balances: { id: string; amount: Read<bigint> }[];
  sale: {
    state: Read<number>;
    raised: Read<bigint>;
    openedAt: Read<bigint>;
    endsAt: Read<bigint>;
    closedAt: Read<bigint>;
    allowlistRoot: Read<string>;
    inventoryDeposited: Read<boolean>;
    managerReleased: Read<boolean>;
    pair: Read<Address>;
    lock: Read<Address>;
    vesting: Read<Address>;
    poolEth: Read<bigint>;
    poolTokens: Read<bigint>;
    withdrawn: Read<bigint>;
    withdrawable: Read<bigint>;
    revenue: Read<bigint>;
    unsoldBurned: Read<bigint>;
    airdropSpent: Read<bigint>;
    productSpent: Read<bigint>;
    communitySpent: Read<bigint>;
  };
  vesting: { allocation: Read<bigint>; start: Read<bigint>; released: Read<bigint>; vested: Read<bigint>; releasable: Read<bigint> } | null;
  lock: { start: Read<bigint>; duration: Read<bigint>; lpBalance: Read<bigint>; lpSupply: Read<bigint> } | null;
};

const isSet = (read: Read<Address>) => read.ok && read.value.toLowerCase() !== ZERO;

export async function readRvynHealth(client: HealthClient, config: HealthConfig): Promise<RawHealth> {
  const sale = (functionName: string) => client.readContract({ address: config.sale, abi: saleAbi, functionName });
  const blockPromise = client.getBlock().then(
    (block) => ({ number: block.number, timestamp: Number(block.timestamp) }),
    () => null,
  );
  const [block, supply, balances, state, raised, openedAt, endsAt, closedAt, allowlistRoot, inventoryDeposited, managerReleased, pair, lock, vesting, poolEth, poolTokens, withdrawn, withdrawable, revenue, unsoldBurned, airdropSpent, productSpent, communitySpent] = await Promise.all([
    blockPromise,
    attempt(client.readContract({ address: config.token, abi: tokenAbi, functionName: "totalSupply" }), asBigint),
    Promise.all(
      [{ id: "sale", address: config.sale }, ...config.wallets].map(async (wallet) => ({
        id: wallet.id,
        amount: await attempt(client.readContract({ address: config.token, abi: tokenAbi, functionName: "balanceOf", args: [wallet.address] }), asBigint),
      })),
    ),
    attempt(sale("state"), asNumber),
    attempt(sale("raised"), asBigint),
    attempt(sale("openedAt"), asBigint),
    attempt(sale("endsAt"), asBigint),
    attempt(sale("closedAt"), asBigint),
    attempt(sale("allowlistRoot"), asBytes32),
    attempt(sale("inventoryDeposited"), asBool),
    // V5 exposes the flag; V6 has no such getter because the manager allocation is released at settlement (state 3).
    (async () => {
      const direct = await attempt(sale("managerAllocationReleased"), asBool);
      if (direct.ok) return direct;
      const settled = await attempt(sale("state"), asNumber);
      return settled.ok ? { ok: true as const, value: settled.value === 3 } : direct;
    })(),
    attempt(sale("pair"), asAddress),
    attempt(sale("initialLpLock"), asAddress),
    attempt(sale("teamVesting"), asAddress),
    attempt(sale("initialPoolEth"), asBigint),
    attempt(sale("initialPoolTokens"), asBigint),
    attempt(sale("projectEthWithdrawn"), asBigint),
    attempt(sale("withdrawableProjectEth"), asBigint),
    attempt(sale("liquidityRevenueReceived"), asBigint),
    attempt(sale("unsoldBurned"), asBigint),
    attempt(sale("airdropSpent"), asBigint),
    attempt(sale("productSpent"), asBigint),
    attempt(sale("communitySpent"), asBigint),
  ]);

  const [vestingReads, lockReads] = await Promise.all([
    isSet(vesting) && vesting.ok
      ? (async () => {
          const read = (functionName: string) => client.readContract({ address: vesting.value, abi: vestingAbi, functionName });
          const [allocation, start, released, vested, releasable] = await Promise.all([
            attempt(read("allocation"), asBigint), attempt(read("start"), asBigint), attempt(read("released"), asBigint),
            attempt(read("vested"), asBigint), attempt(read("releasable"), asBigint),
          ]);
          return { allocation, start, released, vested, releasable };
        })()
      : null,
    isSet(lock) && lock.ok && isSet(pair) && pair.ok
      ? (async () => {
          const read = (functionName: string) => client.readContract({ address: lock.value, abi: lockAbi, functionName });
          const [start, duration, lpBalance, lpSupply] = await Promise.all([
            attempt(read("start"), asBigint), attempt(read("duration"), asBigint),
            attempt(client.readContract({ address: pair.value, abi: pairAbi, functionName: "balanceOf", args: [lock.value] }), asBigint),
            attempt(client.readContract({ address: pair.value, abi: pairAbi, functionName: "totalSupply" }), asBigint),
          ]);
          return { start, duration, lpBalance, lpSupply };
        })()
      : null,
  ]);

  return {
    chainId: config.chainId,
    block,
    supply,
    balances,
    sale: { state, raised, openedAt, endsAt, closedAt, allowlistRoot, inventoryDeposited, managerReleased, pair, lock, vesting, poolEth, poolTokens, withdrawn, withdrawable, revenue, unsoldBurned, airdropSpent, productSpent, communitySpent },
    vesting: vestingReads,
    lock: lockReads,
  };
}

// ---------------------------------------------------------------------------
// Pure derivation: no I/O below this line.
// ---------------------------------------------------------------------------

export type VestingSchedule = {
  cliffEndsAt: number;
  firstReleaseAt: number;
  finalReleaseAt: number;
  /** Releases unlocked at `now`, 0..24, following RovynTeamVesting.vested(). */
  releasesUnlocked: number;
  nextReleaseAt: number | null;
};

/** Mirrors RovynTeamVesting: first release one interval after the cliff, then every interval, 24 in total. */
export function vestingSchedule(start: number, now: number): VestingSchedule {
  const cliffEndsAt = start + VESTING_CLIFF;
  const firstReleaseAt = cliffEndsAt + VESTING_INTERVAL;
  const finalReleaseAt = firstReleaseAt + (VESTING_RELEASES - 1) * VESTING_INTERVAL;
  const releasesUnlocked = now < firstReleaseAt ? 0 : Math.min(VESTING_RELEASES, 1 + Math.floor((now - firstReleaseAt) / VESTING_INTERVAL));
  const nextReleaseAt = releasesUnlocked >= VESTING_RELEASES ? null : firstReleaseAt + releasesUnlocked * VESTING_INTERVAL;
  return { cliffEndsAt, firstReleaseAt, finalReleaseAt, releasesUnlocked, nextReleaseAt };
}

export function toBps(part: bigint, whole: bigint): number | null {
  if (whole <= 0n) return null;
  return Number((part * 10_000n) / whole);
}

export function tokenAmount(value: bigint): number {
  return Number(formatUnits(value, TOKEN_DECIMALS));
}
export function ethAmount(value: bigint): number {
  return Number(formatUnits(value, 18));
}

const value = <T>(read: Read<T>): T | null => (read.ok ? read.value : null);

export type AlertId = "supply_increased" | "supply_reduced" | "partial_data" | "sale_unreadable" | "sale_window_ended";
export type HealthAlert = { id: AlertId; severity: "info" | "warn" };

export type HealthView = {
  chainId: number;
  block: { number: string; timestamp: number } | null;
  complete: boolean;
  alerts: HealthAlert[];
  token: { supply: bigint | null; burned: bigint | null; balances: { id: string; amount: bigint | null }[] };
  sale: {
    readable: boolean;
    state: SaleStateName | null;
    raised: bigint | null;
    hardCap: bigint;
    progressBps: number | null;
    openedAt: number | null;
    endsAt: number | null;
    closedAt: number | null;
    secondsLeft: number | null;
    allowlistRootSet: boolean | null;
    inventoryDeposited: boolean | null;
    pool: { eth: bigint | null; tokens: bigint | null; pair: string | null };
    funds: { withdrawn: bigint | null; withdrawable: bigint | null; revenue: bigint | null };
    unsoldBurned: bigint | null;
  };
  allocations: { id: keyof typeof ALLOCATION_CAPS; cap: bigint; spent: bigint | null; released: boolean | null }[];
  vesting: null | {
    allocation: bigint | null;
    released: bigint | null;
    vested: bigint | null;
    releasable: bigint | null;
    vestedBps: number | null;
    schedule: VestingSchedule | null;
  };
  lock: null | {
    lockedLp: bigint | null;
    lpSupply: bigint | null;
    shareBps: number | null;
    unlockAt: number | null;
    unlocked: boolean | null;
  };
};

function allReads(raw: RawHealth): Read<unknown>[] {
  const reads: Read<unknown>[] = [raw.supply, ...raw.balances.map((entry) => entry.amount), ...Object.values(raw.sale)];
  if (raw.vesting) reads.push(...Object.values(raw.vesting));
  if (raw.lock) reads.push(...Object.values(raw.lock));
  return reads;
}

export function deriveHealth(raw: RawHealth, nowSeconds: number = Math.floor(Date.now() / 1000)): HealthView {
  // Prefer the chain's own clock so countdowns match what the contracts will compute.
  const now = raw.block?.timestamp ?? nowSeconds;
  const supply = value(raw.supply);
  const stateIndex = value(raw.sale.state);
  const state = stateIndex !== null && stateIndex >= 0 && stateIndex < SALE_STATES.length ? SALE_STATES[stateIndex] : null;
  const raised = value(raw.sale.raised);
  const endsAt = value(raw.sale.endsAt);
  const openedAt = value(raw.sale.openedAt);
  const closedAt = value(raw.sale.closedAt);
  const root = value(raw.sale.allowlistRoot);
  const pair = value(raw.sale.pair);
  const spent = {
    airdrop: value(raw.sale.airdropSpent),
    product: value(raw.sale.productSpent),
    community: value(raw.sale.communitySpent),
  };

  const complete = allReads(raw).every((read) => read.ok) && raw.block !== null;
  const alerts: HealthAlert[] = [];
  if (!complete) alerts.push({ id: "partial_data", severity: "info" });
  if (state === null) alerts.push({ id: "sale_unreadable", severity: "warn" });
  if (supply !== null && supply > TOTAL_SUPPLY) alerts.push({ id: "supply_increased", severity: "warn" });
  if (supply !== null && supply < TOTAL_SUPPLY) alerts.push({ id: "supply_reduced", severity: "info" });
  const endsAtSeconds = endsAt && endsAt > 0n ? Number(endsAt) : null;
  if (state === "open" && endsAtSeconds !== null && now >= endsAtSeconds) alerts.push({ id: "sale_window_ended", severity: "info" });

  let vesting: HealthView["vesting"] = null;
  if (raw.vesting) {
    const start = value(raw.vesting.start);
    const vested = value(raw.vesting.vested);
    const allocation = value(raw.vesting.allocation);
    vesting = {
      allocation,
      released: value(raw.vesting.released),
      vested,
      releasable: value(raw.vesting.releasable),
      vestedBps: vested !== null && allocation !== null ? toBps(vested, allocation) : null,
      schedule: start !== null ? vestingSchedule(Number(start), now) : null,
    };
  }

  let lock: HealthView["lock"] = null;
  if (raw.lock) {
    const start = value(raw.lock.start);
    const duration = value(raw.lock.duration);
    const lockedLp = value(raw.lock.lpBalance);
    const lpSupply = value(raw.lock.lpSupply);
    const unlockAt = start !== null && duration !== null ? Number(start + duration) : null;
    lock = {
      lockedLp,
      lpSupply,
      shareBps: lockedLp !== null && lpSupply !== null ? toBps(lockedLp, lpSupply) : null,
      unlockAt,
      unlocked: unlockAt === null ? null : now >= unlockAt,
    };
  }

  return {
    chainId: raw.chainId,
    block: raw.block ? { number: raw.block.number.toString(), timestamp: raw.block.timestamp } : null,
    complete,
    alerts,
    token: {
      supply,
      burned: supply !== null && supply < TOTAL_SUPPLY ? TOTAL_SUPPLY - supply : supply !== null ? 0n : null,
      balances: raw.balances.map((entry) => ({ id: entry.id, amount: value(entry.amount) })),
    },
    sale: {
      readable: state !== null,
      state,
      raised,
      hardCap: HARD_CAP_WEI,
      progressBps: raised !== null ? toBps(raised > HARD_CAP_WEI ? HARD_CAP_WEI : raised, HARD_CAP_WEI) : null,
      openedAt: openedAt && openedAt > 0n ? Number(openedAt) : null,
      endsAt: endsAtSeconds,
      closedAt: closedAt && closedAt > 0n ? Number(closedAt) : null,
      secondsLeft: state === "open" && endsAtSeconds !== null ? Math.max(0, endsAtSeconds - now) : null,
      allowlistRootSet: root === null ? null : /^0x0{64}$/i.test(root) ? false : true,
      inventoryDeposited: value(raw.sale.inventoryDeposited),
      pool: { eth: value(raw.sale.poolEth), tokens: value(raw.sale.poolTokens), pair: pair && pair.toLowerCase() !== ZERO ? pair : null },
      funds: { withdrawn: value(raw.sale.withdrawn), withdrawable: value(raw.sale.withdrawable), revenue: value(raw.sale.revenue) },
      unsoldBurned: value(raw.sale.unsoldBurned),
    },
    allocations: [
      { id: "manager", cap: ALLOCATION_CAPS.manager, spent: null, released: value(raw.sale.managerReleased) },
      { id: "product", cap: ALLOCATION_CAPS.product, spent: spent.product, released: null },
      { id: "community", cap: ALLOCATION_CAPS.community, spent: spent.community, released: null },
      { id: "airdrop", cap: ALLOCATION_CAPS.airdrop, spent: spent.airdrop, released: null },
    ],
    vesting,
    lock,
  };
}
