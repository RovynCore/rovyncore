"use client";

// 出航補給 (v3.1): after 出發 the player may buy one supply for the voyage. The price is a share of the dive's x1.00
// reward; the RVYN goes into the Core Light pool (95%) and 5% is burned, as everywhere else in the game.
import { useState } from "react";
import { createPortal } from "react-dom";
import { Rocket, X } from "lucide-react";
import { DESTINATIONS, planDive } from "@/lib/lightdive-v3/rules";
import { stabilityOf, supplyCost, teamInput, type Sim } from "./sim";
import { fmt, pct } from "./copy";
import { tl } from "@/lib/lightdive-v3/i18n";

export type Departure = { spire: number; dest: number; deep?: boolean };

const SUPPLIES = [
  { id: 0, name: () => tl("不帶補給"), effect: () => tl("照原本的勝算與耗損出發。") },
  { id: 1, name: () => tl("燈油"), effect: () => tl("這趟只耗損 1 次航程，不論結果。") },
  { id: 2, name: () => tl("星圖殘頁"), effect: () => tl("空手而歸的機率少 3 個百分點，移到「普通」。") },
];

/** The supply choice for one or more departures (the dispatch-all sends the same supply with every team). */
export function SupplyPrompt({ sim, go, onConfirm, onClose }: { sim: Sim; go: Departure[]; onConfirm: (supply: number) => Promise<void>; onClose: () => void }) {
  const s = sim.state!;
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const plans = go.map((g) => {
    const team = s.teams.find((t) => t.spire === g.spire)!;
    const plain = planDive(teamInput(s, team), DESTINATIONS[g.dest], sim.sky, "none", { stability: stabilityOf(team.bond, 0), deep: g.deep });
    const chart = planDive(teamInput(s, team), DESTINATIONS[g.dest], sim.sky, "none", { stability: stabilityOf(team.bond, 2), deep: g.deep });
    return { g, plain, chart };
  });
  const cost = (supply: number) => plans.reduce((a, p) => a + supplyCost(p.plain, p.g.deep, sim.rate, supply), 0);
  const one = plans.length === 1 ? plans[0] : null;
  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(pick); } finally { setBusy(false); }
  };
  // the destination card is transformed and blurred, which would trap a fixed overlay inside it: render at the game root
  const host = document.querySelector(".ldg-app") ?? document.body;
  return createPortal(
    <div className="v3-modal" role="dialog" aria-label={tl("出航補給")} onClick={onClose}>
      <div className="v3-modal__card v3-supply" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v3-dest__close" onClick={onClose} aria-label={tl("關閉")}><X aria-hidden="true" /></button>
        <span className="hud-kicker">{tl("出航補給")}</span>
        <h2>{plans.length > 1 ? tl("{0} 支隊伍要帶補給嗎？", { 0: plans.length }) : tl("這趟要帶補給嗎？")}</h2>
        <p>{tl("補給的價格是這趟基礎收益的一小部分，付的 $RVYN 有 95% 進核光池、5% 銷毀。一趟只能帶一種。")}</p>
        <div className="v3-supply__list" role="radiogroup" aria-label={tl("補給")}>
          {SUPPLIES.map((x) => {
            const price = cost(x.id);
            const short = price > s.balance;
            return (
              <button key={x.id} type="button" role="radio" aria-checked={pick === x.id} disabled={short} className={pick === x.id ? "is-on" : ""} onClick={() => setPick(x.id)}>
                <b>{x.name()}</b>
                <span>{x.effect()}</span>
                {x.id === 2 && one && (
                  <small>{tl("這趟空手機率 {0} → {1}", { 0: pct(one.plain.table[0][0] / 10_000, 1), 1: pct(one.chart.table[0][0] / 10_000, 1) })}</small>
                )}
                <em>{x.id === 0 ? tl("免費") : short ? tl("{0} $RVYN（不夠）", { 0: fmt(price) }) : tl("{0} $RVYN", { 0: fmt(price) })}</em>
              </button>
            );
          })}
        </div>
        <button type="button" className="hud-btn hud-btn--primary hud-btn--block" disabled={busy} onClick={confirm}>
          <Rocket aria-hidden="true" />{pick ? tl("帶上{0}出發", { 0: SUPPLIES[pick].name() }) : tl("直接出發")}
        </button>
      </div>
    </div>,
    host,
  );
}
