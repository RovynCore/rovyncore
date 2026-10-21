"use client";

// 觀測者明信片 (10-19 as a share card, a postcard since 10-21): the profile the player chose to show, as a postcard
// sent from the deepest place they reached. The picture side carries the scene, the featured card and the title; the
// back carries a stamp of that cluster with its postmark, a message (the motto), the chosen numbers and the sender.
// 1800x1200 landscape or 1200x1800 portrait. Honour only, like the profile itself.
import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { tl } from "@/lib/lightdive-v3/i18n";
import { GALAXY_IMAGE } from "@/lib/lightdive-v3/credits";
import { KIND, RARITY, RARITY_COLOR } from "./copy";
import { paintingOf } from "./cards";
import { Modal } from "./kit";
import type { Layout } from "./profile-style";
import type { SimNft } from "./sim";

export type Postcard = {
  title: string | null;
  card: SimNft | undefined;
  scene: string; // the picture side's image
  stats: { label: string; value: string }[]; // up to six
  motto: string | null;
  address: string | null;
  since: number | null;
  /** The deepest place reached: the postcard is sent from there. */
  place: { code: string; name: string; cluster: string; stamp: string } | null;
  dives: number;
  places: number;
  badge: string | null; // the title's badge
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const PAPER = "#0c1215", INK = "#eadfc4", GOLD = "#f0c766", LIME = "#c9ff55", DIM = "#8d9a8a";
const HUD = "'Chakra Petch', 'Segoe UI', sans-serif";
const SERIF = "'Noto Serif TC', 'Noto Serif SC', 'Noto Serif KR', 'Songti TC', 'PMingLiU', 'Batang', serif";
const SANS = "'Noto Sans TC', 'Microsoft JhengHei', 'Malgun Gothic', sans-serif";
type Rect = { x: number; y: number; w: number; h: number };

const images = new Map<string, Promise<HTMLImageElement>>();
// onload, not decode(): decode never settles in a hidden tab
const load = (src: string) => {
  if (!images.has(src)) images.set(src, new Promise((ok, no) => { const img = new Image(); img.onload = () => ok(img); img.onerror = no; img.src = src; }));
  return images.get(src)!.catch(() => null);
};

/** Splits text into lines that fit: CJK characters break anywhere, other scripts at spaces; closing punctuation
 *  never starts a line. */
function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const cjk = "⺀-鿿豈-﫿＀-￯　-〿";
  const tokens = text.match(new RegExp(`[${cjk}]|[^\\s${cjk}]+|\\s+`, "g")) ?? [];
  const lines: string[] = [];
  let line = "";
  for (const t of tokens) {
    if (line && g.measureText(line + t).width > maxW && !/^[，。、！？」』）,.!?)\s]/.test(t)) { lines.push(line.trimEnd()); line = t.trimStart(); }
    else line += t;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** The largest font size (down to `min`) at which the text fits. */
function fit(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, max: number, min: number, maxW: number) {
  let px = max;
  for (; px > min; px -= 2) { g.font = font(px); if (g.measureText(text).width <= maxW) break; }
  g.font = font(px);
  return px;
}

function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  // letterSpacing where the browser has it, otherwise plain
  const c = g as CanvasRenderingContext2D & { letterSpacing?: string };
  const before = c.letterSpacing;
  if (before !== undefined) c.letterSpacing = `${spacing}px`;
  g.fillText(text, x, y);
  if (before !== undefined) c.letterSpacing = before;
}

function rounded(g: CanvasRenderingContext2D, r: Rect, radius: number) {
  g.beginPath();
  g.roundRect(r.x, r.y, r.w, r.h, radius);
}

function cover(g: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect, focusY = 0.5) {
  const s = Math.max(r.w / img.width, r.h / img.height), iw = img.width * s, ih = img.height * s;
  g.drawImage(img, r.x + (r.w - iw) / 2, r.y + (r.h - ih) * focusY, iw, ih);
}

