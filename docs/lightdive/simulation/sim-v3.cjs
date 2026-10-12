/* eslint-disable @typescript-eslint/no-require-imports -- plain Node simulation scripts */
// Lightdive economy simulator for the rules v3 draft. Run: node sim-v3.cjs
// Daily model: every active player keeps one team, dives 3 times a day to the deepest destination it can reach,
// rewards come from the pool, and every tax flows 95% back to the pool and 5% to burn.
// Reward models (owner decision 2026-10-10: B, as in contracts/lightdive-v3/Expedition3.sol):
//   A: each day pays exactly 1% of the pool, shared by that day's points (the draft's model)
//   B: the day's rate is fixed by yesterday's points: rate = min(cap, pool x 1% / yesterday's points); the day pays
//      rate x today's points, but never more than the daily ceiling (1.5% of the pool). Rewards are known at the reveal.
const { TH, team, pick, ODDS_SPIRE } = require("./v3-power.cjs");

const P = {
  pool_seed: 1_000_000, emission: 0.01,
  price: { spire: 50, prism: 30, seeker: 20 },
  life: { spire: 60, prism: 45, seeker: 15 }, // days at 3 dives a day (voyages 180 / 135 / 45)
  renew_price: 0.5, renew_rate: 0.4, // one renewal per NFT; share of expiring NFTs renewed
  mint_split: { pool: 0.7, burn: 0.15, treasury: 0.15 },
  tax_pool: 0.95, // supply levy, claim fee and trade tax: 95% pool, 5% burn
  claim_fee_avg: 0.15 * (1 - 7 / 15), // players claim every 7 days on average
  trade_volume_vs_mint: 0.3, trade_tax: 0.05,
  cap_per_point: 0.015, // launch guard: max RVYN per base point per dive
  ceiling: 0.015, // model B: the most one day's dives may take from the pool
};
// 6 clusters x 4 destinations
const COEF = TH.map((_, i) => +(1.025 ** i).toFixed(3));
const LEVY = TH.map((_, i) => [0.03, 0.05, 0.07, 0.09, 0.11, 0.13][Math.floor(i / 4)]);
const WEAR = [1.0, 1.05, 1.1, 1.2, 1.32, 1.45]; // expected voyages spent per dive, by cluster
const dest = (L) => { let d = 0; for (let i = 0; i < TH.length; i++) if (L >= TH[i]) d = i; return d; };

const SEATS_AVG = ODDS_SPIRE.reduce((a, p, i) => a + p * (i + 1), 0);
const COST = P.price.spire + P.price.prism + SEATS_AVG * P.price.seeker;
// NFT cost per day of play, with one renewal at 50% for a share of NFTs, scaled by wear
const perDay = (price, life, wear) => (price * (1 + P.renew_price * P.renew_rate)) / (life * (1 + P.renew_rate)) * wear;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const arrivals = (d, sc) => { const ramp = Math.min(d / 30, 1); if (sc === "base") return d < 90 ? 60 * ramp : Math.max(8, 60 * 0.98 ** (d - 90)); if (sc === "boom") return d < 90 ? 300 * ramp : Math.max(30, 300 * 0.98 ** (d - 90)); return d < 45 ? 60 * ramp : 0; };

