"use client";

// Voyage alerts (10-11): a browser notification when a voyage reaches its decision or comes back with a result, sent
// only while the game is open in a tab the player is not looking at (on screen, the game shows it already). Off until
// the player turns it on in Settings; the browser asks for permission then. Nothing is sent once the tab is closed:
// that would need a push server, which the game does not have.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { deciding, teamName, type Sim, type SimDive } from "./sim";
import { useSettings } from "./settings";
import { OUTCOME } from "./copy";
import { tl } from "@/lib/lightdive-v3/i18n";

type Permission = NotificationPermission | "unsupported";
const permission = (): Permission => (typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission);
const destName = (d: SimDive) => TEXTS.clusters[DESTINATIONS[d.dest].cluster].destinations[DESTINATIONS[d.dest].slot].name;

/** Watches the voyages and sends the alerts. Mounted once, at the game's root. */
export function useVoyageAlerts(sim: Sim) {
  const { alerts } = useSettings();
  const sent = useRef<Set<string> | null>(null);
  const s = sim.state;
  useEffect(() => {
    if (!s) return;
    const due: { key: string; d: SimDive; kind: "decide" | "reveal" }[] = [];
    for (const d of s.dives) {
      if (deciding(d, sim.now) && !d.choice) due.push({ key: `decide:${d.id}`, d, kind: "decide" });
      if (d.result && d.pending) due.push({ key: `reveal:${d.id}`, d, kind: "reveal" });
    }
    // the first look only remembers what is already waiting, so opening the game never fires old alerts
    if (!sent.current) { sent.current = new Set(due.map((x) => x.key)); return; }
    const can = alerts && permission() === "granted" && document.hidden;
    for (const x of due) {
      if (sent.current.has(x.key)) continue;
      sent.current.add(x.key);
      if (!can) continue;
      const team = teamName(s, x.d.spire);
      const title = x.kind === "decide" ? tl("{0} 遇到岔路，等你抉擇", { 0: team }) : tl("{0} 帶回了結果", { 0: team });
      const body = x.kind === "decide"
        ? tl("{0} · 揭曉前 1 分鐘截止。", { 0: destName(x.d) })
        : tl("{0} · {1} ×{2}，回到遊戲收取。", { 0: destName(x.d), 1: OUTCOME[x.d.result!.outcome], 2: (x.d.result!.multX100 / 100).toFixed(2) });
      try {
        const n = new Notification(title, { body, tag: x.key, icon: "/lightdive/keeper-face.webp" });
        n.onclick = () => {
          try { sessionStorage.setItem("lightdive:v3:watch", String(x.d.id)); } catch {}
          window.focus();
          if (window.location.hash !== "#dive") window.location.hash = "dive";
          n.close();
        };
      } catch {}
    }
  }, [alerts, s, sim.now]);
}

/** The switch on the settings page: turning it on asks the browser for permission first. */
const noSubscribe = () => () => {};

export function AlertsSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  // the browser's permission (the server renders "default"); the answer to our own request overrides it
  const live = useSyncExternalStore(noSubscribe, permission, () => "default" as Permission);
  const [asked, setAsked] = useState<Permission | null>(null);
  const perm = asked ?? live;
  const checked = on && perm === "granted";
  const toggle = (want: boolean) => {
    if (!want) { onChange(false); return; }
    if (perm === "granted") { onChange(true); return; }
    if (perm === "unsupported" || perm === "denied") return;
    void Notification.requestPermission().then((p) => { setAsked(p); onChange(p === "granted"); });
  };
  return (
    <>
      <label className="v3-setswitch">
        <input type="checkbox" checked={checked} disabled={perm === "unsupported" || perm === "denied"} onChange={(e) => toggle(e.target.checked)} />
        <span><b>{tl("抉擇與揭曉提醒")}</b><small>{tl("遊戲開著、但你在看別的分頁或視窗時，航行出現抉擇或結果揭曉，會跳出瀏覽器通知。關掉這個分頁後就不會再提醒。")}</small></span>
      </label>
      {perm === "denied" && <p className="v3-muted">{tl("瀏覽器封鎖了這個網站的通知。要開啟的話，請到瀏覽器的網站設定裡允許通知。")}</p>}
      {perm === "unsupported" && <p className="v3-muted">{tl("這個瀏覽器不支援通知。")}</p>}
    </>
  );
}
