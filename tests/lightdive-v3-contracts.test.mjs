import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, parseEther, keccak256, encodeAbiParameters, decodeEventLog } from "viem";
import { ODDS } from "../lib/lightdive-v3/odds.ts";
import { DESTINATIONS, planDive, skyOf } from "../lib/lightdive-v3/rules.ts";
import { commissionsOf } from "../lib/lightdive-v3/commissions.ts";

// The Lightdive v3 contracts end to end on a local chain, with test randomness that has drand's timing. Run after
// `node scripts/compile-contracts-lightdive-v3.mjs` (or `npm run test:lightdive:v3`).
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive-v3/artifacts/contracts.json", "utf8"));
A.LaunchToken = JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")).LaunchToken;

const E = parseEther;
const DAY = 86_400;
const SPIRE = 0, PRISM = 1, SEEKER = 2;
const BEAM_KEY = ["廣域", "聚焦", "針芒"];
const proofOf = (n) => `0x${n.toString(16).padStart(128, "0")}`;
/** v3.3: the reveals a transaction carries (none, or dives with their proofs). */
const NONE = { dives: [], diveProofs: [], summons: [], summonProofs: [] };
const S = (dives, diveProofs, summons = [], summonProofs = []) => ({ dives, diveProofs, summons, summonProofs });

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
  const exp = await deploy("Expedition3", [admin, nft, config, rng, pool, minter]);
  const market = await deploy("LightdiveMarket3", [admin, rvyn, nft, config, pool, minter]);
  const comm = await deploy("LightdiveCommissions3", [admin, exp, config]);
  for (let c = 0; c < 6; c++) {
    for (let b = 0; b < 3; b++) {
      const tiers = ODDS[`${c + 1}${BEAM_KEY[b]}`].map(([probBp, lo, hi]) => ({ probBp, lo, hi }));
      await ok(config, "LightdiveConfig3", "setTable", [c, b, tiers]);
    }
  }
  await ok(nft, "LightdiveNFT3", "setMinter", [minter]);
  await ok(nft, "LightdiveNFT3", "setGame", [exp]);
  await ok(pool, "CoreLightPool3", "setExpedition", [exp]);
  await ok(exp, "Expedition3", "setCommissions", [comm]);
  await ok(rvyn, "LaunchToken", "approve", [pool, E(fund)]);
  await ok(pool, "CoreLightPool3", "fund", [E(fund)]);
  await ok(minter, "LightdiveMinter3", "setPricer", [pricer]);
  for (const player of [alice, bob]) {
    await ok(rvyn, "LaunchToken", "transfer", [player, E("100000")]);
    await ok(rvyn, "LaunchToken", "approve", [minter, E("100000")], player);
    await ok(rvyn, "LaunchToken", "approve", [market, E("100000")], player);
    await ok(rvyn, "LaunchToken", "approve", [pool, E("100000")], player); // supplies are paid into the pool
    await ok(nft, "LightdiveNFT3", "setApprovalForAll", [market, true], player);
  }

  const bal = (who) => read(rvyn, "LaunchToken", "balanceOf", [who]);
  const attrs = (id) => read(nft, "LightdiveNFT3", "attributes", [id]);
  /** Summons and reveals; returns the new card ids. */
  const summon = async (player, kind, qty, proof = proofOf(1)) => {
    const before = await read(nft, "LightdiveNFT3", "nextId");
    await ok(minter, "LightdiveMinter3", "summon", [kind, qty, [], []], player);
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

  return { provider, client, admin, treasury, alice, bob, stranger, pricer, rvyn, rng, config, nft, pool, minter, exp, market, comm,
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
              const got = await w.read(w.config, "LightdiveConfig3", "plan", [d.id, BigInt(power), beam, day, k, 0, false]);
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
    // v3.1: crew bond / star chart stability and deep dives
    let mods = 0;
    const sky = skyOf(today);
    for (const d of DESTINATIONS) {
      for (const beam of [0, 1, 2]) {
        for (const over of [0, 0.6]) {
          const power = Math.round(d.threshold * (1 + over));
          for (const [k, decision] of decisions.entries()) {
            for (const [stability, deep] of [[3, false], [8, true], [0, true]]) {
              const want = planDive({ spire: power, prism: { power: 0, beam }, seekers: [] }, d, sky, decision, { stability, deep });
              const got = await w.read(w.config, "LightdiveConfig3", "plan", [d.id, BigInt(power), beam, today, k, stability, deep]);
              assert.deepEqual(got.table.map((t) => [t.probBp, t.lo, t.hi]), want.table, `v3.1 table ${d.id}/${beam}/${power}/${decision}/${stability}/${deep}`);
              assert.equal(got.risk, want.risk);
              mods++;
            }
          }
        }
      }
    }
    console.log(`  ${mods} v3.1 plans (stability, deep dives) match`);
    for (const day of [today, today + 1, today + 7, 20_000, 30_123]) {
      const got = await w.read(w.comm, "LightdiveCommissions3", "commissionsOf", [day]);
      const kinds = ["cluster", "good", "bond", "attuned", "sky", "deep", "supply"];
      assert.deepEqual(got.map((c) => ({ kind: kinds[c.kind], param: c.param })), commissionsOf(day).map((c) => ({ kind: c.kind, param: c.param })), `commissions of ${day}`);
    }
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

test("summon: closed until the sale opens, paid 70/15/15, minted sealed at once and unsealed after the drand round", async () => {
  const w = await world();
  try {
    await w.no(w.minter, "LightdiveMinter3", "summon", [SEEKER, 1, [], []], w.alice);
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const supply = await w.read(w.rvyn, "LaunchToken", "totalSupply");
    const [pool0, tre0] = [await w.bal(w.pool), await w.bal(w.treasury)];
    const sr = await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 10, [], []], w.alice);
    assert.equal(await w.bal(w.pool) - pool0, E("140"), "70% of 200 to the pool");
    assert.equal(await w.bal(w.treasury) - tre0, E("30"));
    assert.equal(supply - await w.read(w.rvyn, "LaunchToken", "totalSupply"), E("30"), "15% burned");
    // v3.3: the ten cards exist at once, sealed, and count against the cap
    const [req] = w.events(sr, "LightdiveMinter3", "SummonRequested");
    assert.equal(req.firstId, 1n);
    for (let id = 1n; id <= 10n; id++) {
      const a = await w.attrs(id);
      assert.equal(a.rarity, 255, "sealed");
      assert.equal(a.kind, SEEKER);
      assert.equal(a.voyagesLeft, 45);
    }
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "alive", [2n]), 10);
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
      assert.ok(a.rarity <= 4, "unsealed");
      assert.ok(a.power >= BANDS[a.rarity][0] && a.power <= BANDS[a.rarity][1], "power inside the rarity band");
      assert.ok(a.trait < 6);
      assert.equal(a.voyagesLeft, 45);
    }
    assert.deepEqual([...await w.read(w.minter, "LightdiveMinter3", "rarityOdds", [SEEKER])].map(Number), [4400, 3500, 1500, 500, 100]);
    // spires: at most 3 per wallet in the first 48 hours; seats = rarity + 1
    const spires = await w.summon(w.alice, SPIRE, 3);
    for (const id of spires) { const a = await w.attrs(id); assert.equal(a.trait, a.rarity + 1); }
    await w.no(w.minter, "LightdiveMinter3", "summon", [SPIRE, 1, [], []], w.alice);
    await w.warp(2 * DAY);
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SPIRE, 1, [], []], w.alice);
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
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 10, [], []], w.alice);
    await w.no(w.minter, "LightdiveMinter3", "summon", [SEEKER, 3, [], []], w.bob);
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 2, [], []], w.bob);
    // nobody brings a proof: after 7 days the request settles as the weakest cards (never better than a draw)
    await w.no(w.minter, "LightdiveMinter3", "revealFallback", [0n], w.alice);
    await w.warp(DAY + 60);
    await w.no(w.minter, "LightdiveMinter3", "revealFallback", [0n], w.alice); // v3.3: a day is no longer enough
    await w.warp(6 * DAY);
    await w.no(w.minter, "LightdiveMinter3", "revealFallback", [0n], w.stranger); // only the player who summoned
    await w.ok(w.minter, "LightdiveMinter3", "revealFallback", [0n], w.alice);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "balanceOf", [w.alice]), 10n);
    for (let id = 1n; id <= 10n; id++) {
      const a = await w.attrs(id);
      assert.equal(a.rarity, 0, "the weakest rarity");
      assert.equal(a.power, 10, "the lowest power");
    }
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
    await w.no(w.exp, "Expedition3", "setTeam", [spire, prism, seekers, NONE], w.bob);
    await w.no(w.exp, "Expedition3", "setTeam", [spire, prism, [seekers[0], seekers[0]], NONE], w.alice);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, prism, seekers, NONE], w.alice);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[0]]), true);
    await w.no(w.nft, "LightdiveNFT3", "transferFrom", [w.alice, w.bob, seekers[0]], w.alice);
    await w.no(w.market, "LightdiveMarket3", "list", [prism, E("10"), [], []], w.alice);

    const day = await w.read(w.exp, "Expedition3", "today");
    await w.no(w.exp, "Expedition3", "dive", [spire, 23, 0, false, 255, NONE], w.alice); // far too weak for the core
    const receipt = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
    const [dived] = w.events(receipt, "Expedition3", "Dived");
    const id = dived.diveId;
    assert.equal(await w.read(w.exp, "Expedition3", "passesUsed", [w.alice, day]), 1);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice); // out on a dive: collect first
    await w.no(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    // first day: the rate is the launch cap
    assert.equal(await w.read(w.exp, "Expedition3", "dayRate", [day]), E("0.015"));

    const d = await w.read(w.exp, "Expedition3", "diveInfo", [id]);
    const roundTime = Number(await w.read(w.rng, "MockRandomness", "roundTime", [d.round]));
    assert.ok(roundTime - (await w.now()) >= 299 && roundTime - (await w.now()) <= 303, "about five minutes away");
    await w.warp(roundTime - (await w.now()) - 30);
    await w.no(w.exp, "Expedition3", "settle", [S([id], [proofOf(1)])], w.stranger); // not published yet
    await w.warp(40);

    // pick a proof that brings back something, then check the payment to the wei
    const p = await w.read(w.config, "LightdiveConfig3", "plan", [0, BigInt(d.power), d.beam, Number(d.day), 0, 0, false]);
    const proof = w.proofFor(d.round, id, p.table, (tier) => tier >= 2);
    const poolBefore = await w.read(w.pool, "CoreLightPool3", "available");
    const r = await w.ok(w.exp, "Expedition3", "settle", [S([id], [proof])], w.stranger);
    const [rev] = w.events(r, "Expedition3", "Revealed");
    const gross = d.pointsE2 * BigInt(rev.multX100) * d.rate / 10_000n;
    const levy = gross * BigInt(p.levyBp) / 10_000n;
    assert.equal(rev.reward, gross - levy);
    assert.equal(await w.read(w.exp, "Expedition3", "credit", [w.alice]), gross - levy);
    const burned = levy * 500n / 10_000n;
    assert.equal(poolBefore - (await w.read(w.pool, "CoreLightPool3", "available")), gross - levy + burned, "levy stays, 5% of it burned");
    // settling again changes nothing (a dive is settled once)
    await w.ok(w.exp, "Expedition3", "settle", [S([id], [proofOf(2)])], w.stranger);
    assert.equal(await w.read(w.exp, "Expedition3", "credit", [w.alice]), gross - levy);
    assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).activeDive, 0n);
    assert.equal((await w.attrs(spire)).voyagesLeft, 180 - rev.wear);

    // three passes a day per wallet
    for (let i = 0; i < 2; i++) {
      const rr = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
      const [dv] = w.events(rr, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(9)])], w.stranger);
    }
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);

    // claim: 15% fee on the first day, 95% of it stays in the pool, 5% burned
    const credit = await w.read(w.exp, "Expedition3", "credit", [w.alice]);
    const before = await w.bal(w.alice);
    await w.ok(w.exp, "Expedition3", "claim", [NONE], w.alice);
    assert.equal(await w.bal(w.alice) - before, credit - credit * 1500n / 10_000n);
    await w.no(w.exp, "Expedition3", "claim", [NONE], w.alice);

    // the next day: a new rate from yesterday's points, fresh passes
    await w.warp(DAY);
    await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
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
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    // the deepest destination the team qualifies for keeps some empty-handed chance after overflow stability
    const [power] = await w.read(w.exp, "Expedition3", "teamPower", [spire, 0, await w.read(w.exp, "Expedition3", "today")]);
    const dest = DESTINATIONS.filter((x) => x.threshold <= Number(power)).at(-1).id;
    const r = await w.ok(w.exp, "Expedition3", "dive", [spire, dest, 0, false, 255, NONE], w.alice);
    const [dv] = w.events(r, "Expedition3", "Dived");
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId]);
    const p = await w.read(w.config, "LightdiveConfig3", "plan", [dest, BigInt(d.power), d.beam, Number(d.day), 0, 0, false]);
    await w.warp(310);
    const proof = w.proofFor(d.round, dv.diveId, p.table, (tier) => tier === 0);
    const avail = await w.read(w.pool, "CoreLightPool3", "available");
    const rr = await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proof])], w.stranger);
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
      await w2.ok(w2.exp, "Expedition3", "setTeam", [a.spire, 0n, a.seekers, NONE], w2.alice);
      await w2.ok(w2.config, "LightdiveConfig3", "setEconomy", [20, 20, E("1")]);
      await w2.no(w2.exp, "Expedition3", "dive", [a.spire, 0, 0, false, 255, NONE], w2.alice);
      await w2.ok(w2.config, "LightdiveConfig3", "setEconomy", [20, 300, E("0.015")]);
      await w2.ok(w2.exp, "Expedition3", "dive", [a.spire, 0, 0, false, 255, NONE], w2.alice);
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
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    // dive until the seeker's 45 voyages run out (cluster 1 always wears exactly 1)
    let dives = 0;
    while ((await w.attrs(seekers[0])).voyagesLeft > 0) {
      if (dives > 0 && dives % 10 === 0) await w.warp(DAY);
      const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
      const [dv] = w.events(r, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(dives + 1)])], w.stranger);
      dives++;
      if (!(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[0]]))) break;
    }
    assert.equal(dives, 45);
    const a = await w.attrs(seekers[0]);
    assert.equal(a.voyagesLeft, 0);
    assert.ok(a.dockedAt > 0n, "docked");
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[0]]), false, "left the team");
    assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).seekers.length, 0);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice); // no seekers left
    await w.no(w.exp, "Expedition3", "setTeam", [spire, 0n, [seekers[0]], NONE], w.alice); // docked cards cannot join
    await w.no(w.market, "LightdiveMarket3", "list", [seekers[0], E("5"), [], []], w.alice); // nor be listed
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
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, [extra], NONE], w.alice);
    for (let i = 0; i < 45; i++) {
      if (i % 10 === 0) await w.warp(DAY);
      const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
      const [dv] = w.events(r, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(500 + i)])], w.stranger);
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
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, [seekers[0]], NONE], w.alice);
    for (let i = 0; i < 45; i++) {
      if (i % 10 === 0) await w.warp(DAY);
      const rr = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
      const [dv] = w.events(rr, "Expedition3", "Dived");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(900 + i)])], w.stranger);
    }
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "exists", [seekers[0]]), false, "home for good");
  } finally {
    await w.done();
  }
});

