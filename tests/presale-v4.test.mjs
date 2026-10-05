import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import solc from "solc";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  parseEther,
} from "viem";
import { buildAllowlistTree } from "../lib/allowlist-merkle.ts";

const A = JSON.parse(fs.readFileSync("packages/contracts/v4/artifacts/contracts.json", "utf8"));
Object.assign(A, JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")));
const mocks = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources: { "Mock.sol": { content: fs.readFileSync("tests/fixtures/PresaleDex.sol", "utf8") } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "paris", outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } },
}), { import: (path) => ({ contents: fs.readFileSync(`node_modules/${path}`, "utf8") }) }));
assert.ok(!mocks.errors?.some((error) => error.severity === "error"));
for (const [name, contract] of Object.entries(mocks.contracts["Mock.sol"])) {
  A[name] = { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
}

test("V4 requires a committed allowlist proof before purchases and freezes the root at open", async () => {
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 100 }, chain: { chainId: 31337, hardfork: "shanghai" } });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const tree = buildAllowlistTree([accounts[1], accounts[2]]);
  const deploy = async (name, args = []) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ account: sponsor, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 12_000_000n }) });
    assert.equal(receipt.status, "success");
    return receipt.contractAddress;
  };
  const send = async (target, name, fn, args = [], account = sponsor, value = 0n) => client.waitForTransactionReceipt({
    hash: await wallet.writeContract({ account, address: target, abi: A[name].abi, functionName: fn, args, value, gas: 12_000_000n }),
  });
  const read = (target, name, fn, args = []) => client.readContract({ address: target, abi: A[name].abi, functionName: fn, args });
  const no = async (...args) => assert.equal((await send(...args)).status, "reverted");
  try {
    const token = await deploy("LaunchToken", ["RovynCore", "RVYN", parseEther("10000000"), sponsor]);
    const dex = await deploy("MockDex");
    const sale = await deploy("GenesisPresaleV4", [token, sponsor, dex]);
    await no(sale, "GenesisPresaleV4", "open");
    await send(sale, "GenesisPresaleV4", "setAllowlistRoot", [tree.root]);
    assert.equal(await read(sale, "GenesisPresaleV4", "isAllowlisted", [accounts[1], tree.proofFor(accounts[1])]), true);
    assert.equal(await read(sale, "GenesisPresaleV4", "isAllowlisted", [accounts[3], []]), false);
    await send(token, "LaunchToken", "approve", [sale, parseEther("8000000")]);
    await send(sale, "GenesisPresaleV4", "depositInventory");
    await send(sale, "GenesisPresaleV4", "open");
    await no(sale, "GenesisPresaleV4", "setAllowlistRoot", [tree.root]);
    await no(sale, "GenesisPresaleV4", "buy", [1000n, []], accounts[3], parseEther("0.1"));
    await send(sale, "GenesisPresaleV4", "buy", [1000n, tree.proofFor(accounts[1])], accounts[1], parseEther("0.1"));
    assert.equal(await read(sale, "GenesisPresaleV4", "raised"), parseEther("0.1"));
  } finally {
    await provider.disconnect();
  }
});

test("V4 supports cancel-before-open recovery and failed-sale buyer refunds", async () => {
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 100 }, chain: { chainId: 31337, hardfork: "shanghai" } });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const buyer = accounts[1];
  const recipient = accounts[2];
  const tree = buildAllowlistTree([buyer]);
  const deploy = async (name, args = []) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ account: sponsor, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 12_000_000n }) });
    assert.equal(receipt.status, "success");
    return receipt.contractAddress;
  };
  const send = async (target, name, fn, args = [], account = sponsor, value = 0n) => client.waitForTransactionReceipt({
    hash: await wallet.writeContract({ account, address: target, abi: A[name].abi, functionName: fn, args, value, gas: 12_000_000n }),
  });
  const read = (target, name, fn, args = []) => client.readContract({ address: target, abi: A[name].abi, functionName: fn, args });
  try {
    const token = await deploy("LaunchToken", ["RovynCore", "RVYN", parseEther("10000000"), sponsor]);
    const dex = await deploy("MockDex");

    const canceledSale = await deploy("GenesisPresaleV4", [token, sponsor, dex]);
    await send(token, "LaunchToken", "approve", [canceledSale, parseEther("8000000")]);
    await send(canceledSale, "GenesisPresaleV4", "depositInventory");
    await send(canceledSale, "GenesisPresaleV4", "cancelBeforeOpen");
    assert.equal(await read(canceledSale, "GenesisPresaleV4", "state"), 3);
    await send(canceledSale, "GenesisPresaleV4", "recoverFailedInventory");
    assert.equal(await read(token, "LaunchToken", "balanceOf", [canceledSale]), 0n);

    const sale = await deploy("GenesisPresaleV4", [token, sponsor, dex]);
    await send(sale, "GenesisPresaleV4", "setAllowlistRoot", [tree.root]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("8000000")]);
    await send(sale, "GenesisPresaleV4", "depositInventory");
    await send(sale, "GenesisPresaleV4", "open");
    await send(sale, "GenesisPresaleV4", "buy", [1000n, tree.proofFor(buyer)], buyer, parseEther("0.1"));

    await provider.request({ method: "evm_increaseTime", params: [21 * 24 * 60 * 60] });
    await provider.request({ method: "evm_mine", params: [] });
    await send(sale, "GenesisPresaleV4", "failSale");
    assert.equal(await read(sale, "GenesisPresaleV4", "state"), 3);
    const recipientBefore = await client.getBalance({ address: recipient });
    await send(sale, "GenesisPresaleV4", "refund", [recipient], buyer);
    assert.equal(await client.getBalance({ address: recipient }), recipientBefore + parseEther("0.1"));
    await send(sale, "GenesisPresaleV4", "recoverFailedInventory");
    assert.equal(await read(token, "LaunchToken", "balanceOf", [sale]), 0n);
  } finally {
    await provider.disconnect();
  }
});
