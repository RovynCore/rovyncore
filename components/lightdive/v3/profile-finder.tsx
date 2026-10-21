"use client";

// 查看觀測者 (10-22): paste a wallet address to open that observer's profile. Profiles are public records on the chain,
// so this only opens what the boards and the dive log already link to. The last few addresses looked up are kept on
// this device to open again.
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { tl } from "@/lib/lightdive-v3/i18n";
import { openProfile } from "./logbook";

const RECENT_KEY = "lightdive:v3:profile-recent";
const RECENT_MAX = 5;
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function readRecent(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && /^0x[0-9a-f]{40}$/.test(x)).slice(0, RECENT_MAX) : [];
  } catch { return []; }
}

/** `live`: the live game (the preview has no other observers); `me`: the connected wallet, if any. */
export function ProfileFinder({ live, me }: { live: boolean; me: string | null }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  if (!live) return <p className="v3-finder is-off hud-dim">{tl("預覽模式裡的其他觀測者是模擬的，正式遊戲才能用地址查看檔案。")}</p>;

  const open = (address: string) => {
    const a = address.toLowerCase();
    setError(null);
    setValue("");
    if (me && a === me.toLowerCase()) { openProfile(); return; }
    const next = [a, ...recent.filter((x) => x !== a)].slice(0, RECENT_MAX);
    setRecent(next);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
    openProfile(a);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const a = value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) { setError(tl("請貼上完整的錢包地址（0x 開頭，共 42 個字元）。")); return; }
    open(a);
  };
  return (
    <div className="v3-finder">
      <form className="v3-finder__form" onSubmit={submit} role="search" aria-label={tl("查看觀測者")}>
        <Search aria-hidden="true" />
        <input type="text" inputMode="text" autoComplete="off" spellCheck={false} placeholder={tl("貼上錢包地址，查看觀測者")} value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }} aria-invalid={!!error} aria-describedby={error ? "v3-finder-error" : undefined} />
        <button type="submit" className="hud-btn hud-btn--sm hud-btn--primary">{tl("查看")}</button>
      </form>
      {error && <p id="v3-finder-error" className="v3-error">{error}</p>}
      {recent.length > 0 && (
        <p className="v3-finder__recent">
          <small>{tl("最近看過")}</small>
          {recent.map((a) => <button key={a} type="button" onClick={() => open(a)} title={a}>{short(a)}</button>)}
        </p>
      )}
    </div>
  );
}