/** A grain of paper: faint specks, seeded by the address so a card redraws the same. */
function grain(g: CanvasRenderingContext2D, W: number, H: number, seed: number) {
  let t = seed || 1;
  const rnd = () => { t = (t + 0x6d2b79f5) | 0; let x = Math.imul(t ^ (t >>> 15), 1 | t); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  for (let i = 0; i < (W * H) / 260; i++) {
    g.fillStyle = rnd() > 0.5 ? "rgba(234,223,196,0.035)" : "rgba(0,0,0,0.18)";
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
}

// ------------------------------------------------------------------ the picture side

async function picture(g: CanvasRenderingContext2D, p: Postcard, P: Rect) {
  const tone = p.card ? RARITY_COLOR[p.card.rarity] : LIME;
  g.save();
  rounded(g, P, 16); g.clip();
  g.fillStyle = "#04080b"; g.fillRect(P.x, P.y, P.w, P.h);
  const scene = await load(p.scene);
  if (scene) cover(g, scene, P, 0.4);
  // light from above for the lettering, dark below for the title
  const top = g.createLinearGradient(0, P.y, 0, P.y + P.h * 0.45);
  top.addColorStop(0, "rgba(3,6,9,0.78)"); top.addColorStop(1, "rgba(3,6,9,0)");
  g.fillStyle = top; g.fillRect(P.x, P.y, P.w, P.h);
  const bottom = g.createLinearGradient(0, P.y + P.h * 0.5, 0, P.y + P.h);
  bottom.addColorStop(0, "rgba(3,6,9,0)"); bottom.addColorStop(1, "rgba(3,6,9,0.86)");
  g.fillStyle = bottom; g.fillRect(P.x, P.y, P.w, P.h);
  const vignette = g.createRadialGradient(P.x + P.w / 2, P.y + P.h / 2, Math.min(P.w, P.h) * 0.35, P.x + P.w / 2, P.y + P.h / 2, Math.max(P.w, P.h) * 0.75);
  vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vignette; g.fillRect(P.x, P.y, P.w, P.h);

  // the featured card, standing in the scene with its rarity's glow
  let cardLeft = P.x + P.w;
  if (p.card) {
    const art = await load(paintingOf(p.card));
    if (art) {
      const ih = P.h * 0.64, iw = (art.width / art.height) * ih;
      const x = P.x + P.w - iw - P.w * 0.04, y = P.y + P.h - ih - P.h * 0.03;
      const glow = g.createRadialGradient(x + iw / 2, y + ih * 0.55, 0, x + iw / 2, y + ih * 0.55, ih * 0.62);
      glow.addColorStop(0, `${tone}66`); glow.addColorStop(1, `${tone}00`);
      g.fillStyle = glow; g.fillRect(x - ih, y - ih * 0.3, iw + ih * 2, ih * 1.4);
      g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = 40; g.shadowOffsetY = 18;
      g.drawImage(art, x, y, iw, ih);
      g.shadowColor = "transparent"; g.shadowBlur = 0; g.shadowOffsetY = 0;
      cardLeft = x;
      // the card's name under its feet
      g.textAlign = "center"; g.fillStyle = tone; g.font = `700 24px ${SANS}`;
      g.fillText(`${RARITY[p.card.rarity]} ${KIND[p.card.kind]} #${p.card.id}`, x + iw / 2, P.y + P.h - 24);
      g.textAlign = "left";
    }
  }

  // "Greetings from …", the vintage lettering, top left
  const lx = P.x + 64, maxW = P.w - 128;
  g.fillStyle = LIME; g.font = `700 24px ${HUD}`;
  spaced(g, "LIGHTDIVE · ROVYN CORE", lx, P.y + 78, 6);
  g.fillStyle = INK; g.font = `500 36px ${SERIF}`;
  g.fillText(p.place ? tl("來自") : tl("寄自"), lx, P.y + 140);
  const name = p.place?.name ?? tl("潛光遠征");
  const px = fit(g, name, (s) => `900 ${s}px ${SERIF}`, 132, 64, maxW);
  const ny = P.y + 140 + px * 1.02;
  const gold = g.createLinearGradient(0, ny - px, 0, ny);
  gold.addColorStop(0, "#fff4d6"); gold.addColorStop(0.55, GOLD); gold.addColorStop(1, "#b9852f");
  g.lineWidth = 10; g.strokeStyle = "rgba(3,6,9,0.55)"; g.lineJoin = "round"; g.strokeText(name, lx, ny);
  g.fillStyle = gold; g.fillText(name, lx, ny);
  if (p.place) {
    g.fillStyle = "rgba(234,223,196,0.86)"; g.font = `600 30px ${HUD}`;
    spaced(g, `${p.place.code}  ·  ${p.place.cluster}`, lx + 4, ny + 54, 3);
  }

  // the title, as a gold plate low on the left
  const label = tl("代表稱號");
  const title = p.title ?? tl("還沒有稱號");
  const plateMax = Math.min(P.w * 0.6, cardLeft - lx - 24);
  const tpx = fit(g, title, (s) => `800 ${s}px ${SERIF}`, 60, 30, plateMax - 64);
  const tw = Math.min(plateMax, g.measureText(title).width + 64);
  const badge = p.title && p.badge ? await load(p.badge) : null;
  const bw = badge ? tpx + 40 : 0; // the badge sits at the plate's left end
  const plate = { x: lx - 8, y: P.y + P.h - 90 - tpx - 44, w: Math.min(plateMax, tw + bw), h: tpx + 62 };
  g.fillStyle = "rgba(10,12,10,0.62)"; rounded(g, plate, 12); g.fill();
  g.strokeStyle = "rgba(240,199,102,0.8)"; g.lineWidth = 2; rounded(g, plate, 12); g.stroke();
  g.strokeStyle = "rgba(240,199,102,0.3)"; g.lineWidth = 1; rounded(g, { x: plate.x + 7, y: plate.y + 7, w: plate.w - 14, h: plate.h - 14 }, 8); g.stroke();
  if (badge) g.drawImage(badge, plate.x + 14, plate.y + (plate.h - (tpx + 30)) / 2, tpx + 30, tpx + 30);
  g.fillStyle = p.title ? GOLD : DIM; g.fillText(title, plate.x + 32 + bw, plate.y + tpx + 18, plate.w - 64 - bw);
  g.fillStyle = "rgba(234,223,196,0.75)"; g.font = `700 20px ${SANS}`;
  spaced(g, label, plate.x + 4, plate.y - 16, 4);
  g.restore();

  // a photo's thin border
  g.strokeStyle = "rgba(255,255,255,0.16)"; g.lineWidth = 2;
  rounded(g, { x: P.x + 12, y: P.y + 12, w: P.w - 24, h: P.h - 24 }, 10); g.stroke();
}

// ------------------------------------------------------------------ the back

async function stamp(g: CanvasRenderingContext2D, p: Postcard, S: Rect) {
  // cream paper with a cluster's picture, perforated by holes of the card's own paper
  g.save();
  g.shadowColor = "rgba(0,0,0,0.5)"; g.shadowBlur = 16; g.shadowOffsetY = 6;
  g.fillStyle = "#e9e0c8"; g.fillRect(S.x, S.y, S.w, S.h);
  g.restore();
  const inner = { x: S.x + 14, y: S.y + 14, w: S.w - 28, h: S.h - 62 };
  const img = await load(p.place?.stamp ?? GALAXY_IMAGE.src);
  g.save(); g.beginPath(); g.rect(inner.x, inner.y, inner.w, inner.h); g.clip();
  if (img) cover(g, img, inner);
  g.restore();
  g.strokeStyle = "rgba(20,24,20,0.5)"; g.lineWidth = 1.5; g.strokeRect(inner.x, inner.y, inner.w, inner.h);
  g.fillStyle = "#fff4d6"; g.font = `800 40px ${SANS}`;
  g.shadowColor = "rgba(0,0,0,0.7)"; g.shadowBlur = 8;
  g.fillText(p.place?.code.slice(0, 1) ?? "✦", inner.x + 10, inner.y + 46);
  g.shadowColor = "transparent"; g.shadowBlur = 0;
  g.fillStyle = "#22302a"; g.font = `700 18px ${HUD}`; g.textAlign = "center";
  spaced(g, "LIGHTDIVE", S.x + S.w / 2, S.y + S.h - 20, 5);
  g.textAlign = "left";
  g.fillStyle = PAPER;
  const hole = 6, step = 17;
  for (let x = S.x + step / 2; x < S.x + S.w; x += step) { g.beginPath(); g.arc(x, S.y, hole, 0, Math.PI * 2); g.arc(x, S.y + S.h, hole, 0, Math.PI * 2); g.fill(); }
  for (let y = S.y + step / 2; y < S.y + S.h; y += step) { g.beginPath(); g.arc(S.x, y, hole, 0, Math.PI * 2); g.arc(S.x + S.w, y, hole, 0, Math.PI * 2); g.fill(); }
}

function postmark(g: CanvasRenderingContext2D, p: Postcard, cx: number, cy: number, r: number, wavesTo: number) {
  const ink = "rgba(234,223,196,0.62)";
  g.save();
  g.strokeStyle = ink; g.fillStyle = ink;
  g.lineWidth = 3.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r - 30, 0, Math.PI * 2); g.stroke();
  // the ring's words, around the top
  const ring = "ROVYN CORE · LIGHTDIVE · ";
  g.font = `700 17px ${HUD}`; g.textAlign = "center";
  const span = Math.PI * 1.25, start = -Math.PI / 2 - span / 2;
  [...ring].forEach((ch, i) => {
    const a = start + (i / (ring.length - 1)) * span;
    g.save(); g.translate(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16)); g.rotate(a + Math.PI / 2); g.fillText(ch, 0, 6); g.restore();
  });
  const now = new Date();
  const date = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`;
  g.font = `700 24px ${HUD}`; g.fillText(date, cx, cy + 9);
  g.font = `700 18px ${HUD}`; g.fillText(p.place?.code ?? "✦", cx, cy + r - 40);
  g.textAlign = "left";
  // the cancellation: waves running out to the left
  g.lineWidth = 3;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    for (let x = wavesTo; x <= cx - r - 6; x += 4) {
      const y = cy + i * 17 + Math.sin((x - wavesTo) / 22) * 6;
      if (x === wavesTo) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore();
}

function heading(g: CanvasRenderingContext2D, x: number, y: number) {
  g.fillStyle = INK; g.font = `700 46px ${HUD}`;
  spaced(g, "POSTCARD", x, y + 46, 10);
  g.fillStyle = DIM; g.font = `600 22px ${SANS}`;
  g.fillText(tl("觀測者的明信片"), x + 2, y + 86);
}

/** The message: the motto in a hand on ruled lines, or a line of the career, signed by the sender. */
function message(g: CanvasRenderingContext2D, p: Postcard, R: Rect) {
  const rule = 70;
  g.strokeStyle = "rgba(234,223,196,0.16)"; g.lineWidth = 1.5;
  for (let y = R.y + rule; y <= R.y + R.h - 50; y += rule) { g.beginPath(); g.moveTo(R.x, y); g.lineTo(R.x + R.w, y); g.stroke(); }
  const room = Math.floor((R.h - 50) / rule);
  const career = tl("收下 {0} 趟結果，走過 {1} 個目的地。", { 0: p.dives, 1: p.places });
  let at = 0;
  if (p.motto) {
    g.fillStyle = INK; g.font = `italic 500 44px ${SERIF}`;
    for (const line of wrap(g, p.motto, R.w - 20).slice(0, room - 1)) g.fillText(line, R.x + 8, R.y + rule * ++at - 16);
  }
  // the career in a line, under the motto (or alone)
  g.fillStyle = p.motto ? "rgba(234,223,196,0.7)" : INK; g.font = p.motto ? `500 28px ${SANS}` : `italic 500 38px ${SERIF}`;
  for (const line of wrap(g, career, R.w - 20).slice(0, room - at)) g.fillText(line, R.x + 8, R.y + rule * ++at - 18);
  g.fillStyle = GOLD; g.font = `italic 600 26px ${SERIF}`; g.textAlign = "right";
  g.fillText(`— ${p.address ? tl("觀測者 {0}", { 0: short(p.address) }) : tl("觀測者")}`, R.x + R.w - 6, R.y + R.h - 8);
  g.textAlign = "left";
}

function stats(g: CanvasRenderingContext2D, p: Postcard, R: Rect, cols: number) {
  const list = p.stats.slice(0, 6);
  const rows = Math.ceil(list.length / cols) || 1, cw = R.w / cols, ch = R.h / rows;
  list.forEach((s, i) => {
    const x = R.x + (i % cols) * cw, y = R.y + Math.floor(i / cols) * ch;
    g.strokeStyle = "rgba(234,223,196,0.18)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + cw - 16, y); g.stroke();
    g.fillStyle = DIM; g.font = `600 20px ${SANS}`; g.fillText(s.label, x, y + 32, cw - 20);
    g.fillStyle = INK; fit(g, s.value, (px) => `700 ${px}px ${HUD}`, 46, 24, cw - 24); g.fillText(s.value, x, y + 32 + 50);
  });
}

function address(g: CanvasRenderingContext2D, p: Postcard, R: Rect) {
  const lines: [string, string][] = [
    [tl("寄件"), `${p.address ? tl("觀測者 {0}", { 0: short(p.address) }) : tl("觀測者")}${p.since ? ` · ${tl("{0} 起出航", { 0: new Date(p.since).toISOString().slice(0, 10) })}` : ""}`],
    [tl("收件"), tl("每一位還在路上的觀測者")],
  ];
  const step = R.h / lines.length;
  lines.forEach(([k, v], i) => {
    const y = R.y + step * (i + 1) - 18;
    g.fillStyle = LIME; g.font = `700 18px ${SANS}`; g.fillText(k, R.x, y);
    g.fillStyle = INK; fit(g, v, (px) => `500 ${px}px ${SANS}`, 26, 16, R.w - 80); g.fillText(v, R.x + 70, y);
    g.strokeStyle = "rgba(234,223,196,0.22)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(R.x + 64, y + 14); g.lineTo(R.x + R.w, y + 14); g.stroke();
  });
}

function footer(g: CanvasRenderingContext2D, x: number, y: number) {
  const preview = typeof window !== "undefined" && window.location.pathname.includes("/preview");
  g.fillStyle = "#66745f"; g.font = `500 18px ${SANS}`;
  g.fillText(preview ? tl("ROVYN CORE · 測試版（預覽模式，結果為模擬）") : tl("ROVYN CORE · 潛光遠征測試網（測試幣，沒有價值）"), x, y);
}

export async function drawPostcard(p: Postcard, layout: Layout): Promise<HTMLCanvasElement> {
  const wide = layout === "landscape";
  const W = wide ? 1800 : 1200, H = wide ? 1200 : 1800;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  try { await Promise.all([document.fonts.load(`700 40px ${HUD}`), document.fonts.load(`900 40px ${SERIF}`, "潛光")]); } catch {}

  g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
  const seed = p.address ? parseInt(p.address.slice(2, 10), 16) : 7;
  grain(g, W, H, seed);
  // the card's edge: a fine gold frame with corner ticks
  g.strokeStyle = "rgba(240,199,102,0.38)"; g.lineWidth = 1.5; g.strokeRect(24, 24, W - 48, H - 48);
  g.strokeStyle = "rgba(240,199,102,0.75)"; g.lineWidth = 3;
  for (const [x, y, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + dy * 40); g.lineTo(x, y); g.lineTo(x + dx * 40, y); g.stroke();
  }

  if (wide) {
    const P = { x: 56, y: 56, w: 1010, h: 1088 };
    await picture(g, p, P);
    const B = { x: 1124, y: 72, w: 620, h: 1060 };
    heading(g, B.x, B.y);
    const S = { x: B.x + B.w - 196, y: B.y, w: 196, h: 240 };
    await stamp(g, p, S);
    postmark(g, p, S.x - 70, S.y + S.h - 14, 84, B.x);
    message(g, p, { x: B.x, y: B.y + 290, w: B.w, h: 300 });
    stats(g, p, { x: B.x, y: B.y + 630, w: B.w, h: 300 }, 2);
    address(g, p, { x: B.x, y: B.y + 930, w: B.w, h: 110 });
    footer(g, B.x, H - 48);
  } else {
    const P = { x: 56, y: 56, w: 1088, h: 1000 };
    await picture(g, p, P);
    const B = { x: 72, y: 1100, w: 1056, h: 640 };
    const L = { x: B.x, w: 600 }, R = { x: B.x + 650, w: B.w - 650 };
    // the postcard's dividing line
    g.strokeStyle = "rgba(234,223,196,0.2)"; g.lineWidth = 1.5; g.setLineDash([8, 10]);
    g.beginPath(); g.moveTo(R.x - 26, B.y + 10); g.lineTo(R.x - 26, B.y + B.h - 40); g.stroke(); g.setLineDash([]);
    heading(g, L.x, B.y);
    message(g, p, { x: L.x, y: B.y + 110, w: L.w, h: 230 });
    stats(g, p, { x: L.x, y: B.y + 370, w: L.w, h: 240 }, 3);
    const S = { x: R.x + R.w - 186, y: B.y, w: 186, h: 228 };
    await stamp(g, p, S);
    postmark(g, p, S.x - 64, S.y + S.h - 12, 78, R.x - 8);
    address(g, p, { x: R.x, y: B.y + 300, w: R.w, h: 220 });
    footer(g, B.x, H - 46);
  }
  return c;
}

/** The share buttons and the postcard preview: draw, look, then download or post to X with the profile's link. */
export function ProfileShare({ postcard, layout, onLayout }: { postcard: Postcard; layout: Layout; onLayout: (l: Layout) => void }) {
  const [open, setOpen] = useState(false);
  const text = postcard.title ? tl("我在《潛光遠征》的代表稱號是「{0}」。", { 0: postcard.title }) : tl("我在《潛光遠征》的觀測紀錄。");
  const url = postcard.address ? `https://www.rovyncore.com/game/lightdive#logbook=${postcard.address}` : "https://www.rovyncore.com/game/lightdive";
  const intent = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  return (
    <div className="v3-share">
      <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => setOpen(true)}><Download aria-hidden="true" />{tl("製作明信片")}</button>
      <a className="hud-btn hud-btn--ghost hud-btn--sm" href={intent} target="_blank" rel="noreferrer"><Share2 aria-hidden="true" />{tl("分享到 X")}</a>
      {open && <PostcardPreview postcard={postcard} layout={layout} onLayout={onLayout} intent={intent} onClose={() => setOpen(false)} />}
    </div>
  );
}

