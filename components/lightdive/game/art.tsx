"use client";

// Art for Lightdive NFTs, from the on-chain fields (kind, rarity, trait, variant). Seekers use the founder's finished
// paintings (public/lightdive/cards, made by scripts/lightdive-art-webp.mjs); spires and prisms are still drawn here
// until their art arrives. Every screen renders NFTs through <NftArt>.
import { useId } from "react";
import { ATTRIBUTE_COLOR, RARITY_COLOR } from "@/lib/lightdive-copy";
import { KIND, type Attributes } from "@/lib/lightdive";

const LIME = "#c9ff55";
const GOLD = "#e8c46a";
const WHITE_GOLD = "#fff4d6";

export function NftArt({ a, className }: { a: Pick<Attributes, "kind" | "rarity" | "trait" | "variant">; className?: string }) {
  if (a.kind === KIND.spire) return <SpireArt rarity={a.rarity} level={a.trait} variant={a.variant} className={className} />;
  if (a.kind === KIND.prism) return <PrismArt rarity={a.rarity} beam={a.trait} variant={a.variant} className={className} />;
  return <SeekerArt rarity={a.rarity} attribute={a.trait} signature={a.variant} className={className} />;
}

/** Art for a kind before a card is drawn (deck backs and the draw desk). */
export function KindArt({ kind, className }: { kind: number; className?: string }) {
  if (kind === KIND.spire) return <SpireArt rarity={4} level={5} variant={0} className={className} />;
  if (kind === KIND.prism) return <PrismArt rarity={3} beam={2} variant={0} className={className} />;
  return <SeekerArt rarity={3} attribute={2} signature={0} className={className} />;
}

function Backdrop({ id, rarity }: { id: string; rarity: number }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-bg`} cx="50%" cy="42%" r="70%">
          <stop offset="0" stopColor={RARITY_COLOR[rarity]} stopOpacity={0.12 + rarity * 0.03} />
          <stop offset="0.55" stopColor="#0d130e" stopOpacity="0.4" />
          <stop offset="1" stopColor="#070a08" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="200" height="240" fill={`url(#${id}-bg)`} />
    </>
  );
}

export type Box = { x: number; y: number; width: number; height: number };

