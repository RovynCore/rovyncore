// Deploys and wires the Lightdive contracts (candidate, unaudited) to Robinhood Chain testnet.
//
//   npm run contracts:compile:lightdive
//   DEPLOYER_PRIVATE_KEY=0x... OPERATOR_ADDRESS=0x... npm run lightdive:deploy
//
// Optional environment:
//   RVYN_ADDRESS       existing RVYN-compatible ERC20Burnable on the target chain. If unset, a test
//                      token "tRVYN" (10,000,000, all to the deployer) is deployed first.
//   TREASURY_ADDRESS   receives the treasury share and royalties (default: deployer)
//   POOL_SEED          RVYN to put in the Core Light Pool, in whole tokens (default: 1000000)
//   RPC_URL            override the chain's default RPC
//
// The private key is read from the environment only and never written anywhere. Mainnet (4663) is
// refused: the contracts are not audited, and mainnet ownership must sit with a multisig + timelock.
import fs from "node:fs";
import { createPublicClient, createWalletClient, http, parseEther, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAINS } from "../packages/web3/config.ts";

const CHAIN_ID = 46630;
const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive/artifacts/contracts.json", "utf8"));
A.LaunchToken = JSON.parse(fs.readFileSync("packages/contracts/v2/artifacts/contracts.json", "utf8")).LaunchToken;

const key = process.env.DEPLOYER_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Set DEPLOYER_PRIVATE_KEY (0x + 64 hex) in the environment.");
if (!process.env.OPERATOR_ADDRESS) throw new Error("Set OPERATOR_ADDRESS: the wallet that runs scripts/lightdive-operator.mjs. Use a different wallet from the deployer and never play with it.");

const chain = CHAINS[CHAIN_ID];
const transport = http(process.env.RPC_URL || chain.rpcUrls.default.http[0]);
const account = privateKeyToAccount(key);
const client = createPublicClient({ chain, transport });
const wallet = createWalletClient({ chain, transport, account });
if ((await client.getChainId()) !== CHAIN_ID) throw new Error(`RPC is not chain ${CHAIN_ID}.`);

const operator = getAddress(process.env.OPERATOR_ADDRESS);
const treasury = getAddress(process.env.TREASURY_ADDRESS || account.address);
const seed = parseEther(process.env.POOL_SEED || "1000000");
const startBlock = await client.getBlockNumber();
console.log(`Deployer ${account.address} on chain ${CHAIN_ID}, starting at block ${startBlock}`);

async function deploy(name, args) {
  const hash = await wallet.deployContract({ abi: A[name].abi, bytecode: A[name].bytecode, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name} deployment failed: ${hash}`);
  console.log(`${name.padEnd(18)} ${receipt.contractAddress}`);
  return receipt.contractAddress;
}
async function call(address, name, functionName, args = []) {
  const hash = await wallet.writeContract({ address, abi: A[name].abi, functionName, args });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${name}.${functionName} failed: ${hash}`);
}

const rvyn = process.env.RVYN_ADDRESS
  ? getAddress(process.env.RVYN_ADDRESS)
  : await deploy("LaunchToken", ["RovynCore Test", "tRVYN", parseEther("10000000"), account.address]);
const config = await deploy("LightdiveConfig", [account.address]);
const nft = await deploy("LightdiveNFT", [account.address, treasury]);
const beacon = await deploy("RandomnessBeacon", [account.address, operator]);
const pool = await deploy("CoreLightPool", [account.address, rvyn, config]);
const minter = await deploy("LightdiveMinter", [account.address, rvyn, nft, config, beacon, pool, treasury]);
const expedition = await deploy("Expedition", [account.address, nft, config, beacon, pool]);

await call(nft, "LightdiveNFT", "setMinter", [minter]);
await call(nft, "LightdiveNFT", "setGame", [expedition]);
await call(pool, "CoreLightPool", "setExpedition", [expedition]);
const balance = await client.readContract({ address: rvyn, abi: A.LaunchToken.abi, functionName: "balanceOf", args: [account.address] });
if (balance >= seed && seed > 0n) {
  await call(rvyn, "LaunchToken", "approve", [pool, seed]);
  await call(pool, "CoreLightPool", "fund", [seed]);
  console.log(`Core Light Pool funded with ${seed / 10n ** 18n} RVYN`);
} else {
  console.log("Deployer does not hold POOL_SEED RVYN: fund the pool later with CoreLightPool.fund().");
}

const out = { chainId: CHAIN_ID, deploymentBlock: Number(startBlock), rvyn, config, nft, beacon, pool, minter, expedition };
fs.writeFileSync("packages/web3/lightdive.json", `${JSON.stringify(out, null, 2)}\n`);
console.log("Wrote packages/web3/lightdive.json. Next: start scripts/lightdive-operator.mjs, then open the spire sale from /admin/lightdive.");
