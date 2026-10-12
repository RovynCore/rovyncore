"use client";

// The game stage: an animated starfield (canvas) under the Stele Plain and the sky of light
// coordinates (SVG). Purely presentational; components/lightdive/game/base.tsx owns the state.
import { useEffect, useRef, useState } from "react";
import { SpireArt } from "./art";

/** Scene units follow the stage's real shape, so nothing is ever cropped: the short side is at least
 * 900 (landscape) or the width at least 1100 (portrait). */
function sceneSize(width: number, height: number) {
  const aspect = width > 0 && height > 0 ? width / height : 16 / 9;
  return aspect >= 1100 / 900 ? { W: 900 * aspect, H: 900 } : { W: 1100, H: 1100 / aspect };
}
/** Light coordinates I-VI: deeper is higher and further to the right. */
function nodeXY(i: number, W: number, ground: number) {
  const top = ground > W ? 260 : 130; // portrait screens: leave room for the prompt chips
  const bottom = ground - 250;
  return { x: W * (0.13 + 0.74 * (i / 5)), y: bottom - (bottom - top) * (i / 5) };
}
const TIER_COLOR = ["#ff8a7a", "#c9ff55", "#3de7e0", "#e8c46a", "#fff4d6"];

export type SceneSpire = { id: bigint; rarity: number; level: number; variant: number; status: "ready" | "bridge" | "rested" | "unmanned"; title: string; sub: string; crew?: string[] };
export type SceneNode = { depth: number; roman: string; light: string; color: string; sub: string; state: "idle" | "reachable" | "locked" | "selected" };
export type SceneBridge = { spire: bigint; depth: number; color: string; tier: number | null; label?: string; fresh?: boolean; aim?: boolean };

export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    type Star = { x: number; y: number; r: number; p: number; s: number };
    let stars: Star[] = [];
    let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.round((w * h) / 2600);
      stars = Array.from({ length: count }, () => ({ x: Math.random() * w, y: Math.random() * h * 0.86, r: Math.random() * 1.3 + 0.2, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.4 }));
    };
    const draw = (time: number) => {
      g.clearRect(0, 0, w, h);
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, "#03060a");
      sky.addColorStop(0.6, "#071012");
      sky.addColorStop(1, "#0b1408");
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      // drifting nebulae
      const t = time / 1000;
      const blobs: [number, number, number, string][] = [
        [0.72 + Math.sin(t / 40) * 0.02, 0.22, 0.42, "rgba(120,200,40,0.10)"],
        [0.2, 0.3 + Math.cos(t / 50) * 0.02, 0.34, "rgba(60,140,180,0.08)"],
        [0.5, 0.05, 0.3, "rgba(170,120,255,0.05)"],
      ];
      for (const [bx, by, br, color] of blobs) {
        const grad = g.createRadialGradient(bx * w, by * h, 0, bx * w, by * h, br * Math.max(w, h));
        grad.addColorStop(0, color);
        grad.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
      for (const s of stars) {
        const a = reduce ? 0.7 : 0.45 + 0.55 * Math.sin(s.p + t * s.s);
        g.globalAlpha = Math.max(0.08, a);
        g.fillStyle = s.r > 1.2 ? "#eaffd0" : "#ffffff";
        g.beginPath();
        g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      if (!reduce) {
        if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.3, vx: 7 + Math.random() * 5, vy: 2 + Math.random() * 2, life: 1 };
        if (shoot) {
          const grad = g.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * 10, shoot.y - shoot.vy * 10);
          grad.addColorStop(0, `rgba(230,255,190,${shoot.life})`);
          grad.addColorStop(1, "rgba(230,255,190,0)");
          g.strokeStyle = grad;
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(shoot.x, shoot.y);
          g.lineTo(shoot.x - shoot.vx * 10, shoot.y - shoot.vy * 10);
          g.stroke();
          shoot.x += shoot.vx;
          shoot.y += shoot.vy;
          shoot.life -= 0.02;
          if (shoot.life <= 0) shoot = null;
        }
        raf = requestAnimationFrame(draw);
      }
    };
    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduce) draw(0);
    });
    observer.observe(canvas);
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", visibility);
    if (reduce) draw(0);
    else raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  return <canvas ref={ref} className="ldg-starfield" aria-hidden="true" />;
}

