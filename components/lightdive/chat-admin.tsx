"use client";

// 潛光頻道 moderation (admin only): the last 200 messages with hide / show, and muting a wallet for a while. Every
// action is a signed admin action and goes into the audit log.
import { useState } from "react";
import { toast } from "sonner";
import { usePlatform } from "@/components/platform-context";

type Row = { id: number; channel: string; account: string; body: string; created: number; hidden: number; reports: number };
const CHANNEL: Record<string, string> = { global: "全球", "zh-Hant": "繁中", "zh-Hans": "简中", en: "EN", ko: "韓文" };
type Mute = { account: string; until: number; reason: string; created: number };
const time = (s: number) => new Date(s * 1000).toLocaleString("zh-TW", { hour12: false });

export function ChatAdmin() {
  const platform = usePlatform();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [mutes, setMutes] = useState<Mute[]>([]);
  const [busy, setBusy] = useState(false);
  const run = async <T,>(action: string, payload: unknown): Promise<T | null> => {
    setBusy(true);
    try { return await platform.admin<T>(action, payload); } catch (e) { toast.error((e as Error).message.slice(0, 200)); return null; } finally { setBusy(false); }
  };
  const load = async () => {
    const d = await run<{ messages: Row[]; mutes: Mute[] }>("lightdive-chat-read", {});
    if (d) { setRows(d.messages); setMutes(d.mutes); }
  };
  const hide = async (r: Row) => {
    if (await run("lightdive-chat-hide", { id: r.id, hidden: !r.hidden })) { setRows((l) => (l ?? []).map((x) => (x.id === r.id ? { ...x, hidden: r.hidden ? 0 : 1 } : x))); toast.success(r.hidden ? "已重新顯示" : "已隱藏"); }
  };
  const mute = async (account: string, hours: number) => {
    const reason = hours > 0 ? window.prompt("禁言原因（只記在後台，可留空）", "") ?? "" : "";
    if (await run("lightdive-chat-mute", { account, hours, reason })) { toast.success(hours > 0 ? `已禁言 ${hours} 小時` : "已解除禁言"); await load(); }
  };

  return (
    <section className="ld-sub ld-announce">
      <h3>潛光頻道管理</h3>
      <p className="ld-dim">五個頻道（全球、繁中、简中、EN、韓文）最近 200 則訊息。被 3 個不同錢包回報的訊息會自動隱藏，等你確認後可以重新顯示。也可以讓某個錢包暫時不能發言。管理錢包發的訊息會帶「官方」標記，也不受連結限制。每個動作都要管理錢包簽名，並記在稽核紀錄。</p>
      <div className="ld-actions">
        <button type="button" className="ld-btn" disabled={busy} onClick={() => void load()}>{rows ? "重新讀取" : "簽名並讀取訊息"}</button>
      </div>
      {mutes.length > 0 && (
        <>
          <h4>禁言中的錢包</h4>
          <ul>
            {mutes.map((m) => (
              <li key={m.account}><code>{m.account}</code> 到 {time(m.until)} {m.reason && `（${m.reason}）`} <button type="button" className="ld-btn ld-btn--ghost" disabled={busy} onClick={() => void mute(m.account, 0)}>解除</button></li>
            ))}
          </ul>
        </>
      )}
      {rows && (rows.length === 0 ? <p className="ld-dim">還沒有任何訊息。</p> : (
        <ol className="ld-announce__list">
          {rows.map((r) => (
            <li key={r.id} style={r.hidden ? { opacity: 0.5 } : undefined}>
              <div className="ld-announce__row">
                <small>#{r.id} · {CHANNEL[r.channel] ?? r.channel} · {time(r.created)} · <code>{r.account}</code>{r.reports ? ` · 被回報 ${r.reports} 次` : ""}{r.hidden ? " · 已隱藏" : ""}</small>
                <button type="button" className="ld-btn ld-btn--ghost" disabled={busy} onClick={() => void hide(r)}>{r.hidden ? "重新顯示" : "隱藏"}</button>
                <button type="button" className="ld-btn ld-btn--ghost" disabled={busy} onClick={() => void mute(r.account, 24)}>禁言 24 小時</button>
                <button type="button" className="ld-btn ld-btn--ghost" disabled={busy} onClick={() => void mute(r.account, 24 * 30)}>禁言 30 天</button>
              </div>
              <p style={{ margin: "4px 0 0" }}>{r.body}</p>
            </li>
          ))}
        </ol>
      ))}
    </section>
  );
}
