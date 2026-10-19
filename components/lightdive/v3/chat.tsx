"use client";

// 潛光頻道 (10-19): the Lightdive chat — five channels, one global and one for each of the game's four languages.
// Anyone reads; speaking needs a wallet signed in (the site's sign-in, no gas) that holds a Lightdive card. The panel
// polls the open channel while open (and slowly while closed, for the unread count); the server keeps each channel's
// latest messages at the edge, so many readers cost little. The anti-scam rules open on a first visit and stay one
// click away; any message can be reported, and only the admin wallet's messages carry the 官方 mark.
import { useCallback, useEffect, useRef, useState } from "react";
import { Flag, MessageCircle, Send, ShieldAlert, X } from "lucide-react";
import { usePlatform } from "@/components/platform-context";
import { tl } from "@/lib/lightdive-v3/i18n";
import { CHAT_CHANNELS, CHAT_MAX, type ChatChannel, type ChatMessage } from "@/lib/lightdive-chat";
import { openProfile } from "./logbook";
import type { Sim } from "./sim";

const SEEN_KEY = "lightdive:chat:seen2"; // { channel: newest id seen }
const OPEN_KEY = "lightdive:chat:open";
const CHANNEL_KEY = "lightdive:chat:channel";
const RULES_KEY = "lightdive:chat:rules";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const clock = (s: number) => new Date(s * 1000).toTimeString().slice(0, 5);
const CHANNEL_NAME: Record<ChatChannel, string> = { global: "全球", "zh-Hant": "繁中", "zh-Hans": "简中", en: "EN", ko: "한국어" };
/** The anti-scam rules, shown on a first visit and behind the shield button. */
export const CHAT_RULES = [
  "官方不會私訊你，也不會向你要私鑰、助記詞，或叫你簽任何東西。只有帶「官方」標記的訊息來自 ROVYN CORE。",
  "頻道不能貼連結。說「到某個網站領空投、領獎、驗證錢包」的，都是詐騙。",
  "沒有人能保證獲利。遊戲裡的測試幣沒有價值；「代操、帶單、保證翻倍」都是騙局。",
  "不要加陌生人的 Telegram、LINE、WhatsApp 或 Discord 私訊，詐騙通常從私訊開始。",
  "買賣卡片只用遊戲裡的市集，不要私下轉帳換卡。",
  "看到可疑的訊息就按旗子回報。被多人回報的訊息會先隱藏，違規的錢包會被禁言。",
];

