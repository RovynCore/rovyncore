// Which Lightdive v3 deployment the site plays on. packages/web3/lightdive-v3.json is written by
// scripts/lightdive-v3-deploy.mjs (testnet now; at the mainnet switch the mainnet file replaces it).
import { defineChain, type Chain } from "viem";
import deployment from "@/packages/web3/lightdive-v3.json";
import abis from "@/packages/web3/lightdive-v3-abi.json";
import { CHAINS } from "@/packages/web3/config";
import { MULTICALL3, contractsOf, type Abis3, type Contracts3, type Deployment3 } from "./onchain";

/**
 * Local development only: on localhost a deployment printed by scripts/lightdive-v3-localnet.mjs can be put in
 * localStorage ("lightdive:v3:local-deployment") so the game runs against a local chain. Any other host always uses
 * the committed file.
 */
function localOverride(): Deployment3 | null {
  if (typeof window === "undefined" || !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return null;
  try {
    const raw = window.localStorage.getItem("lightdive:v3:local-deployment");
    return raw ? (JSON.parse(raw) as Deployment3) : null;
  } catch {
    return null;
  }
}

export type GameChain = {
  deployment: Deployment3;
  contracts: Contracts3 | null;
  chain: Chain;
  rpcUrl: string;
  testnet: boolean;
  testToken: boolean;
  multicall?: `0x${string}`;
  explorer: string;
  abi: Abis3;
};

let cached: GameChain | null = null;
/** The deployment the site plays on. `local` (browser only) lets a localhost override in; leave it off for the first
 *  render so the server and the browser agree. */
export function gameChain(local = false): GameChain {
  if (local && cached && typeof window !== "undefined") return cached;
  return build(local ? localOverride() : null);
}

function build(local: Deployment3 | null): GameChain {
  const d = local ?? (deployment as Deployment3);
  const known = CHAINS[d.chainId as keyof typeof CHAINS];
  const rpcUrl = d.rpcUrl || known?.rpcUrls.default.http[0] || "";
  const chain = local?.rpcUrl
    ? defineChain({ ...(known ?? {}), id: d.chainId, name: known?.name ?? "Local", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } })
    : known;
  const out: GameChain = {
    deployment: d,
    contracts: contractsOf(d),
    chain,
    rpcUrl,
    testnet: d.chainId !== 4663,
    testToken: d.testToken !== false && d.chainId !== 4663,
    multicall: local ? undefined : MULTICALL3,
    explorer: local ? "" : (known?.blockExplorers?.default.url ?? ""),
    abi: abis as unknown as Abis3,
  };
  if (local && typeof window !== "undefined") cached = out;
  return out;
}
