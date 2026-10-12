// Offscreen Canvas2D painting for the Lightdive WebGL scene: everything that benefits from rich
// gradients and soft glows is painted once into a texture, then animated by PixiJS.
// When the final art exists, these painters are the place to swap in the images.

const LIME = "#c9ff55";
export const RARITY_ACCENT = ["#c9ff55", "#3de7e0", "#e6f1ff", "#e8c46a", "#fff4d6"];

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return c;
}

/** A soft round glow, white, meant to be tinted and drawn additively. */
export function paintGlow(size = 256, falloff = 0.5) {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(falloff * 0.4, "rgba(255,255,255,0.55)");
  grad.addColorStop(falloff, "rgba(255,255,255,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** A small hard star with a faint halo. */
export function paintStar(size = 32) {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.18, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.15)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

/** A four-pointed sparkle used for bridge heads, flashes and the cores of coordinates. */
export function paintSparkle(size = 128) {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const m = size / 2;
  const glow = g.createRadialGradient(m, m, 0, m, m, m);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.12, "rgba(255,255,255,0.8)");
  glow.addColorStop(0.35, "rgba(255,255,255,0.12)");
  glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = "lighter";
  for (const [w, len] of [[2.2, m], [1.2, m * 0.6]] as const) {
    for (const angle of [0, Math.PI / 2]) {
      g.save();
      g.translate(m, m);
      g.rotate(angle + (len < m ? Math.PI / 4 : 0));
      const ray = g.createLinearGradient(-len, 0, len, 0);
      ray.addColorStop(0, "rgba(255,255,255,0)");
      ray.addColorStop(0.5, "rgba(255,255,255,0.9)");
      ray.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = ray;
      g.fillRect(-len, -w / 2, len * 2, w);
      g.restore();
    }
  }
  return c;
}

/** Cloudy nebula made of many soft blobs. */
export function paintNebula(w: number, h: number, colors: string[], seed: number) {
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  g.filter = "blur(18px)";
  for (let i = 0; i < 70; i++) {
    const x = w * (0.15 + rnd() * 0.7);
    const y = h * (0.2 + rnd() * 0.6);
    const r = Math.min(w, h) * (0.06 + rnd() * 0.22);
    const color = colors[Math.floor(rnd() * colors.length)];
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color.replace("ALPHA", (0.05 + rnd() * 0.08).toFixed(3)));
    grad.addColorStop(1, color.replace("ALPHA", "0"));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = "none";
  return c;
}

/** Vertical gradient of the night sky down to the horizon. */
export function paintSky(h = 512) {
  const c = canvas(4, h);
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#020406");
  grad.addColorStop(0.55, "#06100f");
  grad.addColorStop(0.8, "#0b1a10");
  grad.addColorStop(1, "#122611");
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, h);
  return c;
}

