// Stateful fuzz test for RovynPresaleV6: random legal and illegal actions in random order, with the money and
// supply invariants checked after every single action (including the ones that revert).
// Reproducible: set FUZZ_SEED to replay a run; FUZZ_RUNS / FUZZ_STEPS change its size.
import test from "node:test";
import assert from "node:assert/strict";
import { A, DAY, E, State, world } from "./helpers/v6-world.mjs";

const SEED = Number(process.env.FUZZ_SEED || 20261006);
const RUNS = Number(process.env.FUZZ_RUNS || 8);
const STEPS = Number(process.env.FUZZ_STEPS || 45);
const stats = new Map(); // "action:success|reverted" -> count, so we can see the runs reached the deep states

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

async function oneRun(runSeed) {
  const rand = rng(runSeed);
  const int = (n) => Math.floor(rand() * n);
  const pick = (arr) => arr[int(arr.length)];
  const w = await world({ buyersCount: 8, withdrawStepBps: pick([2500n, 5000n, 10_000n, 1n]) });
  const log = [];
  try {
    await w.openSale();
    const supply0 = E("10000000");
    const recipients = w.accounts.slice(10, 14);
    let claimedByBuyer = new Map();

    const checkInvariants = async (label) => {
      const state = Number(await w.sread("state"));
      const raised = await w.sread("raised");
      const revenue = await w.sread("liquidityRevenueReceived");
      const saleTokens = await w.bal(w.sale);
      const saleEth = await w.client.getBalance({ address: w.sale });
      const totalSupply = await w.read(w.token, "LaunchToken", "totalSupply");
      const burned = await w.sread("unsoldBurned");
      const ctx = `${label} | state ${state} | log: ${log.slice(-6).join(" > ")}`;
      assert.equal(totalSupply, supply0 - burned, `supply conserved: ${ctx}`);
      if (state === State.Settled) {
        const claimable = await w.sread("claimableTokensRemaining");
        const lpLeft = await w.sread("lpTokensRemaining");
        const productLeft = E("1000000") - (await w.sread("productSpent"));
        const communityLeft = E("1000000") - (await w.sread("communitySpent"));
        const airdropLeft = E("500000") - (await w.sread("airdropSpent"));
        assert.equal(saleTokens, claimable + lpLeft + productLeft + communityLeft + airdropLeft, `token accounting exact: ${ctx}`);
        const operating = await w.sread("operatingFunds");
        const withdrawn = await w.sread("projectEthWithdrawn");
        assert.equal(saleEth, operating - withdrawn, `ETH accounting exact: ${ctx}`);
        assert.ok((await w.sread("unlockedProjectEth")) <= operating, `unlock never exceeds operating funds: ${ctx}`);
        assert.ok(withdrawn <= (await w.sread("unlockedProjectEth")), `withdrawn never exceeds unlocked: ${ctx}`);
        assert.ok((await w.sread("tokensClaimed")) <= (raised * E("1")) / E("0.0001"), `claims bounded by sales: ${ctx}`);
      } else if (state === State.Open || state === State.Closed) {
        assert.equal(saleTokens, supply0, `all RVYN still inside: ${ctx}`);
        assert.equal(saleEth, raised + revenue, `ETH equals raise plus revenue: ${ctx}`);
        assert.ok(raised <= E("100"), `hard cap respected: ${ctx}`);
      }
      for (const b of w.buyers) {
        const bal = await w.bal(b);
        const owed = await w.sread("contributions", [b]);
        if (state !== State.Settled) assert.equal(bal, 0n, `no RVYN before settlement: ${ctx}`);
        else assert.ok(bal + (owed * E("1")) / E("0.0001") >= 0n && bal === (claimedByBuyer.get(b) || 0n), `buyer balance equals what they claimed: ${ctx}`);
      }
    };

    const actions = [
      async () => { const b = pick(w.buyers); const paid = await w.sread("contributions", [b]); const room = 2500 - Number(paid / E("0.0001")); const q = room > 0 ? 1 + int(Math.min(room, 700)) : 2500; log.push(`buy ${q}`); return w.buy(b, q); },
      async () => { const e = E(String((1 + int(50)) / 100)); log.push(`revenue ${e}`); return w.S("depositLiquidityRevenue", [], w.sponsor, e); },
      async () => { const who = rand() < 0.7 ? w.sponsor : w.stranger; log.push(`close by ${who === w.sponsor ? "sponsor" : "stranger"}`); return w.S("close", [], who); },
      async () => {
        const who = rand() < 0.6 ? w.sponsor : w.stranger;
        const min = await w.sread("minPoolEth"); const max = await w.sread("maxPoolEth");
        const span = max - min; const pool = span > 0n ? min + (span * BigInt(int(1001))) / 1000n : min;
        const bad = rand() < 0.2 ? (rand() < 0.5 ? min - 1n : max + 1n) : pool;
        log.push(`settle by ${who === w.sponsor ? "sponsor" : "stranger"} pool ${bad}`); return w.S("settle", [bad < 0n ? 0n : bad], who);
      },
      async () => { const b = pick(w.buyers); log.push("claim"); const before = await w.bal(b); const r = await w.S("claim", [], b); if (r.status === "success") claimedByBuyer.set(b, (claimedByBuyer.get(b) || 0n) + ((await w.bal(b)) - before)); return r; },
      async () => { const max = await w.sread("withdrawableProjectEth"); const amt = max > 0n && rand() < 0.8 ? (max * BigInt(1 + int(100))) / 100n : max + 1n; log.push(`withdraw ${amt}`); return w.S("withdrawProjectFunds", [amt]); },
      async () => { log.push("distributeProduct"); return w.S("distributeProduct", [pick(recipients), E(String(1 + int(400_000))), `0x${"ab".repeat(32)}`]); },
      async () => { log.push("distributeCommunity"); return w.S("distributeCommunity", [pick(recipients), E(String(1 + int(400_000))), `0x${"cd".repeat(32)}`]); },
      async () => { log.push("airdrop"); return w.S("airdrop", [recipients.slice(0, 1 + int(4)), recipients.slice(0, 4).map(() => E(String(1 + int(60_000)))).slice(0, 1 + int(4)), `0x${"ef".repeat(32)}`]); },
      async () => { const t = pick([60, 3600, DAY, 8 * DAY, 20 * DAY, 45 * DAY]); log.push(`warp ${t}`); await w.warp(t); return null; },
      async () => {
        // Valid shape: tokens and ETH exactly at the fixed price (the pool was seeded at it), so the router uses both in full.
        const tokens = BigInt(1 + int(2000)); const dl = BigInt(Math.floor(Date.now() / 1000) + 400 * DAY);
        log.push(`addFutureLiquidity ${tokens}`); return w.S("addFutureLiquidity", [tokens * E("1"), 0n, 0n, dl], w.sponsor, tokens * 10n ** 14n);
      },
      async () => { log.push("buy by non-allowlisted"); return w.S("buy", [10n, []], w.stranger, 10n * E("0.0001")); },
    ];

    const byName = { buy: 0, revenue: 1, close: 2, settle: 3, claim: 4, withdraw: 5, product: 6, community: 7, airdrop: 8, warp: 9, future: 10, stranger: 11 };
    const weights = {
      [State.Open]: [["buy", 10], ["revenue", 2], ["close", 2], ["stranger", 1], ["warp", 1]],
      [State.Closed]: [["settle", 5], ["warp", 3], ["claim", 1], ["buy", 1]],
      [State.Settled]: [["claim", 6], ["withdraw", 4], ["product", 2], ["community", 2], ["airdrop", 2], ["future", 3], ["warp", 3], ["settle", 1]],
    };
    for (let step = 0; step < STEPS; step++) {
      const state = Number(await w.sread("state"));
      let action;
      if (rand() < 0.15 || !weights[state]) action = pick(actions);
      else {
        const table = weights[state]; const total = table.reduce((s, [, n]) => s + n, 0); let roll = int(total);
        const chosen = table.find(([, n]) => (roll -= n) < 0)[0];
        action = actions[byName[chosen]];
      }
      const receipt = await action();
      const key = `${log[log.length - 1].split(" ")[0]}:${receipt ? receipt.status : "n/a"}`;
      stats.set(key, (stats.get(key) || 0) + 1);
      await checkInvariants(`run ${runSeed} step ${step}`);
    }
    // Force the sale to finish and drain every claim: the end state must reconcile exactly.
    if (Number(await w.sread("state")) === State.Open) await w.S("close");
    if (Number(await w.sread("state")) === State.Closed) { await w.warp(8 * DAY); await w.S("settle", [0n], w.stranger); }
    if (Number(await w.sread("state")) === State.Settled) {
      for (const b of w.buyers) { const before = await w.bal(b); const r = await w.S("claim", [], b); if (r.status === "success") claimedByBuyer.set(b, (claimedByBuyer.get(b) || 0n) + ((await w.bal(b)) - before)); }
      await checkInvariants(`run ${runSeed} final`);
      assert.equal(await w.sread("claimableTokensRemaining"), 0n, "every buyer could claim in full");
      assert.equal(await w.sread("tokensClaimed"), (await w.sread("raised")) * E("1") / E("0.0001"), "claimed equals sold");
    }
    return log.length;
  } finally {
    await w.done();
  }
}

test(`V6 fuzz: ${RUNS} random runs of ${STEPS} actions keep every invariant (seed ${SEED})`, async () => {
  let total = 0;
  for (let run = 0; run < RUNS; run++) total += await oneRun(SEED + run * 7919);
  assert.ok(total >= RUNS * STEPS);
  const ok = (name) => stats.get(`${name}:success`) || 0;
  console.log([...stats.entries()].sort().map(([k, v]) => `${k}=${v}`).join("  "));
  // The point of the test is lost if the random walk never gets past the opening moves.
  for (const name of ["buy", "close", "settle", "claim", "withdraw", "distributeProduct", "airdrop", "addFutureLiquidity"]) assert.ok(ok(name) >= 3, `fuzz reached a successful ${name}`);
});

void A;
