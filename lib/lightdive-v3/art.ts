// The 10-21 supplement art (the founder's, converted by scripts/lightdive-art-webp.mjs into public/lightdive/): a
// painting per destination, the reveal by result, the decision cards, the sky events and the title badges.
import type { Outcome, StarEvent } from "./rules";

const two = (n: number) => String(n).padStart(2, "0");
/** Destination 0..23 (①A to ⑥D). */
export const destImage = (id: number) => `/lightdive/dest/dest-${two(id)}.webp`;
export const revealImage = (o: Outcome) => `/lightdive/reveal/reveal-${o}.webp`;
/** A decision card, by its index in TEXTS.cards (the same order as the text library). */
export const eventImage = (card: number) => `/lightdive/event/event-${two(card)}.webp`;
export const skyIcon = (e: StarEvent) => `/lightdive/sky/sky-${e}.webp`;
export const skyBanner = (e: StarEvent) => `/lightdive/sky/sky-${e}-banner.webp`;
/** A title badge, by the title's index in the titles list. */
export const titleBadge = (index: number) => `/lightdive/titles/title-${two(index)}.webp`;
export const TITLE_BADGES = 20;
/** P3 (10-22): the layer below a cluster, behind a deep dive once it keeps going past its destination. */
export const deepImage = (cluster: number) => `/lightdive/deep/deep-${cluster + 1}.webp`;
/** P3: the postcard stamp of a cluster. */
export const stampImage = (cluster: number) => `/lightdive/stamp/stamp-${cluster + 1}.webp`;
/** The descent starts here (as a share of the voyage), matching the deep-descent lines in the log. */
export const DESCENT_AT = 0.47;
