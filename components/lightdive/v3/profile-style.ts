"use client";

// 自訂檔案 (10-21): what one's own profile shows, chosen by the player — the featured title and card, the scene behind
// them, which numbers, a motto, and the order of the sections. The postcard follows the same choices. Kept on this
// device, per wallet (localStorage): anyone else who opens the profile sees its defaults.
import { useCallback, useEffect, useState } from "react";
import { CLUSTER_IMAGES, GALAXY_IMAGE } from "@/lib/lightdive-v3/credits";

export type StatKey =
  | "dives" | "places" | "deepest" | "bestMult" | "legends" | "greats" | "streak" | "summons" | "echoes" | "commissions"
  | "firsts" | "deepDives" | "deepLegends" | "turnedBack" | "maxBond" | "supplyDays" | "cards" | "titles" | "footprints" | "since";
export type SectionKey = "titles" | "footprints" | "boards";
export type Layout = "landscape" | "portrait";

export type ProfileStyle = {
  title: number | null; // index into titlesOf() (new titles are only ever appended); null = the hardest one earned
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
export const SECTIONS: SectionKey[] = ["titles", "footprints", "boards"];
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

/** One line the observer signs with (Traditional Chinese, the dictionary key). */
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

export const STYLE_DEFAULT: ProfileStyle = { title: null, card: null, scene: "card", stats: null, motto: null, order: SECTIONS, hidden: [], layout: "landscape" };

const keyOf = (address: string | null) => `lightdive:v3:profile-style:${address ? address.toLowerCase() : "preview"}`;
const EVENT = "lightdive:profile-style";

/** The saved style, cleaned of anything stale (a section renamed, a scene removed). */
export function readStyle(address: string | null): ProfileStyle {
  let saved: Partial<ProfileStyle> = {};
  try { saved = JSON.parse(localStorage.getItem(keyOf(address)) ?? "{}") ?? {}; } catch {}
  const s = { ...STYLE_DEFAULT, ...saved };
  const order = (Array.isArray(s.order) ? s.order : []).filter((k) => SECTIONS.includes(k));
  return {
    title: typeof s.title === "number" ? s.title : null,
    card: typeof s.card === "number" ? s.card : null,
    scene: SCENES.some((x) => x.id === s.scene) ? s.scene : "card",
    stats: Array.isArray(s.stats) && s.stats.length ? s.stats.slice(0, MAX_STATS) : null,
    motto: typeof s.motto === "number" && s.motto >= 0 && s.motto < MOTTOS.length ? s.motto : null,
    order: [...new Set([...order, ...SECTIONS])],
    hidden: (Array.isArray(s.hidden) ? s.hidden : []).filter((k) => SECTIONS.includes(k)),
    layout: s.layout === "portrait" ? "portrait" : "landscape",
  };
}

/** The style and a setter that saves it (and tells every other reader on the page, like the reveal's share image). */
export function useProfileStyle(address: string | null): [ProfileStyle, (patch: Partial<ProfileStyle> | null) => void] {
  const [style, setStyle] = useState<ProfileStyle>(STYLE_DEFAULT);
  useEffect(() => {
    const sync = () => setStyle(readStyle(address));
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, [address]);
  const update = useCallback((patch: Partial<ProfileStyle> | null) => {
    const next = patch ? { ...readStyle(address), ...patch } : STYLE_DEFAULT; // null resets
    try { localStorage.setItem(keyOf(address), JSON.stringify(next)); } catch {}
    setStyle(readStyle(address));
    window.dispatchEvent(new Event(EVENT));
  }, [address]);
  return [style, update];
}
