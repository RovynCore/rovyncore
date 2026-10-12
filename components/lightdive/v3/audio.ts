"use client";

// Sound for the v3 preview: Sonniss #GameAudioGDC samples (public/lightdive/sfx, see LICENSE.txt there),
// played through Web Audio. Key sounds have 2-3 takes picked at random so repeats feel less mechanical.
// The mute choice is remembered; everything stays silent if audio is unavailable.
import { useCallback, useEffect, useState } from "react";

export type Sfx = "click" | "hover" | "toggle" | "open" | "depart" | "event" | "scan" | "empty" | "normal" | "good" | "great" | "legend" | "summon" | "claim";
const TAKES: Record<Sfx, number> = {
  click: 3, hover: 1, toggle: 2, open: 3, depart: 3, event: 2, scan: 2, empty: 2, normal: 2, good: 2, great: 2, legend: 3, summon: 2, claim: 1,
};
const VOLUME: Record<Sfx, number> = {
  click: 0.5, hover: 0.35, toggle: 0.5, open: 0.6, depart: 0.7, event: 0.6, scan: 0.55, empty: 0.6,
  normal: 0.6, good: 0.7, great: 0.8, legend: 0.9, summon: 0.7, claim: 0.6,
};
const KEY = "lightdive:v3:mute";
const SFX_LEVEL_KEY = "lightdive:v3:sfx-level";
const MUSIC_LEVEL_KEY = "lightdive:v3:music-level";
let ctx: AudioContext | null = null;
let muted = false;
let sfxLevel = 0.8; // 0..1, set by the volume slider
let musicLevel = 0.55;
const AMBIENCE_GAIN = 0.22;
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

function context() {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function load(file: string) {
  const c = context();
  if (!c) return Promise.resolve(null);
  if (!loading.has(file)) {
    loading.set(file, fetch(`/lightdive/sfx/${file}.mp3`)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .then((buf) => { buffers.set(file, buf); return buf; })
      .catch(() => { buffers.set(file, null); return null; }));
  }
  return loading.get(file)!;
}

/** Plays a sound effect (one of its takes at random); the first call for a take fetches it. */
export function play(name: Sfx, volume = 1) {
  if (muted) return;
  const c = context();
  if (!c) return;
  const file = `${name}-${1 + Math.floor(Math.random() * TAKES[name])}`;
  const start = (buf: AudioBuffer | null) => {
    if (!buf || muted) return;
    const src = c.createBufferSource();
    const g = c.createGain();
    g.gain.value = VOLUME[name] * volume * sfxLevel * 1.25;
    src.buffer = buf;
    src.connect(g).connect(c.destination);
    src.start();
  };
  const ready = buffers.get(file);
  if (ready !== undefined) start(ready);
  else void load(file).then(start);
}

/** A small synthesized chime: `n` soft bell pings rising in pitch, for rewards landing in the top bar. No file needed. */
export function chime(n = 4, volume = 1) {
  if (muted) return;
  const c = context();
  if (!c) return;
  const base = 1046.5; // C6
  const steps = [0, 4, 7, 12, 16, 19]; // a bright major arpeggio
  for (let i = 0; i < Math.min(n, steps.length); i++) {
    const t = c.currentTime + i * 0.055;
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o2.type = "triangle";
    o.frequency.value = base * 2 ** (steps[i] / 12);
    o2.frequency.value = o.frequency.value * 2.01; // a faint shimmer an octave up
    const peak = 0.11 * volume * sfxLevel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g);
    o2.connect(g);
    g.connect(c.destination);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.5);
    o2.stop(t + 0.5);
  }
}

// ---------------------------------------------------------------- ambience

let ambience: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

/** A quiet looping drone under the star map; fades in and out. */
export function useAmbience(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let stopped = false;
    const c = context();
    if (!c) return;
    const begin = () => {
      if (stopped || muted || ambience) return;
      void load("ambience-1").then((buf) => {
        if (!buf || stopped || muted || ambience) return;
        const src = c.createBufferSource();
        const gain = c.createGain();
        src.buffer = buf;
        src.loop = true;
        gain.gain.setValueAtTime(0, c.currentTime);
        gain.gain.linearRampToValueAtTime(AMBIENCE_GAIN * sfxLevel, c.currentTime + 2.5);
        src.connect(gain).connect(c.destination);
        src.start();
        ambience = { src, gain };
      });
    };
    // browsers only start audio after a gesture
    window.addEventListener("pointerdown", begin, { once: true });
    begin();
    return () => {
      stopped = true;
      window.removeEventListener("pointerdown", begin);
      if (ambience) {
        const a = ambience;
        ambience = null;
        a.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.8);
        a.src.stop(c.currentTime + 0.9);
      }
    };
  }, [on]);
}

