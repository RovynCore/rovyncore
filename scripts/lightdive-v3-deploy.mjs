// Deploys and wires the Lightdive v3 contracts (candidate, unaudited).
//
//   npm run lightdive:v3:deploy -- --network testnet     Robinhood Chain testnet (46630), with test RVYN and its faucet
//   npm run lightdive:v3:deploy -- --network mainnet     Robinhood Chain (4663), the real RVYN; see below
//   npm run lightdive:v3:deploy -- --network local       a local chain at RPC_URL (scripts/lightdive-v3-localnet.mjs)
//
// The deployer's private key is read from DEPLOYER_PRIVATE_KEY or, when that is not set, asked for on the terminal:
// each character shows as *, then the script prints how many characters it read and the wallet address the key belongs
// to, and waits for "y" before sending anything. The key itself is never shown or written anywhere. Every step is recorded in tmp/lightdive-v3-deploy-<network>-<chainId>.json, so a
// run that stops halfway (RPC error, out of gas) continues where it stopped when started again.
//
// testnet:
//   - deploys TestRVYN (tRVYN, owner: deployer), seeds the Core Light Pool with POOL_SEED (default 1,000,000) tRVYN,
//     opens summons at once, and writes packages/web3/lightdive-v3.json, which the website reads.
//   - optional: TREASURY_ADDRESS (default: deployer).
// mainnet:
//   - needs CONFIRM_MAINNET=yes and OWNER_ADDRESS (the multisig that will own every contract), TREASURY_ADDRESS.
//   - uses RVYN_ADDRESS (default: the RVYN token on /transparency).
//   - deploys and wires everything, then proposes OWNER_ADDRESS as the owner of every contract (Ownable2Step: the
//     multisig must call acceptOwnership on each). It does NOT fund the pool and does NOT open summons: both are
//     done by the multisig when the founder decides to switch (docs/lightdive/MAINNET-SWITCH.md).
//   - writes packages/web3/lightdive-v3.mainnet.json. The website keeps using the testnet until that file is copied
//     over packages/web3/lightdive-v3.json at the switch.
import fs from "node:fs";
import readline from "node:readline";
import { createPublicClient, createWalletClient, defineChain, getAddress, http, keccak256, parseEther, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "../packages/web3/config.ts";
import { ODDS } from "../lib/lightdive-v3/odds.ts";
import { NFT_BASE_URI } from "../lib/lightdive-v3/metadata.ts";

const MAINNET_RVYN = "0x545a1ff27596de2f31480df39aa9548f363fc361";
const BEAM_KEY = ["廣域", "聚焦", "針芒"];
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive-v3/artifacts/contracts.json", "utf8"));

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const network = arg("network");
if (!["testnet", "mainnet", "local"].includes(network)) throw new Error("Pass --network testnet, --network mainnet or --network local.");
const env = (k) => process.env[k]?.trim() || undefined;

// piped input (not a terminal): one shared reader, so a later question gets the next line
let lines;
const nextLine = () => {
  if (!lines) lines = readline.createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  return lines.next().then((r) => (r.done ? "" : r.value));
};

/** Reads a secret from the terminal, showing one * per character (right-click or Ctrl+V pastes; Backspace deletes). */
function askMasked(question) {
  process.stdout.write(question);
  const stdin = process.stdin;
  if (!stdin.isTTY) return nextLine().then((line) => { process.stdout.write("\n"); return line; });
  return new Promise((resolve) => {
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk.replace(/\x1b\[20[01]~/g, "")) {
        if (ch === "\r" || ch === "\n") { if (value) return done(); continue; }
        if (ch === "\u0003") { process.stdout.write("\n"); process.exit(1); } // Ctrl+C
        if (ch === "\u0016") continue; // a literal Ctrl+V when the console does not paste
        if (ch === "\b" || ch === "\u007f") {
          if (value) { value = value.slice(0, -1); process.stdout.write("\b \b"); }
          continue;
        }
        if (ch < " ") continue;
        value += ch;
        process.stdout.write("*");
      }
    };
    stdin.on("data", onData);
  });
}

