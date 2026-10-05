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

const A = JSON.parse(fs.readFileSync("packages/contracts/v5/artifacts/contracts.json", "utf8"));
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

function setup() {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 30, defaultBalance: 100 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({
    id: 31337,
    name: "Local",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://localhost"] } },
  });
  const client = createPublicClient({ chain, transport: custom(provider), cacheTime: 0 });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  return { provider, client, wallet };
}

test("V5 requires allowlist proof, transfers purchased RVYN immediately, and has no claim/refund path", async () => {
  const { provider, client, wallet } = setup();
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const buyer = accounts[1];
  const tree = buildAllowlistTree([buyer]);
  const deploy = async (name, args = []) => {
    const hash = await wallet.deployContract({ account: sponsor, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 12_000_000n });
    const receipt = await client.waitForTransactionReceipt({ hash });
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
    const sale = await deploy("RovynPresaleV5", [token, sponsor, dex, accounts[25], 365n * 24n * 60n * 60n]);
    assert.equal(A.RovynPresaleV5.abi.some((item) => item.type === "function" && ["claim", "refund", "failSale"].includes(item.name)), false);
    await no(sale, "RovynPresaleV5", "open");
    await send(sale, "RovynPresaleV5", "setAllowlistRoot", [tree.root]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("10000000")]);
    await send(sale, "RovynPresaleV5", "depositInventory");
    await send(sale, "RovynPresaleV5", "open");
    assert.equal(await read(token, "LaunchToken", "balanceOf", [sponsor]), parseEther("500000"));
    const vesting = await read(sale, "RovynPresaleV5", "teamVesting");
    assert.equal(await read(token, "LaunchToken", "balanceOf", [vesting]), parseEther("1000000"));
    await no(sale, "RovynPresaleV5", "setAllowlistRoot", [tree.root]);
    await no(sale, "RovynPresaleV5", "buy", [1000n, []], accounts[2], parseEther("0.1"));

    const balanceBefore = await read(token, "LaunchToken", "balanceOf", [buyer]);
    await send(sale, "RovynPresaleV5", "buy", [1000n, tree.proofFor(buyer)], buyer, parseEther("0.1"));
    assert.equal(await read(token, "LaunchToken", "balanceOf", [buyer]), balanceBefore + parseEther("1000"));
    assert.equal(await read(sale, "RovynPresaleV5", "raised"), parseEther("0.1"));
    await no(sale, "RovynPresaleV5", "withdrawProjectFunds", [1n]);
  } finally {
    await provider.disconnect();
  }
});

test("V5 airdrop is capped at 20 unique addresses per batch and within its lifetime allocation", async () => {
  const { provider, client, wallet } = setup();
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const tree = buildAllowlistTree([accounts[1]]);
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
    const sale = await deploy("RovynPresaleV5", [token, sponsor, dex, accounts[25], 365n * 24n * 60n * 60n]);
    await send(sale, "RovynPresaleV5", "setAllowlistRoot", [tree.root]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("10000000")]);
    await send(sale, "RovynPresaleV5", "depositInventory");
    await send(sale, "RovynPresaleV5", "open");
    const recipients = accounts.slice(2, 22);
    const amounts = recipients.map(() => parseEther("200"));
    await send(sale, "RovynPresaleV5", "airdrop", [recipients, amounts, `0x${"11".repeat(32)}`]);
    assert.equal(await read(sale, "RovynPresaleV5", "airdropSpent"), parseEther("4000"));
    assert.equal(await read(token, "LaunchToken", "balanceOf", [recipients[0]]), parseEther("200"));
    await no(sale, "RovynPresaleV5", "airdrop", [[...recipients, accounts[22]], [...amounts, parseEther("1")], `0x${"22".repeat(32)}`]);
    await no(sale, "RovynPresaleV5", "airdrop", [[recipients[0], recipients[0]], [parseEther("1"), parseEther("1")], `0x${"33".repeat(32)}`]);
    await no(sale, "RovynPresaleV5", "distributeProduct", [accounts[2], parseEther("1000001"), `0x${"44".repeat(32)}`]);
  } finally {
    await provider.disconnect();
  }
});

