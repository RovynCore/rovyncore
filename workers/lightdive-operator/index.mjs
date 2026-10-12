// Lightdive randomness operator as a Cloudflare Worker: runs scripts/lightdive-operator-core.mjs
// once a minute from a cron trigger. Kept separate from the site's Worker so the operator key never
// sits next to the site.
//
// Secrets (wrangler secret put): OPERATOR_PRIVATE_KEY, LIGHTDIVE_SEED_SECRET. Optional: RPC_URL.
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "../../packages/web3/config.ts";
import deployment from "../../packages/web3/lightdive.json";
import abis from "../../packages/web3/lightdive-abi.json";
import { tick } from "../../scripts/lightdive-operator-core.mjs";

async function run(env) {
  const chain = CHAINS[deployment.chainId];
  const transport = http(env.RPC_URL || chain.rpcUrls.default.http[0]);
  const client = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ chain, transport, account: privateKeyToAccount(env.OPERATOR_PRIVATE_KEY) });
  return tick({ client, wallet, deployment, abi: abis.RandomnessBeacon, secret: env.LIGHTDIVE_SEED_SECRET });
}

const worker = {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(run(env).then((done) => done.forEach((line) => console.log(line))));
  },
  // A plain GET reports liveness only; it never triggers a run.
  async fetch() {
    return new Response("lightdive operator\n", { headers: { "content-type": "text/plain" } });
  },
};

export default worker;
