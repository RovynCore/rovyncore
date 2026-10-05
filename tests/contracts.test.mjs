import test from "node:test";
import assert from "node:assert/strict";
import ganache from "ganache";
import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  parseEther,
  decodeEventLog,
  keccak256,
} from "viem";
const A = JSON.parse(readFileSync("packages/web3/artifacts.json", "utf8"));
test("Genesis contract integration on isolated local EVM", async (t) => {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 4, defaultBalance: 100 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({
    id: 31337,
    name: "Isolated test EVM",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  });
  const client = createPublicClient({ chain, transport: custom(provider) });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [owner, creator, promoter, newTreasury] = await wallet.getAddresses();
  const deploy = async (name, args) => {
    const hash = await wallet.deployContract({
      account: owner,
      abi: A[name].abi,
      bytecode: A[name].bytecode,
      args,
      gas: 10000000n,
    });
    const r = await client.waitForTransactionReceipt({ hash });
    assert.equal(r.status, "success");
    return r.contractAddress;
  };
  const read = (address, name, fn, args = []) =>
    client.readContract({ address, abi: A[name].abi, functionName: fn, args });
  const write = async (
    address,
    name,
    fn,
    args = [],
    value = 0n,
    account = owner,
  ) => {
    const { request } = await client.simulateContract({
      account,
      address,
      abi: A[name].abi,
      functionName: fn,
      args,
      value,
    });
    const hash = await wallet.writeContract({ ...request, gas: 5000000n });
    return client.waitForTransactionReceipt({ hash });
  };
  const platform = await deploy("GenesisPlatform", [
    owner,
    owner,
    parseEther("0.0001"),
  ]);
  let token, sale;
  try {
    await t.test("deployable bytecode and exact runtime identity", async () => {
      assert.ok((A.GenesisPlatform.runtime.length - 2) / 2 < 24576);
      assert.equal(
        keccak256(await client.getCode({ address: platform })),
        keccak256(A.GenesisPlatform.runtime),
      );
    });
    await t.test("wrong fee rejected without issuing token", async () => {
      await assert.rejects(
        write(
          platform,
          "GenesisPlatform",
          "launch",
          ["Genesis", "GEN", parseEther("1000000000"), "genesis://test"],
          0n,
          creator,
        ),
      );
      assert.equal(await read(platform, "GenesisPlatform", "tokenCount"), 0n);
    });
    await t.test(
      "Genesis #001 cannot be front-run by another wallet",
      async () => {
        await assert.rejects(
          write(
            platform,
            "GenesisPlatform",
            "launch",
            ["Fake Genesis", "FAKE", parseEther("1000"), ""],
            parseEther("0.0001"),
            creator,
          ),
        );
      },
    );
    await t.test(
      "fixed supply launches to actual signer and emits registry event",
      async () => {
        const r = await write(
          platform,
          "GenesisPlatform",
          "launch",
          ["Genesis", "GEN", parseEther("1000000000"), "genesis://test"],
          parseEther("0.0001"),
          owner,
        );
        const e = r.logs
          .map((l) => {
            try {
              return decodeEventLog({ abi: A.GenesisPlatform.abi, ...l });
            } catch {
              return null;
            }
          })
          .find((e) => e?.eventName === "TokenCreated");
        token = e.args.token;
        assert.equal(e.args.creator.toLowerCase(), owner.toLowerCase());
        assert.equal(e.args.sequence, 1n);
        assert.equal(
          await read(token, "LaunchToken", "balanceOf", [owner]),
          parseEther("1000000000"),
        );
        assert.equal(
          await read(platform, "GenesisPlatform", "isToken", [token]),
          true,
        );
        await write(token, "LaunchToken", "transfer", [
          creator,
          parseEther("1000000000"),
        ]);
      },
    );
    await t.test(
      "no mint, tax, ownership or upgrade entrypoints in launched token",
      () => {
        const names = A.LaunchToken.abi
          .filter((x) => x.type === "function")
          .map((x) => x.name);
        for (const fn of [
          "mint",
          "owner",
          "setTax",
          "blacklist",
          "upgradeTo",
          "pause",
        ])
          assert.ok(!names.includes(fn));
      },
    );
    await t.test("invalid supply and long name rejected", async () => {
      for (const supply of [0n, parseEther("1000000000001")])
        await assert.rejects(
          write(
            platform,
            "GenesisPlatform",
            "launch",
            ["No", "NO", supply, ""],
            parseEther("0.0001"),
            creator,
          ),
        );
      await assert.rejects(
        write(
          platform,
          "GenesisPlatform",
          "launch",
          ["x".repeat(65), "NO", parseEther("1"), ""],
          parseEther("0.0001"),
          creator,
        ),
      );
    });
    await t.test("launch fee credited only to Treasury", async () => {
      assert.equal(
        await read(platform, "GenesisPlatform", "proceeds", [owner]),
        parseEther("0.0001"),
      );
      assert.equal(
        await read(platform, "GenesisPlatform", "proceeds", [creator]),
        0n,
      );
    });
    await t.test(
      "any wallet boosts a registered token; exact units/expiration/fee",
      async () => {
        const r = await write(
          platform,
          "GenesisPlatform",
          "boost",
          [token, 1],
          parseEther("0.0008"),
          promoter,
        );
        const e = decodeEventLog({ abi: A.GenesisPlatform.abi, ...r.logs[0] });
        const block = await client.getBlock({ blockNumber: r.blockNumber });
        assert.equal(e.args.units, 50);
        assert.equal(e.args.expiresAt, block.timestamp + 86400n);
        assert.equal(e.args.buyer.toLowerCase(), promoter.toLowerCase());
        assert.equal(
          await read(platform, "GenesisPlatform", "proceeds", [owner]),
          parseEther("0.0009"),
        );
      },
    );
    await t.test(
      "wrong Boost fee and unregistered token rejected",
      async () => {
        await assert.rejects(
          write(platform, "GenesisPlatform", "boost", [token, 1], 1n, promoter),
        );
        await assert.rejects(
          write(
            platform,
            "GenesisPlatform",
            "boost",
            [owner, 0],
            parseEther("0.0002"),
            promoter,
          ),
        );
      },
    );
    await t.test("admin mutation blocked for non-owner", async () => {
      await assert.rejects(
        write(
          platform,
          "GenesisPlatform",
          "setFees",
          [0n, promoter],
          0n,
          promoter,
        ),
      );
      await assert.rejects(
        write(
          platform,
          "GenesisPlatform",
          "setPlan",
          [0, 1n, 3600n, 10, true],
          0n,
          promoter,
        ),
      );
      await assert.rejects(
        write(platform, "GenesisPlatform", "setPaused", [true], 0n, promoter),
      );
    });
    await t.test("disable a plan and enforce bounded parameters", async () => {
      await write(platform, "GenesisPlatform", "setPlan", [
        0,
        parseEther("0.0002"),
        86400n,
        10,
        false,
      ]);
      await assert.rejects(
        write(
          platform,
          "GenesisPlatform",
          "boost",
          [token, 0],
          parseEther("0.0002"),
          promoter,
        ),
      );
      await assert.rejects(
        write(platform, "GenesisPlatform", "setPlan", [0, 1n, 1n, 1, true]),
      );
    });
    await t.test(
      "pause halts factory/boost without freezing ERC20 transfers",
      async () => {
        await write(platform, "GenesisPlatform", "setPaused", [true]);
        await assert.rejects(
          write(
            platform,
            "GenesisPlatform",
            "boost",
            [token, 1],
            parseEther("0.0008"),
            promoter,
          ),
        );
        await assert.rejects(
          write(
            platform,
            "GenesisPlatform",
            "launch",
            ["No", "NO", parseEther("1"), ""],
            parseEther("0.0001"),
            creator,
          ),
        );
        await write(
          token,
          "LaunchToken",
          "transfer",
          [promoter, parseEther("10")],
          0n,
          creator,
        );
        assert.equal(
          await read(token, "LaunchToken", "balanceOf", [promoter]),
          parseEther("10"),
        );
        await write(platform, "GenesisPlatform", "setPaused", [false]);
      },
    );
    await t.test("Treasury change preserves old Treasury claim", async () => {
      await write(platform, "GenesisPlatform", "setFees", [
        parseEther("0.0001"),
        newTreasury,
      ]);
      await write(
        platform,
        "GenesisPlatform",
        "boost",
        [token, 1],
        parseEther("0.0008"),
        promoter,
      );
      assert.equal(
        await read(platform, "GenesisPlatform", "proceeds", [newTreasury]),
        parseEther("0.0008"),
      );
      assert.equal(
        await read(platform, "GenesisPlatform", "proceeds", [owner]),
        parseEther("0.0009"),
      );
    });
    await t.test(
      "withdraw cannot steal another beneficiary or replay",
      async () => {
        await assert.rejects(
          write(platform, "GenesisPlatform", "withdraw", [], 0n, promoter),
        );
        await write(platform, "GenesisPlatform", "withdraw");
        assert.equal(
          await read(platform, "GenesisPlatform", "proceeds", [owner]),
          0n,
        );
        await assert.rejects(write(platform, "GenesisPlatform", "withdraw"));
      },
    );
    await t.test(
      "ownership transfer requires new owner acceptance",
      async () => {
        await write(platform, "GenesisPlatform", "transferOwnership", [
          newTreasury,
        ]);
        assert.equal(
          (await read(platform, "GenesisPlatform", "owner")).toLowerCase(),
          owner.toLowerCase(),
        );
        await assert.rejects(
          write(
            platform,
            "GenesisPlatform",
            "acceptOwnership",
            [],
            0n,
            promoter,
          ),
        );
        await write(
          platform,
          "GenesisPlatform",
          "acceptOwnership",
          [],
          0n,
          newTreasury,
        );
        assert.equal(
          (await read(platform, "GenesisPlatform", "owner")).toLowerCase(),
          newTreasury.toLowerCase(),
        );
      },
    );
    await t.test("sale begins inactive and rejects purchases", async () => {
      sale = await deploy("GenesisSale", [owner, token, owner, 10000000000n]);
      await assert.rejects(
        write(sale, "GenesisSale", "buy", [100n], 1000000000000n, promoter),
      );
    });
    await t.test(
      "inventory required; no payment retained on failure",
      async () => {
        await write(sale, "GenesisSale", "setActive", [true]);
        await assert.rejects(
          write(sale, "GenesisSale", "buy", [100n], 1000000000000n, promoter),
        );
        assert.equal(await read(sale, "GenesisSale", "proceeds", [owner]), 0n);
      },
    );
    await t.test("fixed price sale delivers exact token amount", async () => {
      await write(
        token,
        "LaunchToken",
        "transfer",
        [sale, parseEther("1000")],
        0n,
        creator,
      );
      await write(sale, "GenesisSale", "buy", [100n], 1000000000000n, promoter);
      assert.equal(
        await read(token, "LaunchToken", "balanceOf", [promoter]),
        parseEther("110"),
      );
      assert.equal(
        await read(sale, "GenesisSale", "proceeds", [owner]),
        1000000000000n,
      );
    });
    await t.test(
      "sale enforces exact payment and upper quantity bound",
      async () => {
        await assert.rejects(
          write(sale, "GenesisSale", "buy", [100n], 1n, promoter),
        );
        await assert.rejects(
          write(
            sale,
            "GenesisSale",
            "buy",
            [1000001n],
            10000010000000000n,
            promoter,
          ),
        );
      },
    );
    await t.test(
      "inventory reclaim only while paused and only by owner",
      async () => {
        await assert.rejects(
          write(sale, "GenesisSale", "reclaimInventory", [parseEther("1")]),
        );
        await write(sale, "GenesisSale", "setActive", [false]);
        await assert.rejects(
          write(
            sale,
            "GenesisSale",
            "reclaimInventory",
            [parseEther("1")],
            0n,
            promoter,
          ),
        );
        await write(sale, "GenesisSale", "reclaimInventory", [
          parseEther("900"),
        ]);
        assert.equal(await read(token, "LaunchToken", "balanceOf", [sale]), 0n);
      },
    );
    await t.test(
      "sale withdrawal clears proceeds and cannot repeat",
      async () => {
        await write(sale, "GenesisSale", "withdraw");
        assert.equal(await read(sale, "GenesisSale", "proceeds", [owner]), 0n);
        await assert.rejects(write(sale, "GenesisSale", "withdraw"));
      },
    );
  } finally {
    await provider.disconnect();
  }
});
