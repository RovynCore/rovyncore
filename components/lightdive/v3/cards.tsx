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
import { CIRCLED, KIND, RARITY_COLOR, SLOT, TIER } from "./copy";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { marksOf, type CardHistory, type MarkKey } from "@/lib/lightdive-v3/history";
import { gap, tl } from "@/lib/lightdive-v3/i18n";
import type { SimNft } from "./sim";

const KIND_FILE: Record<Kind, string> = { 0: "spire", 1: "prism", 2: "seeker" };
export const backImage = (kind: Kind) => `/lightdive/back/${KIND_FILE[kind]}.webp`;
/** A card's painting (transparent), for thumbnails and share images. */
export const paintingOf = (n: { kind: number; rarity: number; trait: number }) =>
  n.kind === 0 ? `/lightdive/cards/spire-r${n.rarity}.webp` : n.kind === 1 ? `/lightdive/cards/prism-b${n.trait}-r${n.rarity}.webp` : `/lightdive/cards/seeker-l${n.trait}-r${n.rarity}.webp`;
/** The scene behind a full-art card: a seeker stands in its light's own landscape (the founder's art, 10-19); spires
 *  and prisms use their kind's banner. */
export const sceneImage = (kind: Kind, trait: number) =>
  kind === 2 && trait >= 0 && trait <= 5 ? `/lightdive/cards/bg/seeker-bg-l${trait}.webp` : `/lightdive/banner/${KIND_FILE[kind]}.webp`;
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
  const style = { ["--rc" as string]: RARITY_COLOR[n.rarity], ["--scene" as string]: `url(${sceneImage(n.kind, n.trait)})` } as CSSProperties;
  return (
    <span className={`v3-face r${n.rarity} k${n.kind} is-${size}${full ? " is-full" : ""}`} style={style}>
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

// ---------------------------------------------------------------- 卡片履歷 (10-19)

const MARK: Record<MarkKey, { name: () => string; how: () => string; tone: string }> = {
  legend: { name: () => tl("傳說見證"), how: () => tl("曾經隨隊帶回傳說"), tone: "#fff4d6" },
  crown: { name: () => tl("星冠見證"), how: () => tl("到過核心星冠（⑥）"), tone: "#f0c766" },
  abyss: { name: () => tl("深淵歸來"), how: () => tl("完成過一趟深潛"), tone: "#3de7e0" },
  harvest: { name: () => tl("豐收常客"), how: () => tl("大豐收以上 10 次"), tone: "#c9ff55" },
  veteran: { name: () => tl("老兵"), how: () => tl("出航 30 次以上"), tone: "#cfd8c8" },
  renewed: { name: () => tl("續航者"), how: () => tl("續航過一次"), tone: "#7fd3ff" },
};

/** The marks a card has earned, as small chips (`max` keeps grids tidy). */
export function Marks({ keys, max }: { keys: MarkKey[]; max?: number }) {
  if (!keys.length) return null;
  const shown = max ? keys.slice(0, max) : keys;
  return (
    <span className="v3-marks">
      {shown.map((k) => <em key={k} style={{ ["--mk" as string]: MARK[k].tone }} title={MARK[k].how()}>{MARK[k].name()}</em>)}
      {max && keys.length > max && <em className="is-more">+{keys.length - max}</em>}
    </span>
  );
}

/** The card's history in the detail views: what it has lived through, and the marks with how each was earned. */
export function HistoryPanel({ h, renewed, empty }: { h: CardHistory | null; renewed?: boolean; empty?: string }) {
  const marks = marksOf(h, renewed);
  return (
    <div className="v3-history">
      <h4>{tl("卡片履歷")}</h4>
      {!h || !h.dives ? <p className="v3-muted">{empty ?? tl("這張卡還沒有出航過。它的每一趟都會記在這裡，跟著卡一起轉手。")}</p> : (
        <>
          <dl>
            <div><dt>{tl("出航")}</dt><dd>{tl("{0} 趟", { 0: h.dives })}</dd></div>
            <div><dt>{tl("最深到達")}</dt><dd>{h.deepest >= 0 ? `${CIRCLED[DESTINATIONS[h.deepest].cluster]}${SLOT[DESTINATIONS[h.deepest].slot]}` : "—"}</dd></div>
            <div><dt>{tl("最高倍率")}</dt><dd>{h.best ? `×${(h.best / 100).toFixed(2)}` : "—"}</dd></div>
            <div><dt>{tl("大豐收以上")}</dt><dd>{h.greats}</dd></div>
            <div><dt>{tl("傳說")}</dt><dd>{h.legends}</dd></div>
            <div><dt>{tl("跟過的隊伍")}</dt><dd>{h.spires}</dd></div>
          </dl>
          {h.first !== null && <small className="v3-muted">{tl("第一次出航：{0}", { 0: new Date(h.first * 86_400_000).toISOString().slice(0, 10) })}</small>}
        </>
      )}
      {marks.length > 0 && (
        <ul className="v3-history__marks">
          {marks.map((k) => <li key={k} style={{ ["--mk" as string]: MARK[k].tone }}><b>{MARK[k].name()}</b><small>{MARK[k].how()}</small></li>)}
        </ul>
      )}
      <p className="v3-muted">{tl("履歷和標記只是紀錄與榮譽，不影響戰力、勝算或收益。")}</p>
    </div>
  );
}