test("dive: without a drand proof, the fallback is empty-handed with the most wear (lamp oil: one), never better than a draw", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
    const [dv] = w.events(r, "Expedition3", "Dived");
    await w.warp(310);
    await w.no(w.exp, "Expedition3", "revealFallback", [dv.diveId], w.alice);
    await w.warp(DAY);
    await w.no(w.exp, "Expedition3", "revealFallback", [dv.diveId], w.stranger); // only the owner (v3.3)
    const rr = await w.ok(w.exp, "Expedition3", "revealFallback", [dv.diveId], w.alice);
    const [rev] = w.events(rr, "Expedition3", "Revealed");
    assert.equal(rev.multX100, 0);
    assert.equal(rev.reward, 0n);
    assert.equal(rev.tier, 0);
    assert.equal(rev.wear, 3);
    assert.equal(rev.fallbackUsed, true);
    // with lamp oil the most wear is one voyage
    await w.ok(w.rvyn, "LaunchToken", "approve", [w.pool, E("1000")], w.alice);
    const r2 = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 1, false, 255, NONE], w.alice);
    const [dv2] = w.events(r2, "Expedition3", "Dived");
    await w.warp(DAY + 400);
    const rr2 = await w.ok(w.exp, "Expedition3", "revealFallback", [dv2.diveId], w.alice);
    assert.equal(w.events(rr2, "Expedition3", "Revealed")[0].wear, 1);
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
    for (let i = 0; i < 5; i++) await w.ok(w.exp, "Expedition3", "setTeam", [spires[i], 0n, [seekers[i]], NONE], w.alice);
    await w.no(w.exp, "Expedition3", "setTeam", [spires[5], 0n, [seekers[5]], NONE], w.alice);
    const r = await w.ok(w.exp, "Expedition3", "diveMany", [[spires[0], spires[1], spires[2]], [0, 0, 1], 0, 255, NONE], w.alice);
    assert.equal(w.events(r, "Expedition3", "Dived").length, 3);
    await w.no(w.exp, "Expedition3", "dive", [spires[3], 0, 0, false, 255, NONE], w.alice); // three passes used
    await w.ok(w.exp, "Expedition3", "disband", [spires[4]], w.alice);
    assert.equal(await w.read(w.nft, "LightdiveNFT3", "locked", [seekers[4]]), false);
    await w.ok(w.exp, "Expedition3", "setTeam", [spires[5], 0n, [seekers[5]], NONE], w.alice);
    await w.warp(310);
    const ids = w.events(r, "Expedition3", "Dived").map((x) => x.diveId);
    await w.ok(w.exp, "Expedition3", "settle", [S(ids, ids.map((_, i) => proofOf(40 + i)))], w.stranger);
  } finally {
    await w.done();
  }
});