export function SpireArt({ rarity, level, variant, className, box }: { rarity: number; level: number; variant: number; className?: string; box?: Box }) {
  const id = useId().replace(/:/g, "");
  const accent = rarity === 3 ? GOLD : rarity === 4 ? WHITE_GOLD : RARITY_COLOR[rarity];
  const w = (variant === 1 ? 13 : 5) + rarity * 2; // crack half-width at its widest
  const steps = 3 + Math.floor(rarity / 2);
  const shards = [2, 3, 5, 6, 8][rarity] ?? 2;
  const edgeX = (y: number) => 66 + ((214 - y) * 24) / 184;
  return (
    <svg className={className} viewBox="0 0 200 240" role="img" aria-hidden="true" {...box} overflow="visible">
      {!box && <Backdrop id={id} rarity={rarity} />}
      <defs>
        <linearGradient id={`${id}-stone`} x1="0" x2="1">
          <stop offset="0" stopColor="#4a4f48" />
          <stop offset="0.5" stopColor="#2f342f" />
          <stop offset="1" stopColor="#1d211d" />
        </linearGradient>
        <radialGradient id={`${id}-core`}>
          <stop offset="0" stopColor="#f4ffe0" />
          <stop offset="0.35" stopColor={LIME} />
          <stop offset="1" stopColor={LIME} stopOpacity="0" />
        </radialGradient>
      </defs>
      {Array.from({ length: steps }, (_, i) => {
        const width = 104 - i * 10;
        return <rect key={i} x={100 - width / 2} y={226 - i * 6} width={width} height="6" rx="1" fill={i % 2 ? "#2b302b" : "#363b35"} stroke="#000" strokeOpacity="0.3" />;
      })}
      <path d={`M66 214 L90 30 L98 30 Q${100 - w * 1.7} 98 99 212 Z`} fill={`url(#${id}-stone)`} />
      <path d={`M134 214 L110 30 L102 30 Q${100 + w * 1.7} 98 101 212 Z`} fill={`url(#${id}-stone)`} />
      {Array.from({ length: 13 }, (_, i) => {
        const y = 46 + i * 12.5;
        const x = edgeX(y);
        return (
          <g key={i} stroke={accent} strokeOpacity={rarity >= 3 ? 0.55 : 0.28} strokeWidth="0.8">
            <line x1={x + 4} x2={x + 12} y1={y} y2={y} />
            <line x1={200 - x - 4} x2={200 - x - 12} y1={y} y2={y} />
          </g>
        );
      })}
      {rarity >= 1 && (
        <path d={`M${100 - w * 0.9} 70 L${100 - w * 1.1} 150 M${100 + w * 0.9} 70 L${100 + w * 1.1} 150`} stroke={rarity === 1 ? "#3de7e0" : accent} strokeOpacity="0.45" strokeWidth="1" fill="none" />
      )}
      <circle cx="100" cy="98" r={22 + rarity * 4} fill={`url(#${id}-core)`} opacity={variant === 1 ? 0.35 : 0.55} className="ldg-breathe" />
      <g stroke={LIME} strokeOpacity="0.55" strokeWidth="0.6">
        <line x1="100" y1="98" x2={100 - w * 1.05} y2="84" />
        <line x1="100" y1="98" x2={100 + w * 1.05} y2="84" />
        <line x1="100" y1="98" x2={100 - w * 1.05} y2="112" />
        <line x1="100" y1="98" x2={100 + w * 1.05} y2="112" />
      </g>
      {variant === 1 ? (
        <circle cx="100" cy="98" r={7 + rarity} fill="none" stroke={LIME} strokeWidth="1.4" className="ldg-breathe" />
      ) : variant === 2 ? (
        <g fill={WHITE_GOLD}>
          {[[-4, -7], [4, -5], [-5, 5], [5, 7]].map(([dx, dy], i) => (
            <path key={i} d={`M${100 + dx} ${98 + dy - 3} l3 3 -3 3 -3 -3z`} />
          ))}
        </g>
      ) : (
        <path d={`M100 ${98 - 9 - rarity * 1.5} L${106 + rarity} 98 L100 ${98 + 9 + rarity * 1.5} L${94 - rarity} 98 Z`} fill="#f4ffe0" stroke={LIME} strokeWidth="1.2" />
      )}
      {Array.from({ length: shards }, (_, i) => {
        const angle = (i / shards) * Math.PI * 2 + 0.4;
        const x = 100 + Math.cos(angle) * (24 + rarity * 2);
        const y = 98 + Math.sin(angle) * 8;
        return <path key={i} d={`M${x} ${y - 2.6} l2.2 2.6 -2.2 2.6 -2.2 -2.6z`} fill={rarity >= 3 ? accent : LIME} opacity={Math.sin(angle) > 0 ? 0.95 : 0.5} />;
      })}
      {Array.from({ length: Math.max(1, Math.min(5, level)) }, (_, i) => {
        const y = 150 + i * 12;
        const left = i % 2 === 0;
        const x = left ? edgeX(y) : 200 - edgeX(y);
        const out = left ? -16 : 16;
        return (
          <g key={i}>
            <line x1={x} y1={y} x2={x + out} y2={y} stroke="#5a5f57" strokeWidth="3" strokeLinecap="round" />
            <rect x={x + out - (left ? 6 : 0)} y={y - 1.5} width="6" height="3" rx="1" fill={LIME} opacity="0.9" />
          </g>
        );
      })}
      <g stroke="#6b7069" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M100 30 L100 22 M100 26 L92 16 M100 26 L108 16" />
      </g>
    </svg>
  );
}

