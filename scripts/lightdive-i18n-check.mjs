// Lists every Lightdive string that needs a translation and reports what each language is missing.
//   node scripts/lightdive-i18n-check.mjs            summary
//   node scripts/lightdive-i18n-check.mjs --todo     also writes docs/lightdive/i18n-todo.txt (missing sources, by file)
// Sources: the first argument of tl("…") and every Chinese string inside localized(…) in components/lightdive/v3,
// and every Chinese string in lib/lightdive-v3/texts.ts. Rows live in lib/lightdive-v3/i18n/*.ts.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const CJK = /[\u4e00-\u9fff]/;
const V3 = "components/lightdive/v3";
const SKIP = new Set(["calculator.tsx"]); // admin tool, Chinese only
const sources = new Map(); // text -> Set(files)
const note = (text, file) => { if (!CJK.test(text)) return; if (!sources.has(text)) sources.set(text, new Set()); sources.get(text).add(file); };

function scan(file, everything) {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const walk = (n, inLocalized) => {
    if (ts.isCallExpression(n)) {
      const name = n.expression.getText(sf);
      if (name === "tl" && n.arguments[0] && (ts.isStringLiteral(n.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(n.arguments[0]))) note(n.arguments[0].text, file);
      if (name === "localized") { n.arguments.forEach((a) => walk(a, true)); return; }
    }
    if ((inLocalized || everything) && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) {
      const p = n.parent;
      if (!(ts.isPropertyAssignment(p) && p.name === n)) note(n.text, file);
    }
    ts.forEachChild(n, (c) => walk(c, inLocalized));
  };
  walk(sf, false);
}
for (const f of fs.readdirSync(V3)) if (/\.(tsx?)$/.test(f) && !SKIP.has(f)) scan(path.join(V3, f), false);
scan("lib/lightdive-v3/texts.ts", true);

// dictionary rows
const rows = new Map();
const problems = [];
for (const f of fs.readdirSync("lib/lightdive-v3/i18n")) {
  if (!f.endsWith(".ts") || f === "rows.ts") continue;
  const text = fs.readFileSync(path.join("lib/lightdive-v3/i18n", f), "utf8");
  for (const m of text.matchAll(/`([\s\S]*?)`/g)) {
    for (const line of m[1].split("\n")) {
      if (!line.trim()) continue;
      const parts = line.split("|");
      if (parts.length !== 4) { problems.push(`${f}: not 4 columns: ${line.slice(0, 60)}`); continue; }
      const [src, en, hans, ko] = parts;
      if (rows.has(src)) problems.push(`${f}: duplicate: ${src.slice(0, 40)}`);
      rows.set(src, { en, "zh-Hans": hans, ko });
      const ph = (s) => (s.match(/\{[^}]+\}/g) || []).sort().join(",");
      for (const [k, v] of Object.entries({ en, "zh-Hans": hans, ko })) if (v && ph(v) !== ph(src)) problems.push(`${f}: placeholders differ (${k}): ${src.slice(0, 40)}`);
    }
  }
}

const locales = ["en", "zh-Hans", "ko"];
const missing = Object.fromEntries(locales.map((l) => [l, [...sources.keys()].filter((s) => !rows.get(s)?.[l])]));
const chars = (list) => list.reduce((a, s) => a + s.length, 0);
console.log(`sources: ${sources.size} strings, ${chars([...sources.keys()])} characters; dictionary rows: ${rows.size}`);
for (const l of locales) console.log(`  ${l}: missing ${missing[l].length} (${chars(missing[l])} characters)`);
const unused = [...rows.keys()].filter((s) => !sources.has(s));
// --unused lists them (punctuation rows always show here: the source scan only collects text with Chinese in it)
if (unused.length) console.log(`  rows no longer used: ${unused.length}${process.argv.includes("--unused") ? "\n    " + unused.join("\n    ") : ""}`);
if (problems.length) { console.log("problems:"); problems.slice(0, 30).forEach((p) => console.log("  " + p)); process.exitCode = 1; }

if (process.argv.includes("--todo")) {
  const byFile = new Map();
  for (const s of missing.en) { const f = [...sources.get(s)][0]; if (!byFile.has(f)) byFile.set(f, []); byFile.get(f).push(s); }
  let out = "# Lightdive strings still missing an English translation, by first file that uses them\n";
  for (const [f, list] of [...byFile].sort()) out += `\n## ${f} (${list.length})\n` + list.map((s) => s.replace(/\n/g, "\\n")).join("\n") + "\n";
  fs.writeFileSync("docs/lightdive/i18n-todo.txt", out);
  console.log("wrote docs/lightdive/i18n-todo.txt");
}
