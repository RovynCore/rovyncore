"use client";

import { useEffect } from "react";

// Surfaces that receive the shared hairline frame and pointer light. The frame is a
// decorative, aria-hidden span appended after hydration; it never captures input.
// State lives on the frame itself because React owns each surface's className.
export const ATELIER_SURFACES = [
  ".panel",
  ".home-featured__card",
  ".home-roadmap__card",
  ".record-card",
  ".record-panel",
  ".record-directory__guide",
  ".rvyn-allowlist__form",
  ".rvyn-allowlist__step",
  ".eligibility-flow__explanation",
  ".latest-info__flash-card",
  ".x-post",
  ".game-chapter__ledger",
  ".game-principles__card",
].join(",");

const frameOf = (surface: Element) => surface.querySelector<HTMLElement>(":scope > .atelier-frame");

function decorate(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(ATELIER_SURFACES).forEach((surface) => {
    if (frameOf(surface)) return;
    if (getComputedStyle(surface).position === "static") surface.style.position = "relative";
    const frame = document.createElement("span");
    frame.className = "atelier-frame";
    frame.setAttribute("aria-hidden", "true");
    surface.appendChild(frame);
  });
}

export function AtelierEffects() {
  useEffect(() => {
    const root = document.documentElement;
    let decorateQueued = false;
    const queueDecorate = () => {
      if (decorateQueued) return;
      decorateQueued = true;
      requestAnimationFrame(() => { decorateQueued = false; decorate(document); });
    };
    queueDecorate();
    const observer = new MutationObserver(queueDecorate);
    observer.observe(document.body, { childList: true, subtree: true });

    let scrollFrame = 0;
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = 0;
        const range = root.scrollHeight - window.innerHeight;
        root.classList.toggle("atelier-scrolled", window.scrollY > 12);
        root.style.setProperty("--atelier-progress", range > 0 ? Math.min(1, window.scrollY / range).toFixed(4) : "0");
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    let litFrame: HTMLElement | null = null;
    let pointerFrame = 0;
    let last: PointerEvent | null = null;
    const paint = () => {
      pointerFrame = 0;
      if (!last) return;
      const surface = (last.target as Element | null)?.closest?.(ATELIER_SURFACES) ?? null;
      const frame = surface ? frameOf(surface) : null;
      if (litFrame && litFrame !== frame) litFrame.classList.remove("is-lit");
      litFrame = frame;
      if (!surface || !frame) return;
      const box = surface.getBoundingClientRect();
      frame.style.setProperty("--atelier-x", `${last.clientX - box.left}px`);
      frame.style.setProperty("--atelier-y", `${last.clientY - box.top}px`);
      frame.classList.add("is-lit");
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      last = event;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(paint);
    };
    const onLeave = () => { litFrame?.classList.remove("is-lit"); litFrame = null; };
    document.addEventListener("pointermove", onPointer, { passive: true });
    root.addEventListener("pointerleave", onLeave);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointermove", onPointer);
      root.removeEventListener("pointerleave", onLeave);
      if (pointerFrame) cancelAnimationFrame(pointerFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
    };
  }, []);
  return null;
}
