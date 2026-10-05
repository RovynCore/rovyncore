import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  parseEther,
  decodeEventLog,
} from "viem";
const A = JSON.parse(
  fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8"),
);
test("V2 Treasury and ownership safeguards", async (t) => {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 4, defaultBalance: 100 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({
    id: 31337,
    name: "Local V2 tests",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  });
  const client = createPublicClient({
    chain,
    transport: custom(provider),
    cacheTime: 0,
  });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [owner, recipient, stranger, nextOwner] = await wallet.getAddresses();
  const zero = "0x0000000000000000000000000000000000000000";
  const deployReceipt = async (name, args) =>
    client.waitForTransactionReceipt({
      hash: await wallet.deployContract({
        account: owner,
        abi: A[name].abi,
        bytecode: A[name].bytecode,
        args,
        gas: 10000000n,
      }),
    });
  const deploy = async (name, args) => {
    const r = await deployReceipt(name, args);
    assert.equal(r.status, "success");
    return r.contractAddress;
  };
  const read = (address, name, functionName, args = []) =>
    client.readContract({ address, abi: A[name].abi, functionName, args });
  const send = async (
    address,
    name,
    functionName,
    args = [],
    account = owner,
    value = 0n,
  ) =>
    client.waitForTransactionReceipt({
      hash: await wallet.writeContract({
        account,
        address,
        abi: A[name].abi,
        functionName,
        args,
        value,
        gas: 6000000n,
      }),
    });
  const ok = async (...a) => {
    const r = await send(...a);
    assert.equal(r.status, "success");
    return r;
  };
  const no = async (...a) =>
    assert.equal((await send(...a)).status, "reverted");
  let p, token, sale;
  try {
    await t.test(
      "deployment rejects unconfirmed initial recipient",
      async () => {
        assert.equal(
          (await deployReceipt("GenesisPlatform", [owner, recipient, 1n]))
            .status,
          "reverted",
        );
        p = await deploy("GenesisPlatform", [
          owner,
          owner,
          parseEther(".0001"),
        ]);
        const r = await ok(
          p,
          "GenesisPlatform",
          "launch",
          ["Genesis", "GEN", parseEther("1000000000"), "genesis://v2"],
          owner,
          parseEther(".0001"),
        );
        token = r.logs
          .map((l) => {
            try {
              return decodeEventLog({ abi: A.GenesisPlatform.abi, ...l });
            } catch {
              return null;
            }
          })
          .find((e) => e?.eventName === "TokenCreated").args.token;
        assert.equal(
          await read(token, "LaunchToken", "totalSupply"),
          parseEther("1000000000"),
        );
        assert.equal(
          (await deployReceipt("GenesisSale", [owner, token, recipient, 1n]))
            .status,
          "reverted",
        );
        assert.equal(
          (await deployReceipt("GenesisSale", [owner, stranger, owner, 1n]))
            .status,
          "reverted",
        );
        sale = await deploy("GenesisSale", [owner, token, owner, 1n]);
      },
    );
    await t.test(
      "setFees cannot silently change recipient; rejects self and known Token proposals",
      async () => {
        await no(p, "GenesisPlatform", "setFees", [
          parseEther(".0001"),
          recipient,
        ]);
        for (const address of [p, token, zero, owner])
          await no(p, "GenesisPlatform", "proposeTreasury", [address]);
        await no(
          p,
          "GenesisPlatform",
          "proposeTreasury",
          [recipient],
          stranger,
        );
        await ok(p, "GenesisPlatform", "setFees", [parseEther(".0002"), owner]);
        assert.equal(
          await read(p, "GenesisPlatform", "launchFee"),
          parseEther(".0002"),
        );
      },
    );
    await t.test(
      "proposal leaves fees unchanged; only proposed wallet can accept; old credit retained",
      async () => {
        await ok(p, "GenesisPlatform", "proposeTreasury", [recipient]);
        assert.equal(
          (await read(p, "GenesisPlatform", "treasury")).toLowerCase(),
          owner.toLowerCase(),
        );
        await no(p, "GenesisPlatform", "acceptTreasury", [], stranger);
        await ok(
          p,
          "GenesisPlatform",
          "boost",
          [token, 0],
          stranger,
          parseEther(".0006"),
        );
        const oldCredit = await read(p, "GenesisPlatform", "proceeds", [owner]);
        await ok(p, "GenesisPlatform", "acceptTreasury", [], recipient);
        assert.equal(await read(p, "GenesisPlatform", "pendingTreasury"), zero);
        await no(p, "GenesisPlatform", "acceptTreasury", [], recipient);
        await ok(
          p,
          "GenesisPlatform",
          "boost",
          [token, 0],
          stranger,
          parseEther(".0006"),
        );
        assert.equal(
          await read(p, "GenesisPlatform", "proceeds", [owner]),
          oldCredit,
        );
        assert.equal(
          await read(p, "GenesisPlatform", "proceeds", [recipient]),
          parseEther(".0006"),
        );
        await ok(p, "GenesisPlatform", "withdraw", [], recipient);
        assert.equal(
          await read(p, "GenesisPlatform", "proceeds", [recipient]),
          0n,
        );
      },
    );
    await t.test(
      "proposal can be cancelled or replaced; stale recipients cannot accept",
      async () => {
        await ok(p, "GenesisPlatform", "proposeTreasury", [stranger]);
        await no(p, "GenesisPlatform", "cancelTreasuryProposal", [], stranger);
        await ok(p, "GenesisPlatform", "cancelTreasuryProposal");
        await no(p, "GenesisPlatform", "acceptTreasury", [], stranger);
        await ok(p, "GenesisPlatform", "proposeTreasury", [stranger]);
        await ok(p, "GenesisPlatform", "proposeTreasury", [nextOwner]);
        await no(p, "GenesisPlatform", "acceptTreasury", [], stranger);
        await ok(p, "GenesisPlatform", "cancelTreasuryProposal");
      },
    );
    await t.test(
      "platform owner cannot renounce; pause remains recoverable",
      async () => {
        await ok(p, "GenesisPlatform", "setPaused", [true]);
        await no(p, "GenesisPlatform", "renounceOwnership");
        assert.equal(
          (await read(p, "GenesisPlatform", "owner")).toLowerCase(),
          owner.toLowerCase(),
        );
        await ok(p, "GenesisPlatform", "setPaused", [false]);
      },
    );
    await t.test(
      "Sale owner cannot renounce; inventory remains recoverable; normal purchases work",
      async () => {
        await ok(token, "LaunchToken", "transfer", [sale, parseEther("10")]);
        await no(sale, "GenesisSale", "renounceOwnership");
        await ok(sale, "GenesisSale", "setActive", [true]);
        await ok(sale, "GenesisSale", "buy", [1n], stranger, 1n);
        assert.equal(
          await read(token, "LaunchToken", "balanceOf", [stranger]),
          parseEther("1"),
        );
        await ok(sale, "GenesisSale", "setActive", [false]);
        await ok(sale, "GenesisSale", "reclaimInventory", [parseEther("9")]);
        assert.equal(await read(token, "LaunchToken", "balanceOf", [sale]), 0n);
        await ok(sale, "GenesisSale", "withdraw");
      },
    );
    await t.test(
      "two-step owner transfer retained and clears outstanding Treasury proposal",
      async () => {
        await ok(p, "GenesisPlatform", "proposeTreasury", [stranger]);
        await ok(p, "GenesisPlatform", "transferOwnership", [nextOwner]);
        await no(p, "GenesisPlatform", "acceptOwnership", [], stranger);
        await ok(p, "GenesisPlatform", "acceptOwnership", [], nextOwner);
        assert.equal(await read(p, "GenesisPlatform", "pendingTreasury"), zero);
        await no(p, "GenesisPlatform", "acceptTreasury", [], stranger);
        await no(p, "GenesisPlatform", "proposeTreasury", [owner]);
        await no(p, "GenesisPlatform", "renounceOwnership", [], nextOwner);
        await ok(sale, "GenesisSale", "transferOwnership", [nextOwner]);
        await ok(sale, "GenesisSale", "acceptOwnership", [], nextOwner);
        await no(sale, "GenesisSale", "renounceOwnership", [], nextOwner);
      },
    );
  } finally {
    await provider.disconnect();
  }
});
