import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, parseEther, keccak256, encodeAbiParameters, decodeEventLog } from "viem";
import { ODDS } from "../lib/lightdive-v3/odds.ts";
import { DESTINATIONS, planDive, skyOf } from "../lib/lightdive-v3/rules.ts";

// The Lightdive v3 contracts end to end on a local chain, with test randomness that has drand's timing. Run after
// `node scripts/compile-contracts-lightdive-v3.mjs` (or `npm run test:lightdive:v3`).
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive-v3/artifacts/contracts.json", "utf8"));
A.LaunchToken = JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")).LaunchToken;

const E = parseEther;
const DAY = 86_400;
const SPIRE = 0, PRISM = 1, SEEKER = 2;
const BEAM_KEY = ["廣域", "聚焦", "針芒"];
const proofOf = (n) => `0x${n.toString(16).padStart(128, "0")}`;

async function world({ fund = "1000000" } = {}) {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 1000 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [admin, treasury, alice, bob, stranger, pricer] = await wallet.getAddresses();

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
  const warp = async (seconds) => {
    await provider.request({ method: "evm_increaseTime", params: [seconds] });
    await provider.request({ method: "evm_mine", params: [] });
  };
  const events = (receipt, name, event) => receipt.logs.flatMap((log) => {
    try {
      const d = decodeEventLog({ abi: A[name].abi, data: log.data, topics: log.topics });
      return d.eventName === event ? [d.args] : [];
    } catch { return []; }
  });

  const rvyn = await deploy("LaunchToken", ["RovynCore", "RVYN", E("10000000"), admin]);
  const rng = await deploy("MockRandomness");
  const config = await deploy("LightdiveConfig3", [admin]);
  const nft = await deploy("LightdiveNFT3", [admin, treasury]);
  const pool = await deploy("CoreLightPool3", [admin, rvyn]);
  const minter = await deploy("LightdiveMinter3", [admin, rvyn, nft, rng, pool, treasury]);
  const exp = await deploy("Expedition3", [admin, nft, config, rng, pool]);
  const market = await deploy("LightdiveMarket3", [admin, rvyn, nft, config, pool]);
  for (let c = 0; c < 6; c++) {
    for (let b = 0; b < 3; b++) {
      const tiers = ODDS[`${c + 1}${BEAM_KEY[b]}`].map(([probBp, lo, hi]) => ({ probBp, lo, hi }));
      await ok(config, "LightdiveConfig3", "setTable", [c, b, tiers]);
    }
  }
  await ok(nft, "LightdiveNFT3", "setMinter", [minter]);
  await ok(nft, "LightdiveNFT3", "setGame", [exp]);
  await ok(pool, "CoreLightPool3", "setExpedition", [exp]);
  await ok(rvyn, "LaunchToken", "approve", [pool, E(fund)]);
  await ok(pool, "CoreLightPool3", "fund", [E(fund)]);
  await ok(minter, "LightdiveMinter3", "setPricer", [pricer]);
  for (const player of [alice, bob]) {
    await ok(rvyn, "LaunchToken", "transfer", [player, E("100000")]);
    await ok(rvyn, "LaunchToken", "approve", [minter, E("100000")], player);
    await ok(rvyn, "LaunchToken", "approve", [market, E("100000")], player);
    await ok(nft, "LightdiveNFT3", "setApprovalForAll", [market, true], player);
  }

  const bal = (who) => read(rvyn, "LaunchToken", "balanceOf", [who]);
  const attrs = (id) => read(nft, "LightdiveNFT3", "attributes", [id]);
  /** Summons and reveals; returns the new card ids. */
  const summon = async (player, kind, qty, proof = proofOf(1)) => {
    const before = await read(nft, "LightdiveNFT3", "nextId");
    await ok(minter, "LightdiveMinter3", "summon", [kind, qty], player);
    const id = (await read(minter, "LightdiveMinter3", "requestCount")) - 1n;
    await warp(10);
    await ok(minter, "LightdiveMinter3", "reveal", [id, proof], stranger);
    const after = await read(nft, "LightdiveNFT3", "nextId");
    return Array.from({ length: Number(after - before) }, (_, i) => before + BigInt(i));
  };
  /** A spire with at least `berths` berths and `berths` seekers for `player`. */
  const squad = async (player, berths = 1) => {
    let spire;
    for (let n = 1; !spire; n++) {
      const ids = await summon(player, SPIRE, 1, proofOf(1000 + n));
      if ((await attrs(ids[0])).trait >= berths) spire = ids[0];
    }
    const seekers = await summon(player, SEEKER, berths, proofOf(77));
    return { spire, seekers };
  };
  /** The random number a dive's reveal will use with `proof` (mirrors Expedition3 + MockRandomness). */
  const diveRandom = (round, proof, id) => {
    const r = keccak256(encodeAbiParameters([{ type: "uint64" }, { type: "bytes" }], [round, proof]));
    return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [r, id])));
  };
  /** A proof whose outcome row for dive `id` satisfies `want(tier)` under `table`. */
  const proofFor = (round, id, table, want) => {
    for (let n = 1; n < 100_000; n++) {
      const proof = proofOf(n);
      let x = Number(diveRandom(round, proof, id) % 10_000n), tier = 0;
      for (; tier < table.length - 1 && x >= table[tier].probBp; tier++) x -= table[tier].probBp;
      if (want(tier)) return proof;
    }
    throw new Error("no proof found");
  };

  return { provider, client, admin, treasury, alice, bob, stranger, pricer, rvyn, rng, config, nft, pool, minter, exp, market,
    ok, no, read, now, warp, events, bal, attrs, summon, squad, diveRandom, proofFor, done: () => provider.disconnect() };
}

