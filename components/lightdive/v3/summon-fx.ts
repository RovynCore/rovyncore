// WebGL summon effect (Pixi 8), built like a game summon: a layered magic circle with runes turning at different
// speeds, sparks spiralling into the centre while the signal comes in, then a pillar of light in the colour of the
// best card, shockwave rings, a particle burst and, for 稜光／曜核, falling golden shards and a white flash.
// Like real gacha screens it has a rarity tell: a warp starfield that speeds up as the signal arrives, and on arrival
// the circle climbs tier by tier (微光 → 輝脈 → …) before it settles on the best card's colour, each step with a ripple
// that bends the whole screen.
import { Application, BlurFilter, Container, Graphics, Sprite, Texture } from "pixi.js";
import { AdvancedBloomFilter, ShockwaveFilter } from "pixi-filters";
import { paintGlow, paintSparkle, paintStar } from "../game/pixi-paint";
import { spikes } from "./light-source";
import { calm } from "./settings";

export type SummonFx = {
  charge: (progress: number) => void;
  /** One step of the tier climb before the reveal. */
  tell: (color: string, step: number) => void;
  /** The cards are on the table: dim the circle and let the stars drift. */
  settle: () => void;
  reveal: (color: string, level: number) => void;
  destroy: () => void;
};
const hex = (c: string) => parseInt(c.replace("#", ""), 16);

type P = { s: Sprite; vx: number; vy: number; life: number; max: number; spin?: number; orbit?: { a: number; r: number; w: number } };

