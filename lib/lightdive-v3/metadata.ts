// 卡片資料 (10-23): what wallets, block explorers and marketplaces show for a Lightdive card. LightdiveNFT3.tokenURI is
// baseURI + id, and the baseURI points at /api/lightdive/nft/ on the site, which answers with this JSON (the common
// ERC-721 metadata shape: name, description, image, attributes). Everything is read from the chain at request time;
// a sealed card (its summon not revealed on chain yet) shows the card back. Relative imports only.
import type { Attributes3 } from "./onchain.ts";

export const SITE = "https://www.rovyncore.com";
export const NFT_BASE_URI = `${SITE}/api/lightdive/nft/`;

const KIND = ["Spire", "Resonance Prism", "Seeker"];
const KIND_ZH = ["光塔", "共鳴稜鏡", "探索者"];
const KIND_FILE = ["spire", "prism", "seeker"];
const RARITY = ["Glimmer", "Vein", "Crystal", "Prismatic", "Corestar"];
const BEAM = ["Wide", "Focused", "Pinpoint"];
const LIGHT = ["Dawnlight", "Mistlight", "Crystallight", "Blazelight", "Stormlight", "Abysslight"];
const SEALED = 255;

/** The card's art on the site (the same images the game shows). */
export function cardImage(a: Pick<Attributes3, "kind" | "rarity" | "trait">) {
  if (a.rarity === SEALED || a.rarity > 4) return `${SITE}/lightdive/back/${KIND_FILE[a.kind] ?? "spire"}.webp`;
  if (a.kind === 0) return `${SITE}/lightdive/cards/spire-r${a.rarity}.webp`;
  if (a.kind === 1) return `${SITE}/lightdive/cards/prism-b${a.trait}-r${a.rarity}.webp`;
  return `${SITE}/lightdive/cards/seeker-l${a.trait}-r${a.rarity}.webp`;
}

export function metadataOf(id: bigint | number, a: Attributes3) {
  const kind = KIND[a.kind] ?? "Card";
  const sealed = a.rarity === SEALED;
  const attributes: { trait_type: string; value: string | number; display_type?: string }[] = [{ trait_type: "Kind", value: kind }];
  if (sealed) attributes.push({ trait_type: "Rarity", value: "Sealed" });
  else {
    attributes.push({ trait_type: "Rarity", value: RARITY[a.rarity] ?? String(a.rarity) }, { trait_type: "Power", value: a.power, display_type: "number" });
    if (a.kind === 0) attributes.push({ trait_type: "Berths", value: a.trait, display_type: "number" });
    if (a.kind === 1) attributes.push({ trait_type: "Beam", value: BEAM[a.trait] ?? String(a.trait) });
    if (a.kind === 2) attributes.push({ trait_type: "Light", value: LIGHT[a.trait] ?? String(a.trait) });
  }
  attributes.push(
    { trait_type: "Voyages left", value: a.voyagesLeft, display_type: "number" },
    { trait_type: "Renewed", value: a.renewed ? "Yes" : "No" },
    { trait_type: "Status", value: a.dockedAt ? "Docked" : sealed ? "Sealed" : "Active" },
  );
  return {
    name: sealed ? `Sealed ${kind} #${id}` : `${RARITY[a.rarity] ?? ""} ${kind} #${id}`.trim(),
    description: sealed
      ? `A Lightdive ${kind.toLowerCase()} whose summon is still sealed; it reveals with its drand round. 潛光遠征的${KIND_ZH[a.kind] ?? "卡片"}，召喚結果揭曉前是封印狀態。`
      : `A Lightdive ${kind.toLowerCase()} on Robinhood Chain. Play at ${SITE}/game/lightdive. 潛光遠征的${KIND_ZH[a.kind] ?? "卡片"}。`,
    image: cardImage(a),
    external_url: `${SITE}/game/lightdive`,
    attributes,
  };
}
