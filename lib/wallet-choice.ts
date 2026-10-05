import type { BrowserWallet } from "@/lib/wallet-client";

export type WalletBrand =
  | "metamask"
  | "phantom"
  | "coinbase"
  | "rabby"
  | "brave"
  | "other";

export type WalletChoice = {
  id: string;
  name: string;
  provider: BrowserWallet;
  rdns?: string;
  brand?: WalletBrand;
  icon?: string;
  isMetaMask: boolean;
};

export const COMMON_WALLETS: ReadonlyArray<{
  brand: Exclude<WalletBrand, "other">;
  name: string;
  downloadUrl: string;
  iconUrl: string;
}> = [
  {
    brand: "metamask",
    name: "MetaMask",
    downloadUrl: "https://metamask.io/download/",
    iconUrl: "https://metamask.io/favicons/default/favicon.svg",
  },
  {
    brand: "phantom",
    name: "Phantom",
    downloadUrl: "https://phantom.com/download",
    iconUrl: "https://phantom.com/_web_platform_assets/favicon.svg",
  },
  {
    brand: "coinbase",
    name: "Coinbase Wallet",
    downloadUrl: "https://wallet.coinbase.com/",
    iconUrl: "https://wallet.coinbase.com/static-open-graph/v1/favicon.png",
  },
  {
    brand: "rabby",
    name: "Rabby Wallet",
    downloadUrl: "https://rabby.io/",
    iconUrl: "https://rabby.io/assets/images/favicon.png",
  },
  {
    brand: "brave",
    name: "Brave Wallet",
    downloadUrl: "https://brave.com/wallet/",
    iconUrl: "https://brave.com/static-assets/images/cropped-brave_appicon_release-192x192.png",
  },
];

const BRAND_BY_RDNS: ReadonlyArray<readonly [string, WalletBrand]> = [
  ["io.metamask", "metamask"],
  ["app.phantom", "phantom"],
  ["com.phantom", "phantom"],
  ["com.coinbase.wallet", "coinbase"],
  ["com.base.account", "coinbase"],
  ["io.rabby", "rabby"],
  ["com.brave.wallet", "brave"],
];

export function identifyWalletBrand(
  rdns: string | undefined,
  provider: BrowserWallet,
): WalletBrand {
  const domain = rdns?.trim().toLowerCase();
  const announcedBrand = BRAND_BY_RDNS.find(([known]) => known === domain)?.[1];
  if (announcedBrand) return announcedBrand;
  if (provider.isBraveWallet) return "brave";
  if (provider.isRabby) return "rabby";
  if (provider.isCoinbaseWallet) return "coinbase";
  if (provider.isPhantom) return "phantom";
  // Some EVM wallets intentionally expose this compatibility flag. Only use
  // it after ruling out their own identifiers; an EIP-6963 rdns takes priority.
  if (provider.isMetaMask) return "metamask";
  return "other";
}

// Wallets can announce more than once (EIP-6963 and the legacy injected API).
// Keep a stable option per provider/brand and prefer the richer EIP metadata.
export function mergeWalletChoice(
  choices: WalletChoice[],
  incoming: WalletChoice,
): WalletChoice[] {
  const sameProvider = choices.findIndex(
    (choice) => choice.provider === incoming.provider,
  );
  const sameBrand = incoming.brand && incoming.brand !== "other"
    ? choices.findIndex(
        (choice) =>
          choice.brand === incoming.brand &&
          (!choice.rdns || !incoming.rdns),
      )
    : -1;
  const index = sameProvider >= 0 ? sameProvider : sameBrand;
  if (index < 0) return [...choices, incoming];
  const current = choices[index];
  const merged: WalletChoice = {
    ...current,
    ...incoming,
    id: current.id,
    provider: incoming.provider,
    name: incoming.brand && incoming.brand !== "other"
      ? COMMON_WALLETS.find((wallet) => wallet.brand === incoming.brand)?.name || incoming.name
      : incoming.name || current.name,
    icon: incoming.icon || current.icon,
    rdns: incoming.rdns || current.rdns,
    brand: incoming.brand === "other" ? current.brand || incoming.brand : incoming.brand || current.brand,
    isMetaMask: incoming.brand === "metamask" || (incoming.brand == null && current.isMetaMask),
  };
  return choices.map((choice, i) => (i === index ? merged : choice));
}

// Avoid provider load order being treated as a brand choice. Preserve explicit
// user selection, otherwise use a deterministic default if MetaMask is present.
export function preferredWallet(
  choices: WalletChoice[],
  selected: string,
): WalletChoice | undefined {
  return (
    choices.find((choice) => choice.id === selected) ||
    choices.find((choice) => choice.brand === "metamask" || choice.isMetaMask) ||
    choices[0]
  );
}