function askLine(question) {
  if (!process.stdin.isTTY) { process.stdout.write(question); return nextLine().then((a) => { process.stdout.write("\n"); return a.trim(); }); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

let key = env("DEPLOYER_PRIVATE_KEY");
const asked = !key;
if (!key) key = await askMasked("Deployer private key (paste with right-click, shown as *): ");
// a paste can bring spaces, line breaks, quotes or terminal paste markers along: keep only what a key is made of
key = key.replace(/\x1b\[20[01]~/g, "").replace(/[^0-9a-fA-Fx]/g, "");
if (/^[0-9a-fA-F]{64}$/.test(key)) key = `0x${key}`; // MetaMask exports the key without 0x
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  const n = key.replace(/^0x/, "").length;
  const hint = n === 0 ? "nothing was pasted" : n === 40 ? "that looks like a wallet address, not its private key" : `got ${n} characters`;
  throw new Error(`The private key must be 64 hex characters (with or without 0x): ${hint}.`);
}
const account = privateKeyToAccount(key);
key = undefined;
if (asked) {
  console.log("Read 64 hex characters. This key belongs to the wallet:");
  console.log(`  ${account.address}`);
  if (!/^y(es)?$/i.test(await askLine("Is this your deployer wallet? Deploy from it? (y/n) "))) {
    console.log("Stopped. Nothing was sent.");
    process.exit(1);
  }
}

let chain;
if (network === "local") {
  const url = env("RPC_URL") || "http://127.0.0.1:8546";
  const id = await createPublicClient({ transport: http(url) }).getChainId();
  chain = defineChain({ id, name: "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [url] } } });
} else {
  chain = CHAINS[network === "testnet" ? 46630 : 4663];
}
const transport = http(env("RPC_URL") || chain.rpcUrls.default.http[0]);
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, transport, account });
if ((await client.getChainId()) !== chain.id) throw new Error(`The RPC is not chain ${chain.id}.`);

const mainnet = network === "mainnet";
let owner = account.address;
if (mainnet) {
  if (env("CONFIRM_MAINNET") !== "yes") throw new Error("Mainnet: set CONFIRM_MAINNET=yes. The contracts are not audited.");
  if (!env("OWNER_ADDRESS") || !env("TREASURY_ADDRESS")) throw new Error("Mainnet: set OWNER_ADDRESS (the multisig) and TREASURY_ADDRESS.");
  owner = getAddress(env("OWNER_ADDRESS"));
  if (owner === account.address) throw new Error("Mainnet: OWNER_ADDRESS must be the multisig, not the deployer.");
}
const treasury = getAddress(env("TREASURY_ADDRESS") || account.address);
const seed = parseEther(env("POOL_SEED") || "1000000");

// ------------------------------------------------------------------ resumable steps
fs.mkdirSync("tmp", { recursive: true });
const progressFile = `tmp/lightdive-v3-deploy-${network}-${chain.id}.json`;
const P = fs.existsSync(progressFile) ? JSON.parse(fs.readFileSync(progressFile, "utf8")) : { deployer: account.address, steps: {} };
if (P.deployer !== account.address) throw new Error(`${progressFile} belongs to another deployer (${P.deployer}). Move it away to start over.`);
// resume only a run of the same contract code: a record from older contracts would mix old and new addresses
const codeHash = keccak256(toBytes(Object.keys(A).sort().map((n) => A[n].bytecode).join("")));
if (Object.keys(P.steps).length && P.codeHash !== codeHash) {
  throw new Error(`${progressFile} was made with different contract code. Move it away (keep it as a record) to deploy the new contracts.`);
}
P.codeHash = codeHash;
const save = () => fs.writeFileSync(progressFile, `${JSON.stringify(P, null, 2)}\n`);
P.startBlock ??= Number(await client.getBlockNumber());
save();

console.log(`Lightdive v3 -> ${chain.name} (${chain.id}); deployer ${account.address}`);
console.log(`Balance: ${Number(await client.getBalance({ address: account.address })) / 1e18} ETH`);

async function step(name, run) {
  if (P.steps[name] !== undefined) return P.steps[name];
  const value = await run();
  P.steps[name] = value ?? true;
  save();
  console.log(`  ${name.padEnd(28)} ${typeof value === "string" ? value : "ok"}`);
  return P.steps[name];
}
const deploy = (name, args) =>
  step(`deploy ${name}`, async () => {
    const hash = await wallet.deployContract({ abi: A[name].abi, bytecode: A[name].bytecode, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${name} deployment failed: ${hash}`);
    return receipt.contractAddress;
  });
const call = (label, address, name, functionName, args = []) =>
  step(label, async () => {
    const hash = await wallet.writeContract({ address, abi: A[name].abi, functionName, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} failed: ${hash}`);
  });

// ------------------------------------------------------------------ deploy
const me = account.address; // owns everything while wiring; mainnet hands over to the multisig at the end
const rvyn = mainnet ? getAddress(env("RVYN_ADDRESS") || MAINNET_RVYN) : await deploy("TestRVYN", [me]);
const rng = await deploy("DrandEvmnetRandomness", []);
const config = await deploy("LightdiveConfig3", [me]);
const nft = await deploy("LightdiveNFT3", [me, treasury]);
const pool = await deploy("CoreLightPool3", [me, rvyn]);
const minter = await deploy("LightdiveMinter3", [me, rvyn, nft, rng, pool, treasury]);
const expedition = await deploy("Expedition3", [me, nft, config, rng, pool, minter]);
const market = await deploy("LightdiveMarket3", [me, rvyn, nft, config, pool, minter]);
const commissions = await deploy("LightdiveCommissions3", [me, expedition, config]);

for (let c = 0; c < 6; c++) {
  for (let b = 0; b < 3; b++) {
    const tiers = ODDS[`${c + 1}${BEAM_KEY[b]}`].map(([probBp, lo, hi]) => ({ probBp, lo, hi }));
    await call(`odds table ${c + 1}/${BEAM_KEY[b]}`, config, "LightdiveConfig3", "setTable", [c, b, tiers]);
  }
}
await call("nft.setMinter", nft, "LightdiveNFT3", "setMinter", [minter]);
await call("nft.setGame", nft, "LightdiveNFT3", "setGame", [expedition]);
await call("pool.setExpedition", pool, "CoreLightPool3", "setExpedition", [expedition]);
await call("expedition.setCommissions", expedition, "Expedition3", "setCommissions", [commissions]);
await call("nft.setBaseURI", nft, "LightdiveNFT3", "setBaseURI", [NFT_BASE_URI]); // 卡片資料 (lib/lightdive-v3/metadata.ts)

if (!mainnet) {
  await call("tRVYN mint pool seed", rvyn, "TestRVYN", "mint", [me, seed]);
  await call("tRVYN approve pool", rvyn, "TestRVYN", "approve", [pool, seed]);
  await call("pool.fund", pool, "CoreLightPool3", "fund", [seed]);
  await call("minter.openSale", minter, "LightdiveMinter3", "openSale", [0n]);
} else {
  for (const [label, address, name] of [
    ["config", config, "LightdiveConfig3"], ["nft", nft, "LightdiveNFT3"], ["pool", pool, "CoreLightPool3"],
    ["minter", minter, "LightdiveMinter3"], ["expedition", expedition, "Expedition3"], ["market", market, "LightdiveMarket3"],
    ["commissions", commissions, "LightdiveCommissions3"],
  ]) await call(`${label}.transferOwnership`, address, name, "transferOwnership", [owner]);
}

const out = {
  chainId: chain.id,
  deploymentBlock: P.startBlock,
  testToken: !mainnet,
  rvyn, rng, config, nft, pool, minter, expedition, market, commissions,
};
const target = mainnet ? "packages/web3/lightdive-v3.mainnet.json" : network === "local" ? "tmp/lightdive-v3-local.json" : "packages/web3/lightdive-v3.json";
fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`\nWrote ${target}.`);
if (mainnet) {
  console.log(`Next, from the multisig ${owner}: acceptOwnership on config, nft, pool, minter, expedition, market and commissions.`);
  console.log("Summons stay closed and the pool is empty until the switch (docs/lightdive/MAINNET-SWITCH.md).");
} else {
  console.log("Summons are open. Send the file to Claude (or commit it) so the website points at this deployment.");
}
