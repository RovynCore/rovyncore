import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, parseEther, keccak256, encodeAbiParameters } from "viem";

const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive/artifacts/contracts.json", "utf8"));
A.LaunchToken = JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")).LaunchToken;

const E = parseEther;
const HOUR = 3600;
const DAY = 86_400;
const SPIRE = 0, PRISM = 1, SEEKER = 2;
const seedFor = (hour) => keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], ["seed", BigInt(hour)]));
const commitmentOf = (seed) => keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));

// One fresh chain with the whole Lightdive system deployed and wired, the pool seeded with 1,000,000 RVYN.
async function world() {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 12, defaultBalance: 1000 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.getAddresses();
  const [admin, operator, treasury, alice, bob, stranger] = accounts;

  const deploy = async (name, args = []) => {
    const hash = await wallet.deployContract({ account: admin, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 14_000_000n });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", `${name} deploy`);
    return receipt.contractAddress;
  };
  const send = async (address, name, fn, args = [], account = admin) =>
    client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account, address, abi: A[name].abi, functionName: fn, args, gas: 14_000_000n }) });
  const ok = async (...a) => { const r = await send(...a); assert.equal(r.status, "success", `${a[2]} should succeed`); return r; };
  const no = async (...a) => assert.equal((await send(...a)).status, "reverted", `${a[2]} should revert`);
  const read = (address, name, fn, args = []) => client.readContract({ address, abi: A[name].abi, functionName: fn, args });
  const now = async () => Number((await client.getBlock()).timestamp);
  const warpTo = async (ts) => {
    const t = await now();
    if (ts > t) await provider.request({ method: "evm_increaseTime", params: [ts - t] });
    await provider.request({ method: "evm_mine", params: [] });
  };

  const rvyn = await deploy("LaunchToken", ["RovynCore", "RVYN", E("10000000"), admin]);
  const config = await deploy("LightdiveConfig", [admin]);
  const nft = await deploy("LightdiveNFT", [admin, treasury]);
  const beacon = await deploy("RandomnessBeacon", [admin, operator]);
  const pool = await deploy("CoreLightPool", [admin, rvyn, config]);
  const minter = await deploy("LightdiveMinter", [admin, rvyn, nft, config, beacon, pool, treasury]);
  const exp = await deploy("Expedition", [admin, nft, config, beacon, pool]);
  await ok(nft, "LightdiveNFT", "setMinter", [minter]);
  await ok(nft, "LightdiveNFT", "setGame", [exp]);
  await ok(pool, "CoreLightPool", "setExpedition", [exp]);
  await ok(rvyn, "LaunchToken", "approve", [pool, E("1000000")]);
  await ok(pool, "CoreLightPool", "fund", [E("1000000")]);
  for (const player of [alice, bob]) {
    await ok(rvyn, "LaunchToken", "transfer", [player, E("100000")]);
    await ok(rvyn, "LaunchToken", "approve", [minter, E("100000")], player);
    await ok(nft, "LightdiveNFT", "setApprovalForAll", [exp, true], player);
  }

  const bal = (who) => read(rvyn, "LaunchToken", "balanceOf", [who]);
  const hourNow = async () => Math.floor((await now()) / HOUR);
  /** Commits seeds for the next `n` hours and moves to the start of the first of them. */
  const commitAhead = async (n) => {
    const start = (await hourNow()) + 1;
    const hashes = Array.from({ length: n }, (_, i) => commitmentOf(seedFor(start + i)));
    await ok(beacon, "RandomnessBeacon", "commit", [BigInt(start), hashes], operator);
    await warpTo(start * HOUR);
    return start;
  };
  const reveal = (hour) => ok(beacon, "RandomnessBeacon", "reveal", [BigInt(hour), seedFor(hour)], stranger);
  const lastRequestId = async () => (await read(minter, "LightdiveMinter", "requestCount")) - 1n;
  /** Requests, reveals the hour and fulfills; returns the new token ids. */
  const mint = async (player, kind, qty) => {
    const hour = await hourNow();
    const before = await read(nft, "LightdiveNFT", "nextId");
    await ok(minter, "LightdiveMinter", "requestMint", [kind, qty], player);
    const id = await lastRequestId();
    await warpTo((hour + 1) * HOUR + 1);
    if (!(await read(beacon, "RandomnessBeacon", "revealed", [BigInt(hour)]))) await reveal(hour);
    await ok(minter, "LightdiveMinter", "fulfill", [id], stranger);
    const after = await read(nft, "LightdiveNFT", "nextId");
    return Array.from({ length: Number(after - before) }, (_, i) => before + BigInt(i));
  };
  const attrs = (id) => read(nft, "LightdiveNFT", "attributes", [id]);

  return { provider, client, accounts, admin, operator, treasury, alice, bob, stranger, rvyn, config, nft, beacon, pool, minter, exp,
    ok, no, read, now, warpTo, bal, hourNow, commitAhead, reveal, mint, attrs, lastRequestId, done: () => provider.disconnect() };
}

