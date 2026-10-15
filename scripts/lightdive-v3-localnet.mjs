// Local development chain for the Lightdive v3 game. Nothing here touches a real network.
//
//   node scripts/compile-contracts-lightdive-v3.mjs
//   node scripts/lightdive-v3-localnet.mjs          # ganache on http://127.0.0.1:8546, chain id 46630
//
// Deploys the v3 system with scripts/lightdive-v3-deploy.mjs (--network local) from ganache's first deterministic
// development account, with the real drand evmnet verifier: ganache follows the wall clock, so real drand rounds
// reveal dives and summons exactly as on the testnet. Prints the deployment JSON to put in localStorage
// "lightdive:v3:local-deployment" on http://localhost (see lib/lightdive-v3/chain.ts). Ganache's other accounts hold
// 1000 ETH each; use one as a test wallet.
import fs from "node:fs";
import { spawn } from "node:child_process";
import ganache from "ganache";

const PORT = Number(process.env.LOCALNET_PORT || 8546);
const server = ganache.server({
  logging: { quiet: true },
  wallet: { totalAccounts: 6, defaultBalance: 1000, deterministic: true },
  chain: { chainId: 46630, hardfork: "shanghai" },
  miner: { blockGasLimit: 30_000_000 },
});
await new Promise((resolve, reject) => server.listen(PORT, "127.0.0.1", (e) => (e ? reject(e) : resolve())));
const rpc = `http://127.0.0.1:${PORT}`;
const accounts = server.provider.getInitialAccounts();
const [deployer, ...players] = Object.entries(accounts);

fs.rmSync("tmp/lightdive-v3-deploy-local-46630.json", { force: true }); // a fresh chain every run
// Async: ganache answers on this process's event loop, so the deploy must not block it.
const status = await new Promise((resolve) => {
  const child = spawn(process.execPath, ["--experimental-strip-types", "scripts/lightdive-v3-deploy.mjs", "--network", "local"], {
    stdio: "inherit",
    env: { ...process.env, RPC_URL: rpc, DEPLOYER_PRIVATE_KEY: deployer[1].secretKey, POOL_SEED: "1000000" },
  });
  child.on("exit", resolve);
});
if (status !== 0) process.exit(status ?? 1);
const out = JSON.parse(fs.readFileSync("tmp/lightdive-v3-local.json", "utf8"));
console.log(`\nLocalnet at ${rpc}. Deployment (localStorage "lightdive:v3:local-deployment"):`);
console.log(JSON.stringify({ ...out, rpcUrl: rpc }));
console.log("\nTest wallets (ganache deterministic, local only):");
for (const [address] of players) console.log(`  ${address}`);
// A block every 2 seconds, like a live chain, so block.timestamp keeps up with the wall clock while nobody plays.
setInterval(() => void server.provider.request({ method: "evm_mine", params: [] }), 2000);
console.log("\nCtrl+C to stop.");
