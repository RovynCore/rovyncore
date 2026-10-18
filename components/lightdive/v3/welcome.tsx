"use client";

// Welcome back (10-19): after 8 hours or more away, Rovyn sums up what is waiting, so a returning player knows where to
// start: results to collect, cards docked, today's commissions and Dive Passes. Shown once per return, in this
// browser; nothing here changes the game.
import { useEffect, useState } from "react";
import { DIVES_PER_DAY } from "@/lib/lightdive-v3/rules";
import { tl } from "@/lib/lightdive-v3/i18n";
import { fmt } from "./copy";
import { passesOn, type Sim } from "./sim";
import { rovynImage } from "./pages";
import type { View } from "./pages";

const KEY = "lightdive:v3:last-seen";
const AWAY_MS = 8 * 3_600_000;

export function WelcomeBack({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  // the game root only renders once the state is there, in the browser: the last visit can be read right away
  const [away, setAway] = useState<number | null>(() => {
    let last = 0;
    try { last = Number(localStorage.getItem(KEY)) || 0; } catch {}
    return last && Date.now() - last >= AWAY_MS ? Date.now() - last : null;
  });
  const s = sim.state;
  // keep the stamp fresh while the game is open
  useEffect(() => {
    const stamp = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch {} };
    stamp();
    const t = window.setInterval(stamp, 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (away === null || !s) return null;

  const waiting = s.dives.filter((d) => d.pending);
  const docked = s.nfts.filter((n) => n.dockedAt !== undefined && !n.homeAt).length;
  const left = Math.max(0, DIVES_PER_DAY - passesOn(s, sim.today));
  const cm = sim.commissions;
  const open = cm.list.filter((c) => !cm.done.includes(c.index) && !cm.abandoned.includes(c.index)).length;
  const hours = Math.floor(away / 3_600_000);
  const rows: { text: string; to: View }[] = [];
  if (waiting.length) rows.push({ text: tl("{0} 趟結果等你收取，一共 {1} $RVYN", { 0: waiting.length, 1: fmt(waiting.reduce((a, d) => a + (d.reward ?? 0), 0)) }), to: "dive" });
  if (cm.ready !== null) rows.push({ text: tl("手上的委託已經可以完成"), to: "commissions" });
  else if (cm.active === null && open) rows.push({ text: tl("今天還有 {0} 個委託可以接", { 0: open }), to: "commissions" });
  if (docked) rows.push({ text: tl("{0} 張卡停泊了，可以續航或等它歸航", { 0: docked }), to: "spires" });
  if (left) rows.push({ text: tl("今天還有 {0} 張出發令", { 0: left }), to: "dive" });
  if (!rows.length) return null;
  const close = () => setAway(null);
  return (
    <div className="v3-modal" role="dialog" aria-label={tl("歡迎回來")} onClick={close}>
      <div className="v3-modal__card v3-welcome" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={rovynImage(waiting.length ? "bright" : "guide")} alt="" />
        <div>
          <span className="hud-kicker">{tl("訊號守望者・Rovyn")}</span>
          <h2>{tl("歡迎回來")}</h2>
          <p>{hours >= 48 ? tl("你離開了 {0} 天。這段時間的光，我都替你記下了：", { 0: Math.floor(hours / 24) }) : tl("你離開了 {0} 小時。這段時間的光，我都替你記下了：", { 0: hours })}</p>
          <ul>
            {rows.map((r) => (
              <li key={r.text}><button type="button" onClick={() => { close(); go(r.to); }}>{r.text}<i aria-hidden="true">›</i></button></li>
            ))}
          </ul>
          <button type="button" className="hud-btn hud-btn--primary hud-btn--block" onClick={() => { close(); go(rows[0].to); }}>{tl("從第一件開始")}</button>
        </div>
      </div>
    </div>
  );
}