test("config: beam tables average exactly 1.00 and bad tables are rejected", async () => {
  const w = await world();
  try {
    for (const beam of [0, 1, 2]) {
      const tiers = await w.read(w.config, "LightdiveConfig", "beamTiers", [beam]);
      const prob = tiers.reduce((s, t) => s + t.probBp, 0);
      const ev2 = tiers.reduce((s, t) => s + t.probBp * (t.lo + t.hi), 0);
      assert.equal(prob, 10_000);
      assert.equal(ev2, 2_000_000, `beam ${beam} average is 1.00`);
      assert.ok(tiers.every((t) => t.hi <= 1000), "max 10x");
    }
    const needle = await w.read(w.config, "LightdiveConfig", "beamTiers", [2]);
    assert.deepEqual(needle.map((t) => [t.probBp, t.lo, t.hi]), [[4500, 0, 0], [2700, 100, 120], [1850, 180, 220], [870, 260, 340], [80, 800, 1000]]);

    // Unbalanced (average 1.05), 11x, and wrong probability sum are all refused.
    await w.no(w.config, "LightdiveConfig", "setBeam", [0, [{ probBp: 1500, lo: 0, hi: 0 }, { probBp: 8500, lo: 120, hi: 127 }]]);
    await w.no(w.config, "LightdiveConfig", "setBeam", [0, [{ probBp: 9000, lo: 0, hi: 0 }, { probBp: 1000, lo: 900, hi: 1100 }]]);
    await w.no(w.config, "LightdiveConfig", "setBeam", [0, [{ probBp: 9999, lo: 100, hi: 100 }]]);
    // A balanced table is accepted, but only from the owner.
    const flat = [{ probBp: 10_000, lo: 90, hi: 110 }];
    await w.no(w.config, "LightdiveConfig", "setBeam", [0, flat], w.stranger);
    await w.ok(w.config, "LightdiveConfig", "setBeam", [0, flat]);

    // Bounds on the economy knobs.
    await w.no(w.config, "LightdiveConfig", "setEmissionRate", [151]);
    await w.ok(w.config, "LightdiveConfig", "setEmissionRate", [150]);
    await w.no(w.config, "LightdiveConfig", "setSplit", [3999, 1500, 1000]); // pool below 40%
    await w.no(w.config, "LightdiveConfig", "setSplit", [7000, 2500, 1000]); // discount larger than treasury share
    assert.equal(await w.read(w.config, "LightdiveConfig", "claimFeeBp", [0n]), 1500n);
    assert.equal(await w.read(w.config, "LightdiveConfig", "claimFeeBp", [1n * BigInt(DAY)]), 1400n);
    assert.equal(await w.read(w.config, "LightdiveConfig", "claimFeeBp", [15n * BigInt(DAY)]), 0n);
  } finally { await w.done(); }
});

test("config: sampled multipliers stay inside their tier ranges and average about 1.00", async () => {
  const w = await world();
  try {
    for (const beam of [0, 1, 2]) {
      const tiers = await w.read(w.config, "LightdiveConfig", "beamTiers", [beam]);
      let sum = 0;
      const n = 600;
      for (let i = 0; i < n; i++) {
        const r = BigInt(keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [BigInt(beam), BigInt(i)])));
        const [tier, mult] = await w.read(w.config, "LightdiveConfig", "drawMultiplier", [beam, r]);
        assert.ok(mult >= tiers[tier].lo && mult <= tiers[tier].hi);
        sum += mult;
      }
      const mean = sum / n / 100;
      assert.ok(Math.abs(mean - 1) < (beam === 2 ? 0.2 : 0.08), `beam ${beam} sample mean ${mean}`);
    }
  } finally { await w.done(); }
});