test("market: escrowed listings, 5% tax from the seller's side (95% pool, 5% burned), cancel any time", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const [card] = await w.summon(w.alice, SEEKER, 1);
    await w.no(w.market, "LightdiveMarket3", "list", [card, E("100"), [], []], w.bob);
    await w.ok(w.market, "LightdiveMarket3", "list", [card, E("100"), [], []], w.alice);
    assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [card])).toLowerCase(), w.market.toLowerCase());
    await w.no(w.market, "LightdiveMarket3", "buy", [card, E("99")], w.bob); // price protection
    const [s0, p0, supply] = [await w.bal(w.alice), await w.bal(w.pool), await w.read(w.rvyn, "LaunchToken", "totalSupply")];
    await w.ok(w.market, "LightdiveMarket3", "buy", [card, E("100")], w.bob);
    assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [card])).toLowerCase(), w.bob.toLowerCase());
    assert.equal(await w.bal(w.alice) - s0, E("95"));
    assert.equal(await w.bal(w.pool) - p0, E("4.75"));
    assert.equal(supply - await w.read(w.rvyn, "LaunchToken", "totalSupply"), E("0.25"));
    // cancel works even while paused
    await w.ok(w.market, "LightdiveMarket3", "list", [card, E("50"), [], []], w.bob);
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
    await w.no(w.market, "LightdiveMarket3", "listMany", [cards, prices.slice(0, 2), [], []], w.alice); // lengths differ
    await w.no(w.market, "LightdiveMarket3", "listMany", [[], [], [], []], w.alice);
    await w.no(w.market, "LightdiveMarket3", "listMany", [Array(21).fill(cards[0]), Array(21).fill(E("1")), [], []], w.alice);
    await w.no(w.market, "LightdiveMarket3", "listMany", [cards, [E("10"), 0n, E("12")], [], []], w.alice); // one bad price
    await w.no(w.market, "LightdiveMarket3", "listMany", [cards, prices, [], []], w.bob); // not the owner
    for (const c of cards) assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [c])).toLowerCase(), w.alice.toLowerCase());
    const r = await w.ok(w.market, "LightdiveMarket3", "listMany", [cards, prices, [], []], w.alice);
    assert.equal(w.events(r, "LightdiveMarket3", "Listed").length, 3);
    for (const [i, c] of cards.entries()) {
      assert.equal((await w.read(w.nft, "LightdiveNFT3", "ownerOf", [c])).toLowerCase(), w.market.toLowerCase());
      assert.equal((await w.read(w.market, "LightdiveMarket3", "listings", [c]))[1], prices[i]);
    }
    await w.ok(w.market, "LightdiveMarket3", "buy", [cards[1], E("11")], w.bob);
    await w.ok(w.market, "LightdiveMarket3", "pause");
    await w.no(w.market, "LightdiveMarket3", "listMany", [[cards[1]], [E("20")], [], []], w.bob);
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