test("V5 matches the presale reference ratio, locks initial LP, and permits only post-settlement proceeds withdrawal", async () => {
  const { provider, client, wallet } = setup();
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const buyer = accounts[1];
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
    const sale = await deploy("RovynPresaleV5", [token, sponsor, dex, accounts[25], 365n * 24n * 60n * 60n]);
    await send(sale, "RovynPresaleV5", "setAllowlistRoot", [tree.root]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("10000000")]);
    await send(sale, "RovynPresaleV5", "depositInventory");
    await send(sale, "RovynPresaleV5", "open");
    await send(sale, "RovynPresaleV5", "buy", [1000n, tree.proofFor(buyer)], buyer, parseEther("0.1"));
    await send(sale, "RovynPresaleV5", "depositLiquidityRevenue", [], sponsor, parseEther("0.02"));
    await send(sale, "RovynPresaleV5", "close");
    await send(sale, "RovynPresaleV5", "createInitialPool", [parseEther("0.07")]);

    const poolEth = await read(sale, "RovynPresaleV5", "initialPoolEth");
    const poolTokens = await read(sale, "RovynPresaleV5", "initialPoolTokens");
    assert.equal(poolEth, parseEther("0.07"));
    assert.equal(poolTokens, parseEther("700"));
    assert.equal(await read(sale, "RovynPresaleV5", "withdrawableProjectEth"), parseEther("0.05"));
    const pair = await read(sale, "RovynPresaleV5", "pair");
    const lpLock = await read(sale, "RovynPresaleV5", "initialLpLock");
    assert.equal(await read(pair, "MockPair", "balanceOf", [lpLock]), parseEther("0.07"));
    assert.equal(await read(sale, "RovynPresaleV5", "lpTokensRemaining"), parseEther("4999300"));

    const before = await client.getBalance({ address: sponsor });
    const withdrawReceipt = await send(sale, "RovynPresaleV5", "withdrawProjectFunds", [parseEther("0.03")]);
    assert.equal(withdrawReceipt.status, "success");
    assert.equal(await read(sale, "RovynPresaleV5", "withdrawableProjectEth"), parseEther("0.02"));
    const after = await client.getBalance({ address: sponsor });
    assert.ok(after > before);

    const vesting = await read(sale, "RovynPresaleV5", "teamVesting");
    assert.equal(await read(vesting, "RovynTeamVesting", "vested"), 0n);
    await provider.request({ method: "evm_increaseTime", params: [365 * 24 * 60 * 60] });
    await provider.request({ method: "evm_mine", params: [] });
    assert.equal(await read(vesting, "RovynTeamVesting", "releasable"), 0n);
    await provider.request({ method: "evm_increaseTime", params: [30 * 24 * 60 * 60] });
    await provider.request({ method: "evm_mine", params: [] });
    assert.equal(await read(vesting, "RovynTeamVesting", "releasable"), parseEther("1000000") / 24n);
    await provider.request({ method: "evm_increaseTime", params: [23 * 30 * 24 * 60 * 60] });
    await provider.request({ method: "evm_mine", params: [] });
    assert.equal(await read(vesting, "RovynTeamVesting", "vested"), parseEther("1000000"));
  } finally {
    await provider.disconnect();
  }
});

test("V5 allows a revenue-funded pool with no presale buyers", async () => {
  const { provider, client, wallet } = setup();
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const tree = buildAllowlistTree([accounts[1]]);
  const deploy = async (name, args = []) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ account: sponsor, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 12_000_000n }) });
    assert.equal(receipt.status, "success");
    return receipt.contractAddress;
  };
  const send = async (target, name, fn, args = [], value = 0n) => client.waitForTransactionReceipt({
    hash: await wallet.writeContract({ account: sponsor, address: target, abi: A[name].abi, functionName: fn, args, value, gas: 12_000_000n }),
  });
  const read = (target, name, fn, args = []) => client.readContract({ address: target, abi: A[name].abi, functionName: fn, args });
  try {
    const token = await deploy("LaunchToken", ["RovynCore", "RVYN", parseEther("10000000"), sponsor]);
    const dex = await deploy("MockDex");
    const sale = await deploy("RovynPresaleV5", [token, sponsor, dex, accounts[25], 365n * 24n * 60n * 60n]);
    await send(sale, "RovynPresaleV5", "setAllowlistRoot", [tree.root]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("10000000")]);
    await send(sale, "RovynPresaleV5", "depositInventory");
    await send(sale, "RovynPresaleV5", "open");
    await send(sale, "RovynPresaleV5", "close");
    await send(sale, "RovynPresaleV5", "depositLiquidityRevenue", [], parseEther("0.05"));
    await send(sale, "RovynPresaleV5", "createInitialPool", [parseEther("0.05")]);
    assert.equal(await read(sale, "RovynPresaleV5", "initialPoolTokens"), parseEther("500"));
    assert.equal(await read(sale, "RovynPresaleV5", "unsoldBurned"), parseEther("1000000"));
    assert.equal(await read(sale, "RovynPresaleV5", "state"), 3);
  } finally {
    await provider.disconnect();
  }
});

test("V5 can settle a zero-proceeds sale without inventing a refund or failed-sale state", async () => {
  const { provider, client, wallet } = setup();
  const accounts = await wallet.getAddresses();
  const sponsor = accounts[0];
  const tree = buildAllowlistTree([accounts[1]]);
  const deploy = async (name, args = []) => {
    const receipt = await client.waitForTransactionReceipt({ hash: await wallet.deployContract({ account: sponsor, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 12_000_000n }) });
    assert.equal(receipt.status, "success");
    return receipt.contractAddress;
  };
  const send = async (target, name, fn, args = []) => client.waitForTransactionReceipt({
    hash: await wallet.writeContract({ account: sponsor, address: target, abi: A[name].abi, functionName: fn, args, gas: 12_000_000n }),
  });
  const read = (target, name, fn, args = []) => client.readContract({ address: target, abi: A[name].abi, functionName: fn, args });
  try {
    const token = await deploy("LaunchToken", ["RovynCore", "RVYN", parseEther("10000000"), sponsor]);
    const dex = await deploy("MockDex");
    const sale = await deploy("RovynPresaleV5", [token, sponsor, dex, accounts[25], 365n * 24n * 60n * 60n]);
    await send(sale, "RovynPresaleV5", "setAllowlistRoot", [tree.root]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("10000000")]);
    await send(sale, "RovynPresaleV5", "depositInventory");
    await send(sale, "RovynPresaleV5", "open");
    await send(sale, "RovynPresaleV5", "close");
    const receipt = await send(sale, "RovynPresaleV5", "settleWithoutPool");
    assert.equal(receipt.status, "success");
    assert.equal(await read(sale, "RovynPresaleV5", "state"), 3);
    assert.equal(await read(sale, "RovynPresaleV5", "unsoldBurned"), parseEther("1000000"));
    assert.equal(await read(sale, "RovynPresaleV5", "pair"), "0x0000000000000000000000000000000000000000");
    assert.equal(await read(token, "LaunchToken", "totalSupply"), parseEther("9000000"));
  } finally {
    await provider.disconnect();
  }
});