test("config: the day's sky and every dive plan match the website's rules exactly", async () => {
  const w = await world();
  try {
    const today = Math.floor((await w.now()) / DAY);
    for (const day of [today, today + 1, today + 2, 20_000, 30_123]) {
      const sky = skyOf(day);
      const [dests, kinds] = await w.read(w.config, "LightdiveConfig3", "eventsOf", [day]);
      assert.deepEqual([...dests].map(Number), [...sky.events.keys()], `events of day ${day}`);
      assert.deepEqual([...kinds].map((k) => ["tide", "surge", "storm", "calm"][k - 1]), [...sky.events.values()]);
      for (const d of DESTINATIONS) assert.equal(await w.read(w.config, "LightdiveConfig3", "lightOf", [day, d.id]), sky.lights[d.id], `light ${day}/${d.id}`);
    }
    const decisions = ["none", "steady", "bold", "detour"];
    let checked = 0;
    for (const day of [today, today + 1, today + 2]) {
      const sky = skyOf(day);
      for (const d of DESTINATIONS) {
        for (const beam of [0, 1, 2]) {
          for (const over of [0, 0.25, 0.6, 1.3]) {
            const power = Math.round(d.threshold * (1 + over));
            for (const [k, decision] of decisions.entries()) {
              const want = planDive({ spire: power, prism: { power: 0, beam }, seekers: [] }, d, sky, decision);
              const got = await w.read(w.config, "LightdiveConfig3", "plan", [d.id, BigInt(power), beam, day, k]);
              assert.deepEqual(got.table.map((t) => [t.probBp, t.lo, t.hi]), want.table, `table ${day}/${d.id}/${beam}/${power}/${decision}`);
              assert.equal(got.risk, want.risk);
              assert.equal(Number(got.coefBp), want.coefBp);
              assert.equal(got.levyBp, Math.round(want.levy * 10_000));
              assert.equal(got.wear2Bp, Math.round(want.wear2 * 10_000));
              assert.equal(got.wear3Bp, Math.round(want.wear3 * 10_000));
              checked++;
            }
          }
        }
      }
    }
    console.log(`  ${checked} dive plans match`);
  } finally {
    await w.done();
  }
});