/** The ground of the Stele Plain: dark cracked earth fading into fog. */
export function paintGround(w = 1024, h = 256) {
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#162414");
  grad.addColorStop(0.25, "#0b120a");
  grad.addColorStop(1, "#030503");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // cracks
  let s = 7;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 1;
  for (let i = 0; i < 60; i++) {
    let x = rnd() * w;
    let y = 20 + rnd() * h;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (rnd() - 0.5) * 60;
      y += rnd() * 14;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

export type SpirePaint = { rarity: number; level: number; variant: number };

/** The Beacon Spire body (without its core, which is animated separately). 240 units tall at k=1. */
export function paintSpire({ rarity, level, variant }: SpirePaint, k = 2) {
  const W = 200 * k;
  const H = 240 * k;
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.scale(k, k);
  const accent = RARITY_ACCENT[rarity] ?? LIME;
  const crack = (variant === 1 ? 13 : 5) + rarity * 2;
  const edgeX = (y: number) => 66 + ((214 - y) * 24) / 184;

  // base steps
  const steps = 3 + Math.floor(rarity / 2);
  for (let i = 0; i < steps; i++) {
    const width = 108 - i * 11;
    const y = 226 - i * 6;
    const grad = g.createLinearGradient(0, y, 0, y + 6);
    grad.addColorStop(0, "#5a6056");
    grad.addColorStop(0.25, "#353a33");
    grad.addColorStop(1, "#1c201b");
    g.fillStyle = grad;
    g.fillRect(100 - width / 2, y, width, 6);
    g.fillStyle = rarity >= 2 ? `${accent}55` : "rgba(201,255,85,0.18)";
    g.fillRect(100 - width / 2, y, width, 0.6);
  }

  const half = (side: -1 | 1) => {
    g.beginPath();
    if (side < 0) {
      g.moveTo(66, 214);
      g.lineTo(90, 30);
      g.lineTo(98, 30);
      g.quadraticCurveTo(100 - crack * 1.7, 98, 99, 212);
    } else {
      g.moveTo(134, 214);
      g.lineTo(110, 30);
      g.lineTo(102, 30);
      g.quadraticCurveTo(100 + crack * 1.7, 98, 101, 212);
    }
    g.closePath();
  };
  for (const side of [-1, 1] as const) {
    g.save();
    half(side);
    const grad = g.createLinearGradient(side < 0 ? 66 : 102, 0, side < 0 ? 100 : 134, 0);
    if (side < 0) {
      grad.addColorStop(0, "#6a7066");
      grad.addColorStop(0.35, "#454a42");
      grad.addColorStop(1, "#262a24");
    } else {
      grad.addColorStop(0, "#2c302a");
      grad.addColorStop(0.6, "#1d201b");
      grad.addColorStop(1, "#121410");
    }
    g.fillStyle = grad;
    g.fill();
    g.clip();
    // weathering speckles
    let s = 31 + side * 7 + rarity;
    const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = rnd() > 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
      g.fillRect(60 + rnd() * 80, 28 + rnd() * 190, 0.6 + rnd() * 1.4, 0.6 + rnd() * 1.4);
    }
    // vertical light from the top, dark toward the base
    const shade = g.createLinearGradient(0, 30, 0, 214);
    shade.addColorStop(0, "rgba(255,255,255,0.06)");
    shade.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = shade;
    g.fillRect(60, 28, 80, 190);
    // engraved scale ticks
    g.strokeStyle = accent;
    g.globalAlpha = rarity >= 3 ? 0.55 : 0.3;
    g.lineWidth = 0.7;
    for (let i = 0; i < 14; i++) {
      const y = 44 + i * 12;
      const x = side < 0 ? edgeX(y) + 5 : 200 - edgeX(y) - 5;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + side * -9, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // cool rim light from behind on the left edge
  g.save();
  g.shadowColor = "rgba(127,168,216,0.9)";
  g.shadowBlur = 6;
  g.strokeStyle = "rgba(160,196,240,0.55)";
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(66, 214);
  g.lineTo(90, 30);
  g.stroke();
  g.restore();

  // the crack: dark inside, glowing lime edges
  g.save();
  g.beginPath();
  g.moveTo(98, 30);
  g.quadraticCurveTo(100 - crack * 1.7, 98, 99, 212);
  g.lineTo(101, 212);
  g.quadraticCurveTo(100 + crack * 1.7, 98, 102, 30);
  g.closePath();
  g.fillStyle = "#040604";
  g.fill();
  g.shadowColor = LIME;
  g.shadowBlur = 10;
  g.strokeStyle = rarity >= 3 ? accent : "rgba(201,255,85,0.85)";
  g.lineWidth = 1.2;
  g.stroke();
  g.restore();

  // veins for higher rarities
  if (rarity >= 1) {
    g.save();
    g.shadowColor = rarity === 1 ? "#3de7e0" : accent;
    g.shadowBlur = 6;
    g.strokeStyle = rarity === 1 ? "rgba(61,231,224,0.7)" : `${accent}cc`;
    g.lineWidth = 0.9;
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(100 + side * crack * 1.0, 70);
      g.lineTo(100 + side * (crack * 1.3 + 6), 120);
      g.lineTo(100 + side * (crack * 0.9 + 10), 168);
      g.stroke();
    }
    g.restore();
  }

  // light threads holding the core
  g.save();
  g.strokeStyle = "rgba(201,255,85,0.5)";
  g.lineWidth = 0.5;
  for (const [x, y] of [[-1, 84], [1, 84], [-1, 112], [1, 112]] as const) {
    g.beginPath();
    g.moveTo(100, 98);
    g.lineTo(100 + x * crack * 1.05, y);
    g.stroke();
  }
  g.restore();

  // berths: stone arms with lit crystal platforms
  for (let i = 0; i < Math.max(1, Math.min(5, level)); i++) {
    const y = 150 + i * 12;
    const left = i % 2 === 0;
    const x = left ? edgeX(y) : 200 - edgeX(y);
    const out = left ? -18 : 18;
    g.save();
    g.strokeStyle = "#555a52";
    g.lineWidth = 3.2;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + out, y);
    g.stroke();
    g.shadowColor = LIME;
    g.shadowBlur = 8;
    g.fillStyle = "#e6ffb0";
    g.fillRect(x + out - (left ? 7 : 0), y - 1.6, 7, 3.2);
    g.restore();
  }

  // three-claw prism mount on top
  g.save();
  g.strokeStyle = "#7a8076";
  g.lineWidth = 2.2;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(100, 31);
  g.lineTo(100, 22);
  g.moveTo(100, 26);
  g.lineTo(91, 15);
  g.moveTo(100, 26);
  g.lineTo(109, 15);
  g.stroke();
  g.restore();
  return c;
}

/** The crystal core of a spire, painted white-lime so it reads as light. */
export function paintCore(variant: number, size = 96) {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const m = size / 2;
  if (variant === 1) {
    g.shadowColor = LIME;
    g.shadowBlur = 14;
    g.strokeStyle = "#e9ffc0";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(m, m, size * 0.22, 0, Math.PI * 2);
    g.stroke();
    return c;
  }
  if (variant === 2) {
    g.shadowColor = "#fff4d6";
    g.shadowBlur = 12;
    g.fillStyle = "#fff4d6";
    for (const [dx, dy] of [[-0.12, -0.16], [0.1, -0.1], [-0.1, 0.12], [0.12, 0.16]]) {
      g.save();
      g.translate(m + dx * size, m + dy * size);
      g.rotate(Math.PI / 4);
      g.fillRect(-size * 0.05, -size * 0.05, size * 0.1, size * 0.1);
      g.restore();
    }
    return c;
  }
  g.shadowColor = LIME;
  g.shadowBlur = 16;
  const grad = g.createLinearGradient(m, size * 0.15, m, size * 0.85);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.5, "#eaffb8");
  grad.addColorStop(1, "#c9ff55");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(m, size * 0.14);
  g.lineTo(m + size * 0.16, m);
  g.lineTo(m, size * 0.86);
  g.lineTo(m - size * 0.16, m);
  g.closePath();
  g.fill();
  g.shadowBlur = 0;
  g.strokeStyle = "rgba(255,255,255,0.7)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(m, size * 0.14);
  g.lineTo(m, size * 0.86);
  g.moveTo(m - size * 0.16, m);
  g.lineTo(m + size * 0.16, m);
  g.stroke();
  return c;
}

/** Small faceted shard orbiting a core. */
export function paintShard(size = 24) {
  const c = canvas(size, size);
  const g = c.getContext("2d")!;
  const m = size / 2;
  g.shadowColor = "#ffffff";
  g.shadowBlur = 6;
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.moveTo(m, 3);
  g.lineTo(size - 7, m);
  g.lineTo(m, size - 3);
  g.lineTo(7, m);
  g.closePath();
  g.fill();
  return c;
}

/** A distant stele silhouette on the horizon. */
export function paintMonolith(w = 40, h = 160) {
  const c = canvas(w, h);
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(20,32,22,0.95)");
  grad.addColorStop(1, "rgba(8,14,9,0.95)");
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(w * 0.15, h);
  g.lineTo(w * 0.38, 0);
  g.lineTo(w * 0.46, 0);
  g.lineTo(w * 0.5, h * 0.2);
  g.lineTo(w * 0.54, 0);
  g.lineTo(w * 0.62, 0);
  g.lineTo(w * 0.85, h);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(201,255,85,0.5)";
  g.beginPath();
  g.arc(w * 0.5, h * 0.36, 1.6, 0, Math.PI * 2);
  g.fill();
  return c;
}
