"use client";

import { useEffect } from "react";

// Writes the pointer position (-1..1) to --px/--py on the hero so the crystal and HUD layers can drift
// at different depths. Desktop pointers only; nothing happens for touch or reduced motion.
export function HeroParallax({ target = ".reboot-hero" }: { target?: string }) {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(target);
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(pointer: coarse)").matches) return;
    let frame = 0;
    let nx = 0, ny = 0, cx = 0, cy = 0;
    const tick = () => {
      cx += (nx - cx) * 0.08;
      cy += (ny - cy) * 0.08;
      el.style.setProperty("--px", cx.toFixed(4));
      el.style.setProperty("--py", cy.toFixed(4));
      frame = Math.abs(nx - cx) + Math.abs(ny - cy) > 0.001 ? requestAnimationFrame(tick) : 0;
    };
    const move = (event: PointerEvent) => {
      const r = el.getBoundingClientRect();
      nx = ((event.clientX - r.left) / r.width) * 2 - 1;
      ny = ((event.clientY - r.top) / r.height) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    const leave = () => { nx = 0; ny = 0; if (!frame) frame = requestAnimationFrame(tick); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); cancelAnimationFrame(frame); };
  }, [target]);
  return null;
}
