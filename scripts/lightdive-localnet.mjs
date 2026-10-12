// Local development chain for the Lightdive game UI. Nothing here touches a real network.
//
//   npm run contracts:compile:lightdive
//   node scripts/lightdive-localnet.mjs            # ganache on http://127.0.0.1:8546, chain id 46630
//
// It deploys the whole system with ganache's unlocked development accounts, funds the pool, opens the
// spire sale, gives the player accounts test RVYN, and runs a randomness operator that commits 48 hours
// ahead and reveals finished hours every few seconds. It prints the deployment JSON to paste into
// localStorage "lightdive:local-deployment" on http://localhost (see lib/lightdive.ts).
//
// Time travel for testing: POST {"method":"evm_increaseTime","params":[seconds]} then evm_mine to the RPC.
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256, parseEther } from "viem";

const PORT = Number(process.env.LOCALNET_PORT || 8546);
const CHAIN_ID = 46630; // same id as the testnet so the UI's chain handling is exercised as in production
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive/artifacts/contracts.json", "utf8"));
A.LaunchToken = JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")).LaunchToken;

const server = ganache.server({
  logging: { quiet: true },
  wallet: { totalAccounts: 8, defaultBalance: 1000, deterministic: true },
  chain: { chainId: CHAIN_ID, hardfork: "shanghai" },
  miner: { blockGasLimit: 30_000_000 },
});
await new Promise((resolve, reject) => server.listen(PORT, "127.0.0.1", (e) => (e ? reject(e) : resolve())));

const rpc = `http://127.0.0.1:${PORT}`;
const chain = defineChain({ id: CHAIN_ID, name: "Lightdive localnet", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const client = createPublicClient({ chain, transport: http(rpc), cacheTime: 0 });
const wallet = createWalletClient({ chain, transport: http(rpc) });
const [admin, operator, treasury, ...players] = await wallet.getAddresses();

const deploy = async (name, args) => {
  const hash = await wallet.deployContract({ account: admin, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 14_000_000n });
  return (await client.waitForTransactionReceipt({ hash })).contractAddress;
};
const send = async (address, name, functionName, args = [], account = admin) => {
  const hash = await wallet.writeContract({ account, address, abi: A[name].abi, functionName, args, gas: 14_000_000n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name}.${functionName} reverted`);
};

const startBlock = await client.getBlockNumber();
const rvyn = await deploy("LaunchToken", ["RovynCore Test", "tRVYN", parseEther("10000000"), admin]);
const config = await deploy("LightdiveConfig", [admin]);
const nft = await deploy("LightdiveNFT", [admin, treasury]);
const beacon = await deploy("RandomnessBeacon", [admin, operator]);
const pool = await deploy("CoreLightPool", [admin, rvyn, config]);
const minter = await deploy("LightdiveMinter", [admin, rvyn, nft, config, beacon, pool, treasury]);
const expedition = await deploy("Expedition", [admin, nft, config, beacon, pool]);
await send(nft, "LightdiveNFT", "setMinter", [minter]);
await send(nft, "LightdiveNFT", "setGame", [expedition]);
await send(pool, "CoreLightPool", "setExpedition", [expedition]);
await send(rvyn, "LaunchToken", "approve", [pool, parseEther("1000000")]);
await send(pool, "CoreLightPool", "fund", [parseEther("1000000")]);
await send(minter, "LightdiveMinter", "openSpireSale", [0n]);
for (const p of players) await send(rvyn, "LaunchToken", "transfer", [p, parseEther("20000")]);

// Operator: deterministic local seeds (never use this outside a local chain).
const seedFor = (hour) => keccak256(encodeAbiParameters([{ type: "string" }, { type: "uint64" }], ["localnet", BigInt(hour)]));
const commitmentOf = (seed) => keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));
const read = (functionName, args = []) => client.readContract({ address: beacon, abi: A.RandomnessBeacon.abi, functionName, args });
async function tick() {
  const now = Number(await read("currentHour"));
  for (let hour = now - 72; hour < now; hour++) {
    if (!(await read("hasCommitment", [BigInt(hour)])) || (await read("revealed", [BigInt(hour)]))) continue;
    await send(beacon, "RandomnessBeacon", "reveal", [BigInt(hour), seedFor(hour)], operator);
  }
  let start = now + 1; // the beacon only accepts future hours
  while (start <= now + 48 && (await read("hasCommitment", [BigInt(start)]))) start++;
  if (start <= now + 48) {
    const hashes = [];
    for (let h = start; h <= now + 48 && !(await read("hasCommitment", [BigInt(h)])); h++) hashes.push(commitmentOf(seedFor(h)));
    if (hashes.length) await send(beacon, "RandomnessBeacon", "commit", [BigInt(start), hashes], operator);
  }
}
await tick();
// Step into the first committed hour so mints and dives work right away.
const ts = Number((await client.getBlock()).timestamp);
await client.request({ method: "evm_increaseTime", params: [3600 - (ts % 3600) + 5] });
await client.request({ method: "evm_mine", params: [] });

// SEED=1: give the first player a ready-made fleet (3 spires, 3 prisms, 10 seekers, assembled) for UI work.
if (process.env.SEED === "1") {
  const p = players[0];
  const read2 = (address, name, fn, args = []) => client.readContract({ address, abi: A[name].abi, functionName: fn, args });
  await send(rvyn, "LaunchToken", "approve", [minter, parseEther("20000")], p);
  await send(minter, "LightdiveMinter", "requestMint", [0, 3], p);
  await send(minter, "LightdiveMinter", "requestMint", [1, 3], p);
  await send(minter, "LightdiveMinter", "requestMint", [2, 10], p);
  await client.request({ method: "evm_increaseTime", params: [3600] });
  await client.request({ method: "evm_mine", params: [] });
  await tick();
  for (let id = 0n; id < 3n; id++) await send(minter, "LightdiveMinter", "fulfill", [id], p);
  const owned = [];
  for (let id = 1n; id < (await read2(nft, "LightdiveNFT", "nextId")); id++) owned.push({ id, a: await read2(nft, "LightdiveNFT", "attributes", [id]) });
  const spires = owned.filter((x) => Number(x.a.kind) === 0).sort((x, y) => Number(y.a.trait) - Number(x.a.trait));
  const prisms = owned.filter((x) => Number(x.a.kind) === 1);
  const seekers = owned.filter((x) => Number(x.a.kind) === 2).sort((x, y) => Number(y.a.luminance) - Number(x.a.luminance));
  await send(nft, "LightdiveNFT", "setApprovalForAll", [expedition, true], p);
  let next = 0;
  for (let i = 0; i < spires.length && next < seekers.length; i++) {
    const seats = Math.min(Number(spires[i].a.trait), seekers.length - next, 2);
    const crew = seekers.slice(next, next + seats).map((x) => x.id);
    next += seats;
    await send(expedition, "Expedition", "equip", [spires[i].id, prisms[i]?.id ?? 0n, crew], p);
  }
  console.log(`seeded player ${p}: ${spires.length} spires assembled`);
}
setInterval(() => tick().catch((e) => console.error("operator:", e.shortMessage || e.message)), 4000);

const deployment = { chainId: CHAIN_ID, rpcUrl: rpc, deploymentBlock: Number(startBlock), rvyn, config, nft, beacon, pool, minter, expedition };
console.log(`Lightdive localnet on ${rpc}`);
console.log(`players (unlocked, 20,000 tRVYN each): ${players.join(", ")}`);
console.log(`DEPLOYMENT ${JSON.stringify(deployment)}`);