export function PrismArt({ rarity, beam, variant, className }: { rarity: number; beam: number; variant: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const accent = rarity === 3 ? GOLD : rarity === 4 ? WHITE_GOLD : RARITY_COLOR[rarity];
  const tear = variant === 2;
  return (
    <svg className={className} viewBox="0 0 200 240" role="img" aria-hidden="true">
      <Backdrop id={id} rarity={rarity} />
      <defs>
        <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.5" />
          <stop offset="0.45" stopColor="#d9f7ff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id={`${id}-beam`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={LIME} stopOpacity="0.95" />
          <stop offset="1" stopColor={LIME} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="214" x2="86" y2="132" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" />
      {beam === 0 && <path d="M112 96 L200 0 L200 92 Z" fill={`url(#${id}-beam)`} opacity="0.4" />}
      {beam === 1 && <path d="M112 98 L200 26 L200 46 Z" fill={`url(#${id}-beam)`} opacity="0.75" />}
      {beam === 2 && (
        <>
          <line x1="114" y1="96" x2="198" y2="10" stroke={`url(#${id}-beam)`} strokeWidth="1.6" />
          <circle cx="196" cy="12" r="2.5" fill="#f4ffe0" />
        </>
      )}
      {tear ? (
        <path d="M100 44 C132 96 134 150 100 186 C66 150 68 96 100 44 Z" fill={`url(#${id}-glass)`} stroke={accent} strokeWidth="1.4" />
      ) : (
        <>
          <path d="M100 40 L132 92 L124 152 L100 192 L76 152 L68 92 Z" fill={`url(#${id}-glass)`} stroke={accent} strokeWidth="1.4" />
          <path d="M100 40 L100 192 M68 92 L132 92 L76 152 L124 152 L68 92 M100 40 L76 152 M100 40 L124 152" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="0.8" fill="none" />
        </>
      )}
      {variant === 1 && (
        <>
          <path d="M100 40 L132 92 L124 152 L100 192 L76 152 L68 92 Z" transform="translate(6 -4)" fill="none" stroke={LIME} strokeOpacity="0.25" />
          <path d="M84 70 L104 104 L92 140 M112 76 L106 120 L118 150" stroke={LIME} strokeWidth="1.1" fill="none" className="ldg-breathe" />
        </>
      )}
      <circle cx="100" cy={tear ? 128 : 112} r={10 + rarity * 2} fill={LIME} opacity="0.18" className="ldg-breathe" />
      <circle cx="100" cy={tear ? 128 : 112} r="3.2" fill="#f4ffe0" />
      <g stroke="#6b7069" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M84 214 L92 196 M116 214 L108 196 M100 218 L100 198" />
      </g>
      <ellipse cx="100" cy="218" rx="30" ry="4" fill="#000" opacity="0.45" />
    </svg>
  );
}

function LightPattern({ attribute, color }: { attribute: number; color: string }) {
  const cx = 100;
  const cy = 92;
  const common = { fill: "none", stroke: color, strokeLinecap: "round" as const };
  switch (attribute) {
    case 0: // Dawnlight: a rising half-sun with short even rays
      return (
        <g {...common} strokeWidth="2">
          <path d="M50 116 A50 50 0 0 1 150 116" />
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI + (i / 8) * Math.PI;
            return <line key={i} x1={cx + Math.cos(a) * 56} y1={116 + Math.sin(a) * 56} x2={cx + Math.cos(a) * 66} y2={116 + Math.sin(a) * 66} />;
          })}
        </g>
      );
    case 1: // Mistlight: soft ripples that never close
      return (
        <g {...common} strokeWidth="1.6" strokeOpacity="0.8">
          {[34, 46, 58].map((r, i) => (
            <circle key={r} cx={cx} cy={cy} r={r} strokeDasharray={`${18 + i * 6} ${9 + i * 3}`} opacity={1 - i * 0.25} />
          ))}
        </g>
      );
    case 2: // Crystallight: a ring of sharp hexagonal facets
      return (
        <g {...common} strokeWidth="1.8">
          <path d={Array.from({ length: 6 }, (_, i) => { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; return `${i ? "L" : "M"}${cx + Math.cos(a) * 54} ${cy + Math.sin(a) * 54}`; }).join(" ") + "Z"} />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return <path key={i} d={`M${cx + Math.cos(a) * 64} ${cy + Math.sin(a) * 64 - 3} l2.5 3 -2.5 3 -2.5 -3z`} fill={color} stroke="none" />;
          })}
        </g>
      );
    case 3: // Emberlight: flame tongues rising
      return (
        <g fill={color} opacity="0.85">
          {Array.from({ length: 9 }, (_, i) => {
            const a = Math.PI + 0.15 + (i / 8) * (Math.PI - 0.3);
            const x = cx + Math.cos(a) * 50;
            const y = cy + 6 + Math.sin(a) * 50;
            return <path key={i} d={`M${x - 5} ${y + 6} Q${x} ${y - 16 - (i % 3) * 5} ${x + 5} ${y + 6} Z`} />;
          })}
        </g>
      );
    case 4: // Stormlight: a jagged ring of lightning
      return (
        <path
          {...common}
          strokeWidth="1.8"
          strokeLinejoin="round"
          d={Array.from({ length: 25 }, (_, i) => { const a = (i / 24) * Math.PI * 2; const r = i % 2 ? 48 : 58; return `${i ? "L" : "M"}${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`; }).join(" ")}
        />
      );
    default: // Abysslight: a vortex drawing inward
      return (
        <path
          {...common}
          strokeWidth="1.8"
          d={Array.from({ length: 60 }, (_, i) => { const a = i * 0.32; const r = 60 - i * 0.9; return `${i ? "L" : "M"}${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`; }).join(" ")}
        />
      );
  }
}

