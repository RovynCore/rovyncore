// Splits the Lightdive dictionary (lib/lightdive-v3/i18n/*.ts, one row per line: 繁體中文|English|简体中文|한국어) into one
// file per language, so a player downloads only their own language — and a Traditional Chinese player, whose text
// is the source, downloads none. Runs before every build (`npm run build`) and by hand after editing rows:
//   node scripts/lightdive-i18n-split.mjs            writes lib/lightdive-v3/i18n/dict/{en,zh-Hans,ko}.json
//   node scripts/lightdive-i18n-split.mjs --check    fails when the files are out of date
import fs from "node:fs";
import path from "node:path";

const DIR = "lib/lightdive-v3/i18n";
const OUT = path.join(DIR, "dict");
const rowsTs = fs.readFileSync(path.join(DIR, "rows.ts"), "utf8");
const files = Object.fromEntries([...rowsTs.matchAll(/import \{ (\w+) \} from "\.\/([\w-]+)";/g)].map((m) => [m[1], m[2]]));
const order = rowsTs.match(/ROWS: string\[\] = \[([^\]]+)\]/)[1].split(",").map((s) => s.trim()).filter(Boolean);

const dicts = { en: {}, "zh-Hans": {}, ko: {} };
for (const name of order) {
  const src = fs.readFileSync(path.join(DIR, `${files[name]}.ts`), "utf8");
  const block = src.match(new RegExp(`export const ${name} = \`([\\s\\S]*?)\`;`));
  if (!block) throw new Error(`i18n split: ${name} not found in ${files[name]}.ts`);
  for (const line of block[1].split("\n")) {
    if (!line.trim()) continue;
    const [zh, en, hans, ko] = line.split("|");
    if (!zh || en === undefined || hans === undefined || ko === undefined) throw new Error(`i18n split: bad row in ${files[name]}.ts: ${line}`);
    // a later block overrides an earlier one, as the runtime dictionary did
    dicts.en[zh] = en;
    dicts["zh-Hans"][zh] = hans;
    dicts.ko[zh] = ko;
  }
}

const check = process.argv.includes("--check");
let stale = [];
fs.mkdirSync(OUT, { recursive: true });
for (const [lang, dict] of Object.entries(dicts)) {
  const file = path.join(OUT, `${lang}.json`);
  const text = `${JSON.stringify(dict)}\n`;
  if (check) { if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== text) stale.push(file); continue; }
  fs.writeFileSync(file, text);
  console.log(`${file}: ${Object.keys(dict).length} rows, ${Math.round(text.length / 1024)} KB`);
}
if (check && stale.length) { console.error(`i18n dictionaries out of date: ${stale.join(", ")}. Run node scripts/lightdive-i18n-split.mjs`); process.exit(1); }
if (check) console.log("i18n dictionaries up to date");