function spireLayout(n: number, W: number, GROUND: number) {
  const room = (W - 240) / Math.max(1, n);
  const size = Math.min(1, room / 190);
  const width = 170 * size;
  const height = 204 * size;
  const left = 120 + room / 2;
  const right = W - 120 - room / 2;
  return Array.from({ length: n }, (_, i) => {
    const x = n === 1 ? W * 0.5 : left + ((right - left) * i) / (n - 1);
    const lift = (i % 2) * 26 * size; // stagger so labels never collide
    return { x, top: GROUND - height + 22 - lift, width, height, baseY: GROUND + 22 - lift };
  });
}

function bridgePath(sx: number, sy: number, nx: number, ny: number) {
  const cx = (sx + nx) / 2;
  const cy = Math.min(sy, ny) - 140;
  return `M${sx} ${sy} Q${cx} ${cy} ${nx} ${ny}`;
}

export function SkyScene({ spires, nodes, bridges, selected, onSpire, onNode, plainLabel, emptyLabel }: {
  spires: SceneSpire[];
  nodes: SceneNode[];
  bridges: SceneBridge[];
  selected: bigint | null;
  onSpire: (id: bigint) => void;
  onNode: (depth: number) => void;
  plainLabel: string;
  emptyLabel: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ W: 1600, H: 900 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize(sceneSize(r.width, r.height));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const { W: VIEW_W, H: VIEW_H } = size;
  const GROUND = VIEW_H - 120;
  const shown = spires.slice(0, 9);
  const layout = spireLayout(shown.length, VIEW_W, GROUND);
  const pos = new Map(shown.map((s, i) => [s.id, layout[i]]));
  return (
    <svg ref={ref} className="ldg-scene" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet" role="group" aria-label={plainLabel}>
      <defs>
        <linearGradient id="ldg-ground" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0f170e" />
          <stop offset="1" stopColor="#040604" />
        </linearGradient>
        <radialGradient id="ldg-horizon" cx="50%" cy="0%" r="60%">
          <stop offset="0" stopColor="#c9ff55" stopOpacity="0.16" />
          <stop offset="1" stopColor="#c9ff55" stopOpacity="0" />
        </radialGradient>
        <filter id="ldg-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* distant steles on the horizon */}
      <g fill="#0a110b" opacity="0.9">
        {[0.05, 0.15, 0.26, 0.4, 0.61, 0.74, 0.87, 0.96].map((fx) => VIEW_W * fx).map((x, i) => (
          <path key={x} d={`M${x - 10} ${GROUND - 8} L${x - 4} ${GROUND - 60 - (i % 3) * 22} L${x + 4} ${GROUND - 60 - (i % 3) * 22} L${x + 10} ${GROUND - 8} Z`} />
        ))}
      </g>
      <ellipse cx={VIEW_W / 2} cy={GROUND - 10} rx={VIEW_W * 0.7} ry="70" fill="url(#ldg-horizon)" />
      <path d={`M0 ${GROUND - 10} Q${VIEW_W / 2} ${GROUND - 30} ${VIEW_W} ${GROUND - 10} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z`} fill="url(#ldg-ground)" />
      <g stroke="#c9ff55" strokeOpacity="0.07" strokeWidth="1">
        {Array.from({ length: 17 }, (_, i) => {
          const x = (VIEW_W / 16) * i;
          return <line key={i} x1={VIEW_W / 2 + (x - VIEW_W / 2) * 0.25} y1={GROUND - 12} x2={x + (x - VIEW_W / 2) * 0.6} y2={VIEW_H} />;
        })}
        {[0, 24, 56, 100, 160].map((d) => <line key={d} x1="0" x2={VIEW_W} y1={GROUND + d} y2={GROUND + d} />)}
      </g>

      {/* light coordinates */}
      {nodes.map((node) => {
        const p = nodeXY(node.depth, VIEW_W, GROUND);
        const clickable = node.state === "reachable" || node.state === "selected";
        return (
          <g
            key={node.depth}
            className={`ldg-node is-${node.state}`}
            transform={`translate(${p.x} ${p.y})`}
            style={{ ["--nc" as string]: node.color }}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            aria-label={`${node.roman} ${node.light}`}
            onClick={clickable ? () => onNode(node.depth) : undefined}
            onKeyDown={clickable ? (e) => (e.key === "Enter" || e.key === " ") && onNode(node.depth) : undefined}
          >
            <circle r="46" className="ldg-node__halo" />
            <circle r="30" className="ldg-node__ring" />
            <circle r="14" className="ldg-node__core" filter="url(#ldg-glow)" />
            <text y="-56" className="ldg-node__roman">{node.roman}</text>
            <text y="66" className="ldg-node__light">{node.light}</text>
            <text y="88" className="ldg-node__sub">{node.sub}</text>
          </g>
        );
      })}

      {/* light bridges */}
      {bridges.map((b) => {
        const s = pos.get(b.spire);
        if (!s) return null;
        const n = nodeXY(b.depth, VIEW_W, GROUND);
        const d = bridgePath(s.x, s.top + 6, n.x, n.y);
        const color = b.tier === null ? b.color : TIER_COLOR[b.tier] ?? b.color;
        return (
          <g key={`${b.spire}-${b.depth}`} className={`ldg-bridge${b.aim ? " is-aim" : b.tier === null ? " is-flight" : ` is-answered t${b.tier}`}${b.fresh ? " is-fresh" : ""}`} style={{ ["--bc" as string]: color }}>
            <path d={d} className="ldg-bridge__glow" pathLength={1} />
            <path d={d} className="ldg-bridge__beam" pathLength={1} />
            {b.tier === null && !b.aim && (
              <circle r="5" className="ldg-bridge__spark">
                <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
              </circle>
            )}
            {b.label && (
              <text x={s.x} y={s.top - 26} className="ldg-bridge__label">{b.label}</text>
            )}
          </g>
        );
      })}

      {/* spires on the plain */}
      {shown.map((s, i) => {
        const l = layout[i];
        return (
          <g
            key={String(s.id)}
            className={`ldg-plain-spire is-${s.status}${selected === s.id ? " is-selected" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`${s.title} ${s.sub}`}
            aria-pressed={selected === s.id}
            onClick={() => onSpire(s.id)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSpire(s.id)}
          >
            <ellipse cx={l.x} cy={l.baseY} rx={l.width * 0.55} ry={l.width * 0.12} className="ldg-plain-spire__pad" />
            <SpireArt rarity={s.rarity} level={s.level} variant={s.variant} box={{ x: l.x - l.width / 2, y: l.top, width: l.width, height: l.height }} />
            {s.crew && s.crew.length > 0 && (
              <g className="ldg-crew-orbit" style={{ transformOrigin: `${l.x}px ${l.top + (98 * l.height) / 240}px` }}>
                {s.crew.map((color, k) => {
                  const a = (k / s.crew!.length) * Math.PI * 2;
                  return <circle key={k} cx={l.x + Math.cos(a) * l.width * 0.42} cy={l.top + (98 * l.height) / 240 + Math.sin(a) * l.width * 0.42} r={4.5} fill={color} className="ldg-crew-orbit__dot" />;
                })}
              </g>
            )}
            <text x={l.x} y={l.baseY + 34} className="ldg-plain-spire__title">{s.title}</text>
            <text x={l.x} y={l.baseY + 58} className="ldg-plain-spire__sub">{s.sub}</text>
          </g>
        );
      })}
      {shown.length === 0 && (
        <g className="ldg-plain-empty">
          {[-200, 0, 200].map((dx) => <ellipse key={dx} cx={VIEW_W / 2 + dx} cy={GROUND + 30} rx="70" ry="14" />)}
          <text x={VIEW_W / 2} y={GROUND + 92}>{emptyLabel}</text>
        </g>
      )}
    </svg>
  );
}
