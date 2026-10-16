// Turns the founder's final card art (docs/lightdive/art/incoming/card/*.png, transparent 1024x1366) into the WebP files
// the game loads (public/lightdive/cards/). Run again whenever new art arrives:
//   node scripts/lightdive-art-webp.mjs
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "docs/lightdive/art/incoming/card";
const OUT = "public/lightdive/cards";
fs.mkdirSync(OUT, { recursive: true });
let total = 0;
for (const file of fs.readdirSync(SRC).filter((f) => /^(seeker-l[0-5]-r[0-4]|spire-r[0-4]|prism-b[0-2]-r[0-4])\.png$/.test(f)).sort()) {
  const target = path.join(OUT, file.replace(/\.png$/, ".webp"));
  // 600 px tall covers the largest card on screen at 2x density; alpha kept
  await sharp(path.join(SRC, file)).resize({ height: 600 }).webp({ quality: 82, alphaQuality: 90, effort: 6 }).toFile(target);
  total += fs.statSync(target).size;
  console.log(target, Math.round(fs.statSync(target).size / 1024), "KB");
}
console.log("total", Math.round(total / 1024), "KB");
