import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain } from "viem";

// Real drand evmnet rounds must verify on chain; anything else must not. Run after
// `node scripts/compile-contracts-lightdive-v3.mjs`.
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive-v3/artifacts/contracts.json", "utf8"));
const DATA = JSON.parse(fs.readFileSync("tests/data/drand-evmnet.json", "utf8"));

async function probe() {
  const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 1, defaultBalance: 100 }, chain: { chainId: 31337, hardfork: "shanghai" } });
  const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
  const client = createPublicClient({ chain, transport: custom(provider) });
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const [account] = await wallet.getAddresses();
  const hash = await wallet.deployContract({ account, abi: A.DrandProbe.abi, bytecode: A.DrandProbe.bytecode, gas: 8_000_000n });
  const address = (await client.waitForTransactionReceipt({ hash })).contractAddress;
  const read = (fn, args) => client.readContract({ address, abi: A.DrandProbe.abi, functionName: fn, args });
  return { provider, client, wallet, account, address, read };
}

test("drand evmnet: real rounds verify and give sha256(signature)", async () => {
  const p = await probe();
  try {
    for (const { round, signature } of DATA.rounds) {
      const got = await p.read("check", [BigInt(round), `0x${signature}`]);
      const want = `0x${crypto.createHash("sha256").update(Buffer.from(signature, "hex")).digest("hex")}`;
      assert.equal(got, want, `round ${round}`);
    }
    // gas for one verification inside a transaction
    const { round, signature } = DATA.rounds[1];
    const hash = await p.wallet.writeContract({ account: p.account, address: p.address, abi: A.DrandProbe.abi, functionName: "store", args: [BigInt(round), `0x${signature}`], gas: 2_000_000n });
    const receipt = await p.client.waitForTransactionReceipt({ hash });
    assert.equal(receipt.status, "success");
    console.log(`  one verification in a transaction: ${receipt.gasUsed} gas`);
  } finally {
    await p.provider.disconnect();
  }
});

test("drand evmnet: wrong round, altered or malformed signatures are refused", async () => {
  const p = await probe();
  try {
    const [a, b] = DATA.rounds;
    await assert.rejects(p.read("check", [BigInt(b.round), `0x${a.signature}`]), "a signature for another round");
    const flipped = a.signature.slice(0, 127) + (a.signature[127] === "0" ? "1" : "0");
    await assert.rejects(p.read("check", [BigInt(a.round), `0x${flipped}`]), "an altered signature");
    await assert.rejects(p.read("check", [BigInt(a.round), `0x${a.signature.slice(0, 126)}`]), "63 bytes");
    await assert.rejects(p.read("check", [BigInt(a.round), `0x${"00".repeat(64)}`]), "the zero point");
  } finally {
    await p.provider.disconnect();
  }
});

test("drand evmnet: round timing matches drand's schedule", async () => {
  const p = await probe();
  try {
    const g = DATA.info.genesis_time;
    assert.equal(await p.read("roundTime", [1n]), BigInt(g));
    assert.equal(await p.read("roundTime", [1000n]), BigInt(g + 999 * 3));
    assert.equal(await p.read("roundAt", [BigInt(g)]), 1n);
    assert.equal(await p.read("roundAt", [BigInt(g + 1)]), 2n, "the next round still to come");
    assert.equal(await p.read("roundAt", [BigInt(g + 3)]), 2n);
    assert.equal(await p.read("roundAt", [BigInt(g + 4)]), 3n);
  } finally {
    await p.provider.disconnect();
  }
});
