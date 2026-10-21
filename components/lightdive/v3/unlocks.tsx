"use client";

// Step-by-step unlocks (10-19): a new observer sees the core loop first (summon → team → dive → collect); the rest
// opens as they play. Nothing here limits the contracts; it only decides what the pages show.
// - the profile: after the first collected result;
// - supplies and daily commissions: after the third collected result;
// - deep dives: once a team can reach cluster ③ (the destination card only offers them there anyway).
// A player who already used a feature keeps it. Each unlock is announced once, in this browser.
import { useState } from "react";
import { DEEP_MIN_CLUSTER, DESTINATIONS, teamPower } from "@/lib/lightdive-v3/rules";
import { tl } from "@/lib/lightdive-v3/i18n";
import { teamInput, type SimState } from "./sim";
import { rovynImage, type View } from "./pages";

export type Unlocks = { profile: boolean; supplies: boolean; commissions: boolean; deep: boolean };
export const ALL_UNLOCKED: Unlocks = { profile: true, supplies: true, commissions: true, deep: true };
const SUPPLIES_AT = 3;

export function unlocksOf(s: SimState): Unlocks {
  const done = s.dives.filter((d) => d.result && !d.pending).length;
  const strongest = Math.max(0, ...s.teams.filter((t) => t.seekers.length).map((t) => teamPower(teamInput(s, t))));
  const usedSupply = s.dives.some((d) => (d.supply ?? 0) > 0);
  return {
    profile: done >= 1,
    supplies: done >= SUPPLIES_AT || usedSupply,
    commissions: true, // open from the start since 10-22: a daily task should not wait
    deep: s.dives.some((d) => d.deep) || DESTINATIONS.some((d) => d.cluster >= DEEP_MIN_CLUSTER && strongest >= d.threshold),
  };
}

const SEEN_KEY = "lightdive:v3:unlocks-seen";
type Key = keyof Unlocks;
const NOTICE: Record<Key, { title: () => string; text: () => string; go?: View; cta?: () => string }> = {
  profile: { title: () => tl("個人檔案開放了"), text: () => tl("你收下了第一趟結果。個人檔案會記下你走過的地方、拿到的稱號和每個目的地的故事。"), go: "logbook", cta: () => tl("看我的檔案") },
  supplies: { title: () => tl("新玩法：出航補給"), text: () => tl("出發時可以花一點 $RVYN 帶一種補給：燈油讓這趟只耗損 1 次航程，星圖殘頁讓空手機率少 3 個百分點。不帶也完全可以。") },
  commissions: { title: () => tl("新玩法：每日委託"), text: () => tl("每天 3 個委託，接一個，出航時順便完成，就能多領那趟基礎收益的 10%。"), go: "commissions", cta: () => tl("看今天的委託") },
  deep: { title: () => tl("新玩法：深潛"), text: () => tl("你的隊伍到得了第③星團了。那裡可以深潛：用 2 張出發令、航行 15 分鐘，光塵 ×2，最後 10 分鐘還能選擇回航。"), go: "dive", cta: () => tl("去星圖") },
};

/** Announces each new unlock once. The first look only remembers what is already open, so an existing player is
 *  not shown a pile of notices. */
export function UnlockNotice({ unlocks, go }: { unlocks: Unlocks; go: (v: View) => void }) {
  const open = (Object.keys(unlocks) as Key[]).filter((k) => unlocks[k]);
  const [seen, setSeen] = useState<Key[]>(() => {
    let stored: Key[] | null = null;
    try { stored = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "null") as Key[] | null; } catch {}
    if (stored) return stored;
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(open)); } catch {}
    return open;
  });
  // supplies and commissions open together: commissions last (it has the button)
  const fresh = open.filter((k) => !seen.includes(k)).sort((a, b) => (a === "commissions" ? 1 : b === "commissions" ? -1 : 0));
  const k = fresh[0];
  if (!k) return null;
  const n = NOTICE[k];
  const next = () => {
    const now = [...seen, k];
    setSeen(now);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(now)); } catch {}
  };
  return (
    <div className="v3-modal" role="dialog" aria-label={n.title()} onClick={next}>
      <div className="v3-modal__card v3-unlock" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rovynImage("bright")} alt="" />
        <div>
          <span className="hud-kicker">{tl("解鎖")}</span>
          <h2>{n.title()}</h2>
          <p>{n.text()}</p>
          <div className="v3-unlock__actions">
            {n.go && n.cta && <button type="button" className="hud-btn hud-btn--primary" onClick={() => { next(); go(n.go!); }}>{n.cta()}</button>}
            <button type="button" className={`hud-btn ${n.go ? "hud-btn--ghost" : "hud-btn--primary"}`} onClick={next}>{tl("知道了")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
