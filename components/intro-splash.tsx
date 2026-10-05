"use client";

import { useEffect, useRef } from "react";

// First-visit boot sequence for the home page. The markup is server-rendered but stays hidden unless the
// inline bootstrap script in the root layout marked <html class="intro-on">. It never blocks content:
// any key or click ends it, and a failsafe in the bootstrap script removes it after a few seconds.
const LETTERS = "ROVYN CORE".split("");
const LOG = ["BOOT SEQUENCE", "NETWORK · ROBINHOOD CHAIN 4663", "SUPPLY · 10,000,000 RVYN", "STATUS · FIRST GAME IN DEVELOPMENT"];

export function IntroSplash() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    if (!root.classList.contains("intro-on") || !el) { root.classList.add("intro-done"); return; }
    let finished = false;
    const timers: number[] = [];
    const finish = () => {
      if (finished) return;
      finished = true;
      try { sessionStorage.setItem("rc-intro", "1"); } catch { /* ignore */ }
      root.classList.remove("intro-on");
      root.classList.add("intro-done");
      window.removeEventListener("keydown", finish);
      window.removeEventListener("pointerdown", finish);
    };
    const leave = () => { el.classList.add("is-leaving"); timers.push(window.setTimeout(finish, 850)); };
    timers.push(window.setTimeout(leave, 2100));
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);
    return () => { timers.forEach((t) => window.clearTimeout(t)); window.removeEventListener("keydown", finish); window.removeEventListener("pointerdown", finish); };
  }, []);
  return (
    <div className="intro" ref={ref} aria-hidden="true">
      <div className="intro__panel intro__panel--top" />
      <div className="intro__panel intro__panel--bottom" />
      <div className="intro__core">
        <svg className="intro__ring" viewBox="0 0 120 120">
          <circle className="intro__ring-a" cx="60" cy="60" r="52" />
          <circle className="intro__ring-b" cx="60" cy="60" r="38" />
          <circle className="intro__dot" cx="60" cy="8" r="3" />
        </svg>
        <div className="intro__word">
          {LETTERS.map((ch, i) => <span key={i} style={{ animationDelay: `${0.35 + i * 0.055}s` }}>{ch === " " ? " " : ch}</span>)}
        </div>
        <ul className="intro__log">
          {LOG.map((line, i) => <li key={line} style={{ animationDelay: `${0.7 + i * 0.28}s` }}>{line}</li>)}
        </ul>
        <div className="intro__bar"><i /></div>
      </div>
    </div>
  );
}
