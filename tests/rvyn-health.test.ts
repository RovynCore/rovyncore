import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOCATION_CAPS,
  DAY,
  TOTAL_SUPPLY,
  VESTING_CLIFF,
  VESTING_INTERVAL,
  deriveHealth,
  readRvynHealth,
  toBps,
  vestingSchedule,
  type HealthClient,
  type HealthConfig,
} from "../lib/rvyn-health.ts";

const E18 = 10n ** 18n;
const ZERO = "0x0000000000000000000000000000000000000000";
const TOKEN = "0x545a1ff27596de2f31480df39aa9548f363fc361";
const SALE = "0x6496fc99ba4d5904e6c99488a9a9f477605146ac";
const ADMIN = "0xee4c435b9207ba5bb5f4860156409ae78032ff6e";
const SAFE = "0xe574e30153efcd94f686124b2d586a0643b33ef4";
const VESTING = "0x1111111111111111111111111111111111111111";
const LOCK = "0x2222222222222222222222222222222222222222";
const PAIR = "0x3333333333333333333333333333333333333333";

const config: HealthConfig = {
  chainId: 4663,
  token: TOKEN,
  sale: SALE,
  wallets: [
    { id: "admin", address: ADMIN },
    { id: "safe", address: SAFE },
  ],
};

type Table = Record<string, unknown>;
/** A fake chain: answers by "address:function[:arg]"; a missing key reverts like a failed RPC read. */
function fakeChain(table: Table, block = { number: 100n, timestamp: 1_800_000_000n }): HealthClient {
  return {
    async getBlock() {
      if (!block) throw new Error("rpc down");
      return block;
    },
    async readContract({ address, functionName, args }) {
      const key = `${address.toLowerCase()}:${functionName}${args && args.length ? `:${String(args[0]).toLowerCase()}` : ""}`;
      if (!(key in table)) throw new Error(`revert ${key}`);
      return table[key];
    },
  };
}

const pendingSale = (): Table => ({
  [`${TOKEN}:totalSupply`]: TOTAL_SUPPLY,
  [`${TOKEN}:balanceOf:${SALE}`]: 0n,
  [`${TOKEN}:balanceOf:${ADMIN}`]: TOTAL_SUPPLY,
  [`${TOKEN}:balanceOf:${SAFE}`]: 0n,
  [`${SALE}:state`]: 0,
  [`${SALE}:raised`]: 0n,
  [`${SALE}:openedAt`]: 0n,
  [`${SALE}:endsAt`]: 0n,
  [`${SALE}:closedAt`]: 0n,
  [`${SALE}:allowlistRoot`]: `0x${"0".repeat(64)}`,
  [`${SALE}:inventoryDeposited`]: false,
  [`${SALE}:managerAllocationReleased`]: false,
  [`${SALE}:pair`]: ZERO,
  [`${SALE}:initialLpLock`]: ZERO,
  [`${SALE}:teamVesting`]: ZERO,
  [`${SALE}:initialPoolEth`]: 0n,
  [`${SALE}:initialPoolTokens`]: 0n,
  [`${SALE}:projectEthWithdrawn`]: 0n,
  [`${SALE}:withdrawableProjectEth`]: 0n,
  [`${SALE}:liquidityRevenueReceived`]: 0n,
  [`${SALE}:unsoldBurned`]: 0n,
  [`${SALE}:airdropSpent`]: 0n,
  [`${SALE}:productSpent`]: 0n,
  [`${SALE}:communitySpent`]: 0n,
});

test("a sale that has not started is reported as pending, with nothing invented", async () => {
  const view = deriveHealth(await readRvynHealth(fakeChain(pendingSale()), config));
  assert.equal(view.complete, true);
  assert.equal(view.sale.state, "pending");
  assert.equal(view.sale.raised, 0n);
  assert.equal(view.sale.progressBps, 0);
  assert.equal(view.sale.allowlistRootSet, false);
  assert.equal(view.sale.inventoryDeposited, false);
  assert.equal(view.sale.pool.pair, null);
  assert.equal(view.vesting, null, "no vesting contract exists yet");
  assert.equal(view.lock, null, "no LP lock exists yet");
  assert.equal(view.token.supply, TOTAL_SUPPLY);
  assert.equal(view.token.burned, 0n);
  assert.deepEqual(view.alerts, []);
  assert.deepEqual(view.token.balances.map((entry) => [entry.id, entry.amount]), [["sale", 0n], ["admin", TOTAL_SUPPLY], ["safe", 0n]]);
  assert.equal(view.block?.number, "100");
});