test("mint: payment split, first-mint discount, burn, sale gates and two-step draw", async () => {
  const w = await world();
  try {
    await w.no(w.minter, "LightdiveMinter", "requestMint", [SEEKER, 1], w.alice); // no randomness scheduled
    await w.commitAhead(400);
    await w.no(w.minter, "LightdiveMinter", "requestMint", [SPIRE, 1], w.alice); // spire sale not open
    await w.no(w.minter, "LightdiveMinter", "requestMint", [SEEKER, 11], w.alice); // over per-tx limit

    const supply0 = await w.read(w.rvyn, "LaunchToken", "totalSupply");
    const [pool0, treasury0, alice0] = [await w.bal(w.pool), await w.bal(w.treasury), await w.bal(w.alice)];
    // First seeker mint: 2 x 40 RVYN, first unit 10% off.
    await w.ok(w.minter, "LightdiveMinter", "requestMint", [SEEKER, 2], w.alice);
    assert.equal(alice0 - (await w.bal(w.alice)), E("76"));
    assert.equal((await w.bal(w.pool)) - pool0, E("56")); // 70% of list price 80
    assert.equal(supply0 - (await w.read(w.rvyn, "LaunchToken", "totalSupply")), E("12")); // 15% burned
    assert.equal((await w.bal(w.treasury)) - treasury0, E("8")); // 15% minus the 4 RVYN discount
    // The discount is used up: the next seeker mint pays full price.
    const [total, discount] = await w.read(w.minter, "LightdiveMinter", "quote", [w.alice, SEEKER, 1]);
    assert.equal(total, E("40"));
    assert.equal(discount, 0n);

    // Nothing is minted until the hour is revealed.
    const id = await w.lastRequestId();
    await w.no(w.minter, "LightdiveMinter", "fulfill", [id]);
    const hour = Number((await w.read(w.minter, "LightdiveMinter", "request", [id])).hour);
    await w.warpTo((hour + 1) * HOUR + 1);
    await w.no(w.beacon, "RandomnessBeacon", "reveal", [BigInt(hour), seedFor(hour + 1)]); // wrong seed
    await w.reveal(hour);
    await w.ok(w.minter, "LightdiveMinter", "fulfill", [id], w.stranger);
    await w.no(w.minter, "LightdiveMinter", "fulfill", [id]);
    assert.equal(await w.read(w.nft, "LightdiveNFT", "balanceOf", [w.alice]), 2n);
    for (const tokenId of [1n, 2n]) {
      const a = await w.attrs(tokenId);
      assert.equal(a.kind, SEEKER);
      assert.equal(a.voyagesLeft, 10);
      assert.ok(a.trait < 6);
      const lo = [20, 32, 48, 75, 120][a.rarity], hi = [30, 45, 68, 100, 160][a.rarity];
      assert.ok(a.luminance >= lo && a.luminance <= hi);
    }

    // Spires: early window allows 3 per wallet.
    await w.no(w.minter, "LightdiveMinter", "openSpireSale", [0n], w.stranger);
    await w.ok(w.minter, "LightdiveMinter", "openSpireSale", [0n]);
    await w.ok(w.minter, "LightdiveMinter", "requestMint", [SPIRE, 3], w.alice);
    await w.no(w.minter, "LightdiveMinter", "requestMint", [SPIRE, 1], w.alice);
    await w.warpTo((await w.now()) + 48 * HOUR);
    await w.ok(w.minter, "LightdiveMinter", "requestMint", [SPIRE, 1], w.alice); // window over
  } finally { await w.done(); }
});

