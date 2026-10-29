// The verify page's step-by-step recomputation (lib/lightdive-v3/verify.ts) must give exactly the result drawDive gives
// (lib/lightdive-v3/onchain.ts), which the local smoke test checks against Expedition3 on a chain with real drand.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sha256, type Hex } from "viem";
import { diveRandom, drawDive, type ChainPlan } from "../lib/lightdive-v3/onchain.ts";
import { explainDive } from "../lib/lightdive-v3/verify.ts";
import { ODDS } from "../lib/lightdive-v3/odds.ts";

const rounds = (JSON.parse(fs.readFileSync("tests/data/drand-evmnet.json", "utf8")) as { rounds: { round: number; signature: string }[] }).rounds;

test("verify: every step matches drawDive for real drand signatures, every odds table and many dive ids", () => {
  let n = 0;
  for (const [key, rows] of Object.entries(ODDS)) {
    const plan: ChainPlan = { table: rows.map(([probBp, lo, hi]) => ({ probBp, lo, hi })), risk: 0, starEvent: 0, coefBp: 10_000, levyBp: 500, wear2Bp: 1500, wear3Bp: 500 };
    for (const { signature } of rounds) {
      for (const id of [0n, 1n, 7n, 123n, 99_999n]) {
        const sig = `0x${signature}` as Hex;
        const e = explainDive(plan, sig, id, 0);
        const d = drawDive(plan, diveRandom(sig, id));
        assert.equal(e.randomness, sha256(sig));
        assert.equal(e.r, diveRandom(sig, id));
        assert.deepEqual({ tier: e.tier, multX100: e.multX100, wear: e.wear }, d, `${key} ${id}`);
        assert.equal(e.rows.filter((x) => x.hit).length, 1, "exactly one row is drawn");
        assert.ok(e.roll >= e.rows[e.tier].from && e.roll <= e.rows[e.tier].to);
        n++;
      }
    }
  }
  assert.ok(n > 100);
});

test("verify: lamp oil caps the wear at 1, whatever the roll", () => {
  const plan = { table: [{ probBp: 10_000, lo: 100, hi: 100 }], wear2Bp: 5000, wear3Bp: 5000 };
  for (const { signature } of rounds) assert.equal(explainDive(plan, `0x${signature}` as Hex, 5n, 1).wear, 1);
});
