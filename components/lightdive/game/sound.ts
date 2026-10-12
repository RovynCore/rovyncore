"use client";

// Small synthesized sound effects for Lightdive (no audio files). Off by default; the choice is
// remembered per browser. Every call is a no-op while muted or when Web Audio is unavailable.
import { useCallback, useEffect, useState } from "react";

const KEY = "lightdive:sound";
let ctx: AudioContext | null = null;
let enabled = false;

function audio() {
  if (!enabled || typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, length: number, type: OscillatorType = "sine", gain = 0.06, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + length);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.05);
}

export const sfx = {
  click: () => tone(660, 0, 0.08, "triangle", 0.04),
  select: () => { tone(520, 0, 0.09, "triangle", 0.05); tone(780, 0.06, 0.12, "triangle", 0.04); },
  summon: () => { tone(110, 0, 1.2, "sawtooth", 0.035, 440); tone(220, 0.2, 1.0, "sine", 0.05, 880); },
  reveal: (rarity: number) => {
    const base = [392, 440, 523, 659, 784][rarity] ?? 392;
    tone(base, 0, 0.35, "sine", 0.07);
    tone(base * 1.5, 0.08, 0.4, "sine", 0.05);
    if (rarity >= 3) { tone(base * 2, 0.18, 0.7, "triangle", 0.05); tone(base * 3, 0.3, 0.9, "sine", 0.03); }
  },
  launch: () => { tone(180, 0, 0.9, "sawtooth", 0.03, 1200); tone(900, 0.5, 0.6, "sine", 0.05, 1800); },
  success: () => { tone(523, 0, 0.18, "triangle", 0.05); tone(659, 0.1, 0.18, "triangle", 0.05); tone(784, 0.2, 0.3, "triangle", 0.05); },
  fail: () => { tone(220, 0, 0.25, "square", 0.03, 140); },
};

export function useSound(): [boolean, () => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let saved = false;
    try {
      saved = window.localStorage.getItem(KEY) === "1";
    } catch {
      // storage unavailable: stay muted
    }
    enabled = saved;
    queueMicrotask(() => setOn(saved));
  }, []);
  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      enabled = next;
      try {
        window.localStorage.setItem(KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      if (next) sfx.select();
      return next;
    });
  }, []);
  return [on, toggle];
}
