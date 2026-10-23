// 每日委託 (v3.1): three commissions a UTC day, derived from the day alone exactly as LightdiveCommissions3.commissionsOf
// does, so everyone sees the same three and nobody sets them by hand. Relative imports only (Node runs the tests on it).
import { encodePacked, keccak256 } from "viem";
import { DESTINATIONS, skyOf, type Outcome } from "./rules.ts";

export const COMMISSION_KINDS = ["cluster", "good", "bond", "attuned", "sky", "deep", "supply"] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];
/** kind, and its parameter: a cluster (0..2) for "cluster", a crew bond of at least 1..3 for "bond" (v3.3; this was a
 *  voyage decision until the decisions were removed). */
export type Commission = { index: number; kind: CommissionKind; param: number };

export function commissionsOf(day: number): Commission[] {
  const out: Commission[] = [];
  const taken = new Set<number>();
  for (let i = 0; out.length < 3; i++) {
    const h = BigInt(keccak256(encodePacked(["string", "uint32", "uint8"], ["lightdive.commission", day, i])));
    const kind = Number(h % 7n);
    if (taken.has(kind)) continue;
    taken.add(kind);
    const param = kind === 0 ? Number((h >> 8n) % 3n) : kind === 2 ? Number((h >> 8n) % 3n) + 1 : 0;
    out.push({ index: out.length, kind: COMMISSION_KINDS[kind], param });
  }
  return out;
}

/** What a commission needs to know about a revealed dive. */
export type CommissionDive = {
  dest: number; at: number; bond?: number; deep?: boolean; supply?: number; attuned?: boolean;
  result?: { outcome: Outcome; multX100: number; tier: number };
};
/** The same test as LightdiveCommissions3.meets. */
export function meetsCommission(c: Commission, d: CommissionDive): boolean {
  const r = d.result;
  if (!r) return false;
  const day = Math.floor(d.at / 86_400_000);
  switch (c.kind) {
    case "cluster": return DESTINATIONS[d.dest].cluster === c.param && r.multX100 > 0;
    case "good": return r.outcome === "good" || r.outcome === "great" || r.outcome === "legend";
    case "bond": return (d.bond ?? 0) >= c.param;
    case "attuned": return !!d.attuned;
    case "sky": return skyOf(day).events.has(d.dest);
    case "deep": return !!d.deep;
    case "supply": return (d.supply ?? 0) !== 0;
  }
}
