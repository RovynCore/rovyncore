"use client";

// Rules v3 return calculator, for the team only (admin page). Players are not shown estimates: the rules are
// public and they do their own sums. Pure math on the rulebook, no wallet and no game state.
import { useState } from "react";
import {
  CAP_PER_POINT, DESTINATIONS, EMISSION, MAX_TEAM, MIN_TEAM, PRICE, VOYAGES, basePoints, planDive, resolve, seeded,
  type Beam, type Destination, type TeamInput,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { BEAM, BEAM_HINT, CIRCLED, SLOT, fmt, pct } from "./copy";

const NO_SKY = { day: 0, lights: Array(24).fill(-2), events: new Map() };
const destName = (d: Destination) => `${CIRCLED[d.cluster]}${SLOT[d.slot]} ${TEXTS.clusters[d.cluster].destinations[d.slot].name}`;

function estimate(power: number, beam: Beam, d: Destination, rate: number) {
  const input: TeamInput = { spire: Math.max(0, power - 1), prism: { power: 0, beam }, seekers: [{ power: 1, light: -1 }] };
  const plan = planDive(input, d, NO_SKY);
  const points = basePoints(plan);
  const r = seeded(7);
  const runs = Array.from({ length: 4000 }, () => points * rate * (resolve(plan, r(), r()).multX100 / 100) * (1 - plan.levy)).sort((a, b) => a - b);
  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const wear = 1 + plan.wear2 + 2 * plan.wear3;
  return { plan, points, mean, p10: runs[400], p50: runs[2000], p90: runs[3600], empty: plan.table[0][0] / 100, wear };
}

export function RulesCalculator() {
  const [power, setPower] = useState(166);
  const [beam, setBeam] = useState<Beam>(1);
  const [others, setOthers] = useState(2000);
  const [otherPower, setOtherPower] = useState(180);
  const [pool, setPool] = useState(1_000_000);
  const reach = DESTINATIONS.filter((d) => power >= d.threshold);
  const [destId, setDestId] = useState<number | null>(null);
  const d = reach.find((x) => x.id === destId) ?? reach.at(-1) ?? DESTINATIONS[0];

  const out = (() => {
    const mine = estimate(power, beam, d, 1).points;
    const othersPoints = others * 3 * otherPower * 1.2;
    const rate = Math.min(CAP_PER_POINT, (pool * EMISSION) / (othersPoints + mine * 3));
    const e = estimate(power, beam, d, rate);
    const lifeDays = VOYAGES[0] / 3 / e.wear;
    const cost = PRICE[0] + PRICE[1] + Math.max(1, Math.round((power - 60) / 70)) * PRICE[2] * (VOYAGES[0] / VOYAGES[2]);
    const table = DESTINATIONS.filter((x) => power >= x.threshold).map((x) => ({ d: x, ...estimate(power, beam, x, rate) }));
    return { rate, ...e, perDay: e.mean * 3, lifeDays, life: e.mean * 3 * lifeDays, cost, table };
  })();

  return (
    <section className="ld-sub ld-calc">
      <h3>收益試算（內部用，玩家看不到）</h3>
      <div className="ld-grid3">
        <div className="ld-card">
          <h3>隊伍</h3>
          <label className="ld-qty"><span>戰力</span><b>{power}</b><input type="range" min={MIN_TEAM} max={MAX_TEAM} value={power} onChange={(e) => setPower(Number(e.target.value))} /></label>
          <label className="ld-qty"><span>稜鏡</span><span />
            <select value={beam} onChange={(e) => setBeam(Number(e.target.value) as Beam)}>{BEAM.map((b, i) => <option key={b} value={i}>{b}（{BEAM_HINT[i]}）</option>)}</select>
          </label>
          <label className="ld-qty"><span>目的地</span><span />
            <select value={d.id} onChange={(e) => setDestId(Number(e.target.value))}>{reach.map((x) => <option key={x.id} value={x.id}>{destName(x)}（{x.threshold}）</option>)}</select>
          </label>
        </div>
        <div className="ld-card">
          <h3>環境</h3>
          <label className="ld-qty"><span>其他隊伍</span><b>{others.toLocaleString()}</b><input type="range" min={10} max={10000} step={10} value={others} onChange={(e) => setOthers(Number(e.target.value))} /></label>
          <label className="ld-qty"><span>平均戰力</span><b>{otherPower}</b><input type="range" min={60} max={600} value={otherPower} onChange={(e) => setOtherPower(Number(e.target.value))} /></label>
          <label className="ld-qty"><span>核光池</span><b>{pool.toLocaleString()}</b><input type="range" min={100_000} max={3_000_000} step={50_000} value={pool} onChange={(e) => setPool(Number(e.target.value))} /></label>
          <p className="ld-dim">每點光塵 {out.rate.toFixed(5)} RVYN（上限 {CAP_PER_POINT}）</p>
        </div>
        <div className="ld-card">
          <h3>這個目的地</h3>
          <dl className="ld-dl">
            <dt>每趟平均</dt><dd>{fmt(out.mean)}</dd>
            <dt>空手機率</dt><dd>{out.empty}%</dd>
            <dt>後 10% ／ 中位 ／ 前 10%</dt><dd>{fmt(out.p10)} ／ {fmt(out.p50)} ／ {fmt(out.p90)}</dd>
            <dt>每天 3 趟</dt><dd>{fmt(out.perDay)}</dd>
            <dt>光塔一輪（約 {Math.round(out.lifeDays)} 天）</dt><dd>{fmt(out.life, 0)}</dd>
            <dt>一輪成本（開賣價）</dt><dd>{fmt(out.cost, 0)}</dd>
            <dt>出發成本</dt><dd>{pct(out.plan.levy)}</dd>
          </dl>
        </div>
      </div>
      <table className="ld-table">
        <thead><tr><th>目的地</th><th>門檻</th><th>係數</th><th>每趟平均</th><th>空手</th><th>平均耗損</th></tr></thead>
        <tbody>
          {out.table.map((x) => (
            <tr key={x.d.id}><td>{destName(x.d)}</td><td>{x.d.threshold}</td><td>×{x.d.coef.toFixed(3)}</td><td>{fmt(x.mean)}</td><td>{x.empty}%</td><td>{x.wear.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
