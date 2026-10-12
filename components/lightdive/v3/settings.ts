"use client";

// Player settings for the v3 preview, kept in this browser: effects quality, calm mode (less motion) and voyage alerts
// (browser notifications for decisions and reveals). The language
// is the site's (components/language-provider).
// Every page reads them through useSettings(), which updates when any page changes a value.
import { useSyncExternalStore } from "react";

export type FxQuality = "high" | "standard" | "low";

const FX_KEY = "lightdive:v3:fx";
const CALM_KEY = "lightdive:v3:calm";
const ALERTS_KEY = "lightdive:v3:alerts";
const EVENT = "lightdive:v3:settings";

const read = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};

/** Effects quality: high = full WebGL, standard = the lighter WebGL effects, low = no WebGL (CSS only). */
export function fxQuality(): FxQuality {
  const v = read(FX_KEY);
  return v === "standard" || v === "low" ? v : "high";
}

/** Calm mode: the player asked for less motion here, or the system asks for reduced motion. */
export function calm(): boolean {
  if (read(CALM_KEY) === "1") return true;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

/** Voyage alerts: the player turned them on (the browser's own permission is checked where they are sent). */
export function alertsOn(): boolean { return read(ALERTS_KEY) === "1"; }

export function setFxQuality(v: FxQuality) { write(FX_KEY, v); }
export function setAlerts(v: boolean) { write(ALERTS_KEY, v ? "1" : "0"); }
export function setCalm(v: boolean) { write(CALM_KEY, v ? "1" : "0"); }

function write(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

const snapshot = () => `${fxQuality()}|${calm() ? 1 : 0}|${alertsOn() ? 1 : 0}`;

/** The current settings; re-renders when any of them changes. */
export function useSettings(): { fx: FxQuality; calm: boolean; alerts: boolean } {
  const s = useSyncExternalStore(subscribe, snapshot, () => "high|0|0");
  const [fx, c, a] = s.split("|");
  return { fx: fx as FxQuality, calm: c === "1", alerts: a === "1" };
}
