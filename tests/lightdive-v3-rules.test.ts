import test from "node:test";
import assert from "node:assert/strict";
import {
  DESTINATIONS, MAX_TEAM, MIN_TEAM, baseTable, choiceTable, dailyRate, destinationBase, nextPrice, outcomesOf, overflowPoints, planDive, resolve, skyOf, tableAverage,
  attunement, PRICE, type TeamInput,
} from "../lib/lightdive-v3/rules.ts";

test("v3 power range is 51 to 1200 and the star map has 24 destinations", () => {
  assert.equal(MIN_TEAM, 51);
  assert.equal(MAX_TEAM, 1200);
  assert.equal(DESTINATIONS.length, 24);
  assert.equal(DESTINATIONS[0].threshold, 51);
  assert.equal(DESTINATIONS[23].coef, 1.765);
});

test("all 18 odds tables sum to 100% and average exactly 1.00", () => {
  for (let c = 0; c < 6; c++) for (const r of [0, 1, 2] as const) {
    const t = baseTable(c, r);
    assert.equal(t.reduce((a, x) => a + x[0], 0), 10000);
    assert.equal(tableAverage(t), 1);
    assert.equal(outcomesOf(t)[0], "empty");
  }
});

test("going one destination deeper always pays more when the dive does not fail", () => {
  for (let i = 1; i < DESTINATIONS.length; i++) {
    const a = DESTINATIONS[i - 1], b = DESTINATIONS[i];
    assert.ok(b.coef * (1 - b.levy) > a.coef * (1 - a.levy), `${i - 1} -> ${i}`);
  }
});

test("overflow stability, attunement cap, star events and choices", () => {
  assert.equal(overflowPoints(600, 300), 5);
  assert.equal(overflowPoints(360, 300), 1);
  assert.equal(overflowPoints(300, 300), 0);
  const team: TeamInput = { spire: 100, prism: { power: 40, beam: 1 }, seekers: [{ power: 200, light: 2 }, { power: 200, light: 2 }] };
  assert.equal(attunement(team, 2), 54); // 60 raw, capped at 10% of 540
  assert.equal(attunement(team, 3), 0);
  const sky = { day: 1, lights: Array(24).fill(0), events: new Map([[8, "storm" as const], [9, "tide" as const]]) };
  const storm = planDive(team, DESTINATIONS[8], sky, "none");
  assert.equal(storm.risk, 2);
  assert.ok(Math.abs(storm.levy - 0.05) < 1e-9);
  const tide = planDive(team, DESTINATIONS[9], sky, "bold");
  assert.equal(tide.risk, 1); // choices no longer move the risk level; they reshape the table
  assert.equal(tide.wear2 + tide.wear3, 0);
  assert.ok(tide.table[0][0] > planDive(team, DESTINATIONS[9], sky, "none").table[0][0]);
  const detour = planDive(team, DESTINATIONS[16], { ...sky, events: new Map() }, "detour");
  assert.equal(detour.wear2 + detour.wear3, 0);
  assert.ok(Math.abs(detour.levy - 0.13) < 1e-9);
});

test("voyage choices: steady never comes back empty, bold chases the top, both keep their averages", () => {
  for (let c = 0; c < 6; c++) for (const r of [0, 1, 2] as const) {
    const base = baseTable(c, r);
    const names = outcomesOf(base);
    const steady = choiceTable(base, "steady");
    const bold = choiceTable(base, "bold");
    for (const t of [steady, bold]) {
      assert.equal(t.reduce((a, x) => a + x[0], 0), 10000);
      assert.ok(t.every((x) => x[0] >= 0 && x[2] >= x[1]));
    }
    assert.equal(steady[0][0], 0);
    for (let i = names.indexOf("good") + 1; i < steady.length; i++) assert.equal(steady[i][0], 0);
    assert.ok(Math.abs(tableAverage(steady) - 0.97) < 0.004, `steady ${c}${r} ${tableAverage(steady)}`);
    assert.ok(Math.abs(tableAverage(bold) - 1.03) < 0.004, `bold ${c}${r} ${tableAverage(bold)}`);
    assert.ok(bold[0][0] > base[0][0]);
    const top = names.indexOf("great");
    assert.ok(bold[top][0] > base[top][0]);
    assert.deepEqual(choiceTable(base, "detour"), base);
  }
});

test("base reward: the daily rate shares 1% of the pool, capped, and the deepest base is far above the first", () => {
  assert.equal(dailyRate(1_000_000, 2_000_000), 0.005);
  assert.equal(dailyRate(1_000_000, 100), 0.015); // launch guard
  const first = destinationBase(DESTINATIONS[0], 0.005), last = destinationBase(DESTINATIONS[23], 0.005);
  assert.ok(Math.abs(first - 0.2474) < 0.001);
  assert.ok(last / first > 30);
  for (let i = 1; i < 24; i++) assert.ok(destinationBase(DESTINATIONS[i], 0.005) > destinationBase(DESTINATIONS[i - 1], 0.005));
});

test("resolve maps uniform draws onto the table and wear is at least 1", () => {
  const team: TeamInput = { spire: 120, seekers: [{ power: 180, light: 0 }] };
  const plan = planDive(team, DESTINATIONS[10], { day: 0, lights: Array(24).fill(5), events: new Map() });
  assert.equal(resolve(plan, 0, 0.99).outcome, "empty");
  const last = resolve(plan, 0.99999, 0.99);
  assert.equal(last.outcome, outcomesOf(plan.table).at(-1));
  assert.ok(last.multX100 <= plan.table.at(-1)![2]);
  assert.equal(resolve(plan, 0.5, 0.01).wear, 2); // cluster 3 has a 10% chance of wear 2
  let n = 0, sum = 0;
  for (let i = 0; i < 20000; i++) { sum += resolve(plan, (i + 0.5) / 20000, 0.5).multX100; n++; }
  assert.ok(Math.abs(sum / n / 100 - 1) < 0.03);
});

test("the sky is the same for everyone on a day and has 4 star events", () => {
  const a = skyOf(20000), b = skyOf(20000);
  assert.deepEqual(a.lights, b.lights);
  assert.equal(a.events.size, 4);
});

test("mint price follows the TWAP 10% a day and stays within 10%..200% of launch", () => {
  let p = PRICE[0];
  for (let i = 0; i < 60; i++) p = nextPrice(0, p, 1, 100); // RVYN 100x more expensive
  assert.equal(p, 5);
  p = PRICE[0];
  p = nextPrice(0, p, 1, 0.5);
  assert.ok(Math.abs(p - 55) < 1e-9);
  for (let i = 0; i < 60; i++) p = nextPrice(0, p, 1, 0.01); // RVYN collapses
  assert.equal(p, 100);
});
