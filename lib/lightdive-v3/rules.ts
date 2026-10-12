// Lightdive rules v3 (docs/lightdive/RULES-v3-draft.md): every number and formula of the game in one place.
// The preview build runs on these directly; the v3 contracts will be written from the same values later.
// Unaudited, testnet only.
import { encodePacked, keccak256 } from "viem";
import { ODDS } from "./odds.ts";

export type Kind = 0 | 1 | 2; // spire, prism, seeker
export type Beam = 0 | 1 | 2; // wide, focused, needle
export type Tier = [probBp: number, loX100: number, hiX100: number];

// ---------------------------------------------------------------- NFTs and power

/** Power range per rarity (★1..★5). Spire level = rarity + 1 = seats. Bands touch, so higher rarity is always stronger. */
export const POWER: Record<Kind, [number, number][]> = {
  0: [[41, 55], [56, 75], [76, 95], [96, 115], [116, 140]],
  1: [[10, 19], [20, 29], [30, 39], [40, 49], [50, 60]],
  2: [[10, 39], [40, 79], [80, 119], [120, 159], [160, 200]],
};
/** Draw odds per rarity in basis points. Seekers follow the CryptoMines worker odds. */
export const ODDS_BP: Record<Kind, number[]> = {
  0: [4800, 2900, 1500, 700, 100],
  1: [5000, 2800, 1500, 600, 100],
  2: [4400, 3500, 1500, 500, 100],
};
export const MIN_TEAM = POWER[0][0][0] + POWER[2][0][0]; // 51
export const MAX_TEAM = POWER[0][4][1] + POWER[1][4][1] + 5 * POWER[2][4][1]; // 1200

/** Launch prices in RVYN; the live price moves daily with the pool TWAP, clamped to [10%, 200%]. */
export const PRICE: Record<Kind, number> = { 0: 50, 1: 30, 2: 20 };
export const PRICE_FLOOR = 0.1;
export const PRICE_CEILING = 2;
export const PRICE_DAILY_STEP = 0.1;
export const VOYAGES: Record<Kind, number> = { 0: 180, 1: 135, 2: 45 }; // 60 / 45 / 15 days at 3 dives a day
export const RENEW_SHARE = 0.5; // one renewal per NFT at 50% of the launch price
export const DOCK_DAYS = 7;

export const DIVES_PER_DAY = 3; // per wallet
export const DIVES_PER_TEAM_PER_DAY = 3;
export const MAX_TEAMS = 5; // teams a wallet can have built at the same time
export const LIGHTS = 6; // 曦 霧 晶 熾 雷 淵

/**
 * Next mint price for one day: move toward target = launch price x (reference RVYN price / today's TWAP),
 * at most 10% a day, and never outside [10%, 200%] of the launch price.
 */
export function nextPrice(kind: Kind, current: number, refPrice: number, twap: number): number {
  const base = PRICE[kind];
  const target = twap > 0 ? base * (refPrice / twap) : current;
  const stepped = Math.min(current * (1 + PRICE_DAILY_STEP), Math.max(current * (1 - PRICE_DAILY_STEP), target));
  return Math.min(base * PRICE_CEILING, Math.max(base * PRICE_FLOOR, stepped));
}

// ---------------------------------------------------------------- star map

export type Destination = {
  id: number; // 0..23
  cluster: number; // 0..5
  slot: number; // 0..3 (A..D)
  threshold: number;
  coef: number; // reward weight
  coefBp: number; // the same in basis points, as the contract stores it
  levy: number; // share of the reward taken after return
  wear2: number; // chance this dive spends 2 voyages
  wear3: number; // chance this dive spends 3 voyages
};

const THRESHOLDS = [51, 60, 70, 80, 92, 106, 122, 140, 160, 185, 215, 250, 290, 335, 385, 440, 500, 570, 650, 740, 840, 950, 1070, 1180];
const LEVY = [0.03, 0.05, 0.07, 0.09, 0.11, 0.13];
const WEAR: [number, number][] = [[0, 0], [0.05, 0], [0.1, 0], [0.15, 0.025], [0.2, 0.06], [0.25, 0.1]];

