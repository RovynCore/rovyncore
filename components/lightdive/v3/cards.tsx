"use client";

// Card faces (10-19): the trading-card look of a Lightdive NFT, used by the summon reveal and the card detail.
// - Framed cards (微光, 輝脈, 澄晶): the painting in a window, name, power and trait below.
// - Full-art cards (稜光, 曜核): the painting over its kind's scene fills the whole card, the text sits on a fade.
// - Foil (稜光 and up): a holographic sheen and a glare that follow the pointer, and a slight tilt; at rest it
//   shimmers on its own. Calm mode keeps the sheen still.
// - Card backs: the founder's three backs, one per kind.
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import type { Kind } from "@/lib/lightdive-v3/rules";
import { NftArt } from "../game/art";
import { RarityTag, Trait } from "./kit";
import { KIND, RARITY_COLOR, TIER } from "./copy";
import { gap, tl } from "@/lib/lightdive-v3/i18n";
import type { SimNft } from "./sim";

const KIND_FILE: Record<Kind, string> = { 0: "spire", 1: "prism", 2: "seeker" };
export const backImage = (kind: Kind) => `/lightdive/back/${KIND_FILE[kind]}.webp`;
const sceneImage = (kind: Kind) => `/lightdive/banner/${KIND_FILE[kind]}.webp`;
/** 稜光 and 曜核 are full-art foil cards. */
export const isFoil = (rarity: number) => rarity >= 3;

type Face = Pick<SimNft, "id" | "kind" | "rarity" | "power" | "trait">;

/** A holographic layer over its children that follows the pointer. */
export function Foil({ rarity, children, className = "", tilt = true }: { rarity: number; children: ReactNode; className?: string; tilt?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!isFoil(rarity)) return <div className={`v3-foil is-plain ${className}`}>{children}</div>;
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    el.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    if (tilt) {
      el.style.setProperty("--rx", `${((x - 0.5) * 14).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${((0.5 - y) * 14).toFixed(2)}deg`);
    }
    el.classList.add("is-live");
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove("is-live");
    el.style.removeProperty("--rx");
    el.style.removeProperty("--ry");
  };
  return (
    <div ref={ref} className={`v3-foil r${rarity} ${className}`} onPointerMove={move} onPointerLeave={leave}>
      {children}
      <i className="v3-foil__holo" aria-hidden="true" />
      <i className="v3-foil__glare" aria-hidden="true" />
    </div>
  );
}

/** The front of a card. `size` only changes the type scale (the grid and the showcase). */
export function CardFace({ n, size = "md" }: { n: Face; size?: "sm" | "md" | "lg" }) {
  const full = isFoil(n.rarity);
  const style = { ["--rc" as string]: RARITY_COLOR[n.rarity], ["--scene" as string]: `url(${sceneImage(n.kind)})` } as CSSProperties;
  return (
    <span className={`v3-face r${n.rarity} is-${size}${full ? " is-full" : ""}`} style={style}>
      {full && <span className="v3-face__scene" aria-hidden="true" />}
      <span className="v3-face__top"><RarityTag rarity={n.rarity} compact /><small>#{n.id}</small></span>
      <span className="v3-face__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
      <span className="v3-face__info">
        <b className="v3-face__name">{TIER[n.rarity]}{gap()}{KIND[n.kind]}</b>
        <span className="v3-face__pw"><small>{tl("戰力")}</small><b>{n.power}</b></span>
        <Trait n={n as SimNft} />
      </span>
      <i className="v3-face__frame" aria-hidden="true" />
    </span>
  );
}

/** The back of a card of a kind (the founder's art); `hint` is the rarity tell before the flip. */
export function CardBackFace({ kind, hint }: { kind: Kind; hint?: number }) {
  return (
    <span className={`v3-backface${hint !== undefined ? ` h${hint}` : ""}`}>
      <i className="v3-backface__seal" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={backImage(kind)} alt="" draggable={false} />
    </span>
  );
}