test("mint: decks keep exact counts and the live cap holds", async () => {
  const w = await world();
  try {
    await w.commitAhead(400);
    await w.ok(w.minter, "LightdiveMinter", "openSpireSale", [0n]);
    await w.warpTo((await w.now()) + 49 * HOUR);
    const ids = [];
    for (let i = 0; i < 8; i++) ids.push(...(await w.mint(w.alice, PRISM, 5)));
    const deck = await w.read(w.minter, "LightdiveMinter", "deckOf", [PRISM]);
    const left = deck.rarityLeft.reduce((s, x) => s + x, 0);
    assert.equal(deck.remaining, 6000 - 40);
    assert.equal(left, deck.remaining, "rarity cards left add up to the deck");
    const beamLeft = deck.beamLeft.flat().reduce((s, x) => s + x, 0);
    assert.equal(beamLeft, deck.remaining, "beam cards left add up to the deck");
    // Every drawn prism is accounted for in its rarity and beam counters.
    const full = [3000, 1680, 900, 360, 60];
    const drawn = [0, 0, 0, 0, 0];
    for (const id of ids) {
      const a = await w.attrs(id);
      assert.equal(a.kind, PRISM);
      assert.ok(a.trait <= 2);
      drawn[a.rarity]++;
    }
    drawn.forEach((n, r) => assert.equal(deck.rarityLeft[r], full[r] - n));

    // Live cap: lower spires to 2, then a third cannot be requested.
    await w.ok(w.nft, "LightdiveNFT", "lowerMaxAlive", [SPIRE, 2]);
    await w.no(w.nft, "LightdiveNFT", "lowerMaxAlive", [SPIRE, 3]); // only lowers
    await w.ok(w.minter, "LightdiveMinter", "requestMint", [SPIRE, 2], w.bob);
    await w.no(w.minter, "LightdiveMinter", "requestMint", [SPIRE, 1], w.bob);
  } finally { await w.done(); }
});

/** A Lv.1+ spire, optionally a prism, and seekers owned by `who`, minted in one go. */
async function crew(w, who, seekers) {
  await w.ok(w.minter, "LightdiveMinter", "openSpireSale", [0n]).catch(() => {});
  const [spire] = await w.mint(who, SPIRE, 1);
  const level = (await w.attrs(spire)).trait;
  const team = await w.mint(who, SEEKER, Math.min(seekers, level));
  return { spire, level, team };
}