test("config: odds tables must average exactly 1.00 and settings stay within bounds", async () => {
  const w = await world();
  try {
    await w.no(w.config, "LightdiveConfig3", "setTable", [0, 0, [{ probBp: 1500, lo: 0, hi: 0 }, { probBp: 8000, lo: 100, hi: 120 }, { probBp: 500, lo: 200, hi: 260 }]]);
    await w.no(w.config, "LightdiveConfig3", "setTable", [0, 0, [{ probBp: 9000, lo: 0, hi: 0 }, { probBp: 500, lo: 900, hi: 1100 }, { probBp: 500, lo: 900, hi: 1100 }]]);
    await w.no(w.config, "LightdiveConfig3", "setTable", [0, 0, [{ probBp: 0, lo: 0, hi: 0 }, { probBp: 5000, lo: 90, hi: 110 }, { probBp: 5000, lo: 90, hi: 110 }]], w.stranger);
    await w.ok(w.config, "LightdiveConfig3", "setTable", [0, 0, [{ probBp: 0, lo: 0, hi: 0 }, { probBp: 5000, lo: 90, hi: 110 }, { probBp: 5000, lo: 90, hi: 110 }]]);
    await w.no(w.config, "LightdiveConfig3", "setEconomy", [151, 160, E("0.015")]);
    await w.no(w.config, "LightdiveConfig3", "setEconomy", [100, 301, E("0.015")]);
    await w.no(w.config, "LightdiveConfig3", "setFees", [3001, 100, 9500, 500]);
    await w.no(w.config, "LightdiveConfig3", "setLimits", [3, 4, 5]);
    await w.no(w.config, "LightdiveConfig3", "setTiming", [300, 300, 86_400]);
    assert.equal(await w.read(w.config, "LightdiveConfig3", "claimFeeBp", [0n]), 1500n);
    assert.equal(await w.read(w.config, "LightdiveConfig3", "claimFeeBp", [BigInt(3 * DAY + 5)]), 1200n);
    assert.equal(await w.read(w.config, "LightdiveConfig3", "claimFeeBp", [BigInt(15 * DAY)]), 0n);
  } finally {
    await w.done();
  }
});

test("summon: closed until the sale opens, paid 70/15/15, drawn from the deck after the drand round", async () => {
  const w = await world();
  try {
    await w.no(w.minter, "LightdiveMinter3", "summon", [SEEKER, 1], w.alice);
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const supply = await w.read(w.rvyn, "LaunchToken", "totalSupply");
    const [pool0, tre0] = [await w.bal(w.pool), await w.bal(w.treasury)];
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 10], w.alice);
    assert.equal(await w.bal(w.pool) - pool0, E("140"), "70% of 200 to the pool");
    assert.equal(await w.bal(w.treasury) - tre0, E("30"));
    assert.equal(supply - await w.read(w.rvyn, "LaunchToken", "totalSupply"), E("30"), "15% burned");
    // the round is not published yet: no reveal
    await w.no(w.minter, "LightdiveMinter3", "reveal", [0n, proofOf(5)], w.stranger);
    await w.warp(10);
    await w.no(w.minter, "LightdiveMinter3", "reveal", [0n, "0x1234"], w.stranger);
    await w.ok(w.minter, "LightdiveMinter3", "reveal", [0n, proofOf(5)], w.stranger);
    await w.no(w.minter, "LightdiveMinter3", "reveal", [0n, proofOf(5)], w.stranger);
    const BANDS = [[10, 39], [40, 79], [80, 119], [120, 159], [160, 200]];
    for (let id = 1n; id <= 10n; id++) {
      const a = await w.attrs(id);
      assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [id])).toLowerCase(), w.alice.toLowerCase());
      assert.equal(a.kind, SEEKER);
      assert.ok(a.power >= BANDS[a.rarity][0] && a.power <= BANDS[a.rarity][1], "power inside the rarity band");
      assert.ok(a.trait < 6);
      assert.equal(a.voyagesLeft, 45);
    }
    const deck = await w.read(w.minter, "LightdiveMinter3", "deckOf", [SEEKER]);
    assert.equal(deck.remaining, 990);
    assert.equal(deck.rarityLeft.reduce((s, x) => s + Number(x), 0), 990);
    // spires: at most 3 per wallet in the first 48 hours; seats = rarity + 1
    const spires = await w.summon(w.alice, SPIRE, 3);
    for (const id of spires) { const a = await w.attrs(id); assert.equal(a.trait, a.rarity + 1); }
    await w.no(w.minter, "LightdiveMinter3", "summon", [SPIRE, 1], w.alice);
    await w.warp(2 * DAY);
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SPIRE, 1], w.alice);
  } finally {
    await w.done();
  }
});

