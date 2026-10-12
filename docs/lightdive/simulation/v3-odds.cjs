/* eslint-disable @typescript-eslint/no-require-imports -- plain Node simulation scripts */
// Lightdive rules v3: odds tables for 6 clusters x 3 prism beams. Each table must have probabilities summing to
// 10,000 bp and an average multiplier of exactly 1.00 (sum p*(lo+hi) = 2,000,000). Run: node v3-odds.cjs
// Writes v3-odds.json.
const fs = require("fs");
// [empty, partial, good, great, legend] probabilities in bp for the focused beam, per cluster; normal takes the rest
const FOCUS = [
  [500, 1000, 1100, 200, 0],
  [1000, 1000, 1300, 400, 0],
  [1600, 900, 1500, 500, 50],
  [2400, 800, 1600, 600, 100],
  [3200, 600, 1700, 700, 150],
  [4200, 0, 1800, 900, 200],
];
// multiplier ranges x100 per cluster: [partial, normal, good, great, legend]
const RANGE = [
  [[50, 80], [95, 110], [125, 155], [200, 240], null],
  [[50, 80], [95, 108], [140, 180], [240, 290], null],
  [[50, 80], [92, 108], [150, 190], [280, 340], [500, 650]],
  [[50, 80], [90, 108], [150, 195], [280, 350], [600, 800]],
  [[50, 80], [88, 106], [150, 200], [280, 360], [700, 900]],
  [[50, 80], [85, 105], [150, 200], [260, 330], [800, 1000]],
];
// wide: fewer empty and smaller top; needle: more empty and bigger top
const BEAM = { 廣域: { empty: 0.6, top: 0.5 }, 聚焦: { empty: 1, top: 1 }, 針芒: { empty: 1.35, top: 1.6 } };

function build(c, beam) {
  const [e0, pp, q, g, l0] = FOCUS[c];
  const b = BEAM[beam];
  const e = Math.min(5500, Math.round((e0 * b.empty) / 50) * 50);
  const l = Math.round((l0 * b.top) / 10) * 10, gg = Math.round((g * (beam === "廣域" ? 0.7 : beam === "針芒" ? 1.2 : 1)) / 10) * 10;
  const normal = 10000 - e - pp - q - gg - l;
  const [rp, rn, rq, rg, rl] = RANGE[c];
  const t = [[e, 0, 0]];
  if (pp) t.push([pp, ...rp]);
  t.push([normal, ...rn], [q, ...rq], [gg, ...rg]);
  if (l) t.push([l, ...rl]);
  // coarse step: move probability between the normal tier and the good tier until the average is close to 1.00
  const ni = pp ? 2 : 1, qi = ni + 1;
  const sum = () => t.reduce((s, x) => s + x[0] * (x[1] + x[2]), 0);
  for (let k = 0; k < 2000 && Math.abs(2e6 - sum()) > 6000; k++) {
    const step = 2e6 > sum() ? 10 : -10;
    t[ni][0] -= step; t[qi][0] += step;
  }
  // if no exact balance exists for this split, nudge the split by 10 bp and try again
  for (let k = 0; k < 60; k++) {
    const s = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 10;
    const r = t.map((x) => [...x]); r[ni][0] -= s; r[qi][0] += s;
    try { return fix(r, ni); } catch {}
  }
  throw new Error("cannot balance " + JSON.stringify(t));
}

// Make the average exactly 1.00 by moving the upper bounds of up to two non-empty tiers as little as possible.
function fix(t, ni = 0) {
  const diff = 2e6 - t.reduce((s, x) => s + x[0] * (x[1] + x[2]), 0);
  if (diff === 0) return t;
  let best = null;
  for (let i = 1; i < t.length; i++) for (let j = i; j < t.length; j++) for (let di = -150; di <= 150; di++) {
    const rest = diff - t[i][0] * di;
    if (i === j ? rest !== 0 : rest % t[j][0] !== 0) continue;
    const dj = i === j ? 0 : rest / t[j][0];
    if (Math.abs(dj) > 150) continue;
    const weight = (k) => (k <= ni ? 20 : k === ni + 1 ? 1 : k === ni + 2 ? 2 : 4); // the partial and normal tiers move only if nothing else works
    const cost = weight(i) * Math.abs(di) + weight(j) * Math.abs(dj);
    if (best && cost >= best.cost) continue;
    const r = t.map((x) => [...x]); r[i][2] += di; r[j][2] += dj;
    if (r.some((x, k) => x[1] > x[2] || x[2] > 1000 || (k > 1 && x[1] <= r[k - 1][2]))) continue;
    best = { cost, r };
  }
  if (!best) throw new Error("cannot balance " + JSON.stringify(t));
  return best.r;
}

const out = {};
for (let c = 0; c < 6; c++) for (const beam of Object.keys(BEAM)) {
  const t = build(c, beam);
  const p = t.reduce((s, x) => s + x[0], 0), ev = t.reduce((s, x) => s + x[0] * (x[1] + x[2]), 0);
  if (p !== 10000 || ev !== 2e6) throw new Error(`table ${c} ${beam} is off`);
  out[`${c + 1}${beam}`] = t;
  const sd = Math.sqrt(t.reduce((a, x) => { const m = (x[1] + x[2]) / 200; return a + (x[0] / 1e4) * (m * m + ((x[2] - x[1]) / 100) ** 2 / 12); }, 0) - 1);
  console.log(`${"①②③④⑤⑥"[c]}${beam}  empty ${t[0][0] / 100}%  top x${(t.at(-1)[2] / 100).toFixed(2)}  sd ${sd.toFixed(2)}  ${JSON.stringify(t)}`);
}
fs.writeFileSync(__dirname + "/v3-odds.json", JSON.stringify(out, null, 1));
console.log("all 18 tables: probabilities 100%, average multiplier 1.00");
