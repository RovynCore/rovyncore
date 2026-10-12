"use client";

// Shared building blocks for the v3 pages: rarity gems and tags, value tiles, the modal frame, trait labels.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { VOYAGES } from "@/lib/lightdive-v3/rules";
import { BEAM, BEAM_HINT, GEM_SIDES, KIND, LIGHT, LIGHT_COLOR, RARITY_COLOR, TIER, fmt } from "./copy";
import type { SimNft } from "./sim";
import { chime } from "./audio";
import { calm } from "./settings";
import { tl } from "@/lib/lightdive-v3/i18n";

/** A gem that gains a corner per rarity tier: circle, triangle, square, pentagon, hexagon. */
export function RarityGem({ rarity, size = 18, className }: { rarity: number; size?: number; className?: string }) {
  const color = RARITY_COLOR[rarity];
  const sides = GEM_SIDES[rarity];
  const id = `gem-${rarity}`;
  const points = (r: number) =>
    Array.from({ length: sides }, (_, i) => {
      const a = -Math.PI / 2 + (i / sides) * Math.PI * 2;
      return `${12 + Math.cos(a) * r},${12 + Math.sin(a) * r}`;
    }).join(" ");
  return (
    <svg className={`v3-gem${className ? ` ${className}` : ""}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ filter: `drop-shadow(0 0 ${2 + rarity}px ${color})` }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {sides === 0 ? <circle cx="12" cy="12" r="8" fill={`url(#${id})`} stroke="#fff" strokeOpacity="0.5" /> : <polygon points={points(10)} fill={`url(#${id})`} stroke="#fff" strokeOpacity="0.55" strokeLinejoin="round" />}
      {sides > 0 && <polygon points={points(5)} fill="#fff" fillOpacity="0.28" />}
    </svg>
  );
}

/** Gem + rarity name, in the tier colour. */
export function RarityTag({ rarity, compact }: { rarity: number; compact?: boolean }) {
  void compact;
  return (
    <span className="v3-rarity" style={{ ["--rc" as string]: RARITY_COLOR[rarity] }}>
      <RarityGem rarity={rarity} size={compact ? 15 : 18} />
      <b>{TIER[rarity]}</b>
    </span>
  );
}

/** A labelled value: label on top, the number big underneath. */
export function Tile({ label, value, sub, tone, wide }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: string; wide?: boolean }) {
  return (
    <div className={`v3-tile${wide ? " is-wide" : ""}`} style={tone ? { ["--tone" as string]: tone } : undefined}>
      <span>{label}</span>
      <b>{value}</b>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

const openModals: number[] = [];
let modalSeq = 0;

export function Modal({ label, onClose, children, className }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    // Escape closes the top-most dialog only
    const id = ++modalSeq;
    openModals.push(id);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && openModals.at(-1) === id) close.current(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openModals.splice(openModals.indexOf(id), 1);
    };
  }, []);
  return (
    <div className="v3-modal" role="dialog" aria-label={label} onClick={onClose}>
      <div className={`v3-modal__card${className ? ` ${className}` : ""}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="v3-modal__close" onClick={onClose} aria-label={tl("關閉")}><X aria-hidden="true" /></button>
        {children}
      </div>
    </div>
  );
}

/** What makes the card a spire, prism or seeker: berths, beam or light. */
export function Trait({ n }: { n: Pick<SimNft, "kind" | "trait"> }) {
  if (n.kind === 0) return <span className="v3-trait">{n.trait} {tl("泊位")}</span>;
  if (n.kind === 1) return <span className="v3-trait">{BEAM[n.trait]} · {BEAM_HINT[n.trait]}</span>;
  return <span className="v3-trait" style={{ color: LIGHT_COLOR[n.trait] }}>● {LIGHT[n.trait]}</span>;
}

export const traitName = (kind: number) => (kind === 0 ? tl("泊位") : kind === 1 ? tl("光束") : tl("光紋"));

/** Remaining voyages as a bar with the number. */
export function Voyages({ n }: { n: Pick<SimNft, "kind" | "voyages"> }) {
  const k = n.voyages / VOYAGES[n.kind as 0 | 1 | 2];
  return (
    <span className={`v3-voyages${k < 0.15 ? " is-low" : ""}`}>
      <i><b style={{ width: `${k * 100}%` }} /></i>
      <em>{n.voyages}/{VOYAGES[n.kind as 0 | 1 | 2]}</em>
    </span>
  );
}

export const kindName = (k: number) => KIND[k];

/** A number that rolls to its new value instead of jumping. */
export function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const a = from.current, b = value, start = performance.now();
    if (a === b) return;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 520);
      const v = a + (b - a) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{digits ? fmt(shown, digits) : Math.round(shown).toLocaleString()}</>;
}

/** A reward landing: small lights fly from `from` to the element matching `target` (a top-bar tile), which then
 *  pulses. Purely visual; skipped for reduced motion. */
export function flyLight(from: Element | null, target: string, color = "#f0c766", n = 18) {
  const to = document.querySelector(target);
  if (!from || !to || calm()) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + 26, y1 = b.top + b.height / 2;
  for (let i = 0; i < n; i++) {
    const p = document.createElement("i");
    p.className = "v3-flylight";
    p.style.setProperty("--fc", color);
    document.body.appendChild(p);
    const mx = x0 + (Math.random() - 0.5) * 220, my = y0 - 40 - Math.random() * 160;
    const anim = p.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(0.3)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.4)`, opacity: 0.9 },
    ], { duration: 650 + Math.random() * 350, delay: i * 28, easing: "cubic-bezier(.55, 0, .25, 1)", fill: "both" });
    anim.onfinish = () => p.remove();
  }
  window.setTimeout(() => {
    to.classList.remove("is-bump");
    void (to as HTMLElement).offsetWidth;
    to.classList.add("is-bump");
    chime(5, 0.9);
    window.setTimeout(() => to.classList.remove("is-bump"), 800);
  }, 800);
}
