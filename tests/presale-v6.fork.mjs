// Mainnet-fork check of RovynPresaleV6 against the REAL RVYN token, router, factory and WETH on Robinhood Chain.
// Needs network access, so it is not part of CI:  node --experimental-strip-types tests/presale-v6.fork.mjs
// Everything happens in a local, throw-away fork. No transaction is sent to the real chain.
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, parseEther, getAddress } from "viem";
import { buildAllowlistTree } from "../lib/allowlist-merkle.ts";

const RPC = process.env.FORK_RPC || "https://rpc.mainnet.chain.robinhood.com";
const RVYN = "0x545a1ff27596de2f31480df39aa9548f363fc361";
const ADMIN = "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e"; // holds all 10,000,000 RVYN on mainnet
const ROUTER = "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba";
const FACTORY = "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f";
const WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73";
const E = parseEther;

const A = JSON.parse(fs.readFileSync("packages/contracts/v6/artifacts/contracts.json", "utf8"));
Object.assign(A, JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")));
const pairAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getReserves", stateMutability: "view", inputs: [], outputs: [{ type: "uint112" }, { type: "uint112" }, { type: "uint32" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
const factoryAbi = [
  { type: "function", name: "getPair", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
  { type: "function", name: "createPair", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "address" }] },
];
const wethAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];
const syncAbi = [{ type: "function", name: "sync", stateMutability: "nonpayable", inputs: [], outputs: [] }];

const provider = ganache.provider({
  logging: { quiet: true },
  fork: { url: RPC },
  wallet: { totalAccounts: 12, defaultBalance: 1000, unlockedAccounts: [ADMIN] },
  chain: { chainId: 4663 },
});
const chain = defineChain({ id: 4663, name: "Fork", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
const wallet = createWalletClient({ chain, transport: custom(provider) });

try {
  const accounts = await wallet.getAddresses();
  const [team, lpWallet] = [accounts[10], accounts[11]];
  const buyers = accounts.slice(1, 6);
  const tree = buildAllowlistTree(buyers);
  await provider.request({ method: "evm_setAccountBalance", params: [ADMIN, "0x56BC75E2D63100000"] }).catch(() => {});

  const send = async (to, abi, fn, args = [], account = ADMIN, value = 0n) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account, address: to, abi, functionName: fn, args, value, gas: 12_000_000n }) });
    assert.equal(receipt.status, "success", fn);
    return receipt;
  };
  const supply = await client.readContract({ address: RVYN, abi: A.LaunchToken.abi, functionName: "totalSupply" });
  const adminBalance = await client.readContract({ address: RVYN, abi: A.LaunchToken.abi, functionName: "balanceOf", args: [ADMIN] });
  console.log("fork block", await client.getBlockNumber(), "supply", supply, "admin balance", adminBalance);
  assert.equal(supply, E("10000000"));
  assert.equal(adminBalance, E("10000000"), "the fork must see the admin wallet holding the whole supply");
  const existingPair = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPair", args: [RVYN, WETH] });
  console.log("RVYN/WETH pair before settlement:", existingPair);

  if (process.env.ATTACK === "1") {
    // A griefer pre-creates the pair, donates WETH to it and syncs it before settlement.
    const attacker = accounts[9];
    await send(FACTORY, factoryAbi, "createPair", [RVYN, WETH], attacker);
    const pre = await client.readContract({ address: FACTORY, abi: factoryAbi, functionName: "getPair", args: [RVYN, WETH] });
    await send(WETH, wethAbi, "deposit", [], attacker, E("5"));
    await send(WETH, wethAbi, "transfer", [pre, E("5")], attacker);
    await send(pre, syncAbi, "sync", [], attacker);
    console.log("ATTACK: pair pre-created and seeded with 5 WETH at", pre);
  }
  const deployHash = await wallet.deployContract({
    account: ADMIN, abi: A.RovynPresaleV6.abi, bytecode: A.RovynPresaleV6.bytecode, gas: 14_000_000n,
    args: [RVYN, ADMIN, ROUTER, team, lpWallet, 365n * 86400n, 10_000n],
  });
  const deployed = await client.waitForTransactionReceipt({ hash: deployHash });
  assert.equal(deployed.status, "success");
  const sale = deployed.contractAddress;
  const sv6 = (fn, args = [], account = ADMIN, value = 0n) => send(sale, A.RovynPresaleV6.abi, fn, args, account, value);
  const read = (fn, args = []) => client.readContract({ address: sale, abi: A.RovynPresaleV6.abi, functionName: fn, args });
  console.log("constructor accepted the real router: factory", await read("factory"), "weth", await read("weth"));
  assert.equal(getAddress(await read("factory")), getAddress(FACTORY));
  assert.equal(getAddress(await read("weth")), getAddress(WETH));

  await send(RVYN, A.LaunchToken.abi, "approve", [sale, E("10000000")]);
  await sv6("setAllowlistRoot", [tree.root]);
  await sv6("depositInventory");
  await sv6("open");
  for (let i = 0; i < 3; i++) await sv6("buy", [2500n, tree.proofFor(buyers[i])], buyers[i], E("0.25"));
  await sv6("close");
  const raised = await read("raised");
  const poolEth = await read("minPoolEth");
  console.log("raised", raised, "min pool", poolEth);
  const settle = await sv6("settle", [poolEth]);
  console.log("settle gas used", settle.gasUsed);

  const pair = await read("pair");
  const reserves = await client.readContract({ address: pair, abi: pairAbi, functionName: "getReserves" });
  const token0 = await client.readContract({ address: pair, abi: pairAbi, functionName: "token0" });
  const [rT, rE] = getAddress(token0) === getAddress(RVYN) ? [reserves[0], reserves[1]] : [reserves[1], reserves[0]];
  console.log("pool reserves RVYN", rT, "WETH", rE);
  if (process.env.ATTACK === "1") {
    assert.equal(rE, poolEth + E("5"), "the donation stays in the pool");
    assert.equal(rT, poolEth * 10_000n, "RVYN side is exactly what the contract seeded");
  } else {
    assert.equal(rE, poolEth);
    assert.equal(rT, poolEth * 10_000n); // 0.0001 ETH per RVYN
  }
  const lock = await read("initialLpLock");
  const lpSupply = await client.readContract({ address: pair, abi: pairAbi, functionName: "totalSupply" });
  const locked = await client.readContract({ address: pair, abi: pairAbi, functionName: "balanceOf", args: [lock] });
  console.log("LP supply", lpSupply, "locked", locked, "share locked", Number((locked * 10000n) / lpSupply) / 100, "%");
  assert.ok(locked > 0n && locked * 1000n >= lpSupply * 999n, "essentially all LP is locked (only the DEX's minimum liquidity is outside)");
  await sv6("claim", [], buyers[0]);
  const got = await client.readContract({ address: RVYN, abi: A.LaunchToken.abi, functionName: "balanceOf", args: [buyers[0]] });
  assert.equal(got, E("2500"));
  console.log("FORK TEST PASSED: real router/factory/WETH accept the V6 flow; claim delivers 2,500 RVYN for 0.25 ETH");
} finally {
  await provider.disconnect();
}
