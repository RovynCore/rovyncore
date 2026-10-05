// Pre-deployment check for RovynPresaleV6 with the FINAL constructor arguments, run against a local fork of
// Robinhood Chain. Reads live state, deploys on the fork, reads every immutable back and walks the happy path.
// Nothing is sent to the real chain.   Usage: node --experimental-strip-types scripts/v6-preflight.mjs
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, encodeDeployData, getAddress, http, parseAbi, parseEther } from "viem";
import { RVYN_MODEL } from "../lib/rvyn-model.ts";
import { buildAllowlistTree } from "../lib/allowlist-merkle.ts";

const RPC = process.env.FORK_RPC || "https://rpc.mainnet.chain.robinhood.com";
const ADMIN = "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e";
const SAFE = RVYN_MODEL.multisigMainnet;
const A = JSON.parse(fs.readFileSync("packages/contracts/v6/artifacts/contracts.json", "utf8"));
const LT = JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")).LaunchToken;
const args = [RVYN_MODEL.contractMainnet, SAFE, RVYN_MODEL.routerMainnet, SAFE, SAFE, BigInt(RVYN_MODEL.v6Deployment.lpLockSeconds), BigInt(RVYN_MODEL.v6Deployment.withdrawStepBps)];
const ok = (msg) => console.log(`  ok  ${msg}`);

// 1. Live chain (read only) -------------------------------------------------------------------------------------------------
console.log("Live chain checks");
const live = createPublicClient({ transport: http(RPC) });
assert.equal(await live.getChainId(), 4663, "chain id");
const token = RVYN_MODEL.contractMainnet;
const tokenAbi = parseAbi(["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)"]);
assert.equal(await live.readContract({ address: token, abi: tokenAbi, functionName: "totalSupply" }), parseEther("10000000")); ok("RVYN total supply is 10,000,000");
assert.equal(await live.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [ADMIN] }), parseEther("10000000")); ok("the admin wallet holds all RVYN (nobody else can touch the pool first)");
for (const [name, address] of [["router", RVYN_MODEL.routerMainnet], ["factory", RVYN_MODEL.factoryMainnet], ["WETH", RVYN_MODEL.wethMainnet], ["Safe", SAFE]]) {
  assert.ok((await live.getBytecode({ address }))?.length > 2, `${name} has code`); ok(`${name} has code at ${address}`);
}
const factoryAbi = parseAbi(["function getPair(address,address) view returns (address)"]);
const pair = await live.readContract({ address: RVYN_MODEL.factoryMainnet, abi: factoryAbi, functionName: "getPair", args: [token, RVYN_MODEL.wethMainnet] });
console.log(`  info RVYN/WETH pair today: ${pair} (V6 tolerates a pre-created pair; it only refuses one that already has LP supply)`);
const safeAbi = parseAbi(["function getThreshold() view returns (uint256)", "function getOwners() view returns (address[])"]);
const threshold = await live.readContract({ address: SAFE, abi: safeAbi, functionName: "getThreshold" });
const owners = await live.readContract({ address: SAFE, abi: safeAbi, functionName: "getOwners" });
assert.equal(threshold, 2n); assert.equal(owners.length, 3); ok(`Safe is ${threshold}-of-${owners.length}: ${owners.join(", ")}`);

