import { defineChain, getAddress, type Address } from "viem";
export const OWNER = getAddress("0xee4c435b9207ba5bb5f4860156409ae78032ff6e");
export const CHAINS = {
  46630: defineChain({
    id: 46630,
    name: "Robinhood Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.testnet.chain.robinhood.com"] } },
    blockExplorers: {
      default: {
        name: "Explorer",
        url: "https://explorer.testnet.chain.robinhood.com",
      },
    },
    testnet: true,
  }),
  4663: defineChain({
    id: 4663,
    name: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
    blockExplorers: {
      default: {
        name: "Blockscout",
        url: "https://robinhoodchain.blockscout.com",
      },
    },
  }),
};
export type ChainId = keyof typeof CHAINS;
export type PlatformConfig = {
  brand: string;
  chainId: ChainId;
  treasury: Address;
  platform: Address | null;
  deploymentBlock: number;
  genesis: Address | null;
  sale: Address | null;
  /** Active contract generation. V2 is the RVYN-compatible deployment. */
  platformVersion?: 1 | 2;
  /** Previous V1 platform retained for historical indexing/compatibility. */
  legacyPlatform?: Address | null;
  /** Sale contract generation: V1 legacy, V2/V3 historical, V4 allowlist, V5 tokenomics-complete candidate. */
  presaleVersion?: 1 | 2 | 3 | 4 | 5;
  maintenance: boolean;
  launchFee: string;
  plans: {
    id: number;
    name: string;
    price: string;
    duration: number;
    units: number;
    enabled: boolean;
  }[];
  salePrice: string;
  socialX: string;
  socialTelegram: string;
};
export const DEFAULT_CONFIG: PlatformConfig = {
  brand: "ROVYN CORE",
  chainId: 4663,
  treasury: OWNER,
  platform: null,
  deploymentBlock: 0,
  genesis: null,
  sale: null,
  maintenance: false,
  launchFee: "0.0001",
  plans: [
    {
      id: 0,
      name: "Spark",
      price: "0.0002",
      duration: 86400,
      units: 10,
      enabled: true,
    },
    {
      id: 1,
      name: "Ignite",
      price: "0.0008",
      duration: 86400,
      units: 50,
      enabled: true,
    },
    {
      id: 2,
      name: "Supernova",
      price: "0.0015",
      duration: 86400,
      units: 100,
      enabled: true,
    },
  ],
  salePrice: "0.0001",
  socialX: "https://x.com/RovynCORE",
  socialTelegram: "",
};
export function shortAddress(v: string) {
  return `${v.slice(0, 6)}…${v.slice(-4)}`;
}
