// End-to-end check of a Lightdive v3 deployment on a local chain, with real drand rounds (takes about six minutes).
//
//   node --experimental-strip-types scripts/lightdive-v3-localnet.mjs        # in one terminal
//   node --experimental-strip-types scripts/lightdive-v3-smoke.mjs           # in another
//
// Plays the whole loop as two players with ganache's unlocked development accounts: test RVYN from the faucet,
// summons, a team, a dive, the result predicted from the drand signature (lib/lightdive-v3/onchain.ts) and then
// settled on chain (prediction and settlement must agree), a claim, and a market sale. v3.1: the dive carries a star
// chart (paid into the pool), the crew bond grows, and a daily commission is checked against the website's copy of the
// rules (lib/lightdive-v3/commissions.ts). v3.3: cards are minted sealed and the website's drawCard must match what the
// chain unseals; reveals ride along with the player's next transaction; the commission is taken with the dive and
// completes on its own. Everything goes through the same reads the website uses.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, defineChain, http, maxUint256, parseEther } from "viem";
import { NO_SETTLE, SEALED, contractsOf, drandSignature, events, predictDive, predictSummon, readMarket, readPlayer, readWorld, roundTime } from "../lib/lightdive-v3/onchain.ts";
import { commissionsOf, meetsCommission, COMMISSION_KINDS } from "../lib/lightdive-v3/commissions.ts";
import { DESTINATIONS, baseTable, outcomesOf } from "../lib/lightdive-v3/rules.ts";

const D = JSON.parse(fs.readFileSync(process.env.DEPLOYMENT || "tmp/lightdive-v3-local.json", "utf8"));
const rpc = process.env.RPC_URL || "http://127.0.0.1:8546";
const abi = JSON.parse(fs.readFileSync("packages/web3/lightdive-v3-abi.json", "utf8"));
const chain = defineChain({ id: D.chainId, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc), cacheTime: 0 });
const wallet = createWalletClient({ chain, transport: http(rpc) });
const c = contractsOf(D);
const ctx = { client, c, abi, fromBlock: BigInt(D.deploymentBlock) };
const [, alice, bob] = await wallet.getAddresses();

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const send = async (who, address, name, functionName, args = []) => {
  const hash = await wallet.writeContract({ account: who, address, abi: abi[name], functionName, args, gas: 8_000_000n });
  const r = await client.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success", `${name}.${functionName}`);
  return r;
};
/** Chain time follows the wall clock on ganache; mine an empty block so block.timestamp catches up. */
const tick = () => client.request({ method: "evm_mine", params: [] });
const waitRound = async (round) => {
  for (;;) {
    const sig = Date.now() / 1000 >= roundTime(round) ? await drandSignature(round) : null;
    if (sig) return sig;
    await new Promise((r) => setTimeout(r, 2000));
  }
};
/** Summons; the cards exist at once, sealed. Once drand publishes the round, the website's prediction is checked
 *  against what the chain unseals (here by a stranger's reveal; in the game, by the player's next transaction). */
const summon = async (who, kind, qty) => {
  const r = await send(who, c.minter, "LightdiveMinter3", "summon", [kind, qty, [], []]);
  const [req] = (await events(ctx, c.minter, abi.LightdiveMinter3, "SummonRequested", { player: who }, r.blockNumber)).slice(-1);
  const first = req.args.firstId;
  const sealed = await client.readContract({ address: c.nft, abi: abi.LightdiveNFT3, functionName: "attributes", args: [first] });
  assert.equal(Number(sealed.rarity), SEALED, "minted sealed");
  const sig = await waitRound(req.args.round);
  const predicted = predictSummon({ id: req.args.requestId, kind, qty }, sig);
  await tick();
  await send(bob, c.minter, "LightdiveMinter3", "reveal", [req.args.requestId, sig]); // anyone may reveal
  for (let i = 0; i < qty; i++) {
    const a = await client.readContract({ address: c.nft, abi: abi.LightdiveNFT3, functionName: "attributes", args: [first + BigInt(i)] });
    assert.deepEqual({ rarity: Number(a.rarity), trait: Number(a.trait), power: Number(a.power), dna: BigInt(a.dna) }, predicted[i], "the website's drawCard equals the unsealed card");
  }
};

for (const p of [alice, bob]) {
  await send(p, c.rvyn, "TestRVYN", "drip");
  await send(p, c.rvyn, "TestRVYN", "approve", [c.minter, maxUint256]);
  await send(p, c.rvyn, "TestRVYN", "approve", [c.market, maxUint256]);
  await send(p, c.rvyn, "TestRVYN", "approve", [c.pool, maxUint256]); // supplies
  await send(p, c.nft, "LightdiveNFT3", "setApprovalForAll", [c.market, true]);
}
await assert.rejects(send(alice, c.rvyn, "TestRVYN", "drip"), "the faucet gives once a day");
log("faucet ok");

await summon(alice, 0, 1);
await summon(alice, 2, 3);
await summon(alice, 1, 1);
let world = await readWorld(ctx, true);
let me = await readPlayer(ctx, alice, world, true);
assert.equal(me.cards.length, 5, "five cards");
assert.equal(me.requests.length, 3);
assert.ok(me.requests.every((r) => r.revealed && r.cards.length === r.qty), "every summon revealed with its cards");
assert.equal(me.balance, parseEther("1000") - parseEther(String(50 + 60 + 30)));
log("summons ok", me.cards.map((x) => `${["spire", "prism", "seeker"][x.kind]}#${x.id} r${x.rarity} p${x.power}`).join(", "));