test("summon: caps on cards alive, the fallback after a day, prices only move within bounds", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    assert.deepEqual([0, 1, 2].map(() => 0), [0, 0, 0]);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "maxAlive", [2n]), 12_000);
    await w.ok(w.nft, "LightdiveNFT3", "lowerMaxAlive", [SEEKER, 12]);
    await w.no(w.nft, "LightdiveNFT3", "lowerMaxAlive", [SEEKER, 13]);
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 10], w.alice);
    await w.no(w.minter, "LightdiveMinter3", "summon", [SEEKER, 3], w.bob);
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 2], w.bob);
    // nobody brings a proof: after a day the request's own entropy is used
    await w.no(w.minter, "LightdiveMinter3", "revealFallback", [0n], w.stranger);
    await w.warp(DAY + 60);
    await w.ok(w.minter, "LightdiveMinter3", "revealFallback", [0n], w.stranger);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "balanceOf", [w.alice]), 10n);
    // prices: only the pricer, once a day, +-10%, within 10%-200% of launch
    await w.no(w.minter, "LightdiveMinter3", "setPrice", [SEEKER, E("21")], w.stranger);
    await w.no(w.minter, "LightdiveMinter3", "setPrice", [SEEKER, E("22.1")], w.pricer);
    await w.ok(w.minter, "LightdiveMinter3", "setPrice", [SEEKER, E("22")], w.pricer);
    await w.no(w.minter, "LightdiveMinter3", "setPrice", [SEEKER, E("22")], w.pricer);
    assert.equal(await w.read(w.minter, "LightdiveMinter3", "renewPrice", [SEEKER]), E("11"));
  } finally {
    await w.done();
  }
});

