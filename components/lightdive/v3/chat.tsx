"use client";

// 潛光頻道 (10-19): the server-wide chat, one channel for every language. Anyone reads it; speaking needs a wallet
// signed in (the site's sign-in, no gas) that holds a Lightdive card. It polls while open (and slowly while closed,
// for the unread count), and the server keeps the latest messages at the edge, so many readers cost little.
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { usePlatform } from "@/components/platform-context";
import { tl } from "@/lib/lightdive-v3/i18n";
import { CHAT_MAX, type ChatMessage } from "@/lib/lightdive-chat";
import { openProfile } from "./logbook";
import type { Sim } from "./sim";

const SEEN_KEY = "lightdive:chat:seen";
const OPEN_KEY = "lightdive:chat:open";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const clock = (s: number) => new Date(s * 1000).toTimeString().slice(0, 5);

export function ChatDock({ sim }: { sim: Sim }) {
  const platform = usePlatform();
  const me = platform.account?.toLowerCase() ?? null;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [off, setOff] = useState(true); // shown once the server answers that the channel is on
  const [seen, setSeen] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);

  // remembered after mount (the server renders it closed)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try { setOpen(localStorage.getItem(OPEN_KEY) === "1"); setSeen(Number(localStorage.getItem(SEEN_KEY)) || 0); } catch {}
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/lightdive/chat", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { messages: ChatMessage[]; off?: boolean };
      setOff(!!d.off);
      setMessages(d.messages);
    } catch {}
  }, []);
  // poll: every 8 s while open, every 45 s while closed (the unread count); never while the tab is hidden
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, open ? 8_000 : 45_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [open, load]);
  const newest = messages.at(-1)?.id ?? 0;
  // reading the open channel marks everything as seen and keeps the newest message in view
  useEffect(() => {
    if (!open || !newest) return;
    try { localStorage.setItem(SEEN_KEY, String(newest)); } catch {}
    const t = window.setTimeout(() => { setSeen(newest); list.current?.lastElementChild?.scrollIntoView({ block: "end" }); }, 0);
    return () => window.clearTimeout(t);
  }, [open, newest]);
  const toggle = (on: boolean) => {
    setOpen(on);
    try { localStorage.setItem(OPEN_KEY, on ? "1" : "0"); } catch {}
  };
  const unread = open ? 0 : messages.filter((m) => m.id > seen && m.account !== me).length;

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/lightdive/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      if (!r.ok) {
        let msg = tl("送出失敗，請稍後再試");
        try { msg = tl(((await r.json()) as { error?: string }).error ?? msg); } catch {}
        setError(msg);
        return;
      }
      setDraft("");
      await load();
    } finally { setBusy(false); }
  };
  const connect = async () => { setError(null); try { await platform.connect(); } catch (e) { setError((e as Error).message.slice(0, 160)); } };

  if (off) return null;
  if (!open) {
    return (
      <button type="button" className="v3-chat__fab" onClick={() => toggle(true)} aria-label={tl("打開潛光頻道")}>
        <MessageCircle aria-hidden="true" />{tl("頻道")}{unread > 0 && <em>{unread > 99 ? "99+" : unread}</em>}
      </button>
    );
  }
  return (
    <section className="v3-chat" aria-label={tl("潛光頻道")}>
      <header>
        <b><MessageCircle aria-hidden="true" />{tl("潛光頻道")}</b>
        <small>{tl("所有觀測者共用")}</small>
        <button type="button" onClick={() => toggle(false)} aria-label={tl("關閉")}><X aria-hidden="true" /></button>
      </header>
      <ol ref={list} className="v3-chat__list">
        {messages.length === 0 && <li className="v3-chat__empty">{tl("頻道還很安靜。說聲嗨吧。")}</li>}
        {messages.map((m) => {
          const mine = m.account === me;
          return (
            <li key={m.id} className={mine ? "is-mine" : ""}>
              <span className="v3-chat__who">
                {mine ? <b>{tl("你")}</b> : sim.chain ? <button type="button" className="v3-who" onClick={() => openProfile(m.account)} title={tl("看這位觀測者的檔案")}>{short(m.account)}</button> : <b>{short(m.account)}</b>}
                <time>{clock(m.at)}</time>
              </span>
              <p>{m.body}</p>
            </li>
          );
        })}
      </ol>
      <footer>
        {!me ? (
          <button type="button" className="hud-btn hud-btn--primary hud-btn--sm hud-btn--block" onClick={connect}>{tl("連接錢包後就能發言")}</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void send(); }}>
            <input value={draft} maxLength={CHAT_MAX} onChange={(e) => setDraft(e.target.value)} placeholder={tl("說點什麼…（{0} 字以內）", { 0: CHAT_MAX })} aria-label={tl("訊息")} />
            <button type="submit" className="hud-btn hud-btn--primary hud-btn--sm" disabled={busy || !draft.trim()} aria-label={tl("送出")}><Send aria-hidden="true" /></button>
          </form>
        )}
        {error && <p className="v3-error" role="alert">{error}</p>}
        <p className="v3-chat__rule">{tl("頻道是公開的。持有潛光卡才能發言；不能貼連結。任何人向你要私鑰或助記詞都是詐騙。")}</p>
      </footer>
    </section>
  );
}