test("v3.1 deep dive: from the minimum cluster, 2 passes, twice the points, one risk level up (no turning back since v3.3)", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, true, 255, NONE], w.alice); // cluster 1 is below the deep-dive minimum
    await w.no(w.config, "LightdiveConfig3", "setDeepDive", [900, 600, 0], w.alice);
    await w.ok(w.config, "LightdiveConfig3", "setDeepDive", [900, 600, 0]); // owner: deep dives everywhere for the test

    const day = await w.read(w.exp, "Expedition3", "today");
    const [power, bonus] = await w.read(w.exp, "Expedition3", "teamPower", [spire, 0, day]);
    const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, true, 255, NONE], w.alice);
    const [dv] = w.events(r, "Expedition3", "Dived");
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId]);
    assert.equal(d.long, true);
    assert.equal(await w.read(w.exp, "Expedition3", "passesUsed", [w.alice, day]), 2);
    assert.equal(await w.read(w.exp, "Expedition3", "teamDives", [spire, day]), 2);
    const coef = (await w.read(w.config, "LightdiveConfig3", "destOf", [day, 0]))[1];
    assert.equal(d.pointsE2, (power * 100n + bonus) * coef / 10_000n * 2n, "twice the points");
    const at = Number(await w.read(w.rng, "MockRandomness", "roundTime", [d.round]));
    assert.ok(at - (await w.now()) >= 899 && at - (await w.now()) <= 903, "fifteen minutes away");
    await w.warp(at - (await w.now()) + 10);

    const rv = await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(5)])], w.stranger);
    const [res] = w.events(rv, "Expedition3", "Revealed");
    const p = await w.read(w.config, "LightdiveConfig3", "plan", [0, BigInt(d.power), d.beam, Number(d.day), 0, 0, true]);
    const flat = await w.read(w.config, "LightdiveConfig3", "plan", [0, BigInt(d.power), d.beam, Number(d.day), 0, 0, false]);
    assert.equal(p.risk, Math.min(2, flat.risk + 1), "one risk level up");
    const gross = d.pointsE2 * BigInt(res.multX100) * d.rate / 10_000n;
    assert.equal(res.reward, res.multX100 === 0 ? 0n : gross - gross * BigInt(p.levyBp) / 10_000n);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, true, 255, NONE], w.alice); // only 1 pass left today
  } finally {
    await w.done();
  }
});

