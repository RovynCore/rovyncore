// Lightdive's four languages. The Traditional Chinese text is the source and the key, as on the rest of the site;
// each other language is looked up in its own dictionary (lib/lightdive-v3/i18n/dict/<lang>.json, split from the row
// files under ./i18n/ by scripts/lightdive-i18n-split.mjs before every build). A player downloads only their own
// language's dictionary, and a Traditional Chinese player none: <GameLocale> waits for it before the game renders.
// The game follows the site's language (the header picker or the game's settings page).
import type { Locale } from "@/lib/translations";

type Lang = Exclude<Locale, "zh-Hant">;
/** Languages whose translation is complete (all four since 10-10). Others fall back to Traditional Chinese. */
export const READY: readonly Locale[] = ["zh-Hant", "zh-Hans", "en", "ko"];

const DICTS = new Map<Lang, Map<string, string>>();
const loading = new Map<Lang, Promise<void>>();
const imports: Record<Lang, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import("./i18n/dict/en.json"),
  "zh-Hans": () => import("./i18n/dict/zh-Hans.json"),
  ko: () => import("./i18n/dict/ko.json"),
};
/** Whether a language's dictionary is in (Traditional Chinese needs none). */
export const localeLoaded = (l: Locale) => l === "zh-Hant" || !READY.includes(l) || DICTS.has(l as Lang);
/** Loads a language's dictionary once (shared by every caller). */
export function loadLocale(l: Locale): Promise<void> {
  if (localeLoaded(l)) return Promise.resolve();
  const lang = l as Lang;
  let p = loading.get(lang);
  if (!p) {
    p = imports[lang]().then((m) => { DICTS.set(lang, new Map(Object.entries(m.default))); });
    loading.set(lang, p);
  }
  return p;
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
    const hit = DICTS.get(locale as Lang)?.get(source);
    if (hit) out = hit;
    else if (process.env.NODE_ENV !== "production" && /[\u4e00-\u9fff]/.test(source)) missing.add(source);
  }
  if (values) out = out.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
  // English rows write countable nouns as "pass(es)"; once every number is in, pick the right form
  return locale === "en" && !/\{[^}]+\}/.test(out) ? plurals(out) : out;
}

/** "1 Dive Pass(es)" → "1 Dive Pass", "3 day(s)" → "3 days"; with no number before it, the plural. Up to two words
 *  may sit between the number and the noun ("2 seeker summon(s)"). Callers that fill their own placeholders after
 *  tl() (Rovyn's lines) run this again once the numbers are in. */
export function plurals(text: string): string {
  if (!text.includes("(")) return text;
  return text
    .replace(/(\d[\d,]*(?:\.\d+)?)((?:\s+[A-Za-z]+){0,2}?\s+)([A-Za-z]+)\((e?s)\)/g, (_m, n: string, mid: string, noun: string, suffix: string) =>
      `${n}${mid}${noun}${n === "1" ? "" : suffix}`)
    .replace(/([A-Za-z]+)\((e?s)\)/g, "$1$2");
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
/** How many entries a loaded dictionary has (for tests). */
export const dictionarySize = (l: Lang = "en") => DICTS.get(l)?.size ?? 0;
export function translationOf(source: string, locale: Lang) {
  return DICTS.get(locale)?.get(source);
}