test("dive: teams lock their cards, passes and the decision window are enforced, the reveal pays at once", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    const [prism] = await w.summon(w.alice, PRISM, 1);
    await w.no(w.exp, "Expedition3", "setTeam", [spire, prism, seekers], w.bob);
    await w.no(w.exp, "Expedition3", "setTeam", [spire, prism, [seekers[0], seekers[0]]], w.alice);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, prism, seekers], w.alice);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[0]]), true);
    await w.no(w.nft, "LightdiveNFT3", "transferFrom", [w.alice, w.bob, seekers[0]], w.alice);
    await w.no(w.market, "LightdiveMarket3", "list", [prism, E("10")], w.alice);

    const day = await w.read(w.exp, "Expedition3", "today");
    await w.no(w.exp, "Expedition3", "dive", [spire, 23], w.alice); // far too weak for the core
    const receipt = await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
    const [dived] = w.events(receipt, "Expedition3", "Dived");
    const id = dived.diveId;
    assert.equal(await w.read(w.exp, "Expedition3", "passesUsed", [w.alice, day]), 1);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0], w.alice); // out on a dive: collect first
    await w.no(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers], w.alice);
    // first day: the rate is the launch cap
    assert.equal(await w.read(w.exp, "Expedition3", "dayRate", [day]), E("0.015"));

    // the decision: only the owner, only until a minute before the round
    await w.no(w.exp, "Expedition3", "decide", [id, 1], w.bob);
    await w.ok(w.exp, "Expedition3", "decide", [id, 2], w.alice);
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [id]);
    const roundTime = Number(await w.read(w.rng, "MockRandomness", "roundTime", [d.round]));
    assert.ok(roundTime - (await w.now()) >= 299 && roundTime - (await w.now()) <= 303, "about five minutes away");
    await w.warp(roundTime - (await w.now()) - 30);
    await w.no(w.exp, "Expedition3", "decide", [id, 1], w.alice);
    await w.no(w.exp, "Expedition3", "reveal", [id, proofOf(1)], w.stranger); // not published yet
    await w.warp(40);

    // pick a proof that brings back something, then check the payment to the wei
    const p = await w.read(w.config, "LightdiveConfig3", "plan", [0, BigInt(d.power), d.beam, Number(d.day), 2]);
    const proof = w.proofFor(d.round, id, p.table, (tier) => tier >= 2);
    const poolBefore = await w.read(w.pool, "CoreLightPool3", "available");
    const r = await w.ok(w.exp, "Expedition3", "reveal", [id, proof], w.stranger);
    const [rev] = w.events(r, "Expedition3", "Revealed");
    const gross = d.pointsE2 * BigInt(rev.multX100) * d.rate / 10_000n;
    const levy = gross * BigInt(p.levyBp) / 10_000n;
    assert.equal(rev.reward, gross - levy);
    assert.equal(await w.read(w.exp, "Expedition3", "credit", [w.alice]), gross - levy);
    const burned = levy * 500n / 10_000n;
    assert.equal(poolBefore - (await w.read(w.pool, "CoreLightPool3", "available")), gross - levy + burned, "levy stays, 5% of it burned");
    await w.no(w.exp, "Expedition3", "reveal", [id, proof], w.stranger);
    assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).activeDive, 0n);
    assert.equal((await w.attrs(spire)).voyagesLeft, 180 - rev.wear);

    // three passes a day per wallet
    for (let i = 0; i < 2; i++) {
      const rr = await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
      const [dv] = w.events(rr, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "reveal", [dv.diveId, proofOf(9)], w.stranger);
    }
    await w.no(w.exp, "Expedition3", "dive", [spire, 0], w.alice);

    // claim: 15% fee on the first day, 95% of it stays in the pool, 5% burned
    const credit = await w.read(w.exp, "Expedition3", "credit", [w.alice]);
    const before = await w.bal(w.alice);
    await w.ok(w.exp, "Expedition3", "claim", [], w.alice);
    assert.equal(await w.bal(w.alice) - before, credit - credit * 1500n / 10_000n);
    await w.no(w.exp, "Expedition3", "claim", [], w.alice);

    // the next day: a new rate from yesterday's points, fresh passes
    await w.warp(DAY);
    await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
    const day2 = day + 1;
    const rate2 = await w.read(w.exp, "Expedition3", "dayRate", [day2]);
    const y = await w.read(w.exp, "Expedition3", "dayPointsE2", [day]);
    const avail = await w.read(w.pool, "CoreLightPool3", "available");
    assert.ok(rate2 <= E("0.015"));
    assert.ok(rate2 === E("0.015") || rate2 >= avail * 100n * 100n / (10_000n * y) - 1n, "1% of the pool over yesterday's points, capped");
  } finally {
    await w.done();
  }
});

test("dive: empty-handed pays nothing and no departure cost; the day's ceiling stops new dives", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers], w.alice);
    // the deepest destination the team qualifies for keeps some empty-handed chance after overflow stability
    const [power] = await w.read(w.exp, "Expedition3", "teamPower", [spire, 0, await w.read(w.exp, "Expedition3", "today")]);
    const dest = DESTINATIONS.filter((x) => x.threshold <= Number(power)).at(-1).id;
    const r = await w.ok(w.exp, "Expedition3", "dive", [spire, dest], w.alice);
    const [dv] = w.events(r, "Expedition3", "Dived");
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId]);
    const p = await w.read(w.config, "LightdiveConfig3", "plan", [dest, BigInt(d.power), d.beam, Number(d.day), 0]);
    await w.warp(310);
    const proof = w.proofFor(d.round, dv.diveId, p.table, (tier) => tier === 0);
    const avail = await w.read(w.pool, "CoreLightPool3", "available");
    const rr = await w.ok(w.exp, "Expedition3", "reveal", [dv.diveId, proof], w.stranger);
    const [rev] = w.events(rr, "Expedition3", "Revealed");
    assert.equal(rev.multX100, 0);
    assert.equal(rev.reward, 0n);
    assert.equal(rev.levy, 0n);
    assert.equal(await w.read(w.pool, "CoreLightPool3", "available"), avail);

    // a small pool (10,000 RVYN) with the lowest ceiling (0.2% = 20 RVYN) and the highest rate: the first dive would
    // promise more than the day may release, so it is refused; with the normal ceiling it goes through
    const w2 = await world({ fund: "10000" });
    try {
      await w2.ok(w2.minter, "LightdiveMinter3", "openSale", [0n]);
      const a = await w2.squad(w2.alice, 1);
      await w2.ok(w2.exp, "Expedition3", "setTeam", [a.spire, 0n, a.seekers], w2.alice);
      await w2.ok(w2.config, "LightdiveConfig3", "setEconomy", [20, 20, E("1")]);
      await w2.no(w2.exp, "Expedition3", "dive", [a.spire, 0], w2.alice);
      await w2.ok(w2.config, "LightdiveConfig3", "setEconomy", [20, 300, E("0.015")]);
      await w2.ok(w2.exp, "Expedition3", "dive", [a.spire, 0], w2.alice);
      const day = await w2.read(w2.exp, "Expedition3", "today");
      assert.ok(await w2.read(w2.exp, "Expedition3", "dayReserved", [day]) <= await w2.read(w2.exp, "Expedition3", "dayCeiling", [day]));
    } finally {
      await w2.done();
    }
  } finally {
    await w.done();
  }
});

