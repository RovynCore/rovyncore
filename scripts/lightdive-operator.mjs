// Lightdive randomness operator: keeps hourly seed commitments ahead of time and reveals past hours.
// Mints and dives are only accepted in hours that already have a commitment, so this must run
// continuously (e.g. every 10 minutes from cron, or with --watch).
//
//   OPERATOR_PRIVATE_KEY=0x... LIGHTDIVE_SEED_SECRET=0x<64 hex> npm run lightdive:operator [-- --watch]
//
// Seeds are derived as keccak256(secret, hour), so the operator keeps no state besides the secret.
// Keep the secret private until each hour is over: anyone holding it can predict results.
// The operator wallet must never mint or dive.
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, encodeAbiParameters } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "../packages/web3/config.ts";

const LOOKAHEAD_HOURS = 48;
const REVEAL_LOOKBACK_HOURS = 72;
const deployment = JSON.parse(fs.readFileSync("packages/web3/lightdive.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("packages/web3/lightdive-abi.json", "utf8")).RandomnessBeacon;
if (!deployment.beacon) throw new Error("packages/web3/lightdive.json has no beacon address. Deploy first.");

const key = process.env.OPERATOR_PRIVATE_KEY;
const secret = process.env.LIGHTDIVE_SEED_SECRET;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set OPERATOR_PRIVATE_KEY.");
if (!secret || !/^0x[0-9a-fA-F]{64}$/.test(secret)) throw new Error("Set LIGHTDIVE_SEED_SECRET (0x + 64 hex, random).");

const chain = CHAINS[deployment.chainId];
const transport = http(process.env.RPC_URL || chain.rpcUrls.default.http[0]);
const account = privateKeyToAccount(key);
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, transport, account });
const beacon = deployment.beacon;

const seedFor = (hour) => keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint64" }], [secret, BigInt(hour)]));
const commitmentOf = (seed) => keccak256(encodeAbiParameters([{ type: "bytes32" }], [seed]));
const read = (functionName, args = []) => client.readContract({ address: beacon, abi, functionName, args });
const write = async (functionName, args) => {
  const hash = await wallet.writeContract({ address: beacon, abi, functionName, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} failed: ${hash}`);
  return hash;
};

async function tick() {
  const now = Number(await read("currentHour"));
  // Reveal every finished hour we committed that is still unrevealed.
  for (let hour = now - REVEAL_LOOKBACK_HOURS; hour < now; hour++) {
    const commitment = await read("commitment", [BigInt(hour)]);
    if (commitment === `0x${"0".repeat(64)}`) continue;
    if (await read("revealed", [BigInt(hour)])) continue;
    const seed = seedFor(hour);
    if (commitmentOf(seed) !== commitment) {
      console.warn(`hour ${hour}: commitment was not made with this secret; skipping`);
      continue;
    }
    await write("reveal", [BigInt(hour), seed]);
    console.log(`revealed hour ${hour}`);
  }
  // Commit the next LOOKAHEAD_HOURS, in one batch starting at the first missing hour.
  let start = now + 1;
  while (start <= now + LOOKAHEAD_HOURS && (await read("hasCommitment", [BigInt(start)]))) start++;
  if (start <= now + LOOKAHEAD_HOURS) {
    const hashes = [];
    for (let hour = start; hour <= now + LOOKAHEAD_HOURS; hour++) {
      if (await read("hasCommitment", [BigInt(hour)])) break;
      hashes.push(commitmentOf(seedFor(hour)));
    }
    await write("commit", [BigInt(start), hashes]);
    console.log(`committed hours ${start}..${start + hashes.length - 1}`);
  }
}

await tick();
if (process.argv.includes("--watch")) {
  setInterval(() => tick().catch((error) => console.error(error.message)), 5 * 60 * 1000);
}