export function useMute(): [boolean, () => void] {
  const [m, setM] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      try { muted = localStorage.getItem(KEY) === "1"; } catch {}
      setM(muted);
    });
  }, []);
  const toggle = useCallback(() => {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? "1" : "0"); } catch {}
    setM(muted);
    if (muted && ambience) { ambience.src.stop(); ambience = null; }
    if (!muted) play("toggle");
  }, []);
  return [m, toggle];
}

// ---------------------------------------------------------------- music

export type MusicKey = "observatory" | "map" | "deep";
const MUSIC_KEY = "lightdive:v3:music";
const MUSIC_MAX = 0.5;
const musicVolume = () => MUSIC_MAX * musicLevel;
let musicOn = true;
let wanted: MusicKey | null = null;
let current: { key: MusicKey; el: HTMLAudioElement } | null = null;

function fade(el: HTMLAudioElement, to: number, ms: number, done?: () => void) {
  const from = el.volume, start = performance.now();
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / ms);
    el.volume = from + (to - from) * k;
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

function applyMusic() {
  if (typeof window === "undefined") return;
  const key = musicOn ? wanted : null;
  if (current && current.key === key) return;
  if (current) {
    const old = current.el;
    fade(old, 0, 1200, () => old.pause());
    current = null;
  }
  if (!key) return;
  const el = new Audio(`/lightdive/music/${key}.mp3`);
  el.loop = true;
  el.volume = 0;
  current = { key, el };
  el.play().then(() => fade(el, musicVolume(), 2000)).catch(() => {
    // autoplay blocked until the first gesture
    const retry = () => { if (current?.el === el) void el.play().then(() => fade(el, musicVolume(), 2000)).catch(() => {}); };
    window.addEventListener("pointerdown", retry, { once: true });
  });
}

/** Chooses the background track for the current screen; null keeps the screen quiet. */
export function useMusic(key: MusicKey | null) {
  useEffect(() => {
    wanted = key;
    applyMusic();
  }, [key]);
}

export function useMusicToggle(): [boolean, () => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    queueMicrotask(() => {
      try { musicOn = localStorage.getItem(MUSIC_KEY) !== "0"; } catch {}
      setOn(musicOn);
      applyMusic();
    });
  }, []);
  const toggle = useCallback(() => {
    musicOn = !musicOn;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? "1" : "0"); } catch {}
    setOn(musicOn);
    applyMusic();
  }, []);
  return [on, toggle];
}

// ---------------------------------------------------------------- volume sliders

function readLevel(key: string, fallback: number) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : Math.max(0, Math.min(1, Number(v)));
  } catch {
    return fallback;
  }
}

/** Volume (0..1) for sound effects or music, remembered in this browser; applied at once. */
export function useVolume(kind: "sfx" | "music"): [number, (v: number) => void] {
  const [level, setLevel] = useState(kind === "sfx" ? sfxLevel : musicLevel);
  useEffect(() => {
    queueMicrotask(() => {
      if (kind === "sfx") { sfxLevel = readLevel(SFX_LEVEL_KEY, sfxLevel); setLevel(sfxLevel); }
      else { musicLevel = readLevel(MUSIC_LEVEL_KEY, musicLevel); setLevel(musicLevel); if (current) current.el.volume = musicVolume(); }
    });
  }, [kind]);
  const set = useCallback((v: number) => {
    const x = Math.max(0, Math.min(1, v));
    setLevel(x);
    if (kind === "sfx") {
      sfxLevel = x;
      try { localStorage.setItem(SFX_LEVEL_KEY, String(x)); } catch {}
      if (ambience && ctx) ambience.gain.gain.setTargetAtTime(AMBIENCE_GAIN * x, ctx.currentTime, 0.1);
    } else {
      musicLevel = x;
      try { localStorage.setItem(MUSIC_LEVEL_KEY, String(x)); } catch {}
      if (current) current.el.volume = musicVolume();
    }
  }, [kind]);
  return [level, set];
}
