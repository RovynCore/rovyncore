// Lightdive's four languages. The Traditional Chinese text is the source and the key, as on the rest of the site;
// each other language is looked up in the dictionaries under ./i18n/. The game follows the site's language (the
// header picker or the game's settings page), but a language is only switched on once its translation is complete,
// so a player never sees a page that is half one language and half another.
import type { Locale } from "@/lib/translations";
import { ROWS } from "./i18n/rows";

type Row = Partial<Record<Exclude<Locale, "zh-Hant">, string>>;
/** Languages whose translation is complete (all four since 10-10). Others fall back to Traditional Chinese. */
export const READY: readonly Locale[] = ["zh-Hant", "zh-Hans", "en", "ko"];

const DICT = new Map<string, Row>();
for (const block of ROWS) {
  for (const line of block.split("\n")) {
    if (!line.trim()) continue;
    const [src, en, hans, ko] = line.split("|");
    if (!src || en === undefined || hans === undefined || ko === undefined) throw new Error(`i18n: bad row: ${line}`);
    DICT.set(src, { en, "zh-Hans": hans, ko });
  }
}

let current: Locale = "zh-Hant";
const missing = new Set<string>();

/** Called by the game's root on every render with the site's language; returns the language actually used. */
export function syncGameLocale(site: Locale): Locale {
  current = READY.includes(site) ? site : "zh-Hant";
  return current;
}
export const gameLocale = () => current;
/** The space between two sentences: none in Chinese, one in English and Korean. */
export const gap = () => (current === "en" || current === "ko" ? " " : "");

/** Text in the current language. `{name}` placeholders are filled from `values`. */
export function tl(source: string, values?: Record<string, unknown>, locale: Locale = current): string {
  let out = source;
  if (locale !== "zh-Hant") {
    const row = DICT.get(source);
    const hit = row?.[locale];
    if (hit) out = hit;
    else if (process.env.NODE_ENV !== "production" && /[\u4e00-\u9fff]/.test(source)) missing.add(source);
  }
  return values ? out.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m)) : out;
}

/** Strings asked for in a language that has no translation yet (development only). */
export const missingStrings = () => [...missing];

const views = new WeakMap<object, unknown>();
/** A view of a copy object (constants, game texts) whose string leaves come out in the current language. */
export function localized<T extends object>(obj: T): T {
  const hit = views.get(obj);
  if (hit) return hit as T;
  const view = new Proxy(obj, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v === "string") return tl(v);
      if (v && typeof v === "object") return localized(v as object);
      return v;
    },
  });
  views.set(obj, view);
  return view;
}

/** Whether a language can be chosen in the game. */
export const isReady = (l: Locale) => READY.includes(l);
/** How many dictionary entries exist (for the check script and tests). */
export const dictionarySize = () => DICT.size;
export function translationOf(source: string, locale: Exclude<Locale, "zh-Hant">) {
  return DICT.get(source)?.[locale];
}
