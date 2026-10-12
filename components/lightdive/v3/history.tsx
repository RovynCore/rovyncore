"use client";

// Summon history: every pull you made, how many of each rarity you got against what the public odds would give on
// average, how long since your last 稜光 or better, and each pull with its cards. Every pull is independent: the
// numbers describe luck so far, they do not change the next pull.
import { useMemo, useState } from "react";
import { ODDS_BP, PRICE, type Kind } from "@/lib/lightdive-v3/rules";
import type { Sim, PullRecord, SimNft } from "./sim";
import { RarityGem } from "./kit";
import { KIND, RARITY_COLOR, TIER, ago, fmt } from "./copy";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

type Filter = "all" | Kind;
const FILTERS: { key: Filter; label: string }[] = localized([
  { key: "all", label: "全部" },
  { key: 0, label: "光塔" },
  { key: 1, label: "稜鏡" },
  { key: 2, label: "探索者" },
]);
const HIGH = 3; // 稜光 and above
const PAGE = 8;

/** Pull records, including summons made before records were kept (rebuilt from the cards, without a time). */
function recordsOf(nfts: SimNft[], pulls: PullRecord[]): (PullRecord & { old?: boolean })[] {
  const known = new Set(pulls.map((p) => p.id));
  const legacy = new Map<number, SimNft[]>();
  for (const n of nfts) if (n.mint !== undefined && !known.has(n.mint)) legacy.set(n.mint, [...(legacy.get(n.mint) ?? []), n]);
  const old = [...legacy.entries()].map(([id, cards]) => ({ id, kind: cards[0].kind, qty: cards.length, at: 0, revealAt: 0, paid: PRICE[cards[0].kind] * cards.length, cards: cards.map((c) => c.id), old: true }));
  return [...old.sort((a, b) => a.id - b.id), ...pulls];
}

