// End-to-end check of the 自動揭曉 keeper (lib/lightdive-v3/keeper.ts) on a local chain with real drand rounds.
//
//   node scripts/compile-contracts-lightdive-v3.mjs
//   node scripts/lightdive-v3-localnet.mjs                         # in one terminal
//   npx tsx scripts/lightdive-v3-keeper-test.mjs                  # in another (about two minutes)
//
// A player summons and dives but never reveals; the keeper (one of ganache's unlocked development accounts) must
// reveal both once their drand rounds are out, with the same result the website predicts. A second dive that its
// owner reveals first must be skipped without failing the keeper. Nothing here touches a real network.
import fs from "node:fs";
import assert from "node:assert/strict";
import { createPublicClient, createWalletClient, defineChain, http, maxUint256 } from "viem";
import { contractsOf, drandSignature, events, predictDive, readPlayer, readWorld, roundTime } from "../lib/lightdive-v3/onchain.ts";
import { runKeeper } from "../lib/lightdive-v3/keeper.ts";

const D = JSON.parse(fs.readFileSync(process.env.DEPLOYMENT || "tmp/lightdive-v3-local.json", "utf8"));
const rpc = process.env.RPC_URL || "http://127.0.0.1:8546";
const abi = JSON.parse(fs.readFileSync("packages/web3/lightdive-v3-abi.json", "utf8"));
const chain = defineChain({ id: D.chainId, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc), cacheTime: 0 });
const wallet = createWalletClient({ chain, transport: http(rpc) });
const c = contractsOf(D);
const ctx = { client, c, abi, fromBlock: BigInt(D.deploymentBlock) };
const [deployer, ...others] = await wallet.getAddresses();
const keeper = others[4];
// a player who has not used the faucet today (the test can run again on the same local chain)
let alice = null;
for (const who of others.slice(0, 4)) {
  if (await client.simulateContract({ account: who, address: c.rvyn, abi: abi.TestRVYN, functionName: "drip" }).then(() => true, () => false)) { alice = who; break; }
}
assert.ok(alice, "a player with the faucet still open (restart the local chain)");
const game = { deployment: D, contracts: c, chain, rpcUrl: rpc, testnet: true, testToken: true, multicall: undefined, explorer: "", abi };

// a settings table in memory, shaped like D1
const settings = new Map();
const DB = {
  prepare: (sql) => ({
    bind: (...v) => ({
      first: async () => (sql.startsWith("SELECT") && settings.has(v[0]) ? { value: settings.get(v[0]) } : null),
      run: async () => { settings.set(v[0], v[1]); },
    }),
  }),
};

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const send = async (who, address, name, functionName, args = []) => {
  const hash = await wallet.writeContract({ account: who, address, abi: abi[name], functionName, args, gas: 8_000_000n });
  const r = await client.waitForTransactionReceipt({ hash });
  assert.equal(r.status, "success", `${name}.${functionName}`);
  return r;
};
const tick = () => client.request({ method: "evm_mine", params: [] });
const waitRound = async (round) => {
  for (;;) {
    const sig = Date.now() / 1000 >= roundTime(round) + 6 ? await drandSignature(round) : null; // the keeper waits 3 s past a round
    if (sig) return sig;
    await new Promise((r) => setTimeout(r, 2000));
  }
};
const keep = async () => { await tick(); const s = await runKeeper({ DB }, { game, from: keeper }); assert.ok(s && !s.error, `keeper: ${s?.error}`); return s; };

// short voyages on this local chain only: 60 s, decisions close 20 s before
await send(deployer, c.config, "LightdiveConfig3", "setTiming", [60, 20, 3600]);
await send(alice, c.rvyn, "TestRVYN", "drip");
await send(alice, c.rvyn, "TestRVYN", "approve", [c.minter, maxUint256]);

// 1. summons the player never reveals
const reqs = [];
for (const [kind, qty] of [[0, 1], [2, 3], [1, 1]]) {
  const r = await send(alice, c.minter, "LightdiveMinter3", "summon", [kind, qty]);
  const [e] = (await events(ctx, c.minter, abi.LightdiveMinter3, "SummonRequested", { player: alice }, r.blockNumber)).slice(-1);
  reqs.push(e.args);
}
const before = await keep();
assert.equal(before.revealed.summons, 0, "nothing is revealed before its round");
for (const q of reqs) await waitRound(q.round);
const s1 = await keep();
assert.equal(s1.revealed.summons, 3, `the keeper revealed the three summons: ${JSON.stringify(s1)} ${JSON.stringify([...settings])}`);
let world = await readWorld(ctx, true);
let me = await readPlayer(ctx, alice, world, true);
assert.equal(me.cards.length, 5);
log("summons revealed by the keeper", me.cards.map((x) => `${["spire", "prism", "seeker"][x.kind]} r${x.rarity}`).join(", "));

// 2. two dives: the keeper reveals the first; the owner reveals the second herself just before
const spire = me.cards.find((x) => x.kind === 0);
const prism = me.cards.find((x) => x.kind === 1);
const seekers = me.cards.filter((x) => x.kind === 2).sort((a, b) => b.power - a.power).slice(0, spire.trait);
await send(alice, c.expedition, "Expedition3", "setTeam", [spire.id, prism.id, seekers.map((x) => x.id)]);
await send(alice, c.expedition, "Expedition3", "dive", [spire.id, 0, 0, false]);
me = await readPlayer(ctx, alice, world, true);
const dive = me.dives[0];
log(`dive #${dive.id}, round ${dive.round}`);
const sig = await waitRound(dive.round);
await tick();
const predicted = await predictDive(ctx, (await readPlayer(ctx, alice, world, true)).dives.find((x) => x.id === dive.id), sig, world.chartStability);
const s2 = await keep();
assert.equal(s2.revealed.dives, 1, "the keeper revealed the dive");
world = await readWorld(ctx, true);
me = await readPlayer(ctx, alice, world, true);
const settled = me.dives.find((x) => x.id === dive.id).result;
assert.equal(settled.multX100, predicted.multX100, "the keeper's reveal equals the prediction");
assert.equal(me.credit, settled.reward, "the reward went to the owner, not the keeper");
log(`dive revealed by the keeper: x${settled.multX100 / 100}`);

// the next day's passes are not needed: the team dives again today (3 per team per day)
await send(alice, c.expedition, "Expedition3", "dive", [spire.id, 1, 0, false]);
me = await readPlayer(ctx, alice, world, true);
const second = me.dives.find((x) => !x.revealed);
const sig2 = await waitRound(second.round);
await tick();
await send(alice, c.expedition, "Expedition3", "revealMany", [[second.id], [sig2]]);
const s3 = await keep();
assert.equal(s3.revealed.dives, 0, "a dive revealed by its owner is skipped");
assert.ok(!s3.error);
assert.equal(s3.total.dives, 1);
log("owner-revealed dive skipped; keeper ok");
console.log("KEEPER TEST PASSED");
