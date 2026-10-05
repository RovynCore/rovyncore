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

const A = JSON.parse(
  fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8"),
);
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: {
        "Mock.sol": {
          content: fs.readFileSync("tests/fixtures/PresaleDex.sol", "utf8"),
        },
      },
      settings: {
        optimizer: { enabled: true, runs: 200 },
        evmVersion: "paris",
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
    { import: (p) => ({ contents: fs.readFileSync("node_modules/" + p, "utf8") }) },
  ),
);
assert.ok(!output.errors?.some((e) => e.severity === "error"));
for (const [name, c] of Object.entries(output.contracts["Mock.sol"]))
  A[name] = { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };

test("V3 presale supports manual pool amount and post-settlement withdrawal", async () => {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 8, defaultBalance: 100 },
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
  const accounts = await wallet.getAddresses();
  const owner = accounts[0];
  const deploy = async (name, args = []) => {
    const receipt = await client.waitForTransactionReceipt({
      hash: await wallet.deployContract({ account: owner, abi: A[name].abi, bytecode: A[name].bytecode, args, gas: 12000000n }),
    });
    assert.equal(receipt.status, "success");
    return receipt.contractAddress;
  };
  const send = async (address, name, fn, args = [], account = owner, value = 0n) =>
    client.waitForTransactionReceipt({
      hash: await wallet.writeContract({ account, address, abi: A[name].abi, functionName: fn, args, value, gas: 12000000n }),
    });
  const read = (address, name, fn, args = []) =>
    client.readContract({ address, abi: A[name].abi, functionName: fn, args });
  const no = async (...args) => assert.equal((await send(...args)).status, "reverted");
  try {
    const token = await deploy("LaunchToken", ["RovynCore", "RVYN", parseEther("10000000"), owner]);
    const dex = await deploy("MockDex");
    const sale = await deploy("GenesisPresaleV3", [token, owner, dex]);

    await no(sale, "GenesisPresaleV3", "withdraw", [parseEther("0.01")]);
    await send(token, "LaunchToken", "approve", [sale, parseEther("8000000")]);
    await send(sale, "GenesisPresaleV3", "depositInventory");
    assert.equal(await read(token, "LaunchToken", "balanceOf", [sale]), parseEther("8000000"));
    await send(sale, "GenesisPresaleV3", "open");
    assert.equal(await read(sale, "GenesisPresaleV3", "state"), 1);
    await send(sale, "GenesisPresaleV3", "buy", [1000n], accounts[1], parseEther("0.1"));
    await send(sale, "GenesisPresaleV3", "close");
    await no(sale, "GenesisPresaleV3", "createPool", [parseEther("0.2")], accounts[2]);
    await send(sale, "GenesisPresaleV3", "createPool", [parseEther("0.05")]);
    assert.equal(await read(sale, "GenesisPresaleV3", "poolEthAmount"), parseEther("0.05"));
    assert.equal(await read(sale, "GenesisPresaleV3", "withdrawableEth"), parseEther("0.05"));
    await send(sale, "GenesisPresaleV3", "withdraw", [parseEther("0.02")]);
    assert.equal(await read(sale, "GenesisPresaleV3", "withdrawnEth"), parseEther("0.02"));
    assert.equal(await read(sale, "GenesisPresaleV3", "withdrawableEth"), parseEther("0.03"));
    await send(sale, "GenesisPresaleV3", "claim", [accounts[1]], accounts[1]);
    assert.equal(await read(token, "LaunchToken", "balanceOf", [accounts[1]]), parseEther("1000"));
    await no(sale, "GenesisPresaleV3", "withdraw", [parseEther("0.04")]);
  } finally {
    await provider.disconnect();
  }
});