test("v3.1 crew bond: grows with each revealed dive, up to the maximum, resets when the team changes", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    await w.ok(w.config, "LightdiveConfig3", "setSupplies", [400, 600, 3, 2]); // bond up to 2 for a short test
    for (const want of [0, 1, 2]) {
      assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).bond, want);
      const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
      const [dv] = w.events(r, "Expedition3", "Dived");
      assert.equal((await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId])).bond, want, "recorded at departure");
      await w.warp(310);
      await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(30 + want)])], w.stranger);
    }
    assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).bond, 2, "capped");
    // the bond is used in the plan: 2 points of empty-handed chance moved to normal
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [2n]);
    const plain = await w.read(w.config, "LightdiveConfig3", "plan", [0, BigInt(d.power), d.beam, Number(d.day), 0, 0, false]);
    const bonded = await w.read(w.config, "LightdiveConfig3", "plan", [0, BigInt(d.power), d.beam, Number(d.day), 0, 2, false]);
    // (at most the empty row: a strong team has little empty-handed chance left after its overflow)
    assert.equal(plain.table[0].probBp - bonded.table[0].probBp, Math.min(200, plain.table[0].probBp));
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    assert.equal((await w.read(w.exp, "Expedition3", "team", [spire])).bond, 0, "any change resets it");
  } finally {
    await w.done();
  }
});