// 2. Fork deployment with the final arguments ---------------------------------------------------------------------------------
console.log("Fork deployment");
const provider = ganache.provider({ logging: { quiet: true }, fork: { url: RPC }, wallet: { totalAccounts: 6, defaultBalance: 1000, unlockedAccounts: [ADMIN, SAFE] }, chain: { chainId: 4663 } });
const chain = defineChain({ id: 4663, name: "Fork", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
const wallet = createWalletClient({ chain, transport: custom(provider) });
try {
  await provider.request({ method: "evm_setAccountBalance", params: [ADMIN, "0x56BC75E2D63100000"] });
  await provider.request({ method: "evm_setAccountBalance", params: [SAFE, "0x56BC75E2D63100000"] });
  const initCode = encodeDeployData({ abi: A.RovynPresaleV6.abi, bytecode: A.RovynPresaleV6.bytecode, args });
  const receipt = await client.waitForTransactionReceipt({ hash: await wallet.sendTransaction({ account: ADMIN, data: initCode, gas: 14_000_000n }) });
  assert.equal(receipt.status, "success"); const sale = receipt.contractAddress;
  ok(`deployed on the fork at ${sale}, gas ${receipt.gasUsed}`);
  const read = (functionName, a = []) => client.readContract({ address: sale, abi: A.RovynPresaleV6.abi, functionName, args: a });
  assert.equal(getAddress(await read("sponsor")), getAddress(SAFE)); ok("sponsor = Safe");
  assert.equal(getAddress(await read("teamBeneficiary")), getAddress(SAFE)); ok("team beneficiary = Safe");
  assert.equal(getAddress(await read("lpBeneficiary")), getAddress(SAFE)); ok("LP beneficiary = Safe");
  assert.equal(await read("lpLockDuration"), 730n * 86400n); ok("LP lock = 730 days (24 months)");
  assert.equal(await read("withdrawStepBps"), 2500n); ok("operating funds unlock 25% per 30 days");
  assert.equal(getAddress(await read("token")), getAddress(token)); ok("token = RVYN");
  assert.equal(getAddress(await read("router")), getAddress(RVYN_MODEL.routerMainnet));
  assert.equal(getAddress(await read("factory")), getAddress(RVYN_MODEL.factoryMainnet));
  assert.equal(getAddress(await read("weth")), getAddress(RVYN_MODEL.wethMainnet)); ok("router, factory, WETH = the real ones");
  assert.equal(await read("PRICE"), parseEther("0.0001")); assert.equal(await read("HARD_CAP"), parseEther("100")); assert.equal(await read("WALLET_CAP"), parseEther("0.25")); assert.equal(await read("MIN_POOL_BPS"), 5000n); assert.equal(await read("SETTLE_GRACE"), 7n * 86400n);
  ok("price 0.0001 ETH, cap 100 ETH, wallet cap 0.25 ETH, floor 50%, grace 7 days");

  // 3. The Safe is the sponsor: walk the whole flow signing as the Safe (unlocked on the fork) -------------------------------
  const buyers = (await wallet.getAddresses()).slice(0, 3); const tree = buildAllowlistTree(buyers);
  const send = async (to, abi, functionName, a = [], account = SAFE, value = 0n) => { const r = await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account, address: to, abi, functionName, args: a, value, gas: 12_000_000n }) }); assert.equal(r.status, "success", functionName); return r; };
  await send(token, LT.abi, "transfer", [SAFE, parseEther("10000000")], ADMIN); // the real plan moves RVYN to the sponsor first
  await send(token, LT.abi, "approve", [sale, parseEther("10000000")]);
  await send(sale, A.RovynPresaleV6.abi, "setAllowlistRoot", [tree.root]);
  await send(sale, A.RovynPresaleV6.abi, "depositInventory");
  await send(sale, A.RovynPresaleV6.abi, "open");
  for (const b of buyers) await send(sale, A.RovynPresaleV6.abi, "buy", [2500n, tree.proofFor(b)], b, parseEther("0.25"));
  await send(sale, A.RovynPresaleV6.abi, "close");
  const min = await read("minPoolEth");
  await send(sale, A.RovynPresaleV6.abi, "settle", [min]);
  await send(sale, A.RovynPresaleV6.abi, "claim", [], buyers[0]);
  assert.equal(await client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [buyers[0]] }), parseEther("2500"));
  ok("Safe-sponsored flow on the fork: deposit, open, buy, close, settle, claim all succeed");
  const bytes = (await client.getBytecode({ address: sale })) || "0x";
  console.log("\nSummary");
  console.log(`  constructor args: ${JSON.stringify(args.map(String))}`);
  console.log(`  init code bytes : ${(initCode.length - 2) / 2}`);
  console.log(`  runtime sha256  : ${crypto.createHash("sha256").update(Buffer.from(bytes.slice(2), "hex")).digest("hex")}`);
  console.log("\nPREFLIGHT PASSED. Deployment still needs the founder's explicit go-ahead.");
} finally {
  await provider.disconnect();
}
