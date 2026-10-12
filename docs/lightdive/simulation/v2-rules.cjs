/* eslint-disable @typescript-eslint/no-require-imports -- plain Node simulation scripts */
// Lightdive rules v2 draft: checks the odds tables and the "deeper pays more" rule, then simulates
// one team choosing each destination. Run: node v2-rules.cjs
const odds = require("./v2-odds.json");
const CL = ["①", "②", "③", "④"];
const TH = [50, 80, 110, 150, 200, 250, 300, 400, 480, 550, 700, 850];
const COEF = [1.0, 1.03, 1.06, 1.12, 1.16, 1.2, 1.3, 1.36, 1.42, 1.55, 1.62, 1.7];
const SUPPLY = [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22]; // share of the expected reward

let ok = true;
for (const [k, t] of Object.entries(odds)) {
  const p = t.reduce((a, x) => a + x[0], 0), ev = t.reduce((a, x) => a + x[0] * (x[1] + x[2]), 0);
  if (p !== 10000 || ev !== 2000000) { ok = false; console.log("table off:", k, p, ev); }
}
// Supply is a share of the expected reward, so "deeper pays more if it does not fail" holds at any reward rate.
for (let i = 1; i < 12; i++) if (COEF[i] * (1 - SUPPLY[i]) <= COEF[i - 1] * (1 - SUPPLY[i - 1])) { ok = false; console.log("step fails at", i); }
console.log("12 tables average 1.00 and every step deeper pays more:", ok);

const draw = (t) => { let x = Math.random() * 1e4; for (const [p, lo, hi] of t) if ((x -= p) < 0) return (lo + Math.floor(Math.random() * (hi - lo + 1))) / 100; return 0; };
const L = 600, r = 0.055, wear = 8.8;
console.log(`\nteam luminance ${L}, ${r} RVYN per point, NFT wear ${wear} per dive, focused prism, 100k dives each`);
for (let d = 0; d < 12; d++) {
  if (TH[d] > L) continue;
  const t = odds[CL[Math.floor(d / 3)] + "聚焦"], gross = L * COEF[d] * r, supply = gross * SUPPLY[d];
  const a = []; for (let k = 0; k < 100000; k++) a.push(gross * draw(t) - supply - wear);
  a.sort((x, y) => x - y);
  const mean = a.reduce((s, x) => s + x, 0) / a.length;
  console.log(`${CL[Math.floor(d / 3)]}${"ABC"[d % 3]}  supply ${supply.toFixed(1)}  mean ${mean.toFixed(1)}  loss ${(100 * a.filter((x) => x < 0).length / a.length).toFixed(0)}%  worst ${a[0].toFixed(1)}  median ${a[50000].toFixed(1)}  top1% ${a[99000].toFixed(1)}`);
}
