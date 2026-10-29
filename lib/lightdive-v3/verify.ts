// 驗證一趟航程 (P0-02, 10-30): every step Expedition3._settle takes to turn a drand round into a result, written out so
// anyone can redo it by hand from public data. The randomness is sha256 of the round's BLS signature (what
// DrandEvmnet.verify returns), mixed with the dive id; the result row, the multiplier and the wear each read their own
// part of that number. Mirrors drawDive (onchain.ts), which the smoke test checks against the chain. Relative imports
// only.
import { encodeAbiParameters, keccak256, sha256, type Hex } from "viem";
import type { ChainPlan } from "./onchain.ts";

const BP = 10_000n;

export type DiveExplained = {
  randomness: Hex; // sha256(signature)
  r: bigint; // keccak256(abi.encode(randomness, diveId))
  roll: number; // r % 10000: picks the row
  rows: { tier: number; probBp: number; from: number; to: number; lo: number; hi: number; hit: boolean }[];
  tier: number;
  multRoll: bigint; // (r >> 128) % (hi - lo + 1)
  multX100: number;
  wearRoll: number; // (r >> 64) % 10000
  wear: number;
  lampOil: boolean; // lamp oil caps the wear at 1
};

export function explainDive(plan: Pick<ChainPlan, "table" | "wear2Bp" | "wear3Bp">, signature: Hex, diveId: bigint, supply: number): DiveExplained {
  const randomness = sha256(signature);
  const r = BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [randomness, diveId])));
  const roll = Number(r % BP);
  let acc = 0;
  let tier = plan.table.length - 1;
  const rows = plan.table.map((t, i) => {
    const from = acc;
    acc += t.probBp;
    return { tier: i, probBp: t.probBp, from, to: acc - 1, lo: t.lo, hi: t.hi, hit: false };
  });
  const hit = rows.find((x) => roll >= x.from && roll <= x.to);
  if (hit) { hit.hit = true; tier = hit.tier; }
  const row = plan.table[tier];
  const multRoll = (r >> 128n) % BigInt(row.hi - row.lo + 1);
  const wearRoll = Number((r >> 64n) % BP);
  const drawn = wearRoll < plan.wear3Bp ? 3 : wearRoll < plan.wear3Bp + plan.wear2Bp ? 2 : 1;
  const lampOil = supply === 1;
  return { randomness, r, roll, rows, tier, multRoll, multX100: row.lo + Number(multRoll), wearRoll, wear: lampOil ? 1 : drawn, lampOil };
}