test("wear: cards dock at zero, renew once within 7 days, then go home; docked cards go home after 7 days", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    await w.ok(w.config, "LightdiveConfig3", "setLimits", [10, 10, 5]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    const [extra] = await w.summon(w.alice, SEEKER, 1, proofOf(3));
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers], w.alice);
    // dive until the seeker's 45 voyages run out (cluster 1 always wears exactly 1)
    let dives = 0;
    while ((await w.attrs(seekers[0])).voyagesLeft > 0) {
      if (dives > 0 && dives % 10 === 0) await w.warp(DAY);
      const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
      const [dv] = w.events(r, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "reveal", [dv.diveId, proofOf(dives + 1)], w.stranger);
      dives++;
      if (!(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[0]]))) break;
    }
    assert.equal(dives, 45);
    const a = await w.attrs(seekers[0]);
    assert.equal(a.voyagesLeft, 0);
    assert.ok(a.dockedAt > 0n, "docked");
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[0]]), false, "left the team");
    assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).seekers.length, 0);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0], w.alice); // no seekers left
    await w.no(w.exp, "Expedition3", "setTeam", [spire, 0n, [seekers[0]]], w.alice); // docked cards cannot join
    await w.no(w.market, "LightdiveMarket3", "list", [seekers[0], E("5")], w.alice); // nor be listed
    await w.no(w.exp, "Expedition3", "sendHome", [seekers[0]], w.stranger); // not before 7 days

    // renew once, for half the summon price
    const before = await w.bal(w.alice);
    await w.no(w.minter, "LightdiveMinter3", "renew", [seekers[0]], w.bob);
    await w.ok(w.minter, "LightdiveMinter3", "renew", [seekers[0]], w.alice);
    assert.equal(before - await w.bal(w.alice), E("10"));
    const renewed = await w.attrs(seekers[0]);
    assert.equal(renewed.voyagesLeft, 45);
    assert.equal(renewed.renewed, true);
    assert.equal(renewed.dockedAt, 0n);
    await w.no(w.minter, "LightdiveMinter3", "renew", [seekers[0]], w.alice);

    // the other seeker docks and is not renewed: anyone sends it home after 7 days
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, [extra]], w.alice);
    for (let i = 0; i < 45; i++) {
      if (i % 10 === 0) await w.warp(DAY);
      const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
      const [dv] = w.events(r, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "reveal", [dv.diveId, proofOf(500 + i)], w.stranger);
    }
    assert.ok((await w.attrs(extra)).dockedAt > 0n);
    await w.warp(7 * DAY + 1);
    await w.no(w.minter, "LightdiveMinter3", "renew", [extra], w.alice); // too late
    const alive = await w.read(w.nft, "LightdiveNFT3", "alive", [2n]);
    const r = await w.ok(w.exp, "Expedition3", "sendHome", [extra], w.stranger);
    assert.equal(w.events(r, "LightdiveNFT3", "Homecoming").length, 1);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "alive", [2n]), alive - 1);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "exists", [extra]), false);

    // the renewed seeker runs out again: it goes home at once
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, [seekers[0]]], w.alice);
    for (let i = 0; i < 45; i++) {
      if (i % 10 === 0) await w.warp(DAY);
      const rr = await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
      const [dv] = w.events(rr, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "reveal", [dv.diveId, proofOf(900 + i)], w.stranger);
    }
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "exists", [seekers[0]]), false, "home for good");
  } finally {
    await w.done();
  }
});

