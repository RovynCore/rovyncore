import assert from "node:assert/strict";
import fs from "node:fs";
import solc from "solc";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain, parseEther } from "viem";
import { buildAllowlistTree } from "../../lib/allowlist-merkle.ts";

export const A = JSON.parse(fs.readFileSync("packages/contracts/v6/artifacts/contracts.json", "utf8"));
Object.assign(A, JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")));
const mocks = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "Mock.sol": { content: fs.readFileSync("tests/fixtures/PresaleDexV6.sol", "utf8") } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
}), { import: (path) => ({ contents: fs.readFileSync(`node_modules/${path}`, "utf8") }) }));
assert.ok(!mocks.errors?.some((error) => error.severity === "error"), JSON.stringify(mocks.errors));
for (const [name, contract] of Object.entries(mocks.contracts["Mock.sol"])) {
  A[name] = { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

export const DAY = 24 * 60 * 60;
export const E = parseEther;
export const ZERO = "0x0000000000000000000000000000000000000000";
export const State = { Pending: 0, Open: 1, Closed: 2, Settled: 3, Cancelled: 4 };

// One fresh chain + fully deployed (but not yet opened) sale per test.
export async function world({ buyersCount = 5, accountsCount = 30, withdrawStepBps = 10_000n, lpLock = 365n * BigInt(DAY) } = {}) {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: accountsCount, defaultBalance: 1000 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.getAddresses();
  const [sponsor, teamWallet, lpWallet, stranger] = [accounts[0], accounts[20], accounts[21], accounts[22]];
  void accountsCount;
  const buyers = accounts.slice(1, 1 + buyersCount);
  const tree = buildAllowlistTree(buyers);
  const deploy = async (name, args = [], account = sponsor) => {
    const hash = await wallet.deployContract({ account, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 14_000_000n });
    const receipt = await client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success", `${name} deploy`);
    return receipt.contractAddress;
  };
  const send = async (target, name, fn, args = [], account = sponsor, value = 0n) =>
    client.waitForTransactionReceipt({ hash: await wallet.writeContract({ account, address: target, abi: A[name].abi, functionName: fn, args, value, gas: 14_000_000n }) });
  const ok = async (...a) => { const r = await send(...a); assert.equal(r.status, "success", `${a[2]} should succeed`); return r; };
  const no = async (...a) => assert.equal((await send(...a)).status, "reverted", `${a[2]} should revert`);
  const read = (target, name, fn, args = []) => client.readContract({ address: target, abi: A[name].abi, functionName: fn, args });
  const warp = async (seconds) => { await provider.request({ method: "evm_increaseTime", params: [seconds] }); await provider.request({ method: "evm_mine", params: [] }); };

  const token = await deploy("LaunchToken", ["RovynCore", "RVYN", E("10000000"), sponsor]);
  const weth = await deploy("V2WETH");
  const factory = await deploy("V2Factory");
  const router = await deploy("V2Router", [factory, weth]);
  const sale = await deploy("RovynPresaleV6", [token, sponsor, router, teamWallet, lpWallet, lpLock, withdrawStepBps]);
  const S = (fn, args = [], account = sponsor, value = 0n) => send(sale, "RovynPresaleV6", fn, args, account, value);
  const sok = (fn, args = [], account = sponsor, value = 0n) => ok(sale, "RovynPresaleV6", fn, args, account, value);
  const sno = (fn, args = [], account = sponsor, value = 0n) => no(sale, "RovynPresaleV6", fn, args, account, value);
  const sread = (fn, args = []) => read(sale, "RovynPresaleV6", fn, args);
  const bal = (who) => read(token, "LaunchToken", "balanceOf", [who]);
  const prepare = async () => {
    await sok("setAllowlistRoot", [tree.root]);
    await ok(token, "LaunchToken", "approve", [sale, E("10000000")]);
    await sok("depositInventory");
  };
  const openSale = async () => { await prepare(); await sok("open"); };
  const buy = (who, whole) => S("buy", [BigInt(whole), tree.proofFor(who)], who, BigInt(whole) * E("0.0001"));
  return { provider, client, wallet, accounts, sponsor, teamWallet, lpWallet, stranger, buyers, tree, deploy, send, ok, no, read, warp,
    token, weth, factory, router, sale, S, sok, sno, sread, bal, prepare, openSale, buy,
    done: () => provider.disconnect() };
}

