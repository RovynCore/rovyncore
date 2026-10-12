// Simulated market for the preview: other observers' listings (new set each day) and price references.
// The real market will read listings from the market contract; the shapes here match what the page needs.
import { MARKET_TAX, ODDS_BP, POWER, PRICE, VOYAGES, seeded, type Kind } from "@/lib/lightdive-v3/rules";

export type Listing = {
  id: number;
  kind: Kind;
  rarity: number;
  power: number;
  trait: number;
  voyages: number;
  renewed: boolean;
  price: number;
  seller: string;
  listedAt: number;
  mine?: boolean;
  nftId?: number; // for my own listings
};

const RARITY_VALUE = [0.8, 1.7, 4.2, 12, 45];

/** A plausible asking price: rarity, power inside its band, and how much life is left. */
export function modelPrice(kind: Kind, rarity: number, power: number, voyages: number) {
  const [lo, hi] = POWER[kind][rarity];
  const inBand = hi > lo ? (power - lo) / (hi - lo) : 0.5;
  return PRICE[kind] * RARITY_VALUE[rarity] * (0.85 + inBand * 0.35) * (0.35 + 0.65 * (voyages / VOYAGES[kind]));
}

export function othersListings(now: number, sold: number[]): Listing[] {
  const day = Math.floor(now / 86_400_000);
  const r = seeded(day * 9973 + 17);
  const out: Listing[] = [];
  for (let i = 0; i < 42; i++) {
    const kind = (i % 7 < 3 ? 2 : i % 7 < 5 ? 1 : 0) as Kind;
    let x = Math.floor(r() * 10000), rarity = 0;
    for (; rarity < 4; rarity++) { if (x < ODDS_BP[kind][rarity]) break; x -= ODDS_BP[kind][rarity]; }
    if (r() < 0.3) rarity = Math.min(4, rarity + 1);
    const [lo, hi] = POWER[kind][rarity];
    const power = lo + Math.floor(r() * (hi - lo + 1));
    const voyages = Math.max(1, Math.round(VOYAGES[kind] * (0.15 + r() * 0.85)));
    const trait = kind === 0 ? rarity + 1 : kind === 1 ? Math.floor(r() * 3) : Math.floor(r() * 6);
    const price = Math.max(1, Math.round(modelPrice(kind, rarity, power, voyages) * (0.82 + r() * 0.4)));
    const id = 1_000_000 + day * 100 + i;
    const seller = `0x${Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0")}${Math.floor(r() * 0xffffffff).toString(16).padStart(8, "0")}`;
    out.push({ id, kind, rarity, power, trait, voyages, renewed: r() < 0.18, price, seller, listedAt: day * 86_400_000 + Math.floor(r() * Math.max(1, now - day * 86_400_000)) });
  }
  return out.filter((l) => !sold.includes(l.id));
}

/** Average asking price of the same kind and rarity on the market right now (other sellers only). */
export function averagePrice(list: Listing[], kind: Kind, rarity: number) {
  const same = list.filter((l) => !l.mine && l.kind === kind && l.rarity === rarity);
  if (!same.length) return null;
  const prices = same.map((l) => l.price).sort((a, b) => a - b);
  return {
    count: same.length,
    average: prices.reduce((a, b) => a + b, 0) / prices.length,
    low: prices[0],
    high: prices[prices.length - 1],
  };
}

export const SELLER_KEEPS = 1 - MARKET_TAX;

export type Supply = { alive: number; onTeam: number; listed: number };

/** Simulated server-wide card counts for the preview (the same for everyone on a given day). On chain these come from
 *  LightdiveNFT3.alive(kind), the market's escrow and the Locked events. `listed` adds the market listings shown here. */
export function simulatedSupply(day: number, listed: [number, number, number]): [Supply, Supply, Supply] {
  const r = seeded(day * 7919 + 3);
  const fill = [0.62 + r() * 0.2, 0.48 + r() * 0.2, 0.4 + r() * 0.2];
  const caps = [3000, 6000, 12000];
  return [0, 1, 2].map((k) => {
    const alive = Math.round(caps[k] * fill[k]);
    const onTeam = Math.round(alive * (0.68 + r() * 0.12));
    return { alive, onTeam, listed: Math.min(alive - onTeam, listed[k]) };
  }) as [Supply, Supply, Supply];
}