test("dive: without a drand proof a day later, the dive ends neutral (x1.00, one voyage)", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers], w.alice);
    const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0], w.alice);
    const [dv] = w.events(r, "Expedition3", "Dived");
    await w.warp(310);
    await w.no(w.exp, "Expedition3", "revealFallback", [dv.diveId], w.stranger);
    await w.warp(DAY);
    const rr = await w.ok(w.exp, "Expedition3", "revealFallback", [dv.diveId], w.stranger);
    const [rev] = w.events(rr, "Expedition3", "Revealed");
    assert.equal(rev.multX100, 100);
    assert.equal(rev.wear, 1);
    assert.equal(rev.fallbackUsed, true);
  } finally {
    await w.done();
  }
});

test("teams: at most 5 per wallet; batch dives; disband unlocks", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    await w.warp(2 * DAY); // past the early spire limit
    const spires = await w.summon(w.alice, SPIRE, 3, proofOf(11));
    spires.push(...await w.summon(w.alice, SPIRE, 3, proofOf(12)));
    const seekers = await w.summon(w.alice, SEEKER, 6, proofOf(13));
    for (let i = 0; i < 5; i++) await w.ok(w.exp, "Expedition3", "setTeam", [spires[i], 0n, [seekers[i]]], w.alice);
    await w.no(w.exp, "Expedition3", "setTeam", [spires[5], 0n, [seekers[5]]], w.alice);
    const r = await w.ok(w.exp, "Expedition3", "diveMany", [[spires[0], spires[1], spires[2]], [0, 0, 1]], w.alice);
    assert.equal(w.events(r, "Expedition3", "Dived").length, 3);
    await w.no(w.exp, "Expedition3", "dive", [spires[3], 0], w.alice); // three passes used
    await w.ok(w.exp, "Expedition3", "disband", [spires[4]], w.alice);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[4]]), false);
    await w.ok(w.exp, "Expedition3", "setTeam", [spires[5], 0n, [seekers[5]]], w.alice);
    await w.warp(310);
    const ids = w.events(r, "Expedition3", "Dived").map((x) => x.diveId);
    await w.ok(w.exp, "Expedition3", "revealMany", [ids, ids.map((_, i) => proofOf(40 + i))], w.stranger);
  } finally {
    await w.done();
  }
});

test("market: escrowed listings, 5% tax from the seller's side (95% pool, 5% burned), cancel any time", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const [card] = await w.summon(w.alice, SEEKER, 1);
    await w.no(w.market, "LightdiveMarket3", "list", [card, E("100")], w.bob);
    await w.ok(w.market, "LightdiveMarket3", "list", [card, E("100")], w.alice);
    assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [card])).toLowerCase(), w.market.toLowerCase());
    await w.no(w.market, "LightdiveMarket3", "buy", [card, E("99")], w.bob); // price protection
    const [s0, p0, supply] = [await w.bal(w.alice), await w.bal(w.pool), await w.read(w.rvyn, "LaunchToken", "totalSupply")];
    await w.ok(w.market, "LightdiveMarket3", "buy", [card, E("100")], w.bob);
    assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [card])).toLowerCase(), w.bob.toLowerCase());
    assert.equal(await w.bal(w.alice) - s0, E("95"));
    assert.equal(await w.bal(w.pool) - p0, E("4.75"));
    assert.equal(supply - await w.read(w.rvyn, "LaunchToken", "totalSupply"), E("0.25"));
    // cancel works even while paused
    await w.ok(w.market, "LightdiveMarket3", "list", [card, E("50")], w.bob);
    await w.ok(w.market, "LightdiveMarket3", "pause");
    await w.no(w.market, "LightdiveMarket3", "buy", [card, E("50")], w.alice);
    await w.ok(w.market, "LightdiveMarket3", "cancel", [card], w.bob);
    assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [card])).toLowerCase(), w.bob.toLowerCase());
  } finally {
    await w.done();
  }
});