test("an open sale shows progress, the allowlist flag and the time left from the chain clock", async () => {
  const table = pendingSale();
  Object.assign(table, {
    [`${SALE}:state`]: 1,
    [`${SALE}:raised`]: 25n * E18,
    [`${SALE}:openedAt`]: 1_799_000_000n,
    [`${SALE}:endsAt`]: 1_800_000_500n,
    [`${SALE}:allowlistRoot`]: `0x${"ab".repeat(32)}`,
    [`${SALE}:inventoryDeposited`]: true,
    [`${SALE}:managerAllocationReleased`]: true,
    [`${SALE}:teamVesting`]: VESTING,
    [`${VESTING}:allocation`]: 1_000_000n * E18,
    [`${VESTING}:start`]: 1_799_000_000n,
    [`${VESTING}:released`]: 0n,
    [`${VESTING}:vested`]: 0n,
    [`${VESTING}:releasable`]: 0n,
  });
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config), 1);
  assert.equal(view.sale.state, "open");
  assert.equal(view.sale.progressBps, 2500);
  assert.equal(view.sale.secondsLeft, 500, "uses the block timestamp, not the caller's clock");
  assert.equal(view.sale.allowlistRootSet, true);
  assert.equal(view.vesting?.vestedBps, 0);
  assert.equal(view.vesting?.schedule?.releasesUnlocked, 0);
  assert.equal(view.allocations.find((entry) => entry.id === "manager")?.released, true);
});

test("a V6 sale has no manager getter: release is derived from the settled state", async () => {
  const pending = pendingSale(); delete pending[`${SALE}:managerAllocationReleased`];
  const before = deriveHealth(await readRvynHealth(fakeChain(pending), config));
  assert.equal(before.allocations.find((entry) => entry.id === "manager")?.released, false);
  assert.equal(before.complete, true, "the derived value counts as a successful read");
  const settled = pendingSale(); delete settled[`${SALE}:managerAllocationReleased`]; settled[`${SALE}:state`] = 3;
  const after = deriveHealth(await readRvynHealth(fakeChain(settled), config));
  assert.equal(after.allocations.find((entry) => entry.id === "manager")?.released, true);
});

test("an open sale whose window has passed is flagged but not called closed", async () => {
  const table = pendingSale();
  Object.assign(table, { [`${SALE}:state`]: 1, [`${SALE}:endsAt`]: 1_700_000_000n });
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.sale.state, "open");
  assert.equal(view.sale.secondsLeft, 0);
  assert.deepEqual(view.alerts.map((alert) => alert.id), ["sale_window_ended"]);
});

test("raised above the hard cap never reports more than 100% progress", () => {
  assert.equal(toBps(150n, 100n), 15_000);
  const raw = {
    chainId: 4663,
    block: { number: 1n, timestamp: 10 },
    supply: { ok: true as const, value: TOTAL_SUPPLY },
    balances: [],
    sale: { ...Object.fromEntries(["state", "raised", "openedAt", "endsAt", "closedAt", "allowlistRoot", "inventoryDeposited", "managerReleased", "pair", "lock", "vesting", "poolEth", "poolTokens", "withdrawn", "withdrawable", "revenue", "unsoldBurned", "airdropSpent", "productSpent", "communitySpent"].map((key) => [key, { ok: false as const }])), raised: { ok: true as const, value: 150n * E18 } },
    vesting: null,
    lock: null,
  };
  const view = deriveHealth(raw as never);
  assert.equal(view.sale.progressBps, 10_000);
});

test("a settled sale reports the pool, the initial LP lock and its share of LP supply", async () => {
  const table = pendingSale();
  Object.assign(table, {
    [`${SALE}:state`]: 3,
    [`${SALE}:raised`]: 40n * E18,
    [`${SALE}:pair`]: PAIR,
    [`${SALE}:initialLpLock`]: LOCK,
    [`${SALE}:initialPoolEth`]: 20n * E18,
    [`${SALE}:initialPoolTokens`]: 200_000n * E18,
    [`${SALE}:withdrawableProjectEth`]: 20n * E18,
    [`${SALE}:unsoldBurned`]: 600_000n * E18,
    [`${TOKEN}:totalSupply`]: TOTAL_SUPPLY - 600_000n * E18,
    [`${LOCK}:start`]: 1_900_000_000n,
    [`${LOCK}:duration`]: 0n,
    [`${PAIR}:balanceOf:${LOCK}`]: 99n,
    [`${PAIR}:totalSupply`]: 100n,
  });
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.sale.state, "settled");
  assert.equal(view.sale.pool.pair, PAIR);
  assert.equal(view.sale.pool.eth, 20n * E18);
  assert.equal(view.token.burned, 600_000n * E18);
  assert.deepEqual(view.alerts.map((alert) => alert.id), ["supply_reduced"]);
  assert.equal(view.lock?.shareBps, 9900);
  assert.equal(view.lock?.unlockAt, 1_900_000_000);
  assert.equal(view.lock?.unlocked, false);
});