export const DESTINATIONS: Destination[] = THRESHOLDS.map((threshold, id) => {
  const cluster = Math.floor(id / 4);
  return {
    id, cluster, slot: id % 4, threshold,
    coef: Math.round(1000 * 1.025 ** id) / 1000,
    coefBp: Math.round(1000 * 1.025 ** id) * 10,
    levy: LEVY[cluster],
    wear2: WEAR[cluster][0],
    wear3: WEAR[cluster][1],
  };
});
export const CLUSTERS = 6;
export const clusterRange = (c: number): [number, number] => [THRESHOLDS[c * 4], c < 5 ? THRESHOLDS[c * 4 + 4] - 1 : MAX_TEAM];

// ---------------------------------------------------------------- odds

const BEAM_KEY = ["廣域", "聚焦", "針芒"] as const;
const TABLES = ODDS as Record<string, Tier[]>;
/** The cluster's odds table for a risk level (0 wide, 1 focused, 2 needle). Average multiplier is exactly 1.00. */
export function baseTable(cluster: number, risk: Beam): Tier[] {
  return TABLES[`${cluster + 1}${BEAM_KEY[risk]}`].map((t) => [...t] as Tier);
}

/** Outcome names by table position. Tables without a partial tier start at "normal". */
export type Outcome = "empty" | "partial" | "normal" | "good" | "great" | "legend";
export function outcomesOf(table: Tier[]): Outcome[] {
  const rest = table.slice(1);
  const names: Outcome[] = rest[0][2] <= 80 ? ["partial", "normal", "good", "great", "legend"] : ["normal", "good", "great", "legend"];
  return ["empty", ...names.slice(0, rest.length)];
}

// ---------------------------------------------------------------- daily sky and star events

export type StarEvent = "tide" | "surge" | "storm" | "calm";
export const STAR_EVENTS: StarEvent[] = ["tide", "surge", "storm", "calm"];
export const STAR_EVENTS_PER_DAY = 4;

/** Small deterministic PRNG so every player sees the same sky for a day. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Sky = { day: number; lights: number[]; events: Map<number, StarEvent> };
/** Today's light for each of the 24 destinations, and 4 destinations with a star event. The same formula as
 *  LightdiveConfig3.lightOf / eventsOf, so anyone can check the day's sky against the chain. */
export function skyOf(day: number): Sky {
  const h = (tag: string, n: number) => BigInt(keccak256(encodePacked(["string", "uint32", "uint8"], [tag, day, n])));
  const lights = DESTINATIONS.map((d) => Number(h("lightdive.light", d.id) % BigInt(LIGHTS)));
  const events = new Map<number, StarEvent>();
  for (let i = 0; events.size < STAR_EVENTS_PER_DAY; i++) {
    const x = h("lightdive.event", i);
    const id = Number(x % BigInt(DESTINATIONS.length));
    if (!events.has(id)) events.set(id, STAR_EVENTS[Number((x >> 8n) % 4n)]);
  }
  return { day, lights, events };
}

// ---------------------------------------------------------------- voyage choices

export type Choice = "steady" | "bold" | "detour" | "none";
/**
 * Each voyage has one decision; "none" is the default when the player does not pick. The three real choices change
 * the dive in ways a player can see:
 * - steady: this dive cannot come back empty, but nothing above 豐收; the average is 97% of the plain dive.
 * - bold: empty chance x1.5 plus 4 points, 大豐收 x2.5 and 傳說 x3; the average is 103% of the plain dive.
 * - detour: odds unchanged, only 1 voyage of wear, supply cost +2 points.
 * The averages differ only a little on purpose: the reward pool is shared, so no choice should win by default.
 */
export const CHOICE_EFFECT: Record<Choice, { average?: number; wearCap?: number; levy?: number }> = {
  steady: { average: 0.97 },
  bold: { average: 1.03 },
  detour: { wearCap: 1, levy: 0.02 },
  none: {},
};
export const EVENT_CHANCE = 1; // every voyage brings one decision
export const VOYAGE_MINUTES = 5; // departure to reveal; the voyage log plays out over this time
export const DECISION_AT = 0.3; // the decision appears 30% into the voyage ...
export const DECISION_CLOSE_MS = 60_000; // ... and closes 1 minute before the reveal (Expedition3: decisionCloseSeconds)

/** round(a / b) for a, b >= 0, halves up: the same integer rounding as LightdiveConfig3. */
const rnd = (a: number, b: number) => Math.floor((2 * a + b) / (2 * b));
/** sum(prob x (lo + hi)) of a table: twice its average x 1e6, an exact integer. */
const avg2 = (t: Tier[]) => t.reduce((s, [p, lo, hi]) => s + p * (lo + hi), 0);

