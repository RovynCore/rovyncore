"use client";

// 每日委託 (v3.1): three commissions a UTC day, the same for everyone and derived from the day alone (nobody sets
// them). One at a time; a voyage that departs after accepting and meets the commission completes it on its own at the
// reveal (v3.3), for 10% of that voyage's x1.00 reward. On chain, accepting costs nothing: the next dive takes it.
import { useState } from "react";
import { Anchor, Check, Gem, Orbit, Package, Rocket, Sparkles, Star, Users, X, type LucideIcon } from "lucide-react";
import type { Commission } from "@/lib/lightdive-v3/commissions";
import { tl } from "@/lib/lightdive-v3/i18n";
import { PageHead } from "../game/hud";
import { CIRCLED, ERROR, OUTCOME, clock, fmt, pct } from "./copy";
import { dayOf, type Sim } from "./sim";
import type { View } from "./pages";

const TITLES: Record<Commission["kind"], () => string> = {
  cluster: () => tl("星團巡航"),
  good: () => tl("滿載而歸"),
  bond: () => tl("老搭檔"),
  attuned: () => tl("同頻共鳴"),
  sky: () => tl("追星"),
  deep: () => tl("深處的光"),
  supply: () => tl("補給充足"),
};

export const commissionTitle = (c: Commission) => TITLES[c.kind]();
/** Each kind's emblem and colour on its card (10-19). */
const KIND_LOOK: Record<Commission["kind"], { icon: LucideIcon; hue: string }> = {
  cluster: { icon: Orbit, hue: "#3de7e0" },
  good: { icon: Gem, hue: "#f0c766" },
  bond: { icon: Users, hue: "#9fe8d6" },
  attuned: { icon: Sparkles, hue: "#c9ff55" },
  sky: { icon: Star, hue: "#b8c4ff" },
  deep: { icon: Anchor, hue: "#7fd3ff" },
  supply: { icon: Package, hue: "#ffb37a" },
};

/** What the commission asks, in one sentence. */
export function commissionText(c: Commission) {
  switch (c.kind) {
    case "cluster": return tl("到第{0}星團的任一目的地，帶回光（不是空手而歸）。", { 0: CIRCLED[c.param] });
    case "good": return tl("帶回「{0}」或更好的結果。", { 0: OUTCOME.good });
    case "bond": return tl("派默契至少 {0} 的隊伍出發（同一組人平安回來一趟，默契 +1）。", { 0: c.param });
    case "attuned": return tl("帶著同頻的探索者出發（探索者的光紋和目的地今天的光相同）。");
    case "sky": return tl("前往今天有星象的目的地。");
    case "deep": return tl("完成一趟深潛（第③星團以後）。");
    case "supply": return tl("帶任一種補給出發。");
  }
}

/** Today's commission state, for the menu badge: how many can be taken (none while one is active). */
export function commissionBadge(sim: Sim) {
  const c = sim.commissions;
  if (c.active !== null) return 0;
  return c.list.filter((x) => !c.done.includes(x.index) && !c.abandoned.includes(x.index)).length;
}

function useCommissionActions() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (f: () => Promise<string | null | void>) => {
    setBusy(true);
    setError(null);
    try {
      const e = await f();
      if (e) setError(ERROR[e] ?? e);
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, act };
}

/** The voyage of today that completed commission `index`, with the bonus it paid. */
export function completedBy(sim: Sim, index: number) {
  return sim.state?.dives.find((d) => d.commission?.index === index && dayOf(d.at) === sim.today) ?? null;
}

