// WebGL scene behind the voyage screen (10-11). The HTML stays on top for the route line, the labels, the log and every
// control; this draws what should move: the cluster photo zooming slowly toward the destination, star streaks flying
// out of it (faster while departing and approaching, slow while a decision waits), the team's light with a trail and
// its crew circling it, star events sweeping across, the choice bursting, and the arrival in the colour of the result.
// Five phases over the five minutes: departure, crossing, decision, approach, arrival.
import { Application, Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { paintGlow, paintNebula, paintSparkle, paintStar } from "../game/pixi-paint";
import { calm, fxQuality } from "./settings";
import { ROUTE_P, alongRoute } from "./voyage-route";

export type VoyageView = {
  at: number;
  revealAt: number;
  deciding: boolean; // the decision is open and not yet made
  tone: string; // the team's light: green, the choice's colour, or the result's
  crew: { color: string; attuned: boolean }[];
  done: boolean; // the result is in
};
export type VoyageGl = {
  update: (v: VoyageView) => void;
  pulse: (color: string) => void; // a crew member speaks
  storm: (color: string) => void; // a star event on the way
  choose: (color: string) => void; // the decision is made
  arrive: (outcome: string, color: string) => void;
  destroy: () => void;
};

const hex = (c: string) => parseInt(c.replace("#", ""), 16);
const rgba = (c: string) => {
  const n = hex(c);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},ALPHA)`;
};
const STRENGTH: Record<string, { rings: number; sparks: number; flash: number }> = {
  empty: { rings: 1, sparks: 14, flash: 0 },
  normal: { rings: 1, sparks: 40, flash: 0 },
  good: { rings: 2, sparks: 70, flash: 0.08 },
  great: { rings: 3, sparks: 120, flash: 0.22 },
  legend: { rings: 5, sparks: 200, flash: 0.45 },
};

export async function createVoyage(host: HTMLElement, route: HTMLElement, photo: string, hue: string): Promise<VoyageGl> {
  const reduce = calm();
  const quality = fxQuality();
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: "webgl" });
  app.ticker.maxFPS = 50;
  app.canvas.className = "v3-voyage__gl";
  app.canvas.setAttribute("aria-hidden", "true");
  host.insertBefore(app.canvas, host.firstChild);

  const tex = { glow: Texture.from(paintGlow(256, 0.5)), soft: Texture.from(paintGlow(256, 0.9)), star: Texture.from(paintStar(32)), sparkle: Texture.from(paintSparkle(128)) };
  const nebulaTex = [
    Texture.from(paintNebula(900, 600, [rgba(hue), "rgba(90,140,220,ALPHA)", rgba(hue)], 11)),
    Texture.from(paintNebula(900, 600, ["rgba(200,255,120,ALPHA)", rgba(hue), "rgba(160,120,255,ALPHA)"], 23)),
  ];

  // back to front: photo, nebulae, star streaks, the decision dimmer, the trail, the light and its effects
  const photoLayer = new Container();
  const nebulaLayer = new Container();
  const warpLayer = new Container();
  const dim = new Graphics();
  const trailLayer = new Container();
  const fxLayer = new Container();
  const flash = new Graphics();
  app.stage.addChild(photoLayer, nebulaLayer, warpLayer, dim, trailLayer, fxLayer, flash);
  if (quality !== "low") {
    const bloom = new AdvancedBloomFilter({ threshold: 0.5, bloomScale: 0.7, brightness: 1, blur: 6, quality: 4 });
    fxLayer.filters = [bloom];
    trailLayer.filters = [bloom];
  }

  const W = () => app.renderer.width / app.renderer.resolution;
  const H = () => app.renderer.height / app.renderer.resolution;

  let photoSprite: Sprite | null = null;
  void Assets.load<Texture>(photo).then((t) => {
    photoSprite = new Sprite(t);
    photoSprite.anchor.set(0.5);
    photoSprite.alpha = 0;
    photoLayer.addChild(photoSprite);
  }).catch(() => {});
  const nebulae = nebulaTex.map((t, i) => {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.alpha = [0.16, 0.1][i];
    nebulaLayer.addChild(s);
    return s;
  });

  // star streaks: points in a tunnel, projected from the destination outward
  type Streak = { s: Sprite; x: number; y: number; z: number };
  const streakCount = reduce ? 0 : quality === "high" ? 240 : quality === "standard" ? 150 : 70;
  const spawn = (st: Streak, far: boolean) => {
    const a = Math.random() * Math.PI * 2, r = 0.08 + Math.random() * 0.95;
    st.x = Math.cos(a) * r;
    st.y = Math.sin(a) * r;
    st.z = far ? 1 : 0.15 + Math.random() * 0.85;
  };
  const streaks: Streak[] = Array.from({ length: streakCount }, () => {
    const s = new Sprite(tex.star);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = Math.random() < 0.18 ? hex(hue) : 0xffffff;
    warpLayer.addChild(s);
    const st = { s, x: 0, y: 0, z: 1 };
    spawn(st, false);
    return st;
  });

  // the destination beacon, the team's light and its crew
  const beacon = new Sprite(tex.soft);
  beacon.anchor.set(0.5);
  beacon.blendMode = "add";
  beacon.tint = 0xffffff;
  const beaconRays = new Sprite(tex.sparkle);
  beaconRays.anchor.set(0.5);
  beaconRays.blendMode = "add";
  beaconRays.alpha = 0.35;
  const ship = new Sprite(tex.soft);
  ship.anchor.set(0.5);
  ship.blendMode = "add";
  const shipHot = new Sprite(tex.glow);
  shipHot.anchor.set(0.5);
  shipHot.blendMode = "add";
  shipHot.tint = 0xffffff;
  const shipRays = new Sprite(tex.sparkle);
  shipRays.anchor.set(0.5);
  shipRays.blendMode = "add";
  fxLayer.addChild(beaconRays, beacon, ship, shipRays, shipHot);
  type CrewView = { s: Sprite; color: string; attuned: boolean; flare: number };
  let crew: CrewView[] = [];
  let crewKey = "";

  type Particle = { s: Sprite; vx: number; vy: number; life: number; max: number; grow?: number; layer: Container };
  const particles: Particle[] = [];
  const addParticle = (layer: Container, t: Texture, x: number, y: number, color: string | number, vx: number, vy: number, max: number, scale: number, grow = 0) => {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = typeof color === "string" ? hex(color) : color;
    s.position.set(x, y);
    s.scale.set(scale);
    layer.addChild(s);
    particles.push({ s, vx, vy, life: 0, max, grow, layer });
  };
  const burst = (x: number, y: number, color: string, n: number, speed = 5) => {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.6 + Math.random() * speed;
      addParticle(fxLayer, i % 4 ? tex.star : tex.sparkle, x, y, i % 3 ? color : 0xffffff, Math.cos(a) * v, Math.sin(a) * v, 40 + Math.random() * 50, 0.25 + Math.random() * 0.5);
    }
  };

  type Ring = { g: Graphics; x: number; y: number; color: number; delay: number; life: number; max: number; reach: number; width: number };
  const rings: Ring[] = [];
  const ring = (x: number, y: number, color: string, delay: number, reach: number, width: number, max = 70) => {
    const g = new Graphics();
    fxLayer.addChild(g);
    rings.push({ g, x, y, color: hex(color), delay, life: 0, max, reach, width });
  };

  type Sweep = { s: Sprite; life: number; max: number; from: number; to: number; y: number };
  const sweeps: Sweep[] = [];
  let flashAlpha = 0;

  // where things are, in canvas pixels
  let view: VoyageView | null = null;
  let along = alongRoute(100, 100);
  let alongSize = "";
  const geo = { ox: 0, oy: 0, rw: 1, rh: 1, ship: { x: 0, y: 0 }, home: { x: 0, y: 0 }, dest: { x: 0, y: 0 } };
  const measure = (k: number) => {
    const c = app.canvas.getBoundingClientRect();
    const r = route.getBoundingClientRect();
    geo.ox = r.left - c.left;
    geo.oy = r.top - c.top;
    geo.rw = Math.max(1, r.width);
    geo.rh = Math.max(1, r.height);
    const size = `${Math.round(geo.rw)}x${Math.round(geo.rh)}`;
    if (size !== alongSize) { along = alongRoute(geo.rw, geo.rh); alongSize = size; }
    const toPx = (p: { x: number; y: number }) => ({ x: geo.ox + (p.x / 100) * geo.rw, y: geo.oy + (p.y / 100) * geo.rh });
    geo.ship = toPx(along(k));
    geo.home = toPx({ x: ROUTE_P[0][0], y: ROUTE_P[0][1] });
    geo.dest = toPx({ x: ROUTE_P[3][0], y: ROUTE_P[3][1] });
  };

  let time = 0;
  let speed = 0.3;
  let dimAlpha = 0;
  let lastTone = "";
  app.ticker.add((tk) => {
    const dt = Math.min(3, tk.deltaTime);
    time += dt / 60;
    const w = W(), h = H();
    const v = view;
    const k = v ? Math.min(1, Math.max(0, (Date.now() - v.at) / Math.max(1, v.revealAt - v.at))) : 0;
    measure(k);
    const vp = geo.dest;

    // phase: how fast the light travels
    const target = !v ? 0.3 : v.done ? 0.04 : v.deciding ? 0.16 : k < 0.06 ? 0.3 + (k / 0.06) * 0.7 : k > 0.85 ? 1 + ((k - 0.85) / 0.15) * 0.9 : 1;
    speed += (target - speed) * 0.025 * dt;

    if (photoSprite) {
      const t = photoSprite.texture;
      const zoom = reduce ? 1.06 : 1.06 + k * 0.2 + Math.sin(time * 0.05) * 0.01;
      photoSprite.scale.set(Math.max(w / t.width, h / t.height) * zoom);
      // zooming in drifts the frame toward the destination
      photoSprite.position.set(w / 2 + (vp.x - w / 2) * k * 0.18, h / 2 + (vp.y - h / 2) * k * 0.18);
      photoSprite.alpha += ((v?.deciding ? 0.42 : 0.6) - photoSprite.alpha) * 0.03 * dt;
    }
    nebulae.forEach((n, i) => {
      n.position.set(w / 2 + Math.sin(time * 0.04 + i * 2) * 30, h / 2 + Math.cos(time * 0.03 + i) * 20);
      n.scale.set(Math.max(w / 800, h / 520) * (1.15 + i * 0.15 + (reduce ? 0 : k * 0.1)));
      n.rotation = reduce ? 0 : time * (i ? -0.004 : 0.006);
    });

    const spread = Math.max(w, h) * 0.22;
    for (const st of streaks) {
      st.z -= speed * 0.0065 * dt;
      const sx = vp.x + (st.x / st.z) * spread, sy = vp.y + (st.y / st.z) * spread;
      if (st.z < 0.03 || sx < -60 || sx > w + 60 || sy < -60 || sy > h + 60) { spawn(st, true); continue; }
      const near = 1 - st.z;
      st.s.position.set(sx, sy);
      st.s.rotation = Math.atan2(sy - vp.y, sx - vp.x);
      const base = 0.18 + near * 0.55;
      st.s.scale.set(base * (1 + speed * near * 7), base * 0.55);
      st.s.alpha = Math.min(1, near * 1.6) * (0.35 + Math.min(1, speed) * 0.55);
    }

    dimAlpha += ((v?.deciding ? 0.38 : 0) - dimAlpha) * 0.04 * dt;
    dim.clear();
    if (dimAlpha > 0.005) dim.rect(0, 0, w, h).fill({ color: 0x02040a, alpha: dimAlpha });

    // the destination grows as the light gets close, and takes the result's colour at the end
    const tone = v?.tone ?? "#c9ff55";
    if (tone !== lastTone) { ship.tint = hex(tone); shipRays.tint = hex(tone); lastTone = tone; }
    const pulse = 1 + Math.sin(time * 2.2) * 0.08;
    beacon.position.copyFrom(vp);
    beaconRays.position.copyFrom(vp);
    beacon.tint = v?.done ? hex(tone) : 0xffffff;
    beacon.scale.set((0.22 + k * 0.35) * pulse);
    beacon.alpha = 0.55 + k * 0.4;
    beaconRays.scale.set(0.5 + k * 0.7);
    beaconRays.rotation = time * 0.08;
    beaconRays.tint = v?.done ? hex(tone) : 0xeaf6ff;

    const showShip = !!v && !v.done;
    ship.visible = shipHot.visible = shipRays.visible = showShip;
    if (showShip) {
      ship.position.copyFrom(geo.ship);
      shipHot.position.copyFrom(geo.ship);
      shipRays.position.copyFrom(geo.ship);
      ship.scale.set(0.2 * pulse);
      shipHot.scale.set(0.065);
      shipRays.scale.set(0.3);
      shipRays.rotation = time * 0.6;
      // the trail: sparks shed behind the light, drifting back toward 碑原
      if (!reduce && Math.random() < 0.5 + speed * 0.4) {
        const back = Math.atan2(geo.home.y - geo.ship.y, geo.home.x - geo.ship.x);
        const a = back + (Math.random() - 0.5) * 0.9, sp = 0.3 + Math.random() * 0.9 * Math.max(0.3, speed);
        addParticle(trailLayer, tex.star, geo.ship.x, geo.ship.y, Math.random() < 0.7 ? tone : 0xffffff, Math.cos(a) * sp, Math.sin(a) * sp, 50 + Math.random() * 40, 0.35 + Math.random() * 0.3, -0.004);
      }
    }
    crew.forEach((c, i) => {
      c.s.visible = showShip;
      const a = time * (reduce ? 0 : 0.9) + (i / Math.max(1, crew.length)) * Math.PI * 2;
      const r = 24 + (c.attuned ? 4 : 0);
      c.s.position.set(geo.ship.x + Math.cos(a) * r, geo.ship.y + Math.sin(a) * r * 0.7);
      c.flare = Math.max(0, c.flare - 0.02 * dt);
      c.s.scale.set((c.attuned ? 0.085 + Math.sin(time * 3 + i) * 0.015 : 0.065) * (1 + c.flare * 1.6));
      c.s.alpha = c.attuned ? 1 : 0.85;
    });

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.vx *= 0.965;
      p.vy *= 0.965;
      if (p.grow) p.s.scale.set(Math.max(0.02, p.s.scale.x + p.grow * dt));
      p.s.alpha = 1 - p.life / p.max;
      if (p.life >= p.max) { p.s.destroy(); particles.splice(i, 1); }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (r.delay > 0) { r.delay -= dt; continue; }
      r.life += dt;
      const t = r.life / r.max, e = 1 - (1 - t) ** 3;
      r.g.clear();
      r.g.circle(r.x, r.y, 8 + e * r.reach).stroke({ color: r.color, width: Math.max(0.5, r.width * (1 - t)), alpha: (1 - t) * 0.9 });
      if (r.life >= r.max) { r.g.destroy(); rings.splice(i, 1); }
    }
    for (let i = sweeps.length - 1; i >= 0; i--) {
      const s = sweeps[i];
      s.life += dt;
      const t = s.life / s.max;
      s.s.position.set(s.from + (s.to - s.from) * t, s.y + Math.sin(t * Math.PI) * h * 0.05);
      s.s.alpha = Math.sin(t * Math.PI) * 0.42;
      if (s.life >= s.max) { s.s.destroy(); sweeps.splice(i, 1); }
    }
    flashAlpha = Math.max(0, flashAlpha - 0.012 * dt);
    flash.clear();
    if (flashAlpha > 0.005) flash.rect(0, 0, w, h).fill({ color: 0xffffff, alpha: flashAlpha });
  });

  return {
    update(next) {
      view = next;
      const key = next.crew.map((c) => `${c.color}${c.attuned ? "*" : ""}`).join(",");
      if (key !== crewKey) {
        for (const c of crew) c.s.destroy();
        crew = next.crew.map((c) => {
          const s = new Sprite(tex.glow);
          s.anchor.set(0.5);
          s.blendMode = "add";
          s.tint = hex(c.color);
          fxLayer.addChild(s);
          return { s, color: c.color, attuned: c.attuned, flare: 0 };
        });
        crewKey = key;
      }
    },
    pulse(color) {
      const c = crew.find((x) => x.color.toLowerCase() === color.toLowerCase()) ?? crew[crew.length - 1];
      if (!c) return;
      c.flare = 1;
      burst(c.s.x, c.s.y, color, 16, 2.5);
    },
    storm(color) {
      if (reduce) return;
      const w = W(), h = H();
      const s = new Sprite(tex.soft);
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = hex(color);
      s.scale.set((Math.max(w, h) / 256) * 1.1, (Math.max(w, h) / 256) * 0.7);
      s.alpha = 0;
      fxLayer.addChild(s);
      sweeps.push({ s, life: 0, max: 170, from: -w * 0.3, to: w * 1.3, y: h * (0.3 + Math.random() * 0.3) });
      for (let i = 0; i < 90; i++) addParticle(fxLayer, tex.star, -20, Math.random() * h, color, 4 + Math.random() * 7, (Math.random() - 0.5) * 1.2, 90 + Math.random() * 60, 0.3 + Math.random() * 0.5);
    },
    choose(color) {
      const { x, y } = geo.ship;
      for (let i = 0; i < 3; i++) ring(x, y, color, i * 9, 90 + i * 40, 3);
      burst(x, y, color, 60, 6);
    },
    arrive(outcome, color) {
      const st = STRENGTH[outcome] ?? STRENGTH.normal;
      const { x, y } = geo.dest;
      const reach = Math.max(W(), H()) * 0.65;
      const tint = outcome === "empty" ? "#8a95a6" : color;
      for (let i = 0; i < st.rings; i++) ring(x, y, tint, i * 12, reach * (0.35 + (0.65 * (i + 1)) / st.rings), 4 + st.rings, 80 + i * 10);
      burst(x, y, tint, st.sparks, outcome === "legend" ? 9 : 6);
      if (!reduce) flashAlpha = st.flash;
    },
    destroy() {
      // the photo's texture belongs to the shared Assets cache (the star map uses it too): leave it alone
      photoSprite?.removeFromParent();
      app.destroy(true, { children: true });
      for (const t of [...Object.values(tex), ...nebulaTex]) t.destroy(true);
    },
  };
}
