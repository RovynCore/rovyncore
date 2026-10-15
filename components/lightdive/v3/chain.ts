// On-chain facts about an NFT, as the NFT detail shows them. In the preview these are simulated but shaped
// exactly like the real ones (ERC-721 on Robinhood Chain); the v3 contracts will fill them for real.
import { seeded } from "@/lib/lightdive-v3/rules";
import type { SimNft } from "./sim";
import { tl } from "@/lib/lightdive-v3/i18n";

export const CHAIN_NAME = "Robinhood Chain 測試網";
export const CHAIN_ID = 46630;
export const NFT_CONTRACT = "0x5e1f7a0c9b3d2e4f6a8b0c1d2e3f4a5b6c7d8e9f"; // placeholder until the v3 NFT contract is deployed
export const PREVIEW_OWNER = "0x7e57c0de000000000000000000000000000beef";
export const STANDARD = "ERC-721（RVDIV）";
export const ROYALTY = "5%（ERC-2981，外部市場）";

const hex = (r: () => number, n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join("");

/** On-chain facts of a card as the NFT detail shows them; a value the live game cannot know yet is null. */
export type ChainFacts = {
  tokenId: number;
  contract: string;
  owner: string;
  standard: string;
  chain: string;
  mintBlock: number | null;
  mintTx: string | null;
  dna: string | null;
  deck: number | null;
  tokenUri: string | null;
  royalty: string;
  explorer: string | null;
};

export function chainOf(n: Pick<SimNft, "id" | "kind" | "rarity">): ChainFacts {
  const r = seeded(n.id * 2654435761 + n.kind * 97 + n.rarity);
  const block = 1_048_576 + n.id * 137 + Math.floor(r() * 90);
  return {
    tokenId: n.id,
    contract: NFT_CONTRACT,
    owner: PREVIEW_OWNER,
    standard: STANDARD,
    chain: tl("{0}（{1}）", { 0: CHAIN_NAME, 1: CHAIN_ID }),
    mintBlock: block,
    mintTx: `0x${hex(r, 64)}`,
    dna: `0x${hex(r, 16)}`,
    deck: 1 + Math.floor(n.id / 400),
    tokenUri: `https://rovyncore.com/api/lightdive/nft/${n.id}`,
    royalty: ROYALTY,
    explorer: null,
  };
}

export const short = (a: string, head = 6, tail = 4) => (a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a);