export function ChatDock({ sim }: { sim: Sim }) {
  const platform = usePlatform();
  const me = platform.account?.toLowerCase() ?? null;
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<ChatChannel>("global");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [off, setOff] = useState(true); // shown once the server answers that the chat is on
  const [seen, setSeen] = useState<Record<string, number>>({});
  const [rules, setRules] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<number>>(() => new Set());
  const list = useRef<HTMLOListElement>(null);

  // remembered after mount (the server renders it closed)
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        setOpen(localStorage.getItem(OPEN_KEY) === "1");
        const c = localStorage.getItem(CHANNEL_KEY);
        if (c && (CHAT_CHANNELS as readonly string[]).includes(c)) setChannel(c as ChatChannel);
        setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || "{}"));
      } catch {}
    }, 0);
    return () => window.clearTimeout(t);
  }, []);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/lightdive/chat?channel=${encodeURIComponent(channel)}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { channel: ChatChannel; messages: ChatMessage[]; off?: boolean };
      setOff(!!d.off);
      if (d.channel === channel) setMessages(d.messages);
    } catch {}
  }, [channel]);
  // poll: every 8 s while open, every 45 s while closed (the unread count); never while the tab is hidden
  useEffect(() => {
    const first = window.setTimeout(load, 0);
    const timer = window.setInterval(() => { if (!document.hidden) void load(); }, open ? 8_000 : 45_000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [open, load]);
  const newest = messages.at(-1)?.id ?? 0;
  // reading the open channel marks it as seen and keeps the newest message in view
  useEffect(() => {
    if (!open || !newest || rules) return;
    const t = window.setTimeout(() => {
      setSeen((s) => {
        const next = { ...s, [channel]: Math.max(s[channel] ?? 0, newest) };
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      list.current?.lastElementChild?.scrollIntoView({ block: "end" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, newest, channel, rules]);
  const toggle = (on: boolean) => {
    setOpen(on);
    try {
      localStorage.setItem(OPEN_KEY, on ? "1" : "0");
      // the rules open by themselves the first time
      if (on && !localStorage.getItem(RULES_KEY)) { setRules(true); localStorage.setItem(RULES_KEY, "1"); }
    } catch {}
  };
  const pick = (c: ChatChannel) => {
    setChannel(c);
    setMessages([]);
    setError(null);
    try { localStorage.setItem(CHANNEL_KEY, c); } catch {}
  };
  const unread = open ? 0 : messages.filter((m) => m.id > (seen[channel] ?? 0) && m.account !== me).length;

  const post = async (path: string, payload: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) return null;
    try { return tl(((await r.json()) as { error?: string }).error ?? "送出失敗，請稍後再試"); } catch { return tl("送出失敗，請稍後再試"); }
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      const e = await post("/api/lightdive/chat", { body, channel });
      if (e) { setError(e); return; }
      setDraft("");
      await load();
    } finally { setBusy(false); }
  };
  const report = async (m: ChatMessage) => {
    if (!me) { setError(tl("連接錢包後才能回報")); return; }
    if (!window.confirm(tl("回報這則訊息？被多人回報的訊息會先隱藏，等管理員確認。"))) return;
    const e = await post("/api/lightdive/chat/report", { id: m.id });
    if (e) setError(e); else setReported((s) => new Set(s).add(m.id));
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
        <button type="button" className={`v3-chat__rulesbtn${rules ? " is-on" : ""}`} onClick={() => setRules((r) => !r)} aria-pressed={rules} title={tl("防詐規則")}><ShieldAlert aria-hidden="true" />{tl("防詐規則")}</button>
        <button type="button" onClick={() => toggle(false)} aria-label={tl("關閉")}><X aria-hidden="true" /></button>
      </header>
      <nav className="v3-chat__tabs" aria-label={tl("頻道")}>
        {CHAT_CHANNELS.map((c) => (
          <button key={c} type="button" className={c === channel ? "is-on" : ""} aria-pressed={c === channel} onClick={() => pick(c)}>{c === "global" ? tl(CHANNEL_NAME[c]) : CHANNEL_NAME[c]}</button>
        ))}
      </nav>
      {rules ? (
        <div className="v3-chat__rules">
          <b><ShieldAlert aria-hidden="true" />{tl("潛光頻道防詐規則")}</b>
          <ol>{CHAT_RULES.map((r) => <li key={r}>{tl(r)}</li>)}</ol>
          <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => setRules(false)}>{tl("我知道了")}</button>
        </div>
      ) : (
        <ol ref={list} className="v3-chat__list">
          {messages.length === 0 && <li className="v3-chat__empty">{tl("頻道還很安靜。說聲嗨吧。")}</li>}
          {messages.map((m) => {
            const mine = m.account === me;
            return (
              <li key={m.id} className={`${mine ? "is-mine" : ""}${m.official ? " is-official" : ""}`}>
                <span className="v3-chat__who">
                  {mine ? <b>{tl("你")}</b> : sim.chain ? <button type="button" className="v3-who" onClick={() => openProfile(m.account)} title={tl("看這位觀測者的檔案")}>{short(m.account)}</button> : <b>{short(m.account)}</b>}
                  {m.official && <em className="v3-chat__official">{tl("官方")}</em>}
                  <time>{clock(m.at)}</time>
                  {!mine && !m.official && (
                    <button type="button" className="v3-chat__report" onClick={() => void report(m)} disabled={reported.has(m.id)} title={tl("回報")} aria-label={tl("回報")}><Flag aria-hidden="true" /></button>
                  )}
                </span>
                <p>{m.body}</p>
              </li>
            );
          })}
        </ol>
      )}
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
        <p className="v3-chat__rule">{tl("持有潛光卡才能發言。任何人向你要私鑰或助記詞都是詐騙。")}</p>
      </footer>
    </section>
  );
}