test("v3.1 supplies: priced from the dive's reward, paid into the pool (5% burned); lamp oil wears 1, a chart steadies", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 3, false, 255, NONE], w.alice); // no such supply
    const before = await w.bal(w.alice);
    const poolBefore = await w.bal(w.pool);
    const r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 1, false, 255, NONE], w.alice);
    const [dv] = w.events(r, "Expedition3", "Dived");
    const [det] = w.events(r, "Expedition3", "DiveDetails");
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId]);
    const price = d.pointsE2 * d.rate / 100n * 400n / 10_000n;
    assert.ok(price > 0n);
    assert.equal(det.supplyPaid, price);
    assert.equal(before - (await w.bal(w.alice)), price);
    assert.equal(await w.bal(w.pool) - poolBefore, price - price * 500n / 10_000n, "95% stays in the pool");
    // lamp oil: whatever the draw, one voyage of wear
    await w.warp(310);
    const rv = await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(77)])], w.stranger);
    assert.equal(w.events(rv, "Expedition3", "Revealed")[0].wear, 1);
    // a star chart: recorded, and priced at 6%
    const r2 = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 2, false, 255, NONE], w.alice);
    const [dv2] = w.events(r2, "Expedition3", "Dived");
    const d2 = await w.read(w.exp, "Expedition3", "diveInfo", [dv2.diveId]);
    assert.equal(d2.supply, 2);
    const priceChart = d2.pointsE2 * d2.rate / 100n * 600n / 10_000n;
    assert.equal(w.events(r2, "Expedition3", "DiveDetails")[0].supplyPaid, priceChart);
  } finally {
    await w.done();
  }
});

test("v3.3 commissions: taken with a dive, completed on their own when a matching dive settles; one at a time; abandon blocks", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const { spire, seekers } = await w.squad(w.alice, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    // move to a day that has a "supply" commission and a "bond" commission
    let today = Number(await w.read(w.comm, "LightdiveCommissions3", "today"));
    let day = today;
    for (; day < today + 400; day++) {
      const kinds = commissionsOf(day).map((c) => c.kind);
      if (kinds.includes("supply") && kinds.includes("bond")) break;
    }
    await w.warp((day - today) * DAY);
    today = Number(await w.read(w.comm, "LightdiveCommissions3", "today"));
    assert.equal(today, day);
    const list = commissionsOf(day);
    const supplyIndex = list.find((c) => c.kind === "supply").index;
    const bond = list.find((c) => c.kind === "bond");

    await w.no(w.comm, "LightdiveCommissions3", "accept", [3], w.alice);
    await w.no(w.comm, "LightdiveCommissions3", "acceptFor", [w.alice, supplyIndex], w.alice); // only Expedition3
    await w.no(w.comm, "LightdiveCommissions3", "settled", [w.alice, 0n], w.alice);

    // taken with a dive that has no supply: it stays open
    let r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, supplyIndex, NONE], w.alice);
    let [dv] = w.events(r, "Expedition3", "Dived");
    assert.equal((await w.read(w.comm, "LightdiveCommissions3", "active", [w.alice]))[1], supplyIndex);
    await w.warp(310);
    let st = await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(3)])], w.stranger);
    assert.equal(w.events(st, "LightdiveCommissions3", "Completed").length, 0, "no supply: not met");
    assert.equal((await w.read(w.comm, "LightdiveCommissions3", "active", [w.alice]))[2], true, "still active");

    // the next dive carries a supply, the same commission again (a no-op) and settles the last one in the same go
    r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 2, false, supplyIndex, NONE], w.alice);
    [dv] = w.events(r, "Expedition3", "Dived");
    await w.warp(310);
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId]);
    const creditBefore = await w.read(w.exp, "Expedition3", "credit", [w.alice]);
    st = await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(4)])], w.stranger);
    const [done] = w.events(st, "LightdiveCommissions3", "Completed");
    const [rev] = w.events(st, "Expedition3", "Revealed");
    assert.equal(done.bonus, d.pointsE2 * d.rate / 100n * 1000n / 10_000n);
    assert.equal(await w.read(w.exp, "Expedition3", "credit", [w.alice]) - creditBefore, rev.reward + done.bonus);
    assert.equal((await w.read(w.comm, "LightdiveCommissions3", "active", [w.alice]))[2], false, "completed");
    await w.no(w.comm, "LightdiveCommissions3", "accept", [supplyIndex], w.alice); // completed today

    // abandon: that one cannot be taken again today, another can
    await w.ok(w.comm, "LightdiveCommissions3", "accept", [bond.index], w.alice);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, false, supplyIndex, NONE], w.alice); // another is active
    await w.ok(w.comm, "LightdiveCommissions3", "abandon", [], w.alice);
    await w.no(w.comm, "LightdiveCommissions3", "accept", [bond.index], w.alice);
    const third = list.find((x) => x.kind !== "supply" && x.kind !== "bond");
    await w.ok(w.comm, "LightdiveCommissions3", "accept", [third.index], w.alice);
  } finally {
    await w.done();
  }
});