/** Reshapes a table for a choice: moves chance between outcomes, then scales the multipliers so the average becomes
 *  97% (steady) or 103% (bold) of the original. Whole-number arithmetic, exactly as LightdiveConfig3._reshape, so the
 *  odds shown are the odds on chain. Outcome names are kept from the original table. */
export function choiceTable(table: Tier[], choice: Choice): Tier[] {
  const t = table.map((x) => [...x] as Tier);
  if (choice !== "steady" && choice !== "bold") return t;
  const names = outcomesOf(table);
  const at = (o: Outcome) => names.indexOf(o);
  const p = t.map((x) => x[0]);
  if (choice === "steady") {
    p[1] += p[0];
    p[0] = 0;
    const good = at("good");
    for (let i = good + 1; good > 0 && i < p.length; i++) { p[good] += p[i]; p[i] = 0; }
  } else {
    const great = at("great"), legend = at("legend");
    const donors = (["partial", "normal", "good"] as Outcome[]).map(at).filter((i) => i > 0);
    const pool = donors.reduce((s, i) => s + p[i], 0);
    const up: [number, number][] = [[0, Math.min(6000, rnd(3 * p[0], 2) + 400)]];
    if (great > 0) up.push([great, rnd(5 * p[great], 2)]);
    if (legend > 0) up.push([legend, p[legend] * 3]);
    const need = up.reduce((s, [i, target]) => s + target - p[i], 0);
    const full = need === 0 || pool * 85 >= need * 100; // k = min(1, pool x 0.85 / need): never empty the middle rows
    for (const [i, target] of up) p[i] += full ? target - p[i] : rnd((target - p[i]) * pool * 85, need * 100);
    const extra = p.reduce((s, x) => s + x, 0) - 10000;
    let left = extra;
    donors.forEach((i, n) => {
      const take = n === donors.length - 1 ? left : rnd(extra * table[i][0], pool);
      p[i] -= take;
      left -= take;
    });
  }
  p.forEach((x, i) => { t[i][0] = x; });
  const num = (choice === "steady" ? 97 : 103) * avg2(table);
  const den = 100 * avg2(t);
  for (let i = 1; i < t.length; i++) {
    t[i][1] = rnd(t[i][1] * num, den);
    t[i][2] = Math.max(t[i][1], rnd(t[i][2] * num, den));
  }
  return t;
}

// ---------------------------------------------------------------- one dive

export type TeamInput = {
  spire: number; // power
  prism?: { power: number; beam: Beam };
  seekers: { power: number; light: number }[];
};

export const teamPower = (t: TeamInput) => t.spire + (t.prism?.power ?? 0) + t.seekers.reduce((a, s) => a + s.power, 0);

/** Attunement: each seeker whose light matches the destination adds 15% of its own power; the team gets at most +10%.
 *  Computed x100 in whole numbers, as on chain, then returned in points. */
export function attunement(t: TeamInput, light: number): number {
  const raw = t.seekers.filter((s) => s.light === light).reduce((a, s) => a + 15 * s.power, 0);
  return Math.min(raw, 10 * teamPower(t)) / 100;
}

/** Overflow stability: every 20% above the threshold removes 1 point of empty chance, at most 5, moved to "normal". */
export function overflowPoints(power: number, threshold: number): number {
  return power <= threshold ? 0 : Math.min(5, Math.floor(((power - threshold) * 5) / threshold));
}

export type DivePlan = {
  destination: Destination;
  power: number;
  bonus: number; // attunement
  risk: Beam; // after the star event
  table: Tier[]; // after overflow stability and the voyage choice
  names?: Outcome[]; // outcome per table row (kept from the table before the choice reshaped it)
  coef: number; // after a light surge
  coefBp: number; // the same in basis points (whole number, as on chain)
  levy: number; // after storm and detour
  wear2: number;
  wear3: number;
  event?: StarEvent;
};

