"use client";

// 金庫: the player's own earnings dashboard. What can be claimed and what it costs right now, what came in and
// went out, how each team is doing, what is about to run out, and every dive.
import { useState } from "react";
import { Anchor, Coins } from "lucide-react";
import { DESTINATIONS, MARKET_TAX, PRICE, RENEW_SHARE, TAX_TO_POOL, claimFee, type Outcome } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { PageHead } from "../game/hud";
import { play } from "./audio";
import { collected, dayOf, owned, type Sim, type SimDive } from "./sim";
import { CountUp, RarityGem, Tile, Voyages, flyLight } from "./kit";
import { CIRCLED, KIND, OUTCOME, OUTCOME_TONE, SLOT, STAR, fmt, pct } from "./copy";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

const DAY = 86_400_000;
const OUTCOMES: Outcome[] = ["empty", "partial", "normal", "good", "great", "legend"];
const CHOICE_NAME = localized({ steady: "求穩", bold: "求險", detour: "繞道", none: "順其自然" } as const);
const destName = (id: number) => {
  const d = DESTINATIONS[id];
  return `${CIRCLED[d.cluster]}${SLOT[d.slot]} ${TEXTS.clusters[d.cluster].destinations[d.slot].name}`;
};
const minus = (v: number) => (v > 0 ? `−${fmt(v)}` : fmt(0));
const date = (day: number) => new Date(day * DAY).toISOString().slice(5, 10).replace("-", "/");