const spire = me.cards.find((x) => x.kind === 0);
const prism = me.cards.find((x) => x.kind === 1);
const seekers = me.cards.filter((x) => x.kind === 2).sort((a, b) => b.power - a.power).slice(0, spire.trait);
await send(alice, c.expedition, "Expedition3", "setTeam", [spire.id, prism.id, seekers.map((x) => x.id), NO_SETTLE]);
// the commission is taken with the dive (no transaction of its own)
const day = world.day;
const list = commissionsOf(day);
const balanceBefore = (await readPlayer(ctx, alice, world, true)).balance;
await send(alice, c.expedition, "Expedition3", "dive", [spire.id, 0, 2, false, 0, NO_SETTLE]); // a star chart, commission 0
me = await readPlayer(ctx, alice, world, true);
assert.ok(me.balance < balanceBefore, "the star chart was paid for");
assert.equal(me.commission.active?.index, 0, "the commission is active");
assert.equal(me.teams.length, 1);
const dive = me.dives[0];
assert.ok(dive && !dive.revealed);
log(`dive #${dive.id} to destination 0, round ${dive.round} at ${new Date(roundTime(dive.round) * 1000).toISOString().slice(11, 19)}`);

// a second player lists a card meanwhile; alice buys it
await summon(bob, 2, 1);
const bobCard = (await readPlayer(ctx, bob, world, true)).cards[0];
await send(bob, c.market, "LightdiveMarket3", "list", [bobCard.id, parseEther("12"), [], []]);
const market = await readMarket(ctx);
assert.equal(market.length, 1);
await send(alice, c.market, "LightdiveMarket3", "buy", [bobCard.id, parseEther("12")]);
assert.equal((await readMarket(ctx)).length, 0);
const bobNow = await readPlayer(ctx, bob, world, true);
assert.equal(bobNow.sales.length, 1);
assert.ok(bobNow.cards.find((x) => x.id === bobCard.id)?.soldAt, "the sold card stays in bob's history");
log("market ok");

const sig = await waitRound(dive.round);
await tick();
me = await readPlayer(ctx, alice, world, true);
const d = me.dives.find((x) => x.id === dive.id);
assert.equal(d.supply, 2);
const predicted = await predictDive(ctx, d, sig, world.chartStability);
// the website's settle: any transaction of the player carries it; here on its own
await send(alice, c.expedition, "Expedition3", "settle", [{ dives: [d.id], diveProofs: [sig], summons: [], summonProofs: [] }]);
world = await readWorld(ctx, true);
me = await readPlayer(ctx, alice, world, true);
const settled = me.dives.find((x) => x.id === dive.id).result;
assert.deepEqual(
  { tier: settled.tier, multX100: settled.multX100, wear: settled.wear, reward: settled.reward, levy: settled.levy },
  { tier: predicted.tier, multX100: predicted.multX100, wear: predicted.wear, reward: predicted.reward, levy: predicted.levy },
  "the website's prediction equals the settlement",
);
const done0 = me.dives.find((x) => x.id === dive.id);
log(`reveal ok: x${settled.multX100 / 100}, wear ${settled.wear}, reward ${Number(settled.reward) / 1e18}`);
assert.equal(me.teams[0].bond, 1, "the crew bond grew");
// v3.2 echo bridges: the first dive of the day there follows nobody, and leaves alice's bridge behind
assert.equal(world.echoStability, 1);
assert.equal(world.bridges[d.dest], alice.toLowerCase(), "alice's bridge is the latest there");
assert.equal(me.dives.find((x) => x.id === dive.id).echo, 0);
assert.equal(me.echoesGiven, 0);
assert.ok(typeof me.nextDripAt === "number" && me.nextDripAt > 0, "the faucet time still reads after echoesGiven");
log("echo bridges ok");

// every commission of the day: the website's test equals the contract's
const done = done0;
const names = outcomesOf(baseTable(DESTINATIONS[done.dest].cluster, predicted.plan.risk));
const view = {
  dest: done.dest, at: done.day * 86_400_000, bond: done.bond, deep: done.long, supply: done.supply,
  attuned: done.attuned, result: { outcome: names[settled.tier] ?? "normal", multX100: settled.multX100, tier: settled.tier },
};
for (const cm of list) {
  const chainSays = await client.readContract({ address: c.commissions, abi: abi.LightdiveCommissions3, functionName: "meets", args: [done.id, { kind: COMMISSION_KINDS.indexOf(cm.kind), param: cm.param }] });
  assert.equal(meetsCommission(cm, view), chainSays, `commission ${cm.kind}/${cm.param}`);
}
// the settlement completed it on its own when the dive met it, and paid the bonus with the result
if (meetsCommission(list[0], view)) {
  assert.equal(me.commission.active, null, "the commission completed with the settlement");
  assert.ok(me.commission.marks & 1, "marked done");
  assert.ok(me.credit > settled.reward, "the bonus was credited with the result");
  log(`commission ${list[0].kind} completed on its own`);
} else {
  assert.equal(me.credit, settled.reward);
  assert.equal(me.commission.active?.index, 0, "still active: the dive did not meet it");
  log(`commission ${list[0].kind} not met by this dive; still active`);
}
me = await readPlayer(ctx, alice, world, true);
log(`commissions ok: ${list.map((x) => x.kind).join(", ")}`);

const before = me.balance;
await send(alice, c.expedition, "Expedition3", "claim", [NO_SETTLE]);
me = await readPlayer(ctx, alice, world, true);
assert.ok(me.balance > before && me.credit === 0n && me.claimed > 0n);
log(`claim ok: +${Number(me.balance - before) / 1e18} (fee ${Number(me.claimFees) / 1e18})`);
log("smoke test passed");
