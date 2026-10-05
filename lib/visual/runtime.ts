export type VisualQuality = "off" | "low" | "medium" | "high";

export const MOTION = Object.freeze({
  hoverMs: 180,
  revealMs: 480,
  entranceMs: 1200,
  ambientMs: 8500,
  orbitSeconds: [23, 37, 51] as const,
  pointerLerp: 0.065,
  pointerRadius: 190,
  pointerMaximum: 22,
  routeMs: 360,
});

export const QUALITY = Object.freeze({
  high: { particles: 27000, dpr: 1.5, orbits: 11, antialias: true },
  medium: { particles: 13000, dpr: 1.35, orbits: 5, antialias: true },
  low: { particles: 6800, dpr: 1.15, orbits: 3, antialias: false },
  off: { particles: 0, dpr: 1, orbits: 0, antialias: false },
});

export function getVisualQuality(): VisualQuality {
  if (typeof window === "undefined") return "off";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  const requested = new URLSearchParams(window.location.search).get("visual");
  if (requested === "off" || requested === "low" || requested === "medium" || requested === "high") return requested;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return "low";
  if (window.innerWidth < 640) return "low";
  if (window.innerWidth < 1100 || (navigator.hardwareConcurrency ?? 4) <= 4) return "medium";
  return "high";
}
