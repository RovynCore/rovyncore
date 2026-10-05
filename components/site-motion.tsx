"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const surfaceSelector = ".reboot-horizon, .home-roadmap__card, .home-featured__card--official, .record-card";
const entranceSelector = ".reboot-flow__intro, .reboot-step, .reboot-roadmap-overview__heading, .reboot-horizon, .reboot-final > .reboot-kicker, .reboot-final > h2, .reboot-final > p, .reboot-final > .reboot-actions";

/** Progressive enhancement of existing surfaces; never intercepts navigation or forms. */
export function SiteMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let dispose = () => {};
    let setupFrame = 0;

    const setup = () => {
      dispose();
      if (setupFrame) window.cancelAnimationFrame(setupFrame);
      setupFrame = window.requestAnimationFrame(() => {
        setupFrame = 0;
        const root = document.querySelector<HTMLElement>(".home-reboot, .rvyn-page, .launchpad-page, .record-directory, .record-detail");
        if (!root || motion.matches) return;

        const entrances = Array.from(root.querySelectorAll<HTMLElement>(entranceSelector));
        const surfaces = new Set<HTMLElement>();
        let frame = 0;
        let activeSurface: HTMLElement | null = null;
        let pointerX = 0;
        let pointerY = 0;

        const resetSurface = () => {
          activeSurface?.style.setProperty("--surface-active", "0");
          activeSurface = null;
        };
        const updatePointer = () => {
          frame = 0;
          if (activeSurface) {
            const rect = activeSurface.getBoundingClientRect();
            activeSurface.style.setProperty("--surface-x", `${pointerX - rect.left}px`);
            activeSurface.style.setProperty("--surface-y", `${pointerY - rect.top}px`);
            activeSurface.style.setProperty("--surface-active", "1");
          }
        };
        const move = (event: PointerEvent) => {
          if (event.pointerType !== "mouse" || !pointer.matches || !(event.target instanceof Element)) return;
          const nextSurface = event.target.closest<HTMLElement>(surfaceSelector);
          if (activeSurface !== nextSurface) resetSurface();
          activeSurface = nextSurface;
          if (activeSurface && !surfaces.has(activeSurface)) {
            surfaces.add(activeSurface);
            activeSurface.dataset.surfaceLight = "true";
          }
          pointerX = event.clientX;
          pointerY = event.clientY;
          if (activeSurface && !frame) frame = window.requestAnimationFrame(updatePointer);
        };
        const leave = resetSurface;

        // Pause decorative loops outside the viewport and in background tabs.
        // Scan asynchronously loaded record facts too; no timers or scroll loop.
        const zones = new Map<HTMLElement, boolean>();
        const zoneVisibility = () => zones.forEach((visible, zone) => {
          zone.dataset.motionInView = String(visible && !document.hidden);
        });
        const zoneObserver = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
          entries.forEach(entry => {
            const zone = entry.target as HTMLElement;
            zones.set(zone, entry.isIntersecting);
            if (entry.isIntersecting) zone.dataset.motionEntered = "true";
          });
          zoneVisibility();
        }, { threshold: .08 }) : null;
        const scanZones = () => root.querySelectorAll<HTMLElement>(".content-motion-zone").forEach(zone => {
          if (zones.has(zone)) return;
          zones.set(zone, false);
          zoneObserver?.observe(zone);
        });
        scanZones();
        const zoneMutation = zoneObserver ? new MutationObserver(scanZones) : null;
        zoneMutation?.observe(root, { childList: true, subtree: true });
        document.addEventListener("visibilitychange", zoneVisibility);

        let observer: IntersectionObserver | null = null;
        if ("IntersectionObserver" in window) {
          observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
              if (!entry.isIntersecting) return;
              (entry.target as HTMLElement).dataset.motionState = "visible";
              observer?.unobserve(entry.target);
            });
          }, { threshold: 0.05, rootMargin: "0px 0px -24px 0px" });
          entrances.forEach(element => {
            // Visible content remains stable on hydration and language changes.
            if (element.getBoundingClientRect().top < window.innerHeight - 24) return;
            element.dataset.motionState = "pending";
            if (element.matches(".reboot-step, .reboot-horizon")) {
              const siblings = Array.from(element.parentElement?.children ?? []);
              element.style.setProperty("--entrance-delay", `${Math.min(siblings.indexOf(element), 3) * 65}ms`);
            }
            observer?.observe(element);
          });
        }
        const focus = (event: FocusEvent) => {
          if (!(event.target instanceof Element)) return;
          const entrance = event.target.closest<HTMLElement>("[data-motion-state]");
          if (entrance) {
            entrance.dataset.motionState = "visible";
            observer?.unobserve(entrance);
          }
        };

        root.addEventListener("pointermove", move, { passive: true });
        root.addEventListener("pointerleave", leave);
        root.addEventListener("focusin", focus);
        window.addEventListener("blur", leave);
        dispose = () => {
          observer?.disconnect();
          zoneObserver?.disconnect();
          zoneMutation?.disconnect();
          document.removeEventListener("visibilitychange", zoneVisibility);
          zones.forEach((_, zone) => { delete zone.dataset.motionInView; delete zone.dataset.motionEntered; });
          root.removeEventListener("pointermove", move);
          root.removeEventListener("pointerleave", leave);
          root.removeEventListener("focusin", focus);
          window.removeEventListener("blur", leave);
          if (frame) window.cancelAnimationFrame(frame);
          leave();
          entrances.forEach(element => { delete element.dataset.motionState; element.style.removeProperty("--entrance-delay"); });
          surfaces.forEach(element => {
            delete element.dataset.surfaceLight;
            ["--surface-x", "--surface-y", "--surface-active"].forEach(property => element.style.removeProperty(property));
          });
        };
      });
    };

    setup();
    motion.addEventListener("change", setup);
    pointer.addEventListener("change", setup);
    return () => {
      motion.removeEventListener("change", setup);
      pointer.removeEventListener("change", setup);
      if (setupFrame) window.cancelAnimationFrame(setupFrame);
      dispose();
    };
  }, [pathname]);

  return null;
}
