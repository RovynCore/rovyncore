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
    {
      import: (p) => ({
        contents: fs.readFileSync("node_modules/" + p, "utf8"),
      }),
    },
  ),
);
assert.ok(!output.errors?.some((e) => e.severity === "error"));
for (const [name, c] of Object.entries(output.contracts["Mock.sol"]))
  A[name] = { abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
test("Presale escrow, caps, atomic settlement and locks", async (t) => {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 402, defaultBalance: 100 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({
    id: 31337,
    name: "Local",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://localhost"] } },
  });
  const client = createPublicClient({
    chain,
    transport: custom(provider),
    cacheTime: 0,
  });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const accounts = await wallet.getAddresses();
  const owner = accounts[0];
  const deploy = async (name, args = []) => {
    const r = await client.waitForTransactionReceipt({
      hash: await wallet.deployContract({
        account: owner,
        abi: A[name].abi,
        bytecode: A[name].bytecode,
        args,
        gas: 12000000n,
      }),
    });
    assert.equal(r.status, "success");
    return r.contractAddress;
  };
  const read = (address, name, fn, args = []) =>
    client.readContract({ address, abi: A[name].abi, functionName: fn, args });
  const send = async (
    address,
    name,
    fn,
    args = [],
    account = owner,
    value = 0n,
  ) =>
    client.waitForTransactionReceipt({
      hash: await wallet.writeContract({
        account,
        address,
        abi: A[name].abi,
        functionName: fn,
        args,
        value,
        gas: 10000000n,
      }),
    });
  const ok = async (...args) =>
    assert.equal((await send(...args)).status, "success");
  const no = async (...args) =>
    assert.equal((await send(...args)).status, "reverted");
  const advance = async (seconds) => {
    await provider.request({ method: "evm_increaseTime", params: [seconds] });
    await provider.request({ method: "evm_mine", params: [] });
  };
  const fresh = async () => {
    const token = await deploy("LaunchToken", [
      "RovynCore",
      "RVYN",
      parseEther("10000000"),
      owner,
    ]);
    const dex = await deploy("MockDex");
    const sale = await deploy("GenesisPresale", [token, owner, dex]);
    return { token, dex, sale };
  };
  const fund = async ({ token, sale }) => {
    await ok(token, "LaunchToken", "approve", [sale, parseEther("8000000")]);
    await ok(sale, "GenesisPresale", "open");
  };
  try {
    await t.test(
      "requires inventory; exact payment and cumulative wallet cap; no early withdrawals",
      async () => {
        const x = await fresh();
        await no(x.sale, "GenesisPresale", "open");
        await fund(x);
        await no(x.sale, "GenesisPresale", "open");
        await no(x.sale, "GenesisPresale", "buy", [1n], accounts[1], 1n);
        await ok(
          x.sale,
          "GenesisPresale",
          "buy",
          [2500n],
          accounts[1],
          parseEther(".25"),
        );
        await no(
          x.sale,
          "GenesisPresale",
          "buy",
          [1n],
          accounts[1],
          parseEther(".0001"),
        );
        await no(
          x.sale,
          "GenesisPresale",
          "buy",
          [1n],
          accounts[1],
          500000000000n,
        );
        await no(x.sale, "GenesisPresale", "recoverFailedInventory");
        await no(x.sale, "GenesisPresale", "claim", [accounts[1]], accounts[1]);
        await no(x.sale, "GenesisPresale", "settle");
        await no(x.sale, "GenesisPresale", "failSale");
        await no(x.sale, "GenesisPresale", "cancelBeforeOpen");
        await advance(14 * 86400 + 7 * 86400);
        await ok(x.sale, "GenesisPresale", "failSale", [], accounts[2]);
        const reject = await deploy("RejectETH");
        await no(x.sale, "GenesisPresale", "refund", [reject], accounts[1]);
        assert.equal(
          await read(x.sale, "GenesisPresale", "contributions", [accounts[1]]),
          parseEther(".25"),
        );
        const before = await client.getBalance({ address: accounts[2] });
        await ok(
          x.sale,
          "GenesisPresale",
          "refund",
          [accounts[2]],
          accounts[1],
        );
        assert.equal(
          await client.getBalance({ address: accounts[2] }),
          before + parseEther(".25"),
        );
        await no(
          x.sale,
          "GenesisPresale",
          "refund",
          [accounts[2]],
          accounts[1],
        );
        await ok(x.sale, "GenesisPresale", "recoverFailedInventory");
        assert.equal(
          await read(x.token, "LaunchToken", "balanceOf", [owner]),
          parseEther("10000000"),
        );
      },
    );
    await t.test(
      "success preserves sale price, locks liquidity/team/reserve and burns unsold tokens",
      async () => {
        const x = await fresh();
        await fund(x);
        for (let i = 1; i <= 40; i++)
          await ok(
            x.sale,
            "GenesisPresale",
            "buy",
            [2500n],
            accounts[i],
            parseEther(".25"),
          );
        await advance(14 * 86400);
        await ok(x.sale, "GenesisPresale", "settle", [], accounts[41]);
        const lp = await read(x.sale, "GenesisPresale", "lpLock");
        const team = await read(x.sale, "GenesisPresale", "teamLock");
        const reserve = await read(x.sale, "GenesisPresale", "reserveLock");
        assert.equal(
          await read(x.token, "LaunchToken", "balanceOf", [team]),
          parseEther("2000000"),
        );
        assert.equal(
          await read(x.token, "LaunchToken", "balanceOf", [reserve]),
          parseEther("4900000"),
        );
        assert.equal(
          await read(x.sale, "GenesisPresale", "liquidityTokenAmount"),
          parseEther("100000"),
        );
        assert.equal(
          await read(x.sale, "GenesisPresale", "unsoldBurned"),
          parseEther("900000"),
        );
        await no(lp, "GenesisTokenLock", "release");
        await no(team, "GenesisTokenLock", "release");
        await no(reserve, "GenesisTokenLock", "release");
        await ok(x.sale, "GenesisPresale", "claim", [accounts[1]], accounts[1]);
        assert.equal(
          await read(x.token, "LaunchToken", "balanceOf", [accounts[1]]),
          parseEther("2500"),
        );
        await no(x.sale, "GenesisPresale", "claim", [accounts[1]], accounts[1]);
        await no(
          x.sale,
          "GenesisPresale",
          "refund",
          [accounts[1]],
          accounts[1],
        );
        await no(x.sale, "GenesisPresale", "settle");
        await advance(729 * 86400);
        await no(team, "GenesisTokenLock", "release");
        await advance(1 * 86400);
        await ok(team, "GenesisTokenLock", "release");
        assert.equal(
          await read(team, "GenesisTokenLock", "released"),
          parseEther("2000000"),
        );
        await advance(365 * 86400);
        await ok(lp, "GenesisTokenLock", "release");
        await ok(reserve, "GenesisTokenLock", "release");
      },
    );
    await t.test(
      "100 ETH hard cap closes early; broken DEX keeps ETH escrowed, then timeout refunds",
      async () => {
        const x = await fresh();
        await fund(x);
        for (let i = 1; i <= 400; i++)
          await ok(
            x.sale,
            "GenesisPresale",
            "buy",
            [2500n],
            accounts[i],
            parseEther(".25"),
          );
        assert.equal(
          await read(x.sale, "GenesisPresale", "raised"),
          parseEther("100"),
        );
        assert.ok((await read(x.sale, "GenesisPresale", "closedAt")) > 0n);
        await no(
          x.sale,
          "GenesisPresale",
          "buy",
          [1n],
          accounts[401],
          parseEther(".0001"),
        );
        await ok(x.dex, "MockDex", "setBroken", [true]);
        await no(x.sale, "GenesisPresale", "settle");
        assert.equal(
          await client.getBalance({ address: x.sale }),
          parseEther("100"),
        );
        assert.equal(await read(x.sale, "GenesisPresale", "state"), 1);
        await advance(7 * 86400);
        await no(x.sale, "GenesisPresale", "settle");
        await ok(x.sale, "GenesisPresale", "failSale");
        await ok(
          x.sale,
          "GenesisPresale",
          "refund",
          [accounts[1]],
          accounts[1],
        );
        assert.equal(
          await client.getBalance({ address: x.sale }),
          parseEther("99.75"),
        );
      },
    );
  } finally {
    await provider.disconnect();
  }
});
