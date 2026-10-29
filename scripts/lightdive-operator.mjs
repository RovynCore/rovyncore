// RETIRED 2026-10-30: the Lightdive v1 randomness operator. v3 uses drand with no operator; kept for history only.
// Lightdive randomness operator (CLI). Commits one hash chain per UTC day ahead of time and reveals
// the finished one-minute slots that mints and dives are waiting for. Mints and dives are only
// accepted in slots whose day already has a commitment, so something must run this regularly:
// the Cloudflare Worker in workers/lightdive-operator every minute, with the GitHub workflow as a
// backup. For local use:
//
//   OPERATOR_PRIVATE_KEY=0x... LIGHTDIVE_SEED_SECRET=0x<64 hex> npm run lightdive:operator [-- --watch]
//
// Seeds derive from the secret and the day, so the operator keeps no state besides the secret.
// Keep the secret private: anyone holding it can predict results. The operator wallet must never
// mint or dive.
import fs from "node:fs";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "../packages/web3/config.ts";
import { tick } from "./lightdive-operator-core.mjs";

const deployment = JSON.parse(fs.readFileSync("packages/web3/lightdive.json", "utf8"));
const abi = JSON.parse(fs.readFileSync("packages/web3/lightdive-abi.json", "utf8")).RandomnessBeacon;
if (!deployment.beacon) throw new Error("packages/web3/lightdive.json has no beacon address. Deploy first.");

const key = process.env.OPERATOR_PRIVATE_KEY;
const secret = process.env.LIGHTDIVE_SEED_SECRET;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set OPERATOR_PRIVATE_KEY.");
if (!secret || !/^0x[0-9a-fA-F]{64}$/.test(secret)) throw new Error("Set LIGHTDIVE_SEED_SECRET (0x + 64 hex, random).");

const chain = CHAINS[deployment.chainId];
const transport = http(process.env.RPC_URL || chain.rpcUrls.default.http[0]);
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, transport, account: privateKeyToAccount(key) });
// The backup run looks further back, in case the minute-by-minute runner was down.
const lookbackBlocks = BigInt(process.env.LOOKBACK_BLOCKS || "99000");

const run = async () => {
  for (const line of await tick({ client, wallet, deployment, abi, secret, lookbackBlocks })) console.log(line);
};
await run();
if (process.argv.includes("--watch")) {
  setInterval(() => run().catch((error) => console.error(error.message)), 60 * 1000);
}