test("expedition: equip rules, one dive per day, depth gate, settle after the day, claim with fee", async () => {
  const w = await world();
  try {
    await w.commitAhead(24 * 20);
    await w.ok(w.minter, "LightdiveMinter", "openSpireSale", [0n]);
    const { spire, level, team } = await crew(w, w.alice, 5);
    const [prism] = await w.mint(w.alice, PRISM, 1);

    await w.no(w.exp, "Expedition", "equip", [spire, 0n, []], w.alice); // needs a seeker
    await w.no(w.exp, "Expedition", "equip", [team[0], 0n, [spire]], w.alice); // wrong kinds
    await w.no(w.exp, "Expedition", "equip", [spire, prism, team], w.bob); // not the owner
    await w.ok(w.exp, "Expedition", "equip", [spire, prism, team], w.alice);
    assert.equal((await w.read(w.nft, "LightdiveNFT", "ownerOf", [spire])).toLowerCase(), w.exp.toLowerCase());

    const s = await w.attrs(spire), p = await w.attrs(prism);
    let lum = Math.floor((s.luminance + p.luminance) * team.length / level);
    for (const id of team) lum += (await w.attrs(id)).luminance;
    assert.equal(await w.read(w.exp, "Expedition", "teamLuminance", [spire]), BigInt(lum));

    await w.no(w.exp, "Expedition", "dive", [spire, 5, 7], w.alice); // depth VI needs 850
    await w.ok(w.exp, "Expedition", "dive", [spire, 0, 7], w.alice);
    await w.no(w.exp, "Expedition", "dive", [spire, 0, 7], w.alice); // once per day
    const d = await w.read(w.exp, "Expedition", "diveInfo", [0n]);
    assert.equal(d.points, BigInt(lum) * 10_000n);
    assert.equal(d.beam, p.trait);
    assert.equal((await w.attrs(spire)).voyagesLeft, 119);
    assert.equal((await w.attrs(prism)).voyagesLeft, 29);

    await w.no(w.exp, "Expedition", "settle", [[0n]]); // day not over
    const day = Number(d.day);
    await w.warpTo((day + 1) * DAY + 1);
    await w.reveal(Number(d.hour));
    const avail = await w.read(w.pool, "CoreLightPool", "available");
    await w.ok(w.exp, "Expedition", "settle", [[0n]], w.stranger);
    await w.no(w.exp, "Expedition", "settle", [[0n]]);

    // Only dive of the day: budget = min(1% of available, points * 0.18 RVYN).
    const budget = await w.read(w.pool, "CoreLightPool", "dayBudget", [day]);
    const byRate = avail * 100n / 10_000n;
    const byCap = d.points * E("0.18") / 10_000n;
    assert.equal(budget, byRate < byCap ? byRate : byCap);
    const settledLog = await w.client.getContractEvents({ address: w.exp, abi: A.Expedition.abi, eventName: "Settled", fromBlock: 0n });
    const { multX100, lightdust, reward } = settledLog[0].args;
    assert.equal(lightdust, d.points * BigInt(multX100) / 100n);
    assert.equal(reward, budget * lightdust / d.points);
    assert.equal(await w.read(w.exp, "Expedition", "credit", [w.alice]), reward);

    // Pool accounting stays exact.
    const [bal, avail2, reserved, owed] = [await w.bal(w.pool), await w.read(w.pool, "CoreLightPool", "available"), await w.read(w.pool, "CoreLightPool", "reserved"), await w.read(w.pool, "CoreLightPool", "owed")];
    assert.equal(avail2 + reserved + owed, bal);
    assert.equal(reserved, 0n, "fully settled day releases its unused budget");

    if (reward > 0n) {
      // Claim one day after the first dive: fee 14%, and the fee stays in the pool.
      const before = await w.bal(w.alice);
      const poolBefore = await w.bal(w.pool);
      const firstDive = Number(await w.read(w.exp, "Expedition", "lastClaimAt", [w.alice]));
      await w.warpTo(firstDive + DAY + 10);
      await w.ok(w.exp, "Expedition", "claim", [], w.alice);
      const fee = reward * 1400n / 10_000n;
      assert.equal((await w.bal(w.alice)) - before, reward - fee);
      assert.equal(poolBefore - (await w.bal(w.pool)), reward - fee);
      await w.no(w.exp, "Expedition", "claim", [], w.alice);
    }

    await w.ok(w.exp, "Expedition", "unequip", [spire], w.alice);
    assert.equal((await w.read(w.nft, "LightdiveNFT", "ownerOf", [spire])).toLowerCase(), w.alice.toLowerCase());
  } finally { await w.done(); }
});

test("expedition: seekers come home after 10 voyages; an unrevealed hour settles at 1.00", async () => {
  const w = await world();
  try {
    await w.commitAhead(24 * 16);
    const { spire, team } = await crew(w, w.alice, 1);
    await w.ok(w.exp, "Expedition", "equip", [spire, 0n, team], w.alice);
    const aliveBefore = await w.read(w.nft, "LightdiveNFT", "alive", [SEEKER]);
    for (let day = 0; day < 10; day++) {
      await w.ok(w.exp, "Expedition", "dive", [spire, 0, 1], w.alice);
      await w.warpTo((Math.floor((await w.now()) / DAY) + 1) * DAY + 60);
    }
    // The tenth dive spent the last voyage: the seeker was burned and left the team.
    await w.no(w.nft, "LightdiveNFT", "attributes", [team[0]]);
    assert.equal(await w.read(w.nft, "LightdiveNFT", "alive", [SEEKER]), aliveBefore - 1);
    assert.equal((await w.read(w.exp, "Expedition", "team", [spire])).seekers.length, 0);
    await w.no(w.exp, "Expedition", "dive", [spire, 0, 1], w.alice); // no seekers left

    // No hour was ever revealed. The latest dive is still inside the 48-hour reveal window, so it
    // cannot settle yet; older dives are past it and settle at exactly 1.00x, as does the latest
    // one once its window has passed.
    await w.no(w.exp, "Expedition", "settle", [[9n]]);
    await w.ok(w.exp, "Expedition", "settle", [[0n, 1n, 2n]]);
    await w.warpTo((await w.now()) + 49 * HOUR);
    await w.ok(w.exp, "Expedition", "settle", [[9n]]);
    const logs = await w.client.getContractEvents({ address: w.exp, abi: A.Expedition.abi, eventName: "Settled", fromBlock: 0n });
    for (const l of logs) {
      assert.equal(l.args.multX100, 100);
      assert.equal(l.args.fallbackUsed, true);
    }
  } finally { await w.done(); }
});

