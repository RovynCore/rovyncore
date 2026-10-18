"use client";

// 航海紀錄: the player's own records and honorary titles, the footprints (two story fragments per destination,
// opened by the results collected there) and this week's boards. Honour only: nothing here pays anything, and the
// boards count voyages, depth and luck, never earnings.
import { useEffect, useMemo, useState } from "react";
import { Lock } from "lucide-react";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { FOOTPRINTS, FOOTPRINT_UNLOCK } from "@/lib/lightdive-v3/footprints";
import { gameLocale, tl } from "@/lib/lightdive-v3/i18n";
import { PageHead } from "../game/hud";
import { Tile } from "./kit";
import { CIRCLED, CLUSTER_HUE, OUTCOME, OUTCOME_TONE, SLOT } from "./copy";
import { dayOf, type FeedRow, type Sim, type SimDive } from "./sim";

const DAY = 86_400_000;
const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;
const SEEN_KEY = "lightdive:v3:footprints-seen";

/** Results the player has collected (the only ones that count here). */
const done = (d: SimDive) => !!d.result && !d.pending;

export type Records = {
  dives: number;
  visited: number[]; // collected results per destination
  places: number;
  deepest: number | null;
  bestMult: number;
  legends: number;
  greats: number;
  streak: number;
  // v3.1
  deepDives: number;
  deepLegends: number;
  turnedBack: number;
  maxBond: number;
  supplyDays: number; // longest run of days with a supply on every departure
  commissions: number;
};

export function recordsOf(sim: Sim): Records {
  const s = sim.state!;
  const list = s.dives.filter(done);
  const visited = Array.from({ length: 24 }, (_, i) => list.filter((d) => d.dest === i).length);
  const days = new Set(s.dives.map((d) => dayOf(d.at)));
  // consecutive days with a departure, ending today (or yesterday, while today has none yet)
  let streak = 0;
  for (let day = days.has(sim.today) ? sim.today : sim.today - 1; days.has(day); day--) streak++;
  // days on which every departure carried a supply, and the longest run of them
  const supplied = new Set([...days].filter((day) => s.dives.filter((d) => dayOf(d.at) === day).every((d) => (d.supply ?? 0) > 0)));
  let supplyDays = 0;
  for (const day of supplied) { let n = 0; while (supplied.has(day - n)) n++; supplyDays = Math.max(supplyDays, n); }
  const bit3 = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
  return {
    dives: list.length,
    visited,
    places: visited.filter((n) => n > 0).length,
    deepest: list.length ? Math.max(...list.map((d) => d.dest)) : null,
    bestMult: list.reduce((a, d) => Math.max(a, d.result!.multX100), 0),
    legends: list.filter((d) => d.result!.outcome === "legend").length,
    greats: list.filter((d) => d.result!.outcome === "great" || d.result!.outcome === "legend").length,
    streak,
    deepDives: list.filter((d) => d.deep).length,
    deepLegends: list.filter((d) => d.deep && !d.turnedBack && d.result!.outcome === "legend").length,
    turnedBack: list.filter((d) => d.turnedBack).length,
    maxBond: Math.max(0, ...s.teams.map((t) => t.bond ?? 0), ...s.dives.map((d) => d.bond ?? 0)),
    supplyDays,
    commissions: s.commissionsDone ?? Object.values(s.commissionMarks ?? {}).reduce((a, m) => a + bit3(m), 0),
  };
}

/** How many footprint fragments are open: the count drives the menu badge. */
export function openFootprints(r: Records) {
  return FOOTPRINTS.filter((f) => r.visited[f.dest] >= FOOTPRINT_UNLOCK[f.n - 1]).length;
}
export function unseenFootprints(r: Records) {
  let seen = 0;
  try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch {}
  return Math.max(0, openFootprints(r) - seen);
}

