// WebGL backdrop for the v3 star map. The HTML buttons stay on top for labels, clicks and accessibility;
// this draws everything that should glow and move: deep space, nebulae, parallax stars, the core with god rays,
// cluster or destination orbs, orbit rings, light bridges with travelling sparks, and drifting motes.
import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { AdvancedBloomFilter } from "pixi-filters";
import { paintGlow, paintNebula, paintSparkle, paintStar } from "../game/pixi-paint";
import { makeLightSource, type LightSource } from "./light-source";
import { calm } from "./settings";

export type Orb = { x: number; y: number; color: string; hue?: string; locked?: boolean; core?: boolean; size?: number; photo?: string; seed?: number };
/** `frame`: the element the HTML labels are laid out in (the cluster view, which the destination card can narrow);
 *  orb, bridge and core positions are % of that box, read every frame so they follow its CSS transition. */
export type GalaxyState = { orbs: Orb[]; bridges: { x: number; y: number }[]; hover: number | null; core?: { x: number; y: number }; photo?: string; frame?: { current: HTMLElement | null } };
export type Galaxy = { update: (s: GalaxyState) => void; burst: (x: number, y: number, color: string) => void; float: (x: number, y: number, text: string, color: string) => void; pause: (on: boolean) => void; destroy: () => void };

const hex = (c: string) => parseInt(c.replace("#", ""), 16);