test("pause stops minting and diving but never claims or unequip; the pool has no owner exit", async () => {
  const w = await world();
  try {
    await w.commitAhead(24 * 4);
    const { spire, team } = await crew(w, w.alice, 1);
    await w.ok(w.exp, "Expedition", "equip", [spire, 0n, team], w.alice);
    await w.ok(w.exp, "Expedition", "dive", [spire, 0, 1], w.alice);
    await w.ok(w.exp, "Expedition", "pause");
    await w.ok(w.minter, "LightdiveMinter", "pause");
    await w.no(w.minter, "LightdiveMinter", "requestMint", [SEEKER, 1], w.bob);
    await w.warpTo((Math.floor((await w.now()) / DAY) + 1) * DAY + 60);
    await w.no(w.exp, "Expedition", "dive", [spire, 0, 1], w.alice);
    const d = await w.read(w.exp, "Expedition", "diveInfo", [0n]);
    await w.reveal(Number(d.hour));
    await w.ok(w.exp, "Expedition", "settle", [[0n]]);
    if ((await w.read(w.exp, "Expedition", "credit", [w.alice])) > 0n) await w.ok(w.exp, "Expedition", "claim", [], w.alice);
    await w.ok(w.exp, "Expedition", "unequip", [spire], w.alice);

    // Only the Expedition can move pool funds, and only through assign/pay.
    await w.no(w.pool, "CoreLightPool", "pay", [w.admin, 1n, 0n]);
    await w.no(w.pool, "CoreLightPool", "closeDay", [1, 1n]);
    await w.no(w.pool, "CoreLightPool", "setExpedition", [w.admin]); // set once
    const fns = A.CoreLightPool.abi.filter((x) => x.type === "function" && x.stateMutability === "nonpayable").map((x) => x.name).sort();
    assert.deepEqual(fns, ["acceptOwnership", "assign", "closeDay", "fund", "pay", "releaseDay", "renounceOwnership", "setExpedition", "transferOwnership"]);
  } finally { await w.done(); }
});

test("expedition: two players on the same day split the budget by Lightdust", async () => {
  const w = await world();
  try {
    await w.commitAhead(24 * 4);
    const a = await crew(w, w.alice, 1);
    const b = await crew(w, w.bob, 1);
    await w.ok(w.exp, "Expedition", "equip", [a.spire, 0n, a.team], w.alice);
    await w.ok(w.exp, "Expedition", "equip", [b.spire, 0n, b.team], w.bob);
    await w.ok(w.exp, "Expedition", "dive", [a.spire, 0, 1], w.alice);
    await w.ok(w.exp, "Expedition", "dive", [b.spire, 0, 2], w.bob);
    const [da, db] = [await w.read(w.exp, "Expedition", "diveInfo", [0n]), await w.read(w.exp, "Expedition", "diveInfo", [1n])];
    assert.equal(da.day, db.day);
    assert.equal(await w.read(w.exp, "Expedition", "dayPoints", [da.day]), da.points + db.points);
    await w.warpTo((Number(da.day) + 1) * DAY + 1);
    for (const h of new Set([Number(da.hour), Number(db.hour)])) await w.reveal(h);
    await w.ok(w.exp, "Expedition", "settle", [[1n, 0n]], w.stranger);
    const budget = await w.read(w.pool, "CoreLightPool", "dayBudget", [da.day]);
    const logs = await w.client.getContractEvents({ address: w.exp, abi: A.Expedition.abi, eventName: "Settled", fromBlock: 0n });
    for (const l of logs) assert.equal(l.args.reward, budget * l.args.lightdust / (da.points + db.points));
    const [bal, av, res, owed] = [await w.bal(w.pool), await w.read(w.pool, "CoreLightPool", "available"), await w.read(w.pool, "CoreLightPool", "reserved"), await w.read(w.pool, "CoreLightPool", "owed")];
    assert.equal(av + res + owed, bal);
    assert.equal(owed, logs.reduce((s, l) => s + l.args.reward, 0n));
  } finally { await w.done(); }
});