type Title = { name: string; how: string; got: boolean };
function titlesOf(r: Records): Title[] {
  const deepCluster = r.deepest === null ? -1 : DESTINATIONS[r.deepest].cluster;
  const cluster = (c: number, name: string) => ({ name, how: tl("在 {0} {1} 收下結果", { 0: CIRCLED[c], 1: TEXTS.clusters[c].name }), got: deepCluster >= c });
  return [
    { name: tl("初航者"), how: tl("收下第一趟結果"), got: r.dives > 0 },
    cluster(1, tl("礁海常客")),
    cluster(2, tl("碑影行者")),
    cluster(3, tl("霧中人")),
    cluster(4, tl("裂光倖存者")),
    cluster(5, tl("星冠見證者")),
    { name: tl("傳說帶回者"), how: tl("帶回一次傳說"), got: r.legends > 0 },
    { name: tl("恆光航者"), how: tl("連續 7 天出航"), got: r.streak >= 7 },
    { name: tl("二十四地"), how: tl("二十四個目的地都去過"), got: r.places >= 24 },
    // v3.1
    { name: tl("深淵初探"), how: tl("完成第一趟深潛"), got: r.deepDives > 0 },
    { name: tl("深淵帶光者"), how: tl("深潛帶回一次傳說"), got: r.deepLegends > 0 },
    { name: tl("知進退"), how: tl("深潛時選擇回航一次"), got: r.turnedBack > 0 },
    { name: tl("同舟"), how: tl("一支隊伍的默契達到 5"), got: r.maxBond >= 5 },
    { name: tl("有備而行"), how: tl("連續 7 天，每一趟出發都帶補給"), got: r.supplyDays >= 7 },
    { name: tl("受託人"), how: tl("完成 10 個每日委託"), got: r.commissions >= 10 },
    { name: tl("老練受託人"), how: tl("完成 50 個每日委託"), got: r.commissions >= 50 },
  ];
}

type Row = { who: string; me: boolean; dives: number; deepest: number; best: number; legends: number };

/** This week's boards: everyone's dives of the last 7 days, the player's own added from state. */
function boardsOf(sim: Sim): Row[] {
  const s = sim.state!;
  const since = (sim.today - 6) * DAY;
  const by = new Map<string, Row>();
  const add = (who: string, me: boolean, r: Pick<FeedRow, "dest" | "outcome" | "mult">) => {
    const row = by.get(who) ?? { who, me, dives: 0, deepest: -1, best: 0, legends: 0 };
    row.dives += 1;
    row.deepest = Math.max(row.deepest, r.dest);
    row.best = Math.max(row.best, r.mult ?? 0);
    if (r.outcome === "legend") row.legends += 1;
    by.set(who, row);
  };
  for (const o of sim.week) if (o.at >= since) add(o.who, false, o);
  for (const d of s.dives) if (d.at >= since) add(tl("你"), true, { dest: d.dest, outcome: d.result?.outcome, mult: d.result?.multX100 });
  return [...by.values()];
}

