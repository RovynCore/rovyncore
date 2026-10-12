// WebGL scene for the Lightdive base (PixiJS). Painted textures from pixi-paint.ts, animated here:
// parallax starfield and nebulae, the Stele Plain with its spires, the six light coordinates,
// particle light bridges, a camera that leans toward the selection, and launch / answer effects.
import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, type TextStyleOptions } from "pixi.js";
import type { SceneBridge, SceneNode, SceneSpire } from "./scene";
import * as P from "./pixi-paint";

export type EngineState = { spires: SceneSpire[]; nodes: SceneNode[]; bridges: SceneBridge[]; selected: bigint | null };
export type EngineCallbacks = { onSpire: (id: bigint) => void; onNode: (depth: number) => void };
export type Engine = { update: (s: EngineState) => void; destroy: () => void };

const TIER = [0xff8a7a, 0xc9ff55, 0x3de7e0, 0xe8c46a, 0xfff4d6];
const LIME = 0xc9ff55;
const FONT = '"RV Sans", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif';
const MONO = '"RV Mono", ui-monospace, monospace';
const hex = (c: string) => parseInt(c.replace("#", ""), 16);

type Pt = { x: number; y: number };
const bez = (a: Pt, c: Pt, b: Pt, t: number): Pt => ({
  x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

type SpireView = {
  id: bigint; root: Container; ring: Graphics; body: Sprite; core: Sprite; coreGlow: Sprite; crack: Sprite; pad: Sprite;
  shards: Sprite[]; crew: Sprite[]; title: Text; sub: Text; status: SceneSpire["status"];
  x: number; ground: number; h: number; coreY: number; topY: number; hover: boolean; motesAt: number;
};
type NodeView = { depth: number; root: Container; halo: Sprite; core: Sprite; ring: Graphics; roman: Text; light: Text; sub: Text; state: SceneNode["state"]; color: number; x: number; y: number; r: number };
type BridgeView = { key: string; line: Graphics; parts: Sprite[]; a: Pt; c: Pt; b: Pt; color: number; kind: "flight" | "answered" | "aim" | "broken"; tier: number | null; seed: number };
type Fx = { sprite: Sprite | Graphics; life: number; max: number; step: (fx: Fx, k: number) => void };

export async function createEngine(host: HTMLElement, cb: { current: EngineCallbacks }): Promise<Engine> {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: "webgl" });
  host.appendChild(app.canvas);
  app.canvas.setAttribute("aria-hidden", "true");

  const tex = {
    glow: Texture.from(P.paintGlow(256, 0.5)),
    soft: Texture.from(P.paintGlow(256, 0.85)),
    star: Texture.from(P.paintStar(32)),
    sparkle: Texture.from(P.paintSparkle(128)),
    shard: Texture.from(P.paintShard(24)),
    sky: Texture.from(P.paintSky(512)),
    ground: Texture.from(P.paintGround(1024, 256)),
    monolith: Texture.from(P.paintMonolith(40, 160)),
    nebulae: [
      Texture.from(P.paintNebula(900, 600, ["rgba(140,220,50,ALPHA)", "rgba(60,150,120,ALPHA)", "rgba(200,255,120,ALPHA)"], 11)),
      Texture.from(P.paintNebula(900, 600, ["rgba(70,130,200,ALPHA)", "rgba(120,90,220,ALPHA)", "rgba(40,180,170,ALPHA)"], 23)),
    ],
  };
  const spireTex = new Map<string, Texture>();
  const coreTex = new Map<number, Texture>();
  const spireTexture = (s: SceneSpire) => {
    const key = `${s.rarity}-${s.level}-${s.variant}`;
    if (!spireTex.has(key)) spireTex.set(key, Texture.from(P.paintSpire({ rarity: s.rarity, level: s.level, variant: s.variant }, 3)));
    return spireTex.get(key)!;
  };
  const coreTexture = (variant: number) => {
    if (!coreTex.has(variant)) coreTex.set(variant, Texture.from(P.paintCore(variant, 128)));
    return coreTex.get(variant)!;
  };

  // ---------------------------------------------------------------- layers
  const sky = new Sprite(tex.sky);
  const nebulaLayer = new Container();
  const starsFar = new Container();
  const world = new Container(); // camera
  const starsNear = new Container();
  const constellation = new Graphics();
  const horizon = new Container();
  const ground = new Container();
  const groundGrid = new Graphics();
  const bridgeLayer = new Container();
  const spireLayer = new Container();
  const nodeLayer = new Container();
  const fxLayer = new Container();
  const labelLayer = new Container();
  app.stage.addChild(sky, nebulaLayer, starsFar, world);
  world.addChild(starsNear, constellation, nodeLayer, horizon, ground, bridgeLayer, spireLayer, fxLayer, labelLayer);
  ground.addChild(groundGrid);

  const nebulae = tex.nebulae.map((t, i) => {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.alpha = i === 0 ? 0.9 : 0.75;
    nebulaLayer.addChild(s);
    return s;
  });

  type Star = { s: Sprite; base: number; phase: number; speed: number; depth: number; x: number; y: number };
  let stars: Star[] = [];
  const makeStars = (W: number, H: number) => {
    for (const st of stars) st.s.destroy();
    stars = [];
    const count = Math.min(900, Math.round((W * H) / 2200));
    let seed = 99;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < count; i++) {
      const near = rnd() < 0.18;
      const s = new Sprite(tex.star);
      s.anchor.set(0.5);
      s.blendMode = "add";
      const size = near ? 7 + rnd() * 9 : 3 + rnd() * 6;
      s.width = s.height = size;
      s.tint = rnd() < 0.15 ? 0xd8ffb0 : rnd() < 0.1 ? 0xb8d8ff : 0xffffff;
      const st = { s, base: near ? 0.75 : 0.35 + rnd() * 0.45, phase: rnd() * Math.PI * 2, speed: 0.4 + rnd() * 1.6, depth: near ? 1 : 0.3, x: rnd() * W, y: rnd() * H * 0.82 };
      s.position.set(st.x, st.y);
      (near ? starsNear : starsFar).addChild(s);
      stars.push(st);
    }
  };

  const horizonGlow = new Sprite(tex.soft);
  horizonGlow.anchor.set(0.5);
  horizonGlow.tint = LIME;
  horizonGlow.blendMode = "add";
  const groundSprite = new Sprite(tex.ground);
  const fog = new Sprite(tex.soft);
  fog.anchor.set(0.5);
  fog.tint = 0x2a4a30;
  fog.blendMode = "add";
  horizon.addChild(horizonGlow);
  ground.addChildAt(groundSprite, 0);
  ground.addChild(fog);
  let monoliths: Sprite[] = [];

  // ---------------------------------------------------------------- layout
  let W = 0;
  let H = 0;
  let GROUND = 0;
  let portrait = false;
  const layoutStatic = () => {
    W = app.screen.width;
    H = app.screen.height;
    portrait = H > W;
    GROUND = H * (portrait ? 0.8 : 0.79);
    sky.width = W;
    sky.height = H;
    nebulae[0].position.set(W * 0.72, H * 0.24);
    nebulae[0].scale.set(Math.max(W / 700, H / 500));
    nebulae[1].position.set(W * 0.22, H * 0.3);
    nebulae[1].scale.set(Math.max(W / 900, H / 600));
    makeStars(W, H);
    horizonGlow.position.set(W / 2, GROUND - H * 0.06);
    horizonGlow.width = W * 1.5;
    horizonGlow.height = H * 0.22;
    horizonGlow.alpha = 0.32;
    groundSprite.position.set(-W * 0.1, GROUND - H * 0.06);
    groundSprite.width = W * 1.2;
    groundSprite.height = H - GROUND + H * 0.08;
    fog.position.set(W / 2, GROUND - H * 0.04);
    fog.width = W * 1.4;
    fog.height = H * 0.12;
    fog.alpha = 0.5;
    for (const m of monoliths) m.destroy();
    monoliths = [0.04, 0.13, 0.22, 0.35, 0.58, 0.69, 0.81, 0.93].map((fx, i) => {
      const s = new Sprite(tex.monolith);
      s.anchor.set(0.5, 1);
      const h = H * (0.07 + (i % 3) * 0.03);
      s.height = h;
      s.width = h * 0.25;
      s.position.set(W * fx, GROUND - H * 0.05);
      s.alpha = 0.55 + (i % 2) * 0.2;
      horizon.addChild(s);
      return s;
    });
  };

  let gridShift = 0;
  const drawGrid = () => {
    groundGrid.clear();
    const top = GROUND - H * 0.06;
    const vx = W / 2;
    for (let i = -10; i <= 10; i++) {
      const x0 = vx + i * W * 0.035;
      const x1 = vx + i * W * 0.16;
      groundGrid.moveTo(x0, top).lineTo(x1, H);
    }
    groundGrid.stroke({ width: 1, color: LIME, alpha: 0.06 });
    for (let k = 0; k < 9; k++) {
      const p = ((k + gridShift) % 9) / 9;
      const y = top + (H - top) * p * p;
      groundGrid.moveTo(0, y).lineTo(W, y);
      groundGrid.stroke({ width: 1, color: LIME, alpha: 0.03 + p * 0.06 });
    }
  };

  // ---------------------------------------------------------------- dynamic objects
  let state: EngineState = { spires: [], nodes: [], bridges: [], selected: null };
  let spires: SpireView[] = [];
  let nodes: NodeView[] = [];
  let bridges: BridgeView[] = [];
  const fx: Fx[] = [];
  let shake = 0;
  const launched = new Set<string>();
  const lastTier = new Map<string, number | null>();

  const text = (value: string, style: TextStyleOptions) => {
    const t = new Text({ text: value, style: { fontFamily: FONT, fill: 0xeaf2df, align: "center", dropShadow: { color: 0x000000, alpha: 0.85, blur: 6, distance: 0, angle: 0 }, ...style }, resolution: Math.min(window.devicePixelRatio || 1, 2) * 1.5 });
    t.anchor.set(0.5);
    return t;
  };

  const spireMetrics = () => {
    const n = Math.max(1, state.spires.slice(0, 9).length);
    const per = (W - 80) / n;
    const h = Math.min(H * (portrait ? 0.27 : 0.38), per * 1.2, 420);
    return { n, per, h };
  };
  const nodeXY = (i: number): Pt => {
    const { h } = spireMetrics();
    const top = H * (portrait ? 0.2 : 0.13);
    const bottom = Math.max(top + 60, GROUND - h - H * 0.06);
    const x0 = portrait ? 0.16 : 0.1;
    const x1 = portrait ? 0.84 : 0.9;
    return { x: W * (x0 + (x1 - x0) * (i / 5)), y: bottom - (bottom - top) * (i / 5) };
  };

  const buildSpires = () => {
    for (const s of spires) s.root.destroy({ children: true });
    spires = [];
    const list = state.spires.slice(0, 9);
    const { per, h } = spireMetrics();
    list.forEach((s, i) => {
      const x = list.length === 1 ? W / 2 : 40 + per * (i + 0.5);
      const root = new Container();
      root.position.set(x, GROUND);
      const pad = new Sprite(tex.soft);
      pad.anchor.set(0.5);
      pad.tint = LIME;
      pad.blendMode = "add";
      pad.width = h * 1.05;
      pad.height = h * 0.2;
      pad.position.set(0, -h * 0.02);
      const shadow = new Graphics().ellipse(0, 0, h * 0.42, h * 0.07).fill({ color: 0x000000, alpha: 0.55 });
      const ring = new Graphics();
      const body = new Sprite(spireTexture(s));
      body.anchor.set(0.5, 232 / 240);
      body.height = h;
      body.width = (h * 200) / 240;
      const coreY = -h * ((232 - 98) / 240);
      const crack = new Sprite(tex.soft);
      crack.anchor.set(0.5);
      crack.tint = LIME;
      crack.blendMode = "add";
      crack.width = h * 0.12;
      crack.height = h * 0.62;
      crack.position.set(0, -h * 0.52);
      crack.alpha = 0.22;
      const coreGlow = new Sprite(tex.glow);
      coreGlow.anchor.set(0.5);
      coreGlow.tint = s.variant === 2 ? 0xfff4d6 : LIME;
      coreGlow.blendMode = "add";
      coreGlow.width = coreGlow.height = h * (0.42 + s.rarity * 0.05);
      coreGlow.position.set(0, coreY);
      const core = new Sprite(coreTexture(s.variant));
      core.anchor.set(0.5);
      core.width = core.height = h * (0.16 + s.rarity * 0.015);
      core.position.set(0, coreY);
      const shards = Array.from({ length: [2, 3, 5, 6, 8][s.rarity] ?? 2 }, () => {
        const sh = new Sprite(tex.shard);
        sh.anchor.set(0.5);
        sh.width = sh.height = h * 0.035;
        sh.tint = s.rarity >= 3 ? hex(P.RARITY_ACCENT[s.rarity]) : 0xeaffc0;
        return sh;
      });
      const crew = (s.crew ?? []).map((c) => {
        const d = new Sprite(tex.glow);
        d.anchor.set(0.5);
        d.tint = hex(c);
        d.blendMode = "add";
        d.width = d.height = h * 0.075;
        return d;
      });
      const fontSize = Math.max(12, Math.min(17, h * 0.07));
      const title = text(s.title, { fontSize, fontWeight: "700" });
      title.position.set(0, h * 0.09 + 6);
      const sub = text(s.sub, { fontSize: fontSize * 0.82, fill: s.status === "ready" ? LIME : s.status === "bridge" ? 0x3de7e0 : 0x9aa894 });
      sub.position.set(0, h * 0.09 + 8 + fontSize * 1.25);
      root.addChild(pad, shadow, ring, crack, body, coreGlow, core, ...shards, ...crew, title, sub);
      root.eventMode = "static";
      root.cursor = "pointer";
      root.hitArea = new Rectangle(-h * 0.45, -h * 1.02, h * 0.9, h * 1.02 + h * 0.09 + fontSize * 3);
      const view: SpireView = { id: s.id, root, ring, body, core, coreGlow, crack, pad, shards, crew, title, sub, status: s.status, x, ground: GROUND, h, coreY, topY: GROUND - h * ((232 - 22) / 240), hover: false, motesAt: 0 };
      root.on("pointertap", () => cb.current.onSpire(s.id));
      root.on("pointerover", () => (view.hover = true));
      root.on("pointerout", () => (view.hover = false));
      if (s.status === "unmanned") {
        body.alpha = 0.55;
        core.alpha = 0.4;
        coreGlow.alpha = 0.15;
      }
      spireLayer.addChild(root);
      spires.push(view);
    });
  };

  const buildNodes = () => {
    for (const n of nodes) n.root.destroy({ children: true });
    nodes = [];
    constellation.clear();
    const pts = state.nodes.map((n) => nodeXY(n.depth));
    pts.forEach((p, i) => {
      if (i) constellation.moveTo(pts[i - 1].x, pts[i - 1].y).lineTo(p.x, p.y);
    });
    constellation.stroke({ width: 1, color: 0xc9ff55, alpha: 0.08 });
    for (const n of state.nodes) {
      const p = nodeXY(n.depth);
      const r = Math.max(14, Math.min(30, Math.min(W, H) * 0.028));
      const color = hex(n.color);
      const root = new Container();
      root.position.set(p.x, p.y);
      const halo = new Sprite(tex.glow);
      halo.anchor.set(0.5);
      halo.tint = color;
      halo.blendMode = "add";
      halo.width = halo.height = r * 6;
      halo.alpha = 0.35;
      const ring = new Graphics();
      const core = new Sprite(tex.sparkle);
      core.anchor.set(0.5);
      core.tint = color;
      core.blendMode = "add";
      core.width = core.height = r * 2.6;
      const fs = Math.max(12, r * 0.75);
      const roman = text(n.roman, { fontFamily: MONO, fontSize: fs * 1.15, fontWeight: "800" });
      roman.position.set(0, -r * 1.9);
      const light = text(n.light, { fontSize: fs, fontWeight: "700", fill: color });
      light.position.set(0, r * 1.75);
      const sub = text(n.sub, { fontFamily: MONO, fontSize: fs * 0.72, fill: 0x95a38f });
      sub.position.set(0, r * 1.75 + fs * 1.15);
      root.addChild(halo, ring, core, roman, light, sub);
      const view: NodeView = { depth: n.depth, root, halo, core, ring, roman, light, sub, state: n.state, color, x: p.x, y: p.y, r };
      root.hitArea = new Rectangle(-r * 2.2, -r * 2.6, r * 4.4, r * 5.6);
      root.on("pointertap", () => {
        if (view.state === "reachable" || view.state === "selected") cb.current.onNode(n.depth);
      });
      nodeLayer.addChild(root);
      nodes.push(view);
    }
    applyNodeStates();
  };
  const applyNodeStates = () => {
    for (const v of nodes) {
      const s = state.nodes.find((n) => n.depth === v.depth);
      if (!s) continue;
      v.state = s.state;
      const clickable = s.state === "reachable" || s.state === "selected";
      v.root.eventMode = clickable ? "static" : "none";
      v.root.cursor = clickable ? "pointer" : "default";
      v.root.alpha = s.state === "locked" ? 0.28 : 1;
    }
  };

  const bridgeEnds = (b: SceneBridge) => {
    const s = spires.find((x) => x.id === b.spire);
    if (!s) return null;
    const a = { x: s.x, y: s.topY };
    const bb = nodeXY(b.depth);
    const c = { x: (a.x + bb.x) / 2, y: Math.min(a.y, bb.y) - H * 0.16 };
    return { a, c, b: bb };
  };
  const buildBridges = () => {
    for (const b of bridges) {
      b.line.destroy();
      for (const p of b.parts) p.destroy();
    }
    bridges = [];
    for (const l of labelLayer.removeChildren()) l.destroy();
    for (const b of state.bridges) {
      const ends = bridgeEnds(b);
      if (!ends) continue;
      const kind: BridgeView["kind"] = b.aim ? "aim" : b.tier === null ? "flight" : b.tier === 0 ? "broken" : "answered";
      const color = b.tier !== null && !b.aim ? TIER[b.tier] : hex(b.color);
      const line = new Graphics();
      const count = kind === "aim" ? 44 : kind === "flight" ? 40 : 30;
      const parts = Array.from({ length: count }, () => {
        const p = new Sprite(kind === "aim" ? tex.sparkle : tex.glow);
        p.anchor.set(0.5);
        p.tint = color;
        p.blendMode = "add";
        bridgeLayer.addChild(p);
        return p;
      });
      bridgeLayer.addChildAt(line, 0);
      const key = `${b.spire}-${b.depth}`;
      const view: BridgeView = { key, line, parts, ...ends, color, kind, tier: b.tier, seed: Number(b.spire % 997n) / 997 };
      drawBridgeLine(view);
      bridges.push(view);
      const owner = spires.find((x) => x.id === b.spire);
      if (b.label && !b.aim && owner) {
        const tag = text(b.label, { fontSize: Math.max(13, Math.min(18, owner.h * 0.07)), fontWeight: "800", fill: color });
        tag.position.set(owner.x, owner.topY - 18);
        labelLayer.addChild(tag);
      }
      // launch and answer moments
      if (b.fresh && !launched.has(key)) {
        launched.add(key);
        launchFx(view);
      }
      const prev = lastTier.get(key);
      if (prev === null && b.tier !== null && !b.aim) answerFx(view);
      if (!b.aim) lastTier.set(key, b.tier);
    }
  };
  const drawBridgeLine = (v: BridgeView) => {
    v.line.clear();
    if (v.kind === "aim") return;
    const seg = (t0: number, t1: number) => {
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        const p = bez(v.a, v.c, v.b, t0 + ((t1 - t0) * i) / steps);
        if (i === 0) v.line.moveTo(p.x, p.y);
        else v.line.lineTo(p.x, p.y);
      }
    };
    const draw = (width: number, alpha: number) => {
      if (v.kind === "broken") {
        seg(0, 0.42);
        seg(0.58, 1);
      } else seg(0, 1);
      v.line.stroke({ width, color: v.color, alpha, cap: "round" });
    };
    draw(10, v.kind === "flight" ? 0.06 : 0.12);
    draw(3, v.kind === "flight" ? 0.35 : 0.75);
    draw(1, 0.9);
  };

  // ---------------------------------------------------------------- effects
  const addFx = (sprite: Sprite | Graphics, max: number, step: Fx["step"]) => {
    fxLayer.addChild(sprite);
    fx.push({ sprite, life: 0, max, step });
  };
  const flash = (p: Pt, color: number, size: number, max = 700) => {
    const s = new Sprite(tex.sparkle);
    s.anchor.set(0.5);
    s.tint = color;
    s.blendMode = "add";
    s.position.set(p.x, p.y);
    addFx(s, max, (f, k) => {
      const sp = f.sprite as Sprite;
      sp.width = sp.height = size * (0.4 + k * 1.6);
      sp.alpha = 1 - k;
      sp.rotation = k * 0.6;
    });
  };
  const shockwave = (p: Pt, color: number, radius: number) => {
    const g = new Graphics();
    addFx(g, 900, (f, k) => {
      const gg = f.sprite as Graphics;
      gg.clear();
      gg.circle(p.x, p.y, radius * (0.2 + k)).stroke({ width: 3 * (1 - k) + 0.5, color, alpha: 1 - k });
    });
  };
  const launchFx = (v: BridgeView) => {
    if (reduce) return;
    flash(v.a, LIME, H * 0.25);
    shockwave(v.a, LIME, H * 0.12);
    const head = new Sprite(tex.sparkle);
    head.anchor.set(0.5);
    head.tint = 0xf4ffe0;
    head.blendMode = "add";
    head.width = head.height = H * 0.08;
    let lastTrail = 0;
    addFx(head, 1300, (f, k) => {
      const e = 1 - Math.pow(1 - k, 2);
      const p = bez(v.a, v.c, v.b, e);
      f.sprite.position.set(p.x, p.y);
      if (f.life - lastTrail > 16) {
        lastTrail = f.life;
        const t = new Sprite(tex.glow);
        t.anchor.set(0.5);
        t.tint = v.color;
        t.blendMode = "add";
        t.position.set(p.x, p.y);
        addFx(t, 650, (g, kk) => {
          (g.sprite as Sprite).width = (g.sprite as Sprite).height = H * 0.05 * (1 - kk);
          g.sprite.alpha = 0.9 * (1 - kk);
        });
      }
      if (k >= 1) {
        flash(v.b, v.color, H * 0.3, 900);
        shockwave(v.b, v.color, H * 0.14);
        shake = 1;
      }
    });
  };
  const answerFx = (v: BridgeView) => {
    if (reduce) return;
    flash(v.b, v.color, H * (v.tier !== null && v.tier >= 3 ? 0.5 : 0.3), 1200);
    shockwave(v.b, v.color, H * 0.18);
    if (v.tier !== null && v.tier >= 3) shake = 1;
  };

  // ---------------------------------------------------------------- camera and input
  const pointer = { x: 0.5, y: 0.5 };
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.stage.on("pointermove", (e) => {
    pointer.x = e.global.x / Math.max(1, W);
    pointer.y = e.global.y / Math.max(1, H);
  });
  const cam = { s: 1, x: 0, y: 0, cx: 0, cy: 0 };
  const camTarget = () => {
    const sel = spires.find((s) => s.id === state.selected);
    if (!sel) return { s: 1, fx: W / 2, fy: H / 2, cx: W / 2, cy: H / 2 };
    const aim = state.bridges.find((b) => b.aim);
    const tgt = aim ? nodeXY(aim.depth) : { x: sel.x, y: sel.coreY + sel.ground };
    // keep the selection clear of the launch panel: right side on wide screens, bottom sheet on phones
    const wide = W > 860;
    return { s: 1.06, fx: (sel.x + tgt.x) / 2, fy: (sel.ground + sel.coreY + tgt.y) / 2, cx: wide ? (W - 400) / 2 : W / 2, cy: wide ? H / 2 : H * 0.34 };
  };

  // ---------------------------------------------------------------- frame
  let time = 0;
  app.ticker.add((ticker) => {
    const dt = Math.min(ticker.deltaMS, 50);
    time += dt / 1000;
    const tt = reduce ? 0 : time;
    // parallax and drift
    const px = (pointer.x - 0.5) * (reduce ? 0 : 1);
    const py = (pointer.y - 0.5) * (reduce ? 0 : 1);
    starsFar.position.set(-px * 8, -py * 5);
    starsNear.position.set(-px * 20, -py * 12);
    nebulaLayer.position.set(-px * 14 + Math.sin(tt / 30) * 18, -py * 8 + Math.cos(tt / 40) * 10);
    nebulae[0].rotation = Math.sin(tt / 60) * 0.03;
    for (const st of stars) st.s.alpha = st.base * (reduce ? 1 : 0.55 + 0.45 * Math.sin(st.phase + tt * st.speed));
    if (!reduce) {
      gridShift = (gridShift + dt / 2600) % 9;
      drawGrid();
    }
    horizonGlow.alpha = 0.28 + Math.sin(tt * 0.6) * 0.04;
    // spires
    for (const s of spires) {
      const live = s.status !== "unmanned";
      const pulse = 0.5 + 0.5 * Math.sin(tt * (s.status === "ready" ? 2.2 : 1.1) + s.x);
      s.coreGlow.alpha = live ? (s.status === "ready" ? 0.55 : 0.32) + pulse * 0.3 + (s.hover ? 0.2 : 0) : 0.12;
      s.core.alpha = live ? 0.85 + pulse * 0.15 : 0.4;
      s.crack.alpha = (live ? 0.18 : 0.06) + pulse * 0.08;
      const selected = state.selected === s.id;
      s.ring.clear();
      if (selected) {
        const k2 = (tt * 0.8) % 1;
        s.ring.ellipse(0, 0, s.h * 0.5, s.h * 0.085).stroke({ width: 2, color: LIME, alpha: 0.9 });
        s.ring.ellipse(0, 0, s.h * (0.5 + k2 * 0.35), s.h * (0.085 + k2 * 0.06)).stroke({ width: 1.5, color: LIME, alpha: 0.7 * (1 - k2) });
      }
      s.body.alpha = s.status === "unmanned" ? 0.55 : state.selected !== null && !selected ? 0.55 : 1;
      s.pad.alpha = selected ? 0.75 : s.status === "ready" ? 0.28 + pulse * 0.25 : s.hover ? 0.3 : 0.1;
      s.shards.forEach((sh, i) => {
        const a = tt * 0.6 + (i / s.shards.length) * Math.PI * 2;
        sh.position.set(Math.cos(a) * s.h * 0.17, s.coreY + Math.sin(a) * s.h * 0.035);
        sh.alpha = 0.45 + 0.55 * (Math.sin(a) * 0.5 + 0.5);
      });
      s.crew.forEach((d, i) => {
        const a = tt * (s.status === "ready" ? 0.9 : 0.25) + (i / s.crew.length) * Math.PI * 2;
        d.position.set(Math.cos(a) * s.h * 0.28, s.coreY + Math.sin(a) * s.h * 0.06);
        d.alpha = live ? 0.55 + 0.45 * (Math.sin(a) * 0.5 + 0.5) : 0.2;
      });
      // rising light motes from spires ready to dive
      if (!reduce && s.status === "ready" && time > s.motesAt) {
        s.motesAt = time + 0.18 + Math.random() * 0.25;
        const m = new Sprite(tex.glow);
        m.anchor.set(0.5);
        m.tint = LIME;
        m.blendMode = "add";
        const ox = (Math.random() - 0.5) * s.h * 0.5;
        const sx = s.x + ox;
        const sy = s.ground - Math.random() * s.h * 0.2;
        const rise = s.h * (0.6 + Math.random() * 0.5);
        const size = 3 + Math.random() * 5;
        addFx(m, 2600, (f, k) => {
          f.sprite.position.set(sx + Math.sin(k * 6 + ox) * 6, sy - rise * k);
          (f.sprite as Sprite).width = (f.sprite as Sprite).height = size;
          f.sprite.alpha = Math.sin(k * Math.PI) * 0.8;
        });
      }
    }
    // nodes
    for (const n of nodes) {
      const active = n.state === "reachable" || n.state === "selected";
      const pulse = 0.5 + 0.5 * Math.sin(tt * (active ? 3 : 1.2) + n.depth);
      n.halo.alpha = n.state === "selected" ? 0.85 : active ? 0.45 + pulse * 0.35 : 0.3 + pulse * 0.08;
      n.halo.width = n.halo.height = n.r * (n.state === "selected" ? 8 : 6) * (1 + (active ? pulse * 0.08 : 0));
      n.core.rotation = tt * 0.15;
      n.ring.clear();
      const rot = tt * (active ? 0.9 : 0.3) + n.depth;
      const dash = n.state === "selected" ? 1 : 0.55;
      for (let k = 0; k < 6; k++) {
        const a0 = rot + (k / 6) * Math.PI * 2;
        n.ring.arc(0, 0, n.r * 1.25, a0, a0 + (Math.PI * 2 * dash) / 6 - 0.05);
        n.ring.stroke({ width: n.state === "selected" ? 2.5 : 1.4, color: n.color, alpha: active ? 0.95 : 0.55 });
      }
      if (n.state === "selected") {
        n.ring.circle(0, 0, n.r * (1.7 + pulse * 0.25)).stroke({ width: 1.2, color: n.color, alpha: 0.6 - pulse * 0.4 });
      }
    }
    // bridges
    for (const b of bridges) {
      const n = b.parts.length;
      b.parts.forEach((p, i) => {
        let t: number;
        if (b.kind === "aim") t = ((i / n) + tt * 0.08) % 1;
        else if (b.kind === "flight") t = ((i / n) + tt * 0.32 + b.seed) % 1;
        else t = ((i / n) + tt * 0.12 + b.seed) % 1;
        if (b.kind === "broken" && t > 0.42 && t < 0.58) {
          p.alpha = 0;
          return;
        }
        const q = bez(b.a, b.c, b.b, t);
        p.position.set(q.x, q.y);
        const size = b.kind === "aim" ? 10 + Math.sin(tt * 5 - i * 0.5) * 3 : b.kind === "flight" ? 7 + Math.sin(i * 1.7 + tt * 4) * 3 : 9;
        p.width = p.height = size * (H / 700);
        p.alpha = b.kind === "aim" ? 0.55 + 0.45 * Math.sin(tt * 5 - i * 0.5) : b.kind === "flight" ? 0.75 : 0.5 + 0.3 * Math.sin(tt * 2 + i);
      });
    }
    // transient effects
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i];
      f.life += dt;
      const k = Math.min(1, f.life / f.max);
      f.step(f, k);
      if (k >= 1) {
        f.sprite.destroy();
        fx.splice(i, 1);
      }
    }
    // camera
    const target = camTarget();
    const ease = reduce ? 1 : Math.min(1, dt / 220);
    cam.s += (target.s - cam.s) * ease;
    cam.x += (target.fx - cam.x) * ease;
    cam.y += (target.fy - cam.y) * ease;
    cam.cx += (target.cx - cam.cx) * ease;
    cam.cy += (target.cy - cam.cy) * ease;
    world.pivot.set(cam.x, cam.y);
    const shakeX = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
    const shakeY = shake > 0 ? (Math.random() - 0.5) * 10 * shake : 0;
    shake = Math.max(0, shake - dt / 350);
    // the focus point (pivot) is drawn at the free-screen centre; with no selection both are the screen centre
    world.position.set(cam.cx + shakeX, cam.cy + shakeY);
    world.scale.set(cam.s);
  });

  let sig = { spires: "", nodes: "", bridges: "" };
  const rebuildAll = () => {
    layoutStatic();
    drawGrid();
    buildSpires();
    buildNodes();
    buildBridges();
  };
  app.renderer.on("resize", () => {
    rebuildAll();
    app.stage.hitArea = app.screen;
  });
  layoutStatic();
  drawGrid();
  cam.x = cam.cx = W / 2;
  cam.y = cam.cy = H / 2;

  return {
    update(next) {
      state = next;
      const s1 = JSON.stringify(next.spires.map((s) => [String(s.id), s.status, s.rarity, s.level, s.variant, s.title, s.sub, s.crew]));
      const s2 = JSON.stringify(next.nodes.map((n) => [n.depth, n.light, n.color, n.sub, n.roman]));
      const s3 = JSON.stringify(next.bridges.map((b) => [String(b.spire), b.depth, b.tier, b.color, !!b.fresh, !!b.aim]));
      const spiresChanged = s1 !== sig.spires;
      if (spiresChanged) buildSpires();
      if (spiresChanged || s2 !== sig.nodes) buildNodes();
      else applyNodeStates();
      if (spiresChanged || s2 !== sig.nodes || s3 !== sig.bridges) buildBridges();
      sig = { spires: s1, nodes: s2, bridges: s3 };
    },
    destroy() {
      app.destroy(true, { children: true, texture: true });
    },
  };
}
