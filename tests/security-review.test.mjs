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
  decodeEventLog,
} from "viem";
const A = JSON.parse(fs.readFileSync("packages/web3/artifacts.json", "utf8"));
const fixture = `pragma solidity ^0.8.28;
interface W {function withdraw() external;}
contract Receiver {
 address public target; bool public rejectPayment; bool public nestedSucceeded; uint public received;
 function configure(address t,bool r) external {target=t;rejectPayment=r;}
 function claim() external {W(target).withdraw();}
 receive() external payable {require(!rejectPayment);received+=msg.value;(nestedSucceeded,)=target.call(abi.encodeWithSignature("withdraw()"));}
}`;
const out = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "Fixture.sol": { content: fixture } },
      settings: {
        evmVersion: "paris",
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
const F = out.contracts["Fixture.sol"].Receiver;
A.Receiver = { abi: F.abi, bytecode: "0x" + F.evm.bytecode.object };
test("Security review: isolated adversarial and configuration scenarios", async (t) => {
  const provider = ganache.provider({
    logging: { quiet: true },
    wallet: { totalAccounts: 3, defaultBalance: 100 },
    chain: { chainId: 31337, hardfork: "shanghai" },
  });
  const chain = defineChain({
    id: 31337,
    name: "Audit-only local EVM",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1"] } },
  });
  const client = createPublicClient({
    chain,
    transport: custom(provider),
    cacheTime: 0,
  });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [owner, buyer, other] = await wallet.getAddresses();
  const read = (address, name, functionName, args = []) =>
    client.readContract({ address, abi: A[name].abi, functionName, args });
  const deploy = async (name, args = []) => {
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
  const write = async (
    address,
    name,
    functionName,
    args = [],
    value = 0n,
    account = owner,
  ) => {
    const hash = await wallet.writeContract({
      account,
      address,
      abi: A[name].abi,
      functionName,
      args,
      value,
      gas: 6000000n,
    });
    return client.waitForTransactionReceipt({ hash });
  };
  const ok = async (...args) => {
    const r = await write(...args);
    assert.equal(r.status, "success");
    return r;
  };
  const reverted = async (...args) => {
    const r = await write(...args);
    assert.equal(r.status, "reverted");
  };
  const launch = async (p, account = owner) => {
    const r = await ok(
      p,
      "GenesisPlatform",
      "launch",
      ["Test", "TST", parseEther("5000000"), "genesis://audit"],
      parseEther(".0001"),
      account,
    );
    return r.logs
      .map((l) => {
        try {
          return decodeEventLog({ abi: A.GenesisPlatform.abi, ...l });
        } catch {
          return null;
        }
      })
      .find((x) => x?.eventName === "TokenCreated").args.token;
  };
  try {
    for (const name of ["GenesisPlatform", "GenesisSale"])
      await t.test(
        name + " rejects nested withdrawal without double payment",
        async () => {
          const receiver = await deploy("Receiver");
          let target;
          if (name === "GenesisPlatform") {
            target = await deploy(name, [owner, receiver, parseEther(".0001")]);
            await launch(target);
          } else {
            const token = await deploy("LaunchToken", [
              "Test",
              "TST",
              parseEther("5000000"),
              owner,
            ]);
            target = await deploy(name, [owner, token, receiver, 1n]);
            await ok(token, "LaunchToken", "transfer", [
              target,
              parseEther("10"),
            ]);
            await ok(target, name, "setActive", [true]);
            await ok(target, name, "buy", [1n], 1n, buyer);
          }
          const due = await read(target, name, "proceeds", [receiver]);
          await ok(receiver, "Receiver", "configure", [target, false]);
          await ok(receiver, "Receiver", "claim");
          assert.equal(
            await read(receiver, "Receiver", "nestedSucceeded"),
            false,
          );
          assert.equal(await read(receiver, "Receiver", "received"), due);
          assert.equal(await read(target, name, "proceeds", [receiver]), 0n);
          await reverted(receiver, "Receiver", "claim");
        },
      );
    await t.test(
      "rejecting Treasury cannot block launch; failed withdrawal restores credit",
      async () => {
        const r = await deploy("Receiver");
        const p = await deploy("GenesisPlatform", [
          owner,
          r,
          parseEther(".0001"),
        ]);
        await ok(r, "Receiver", "configure", [p, true]);
        await launch(p);
        await reverted(r, "Receiver", "claim");
        assert.equal(
          await read(p, "GenesisPlatform", "proceeds", [r]),
          parseEther(".0001"),
        );
        await ok(r, "Receiver", "configure", [p, false]);
        await ok(r, "Receiver", "claim");
      },
    );
    await t.test(
      "confirmed risk: setting Treasury to platform itself permanently strands future fees",
      async () => {
        const p = await deploy("GenesisPlatform", [
          owner,
          owner,
          parseEther(".0001"),
        ]);
        await ok(p, "GenesisPlatform", "setFees", [parseEther(".0001"), p]);
        await launch(p);
        assert.equal(
          await read(p, "GenesisPlatform", "proceeds", [p]),
          parseEther(".0001"),
        );
        await reverted(p, "GenesisPlatform", "withdraw");
        await ok(p, "GenesisPlatform", "setFees", [parseEther(".0001"), owner]);
        assert.equal(
          await read(p, "GenesisPlatform", "proceeds", [p]),
          parseEther(".0001"),
        );
      },
    );
    await t.test(
      "confirmed risk: renouncing paused platform ownership prevents recovery",
      async () => {
        const p = await deploy("GenesisPlatform", [
          owner,
          owner,
          parseEther(".0001"),
        ]);
        await launch(p);
        await ok(p, "GenesisPlatform", "setPaused", [true]);
        await ok(p, "GenesisPlatform", "renounceOwnership");
        await reverted(p, "GenesisPlatform", "setPaused", [false]);
        assert.equal(
          await read(p, "GenesisPlatform", "owner"),
          "0x0000000000000000000000000000000000000000",
        );
      },
    );
    await t.test(
      "confirmed risk: renouncing inactive Sale ownership strands inventory",
      async () => {
        const token = await deploy("LaunchToken", [
          "Test",
          "TST",
          parseEther("5000000"),
          owner,
        ]);
        const sale = await deploy("GenesisSale", [owner, token, owner, 1n]);
        await ok(token, "LaunchToken", "transfer", [sale, parseEther("10")]);
        await ok(sale, "GenesisSale", "renounceOwnership");
        await reverted(sale, "GenesisSale", "setActive", [true]);
        await reverted(sale, "GenesisSale", "reclaimInventory", [
          parseEther("10"),
        ]);
        assert.equal(
          await read(token, "LaunchToken", "balanceOf", [sale]),
          parseEther("10"),
        );
      },
    );
    await t.test(
      "business property: per-transaction cap is not a per-wallet cap",
      async () => {
        const token = await deploy("LaunchToken", [
          "Test",
          "TST",
          parseEther("5000000"),
          owner,
        ]);
        const sale = await deploy("GenesisSale", [owner, token, owner, 1n]);
        await ok(token, "LaunchToken", "transfer", [
          sale,
          parseEther("3000000"),
        ]);
        await ok(sale, "GenesisSale", "setActive", [true]);
        await ok(sale, "GenesisSale", "buy", [1000000n], 1000000n, buyer);
        await ok(sale, "GenesisSale", "buy", [1000000n], 1000000n, buyer);
        assert.equal(
          await read(token, "LaunchToken", "balanceOf", [buyer]),
          parseEther("2000000"),
        );
      },
    );
    await t.test(
      "privileged trust boundary: owner can stop sale and remove inventory",
      async () => {
        const token = await deploy("LaunchToken", [
          "Test",
          "TST",
          parseEther("5000000"),
          owner,
        ]);
        const sale = await deploy("GenesisSale", [owner, token, owner, 1n]);
        await ok(token, "LaunchToken", "transfer", [sale, parseEther("10")]);
        await ok(sale, "GenesisSale", "setActive", [true]);
        await reverted(
          sale,
          "GenesisSale",
          "reclaimInventory",
          [parseEther("10")],
          0n,
          other,
        );
        await ok(sale, "GenesisSale", "setActive", [false]);
        await ok(sale, "GenesisSale", "reclaimInventory", [parseEther("10")]);
        assert.equal(await read(token, "LaunchToken", "balanceOf", [sale]), 0n);
      },
    );
  } finally {
    await provider.disconnect();
  }
});
