"use client";

import { useEffect } from "react";
import Lenis from "lenis";

// Inertial wheel scrolling on desktop pointers only. Touch devices, reduced-motion users and
// keyboard/anchor navigation keep native behavior.
export function SmoothScroll() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
    root.classList.add("lenis", "lenis-smooth");
    let frame = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
      root.classList.remove("lenis", "lenis-smooth");
    };
  }, []);
  return null;
}