test("v3.2 echo bridges: another observer's dive at the same place that day is echoed (+1 point to normal), your own is not", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    const a = await w.squad(w.alice, 1);
    const b = await w.squad(w.bob, 1);
    await w.ok(w.exp, "Expedition3", "setTeam", [a.spire, 0n, a.seekers, NONE], w.alice);
    await w.ok(w.exp, "Expedition3", "setTeam", [b.spire, 0n, b.seekers, NONE], w.bob);
    const day = await w.read(w.exp, "Expedition3", "today");
    // the deepest destination both teams qualify for keeps some empty-handed chance
    const reach = async (spire) => Number((await w.read(w.exp, "Expedition3", "teamPower", [spire, 0, day]))[0]);
    const top = Math.min(await reach(a.spire), await reach(b.spire));
    const dest = DESTINATIONS.filter((x) => x.threshold <= top).at(-1).id;
    assert.equal(await w.read(w.config, "LightdiveConfig3", "echoStability"), 1);

    // the first bridge of the day: nobody to follow
    let r = await w.ok(w.exp, "Expedition3", "dive", [a.spire, dest, 0, false, 255, NONE], w.alice);
    let [dv] = w.events(r, "Expedition3", "Dived");
    assert.equal(w.events(r, "Expedition3", "Echoed").length, 0);
    assert.equal(await w.read(w.exp, "Expedition3", "echoed", [dv.diveId]), false);
    assert.equal(await w.read(w.exp, "Expedition3", "lastDiver", [Number(day), dest]), w.alice);
    await w.warp(310);
    await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proofOf(9)])], w.stranger);
    // following your own bridge is not an echo
    r = await w.ok(w.exp, "Expedition3", "dive", [a.spire, dest, 0, false, 255, NONE], w.alice);
    [dv] = w.events(r, "Expedition3", "Dived");
    assert.equal(w.events(r, "Expedition3", "Echoed").length, 0);
    assert.equal(await w.read(w.exp, "Expedition3", "echoed", [dv.diveId]), false);

    // someone else's is: the event names the guide, the guide's count grows, the bridge is now the follower's
    r = await w.ok(w.exp, "Expedition3", "dive", [b.spire, dest, 0, false, 255, NONE], w.bob);
    [dv] = w.events(r, "Expedition3", "Dived");
    const [echo] = w.events(r, "Expedition3", "Echoed");
    assert.equal(echo.diveId, dv.diveId);
    assert.equal(echo.guide, w.alice);
    assert.equal(echo.follower, w.bob);
    assert.equal(await w.read(w.exp, "Expedition3", "echoed", [dv.diveId]), true);
    assert.equal(await w.read(w.exp, "Expedition3", "echoesGiven", [w.alice]), 1);
    assert.equal(await w.read(w.exp, "Expedition3", "echoesGiven", [w.bob]), 0);
    assert.equal(await w.read(w.exp, "Expedition3", "lastDiver", [Number(day), dest]), w.bob);
    assert.equal(await w.read(w.exp, "Expedition3", "lastDiver", [Number(day) + 1, dest]), "0x0000000000000000000000000000000000000000", "bridges fade at the end of the day");

    // the reveal uses the echo: a draw that is empty-handed without it lands on "normal" with it
    const d = await w.read(w.exp, "Expedition3", "diveInfo", [dv.diveId]);
    const plain = await w.read(w.config, "LightdiveConfig3", "plan", [dest, BigInt(d.power), d.beam, Number(d.day), 0, d.bond, false]);
    const lit = await w.read(w.config, "LightdiveConfig3", "plan", [dest, BigInt(d.power), d.beam, Number(d.day), 0, d.bond + 1, false]);
    assert.equal(plain.table[0].probBp - lit.table[0].probBp, Math.min(100, plain.table[0].probBp));
    assert.ok(plain.table[0].probBp > lit.table[0].probBp, "the test needs some empty-handed chance left");
    await w.warp(310);
    const tierOf = (x, table) => { let t = 0; for (; t < table.length - 1 && x >= table[t].probBp; t++) x -= table[t].probBp; return t; };
    let proof;
    for (let n = 1; !proof && n < 200_000; n++) {
      const x = Number(w.diveRandom(d.round, proofOf(n), dv.diveId) % 10_000n);
      if (tierOf(x, plain.table) === 0 && tierOf(x, lit.table) === 1) proof = proofOf(n);
    }
    assert.ok(proof, "a proof in the echo's 1%");
    const rv = await w.ok(w.exp, "Expedition3", "settle", [S([dv.diveId], [proof])], w.stranger);
    const [res] = w.events(rv, "Expedition3", "Revealed");
    assert.equal(res.tier, 1);
    assert.ok(res.multX100 > 0, "not empty-handed");

    // the owner can turn echoes off or up to 5 points, no further; nobody else can
    await w.no(w.config, "LightdiveConfig3", "setEcho", [6]);
    await w.no(w.config, "LightdiveConfig3", "setEcho", [2], w.stranger);
    const s = await w.ok(w.config, "LightdiveConfig3", "setEcho", [0]);
    assert.equal(w.events(s, "LightdiveConfig3", "EchoSet")[0].echoStability, 0);
    assert.equal(await w.read(w.config, "LightdiveConfig3", "echoStability"), 0);
    await w.ok(w.config, "LightdiveConfig3", "setEcho", [5]);
  } finally {
    await w.done();
  }
});