export function SummonHistory({ sim, onInspect }: { sim: Sim; onInspect: (id: number) => void }) {
  const s = sim.state!;
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(PAGE);
  const byId = useMemo(() => new Map(s.nfts.map((n) => [n.id, n])), [s.nfts]);
  const all = useMemo(() => recordsOf(s.nfts, s.pulls ?? []), [s.nfts, s.pulls]);
  const list = filter === "all" ? all : all.filter((p) => p.kind === filter);
  const stats = useMemo(() => {
    const got = [0, 0, 0, 0, 0];
    const expected = [0, 0, 0, 0, 0];
    let cards = 0, paid = 0, since = 0, seenHigh = false;
    for (const p of list) {
      paid += p.paid;
      for (let r = 0; r < 5; r++) expected[r] += (p.qty * ODDS_BP[p.kind][r]) / 10000;
      for (const id of p.cards) {
        const n = byId.get(id);
        if (!n) continue;
        cards += 1;
        got[n.rarity] += 1;
      }
    }
    // pulls since the last 稜光 or better, counting back from the newest card
    for (let i = list.length - 1; i >= 0 && !seenHigh; i--) {
      const ids = list[i].cards;
      for (let j = ids.length - 1; j >= 0; j--) {
        if ((byId.get(ids[j])?.rarity ?? 0) >= HIGH) { seenHigh = true; break; }
        since += 1;
      }
    }
    const highGot = got[3] + got[4], highExp = expected[3] + expected[4];
    return { got, expected, cards, paid, since, seenHigh, highGot, highExp };
  }, [list, byId]);

  const ratio = (stats.highGot + 0.5) / (stats.highExp + 0.5);
  const luck = stats.cards < 5 ? { label: tl("還看不出來"), tone: "var(--h-text-2)" }
    : ratio >= 1.4 ? { label: tl("手氣很好"), tone: "#ff9d2e" }
    : ratio >= 1.08 ? { label: tl("比平均好"), tone: "#c9ff55" }
    : ratio > 0.8 ? { label: tl("接近平均"), tone: "#7fd3ff" }
    : { label: tl("比平均差"), tone: "#b9c2cc" };

  if (all.length === 0) return null;
  return (
    <section className="v3-history" aria-label={tl("召喚紀錄")}>
      <header className="v3-history__head">
        <div>
          <h3>{tl("召喚紀錄")}</h3>
          <p>{tl("每一抽都是獨立的：下面的數字只是到目前為止的運氣，不會改變下一抽的機率。")}</p>
        </div>
        <div className="v3-history__filters" role="tablist" aria-label={tl("篩選種類")}>
          {FILTERS.map((x) => (
            <button key={String(x.key)} type="button" role="tab" aria-selected={filter === x.key} className={filter === x.key ? "is-on" : ""} onClick={() => { setFilter(x.key); setShown(PAGE); }}>{x.label}</button>
          ))}
        </div>
      </header>

      <div className="v3-history__tiles">
        <div><small>{tl("召喚張數")}</small><b>{stats.cards}</b><em>{tl("{0} 次召喚", { 0: list.length })}</em></div>
        <div><small>{tl("花費")}</small><b>{fmt(stats.paid)}</b><em>$RVYN{list.some((p) => p.old) ? tl("（較早的紀錄以基準價估算）") : ""}</em></div>
        <div><small>{tl("稜光以上")}</small><b>{stats.highGot}</b><em>{tl("依公開機率平均約 {0} 張", { 0: stats.highExp.toFixed(1) })}</em></div>
        <div style={{ ["--lt" as string]: luck.tone }} className="is-luck"><small>{tl("手氣")}</small><b>{luck.label}</b><em>{stats.seenHigh ? tl("距離上一張稜光以上 {0} 抽", { 0: stats.since }) : tl("還沒抽到稜光以上（已 {0} 抽）", { 0: stats.since })}</em></div>
      </div>

      <table className="v3-history__table">
        <thead>
          <tr><th scope="col">{tl("稀有度")}</th><th scope="col">{tl("實際")}</th><th scope="col">{tl("依公開機率的平均")}</th><th scope="col" className="is-bar">{tl("比較")}</th></tr>
        </thead>
        <tbody>
          {[4, 3, 2, 1, 0].map((r) => {
            const a = stats.got[r], e = stats.expected[r];
            const max = Math.max(1, ...stats.got, ...stats.expected);
            return (
              <tr key={r} style={{ ["--rc" as string]: RARITY_COLOR[r] }}>
                <th scope="row"><RarityGem rarity={r} size={16} />{TIER[r]}</th>
                <td><b>{a}</b><small>{stats.cards ? ` ${((a / stats.cards) * 100).toFixed(1)}%` : ""}</small></td>
                <td>{e.toFixed(1)}<small>{stats.cards ? ` ${((e / Math.max(1e-9, stats.expected.reduce((x, y) => x + y, 0))) * 100).toFixed(1)}%` : ""}</small></td>
                <td className="is-bar" aria-hidden="true">
                  <span className="v3-history__bar"><i style={{ width: `${(a / max) * 100}%` }} /><i className="is-exp" style={{ left: `${(e / max) * 100}%` }} /></span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="v3-history__legend"><i className="is-got" />{tl("實際張數")}　<i className="is-exp" />{tl("依公開機率的平均")}</p>

      <ol className="v3-history__list">
        {[...list].reverse().slice(0, shown).map((p) => {
          const cards = p.cards.map((id) => byId.get(id)).filter((n): n is SimNft => !!n);
          const best = cards.reduce((a, n) => Math.max(a, n.rarity), 0);
          return (
            <li key={p.id} style={{ ["--rc" as string]: RARITY_COLOR[best] }} className={best >= HIGH ? "is-high" : ""}>
              <div className="v3-history__meta">
                <b>{KIND[p.kind]} ×{p.qty}</b>
                <small>{p.old ? tl("較早") : ago(sim.now - p.at)}{p.paid ? ` · ${fmt(p.paid)} $RVYN` : ""}</small>
              </div>
              <div className="v3-history__cards">
                {cards.map((n) => (
                  <button key={n.id} type="button" onClick={() => onInspect(n.id)} title={tl("{0}{1} #{2} · 戰力 {3}", { 0: TIER[n.rarity], 1: KIND[n.kind], 2: n.id, 3: n.power })} aria-label={tl("{0}{1} #{2}，戰力 {3}", { 0: TIER[n.rarity], 1: KIND[n.kind], 2: n.id, 3: n.power })} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
                    <RarityGem rarity={n.rarity} size={14} />
                    <span>{n.power}</span>
                  </button>
                ))}
              </div>
              <span className="v3-history__best">{TIER[best]}</span>
            </li>
          );
        })}
      </ol>
      {list.length > shown && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm v3-history__more" onClick={() => setShown((x) => x + PAGE)}>{tl("再顯示 {0} 筆", { 0: Math.min(PAGE, list.length - shown) })}</button>}
    </section>
  );
}
