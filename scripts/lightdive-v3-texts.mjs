// Builds lib/lightdive-v3/texts.ts from docs/lightdive/TEXTS-v3-draft.md, so the game text lives in one
// readable document. Run: node scripts/lightdive-v3-texts.mjs
import fs from "node:fs";

const md = fs.readFileSync("docs/lightdive/TEXTS-v3-draft.md", "utf8");
const lines = md.split(/\r?\n/);
const quotes = (s) => [...s.matchAll(/「([^」]*)」/g)].map((m) => m[1]);
const CIRCLED = "①②③④⑤⑥";
const OUT = { 空手而歸: "empty", 小虧: "partial", 一般: "normal", 豐收: "good", 大豐收: "great", 傳說: "legend" };
const EFFECT = { 求穩: "steady", 求險: "bold", 繞道: "detour", 順其自然: "none" };
const STAR = { 星潮: "tide", 光潮: "surge", 雷暴: "storm", 靜海: "calm" };

const section = (title) => {
  const start = lines.findIndex((l) => l.startsWith("## ") && l.includes(title));
  if (start < 0) throw new Error("missing section " + title);
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end);
};

// 一、星團與目的地
const clusters = [];
for (const l of section("星團與目的地")) {
  let m = l.match(/^### (.)\s*(\S+)\s+(.+?)（/);
  if (m) { clusters.push({ name: m[2], en: m[3].trim(), intro: "", destinations: [] }); continue; }
  m = l.match(/^- \*\*([A-D]) (\S+)\*\*（(\d+)）：(.+)$/);
  if (m) { clusters.at(-1).destinations.push({ name: m[2], threshold: +m[3], intro: m[4] }); continue; }
  if (clusters.length && l.trim() && !l.startsWith("#") && !clusters.at(-1).intro) clusters.at(-1).intro = l.trim();
}

// 二、出發台詞
const departures = [];
for (const l of section("出發台詞")) {
  const m = l.match(/^\*\*(.)/);
  if (m && CIRCLED.includes(m[1])) departures.push([]);
  else if (l.startsWith("- ")) departures.at(-1).push(...quotes(l));
}

// 三、星象播報
const starLines = {};
let star = null;
for (const l of section("每日星象播報")) {
  const m = l.match(/^\*\*(\S+)\*\*/);
  if (m && STAR[m[1]]) { star = STAR[m[1]]; starLines[star] = []; }
  else if (l.startsWith("- ") && star) starLines[star].push(...quotes(l));
}

// 四、Rovyn 台詞
const rovyn = { outcome: {}, quest: [] };
let key = null, sub = null;
const STATE = { "4.1": "noWallet", "4.2": "wrongNetwork", "4.3": "quest", "4.4": "docked", "4.5": "eventPending", "4.6": "outcome", "4.7": "recommend", "4.8": "claim", "4.9": "idle", "4.10": "renewal", "4.11": "unlock", "4.12": "collect" };
for (const l of section("Rovyn 台詞")) {
  let m = l.match(/^### (4\.\d+)/);
  if (m) { key = STATE[m[1]]; sub = null; if (!["outcome", "quest", "renewal"].includes(key)) rovyn[key] = []; continue; }
  if (key === "quest") {
    if (/^\d+\. /.test(l)) rovyn.quest.push([]);
    else if (l.trim().startsWith("- ")) rovyn.quest.at(-1).push(...quotes(l));
    continue;
  }
  if (key === "outcome") {
    m = l.match(/^\*\*(.+?)\*\*/);
    if (m) { sub = m[1].startsWith("多耗損") ? "wear" : OUT[m[1]]; rovyn.outcome[sub] = []; }
    else if (l.startsWith("- ") && sub) rovyn.outcome[sub].push(...quotes(l));
    continue;
  }
  if (key === "renewal") {
    m = l.match(/^\*\*(.+?)\*\*/);
    if (m) { sub = m[1].includes("續航") ? "renewed" : "homecoming"; rovyn[sub] = []; }
    else if (l.startsWith("- ") && sub) rovyn[sub].push(...quotes(l));
    continue;
  }
  if (key === "unlock") {
    if (l.startsWith("- ")) { const c = CIRCLED.indexOf(l[2]); (rovyn.unlock[c >= 0 ? c : 6] ??= []).push(...quotes(l)); }
    continue;
  }
  if (key && l.startsWith("- ")) rovyn[key].push(...quotes(l));
}
rovyn.unlock = Array.from({ length: 7 }, (_, i) => rovyn.unlock?.[i] ?? []);

// 五、航行抉擇事件卡
const cards = [];
let cardCluster = -1;
for (const l of section("航行抉擇事件卡")) {
  let m = l.match(/^### (.+)$/);
  if (m) { const c = CIRCLED.indexOf(m[1][0]); cardCluster = c; continue; }
  m = l.match(/^\*\*(.+)\*\*$/);
  if (m) { cards.push({ cluster: cardCluster, title: m[1], scene: "", options: [] }); continue; }
  m = l.match(/^- 「(.+)」（(\S+)）$/);
  if (m) { cards.at(-1).options.push({ text: m[1], choice: EFFECT[m[2]] }); continue; }
  if (cards.length && l.trim() && !cards.at(-1).scene) cards.at(-1).scene = l.trim();
}

// 六、多耗損的原因
const wearReasons = Array.from({ length: 6 }, () => []);
for (const l of section("多耗損的原因")) {
  const m = l.match(/^- \*\*(.)/);
  if (m && CIRCLED.includes(m[1])) wearReasons[CIRCLED.indexOf(m[1])] = quotes(l);
}

// 七、航行日誌
const logs = {};
let dest = null;
for (const l of section("航行日誌")) {
  let m = l.match(/^\*\*(\S+)\*\*$/);
  if (m) { dest = m[1]; logs[dest] = {}; continue; }
  m = l.match(/^- (\S+?)：(.+)$/);
  if (m && dest && OUT[m[1]]) logs[dest][OUT[m[1]]] = quotes(m[2]);
}

// 八、航程文本
const LIGHT_NAMES = ["曦光", "霧光", "晶光", "熾光", "雷光", "淵光"];
// 10-21: by destination, the team's state, the readings (empty-handed chance), attunement, deep dives, approach by
// cluster and the omen at the reveal
const PART = { 啟程: "start", 途中: "travel", "途中（依目的地）": "place", 探索者: "seeker", 星象: "star", 抉擇之後: "after", 接近: "approach", "接近（依星團）": "near", 收束: "closing", 隊伍狀態: "state", 讀數: "reading", 同頻: "attuned", 深潛: "deep", 揭曉前兆: "omen" };
const TEAM_STATE = { 跟著光橋: "echo", 今日首航: "first", 深潛: "deep", 燈油: "oil", 星圖殘頁: "chart", 默契: "bond", 一般: "plain" };
const READING = { 穩: "steady", 中: "even", 險: "hard" };
const OMEN = { ...OUT, 回航: "back" };
const six = () => Array.from({ length: 6 }, () => []);
const voyage = { start: [], travel: six(), place: Array.from({ length: 24 }, () => []), seeker: six(), star: {}, after: {}, approach: [], near: six(), closing: [], state: {}, reading: {}, attuned: six(), deep: six(), omen: {} };
let part = null, slot = null;
for (const l of section("航程文本")) {
  let m = l.match(/^### (.+)$/);
  if (m) { const h = m[1].trim(); part = PART[h] ?? PART[h.split("（")[0].trim()] ?? null; slot = null; continue; }
  m = l.match(/^\*\*(.+?)\*\*$/);
  if (m && part) {
    const t = m[1];
    if (part === "travel" || part === "near" || part === "deep") slot = CIRCLED.indexOf(t[0]);
    else if (part === "place") slot = clusters.flatMap((c) => c.destinations.map((d) => d.name)).indexOf(t);
    else if (part === "seeker" || part === "attuned") slot = LIGHT_NAMES.indexOf(t);
    else if (part === "star") voyage.star[(slot = STAR[t])] = [];
    else if (part === "after") voyage.after[(slot = EFFECT[t])] = [];
    else if (part === "state") voyage.state[(slot = TEAM_STATE[t])] = [];
    else if (part === "reading") voyage.reading[(slot = READING[t])] = [];
    else if (part === "omen") voyage.omen[(slot = OMEN[t])] = [];
    if (slot === undefined || slot === -1) throw new Error(`unknown heading ${t} in ${part}`);
    continue;
  }
  if (!part || !l.startsWith("- ")) continue;
  if (part === "start" || part === "approach" || part === "closing") voyage[part].push(...quotes(l));
  else voyage[part][slot].push(...quotes(l));
}

// checks
const names = clusters.flatMap((c) => c.destinations.map((d) => d.name));
if (clusters.length !== 6 || names.length !== 24) throw new Error(`expected 6 clusters and 24 destinations, got ${clusters.length} / ${names.length}`);
for (const n of names) if (!logs[n] || Object.keys(logs[n]).length < 5) throw new Error("missing logs for " + n);
if (departures.length !== 6 || wearReasons[5].length === 0) throw new Error("departure or wear text missing");
if ([...voyage.travel, ...voyage.seeker, ...voyage.place, ...voyage.near, ...voyage.deep].some((x) => x.length < 3) || voyage.attuned.some((x) => x.length < 2) || Object.keys(voyage.state).length !== 7 || Object.keys(voyage.reading).length !== 3 || Object.keys(voyage.omen).length !== 7 || Object.keys(voyage.star).length !== 4 || Object.keys(voyage.after).length !== 4 || !voyage.start.length || !voyage.approach.length || !voyage.closing.length) throw new Error("voyage text missing");
for (const c of cards) if (!c.scene || c.options.length < 2 || c.options.some((o) => !o.choice)) throw new Error("bad event card " + c.title);

const data = { clusters, departures, starLines, rovyn, cards, wearReasons, logs: names.map((n) => logs[n]), voyage };
const count = JSON.stringify(data).match(/"[^"]{6,}"/g).length;
const out = `// Generated by scripts/lightdive-v3-texts.mjs from docs/lightdive/TEXTS-v3-draft.md. Edit the document, then re-run.
// Traditional Chinese is the source; read through localized(), every string comes out in the game's current language
// (dictionaries in lib/lightdive-v3/i18n/).
import { localized } from "./i18n";

export const TEXTS = localized(${JSON.stringify(data, null, 1)} as const);
`;
fs.writeFileSync("lib/lightdive-v3/texts.ts", out);
console.log(`texts.ts written: ${clusters.length} clusters, ${names.length} destinations, ${cards.length} event cards, about ${count} strings`);