function SignatureSky({ signature }: { signature: number }) {
  if (!signature) return null;
  const stars = Array.from({ length: 18 }, (_, i) => ({ x: (i * 53) % 190 + 5, y: (i * 37) % 120 + 6, r: (i % 3) * 0.5 + 0.6 }));
  return (
    <g opacity="0.75">
      {signature === 1 && <circle cx="100" cy="60" r="70" fill={WHITE_GOLD} opacity="0.12" />}
      {signature === 2 && Array.from({ length: 7 }, (_, i) => <circle key={i} cx={40 + i * 20} cy={22 + Math.abs(3 - i) * 6} r="2.4" fill={WHITE_GOLD} />)}
      {(signature === 3 || signature === 6) && <circle cx="100" cy="62" r="40" fill="none" stroke={WHITE_GOLD} strokeWidth={signature === 3 ? 6 : 2} opacity="0.35" />}
      {signature === 4 && <path d="M10 20 L120 70" stroke={WHITE_GOLD} strokeWidth="1.5" opacity="0.6" />}
      {signature === 5 && <path d="M0 30 Q50 60 100 30 T200 30" stroke="#9be36b" strokeWidth="10" fill="none" opacity="0.18" />}
      {stars.map((s, i) => <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity="0.6" />)}
    </g>
  );
}

/** Finished seeker art (founder, 2026-10-16): one painting per light × rarity, transparent, 3:4 portrait. */
const seekerImage = (light: number, rarity: number) =>
  light >= 0 && light <= 5 && rarity >= 0 && rarity <= 4 ? `/lightdive/cards/seeker-l${light}-r${rarity}.webp` : null;