/** `lite`: phones and small machines get the same effect with fewer particles, lower resolution and a cheaper glow. */
export async function createSummonFx(host: HTMLElement, accent: string, anchor?: () => { x: number; y: number; r: number } | null, lite = false): Promise<SummonFx> {
  const P = lite ? 0.45 : 1; // particle budget
  const app = new Application();
  await app.init({ resizeTo: host, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2), autoDensity: true, preference: "webgl" });
  app.ticker.maxFPS = 60;
  app.canvas.className = "v3-pull__gl";
  app.canvas.setAttribute("aria-hidden", "true");
  host.insertBefore(app.canvas, host.firstChild);
  const tex = { glow: Texture.from(paintGlow(256, 0.5)), soft: Texture.from(paintGlow(256, 0.9)), star: Texture.from(paintStar(32)), sparkle: Texture.from(paintSparkle(128)) };
  const reduce = calm();

  const world = new Container();
  const sky = new Container();
  const root = new Container();
  const circle = new Container();
  const fx = new Container();
  app.stage.addChild(world);
  world.addChild(sky, root);
  root.addChild(circle, fx);
  // warp stars: points in depth that stream out from the circle; the faster the signal, the longer the streaks
  const warp = Array.from({ length: reduce ? 0 : lite ? 90 : 220 }, () => {
    const s = new Sprite(tex.star);
    s.anchor.set(0.5);
    s.blendMode = "add";
    sky.addChild(s);
    return { s, a: Math.random() * Math.PI * 2, z: Math.random(), k: 0.5 + Math.random() * 0.8, warm: Math.random() < 0.25 };
  });
  let speed = 0.12;
  const ripple = new ShockwaveFilter({ amplitude: 22, wavelength: 150, speed: 900, brightness: 1.15, radius: -1, time: 9 });
  world.filters = [ripple];
  const bloom = new AdvancedBloomFilter({ threshold: 0.55, bloomScale: 0.8, brightness: 1, blur: lite ? 6 : 8, quality: lite ? 2 : 4 });
  root.filters = [bloom];

  let color = hex(accent);
  // the magic circle: rings, rune ticks, two rotated polygons, inner glyph ring
  const rings = [new Graphics(), new Graphics(), new Graphics(), new Graphics()];
  rings.forEach((g) => circle.addChild(g));
  const glyphs = new Graphics(); // a ring of small runes between the outer rings
  const energy = new Graphics(); // pulsing lines from the hexagram points to the centre
  circle.addChild(glyphs, energy);
  const glyphSeed = (i: number, k: number) => Math.abs(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1;
  const core = new Sprite(tex.glow);
  core.anchor.set(0.5);
  core.blendMode = "add";
  circle.addChild(core);
  const drawCircle = (R: number) => {
    const [a, b, c, d] = rings;
    a.clear().circle(0, 0, R).stroke({ color, width: 2, alpha: 0.9 }).circle(0, 0, R * 0.93).stroke({ color, width: 1, alpha: 0.5 });
    for (let i = 0; i < 72; i++) {
      const t = (i / 72) * Math.PI * 2, l = i % 6 === 0 ? 0.12 : 0.05;
      a.moveTo(Math.cos(t) * R * 0.93, Math.sin(t) * R * 0.93).lineTo(Math.cos(t) * R * (0.93 - l), Math.sin(t) * R * (0.93 - l));
    }
    a.stroke({ color, width: 1.2, alpha: 0.7 });
    const poly = (g: Graphics, n: number, r: number, rot: number) => {
      for (let i = 0; i <= n; i++) {
        const t = rot + ((n === 3 ? i : i * 2) * Math.PI * 2) / n; // triangles go round once; the pentagram skips every second vertex
        if (i === 0) g.moveTo(Math.cos(t) * r, Math.sin(t) * r); else g.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
    };
    b.clear();
    poly(b, 3, R * 0.78, -Math.PI / 2); // two triangles make the hexagram
    poly(b, 3, R * 0.78, Math.PI / 2);
    b.stroke({ color, width: 1.6, alpha: 0.75 });
    c.clear().circle(0, 0, R * 0.55).stroke({ color, width: 1.4, alpha: 0.7 }).circle(0, 0, R * 0.5).stroke({ color: 0xffffff, width: 0.8, alpha: 0.35 });
    for (let i = 0; i < 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      c.circle(Math.cos(t) * R * 0.525, Math.sin(t) * R * 0.525, i % 3 === 0 ? 3 : 1.5).fill({ color, alpha: 0.9 });
    }
    d.clear();
    poly(d, 5, R * 0.42, Math.PI / 2);
    d.stroke({ color: 0xffffff, width: 1, alpha: 0.45 });
    // runes: each one a few short strokes inside a small cell, the same shapes every time
    glyphs.clear();
    const n = 40, gr = R * 0.86, cell = R * 0.045;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const cx = Math.cos(a) * gr, cy = Math.sin(a) * gr;
      const rot = a + Math.PI / 2;
      const pt = (x: number, y: number) => [cx + (x * Math.cos(rot) - y * Math.sin(rot)) * cell, cy + (x * Math.sin(rot) + y * Math.cos(rot)) * cell] as const;
      const strokes = 2 + Math.floor(glyphSeed(i, 0) * 3);
      for (let s = 0; s < strokes; s++) {
        const [x1, y1] = pt(glyphSeed(i, s * 4 + 1) * 2 - 1, glyphSeed(i, s * 4 + 2) * 2 - 1);
        const [x2, y2] = pt(glyphSeed(i, s * 4 + 3) * 2 - 1, glyphSeed(i, s * 4 + 4) * 2 - 1);
        glyphs.moveTo(x1, y1).lineTo(x2, y2);
      }
      if (glyphSeed(i, 99) > 0.6) { const [x, y] = pt(0, 0); glyphs.circle(x, y, cell * 0.25); }
    }
    glyphs.stroke({ color, width: 1.1, alpha: 0.75 });
    core.tint = color;
    core.scale.set((R * 0.9) / 128);
  };

  const parts: P[] = [];
  const comets = Array.from({ length: 3 }, (_, i) => {
    const s = new Sprite(tex.sparkle);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.scale.set(0.35);
    circle.addChild(s);
    return { s, a: (i / 3) * Math.PI * 2, r: 1.02 + i * 0.07, w: 0.012 + i * 0.004 };
  });
  const flare = new Sprite(spikes());
  flare.anchor.set(0.5);
  flare.blendMode = "add";
  flare.alpha = 0;
  const spawn = (tx: Texture, x: number, y: number, vx: number, vy: number, life: number, tint: number, scale: number, extra?: Partial<P>) => {
    const s = new Sprite(tx);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = tint;
    s.scale.set(scale);
    s.position.set(x, y);
    fx.addChild(s);
    parts.push({ s, vx, vy, life, max: life, ...extra });
  };
  const shock: { g: Graphics; t: number; max: number; color: number }[] = [];
  const pillar = new Sprite(tex.soft);
  pillar.anchor.set(0.5, 0.5);
  pillar.blendMode = "add";
  pillar.alpha = 0;
  fx.addChild(pillar);
  const flash = new Graphics();
  flash.alpha = 0;
  app.stage.addChild(flash);
  fx.addChild(flare);
  const blur = new BlurFilter({ strength: 10 });
  pillar.filters = [blur];

  let progress = 0, revealed = 0, level = 0, time = 0, spin = 1, settled = false;
  const R = () => anchor?.()?.r ?? Math.min(app.screen.width, app.screen.height) * 0.3;
  drawCircle(R());
  app.renderer.on("resize", () => drawCircle(R()));

  app.ticker.add((tk) => {
    const dt = Math.min(3, tk.deltaTime);
    time += dt / 60;
    const w = app.screen.width, h = app.screen.height;
    const at = anchor?.();
    root.position.set(at?.x ?? w / 2, at?.y ?? h * 0.46);
    world.filterArea = app.screen;
    ripple.center = { x: root.position.x, y: root.position.y };
    ripple.time += dt / 60;
    speed += ((settled ? 0.06 : revealed ? (revealed > 150 ? 0.15 : 0.5) : 0.12 + progress * progress * 1.4) - speed) * 0.04;
    const far = Math.hypot(w, h) * 0.6;
    warp.forEach((p) => {
      p.z += 0.004 * speed * p.k * dt * (0.4 + p.z * 2);
      if (p.z > 1) { p.z = 0.02 + Math.random() * 0.05; p.a = Math.random() * Math.PI * 2; }
      const d = p.z * p.z * far + 30;
      p.s.position.set(root.position.x + Math.cos(p.a) * d, root.position.y + Math.sin(p.a) * d);
      p.s.rotation = p.a;
      const size = 0.12 + p.z * 0.5;
      p.s.scale.set(size * (1 + speed * 9 * p.z), size * 0.55);
      p.s.alpha = Math.min(1, p.z * 3) * (0.35 + Math.min(0.6, speed * 0.5));
      p.s.tint = p.warm ? color : 0xdfe9ff;
    });
    flash.clear().rect(0, 0, w, h).fill(0xffffff);
    // the circle turns; faster as the signal arrives, very fast during the reveal
    spin += ((revealed ? 6 : 1 + progress * 2.5) - spin) * 0.05;
    rings[0].rotation += 0.002 * spin * dt;
    rings[1].rotation -= 0.004 * spin * dt;
    rings[2].rotation += 0.006 * spin * dt;
    rings[3].rotation -= 0.009 * spin * dt;
    circle.alpha += ((settled ? 0.08 : 1) - circle.alpha) * 0.05;
    fx.alpha += ((settled ? 0.25 : 1) - fx.alpha) * 0.05;
    sky.alpha += ((settled ? 0.45 : 1) - sky.alpha) * 0.04;
    circle.scale.set(1 + Math.sin(time * 2) * 0.01 + (revealed ? Math.min(0.15, revealed * 0.002) : 0));
    core.alpha = (revealed ? Math.max(0.15, 0.6 - revealed * 0.006) : 0.3 + progress * 0.35) + Math.sin(time * 6) * 0.06;
    const Rn = R();
    glyphs.rotation -= 0.0015 * spin * dt;
    glyphs.alpha = 0.55 + 0.35 * Math.sin(time * 1.5);
    // energy: from each hexagram point to the centre, brighter as the signal comes in
    energy.clear();
    for (let i = 0; i < 6; i++) {
      const a = rings[1].rotation - Math.PI / 2 + (i * Math.PI) / 3;
      const pulse = 0.25 + 0.75 * Math.max(0, Math.sin(time * 4 - i));
      energy.moveTo(Math.cos(a) * Rn * 0.78, Math.sin(a) * Rn * 0.78).lineTo(0, 0).stroke({ color, width: 1 + progress * 1.5, alpha: (0.15 + progress * 0.45) * pulse });
    }
    // comets circling the circle, leaving a short trail
    comets.forEach((cm) => {
      cm.a += cm.w * spin * dt;
      const x = Math.cos(cm.a) * Rn * cm.r, y = Math.sin(cm.a) * Rn * cm.r;
      cm.s.position.set(x, y);
      cm.s.tint = color;
      if (!reduce && Math.random() < 0.8 * P) spawn(tex.star, x, y, 0, 0, 26, color, 0.22, { orbit: { a: cm.a, r: Rn * cm.r, w: 0 } });
    });
    // embers rising from below the circle
    if (!reduce && Math.random() < 0.35 * P) spawn(tex.star, (Math.random() - 0.5) * Rn * 2.4, Rn * 1.3, (Math.random() - 0.5) * 0.3, -(0.8 + Math.random() * 1.6), 140, Math.random() < 0.5 ? color : 0xffd98a, 0.15 + Math.random() * 0.25);
    // sparks spiral inward while charging
    if (!reduce && !revealed && Math.random() < (0.5 + progress) * P) {
      const a = Math.random() * Math.PI * 2, r = R() * (1.1 + Math.random() * 0.5);
      spawn(Math.random() < 0.3 ? tex.sparkle : tex.star, Math.cos(a) * r, Math.sin(a) * r, 0, 0, 90, Math.random() < 0.5 ? color : 0xffffff, 0.25 + Math.random() * 0.35, { orbit: { a, r, w: 0.02 + Math.random() * 0.02 } });
    }
    if (revealed) {
      revealed += dt;
      pillar.position.set(0, -h * 0.2);
      pillar.scale.set(Math.min(1.6, revealed * 0.04) * (1 + level * 0.15) * Math.min(1, Math.min(w, h) / 620), h / 90);
      pillar.alpha = Math.max(0, Math.min(1, revealed * 0.05) - Math.max(0, (revealed - 70) * 0.012));
      flash.alpha = Math.max(0, flash.alpha - 0.02 * dt);
      flare.position.set(0, 0);
      const fk = Math.min(1, revealed / 18);
      flare.scale.set(((Math.min(w, h) * (0.6 + level * 0.18)) / 512) * fk);
      flare.alpha = Math.max(0, 1 - Math.max(0, revealed - 30) / 90);
      flare.rotation = revealed * 0.002;
      flare.tint = color;
      // late golden shards for the top tiers
      if (!reduce && level >= 3 && revealed > 20 && revealed < 120 && Math.random() < 0.6) {
        spawn(tex.sparkle, (Math.random() - 0.5) * w, -h * 0.5, (Math.random() - 0.5) * 0.6, 2 + Math.random() * 3, 160, level >= 4 ? 0xffc46b : color, 0.2 + Math.random() * 0.3, { spin: (Math.random() - 0.5) * 0.2 });
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.orbit) {
        p.orbit.a += p.orbit.w * dt * spin * 0.6;
        if (p.orbit.w) p.orbit.r *= 1 - 0.012 * dt;
        p.s.position.set(Math.cos(p.orbit.a) * p.orbit.r, Math.sin(p.orbit.a) * p.orbit.r);
        if (p.orbit.r < 12) p.life = 0;
      } else {
        p.s.position.x += p.vx * dt;
        p.s.position.y += p.vy * dt;
        p.vx *= 0.985;
        p.vy *= 0.985;
      }
      if (p.spin) p.s.rotation += p.spin * dt;
      p.s.alpha = Math.min(1, p.life / (p.max * 0.4));
      if (p.life <= 0) { p.s.destroy(); parts.splice(i, 1); }
    }
    for (let i = shock.length - 1; i >= 0; i--) {
      const s = shock[i];
      s.t += dt;
      const k = s.t / s.max;
      s.g.clear().circle(0, 0, R() * (0.3 + k * 2.4)).stroke({ color: s.color, width: 6 * (1 - k) + 1, alpha: 1 - k });
      if (k >= 1) { s.g.destroy(); shock.splice(i, 1); }
    }
  });

  const pulse = (strength: number) => {
    ripple.time = 0;
    ripple.amplitude = strength;
    const g = new Graphics();
    fx.addChild(g);
    shock.push({ g, t: 0, max: 50, color });
  };
  return {
    charge: (p) => { progress = Math.max(0, Math.min(1, p)); },
    settle: () => { settled = true; },
    tell: (c, step) => {
      if (revealed) return;
      color = hex(c);
      drawCircle(R());
      spin += 3;
      speed += 0.8;
      pulse(14 + step * 6);
      if (!reduce) {
        for (let i = 0; i < 24 + step * 10; i++) {
          const a = Math.random() * Math.PI * 2, v = 1.5 + Math.random() * 3;
          spawn(tex.star, Math.cos(a) * R() * 0.3, Math.sin(a) * R() * 0.3, Math.cos(a) * v, Math.sin(a) * v, 40 + Math.random() * 30, Math.random() < 0.7 ? color : 0xffffff, 0.2 + Math.random() * 0.3);
        }
      }
    },
    reveal: (c, lv) => {
      if (revealed) return;
      color = hex(c);
      level = lv;
      revealed = 1;
      drawCircle(R());
      pillar.tint = color;
      flash.alpha = lv >= 3 ? 0.9 : lv === 2 ? 0.3 : 0.12; // the big flash is saved for 稜光 and 曜核
      speed = 2.5 + lv;
      ripple.time = 0;
      ripple.amplitude = 26 + lv * 10;
      for (let k = 0; k < 2 + lv; k++) {
        const g = new Graphics();
        fx.addChild(g);
        shock.push({ g, t: -k * 10, max: 70 + k * 10, color: k % 2 ? 0xffffff : color });
      }
      if (!reduce) {
        for (let i = 0; i < (80 + lv * 60) * P; i++) {
          const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * (5 + lv * 2);
          spawn(Math.random() < 0.25 ? tex.sparkle : tex.star, 0, 0, Math.cos(a) * v, Math.sin(a) * v, 50 + Math.random() * 60, Math.random() < 0.6 ? color : 0xffffff, 0.2 + Math.random() * 0.5, { spin: (Math.random() - 0.5) * 0.3 });
        }
      }
    },
    destroy: () => app.destroy(true, { children: true, texture: false }),
  };
}
