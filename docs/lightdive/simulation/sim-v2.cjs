// Lightdive economy simulator, Node port of sim.py with the rules v2 draft switched on or off.
// Run: node sim-v2.cjs            prints v1 and v2 side by side for the three scenarios
// v2 changes modelled: supply (a share of each day's emission, 80% back to the pool, 20% burned),
// one renewal per NFT at 50% of the mint price, and a slightly higher average destination coefficient.
// Attunement and the overflow rule only move shares between players, so they do not change these totals.
const DAYS = 365;
const P = {
  pool_seed: 1_000_000, emission_rate: 0.01,
  price_spire: 300, price_prism: 120, price_seeker: 40,
  life_spire: 120, life_prism: 30, life_seeker: 10, // days; v2 multiplies voyages by 3 and dives 3 times a day, so days stay the same
  split_pool: 0.7, split_burn: 0.15, split_treasury: 0.15,
  claim_fee_max: 0.15, claim_fee_days: 15,
  spire_cap: 3000, season_days: 180, yield_cap_per_lum: 0.18,
};
const V2 = { supply_share: 0.07, supply_pool: 0.8, renew_price: 0.5, renew_rate: 0.4, coef: 1.08 };

const SPIRE_DECK = { 1: 1440, 2: 870, 3: 450, 4: 210, 5: 30 };
const SPIRE_LUM = { 1: 40, 2: 70, 3: 110, 4: 160, 5: 230 };
const PRISM_LUM = { 1: 10, 2: 20, 3: 32, 4: 48, 5: 70 };
const SEEKER_LUM = { 1: 25, 2: 38.5, 3: 58, 4: 87.5, 5: 140 };
const RARITY_W = { 1: 0.5, 2: 0.28, 3: 0.15, 4: 0.06, 5: 0.01 };

function setup() {
  const n = Object.values(SPIRE_DECK).reduce((a, b) => a + b, 0);
  const seats = Object.entries(SPIRE_DECK).reduce((a, [lv, c]) => a + lv * c, 0) / n;
  const spire = Object.entries(SPIRE_DECK).reduce((a, [lv, c]) => a + SPIRE_LUM[lv] * c, 0) / n;
  const prism = Object.entries(RARITY_W).reduce((a, [r, w]) => a + PRISM_LUM[r] * w, 0);
  const seeker = Object.entries(RARITY_W).reduce((a, [r, w]) => a + SEEKER_LUM[r] * w, 0);
  return { seats, lum: spire + prism + seats * seeker, upfront: P.price_spire + P.price_prism + seats * P.price_seeker };
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function arrivals(d, sc) {
  const ramp = Math.min(d / 30, 1);
  if (sc === "base") return d < 90 ? 60 * ramp : Math.max(8, 60 * 0.98 ** (d - 90));
  if (sc === "boom") return d < 90 ? 300 * ramp : Math.max(30, 300 * 0.98 ** (d - 90));
  return d < 45 ? 60 * ramp : 0;
}

function run(sc, v2) {
  const r = rng(7), s = setup();
  const kinds = [["seeker", s.seats * P.price_seeker, P.life_seeker], ["prism", P.price_prism, P.life_prism], ["spire", P.price_spire, P.life_spire]];
  const costDay = (renew) => kinds.reduce((a, [, price, life]) => a + (renew ? price * (1 + V2.renew_price * V2.renew_rate) / (life * (1 + V2.renew_rate)) : price / life), 0);
  const cost_day = costDay(v2);
  let pool = P.pool_seed, burned = 0, treasury = 0, spent = 0, received = 0, supplyPaid = 0;
  let players = [], yieldRatio = 2;
  const rows = [];
  for (let d = 0; d < DAYS; d++) {
    let spend = 0;
    const survivors = [];
    for (const pl of players) {
      let alive = true;
      for (const [k, price, life] of kinds) {
        if (pl[k].next !== d) continue;
        if (yieldRatio < pl.threshold) { alive = false; continue; }
        if (v2 && !pl[k].renewed && r() < V2.renew_rate) { spend += price * V2.renew_price; pl[k] = { next: d + life, renewed: true }; }
        else { spend += price; pl[k] = { next: d + life, renewed: false }; }
      }
      if (alive) survivors.push(pl);
    }
    players = survivors;
    const want = arrivals(d, sc) * Math.max(0.2, Math.min(1.5, yieldRatio));
    let nNew = Math.floor(want) + (r() < want - Math.floor(want) ? 1 : 0);
    nNew = Math.min(nNew, P.spire_cap - players.length);
    for (let i = 0; i < nNew; i++) {
      players.push({ seeker: { next: d + P.life_seeker }, prism: { next: d + P.life_prism }, spire: { next: d + P.life_spire }, threshold: 0.35 + r() * 0.85 });
      spend += s.upfront;
    }
    pool += spend * P.split_pool; burned += spend * P.split_burn; treasury += spend * P.split_treasury; spent += spend;
    const totalLum = players.length * s.lum * (v2 ? V2.coef : 1.05);
    const emission = players.length ? Math.min(pool * P.emission_rate, totalLum * P.yield_cap_per_lum) : 0;
    pool -= emission;
    const recycled = emission * P.claim_fee_max * (1 - 7 / P.claim_fee_days);
    pool += recycled;
    let net = emission - recycled;
    if (v2) {
      const supply = emission * V2.supply_share;
      supplyPaid += supply; net -= supply; pool += supply * V2.supply_pool; burned += supply * (1 - V2.supply_pool);
    }
    received += net;
    const per = players.length ? net / players.length : 0;
    const ratio = players.length ? per / cost_day : 2;
    yieldRatio = 0.8 * yieldRatio + 0.2 * ratio;
    rows.push({ day: d + 1, players: players.length, pool, emission, per, ratio, burned, treasury, spent, received, supplyPaid });
  }
  return rows;
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
console.log("scenario  rules  d30 spires  d365 spires  d365 pool   burned     spent        received     received/spent  d90 ratio  d365 ratio");
for (const sc of ["base", "boom", "bust"]) for (const v2 of [false, true]) {
  const rows = run(sc, v2), e = rows[364];
  console.log(`${sc.padEnd(9)} ${v2 ? "v2" : "v1"}     ${String(rows[29].players).padStart(5)}       ${String(e.players).padStart(5)}      ${fmt(e.pool).padStart(9)}  ${fmt(e.burned).padStart(9)}  ${fmt(e.spent).padStart(11)}  ${fmt(e.received).padStart(11)}   ${(e.received / e.spent).toFixed(2)}            ${rows[89].ratio.toFixed(2)}       ${e.ratio.toFixed(2)}`);
}