test("v3.3 reveals ride along: setTeam unseals fresh cards, a dive settles the team's last dive, claim settles first; sealed cards cannot sail or be listed", async () => {
  const w = await world();
  try {
    await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
    // summon a spire and two seekers, never revealed on their own
    const r1 = await w.ok(w.minter, "LightdiveMinter3", "summon", [SPIRE, 1, [], []], w.alice);
    const [q1] = w.events(r1, "LightdiveMinter3", "SummonRequested");
    const r2 = await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 2, [], []], w.alice);
    const [q2] = w.events(r2, "LightdiveMinter3", "SummonRequested");
    const spire = q1.firstId, seekers = [q2.firstId];
    // sealed cards cannot join a team or be listed
    await w.no(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, NONE], w.alice);
    await w.no(w.market, "LightdiveMarket3", "list", [q2.firstId + 1n, E("5"), [], []], w.alice);
    await w.warp(10);
    // the team change carries both summons' proofs: unsealed and joined in one transaction
    await w.ok(w.exp, "Expedition3", "setTeam", [spire, 0n, seekers, S([], [], [q1.requestId, q2.requestId], [proofOf(31), proofOf(32)])], w.alice);
    assert.ok((await w.attrs(spire)).rarity <= 4);
    // the other seeker was unsealed with its request; listing works now
    await w.ok(w.market, "LightdiveMarket3", "list", [q2.firstId + 1n, E("5"), [], []], w.alice);

    // a dive, then the next dive of the same team settles it first
    let r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice);
    const [first] = w.events(r, "Expedition3", "Dived");
    await w.warp(310);
    await w.no(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, NONE], w.alice); // still out: carry its proof
    r = await w.ok(w.exp, "Expedition3", "dive", [spire, 0, 0, false, 255, S([first.diveId], [proofOf(51)])], w.alice);
    assert.equal(w.events(r, "Expedition3", "Revealed").length, 1, "settled in the same transaction");
    const [second] = w.events(r, "Expedition3", "Dived");
    await w.warp(310);
    // claim settles the last dive first, then pays everything
    const before = await w.bal(w.alice);
    const c = await w.ok(w.exp, "Expedition3", "claim", [S([second.diveId], [proofOf(52)])], w.alice);
    assert.equal(w.events(c, "Expedition3", "Revealed").length, 1);
    const [claimed] = w.events(c, "Expedition3", "Claimed");
    assert.equal(await w.bal(w.alice) - before, claimed.gross - claimed.fee);
    assert.equal(await w.read(w.exp, "Expedition3", "credit", [w.alice]), 0n);

    // a summon unseals earlier requests (anyone's) it carries
    const r3 = await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 1, [], []], w.bob);
    const [q3] = w.events(r3, "LightdiveMinter3", "SummonRequested");
    await w.warp(10);
    await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 1, [q3.requestId], [proofOf(61)]], w.alice);
    assert.ok((await w.attrs(q3.firstId)).rarity <= 4, "bob's card unsealed by alice's summon");
  } finally {
    await w.done();
  }
});

test("v3.3 a card depends only on its own round: revealing earlier or later, or after others, gives the same card", async () => {
  const draw = async (order) => {
    const w = await world();
    try {
      await w.ok(w.minter, "LightdiveMinter3", "openSale", [0n]);
      const ra = await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 3, [], []], w.alice);
      const rb = await w.ok(w.minter, "LightdiveMinter3", "summon", [SEEKER, 3, [], []], w.bob);
      const [qa] = w.events(ra, "LightdiveMinter3", "SummonRequested");
      const [qb] = w.events(rb, "LightdiveMinter3", "SummonRequested");
      await w.warp(10);
      for (const q of order === "ab" ? [qa, qb] : [qb, qa]) await w.ok(w.minter, "LightdiveMinter3", "reveal", [q.requestId, proofOf(7)], w.stranger);
      return await Promise.all([0n, 1n, 2n].map(async (i) => { const a = await w.attrs(qa.firstId + i); return [a.rarity, a.power, a.trait]; }));
    } finally {
      await w.done();
    }
  };
  assert.deepEqual(await draw("ab"), await draw("ba"));
});
