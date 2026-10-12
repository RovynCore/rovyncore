"use client";

// 玩法: the whole game on one page, read top to bottom in a minute. Three steps, how the rewards work, the three
// NFTs, the daily rules, what changes a dive, and the full odds tables folded away at the end.
import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import {
  DESTINATIONS, DIVES_PER_DAY, DIVES_PER_TEAM_PER_DAY, DOCK_DAYS, EMISSION, MARKET_TAX, MAX_TEAM, MAX_TEAMS, MIN_TEAM, MINT_SPLIT, POWER, PRICE,
  RENEW_SHARE, TAX_TO_POOL, VOYAGES, VOYAGE_MINUTES, baseTable, destinationBase, outcomesOf, type Kind,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { GameIcon } from "../game/icon";
import type { IconName } from "../game/icons";
import { PageHead } from "../game/hud";
import { RarityGem } from "./kit";
import type { Sim } from "./sim";
import type { View } from "./pages";
import { BEAM, BEAM_HINT, CHOICE, CIRCLED, KIND, LIGHT, LIGHT_COLOR, OUTCOME, RARITY_COLOR, RISK, SLOT, STAR, TIER, fmt, pct } from "./copy";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

const STEPS: { n: string; icon: IconName; title: string; text: string; to: View; cta: string }[] = localized([
  { n: "1", icon: "fleets", title: "組隊", text: "光塔＋稜鏡＋探索者＝一支隊伍。戰力越高，能去越深的地方。", to: "plain", cta: "去碑原組隊" },
  { n: "2", icon: "expedition", title: "潛光", text: "挑一個目的地出發。航行 {0} 分鐘，途中做一次抉擇。", to: "dive", cta: "去星圖出發" },
  { n: "3", icon: "claim", title: "收取", text: "揭曉後親手收取，收益進金庫，隨時可以提領到錢包。", to: "treasury", cta: "看我的金庫" },
]);

export function Guide({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const [c, setC] = useState(0);
  const [more, setMore] = useState(false);
  return (
    <div className="hud-page v3-guide2">
      <PageHead kicker={tl("玩法")} icon="guide" title={tl("潛光遠征怎麼玩")} lead={tl("組隊 → 出發 → 收取。每天 {0} 張出發令。", { 0: DIVES_PER_DAY })} />

      <section className="v3-steps3" aria-label={tl("三個步驟")}>
        {STEPS.map((s) => (
          <article key={s.n}>
            <span className="v3-steps3__n">{s.n}</span>
            <GameIcon name={s.icon} />
            <h2>{s.title}</h2>
            <p>{s.text.replace("{0}", String(VOYAGE_MINUTES))}</p>
            <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => go(s.to)}>{s.cta}</button>
          </article>
        ))}
      </section>

      <section className="v3-panel v3-p2e" aria-label={tl("收益怎麼來")}>
        <h3>{tl("收益怎麼來")}</h3>
        <ol className="v3-flowline">
          <li><GameIcon name="pool" /><b>{tl("核光池")}</b><small>{tl("預先注入的 $RVYN")}</small></li>
          <li><GameIcon name="clock" /><b>{tl("每天釋出 {0}", { 0: pct(EMISSION) })}</b><small>{tl("池子餘額的 {0}", { 0: pct(EMISSION) })}</small></li>
          <li><GameIcon name="lightdust" /><b>{tl("按光塵比例分")}</b><small>{tl("分給當天出發的所有人")}</small></li>
          <li><GameIcon name="treasury" /><b>{tl("你的金庫")}</b><small>{tl("親手收取後入帳")}</small></li>
          <li><GameIcon name="rvyn" /><b>{tl("提領到錢包")}</b><small>{tl("手續費 15% 起，每天 −1%，第 15 天起免費")}</small></li>
        </ol>
        <div className="v3-tiles is-3">
          <div className="v3-tile"><span>{tl("你的光塵")}</span><b className="v3-formula">{tl("（隊伍戰力 ＋ 同頻）× 目的地係數 × 結果倍率")}</b><small>{tl("光塵越多，分到的比例越大")}</small></div>
          <div className="v3-tile"><span>{tl("總量固定")}</span><b className="v3-formula">{tl("人越多，每人分得越少")}</b><small>{tl("$RVYN 不增發，獎勵只來自核光池")}</small></div>
          <div className="v3-tile"><span>{tl("回流")}</span><b className="v3-formula">{tl("出發成本・提領手續費・交易稅")}</b><small>{tl("{0}% 回核光池、{1}% 銷毀；抽卡費 {2} 回池、{3} 銷毀", { 0: Math.round(TAX_TO_POOL * 100), 1: 100 - Math.round(TAX_TO_POOL * 100), 2: pct(MINT_SPLIT.pool), 3: pct(MINT_SPLIT.burn) })}</small></div>
        </div>
        <p className="v3-muted">{tl("收益取決於參與人數、運氣和 $RVYN 價格，沒有任何保證。合約未經審計。")}</p>
      </section>

      <section className="v3-panel" aria-label={tl("三種 NFT")}>
        <h3>{tl("三種 NFT")}</h3>
        <div className="v3-kinds">
          {([0, 1, 2] as Kind[]).map((k) => (
            <article key={k}>
              <GameIcon name={k === 0 ? "spires" : k === 1 ? "prisms" : "seekers"} />
              <h4>{KIND[k]}</h4>
              <p>{k === 0 ? tl("隊伍的基地。稀有度決定泊位 1～5 個。") : k === 1 ? tl("裝在光塔上，決定風險風格。") : tl("坐上泊位出發。光紋和目的地同頻時多帶回。")}</p>
              <dl>
                <div><dt>{tl("戰力")}</dt><dd>{POWER[k][0][0]}–{POWER[k][4][1]}</dd></div>
                <div><dt>{tl("壽命")}</dt><dd>{tl("{0} 航程（約 {1} 天）", { 0: VOYAGES[k], 1: VOYAGES[k] / 3 })}</dd></div>
                <div><dt>{tl("開賣價")}</dt><dd>{fmt(PRICE[k])} $RVYN</dd></div>
              </dl>
            </article>
          ))}
        </div>
        <div className="v3-lifeline">
          <span><b>{tl("航程用完")}</b>{tl("每趟耗損 1～3")}</span><i />
          <span><b>{tl("停泊 {0} 天", { 0: DOCK_DAYS })}</b>{tl("不能出發")}</span><i />
          <span><b>{tl("續航 1 次")}</b>{tl("原價 {0}，航程回滿", { 0: pct(RENEW_SHARE) })}</span><i />
          <span><b>{tl("歸航")}</b>{tl("再用完或沒續航就燒毀")}</span>
        </div>
        <ul className="v3-tiers">
          {TIER.map((t, r) => <li key={t} style={{ ["--rc" as string]: RARITY_COLOR[r] }}><RarityGem rarity={r} size={22} /><b>{t}</b></li>)}
        </ul>
      </section>

      <section className="v3-panel" aria-label={tl("每天的規則")}>
        <h3>{tl("每天的規則")}</h3>
        <div className="v3-tiles is-6">
          <div className="v3-tile"><span>{tl("出發令")}</span><b>{tl("{0} 張", { 0: DIVES_PER_DAY })}</b><small>{tl("UTC 00:00 重置")}</small></div>
          <div className="v3-tile"><span>{tl("同一隊")}</span><b>{tl("{0} 次／天", { 0: DIVES_PER_TEAM_PER_DAY })}</b></div>
          <div className="v3-tile"><span>{tl("隊伍上限")}</span><b>{tl("{0} 支", { 0: MAX_TEAMS })}</b><small>{tl("同時組建")}</small></div>
          <div className="v3-tile"><span>{tl("隊伍戰力")}</span><b>{MIN_TEAM}–{MAX_TEAM}</b></div>
          <div className="v3-tile"><span>{tl("航行")}</span><b>{tl("{0} 分鐘", { 0: VOYAGE_MINUTES })}</b><small>{tl("一次抉擇")}</small></div>
          <div className="v3-tile"><span>{tl("揭曉後")}</span><b>{tl("親手收取")}</b><small>{tl("沒收取不能再出發")}</small></div>
        </div>
      </section>

      <section className="v3-panel" aria-label={tl("影響一趟結果的事")}>
        <h3>{tl("影響一趟結果的事")}</h3>
        <div className="v3-factors">
          <article><h4>{tl("目的地深度")}</h4><p>{tl("6 個星團、24 個目的地。越深門檻越高、帶回越多，空手機率和出發成本（3%～13%）也越高。基礎收益從最淺的 {0} 到最深的 {1} $RVYN（門檻隊伍、今日分配率；每天跟著核光池和參與人數調整）。", { 0: fmt(destinationBase(DESTINATIONS[0], sim.rate)), 1: fmt(destinationBase(DESTINATIONS[23], sim.rate)) })}</p></article>
          <article><h4>{tl("稜鏡光束")}</h4><p>{BEAM.map((b, i) => tl("{0}＝{1}", { 0: b, 1: BEAM_HINT[i] })).join(tl("、"))}{tl("。平均倍率都相同，只改變波動。")}</p></article>
          <article><h4>{tl("光紋同頻")}</h4><p>{tl("探索者光紋和目的地今天的光相同：每位 +15% 自身戰力，整隊最多 +10%。")}<span className="v3-lights">{LIGHT.map((l, i) => <i key={l} style={{ color: LIGHT_COLOR[i] }}>● {l}</i>)}</span></p></article>
          <article><h4>{tl("今日星象")}</h4><p>{(["tide", "surge", "storm", "calm"] as const).map((e) => <span key={e} className="v3-star" style={{ color: STAR[e].color }}>{STAR[e].name}<small>{STAR[e].effect}</small></span>)}</p></article>
          <article><h4>{tl("超出門檻")}</h4><p>{tl("戰力每超過目的地門檻 20%，空手機率 −1 個百分點，最多 −5。")}</p></article>
          <article><h4>{tl("航行抉擇")}</h4><p>{(["steady", "bold", "detour", "none"] as const).map((x) => <span key={x} className="v3-star"><b>{CHOICE[x].name}</b><small>{CHOICE[x].effect}</small></span>)}</p></article>
        </div>
      </section>

      <section className="v3-panel" aria-label={tl("24 個目的地與勝算表")}>
        <button type="button" className="v3-fold" aria-expanded={more} onClick={() => setMore((m) => !m)}>
          <h3>{tl("24 個目的地與勝算表")}</h3><span>{tl("所有機率公開")}</span><ChevronDown aria-hidden="true" />
        </button>
        {more && (
          <>
            <div className="hud-seg" role="group">
              {TEXTS.clusters.map((x, i) => <button key={i} type="button" className={c === i ? "is-on" : ""} onClick={() => setC(i)}>{CIRCLED[i]} {x.name}</button>)}
            </div>
            <p className="hud-dim">{tl("{0} 風險：{1}。出發成本 {2}；耗損：", { 0: TEXTS.clusters[c].intro, 1: RISK[c], 2: pct(DESTINATIONS[c * 4].levy) })}{DESTINATIONS[c * 4].wear2 ? tl("{0} 耗損 2、{1} 耗損 3", { 0: pct(DESTINATIONS[c * 4].wear2, 1), 1: pct(DESTINATIONS[c * 4].wear3, 1) }) : tl("一律 1")}{tl("。")}</p>
            <table className="v3-table">
              <thead><tr><th>{tl("目的地")}</th><th>{tl("門檻")}</th><th>{tl("收益係數")}</th><th>{tl("基礎收益（門檻隊伍）")}</th><th>{tl("今天的光")}</th></tr></thead>
              <tbody>{[0, 1, 2, 3].map((i) => { const d = DESTINATIONS[c * 4 + i]; return <tr key={i}><td>{SLOT[i]} {TEXTS.clusters[c].destinations[i].name}</td><td>{d.threshold}</td><td>×{d.coef.toFixed(3)}</td><td>{fmt(destinationBase(d, sim.rate))} $RVYN</td><td style={{ color: LIGHT_COLOR[sim.sky.lights[d.id]] }}>{LIGHT[sim.sky.lights[d.id]]}</td></tr>; })}</tbody>
            </table>
            <table className="v3-table">
              <thead><tr><th>{tl("結果")}</th>{BEAM.map((b, i) => <th key={b}>{tl("{0}（{1}）", { 0: b, 1: BEAM_HINT[i] })}</th>)}</tr></thead>
              <tbody>
                {(["empty", "partial", "normal", "good", "great", "legend"] as const).map((o) => {
                  const cells = ([0, 1, 2] as const).map((r) => { const t = baseTable(c, r); const i = outcomesOf(t).indexOf(o); return i < 0 ? "—" : `${t[i][0] / 100}%${t[i][2] ? ` · ×${(t[i][1] / 100).toFixed(2)}–${(t[i][2] / 100).toFixed(2)}` : ""}`; });
                  if (cells.every((x) => x === "—")) return null;
                  return <tr key={o}><td>{OUTCOME[o]}</td>{cells.map((x, i) => <td key={i}>{x}</td>)}</tr>;
                })}
              </tbody>
            </table>
            <p className="v3-muted">{tl("每張表的平均倍率都是 1.00。市集成交時從賣方收 {0} 交易稅。", { 0: pct(MARKET_TAX) })}</p>
          </>
        )}
      </section>

      <p className="v3-muted"><button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => { if (window.confirm(tl("重置預覽資料？目前的卡片和紀錄會清掉。"))) sim.reset(); }}><RotateCcw aria-hidden="true" />{tl("重置預覽資料")}</button></p>
    </div>
  );
}
