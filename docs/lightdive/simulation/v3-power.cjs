// Lightdive rules v3 draft: power ranges (min team 51, max 1200), team power distribution, star map reach.
// Run: node v3-power.cjs
// Power = spire + prism + all seekers (no seat-fill scaling in v3).
const SPIRE = [[41, 55], [56, 75], [76, 95], [96, 115], [116, 140]]; // Lv.1-5 = rarity, seats = level
const PRISM = [[10, 19], [20, 29], [30, 39], [40, 49], [50, 60]];
const SEEKER = [[10, 39], [40, 79], [80, 119], [120, 159], [160, 200]]; // CryptoMines-style contiguous bands
const ODDS_SPIRE = [0.48, 0.29, 0.15, 0.07, 0.01];
const ODDS_PRISM = [0.5, 0.28, 0.15, 0.06, 0.01];
const ODDS_SEEKER = [0.44, 0.35, 0.15, 0.05, 0.01]; // CryptoMines worker odds
const min = SPIRE[0][0] + SEEKER[0][0], max = SPIRE[4][1] + PRISM[4][1] + 5 * SEEKER[4][1];
console.log("min departing team (Lv.1 spire + 1 seeker, no prism):", min, " max team:", max);

const pick = (o) => { let x = Math.random(); for (let i = 0; i < 5; i++) if ((x -= o[i]) < 0) return i; return 4; };
const roll = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));
const seeker = () => roll(SEEKER[pick(ODDS_SEEKER)]);
const team = (lv, curated = 0) => {
  const s = roll(SPIRE[lv]);
  const p = curated ? Math.max(...Array.from({ length: 3 }, () => roll(PRISM[pick(ODDS_PRISM)]))) : roll(PRISM[pick(ODDS_PRISM)]);
  const pool = Array.from({ length: curated || lv + 1 }, seeker).sort((a, b) => b - a).slice(0, lv + 1);
  return s + p + pool.reduce((a, b) => a + b, 0);
};
const pct = (a, q) => a[Math.floor(q * (a.length - 1))];
console.log("\nfull team, random prism and seekers:");
for (let lv = 0; lv < 5; lv++) {
  const a = Array.from({ length: 100000 }, () => team(lv)).sort((x, y) => x - y);
  const c = Array.from({ length: 30000 }, () => team(lv, 20)).sort((x, y) => x - y);
  console.log(`Lv.${lv + 1}  random p10 ${pct(a, .1)}  p50 ${pct(a, .5)}  p90 ${pct(a, .9)}  max ${a.at(-1)} | best of 20 seekers p50 ${pct(c, .5)}  p90 ${pct(c, .9)}`);
}
const all = Array.from({ length: 400000 }, () => team(pick(ODDS_SPIRE))).sort((x, y) => x - y);
console.log("\nall random full teams:", [.1, .25, .5, .75, .9, .99, .999].map((q) => `p${q * 100} ${pct(all, q)}`).join("  "));

// Star map: 6 clusters x 4 destinations, thresholds roughly +15% per step
const TH = [51, 60, 70, 80, 92, 106, 122, 140, 160, 185, 215, 250, 290, 335, 385, 440, 500, 570, 650, 740, 840, 950, 1070, 1180];
module.exports = { SPIRE, PRISM, SEEKER, ODDS_SPIRE, ODDS_PRISM, ODDS_SEEKER, TH, team, pick };
if (require.main === module) {
  console.log("\nshare of random full teams reaching each destination:");
  console.log(TH.map((t, i) => `${"①②③④⑤⑥"[Math.floor(i / 4)]}${"ABCD"[i % 4]} ${t}: ${(100 * all.filter((x) => x >= t).length / all.length).toFixed(1)}%`).join("\n"));
}
