// 自訂檔案 (10-21): what an observer chose to show on their profile. Shared by the game and the API, which keeps one
// row per wallet (table lightdive_profile, migration 0004) so anyone who opens the profile sees the same choices.
// Display only: nothing here touches a result or a reward.
import { CLUSTER_IMAGES, GALAXY_IMAGE } from "./credits";

export const STAT_KEYS = [
  "dives", "places", "deepest", "bestMult", "legends", "greats", "streak", "summons", "echoes", "commissions",
  "firsts", "deepDives", "deepLegends", "turnedBack", "maxBond", "supplyDays", "cards", "titles", "footprints", "since",
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export const SECTIONS = ["titles", "footprints", "boards"] as const;
export type SectionKey = (typeof SECTIONS)[number];
export type Layout = "landscape" | "portrait";

export type ProfileStyle = {
  title: number | null; // index into the titles list (new titles are only ever appended); null = the hardest one earned
  card: number | null; // a token id still in the wallet; null = the rarest
  scene: string; // a SCENES id
  stats: StatKey[] | null; // in the order shown; null = the default eight
  motto: number | null; // a MOTTOS index; null = none
  order: SectionKey[];
  hidden: SectionKey[];
  layout: Layout; // the postcard
};

export const MAX_STATS = 8;
export const POSTCARD_STATS = 6;
export const MAX_TITLES = 64; // room for titles added later
export const defaultStats = (echoes: boolean): StatKey[] =>
  ["dives", "places", "deepest", "bestMult", "legends", "streak", echoes ? "echoes" : "summons", "commissions"];

/** Scenes behind the profile and on the postcard: the card's own, the star map, the six clusters, two observatory views
 *  and the six seeker landscapes. `src` is empty for "card" (it follows the featured card). */
export type Scene = { id: string; src: string; name?: string; cluster?: number; light?: number }; // named by `name`, a cluster or a light
export const SCENES: Scene[] = [
  { id: "card", src: "", name: "卡片的場景" },
  { id: "galaxy", src: GALAXY_IMAGE.src, name: GALAXY_IMAGE.name },
  ...CLUSTER_IMAGES.map((c, i) => ({ id: `c${i}`, src: c.src, cluster: i })),
  { id: "observatory", src: "/lightdive/bg/light-bg-observatory.webp", name: "觀測站" },
  { id: "dawn", src: "/lightdive/bg/light-bg-stele-dawn.webp", name: "碑原黎明" },
  ...[0, 1, 2, 3, 4, 5].map((light) => ({ id: `l${light}`, src: `/lightdive/cards/bg/seeker-bg-l${light}.webp`, light })),
];

/** One line the observer signs with (Traditional Chinese, the dictionary key). Presets only, so nothing typed by a
 *  player is ever shown on someone else's screen. */
export const MOTTOS = [
  "光在哪裡，我就往哪裡。",
  "每一趟，都算數。",
  "霧再濃，也有回來的路。",
  "走得慢，才走得遠。",
  "替後來的人，留一座橋。",
  "今天也出航了。",
  "深處，也有光。",
  "不問收穫，只問方向。",
  "我在星冠下等你。",
  "回來，是最好的結果。",
  "知道何時回頭，也是本事。",
  "把每一個名字，都去過一次。",
];

export const STYLE_DEFAULT: ProfileStyle = { title: null, card: null, scene: "card", stats: null, motto: null, order: [...SECTIONS], hidden: [], layout: "landscape" };

const index = (x: unknown, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x < max ? x : null);

/** Any stored or posted value as a valid style: unknown fields dropped, anything out of range back to its default. */
export function cleanStyle(raw: unknown): ProfileStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const keys = (x: unknown, allowed: readonly string[]) => (Array.isArray(x) ? [...new Set(x.filter((k): k is string => typeof k === "string" && allowed.includes(k)))] : []);
  const stats = keys(s.stats, STAT_KEYS).slice(0, MAX_STATS) as StatKey[];
  const order = keys(s.order, SECTIONS) as SectionKey[];
  return {
    title: index(s.title, MAX_TITLES),
    card: typeof s.card === "number" && Number.isSafeInteger(s.card) && s.card >= 0 ? s.card : null,
    scene: SCENES.some((x) => x.id === s.scene) ? (s.scene as string) : "card",
    stats: stats.length ? stats : null,
    motto: index(s.motto, MOTTOS.length),
    order: [...new Set([...order, ...SECTIONS])],
    hidden: keys(s.hidden, SECTIONS) as SectionKey[],
    layout: s.layout === "portrait" ? "portrait" : "landscape",
  };
}