export function Treasury({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const since = (sim.now - s.lastClaimAt) / DAY;
  const fee = claimFee(since);
  const feeTomorrow = claimFee(since + 1);
  const freeIn = Math.max(0, 15 - Math.floor(since));
  const done = s.dives.filter(collected);
  const waiting = s.dives.filter((d) => d.pending);
  const sum = (list: SimDive[]) => list.reduce((a, d) => a + (d.reward ?? 0), 0);
  const within = (days: number) => done.filter((d) => dayOf(d.at) > sim.today - days);
  const brought = sum(done);
  const sales = s.sales ?? [];
  const salesGross = sales.reduce((a, x) => a + x.price, 0);
  const spent = { mint: 0, renew: 0, market: 0, ...s.spent };
  const income = brought + salesGross * (1 - MARKET_TAX);
  const outgo = spent.mint + spent.renew + spent.market;
  const fees = s.levyTotal + (s.feesPaid ?? 0) + salesGross * MARKET_TAX;
  const net = income - outgo - (s.feesPaid ?? 0);

  return (
    <div className="hud-page v3-treasury">
      <PageHead kicker={tl("金庫")} icon="treasury" title={tl("金庫")} lead={tl("你的收益、費用和花費都在這裡。每趟的收益在揭曉時記進「可提領」（正式版在當天結束後結算）。")} />

      <div className="v3-vault">
        <section className="v3-vault__claim">
          <span className="v3-vault__label"><Coins aria-hidden="true" />{tl("可提領")}</span>
          <b className="v3-vault__amount"><CountUp value={s.credit} digits={2} /><em>$RVYN</em></b>
          <div className="v3-tiles is-3">
            <Tile label={tl("現在提領手續費")} value={pct(fee)} sub={fee > 0 ? tl("明天 {0}，再 {1} 天免費", { 0: pct(feeTomorrow), 1: freeIn }) : tl("已經免費")} tone={fee > 0 ? "#ffb26b" : "#c9ff55"} />
            <Tile label={tl("現在提領實拿")} value={fmt(s.credit * (1 - fee))} sub={tl("手續費 {0}", { 0: fmt(s.credit * fee) })} tone="#f0c766" />
            <Tile label={tl("距上次提領")} value={tl("{0} 天", { 0: Math.floor(since) })} sub={tl("{0} 小時", { 0: Math.floor((since % 1) * 24) })} />
          </div>
          <FeeSteps since={since} />
          <button type="button" className="hud-btn hud-btn--gold hud-btn--block v3-vault__cta" disabled={s.credit <= 0} onClick={(e) => { flyLight(e.currentTarget, ".hud-res--wallet", "#c9ff55"); sim.claim(); play("claim"); }}>
            {tl("提領 {0} 到錢包", { 0: fmt(s.credit * (1 - fee)) })}
          </button>
          <p className="v3-muted">{tl("提領手續費從 15% 起每天降 1%，第 15 天起免費；收到的手續費 {0}% 回核光池、{1}% 銷毀。", { 0: Math.round(TAX_TO_POOL * 100), 1: 100 - Math.round(TAX_TO_POOL * 100) })}</p>
        </section>

        <section className="v3-vault__wallet">
          <span className="v3-vault__label">{tl("錢包餘額")}</span>
          <b className="v3-vault__amount is-lime"><CountUp value={s.balance} digits={2} /><em>$RVYN</em></b>
          <div className="v3-tiles is-2">
            <Tile label={tl("累計帶回")} value={fmt(brought)} sub={tl("{0} 趟，已扣出發成本", { 0: done.length })} tone="#c9ff55" />
            <Tile label={tl("累計提領")} value={fmt(s.claimed)} />
            <Tile label={tl("收支淨額")} value={`${net >= 0 ? "+" : ""}${fmt(net)}`} sub={tl("收入 − 花費 − 提領手續費")} tone={net >= 0 ? "#c9ff55" : "#ff8a7a"} />
            <Tile label={tl("市集賣出")} value={fmt(salesGross * (1 - MARKET_TAX))} sub={tl("{0} 筆，已扣交易稅", { 0: sales.length })} />
          </div>
        </section>
      </div>

      <div className="v3-tiles is-6 v3-earn">
        <Tile label={tl("今天")} value={fmt(sum(within(1)))} sub={tl("{0} 趟", { 0: within(1).length })} tone="#c9ff55" />
        <Tile label={tl("昨天")} value={fmt(sum(done.filter((d) => dayOf(d.at) === sim.today - 1)))} />
        <Tile label={tl("近 7 天")} value={fmt(sum(within(7)))} />
        <Tile label={tl("近 30 天")} value={fmt(sum(within(30)))} />
        <Tile label={tl("待收取")} value={waiting.length ? fmt(waiting.reduce((a, d) => a + (d.reward ?? 0), 0)) : "—"} sub={waiting.length ? tl("{0} 趟，到潛光頁確認收取", { 0: waiting.length }) : tl("沒有待收取的結果")} tone={waiting.length ? "#f0c766" : undefined} />
        <Tile label={tl("最佳一趟")} value={done.length ? fmt(Math.max(...done.map((d) => d.reward ?? 0))) : "—"} tone="#f0c766" />
      </div>

      <div className="v3-treasury__grid">
        <Chart sim={sim} />
        <section className="v3-panel v3-flow">
          <h3>{tl("收入與花費")}</h3>
          <dl>
            <dt className="is-head">{tl("收入")}</dt>
            <div><dt>{tl("出發帶回")}</dt><dd className="is-good">+{fmt(brought)}</dd></div>
            <div><dt>{tl("市集賣出（實收）")}</dt><dd className="is-good">+{fmt(salesGross * (1 - MARKET_TAX))}</dd></div>
            <dt className="is-head">{tl("花費")}</dt>
            <div><dt>{tl("召喚")}</dt><dd className="is-bad">{minus(spent.mint)}</dd></div>
            <div><dt>{tl("續航")}</dt><dd className="is-bad">{minus(spent.renew)}</dd></div>
            <div><dt>{tl("市集買入")}</dt><dd className="is-bad">{minus(spent.market)}</dd></div>
            <div><dt>{tl("提領手續費")}</dt><dd className="is-bad">{minus(s.feesPaid ?? 0)}</dd></div>
            <div className="is-total"><dt>{tl("淨額")}</dt><dd className={net >= 0 ? "is-good" : "is-bad"}>{net >= 0 ? "+" : ""}{fmt(net)}</dd></div>
          </dl>
          <h4>{tl("你繳回核光池的費用")}</h4>
          <div className="v3-tiles is-3">
            <Tile label={tl("出發成本")} value={fmt(s.levyTotal)} />
            <Tile label={tl("提領手續費")} value={fmt(s.feesPaid ?? 0)} />
            <Tile label={tl("交易稅")} value={fmt(salesGross * MARKET_TAX)} />
          </div>
          <p className="v3-muted">{tl("合計 {0}；其中 {1}% 回到核光池，再分給所有出發的人。", { 0: fmt(fees), 1: Math.round(TAX_TO_POOL * 100) })}</p>
        </section>
      </div>

      <div className="v3-treasury__grid is-even">
        <Teams sim={sim} />
        <Expiring sim={sim} />
      </div>

      <Outcomes sim={sim} />
      <History sim={sim} />

      <section className="v3-panel v3-pool">
        <h3>{sim.mode === "preview" ? tl("核光池（模擬）") : tl("核光池")}</h3>
        <div className="v3-tiles is-4">
          <Tile label={tl("池子餘額")} value={fmt(sim.pool)} sub={sim.mode === "preview" ? tl("即時變動 · 正式版讀取鏈上") : tl("鏈上即時餘額")} />
          <Tile label={tl("每天釋出")} value={tl("餘額的 1%")} sub={tl("依光塵比例分給所有出發的人")} />
          <Tile label={tl("今日分配率")} value={sim.rate.toFixed(5)} sub={tl("$RVYN／每點光塵 · 昨日 {0}", { 0: sim.rateYesterday.toFixed(5) })} />
          <Tile label={tl("回流")} value="95%" sub={tl("出發成本、手續費、交易稅")} />
        </div>
      </section>
    </div>
  );
}

/** Claim fee by day since the last claim, today highlighted. */
function FeeSteps({ since }: { since: number }) {
  const today = Math.min(15, Math.floor(since));
  return (
    <div className="v3-feesteps" role="img" aria-label={tl("提領手續費：現在 {0}，第 15 天起免費", { 0: pct(claimFee(since)) })}>
      {Array.from({ length: 16 }, (_, d) => (
        <span key={d} className={d === today ? "is-now" : d < today ? "is-past" : ""} style={{ ["--h" as string]: `${(claimFee(d) / 0.15) * 100}%` }}>
          <i />
          {((d % 5 === 0 && Math.abs(d - today) > 1) || d === today) && <small>{d === today ? tl("今天") : tl("第 {0} 天", { 0: d })}</small>}
        </span>
      ))}
    </div>
  );
}

function Chart({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const [span, setSpan] = useState(14);
  const days = Array.from({ length: span }, (_, i) => sim.today - span + 1 + i);
  const rows = days.map((day) => {
    const list = s.dives.filter((d) => collected(d) && dayOf(d.at) === day);
    return { day, v: list.reduce((a, d) => a + (d.reward ?? 0), 0), n: list.length };
  });
  const max = Math.max(0.01, ...rows.map((r) => r.v));
  const total = rows.reduce((a, r) => a + r.v, 0);
  return (
    <section className="v3-panel v3-chart2">
      <header>
        <h3>{tl("每日帶回")}</h3>
        <div className="hud-seg" role="group" aria-label={tl("天數")}>
          {[7, 14, 30].map((n) => <button key={n} type="button" className={span === n ? "is-on" : ""} onClick={() => setSpan(n)}>{tl("{0} 天", { 0: n })}</button>)}
        </div>
      </header>
      <p className="v3-chart2__total">{tl("{0} 天合計", { 0: span })} <b>{fmt(total)}</b> {tl("· 平均每天")} <b>{fmt(total / span)}</b></p>
      <div className={`v3-chart2__bars n${span}`} role="img" aria-label={tl("最近 {0} 天每天帶回的$RVYN", { 0: span })}>
        {rows.map((r) => (
          <span key={r.day} className={r.day === sim.today ? "is-today" : ""} title={tl("{0}：{1}（{2} 趟）", { 0: date(r.day), 1: fmt(r.v), 2: r.n })}>
            {r.v > 0 && span <= 14 && <em>{fmt(r.v, r.v >= 100 ? 0 : 1)}</em>}
            <i style={{ height: `${(r.v / max) * 100}%` }} />
            <small>{span === 30 && r.day % 5 && r.day !== sim.today ? "" : r.day === sim.today ? tl("今天") : date(r.day)}</small>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Each spire's record: dives, what it brought back, average and best multiplier, last result. */
function Teams({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const by = new Map<number, SimDive[]>();
  for (const d of s.dives) if (collected(d)) by.set(d.spire, [...(by.get(d.spire) ?? []), d]);
  const rows = [...by.entries()].map(([id, list]) => {
    const n = s.nfts.find((x) => x.id === id);
    const last = list[list.length - 1];
    return {
      id, n, count: list.length,
      brought: list.reduce((a, d) => a + (d.reward ?? 0), 0),
      avg: list.reduce((a, d) => a + d.result!.multX100, 0) / list.length / 100,
      best: Math.max(...list.map((d) => d.result!.multX100)) / 100,
      last,
    };
  }).sort((a, b) => b.brought - a.brought);
  return (
    <section className="v3-panel v3-teamstats">
      <h3>{tl("各隊表現")}</h3>
      {rows.length ? (
        <table className="v3-table2">
          <thead><tr><th>{tl("光塔")}</th><th>{tl("趟數")}</th><th>{tl("帶回")}</th><th>{tl("平均倍率")}</th><th>{tl("最佳")}</th><th>{tl("上一趟")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.n && <RarityGem rarity={r.n.rarity} size={14} />}{r.n ? tl("光塔 #{0}", { 0: r.id }) : `#${r.id}`}{r.n && !owned(r.n) ? <small>{tl("（已離手）")}</small> : null}</td>
                <td>{r.count}</td>
                <td className="is-good">{fmt(r.brought)}</td>
                <td>×{r.avg.toFixed(2)}</td>
                <td style={{ color: "#f0c766" }}>×{r.best.toFixed(2)}</td>
                <td style={{ color: OUTCOME_TONE[r.last.result!.outcome] }}>{OUTCOME[r.last.result!.outcome]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="v3-empty">{tl("還沒有揭曉的出發。")}</p>}
    </section>
  );
}

/** Cards about to run out of voyages, and docked cards waiting for a renewal. */
function Expiring({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const docked = s.nfts.filter((n) => owned(n) && n.dockedAt !== undefined);
  const low = s.nfts.filter((n) => owned(n) && n.dockedAt === undefined && n.voyages <= 6).sort((a, b) => a.voyages - b.voyages);
  return (
    <section className="v3-panel v3-expiring">
      <h3>{tl("即將到期")} {docked.length + low.length > 0 && <em>{docked.length + low.length}</em>}</h3>
      {!docked.length && !low.length && <p className="v3-empty">{tl("目前沒有快用完航程的卡。")}</p>}
      <ul>
        {docked.map((n) => (
          <li key={n.id} className="is-docked">
            <span><RarityGem rarity={n.rarity} size={14} />{KIND[n.kind]} #{n.id}</span>
            <b><Anchor aria-hidden="true" />{tl("停泊中，剩 {0} 天", { 0: Math.max(0, 7 - Math.floor((sim.now - n.dockedAt!) / DAY)) })}</b>
            <small>{n.renewed ? tl("已續航過，只能歸航") : tl("續航 {0} $RVYN", { 0: fmt(PRICE[n.kind] * RENEW_SHARE) })}</small>
          </li>
        ))}
        {low.map((n) => (
          <li key={n.id}>
            <span><RarityGem rarity={n.rarity} size={14} />{KIND[n.kind]} #{n.id}</span>
            <Voyages n={n} />
            <small>{tl("約 {0} 天後停泊", { 0: Math.ceil(n.voyages / 3) })}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Outcomes({ sim }: { sim: Sim }) {
  const done = sim.state!.dives.filter(collected);
  if (!done.length) return null;
  const count = (o: Outcome) => done.filter((d) => d.result!.outcome === o).length;
  return (
    <section className="v3-panel v3-outcomes">
      <h3>{tl("結果分布")} <em>{tl("{0} 趟", { 0: done.length })}</em></h3>
      <ul>
        {OUTCOMES.map((o) => {
          const c = count(o);
          return (
            <li key={o} style={{ ["--oc" as string]: OUTCOME_TONE[o] }}>
              <span>{OUTCOME[o]}</span>
              <i><b style={{ width: `${(c / done.length) * 100}%` }} /></i>
              <em>{c}</em>
              <small>{((c / done.length) * 100).toFixed(0)}%</small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function History({ sim }: { sim: Sim }) {
  const done = sim.state!.dives.filter(collected).reverse();
  const [limit, setLimit] = useState(20);
  const shown = done.slice(0, limit);
  const groups = new Map<number, SimDive[]>();
  for (const d of shown) groups.set(dayOf(d.at), [...(groups.get(dayOf(d.at)) ?? []), d]);
  return (
    <section className="v3-panel v3-history2">
      <h3>{tl("出發紀錄")}</h3>
      {!done.length && <p className="v3-empty">{tl("還沒有揭曉的出發。")}</p>}
      {[...groups.entries()].map(([day, list]) => (
        <div key={day} className="v3-history2__day">
          <h4>{new Date(day * DAY).toISOString().slice(0, 10)}<em>+{fmt(list.reduce((a, d) => a + (d.reward ?? 0), 0))}</em></h4>
          <ul>
            {list.map((d) => (
              <li key={d.id}>
                <span className="v3-history2__dest">{destName(d.dest)}</span>
                <b style={{ color: OUTCOME_TONE[d.result!.outcome] }}>{OUTCOME[d.result!.outcome]} ×{(d.result!.multX100 / 100).toFixed(2)}</b>
                <span className="v3-history2__tags">
                  <i>{tl("耗損 {0}", { 0: d.result!.wear })}</i>
                  {d.plan.event && <i style={{ color: STAR[d.plan.event].color }}>{STAR[d.plan.event].name}</i>}
                  {d.choice && <i>{CHOICE_NAME[d.choice]}</i>}
                </span>
                <em className="is-good">+{fmt(d.reward ?? 0)}</em>
                <small>{tl("成本")} {fmt(d.levyPaid ?? 0)}</small>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {done.length > limit && <button type="button" className="hud-btn hud-btn--ghost" onClick={() => setLimit((l) => l + 30)}>{tl("顯示更多（還有 {0} 筆）", { 0: done.length - limit })}</button>}
    </section>
  );
}
