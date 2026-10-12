// A light source on the star map, drawn the way a deep-space telescope sees a bright star in a nebula: a soft-edged
// patch of nebula (a Hubble photo for clusters), a sprinkling of twinkling stars, a hot core and six diffraction
// spikes. No hard outlines, so nothing reads as a planet or a button.
import { Container, Sprite, Texture } from "pixi.js";

let spikeTexture: Texture | null = null;
/** Six diffraction spikes (one vertical pair, two diagonal pairs) with a faint horizontal strut, as on JWST images. */
export function spikes(): Texture {
  if (spikeTexture) return spikeTexture;
  const S = 512, m = S / 2;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.globalCompositeOperation = "lighter";
  const spike = (angle: number, len: number, width: number, alpha: number) => {
    g.save();
    g.translate(m, m);
    g.rotate(angle);
    const grad = g.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, `rgba(255,255,255,${alpha})`);
    grad.addColorStop(0.25, `rgba(255,255,255,${alpha * 0.45})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -width);
    g.lineTo(len, 0);
    g.lineTo(0, width);
    g.closePath();
    g.fill();
    g.restore();
  };
  for (const a of [-Math.PI / 2, Math.PI / 2]) spike(a, m, 3.2, 0.95);
  for (const a of [-Math.PI / 6, Math.PI / 6, (5 * Math.PI) / 6, (-5 * Math.PI) / 6]) spike(a, m * 0.78, 2.6, 0.8);
  for (const a of [0, Math.PI]) spike(a, m * 0.42, 1.2, 0.35);
  const core = g.createRadialGradient(m, m, 0, m, m, m * 0.18);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.3, "rgba(255,255,255,0.6)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = core;
  g.fillRect(0, 0, S, S);
  spikeTexture = Texture.from(c);
  return spikeTexture;
}

const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type LightSource = {
  c: Container;
  /** Per-frame update: radius in px, time in seconds, hovered, locked. */
  update: (radius: number, time: number, hovered: boolean, locked: boolean) => void;
  setPhoto: (t: Texture) => void;
};

/** hue: nebula colour; light: the star's colour; stars: how many small stars around it. */
export function makeLightSource(tex: { soft: Texture; star: Texture }, seed: number, hue: number, light: number, stars: number): LightSource {
  const r = rng(seed * 2654435761 + 7);
  const c = new Container();
  const nebula = new Container();
  // nebula: overlapping soft clouds, slightly off-centre, each drifting on its own
  const clouds = Array.from({ length: 5 }, (_, i) => {
    const s = new Sprite(tex.soft);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = i === 0 ? light : hue;
    return { s, ox: (r() - 0.5) * 1.1, oy: (r() - 0.5) * 0.8, k: 0.8 + r() * 0.9, a: 0.05 + r() * 0.07, ph: r() * 6.28, sp: 0.1 + r() * 0.2 };
  });
  clouds.forEach((x) => nebula.addChild(x.s));
  // a window onto a real photograph, faded out with a soft alpha mask (no hard edge)
  let photo: Sprite | null = null;
  const fade = new Sprite(tex.soft);
  fade.anchor.set(0.5);
  // small stars scattered like a cluster: denser towards the middle
  const dots = Array.from({ length: stars }, () => {
    const s = new Sprite(tex.star);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = r() < 0.3 ? light : r() < 0.6 ? 0xffffff : hue;
    const d = Math.pow(r(), 1.6);
    return { s, a: r() * Math.PI * 2, d, size: 0.12 + r() * 0.28, tw: 0.6 + r() * 2.2, ph: r() * 6.28 };
  });
  const halo = new Sprite(tex.soft);
  halo.anchor.set(0.5);
  halo.blendMode = "add";
  halo.tint = light;
  const core = new Sprite(tex.star);
  core.anchor.set(0.5);
  core.blendMode = "add";
  const spike = new Sprite(spikes());
  spike.anchor.set(0.5);
  spike.blendMode = "add";
  spike.tint = light;
  c.addChild(nebula, halo, ...dots.map((x) => x.s), spike, core);

  return {
    c,
    setPhoto: (t) => {
      if (c.destroyed || photo) return;
      photo = new Sprite(t);
      photo.anchor.set(0.5);
      photo.mask = fade;
      c.addChildAt(photo, 1);
      c.addChildAt(fade, 2);
    },
    update: (R, time, hovered, locked) => {
      const k = hovered ? 1.18 : 1;
      clouds.forEach((x) => {
        x.s.position.set(x.ox * R + Math.sin(time * x.sp + x.ph) * R * 0.06, x.oy * R + Math.cos(time * x.sp + x.ph) * R * 0.05);
        x.s.scale.set((R * 2.2 * x.k * k) / 256);
        x.s.alpha = (locked ? 0.35 : 1) * (hovered ? x.a * 1.6 : x.a);
      });
      if (photo) {
        const side = Math.min(photo.texture.width, photo.texture.height);
        photo.scale.set((R * 3.2 * k) / side);
        photo.rotation = time * 0.012 + seed;
        photo.alpha = locked ? 0.2 : hovered ? 0.85 : 0.6;
        photo.tint = locked ? 0x8a8f99 : 0xffffff;
        fade.scale.set((R * 2.9 * k) / 256);
      }
      halo.scale.set((R * 0.9 * k) / 256);
      halo.alpha = locked ? 0.1 : hovered ? 0.42 : 0.24;
      dots.forEach((x, i) => {
        const a = x.a + time * 0.015 * (i % 2 ? 1 : -1);
        x.s.position.set(Math.cos(a) * x.d * R * 1.15, Math.sin(a) * x.d * R * 0.9);
        x.s.scale.set(x.size * (hovered ? 1.2 : 1));
        x.s.alpha = (locked ? 0.25 : 1) * (0.35 + 0.65 * Math.abs(Math.sin(time * x.tw + x.ph)));
      });
      const shimmer = 1 + Math.sin(time * 2.3 + seed) * 0.04;
      spike.scale.set(((R * 2.1) / 512) * k * shimmer);
      spike.alpha = locked ? 0.15 : hovered ? 1 : 0.8;
      core.scale.set((R * 0.06 * k * shimmer));
      core.alpha = locked ? 0.4 : 1;
    },
  };
}