/** Everything that decides one dive, in the rulebook's order: base table, star event, overflow, choice. */
export function planDive(t: TeamInput, d: Destination, sky: Sky, choice: Choice = "none"): DivePlan {
  const power = teamPower(t);
  const event = sky.events.get(d.id);
  let risk = (t.prism?.beam ?? 1) as number;
  // basis points throughout, as LightdiveConfig3.plan
  let levyBp = Math.round(d.levy * 10000), coefBp = d.coefBp, wear2 = d.wear2, wear3 = d.wear3;
  if (event === "storm") { risk += 1; levyBp = Math.max(0, levyBp - 200); }
  if (event === "calm") risk -= 1;
  if (event === "surge") coefBp = Math.floor((coefBp * 105) / 100);
  if (event === "tide") { wear2 = 0; wear3 = 0; }
  const ce = CHOICE_EFFECT[choice];
  if (ce.wearCap === 1) { wear2 = 0; wear3 = 0; }
  if (ce.levy) levyBp += Math.round(ce.levy * 10000);
  const r = Math.max(0, Math.min(2, risk)) as Beam;
  const base = baseTable(d.cluster, r);
  const names = outcomesOf(base);
  const cut = Math.min(base[0][0], overflowPoints(power, d.threshold) * 100);
  if (cut > 0) {
    base[0][0] -= cut;
    base[names.indexOf("normal")][0] += cut;
  }
  const table = choiceTable(base, choice);
  return { destination: d, power, bonus: attunement(t, sky.lights[d.id]), risk: r, table, names, coef: coefBp / 10000, coefBp, levy: levyBp / 10000, wear2, wear3, event };
}

export type DiveResult = { outcome: Outcome; tier: number; multX100: number; wear: number };
/** Draws one result from two uniform numbers in [0, 1): one for the outcome and multiplier, one for wear. */
export function resolve(plan: DivePlan, u1: number, u2: number): DiveResult {
  const names = plan.names ?? outcomesOf(plan.table);
  let x = Math.floor(u1 * 10000), tier = 0;
  for (; tier < plan.table.length - 1; tier++) {
    if (x < plan.table[tier][0]) break;
    x -= plan.table[tier][0];
  }
  const [p, lo, hi] = plan.table[tier];
  const within = p > 0 ? x / p : 0;
  const multX100 = lo + Math.min(hi - lo, Math.floor(within * (hi - lo + 1)));
  const wear = u2 < plan.wear3 ? 3 : u2 < plan.wear3 + plan.wear2 ? 2 : 1;
  return { outcome: names[tier], tier, multX100, wear };
}

/** Base Lightdust B of a dive: (power + attunement) x destination weight, rounded down to 0.01 as on chain. */
export const basePoints = (plan: DivePlan) => Math.floor(((Math.round(plan.power * 100 + plan.bonus * 100)) * plan.coefBp) / 10000) / 100;
/** Base reward in $RVYN: what a dive brings back on a x1.00 result, after the supply cost. The result multiplier is
 *  applied to this. rate = $RVYN per point of Lightdust (on chain: the previous day's realised rate, which depends on
 *  the pool and on how many people dive). */
export const baseReward = (plan: DivePlan, rate: number) => basePoints(plan) * rate * (1 - plan.levy);
/** Today's $RVYN per point of Lightdust: the pool releases 1% a day, shared by everyone's Lightdust that day, never
 *  above the launch guard. It changes every day with the pool and with how many people dive, so every base reward
 *  moves with it (like the summon price). */
export const dailyRate = (pool: number, totalPoints: number) => Math.min(CAP_PER_POINT, (pool * EMISSION) / Math.max(1, totalPoints));
/** A destination's reference base: a team exactly at its threshold, no attunement, no star event. */
export const destinationBase = (d: Destination, rate: number) => d.threshold * d.coef * rate * (1 - d.levy);

// ---------------------------------------------------------------- rewards and fees

export const EMISSION = 0.01; // share of the Core Light Pool released per day
export const CAP_PER_POINT = 0.015; // launch guard: max RVYN per base point per dive
/** Claim fee: 15% right after the last claim, 1 point less each day, free from day 15. */
export const claimFee = (daysSinceClaim: number) => Math.max(0, 15 - Math.floor(daysSinceClaim)) / 100;
export const TAX_TO_POOL = 0.95; // supply levy, claim fee and market tax: 95% pool, 5% burn
export const MARKET_TAX = 0.05;
/** Cards alive at once per kind (spire, prism, seeker), as LightdiveNFT3.maxAlive. Docked and listed cards count. */
export const ALIVE_CAP: Record<Kind, number> = { 0: 3000, 1: 6000, 2: 12000 };
/** Most cards one market transaction can list (LightdiveMarket3.listMany, MAX_BATCH). */
export const LIST_BATCH = 20;
export const MINT_SPLIT = { pool: 0.7, burn: 0.15, treasury: 0.15 };

/** Average multiplier of a table, exactly 1.00 for every base table. */
export const tableAverage = (t: Tier[]) => t.reduce((a, [p, lo, hi]) => a + p * (lo + hi), 0) / 2e6;
