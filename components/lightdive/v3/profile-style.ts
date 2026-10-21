"use client";

// 自訂檔案 (10-21): the profile's chosen look, read and saved for the game. In the live game one's own choices are
// saved to the server (signed-in wallet only) so anyone who opens the profile sees them, with a copy on this device
// for the reveal's share image; someone else's are read from the server. The preview keeps them on this device only.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { STYLE_DEFAULT, cleanStyle, type ProfileStyle } from "@/lib/lightdive-v3/profile";

export * from "@/lib/lightdive-v3/profile";

const keyOf = (address: string | null) => `lightdive:v3:profile-style:${address ? address.toLowerCase() : "preview"}`;
const EVENT = "lightdive:profile-style";

/** The style saved on this device. */
export function readStyle(address: string | null): ProfileStyle {
  try { return cleanStyle(JSON.parse(localStorage.getItem(keyOf(address)) ?? "{}")); } catch { return STYLE_DEFAULT; }
}
function keep(address: string | null, style: ProfileStyle) {
  try { localStorage.setItem(keyOf(address), JSON.stringify(style)); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

const post = (style: ProfileStyle): Promise<StyleSync> =>
  fetch("/api/lightdive/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ style }) })
    .then((r) => (r.ok ? "saved" : r.status === 401 ? "signin" : "error"), () => "error");

/** "local": kept on this device only (preview); the rest describe the last read or save on the server. */
export type StyleSync = "local" | "loading" | "saved" | "saving" | "signin" | "error";

/** The style saved on this device, as a subscription (it changes when the player picks something, here or in
 *  another tab). */
function useLocalStyle(address: string | null): ProfileStyle {
  const subscribe = useCallback((on: () => void) => {
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  const raw = useSyncExternalStore(subscribe, () => { try { return localStorage.getItem(keyOf(address)) ?? ""; } catch { return ""; } }, () => "");
  return useMemo(() => { try { return raw ? cleanStyle(JSON.parse(raw)) : STYLE_DEFAULT; } catch { return STYLE_DEFAULT; } }, [raw]);
}

/** The style to show and, for one's own profile, a setter that saves it (null resets). `live`: the live game, where
 *  styles live on the server; `mine`: the profile is the player's own. */
export function useProfileStyle(address: string | null, { live, mine }: { live: boolean; mine: boolean }): [ProfileStyle, (patch: Partial<ProfileStyle> | null) => void, StyleSync] {
  const local = useLocalStyle(address);
  const key = address?.toLowerCase() ?? "";
  // the server's answer for this address, and the state of the last save (both tagged with the address they are for)
  const [remote, setRemote] = useState<{ key: string; style: ProfileStyle | null; sync: StyleSync } | null>(null);
  const [saving, setSaving] = useState<{ key: string; sync: StyleSync } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const online = live && !!address;

  useEffect(() => {
    if (!online) return;
    let dead = false;
    void fetch(`/api/lightdive/profile?account=${address}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ style?: unknown }>) : null))
      .then((d) => {
        if (dead) return;
        const style = d?.style ? cleanStyle(d.style) : null;
        if (mine && style) keep(address, style);
        // chosen on this device before the server kept styles: send it up once
        if (mine && !style && JSON.stringify(readStyle(address)) !== JSON.stringify(STYLE_DEFAULT)) {
          void post(readStyle(address)).then((x) => { if (!dead) setSaving({ key, sync: x }); });
        }
        setRemote({ key, style, sync: d ? "saved" : "error" });
      })
      .catch(() => { if (!dead) setRemote({ key, style: null, sync: "error" }); });
    return () => { dead = true; };
  }, [address, key, online, mine]);

  const update = useCallback((patch: Partial<ProfileStyle> | null) => {
    if (!mine) return;
    const next = cleanStyle(patch ? { ...readStyle(address), ...patch } : STYLE_DEFAULT);
    keep(address, next);
    if (!online) return;
    // a burst of clicks is saved once
    setSaving({ key, sync: "saving" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void post(next).then((x) => setSaving({ key, sync: x })); }, 700);
  }, [address, key, online, mine]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const theirs = remote?.key === key ? remote : null;
  const style = mine ? local : theirs?.style ?? STYLE_DEFAULT;
  const sync: StyleSync = !online ? "local" : saving?.key === key ? saving.sync : theirs?.sync ?? "loading";
  return [style, update, sync];
}