test("market: listMany lists up to 20 idle cards in one transaction, all or nothing", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const cards = await w.summon(w.alice, SEEKER, 3);
    const prices = [E("10"), E("11"), E("12")];
    await w.no(w.market, "LightdiveMarket3", "listMany", [cards, prices.slice(0, 2)], w.alice); // lengths differ
    await w.no(w.market, "LightdiveMarket3", "listMany", [[], []], w.alice);
    await w.no(w.market, "LightdiveMarket3", "listMany", [Array(21).fill(cards[0]), Array(21).fill(E("1"))], w.alice);
    await w.no(w.market, "LightdiveMarket3", "listMany", [cards, [E("10"), 0n, E("12")]], w.alice); // one bad price
    await w.no(w.market, "LightdiveMarket3", "listMany", [cards, prices], w.bob); // not the owner
    for (const c of cards) assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [c])).toLowerCase(), w.alice.toLowerCase());
    const r = await w.ok(w.market, "LightdiveMarket3", "listMany", [cards, prices], w.alice);
    assert.equal(w.events(r, "LightdiveMarket3", "Listed").length, 3);
    for (const [i, c] of cards.entries()) {
      assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [c])).toLowerCase(), w.market.toLowerCase());
      assert.equal((await w.read(w.market, "LightdiveMarket3", "listings", [c]))[1], prices[i]);
    }
    await w.ok(w.market, "LightdiveMarket3", "buy", [cards[1], E("11")], w.bob);
    await w.ok(w.market, "LightdiveMarket3", "pause");
    await w.no(w.market, "LightdiveMarket3", "listMany", [[cards[1]], [E("20")]], w.bob);
  } finally {
    await w.done();
  }
});

test("TestRVYN (testnet only): the faucet gives once per period, the owner mints and bounds the faucet, anyone can burn", async () => {
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3, defaultBalance: 100 }, chain: { chainId: 31337, hardfork: "shanghai" } });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [owner, player, other] = await wallet.getAddresses();
  try {
    const hash = await wallet.deployContract({ account: owner, abi: A.TestRVYN.abi, bytecode: A.TestRVYN.bytecode, args: [owner], gas: 5_000_000n });
    const token = (await client.waitForTransactionReceipt({ hash })).contractAddress;
    const send = async (account, fn, args = []) => (await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account, address: token, abi: A.TestRVYN.abi, functionName: fn, args, gas: 500_000n }) })).status;
    const read = (fn, args = []) => client.readContract({ address: token, abi: A.TestRVYN.abi, functionName: fn, args });
    const warp = async (s) => { await provider.request({ method: "evm_increaseTime", params: [s] }); await provider.request({ method: "evm_mine", params: [] }); };

    assert.equal(await read("symbol"), "tRVYN");
    assert.equal(await read("nextDripAt", [player]), 0n, "a new wallet may take at once");
    assert.equal(await send(player, "drip"), "success");
    assert.equal(await read("balanceOf", [player]), E("1000"));
    assert.equal(await send(player, "drip"), "reverted", "not twice a day");
    await warp(DAY);
    assert.equal(await send(player, "drip"), "success", "again a day later");
    assert.equal(await read("balanceOf", [player]), E("2000"));

    assert.equal(await send(player, "mint", [player, E("1")]), "reverted", "only the owner mints");
    assert.equal(await send(owner, "mint", [other, E("5")]), "success");
    assert.equal(await send(player, "setDrip", [E("1"), 3600]), "reverted", "only the owner sets the faucet");
    assert.equal(await send(owner, "setDrip", [E("100001"), 3600]), "reverted", "at most 100,000 per drip");
    assert.equal(await send(owner, "setDrip", [E("500"), 600]), "reverted", "at least an hour apart");
    assert.equal(await send(owner, "setDrip", [E("500"), 3600]), "success");

    assert.equal(await send(other, "burn", [E("2")]), "success", "burnable, as the game needs");
    assert.equal(await read("balanceOf", [other]), E("3"));
  } finally {
    await provider.disconnect();
  }
});