test("an LP lock whose unlock time has passed is shown as unlocked", async () => {
  const table = pendingSale();
  Object.assign(table, {
    [`${SALE}:state`]: 3, [`${SALE}:pair`]: PAIR, [`${SALE}:initialLpLock`]: LOCK,
    [`${LOCK}:start`]: 1_700_000_000n, [`${LOCK}:duration`]: 0n, [`${PAIR}:balanceOf:${LOCK}`]: 5n, [`${PAIR}:totalSupply`]: 5n,
  });
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.lock?.unlocked, true);
});

test("supply above the documented total is a warning, never silently accepted", async () => {
  const table = pendingSale();
  table[`${TOKEN}:totalSupply`] = TOTAL_SUPPLY + 1n;
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.deepEqual(view.alerts, [{ id: "supply_increased", severity: "warn" }]);
});

test("failed reads become unavailable values and a partial-data notice instead of throwing", async () => {
  const table = pendingSale();
  delete table[`${SALE}:raised`];
  delete table[`${TOKEN}:balanceOf:${ADMIN}`];
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.complete, false);
  assert.equal(view.sale.raised, null);
  assert.equal(view.sale.progressBps, null);
  assert.equal(view.token.balances.find((entry) => entry.id === "admin")?.amount, null);
  assert.deepEqual(view.alerts.map((alert) => alert.id), ["partial_data"]);
});

test("when every sale read fails the sale is unreadable, not 'pending'", async () => {
  const table: Table = { [`${TOKEN}:totalSupply`]: TOTAL_SUPPLY };
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.sale.readable, false);
  assert.equal(view.sale.state, null);
  assert.ok(view.alerts.some((alert) => alert.id === "sale_unreadable" && alert.severity === "warn"));
});

test("an unknown sale state index is treated as unreadable", async () => {
  const table = pendingSale();
  table[`${SALE}:state`] = 9;
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.sale.state, null);
});

test("a malformed contract answer is rejected rather than rendered", async () => {
  const table = pendingSale();
  table[`${SALE}:raised`] = "12";
  const view = deriveHealth(await readRvynHealth(fakeChain(table), config));
  assert.equal(view.sale.raised, null);
  assert.equal(view.complete, false);
});

test("without a block the view falls back to the caller's clock and says data is partial", async () => {
  const chain = fakeChain(pendingSale(), null as never);
  const view = deriveHealth(await readRvynHealth(chain, config), 1234);
  assert.equal(view.block, null);
  assert.equal(view.complete, false);
});

test("vesting schedule matches RovynTeamVesting: one-year cliff, first release a month later, 24 in total", () => {
  const start = 1_000_000;
  const first = start + VESTING_CLIFF + VESTING_INTERVAL;
  assert.equal(vestingSchedule(start, start).releasesUnlocked, 0);
  assert.equal(vestingSchedule(start, start + VESTING_CLIFF).releasesUnlocked, 0, "nothing at the cliff itself");
  assert.equal(vestingSchedule(start, first - 1).releasesUnlocked, 0);
  assert.equal(vestingSchedule(start, first).releasesUnlocked, 1);
  assert.equal(vestingSchedule(start, first).nextReleaseAt, first + VESTING_INTERVAL);
  assert.equal(vestingSchedule(start, first + 23 * VESTING_INTERVAL).releasesUnlocked, 24);
  assert.equal(vestingSchedule(start, first + 800 * DAY).releasesUnlocked, 24, "capped at 24");
  assert.equal(vestingSchedule(start, first + 800 * DAY).nextReleaseAt, null);
  assert.equal(vestingSchedule(start, start).finalReleaseAt, first + 23 * VESTING_INTERVAL);
  assert.equal(vestingSchedule(start, start).nextReleaseAt, first, "before the cliff the next release is the first one");
});

test("allocation caps add up to 3,000,000 RVYN of admin-directed tokens", () => {
  const total = Object.values(ALLOCATION_CAPS).reduce((sum, cap) => sum + cap, 0n);
  assert.equal(total, 3_000_000n * E18);
});