export async function createGalaxy(host: HTMLElement): Promise<Galaxy> {
  const reduce = calm();
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, preference: "webgl" });
  app.ticker.maxFPS = 45; // smooth enough for drifting light, and lighter on the CPU and GPU
  app.canvas.className = "v3-galaxy__gl";
  app.canvas.setAttribute("aria-hidden", "true");
  host.insertBefore(app.canvas, host.firstChild); // prepend() is typed by the Workers HTMLRewriter types here

  const tex = {
    glow: Texture.from(paintGlow(256, 0.5)),
    soft: Texture.from(paintGlow(256, 0.9)),
    star: Texture.from(paintStar(32)),
    sparkle: Texture.from(paintSparkle(128)),
    nebulae: [
      Texture.from(paintNebula(1000, 700, ["rgba(140,220,50,ALPHA)", "rgba(60,150,120,ALPHA)", "rgba(200,255,120,ALPHA)"], 7)),
      Texture.from(paintNebula(1000, 700, ["rgba(70,130,200,ALPHA)", "rgba(120,90,220,ALPHA)", "rgba(40,180,170,ALPHA)"], 19)),
      Texture.from(paintNebula(1000, 700, ["rgba(240,199,102,ALPHA)", "rgba(255,140,90,ALPHA)", "rgba(200,160,255,ALPHA)"], 31)),
    ],
  };

  // ---------------------------------------------------------------- layers (back to front)
  const photoLayer = new Container(); // real space photograph, slowly drifting
  const nebulaLayer = new Container();
  const starLayers = [new Container(), new Container(), new Container()];
  const rings = new Graphics();
  const coreLayer = new Container();
  const bridgeLayer = new Container();
  const orbLayer = new Container();
  const moteLayer = new Container();
  const fxLayer = new Container();
  app.stage.addChild(photoLayer, nebulaLayer, ...starLayers, rings, coreLayer, bridgeLayer, orbLayer, moteLayer, fxLayer);
  const bloom = new AdvancedBloomFilter({ threshold: 0.6, bloomScale: 0.55, brightness: 1, blur: 6, quality: 4 }); // gentle: the planet photos must not blow out
  orbLayer.filters = [bloom];
  fxLayer.filters = [bloom];

  const nebulae = tex.nebulae.map((t, i) => {
    const s = new Sprite(t);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.alpha = [0.1, 0.09, 0.03][i]; // only a faint tint: the photo underneath must stay sharp
    nebulaLayer.addChild(s);
    return s;
  });

  type Star = { s: Sprite; x: number; y: number; tw: number; base: number };
  const stars: Star[][] = starLayers.map((layer, depth) =>
    Array.from({ length: [140, 70, 28][depth] }, () => {
      const s = new Sprite(tex.star);
      s.anchor.set(0.5);
      s.blendMode = "add";
      const base = [0.35, 0.6, 0.9][depth] * (0.5 + Math.random() * 0.5);
      s.scale.set([0.25, 0.4, 0.7][depth] * (0.6 + Math.random() * 0.8));
      layer.addChild(s);
      return { s, x: Math.random(), y: Math.random(), tw: Math.random() * Math.PI * 2, base };
    }),
  );

  // core: a bright glow with god rays
  const coreGlow = new Sprite(tex.soft);
  coreGlow.anchor.set(0.5);
  coreGlow.tint = 0xf0c766;
  coreGlow.blendMode = "add";
  const coreHot = new Sprite(tex.glow);
  coreHot.anchor.set(0.5);
  coreHot.tint = 0xfffbe6;
  coreHot.blendMode = "add";
  // slow light rays around the core: two large sparkles turning in opposite directions
  const rays = [new Sprite(tex.sparkle), new Sprite(tex.sparkle)];
  for (const r of rays) { r.anchor.set(0.5); r.blendMode = "add"; r.tint = 0xf0c766; r.alpha = 0.08; }
  coreLayer.addChild(...rays, coreGlow, coreHot);

  // light sources: clusters on the galaxy view, destinations inside a cluster
  const reticle = new Graphics();
  const reticleState = { a: 0, x: 0, y: 0, r: 0 };
  fxLayer.addChild(reticle);
  type OrbView = { c: Container; src: LightSource; o: Orb; scale: number };
  let orbViews: OrbView[] = [];
  const makeOrb = (o: Orb, i: number): OrbView => {
    const src = makeLightSource(tex, o.seed ?? i + 1, hex(o.hue ?? o.color), hex(o.color), o.photo ? 42 : 18);
    orbLayer.addChild(src.c);
    if (o.photo) void Assets.load<Texture>(o.photo).then((tx) => src.setPhoto(tx)).catch(() => {});
    return { c: src.c, src, o, scale: 1 };
  };

  // bridges
  type BridgeView = { g: Graphics; sparks: Sprite[]; to: { x: number; y: number }; t: number };
  let bridgeViews: BridgeView[] = [];

  // motes drifting toward the core
  type Mote = { s: Sprite; a: number; r: number; speed: number };
  const motes: Mote[] = Array.from({ length: reduce ? 0 : 60 }, () => {
    const s = new Sprite(tex.star);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = Math.random() < 0.5 ? 0xc9ff55 : 0xf0c766;
    s.scale.set(0.25 + Math.random() * 0.3);
    moteLayer.addChild(s);
    return { s, a: Math.random() * Math.PI * 2, r: 0.2 + Math.random() * 0.8, speed: 0.0006 + Math.random() * 0.0012 };
  });

  // bursts (used when a dive departs or resolves)
  type Particle = { s: Sprite; vx: number; vy: number; life: number; max: number };
  const particles: Particle[] = [];

  let state: GalaxyState = { orbs: [], bridges: [], hover: null };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e: PointerEvent) => {
    const r = host.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left) / r.width - 0.5;
    pointer.ty = (e.clientY - r.top) / r.height - 0.5;
  };
  window.addEventListener("pointermove", onMove);

  const W = () => app.renderer.width / app.renderer.resolution;
  const H = () => app.renderer.height / app.renderer.resolution;
  const box = { x: 0, y: 0, w: 1, h: 1 };
  const px = (p: { x: number; y: number }) => ({ x: box.x + (p.x / 100) * box.w, y: box.y + (p.y / 100) * box.h });

  let photoUrl = "";
  let photos: { s: Sprite; target: number }[] = [];
  function setPhoto(url?: string) {
    if (!url || url === photoUrl) return;
    photoUrl = url;
    void Assets.load<Texture>(url).then((t) => {
      if (photoUrl !== url) return;
      const s = new Sprite(t);
      s.anchor.set(0.5);
      s.alpha = 0;
      photoLayer.addChild(s);
      for (const p of photos) p.target = 0;
      photos.push({ s, target: 0.78 });
    }).catch(() => {});
  }

  function update(next: GalaxyState) {
    setPhoto(next.photo);
    const sameOrbs = next.orbs.length === state.orbs.length && next.orbs.every((o, i) => o.x === state.orbs[i].x && o.y === state.orbs[i].y && o.color === state.orbs[i].color && o.locked === state.orbs[i].locked && o.seed === state.orbs[i].seed);
    if (!sameOrbs) {
      for (const v of orbViews) v.c.destroy({ children: true });
      orbViews = next.orbs.map(makeOrb);
    } else orbViews.forEach((v, i) => (v.o = next.orbs[i]));
    const sameBridges = next.bridges.length === state.bridges.length && next.bridges.every((b, i) => b.x === state.bridges[i].x && b.y === state.bridges[i].y);
    if (!sameBridges) {
      for (const b of bridgeViews) { b.g.destroy(); b.sparks.forEach((s) => s.destroy()); }
      bridgeViews = next.bridges.map((to) => {
        const g = new Graphics();
        bridgeLayer.addChild(g);
        const sparks = Array.from({ length: 6 }, () => {
          const s = new Sprite(tex.sparkle);
          s.anchor.set(0.5);
          s.blendMode = "add";
          s.tint = 0xc9ff55;
          fxLayer.addChild(s);
          return s;
        });
        return { g, sparks, to, t: Math.random() };
      });
    }
    state = next;
  }

  // floating labels ("+3.21") that rise and fade above a destination
  type Floater = { t: Text; life: number };
  const floaters: Floater[] = [];
  function float(x: number, y: number, text: string, color: string) {
    const p = px({ x, y });
    const t = new Text({ text, style: { fontFamily: "Chakra Petch, sans-serif", fontWeight: "700", fontSize: 26, fill: color, stroke: { color: "#000000", width: 4 }, dropShadow: { color, blur: 12, distance: 0, alpha: 0.8 } } });
    t.anchor.set(0.5);
    t.position.set(p.x, p.y - 30);
    fxLayer.addChild(t);
    floaters.push({ t, life: 0 });
  }

  function burst(x: number, y: number, color: string) {
    const p = px({ x, y });
    for (let i = 0; i < (reduce ? 0 : 70); i++) {
      const s = new Sprite(i % 4 ? tex.star : tex.sparkle);
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = i % 3 ? hex(color) : 0xffffff;
      s.position.set(p.x, p.y);
      s.scale.set(0.3 + Math.random() * 0.5);
      fxLayer.addChild(s);
      const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 5;
      particles.push({ s, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 40 + Math.random() * 40 });
    }
  }

  let time = 0;
  app.ticker.add((tk) => {
    const dt = reduce ? 0 : tk.deltaTime;
    time += dt / 60;
    const w = W(), h = H();
    const el = state.frame?.current;
    if (el) {
      const c = app.canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
      box.x = r.left - c.left; box.y = r.top - c.top; box.w = Math.max(1, r.width); box.h = Math.max(1, r.height);
    } else { box.x = 0; box.y = 0; box.w = w; box.h = h; }
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    const core = state.core ? px(state.core) : { x: w * 0.52, y: h * 0.5 };

    photos = photos.filter((p) => {
      p.s.alpha += (p.target - p.s.alpha) * 0.04;
      if (p.target === 0 && p.s.alpha < 0.01) { p.s.destroy(); return false; }
      const cover = Math.max(w / p.s.texture.width, h / p.s.texture.height) * (1.12 + Math.sin(time * 0.03) * 0.03);
      p.s.scale.set(cover);
      p.s.position.set(w / 2 - pointer.x * 30, h / 2 - pointer.y * 24);
      return true;
    });
    nebulae.forEach((n, i) => {
      n.position.set(w / 2 - pointer.x * (12 + i * 10) + Math.sin(time * 0.05 + i) * 20, h / 2 - pointer.y * (10 + i * 8));
      n.scale.set(Math.max(w / 900, h / 600) * (1.1 + i * 0.12));
      n.rotation = Math.sin(time * 0.02 + i * 2) * 0.05;
    });
    stars.forEach((layer, depth) => {
      const shift = [6, 16, 34][depth];
      for (const st of layer) {
        st.tw += dt * 0.02;
        st.s.alpha = st.base * (0.7 + 0.3 * Math.sin(st.tw));
        st.s.position.set(st.x * w - pointer.x * shift, st.y * h - pointer.y * shift);
      }
    });

    // survey grid: + marks on a lattice centred on the core, brighter close to it
    rings.clear();
    const step = 72, ox = core.x - pointer.x * 14, oy = core.y - pointer.y * 14;
    const reach = Math.hypot(w, h) * 0.5;
    for (let gx = ox - Math.ceil(ox / step) * step; gx < w; gx += step) {
      for (let gy = oy - Math.ceil(oy / step) * step; gy < h; gy += step) {
        const d = Math.hypot(gx - ox, gy - oy) / reach;
        const a = Math.max(0, 0.22 - d * 0.16);
        if (a < 0.03) continue;
        rings.moveTo(gx - 3, gy).lineTo(gx + 3, gy).moveTo(gx, gy - 3).lineTo(gx, gy + 3).stroke({ color: 0xc9ff55, width: 1, alpha: a });
      }
    }
    // two axis hairlines through the core with a scale every 36px
    rings.moveTo(0, oy).lineTo(w, oy).moveTo(ox, 0).lineTo(ox, h).stroke({ color: 0xc9ff55, width: 1, alpha: 0.05 });
    for (let k = -30; k <= 30; k++) {
      const l = k % 5 === 0 ? 5 : 2;
      rings.moveTo(ox + k * 36, oy - l).lineTo(ox + k * 36, oy + l).moveTo(ox - l, oy + k * 36).lineTo(ox + l, oy + k * 36);
    }
    rings.stroke({ color: 0xc9ff55, width: 1, alpha: 0.12 });

    const pulse = 1 + Math.sin(time * 1.2) * 0.06;
    coreGlow.position.set(core.x - pointer.x * 22, core.y - pointer.y * 22);
    coreHot.position.copyFrom(coreGlow.position);
    coreGlow.scale.set((Math.min(w, h) / 256) * 0.5 * pulse);
    coreGlow.alpha = 0.3;
    coreHot.scale.set((Math.min(w, h) / 256) * 0.12 * pulse);
    rays.forEach((r, i) => {
      r.position.copyFrom(coreGlow.position);
      r.scale.set((Math.min(w, h) / 128) * (i ? 0.5 : 0.75));
      r.rotation = time * (i ? -0.03 : 0.02) + i * 0.4;
    });

    orbViews.forEach((v, i) => {
      const p = px(v.o);
      const hovered = state.hover === i;
      v.scale += ((hovered ? 1.12 : 1) - v.scale) * 0.12;
      const base = (v.o.size ?? (v.o.core ? 1.35 : 1)) * v.scale;
      v.c.position.set(p.x - pointer.x * 26, p.y - pointer.y * 26);
      v.src.update(34 * base, time, hovered, !!v.o.locked);
      if (hovered) { reticleState.x = v.c.position.x; reticleState.y = v.c.position.y; reticleState.r = 34 * base * 1.05; }
    });
    reticleState.a += ((state.hover !== null && orbViews[state.hover] ? 1 : 0) - reticleState.a) * 0.15;
    reticle.clear();
    if (reticleState.a > 0.02) {
      const { x, y } = reticleState, r = reticleState.r * (1.5 - reticleState.a * 0.5), l = r * 0.32;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        reticle.moveTo(x + sx * r, y + sy * (r - l)).lineTo(x + sx * r, y + sy * r).lineTo(x + sx * (r - l), y + sy * r);
      }
      reticle.stroke({ color: 0xffffff, width: 1.5, alpha: 0.85 * reticleState.a });
      // a short arc of ticks turning slowly outside the brackets
      for (let k = 0; k < 14; k++) {
        const a = time * 0.6 + (k / 14) * Math.PI * 0.6;
        const r1 = r * 1.22, r2 = r1 + (k % 7 === 0 ? 7 : 3);
        reticle.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1).lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2);
      }
      reticle.stroke({ color: 0xc9ff55, width: 1, alpha: 0.6 * reticleState.a });
    }

    bridgeViews.forEach((b) => {
      const to = px(b.to);
      const from = { x: w * 0.02, y: h * 0.98 };
      const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - h * 0.3 };
      b.g.clear();
      b.g.moveTo(from.x, from.y).quadraticCurveTo(ctrl.x, ctrl.y, to.x - pointer.x * 26, to.y - pointer.y * 26);
      b.g.stroke({ color: 0xc9ff55, alpha: 0.18, width: 10 });
      b.g.moveTo(from.x, from.y).quadraticCurveTo(ctrl.x, ctrl.y, to.x - pointer.x * 26, to.y - pointer.y * 26);
      b.g.stroke({ color: 0xeaffb0, alpha: 0.8, width: 1.6 });
      b.t = (b.t + dt * 0.006) % 1;
      b.sparks.forEach((s, k) => {
        const t = (b.t + k / b.sparks.length) % 1;
        const x = (1 - t) ** 2 * from.x + 2 * (1 - t) * t * ctrl.x + t * t * (to.x - pointer.x * 26);
        const y = (1 - t) ** 2 * from.y + 2 * (1 - t) * t * ctrl.y + t * t * (to.y - pointer.y * 26);
        s.position.set(x, y);
        s.scale.set(0.18 + 0.12 * Math.sin(t * Math.PI));
        s.alpha = Math.sin(t * Math.PI);
      });
    });

    for (const m of motes) {
      m.a += m.speed * dt * 2;
      m.r -= m.speed * dt * 0.25;
      if (m.r < 0.05) { m.r = 1; m.a = Math.random() * Math.PI * 2; }
      const R = Math.max(w, h) * 0.55 * m.r;
      m.s.position.set(core.x + Math.cos(m.a) * R, core.y + Math.sin(m.a) * R * 0.62);
      m.s.alpha = Math.min(1, (1 - m.r) * 2) * 0.7;
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life += dt;
      f.t.y -= 0.6 * dt;
      f.t.alpha = f.life < 20 ? f.life / 20 : Math.max(0, 1 - (f.life - 90) / 40);
      if (f.life > 130) { f.t.destroy(); floaters.splice(i, 1); }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.s.alpha = 1 - p.life / p.max;
      if (p.life >= p.max) { p.s.destroy(); particles.splice(i, 1); }
    }
  });

  return {
    update,
    burst,
    float,
    /** Stops drawing while something covers the map (the voyage screen runs its own scene). */
    pause(on) {
      if (on) app.ticker.stop(); else app.ticker.start();
    },
    destroy() {
      window.removeEventListener("pointermove", onMove);
      app.destroy(true, { children: true, texture: true });
    },
  };
}