export function SeekerArt({ rarity, attribute, signature, className }: { rarity: number; attribute: number; signature: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  const image = seekerImage(attribute, rarity);
  if (image) {
    // the painting sits on a glow in its light's colour, so the light reads at every rarity
    const glow = ATTRIBUTE_COLOR[attribute] ?? LIME;
    return (
      <svg className={className} viewBox="0 0 200 240" role="img" aria-hidden="true">
        <Backdrop id={id} rarity={rarity} />
        <defs>
          <radialGradient id={`${id}-light`} cx="50%" cy="56%" r="52%">
            <stop offset="0" stopColor={glow} stopOpacity={0.34 + rarity * 0.04} />
            <stop offset="0.6" stopColor={glow} stopOpacity="0.08" />
            <stop offset="1" stopColor={glow} stopOpacity="0" />
          </radialGradient>
          {/* knee-up paintings end at the canvas edge: fade the bottom so they settle into the card */}
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.8" stopColor="#fff" stopOpacity="1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`${id}-mask`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="240">
            <rect width="200" height="240" fill={`url(#${id}-fade)`} />
          </mask>
        </defs>
        <ellipse cx="100" cy="134" rx="92" ry="104" fill={`url(#${id}-light)`} />
        <image href={image} x="10" y="0" width="180" height="240" preserveAspectRatio="xMidYMid meet" mask={`url(#${id}-mask)`} />
      </svg>
    );
  }
  const accent = rarity === 3 ? GOLD : rarity === 4 ? WHITE_GOLD : RARITY_COLOR[rarity];
  const light = ATTRIBUTE_COLOR[attribute] ?? LIME;
  const finPairs = rarity >= 4 ? 3 : rarity >= 2 ? 2 : 1;
  return (
    <svg className={className} viewBox="0 0 200 240" role="img" aria-hidden="true">
      <Backdrop id={id} rarity={rarity} />
      <SignatureSky signature={signature} />
      <g className="ldg-breathe">
        <LightPattern attribute={attribute} color={light} />
      </g>
      {Array.from({ length: finPairs }, (_, i) => (
        <g key={i} stroke={accent} strokeOpacity={0.5 + i * 0.15} strokeWidth="3" strokeLinecap="round">
          <line x1="78" y1={124 + i * 8} x2={46 - i * 6} y2={98 - i * 4} />
          <line x1="122" y1={124 + i * 8} x2={154 + i * 6} y2={98 - i * 4} />
        </g>
      ))}
      <g fill="#1f2420" stroke={accent} strokeOpacity="0.55" strokeWidth="1.1" strokeLinejoin="round">
        {/* legs and boots */}
        <path d="M84 176 L82 222 L72 228 L96 228 L97 176 Z" />
        <path d="M116 176 L118 222 L128 228 L104 228 L103 176 Z" />
        {/* torso: shoulders, chest plate, waist */}
        <path d="M66 136 Q70 124 86 122 L114 122 Q130 124 134 136 L128 160 L120 180 L80 180 L72 160 Z" />
        {/* left arm hanging, right arm raised to hold the collector */}
        <path d="M68 138 L58 176 L64 188 L72 186 L76 160 Z" />
        <path d="M132 138 L142 160 L146 176 L138 180 L130 162 Z" />
      </g>
      <path d="M84 130 L100 142 L116 130" stroke={accent} strokeOpacity="0.6" fill="none" />
      <path d="M100 148 l5 6 -5 6 -5 -6z" fill={LIME} />
      <line x1="80" y1="180" x2="120" y2="180" stroke={LIME} strokeOpacity="0.5" />
      {/* helmet with the visor band */}
      <path d="M78 96 Q78 66 100 64 Q122 66 122 96 L118 112 Q100 120 82 112 Z" fill="#2a2f2b" stroke={accent} strokeOpacity="0.6" strokeWidth="1.2" />
      <rect x="81" y="86" width="38" height="7" rx="3.5" fill={LIME} className="ldg-visor" />
      <path d="M88 116 L100 122 L112 116" stroke="#000" strokeOpacity="0.4" fill="none" />
      {/* light collector */}
      <path d="M139 178 l10 0 2 16 -14 0z" fill="#2a2f2b" stroke={accent} strokeOpacity="0.6" />
      <circle cx="144" cy="187" r="3.8" fill={LIME} opacity="0.95" />
      <ellipse cx="100" cy="230" rx="52" ry="6" fill={LIME} opacity="0.12" />
    </svg>
  );
}