function PostcardPreview({ postcard, layout, onLayout, intent, onClose }: { postcard: Postcard; layout: Layout; onLayout: (l: Layout) => void; intent: string; onClose: () => void }) {
  const [shot, setShot] = useState<{ layout: Layout; url: string } | null>(null);
  useEffect(() => {
    let dead = false;
    void drawPostcard(postcard, layout).then((c) => { if (!dead) setShot({ layout, url: c.toDataURL("image/png") }); });
    return () => { dead = true; };
  }, [postcard, layout]);
  const ready = shot?.layout === layout ? shot.url : null;
  const download = () => {
    if (!ready) return;
    const a = document.createElement("a");
    a.href = ready;
    a.download = `lightdive-postcard${postcard.address ? `-${postcard.address.slice(2, 8)}` : ""}-${layout}.png`;
    a.click();
  };
  return (
    <Modal label={tl("觀測者的明信片")} onClose={onClose} className="v3-postcard">
      <h2>{tl("觀測者的明信片")}</h2>
      <p>{tl("明信片照你在「自訂檔案」裡的選擇：代表稱號、代表卡、背景、一句話，和前 {0} 項數字。郵票與郵戳是你到過最深的星團。", { 0: 6 })}</p>
      <div className="v3-seg" role="radiogroup" aria-label={tl("版面")}>
        {(["landscape", "portrait"] as Layout[]).map((l) => (
          <button key={l} type="button" role="radio" aria-checked={layout === l} className={layout === l ? "is-on" : ""} onClick={() => onLayout(l)}>{l === "landscape" ? tl("橫式 1800×1200") : tl("直式 1200×1800")}</button>
        ))}
      </div>
      <div className={`v3-postcard__frame is-${layout}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ready ? <img src={ready} alt={tl("觀測者的明信片")} /> : <span className="hud-dim">{tl("繪製中…")}</span>}
      </div>
      <div className="v3-modal__actions">
        <button type="button" className="hud-btn" onClick={download} disabled={!ready}><Download aria-hidden="true" />{tl("下載明信片")}</button>
        <a className="hud-btn hud-btn--ghost" href={intent} target="_blank" rel="noreferrer"><Share2 aria-hidden="true" />{tl("分享到 X")}</a>
      </div>
    </Modal>
  );
}
