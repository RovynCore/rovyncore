// UI labels for the v3 preview. Traditional Chinese first; the other languages follow with the final copy pass.
import type { Choice, Outcome, StarEvent } from "@/lib/lightdive-v3/rules";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

export const LIGHT = localized(["曦光", "霧光", "晶光", "熾光", "雷光", "淵光"]);
export const LIGHT_COLOR = ["#ffd98a", "#dde6ee", "#7fd3ff", "#ff6a3d", "#a97cff", "#1fa59a"];
export const RARITY = localized(["微光", "輝脈", "澄晶", "稜光", "曜核"]);
/** Five rarity tiers, shown by the whitepaper public names, a colour (grey -> orange) and a gem that gains a corner
 *  per tier (circle, triangle, square, pentagon, hexagon). Internally they are 普通～神話. */
export const TIER = RARITY;
export const RARITY_COLOR = ["#b9c2cc", "#5fd36a", "#4aa8ff", "#b46bff", "#ff9d2e"];
export const GEM_SIDES = [0, 3, 4, 5, 6];
export const KIND = localized(["光塔", "共鳴稜鏡", "探索者"]);
export const BEAM = localized(["廣域", "聚焦", "針芒"]);
export const BEAM_HINT = localized(["穩", "標準", "搏"]);
export const RISK = localized(["穩", "中", "險", "極險", "深淵", "核心"]);
export const SLOT = ["A", "B", "C", "D"];
export const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];
export const CLUSTER_HUE = ["#c9ff55", "#3de7e0", "#b8c4ff", "#9fe8d6", "#ff8a6a", "#fff0b8"];

export const OUTCOME: Record<Outcome, string> = localized({ empty: "空手而歸", partial: "小虧", normal: "一般", good: "豐收", great: "大豐收", legend: "傳說" });
export const OUTCOME_TONE: Record<Outcome, string> = { empty: "#8a948a", partial: "#c8b08a", normal: "#e6f1ff", good: "#c9ff55", great: "#f0c766", legend: "#fff4d6" };
export const STAR: Record<StarEvent, { name: string; effect: string; color: string }> = localized({
  tide: { name: "星潮", effect: "今天一律只耗損 1 次航程", color: "#3de7e0" },
  surge: { name: "光潮", effect: "收益係數 +5%（大家都看得到）", color: "#f0c766" },
  storm: { name: "雷暴", effect: "風險升一級，出發成本 −2 個百分點", color: "#a97cff" },
  calm: { name: "靜海", effect: "風險降一級", color: "#9fe8d6" },
});
export const CHOICE: Record<Choice, { name: string; tag: string; effect: string }> = localized({
  steady: { name: "求穩", tag: "保底", effect: "這趟不會空手而歸，但最多只到豐收" },
  bold: { name: "求險", tag: "搏大", effect: "空手機率大增；大豐收 ×2.5、傳說 ×3 機率" },
  detour: { name: "繞道", tag: "護隊", effect: "這趟只耗損 1 次航程，出發成本 +2 個百分點" },
  none: { name: "順其自然", tag: "不變", effect: "照原本的勝算走" },
});

export const ERROR: Record<string, string> = localized({
  noTeam: "這座光塔還沒有探索者，先到碑原組隊。",
  teamCap: "最多同時組 5 支隊伍，先解散一支再組新的。",
  noTickets: "今天的 3 張出發令都用完了，換日後重置。",
  teamLimit: "這支隊伍今天已經出發 3 次了。",
  onBridge: "這支隊伍還在光橋上，等這趟揭曉再出發。",
  uncollected: "這支隊伍上一趟帶回的光還沒收取，先確認收取再出發。",
  tooDim: "隊伍戰力不夠這個目的地的門檻。",
  balance: "測試 RVYN 不夠。",
  cannotRenew: "這張卡不能續航（沒有停泊，或已經續航過）。",
  notOwned: "這張卡已經不在你手上。",
  onTeam: "這張卡在隊伍上，先到碑原把它拿下來。",
  docked: "停泊中的卡不能上架，先續航或讓它歸航。",
  price: "請輸入大於 0 的價格。",
  batch: "一次最多上架 20 張，至少要選 1 張。",
});

export const fmt = (n: number, digits = 2) => n.toLocaleString("zh-Hant", { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;
export const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{([^}]+)\}/g, (m, k) => (k in v ? String(v[k]) : m));
export function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
export function ago(ms: number) {
  const m = Math.floor(ms / 60_000);
  return m < 1 ? tl("剛剛") : m < 60 ? tl("{0} 分鐘前", { 0: m }) : tl("{0} 小時前", { 0: Math.floor(m / 60) });
}