function CommissionCard({ sim, c, go, compact }: { sim: Sim; c: Commission; go: (v: View) => void; compact?: boolean }) {
  const cm = sim.commissions;
  const { busy, error, act } = useCommissionActions();
  const done = cm.done.includes(c.index);
  const dropped = cm.abandoned.includes(c.index);
  const active = cm.active === c.index;
  const blocked = cm.active !== null && !active;
  const by = done ? completedBy(sim, c.index) : null;
  const state = done ? "is-done" : dropped ? "is-dropped" : blocked ? "is-blocked" : active ? "is-active" : "";
  const look = KIND_LOOK[c.kind];
  const Icon = look.icon;
  return (
    <li className={`v3-comm ${state}`} style={{ ["--ck" as string]: look.hue }}>
      <div className="v3-comm__head">
        <span className="v3-comm__icon" aria-hidden="true"><Icon /></span>
        <span className="v3-comm__kicker">{done ? tl("已完成") : dropped ? tl("已放棄") : active ? (cm.queued ? tl("下一趟帶上") : tl("進行中")) : tl("委託 {0}", { 0: c.index + 1 })}</span>
      </div>
      <b>{TITLES[c.kind]()}</b>
      <p>{commissionText(c)}</p>
      {!compact && <small className="v3-comm__reward">{tl("獎勵：符合的那一趟基礎收益的 {0}，進金庫。", { 0: pct(cm.bonus) })}</small>}
      <div className="v3-comm__foot">
      {done ? (
        <span className="v3-comm__mark"><Check aria-hidden="true" />{by?.commission ? tl("今天完成了（+{0} $RVYN）", { 0: fmt(by.commission.bonus) }) : tl("今天完成了")}</span>
      ) : dropped ? (
        <span className="v3-comm__mark">{tl("今天不能再接")}</span>
      ) : active ? (
        <div className="v3-comm__row">
          <button type="button" className="hud-btn hud-btn--gold" onClick={() => go("dive")}><Rocket aria-hidden="true" />{tl("去出發")}</button>
          <button type="button" className="hud-btn hud-btn--ghost" disabled={busy} onClick={() => act(() => cm.abandon())}><X aria-hidden="true" />{cm.queued ? tl("不帶了") : tl("放棄委託")}</button>
        </div>
      ) : blocked ? (
        <span className="v3-comm__mark">{tl("先完成或放棄手上的委託")}</span>
      ) : (
        <button type="button" className="hud-btn hud-btn--primary hud-btn--block" disabled={busy} onClick={() => act(() => cm.accept(c.index))}>
          {tl("接受委託")}
        </button>
      )}
      {active && <small className="v3-comm__hint">{cm.queued ? tl("下一趟出發時一起接下，不用另外簽錢包；符合條件的話，揭曉時自動完成。") : tl("接下之後出發的航程才算；符合條件的話，揭曉時自動完成。")}</small>}
      {error && <p className="v3-error" role="alert">{error}</p>}
      </div>
    </li>
  );
}

export function CommissionsPage({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const resetIn = (sim.today + 1) * 86_400_000 - sim.now;
  return (
    <div className="hud-page v3-comms">
      <PageHead kicker={tl("每日委託")} icon="signal" title={tl("每日委託")}
        lead={tl("每天 3 個委託，所有人都一樣，換日自動更新。一次接一個，接下後出發的航程符合條件，揭曉時就自動完成，獎勵直接進金庫。")}
        side={<span className="v3-comms__reset">{tl("{0} 後換一批", { 0: clock(resetIn) })}</span>} />
      <ul className="v3-comms__list">
        {sim.commissions.list.map((c) => <CommissionCard key={c.index} sim={sim} c={c} go={go} />)}
      </ul>
      <p className="hud-note">{tl("委託由日期決定，不需要任何人手動發布；獎勵從核光池支付，和航程收益一樣受當天的分配上限約束。放棄的委託當天不能再接。")}</p>
    </div>
  );
}

/** The observatory's short version: the active commission, or the ones that can be taken. */
export function CommissionsBrief({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const cm = sim.commissions;
  const show = cm.active !== null ? cm.list.filter((c) => c.index === cm.active) : cm.list.filter((c) => !cm.done.includes(c.index) && !cm.abandoned.includes(c.index));
  if (!show.length) return <p className="v3-muted">{tl("今天的委託都處理完了，換日後會有新的。")}</p>;
  return <ul className="v3-comms__list is-compact">{show.map((c) => <CommissionCard key={c.index} sim={sim} c={c} go={go} compact />)}</ul>;
}
