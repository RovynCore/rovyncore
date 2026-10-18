// Turns the founder's final art (docs/lightdive/art/incoming/**) into the files the game loads (public/lightdive/).
// Run again whenever new art arrives:
//   node scripts/lightdive-art-webp.mjs
// Cards are transparent 1024x1366; card backs 1400x2000; banners 1920x1080; characters 1000x1220 transparent;
// backgrounds 2560x1440; supply icons 512x512 transparent; the share and link-preview images 1200x630.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const IN = "docs/lightdive/art/incoming";
const OUT = "public/lightdive";
const JOBS = [
  // 600 px tall covers the largest card on screen at 2x density; alpha kept
  { dir: "card", match: /^(seeker-l[0-5]-r[0-4]|spire-r[0-4]|prism-b[0-2]-r[0-4])\.png$/, out: "cards", resize: { height: 600 }, webp: { quality: 82, alphaQuality: 90 } },
  { dir: "back", match: /^(spire|prism|seeker)\.png$/, out: "back", resize: { width: 640 }, webp: { quality: 84 } },
  { dir: "banner", match: /^(spire|prism|seeker)\.png$/, out: "banner", resize: { width: 1600 }, webp: { quality: 80 } },
  { dir: "npc", match: /^(du|rovyn)-(?!face).*\.png$/, out: "npc", resize: { height: 900 }, webp: { quality: 84, alphaQuality: 90 } },
  { dir: "npc", match: /^du-face\.png$/, out: "npc", resize: { width: 320 }, webp: { quality: 84 } },
  { dir: "misc", match: /^(galaxy|cluster-[1-6])\.png$/, out: "space", resize: { width: 1920 }, webp: { quality: 78 } },
  { dir: "misc", match: /^light-bg-.*\.png$/, out: "bg", resize: { width: 1920 }, webp: { quality: 80 } },
  { dir: "misc", match: /^(lamp-oil|star-chart-fragment)\.png$/, out: "items", resize: { width: 256 }, webp: { quality: 86, alphaQuality: 92 } },
  { dir: "misc", match: /^share-bg\.png$/, out: ".", webp: { quality: 86 } },
  // link previews must be a format every crawler reads
  { dir: "misc", match: /^og-lightdive\.png$/, out: ".", jpeg: { quality: 86, mozjpeg: true } },
];

let total = 0;
for (const job of JOBS) {
  const src = path.join(IN, job.dir);
  if (!fs.existsSync(src)) continue;
  const dest = path.join(OUT, job.out);
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src).filter((f) => job.match.test(f)).sort()) {
    const ext = job.jpeg ? ".jpg" : ".webp";
    const target = path.join(dest, file.replace(/\.png$/, ext));
    let img = sharp(path.join(src, file));
    if (job.resize) img = img.resize(job.resize);
    img = job.jpeg ? img.jpeg(job.jpeg) : img.webp({ effort: 6, ...job.webp });
    await img.toFile(target);
    const kb = Math.round(fs.statSync(target).size / 1024);
    total += kb;
    console.log(target, kb, "KB");
  }
}
console.log("total", total, "KB");