export function Logbook({ sim }: { sim: Sim }) {
  const r = recordsOf(sim);
  const titles = titlesOf(r);
  const rows = useMemo(() => boardsOf(sim), [sim]);
  const opened = openFootprints(r);
  // opening this page counts every open fragment as seen (clears the menu badge)
  useEffect(() => { try { localStorage.setItem(SEEN_KEY, String(opened)); } catch {} }, [opened]);
  const lang = gameLocale();
  const [cluster, setCluster] = useState(0);

  return (
    <div className="hud-page v3-logbook">
      <PageHead kicker={tl("航海紀錄")} icon="voyage" title={tl("航海紀錄")} lead={tl("你走過的地方、留下的紀錄，和每個目的地的故事。這一頁只記榮譽，不影響任何收益。")} />

      <div className="v3-tiles is-6">
        <Tile label={tl("收下的結果")} value={r.dives} sub={tl("趟")} />
        <Tile label={tl("到過的目的地")} value={`${r.places} / 24`} />
        <Tile label={tl("最深到達")} value={r.deepest === null ? "—" : `${CIRCLED[DESTINATIONS[r.deepest].cluster]}${SLOT[DESTINATIONS[r.deepest].slot]}`} sub={r.deepest === null ? undefined : destName(r.deepest)} tone="#3de7e0" />
        <Tile label={tl("最高倍率")} value={r.bestMult ? `×${(r.bestMult / 100).toFixed(2)}` : "—"} tone="#f0c766" />
        <Tile label={tl("傳說")} value={r.legends} sub={tl("大豐收以上 {0} 次", { 0: r.greats })} tone="#fff4d6" />
        <Tile label={tl("連續出航")} value={tl("{0} 天", { 0: r.streak })} />
      </div>

      <section className="v3-panel">
        <h3>{tl("稱號")} <em>{titles.filter((t) => t.got).length}/{titles.length}</em></h3>
        <ul className="v3-titles">
          {titles.map((t) => (
            <li key={t.name} className={t.got ? "is-got" : ""}>
              <b>{t.got ? t.name : <><Lock aria-hidden="true" />{t.name}</>}</b>
              <small>{t.how}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="v3-panel v3-footprints">
        <h3>{tl("足跡")} <em>{opened}/{FOOTPRINTS.length}</em></h3>
        <p className="v3-muted">{tl("在一個目的地第一次收下結果，會打開那裡的第一段故事；收下 {0} 次，打開第二段。", { 0: FOOTPRINT_UNLOCK[1] })}</p>
        <div className="v3-footprints__tabs" role="tablist">
          {TEXTS.clusters.map((c, i) => {
            const n = FOOTPRINTS.filter((f) => DESTINATIONS[f.dest].cluster === i && r.visited[f.dest] >= FOOTPRINT_UNLOCK[f.n - 1]).length;
            return (
              <button key={i} type="button" role="tab" aria-selected={cluster === i} className={cluster === i ? "is-on" : ""} style={{ ["--hue" as string]: CLUSTER_HUE[i] }} onClick={() => setCluster(i)}>
                {CIRCLED[i]} {c.name}<small>{n}/8</small>
              </button>
            );
          })}
        </div>
        <div className="v3-footprints__list">
          {DESTINATIONS.filter((d) => d.cluster === cluster).map((d) => (
            <article key={d.id} style={{ ["--hue" as string]: CLUSTER_HUE[d.cluster] }}>
              <header>
                <b>{SLOT[d.slot]} {destName(d.id)}</b>
                <small>{r.visited[d.id] ? tl("收下 {0} 次", { 0: r.visited[d.id] }) : tl("還沒去過")}</small>
              </header>
              {FOOTPRINTS.filter((f) => f.dest === d.id).map((f) => {
                const need = FOOTPRINT_UNLOCK[f.n - 1];
                return r.visited[d.id] >= need
                  ? <p key={f.n} className="v3-footprint">{f.text[lang]}</p>
                  : <p key={f.n} className="v3-footprint is-locked"><Lock aria-hidden="true" />{need === 1 ? tl("第一次在這裡收下結果時打開") : tl("在這裡收下 {0} 次時打開（{1}/{0}）", { 0: need, 1: r.visited[d.id] })}</p>;
              })}
            </article>
          ))}
        </div>
      </section>

      <section className="v3-panel">
        <h3>{tl("本週排行")}</h3>
        <p className="v3-muted">{tl("最近 7 天全服的出航。只排榮譽：出航次數、最深到達、最高倍率和傳說次數。")}</p>
        <div className="v3-boards">
          <Board title={tl("出航最多")} rows={rows} value={(x) => x.dives} show={(x) => tl("{0} 趟", { 0: x.dives })} />
          <Board title={tl("最深到達")} rows={rows.filter((x) => x.deepest >= 0)} value={(x) => x.deepest} show={(x) => `${CIRCLED[DESTINATIONS[x.deepest].cluster]}${SLOT[DESTINATIONS[x.deepest].slot]} ${destName(x.deepest)}`} />
          <Board title={tl("最高倍率")} rows={rows.filter((x) => x.best > 0)} value={(x) => x.best} show={(x) => `×${(x.best / 100).toFixed(2)}`} />
          <Board title={OUTCOME.legend} rows={rows.filter((x) => x.legends > 0)} value={(x) => x.legends} show={(x) => tl("{0} 次", { 0: x.legends })} tone={OUTCOME_TONE.legend} />
        </div>
      </section>
    </div>
  );
}

function Board({ title, rows, value, show, tone }: { title: string; rows: Row[]; value: (r: Row) => number; show: (r: Row) => string; tone?: string }) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const top = sorted.slice(0, 10);
  const mine = sorted.findIndex((x) => x.me);
  return (
    <div className="v3-board" style={tone ? { ["--tone" as string]: tone } : undefined}>
      <b>{title}</b>
      {!top.length ? <p className="v3-muted">{tl("這週還沒有紀錄。")}</p> : (
        <ol>
          {top.map((x, i) => <li key={x.who} className={x.me ? "is-me" : ""}><i>{i + 1}</i><span>{x.who}</span><em>{show(x)}</em></li>)}
          {mine >= 10 && <li className="is-me is-far"><i>{mine + 1}</i><span>{sorted[mine].who}</span><em>{show(sorted[mine])}</em></li>}
        </ol>
      )}
    </div>
  );
}
