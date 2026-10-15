// End-to-end check of a Lightdive v3 deployment on a local chain, with real drand rounds (takes about six minutes).
//
//   node --experimental-strip-types scripts/lightdive-v3-localnet.mjs        # in one terminal
//   node --experimental-strip-types scripts/lightdive-v3-smoke.mjs           # in another
//
// Plays the whole loop as two players with ganache's unlocked development accounts: test RVYN from the faucet,
// summons revealed with drand, a team, a dive, a voyage decision, the result predicted from the drand signature
// (lib/lightdive-v3/onchain.ts) and then revealed on chain (prediction and settlement must agree), a claim, and a
// market sale. Everything goes through the same reads the website uses.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, defineChain, http, maxUint256, parseEther } from "viem";
import { contractsOf, drandSignature, events, predictDive, readMarket, readPlayer, readWorld, roundTime } from "../lib/lightdive-v3/onchain.ts";

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
const summon = async (who, kind, qty) => {
  const r = await send(who, c.minter, "LightdiveMinter3", "summon", [kind, qty]);
  const [req] = (await events(ctx, c.minter, abi.LightdiveMinter3, "SummonRequested", { player: who }, r.blockNumber)).slice(-1);
  const sig = await waitRound(req.args.round);
  await tick();
  await send(bob, c.minter, "LightdiveMinter3", "reveal", [req.args.requestId, sig]); // anyone may reveal
};

for (const p of [alice, bob]) {
  await send(p, c.rvyn, "TestRVYN", "drip");
  await send(p, c.rvyn, "TestRVYN", "approve", [c.minter, maxUint256]);
  await send(p, c.rvyn, "TestRVYN", "approve", [c.market, maxUint256]);
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
await send(alice, c.expedition, "Expedition3", "setTeam", [spire.id, prism.id, seekers.map((x) => x.id)]);
await send(alice, c.expedition, "Expedition3", "dive", [spire.id, 0]);
me = await readPlayer(ctx, alice, world, true);
assert.equal(me.teams.length, 1);
const dive = me.dives[0];
assert.ok(dive && !dive.revealed);
await send(alice, c.expedition, "Expedition3", "decide", [dive.id, 1]); // steady
log(`dive #${dive.id} to destination 0, round ${dive.round} at ${new Date(roundTime(dive.round) * 1000).toISOString().slice(11, 19)}`);

// a second player lists a card meanwhile; alice buys it
await summon(bob, 2, 1);
const bobCard = (await readPlayer(ctx, bob, world, true)).cards[0];
await send(bob, c.market, "LightdiveMarket3", "list", [bobCard.id, parseEther("12")]);
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
assert.equal(d.decision, 1);
const predicted = await predictDive(ctx, d, sig);
await send(alice, c.expedition, "Expedition3", "revealMany", [[d.id], [sig]]);
world = await readWorld(ctx, true);
me = await readPlayer(ctx, alice, world, true);
const settled = me.dives.find((x) => x.id === dive.id).result;
assert.deepEqual(
  { tier: settled.tier, multX100: settled.multX100, wear: settled.wear, reward: settled.reward, levy: settled.levy },
  { tier: predicted.tier, multX100: predicted.multX100, wear: predicted.wear, reward: predicted.reward, levy: predicted.levy },
  "the website's prediction equals the settlement",
);
assert.ok(predicted.tier !== 0, "steady never comes back empty");
assert.equal(me.credit, settled.reward);
log(`reveal ok: x${settled.multX100 / 100}, wear ${settled.wear}, reward ${Number(settled.reward) / 1e18}`);

const before = me.balance;
await send(alice, c.expedition, "Expedition3", "claim");
me = await readPlayer(ctx, alice, world, true);
assert.ok(me.balance > before && me.credit === 0n && me.claimed > 0n);
log(`claim ok: +${Number(me.balance - before) / 1e18} (fee ${Number(me.claimFees) / 1e18})`);
log("smoke test passed");