function run(sc, model = "B") {
  const r = rng(11);
  let pool = P.pool_seed, burned = 0, treasury = 0, spent = 0, received = 0, levyPaid = 0, yieldRatio = 2;
  let players = [], prevPoints = 0;
  const rows = [];
  for (let d = 0; d < 365; d++) {
    let mint = 0;
    const survivors = [];
    for (const pl of players) {
      // each day a player pays the running NFT cost of its team (renewals and re-mints averaged out)
      const c = Math.floor(pl.d / 4);
      const daily = perDay(P.price.spire, P.life.spire, WEAR[c]) + perDay(P.price.prism, P.life.prism, WEAR[c]) + pl.seats * perDay(P.price.seeker, P.life.seeker, WEAR[c]);
      if (d >= pl.until && yieldRatio < pl.threshold) continue; // quits when the next NFT expires and returns look poor
      if (d >= pl.until) pl.until = d + P.life.seeker;
      mint += daily; pl.cost = daily; survivors.push(pl);
    }
    players = survivors;
    const want = arrivals(d, sc) * Math.max(0.2, Math.min(1.5, yieldRatio));
    let n = Math.floor(want) + (r() < want - Math.floor(want) ? 1 : 0);
    n = Math.min(n, 3000 - players.length);
    for (let i = 0; i < n; i++) {
      const lv = pick(ODDS_SPIRE), L = team(lv), dd = dest(L);
      const c = Math.floor(dd / 4);
      players.push({ L, d: dd, seats: lv + 1, threshold: 0.35 + r() * 0.85, until: d + P.life.seeker, cost: perDay(P.price.spire, P.life.spire, WEAR[c]) + perDay(P.price.prism, P.life.prism, WEAR[c]) + (lv + 1) * perDay(P.price.seeker, P.life.seeker, WEAR[c]) });
      mint += COST;
    }
    const trade = mint * P.trade_volume_vs_mint * P.trade_tax;
    pool += mint * P.mint_split.pool + trade * P.tax_pool; burned += mint * P.mint_split.burn + trade * (1 - P.tax_pool); treasury += mint * P.mint_split.treasury; spent += mint;
    const points = players.reduce((a, pl) => a + 3 * pl.L * COEF[pl.d], 0);
    let E;
    if (model === "A") E = players.length ? Math.min(pool * P.emission, points * P.cap_per_point) : 0;
    else {
      const fixed = prevPoints ? Math.min(P.cap_per_point, (pool * P.emission) / prevPoints) : P.cap_per_point;
      E = players.length ? Math.min(fixed * points, pool * P.ceiling) : 0;
    }
    prevPoints = points;
    pool -= E;
    const levy = players.reduce((a, pl) => a + E * (3 * pl.L * COEF[pl.d] / points) * LEVY[pl.d], 0) || 0;
    const fee = (E - levy) * P.claim_fee_avg;
    pool += (levy + fee) * P.tax_pool; burned += (levy + fee) * (1 - P.tax_pool); levyPaid += levy;
    const net = E - levy - fee; received += net;
    const rate = points ? E / points : 0; // RVYN per base point per dive
    const avgRatio = players.length ? players.reduce((a, pl) => a + (3 * pl.L * COEF[pl.d] * rate * (1 - LEVY[pl.d]) * (1 - P.claim_fee_avg)) / pl.cost, 0) / players.length : 2;
    yieldRatio = 0.8 * yieldRatio + 0.2 * avgRatio;
    rows.push({ d: d + 1, players: players.length, pool, E, rate, avgRatio, burned, treasury, spent, received, levyPaid });
  }
  return rows;
}

const fmt = (x) => Math.round(x).toLocaleString("en-US");
const out = {};
console.log("scenario  d30 teams  d365 teams  d365 pool    d90 rate     d365 rate    avg ratio d90/d365   received/spent  burned");
for (const [sc, model] of [["base", "B"], ["boom", "B"], ["bust", "B"], ["base", "A"], ["boom", "A"], ["bust", "A"]]) {
  const rows = run(sc, model), e = rows[364];
  if (model === "B") out[sc] = rows;
  console.log(`${(sc + " " + model).padEnd(9)} ${String(rows[29].players).padStart(6)}     ${String(e.players).padStart(6)}     ${fmt(e.pool).padStart(9)}   ${rows[89].rate.toFixed(5)}     ${e.rate.toFixed(5)}     ${rows[89].avgRatio.toFixed(2)} / ${e.avgRatio.toFixed(2)}            ${(e.received / e.spent).toFixed(2)}          ${fmt(e.burned)}`);
}
module.exports = { P, COEF, LEVY, WEAR, out };

// Lifecycle of one team from build to retirement, at the base scenario's reward rate on day 90 and day 365,
// and at the launch cap. "Cost" counts the NFTs at mint price; a top team bought on the market costs far more.
const lifecycle = (name, L, seats, cost, rate) => {
  const d = dest(L), c = Math.floor(d / 4);
  const perDive = L * COEF[d] * rate * (1 - LEVY[d]);
  const spireDays = P.life.spire / WEAR[c]; // spire life in days, shortened by heavy wear
  const seekerDays = P.life.seeker / WEAR[c];
  const seekerCost = seats * P.price.seeker * (spireDays / seekerDays - 1); // replacing seekers while the spire lasts
  const prismCost = cost.prism ? P.price.prism * Math.max(0, spireDays / (P.life.prism / WEAR[c]) - 1) : 0;
  const total = cost.total + seekerCost + prismCost;
  const gross = perDive * 3 * spireDays * (1 - P.claim_fee_avg);
  return `${name.padEnd(18)} power ${String(L).padStart(4)}  goes ${"①②③④⑤⑥"[c]}${"ABCD"[d % 4]}  coef ${COEF[d].toFixed(2)}  life ${spireDays.toFixed(0)}d  per day ${(perDive * 3).toFixed(2)}  total in ${fmt(total).padStart(6)}  total out ${fmt(gross).padStart(6)}  out/in ${(gross / total).toFixed(2)}`;
};
const base = out.base;
for (const [label, rate] of [["launch cap", P.cap_per_point], ["base day 90", base[89].rate], ["base day 365", base[364].rate]]) {
  console.log(`\n-- reward rate ${rate.toFixed(5)} RVYN per base point per dive (${label})`);
  console.log(lifecycle("min team (70 RVYN)", 51, 1, { total: P.price.spire + P.price.seeker, prism: false }, rate));
  console.log(lifecycle("median random team", 166, 2, { total: COST, prism: true }, rate));
  console.log(lifecycle("max team (1200)", 1200, 5, { total: P.price.spire + P.price.prism + 5 * P.price.seeker, prism: true }, rate));
}
