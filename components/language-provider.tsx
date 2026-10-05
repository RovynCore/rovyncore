"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { localeNames, translate, type Locale } from "@/lib/translations";
import { pageTitle } from "@/lib/page-titles";
import { usePathname } from "next/navigation";
const valid = (value: unknown): value is Locale =>
  typeof value === "string" && Object.hasOwn(localeNames, value);
type LanguageContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  tr: (source: string, values?: Record<string, unknown>) => string;
};
const LanguageContext = createContext<LanguageContextValue>({
  locale: "en" as Locale,
  setLocale: () => {},
  tr: (source: string, values?: Record<string, unknown>) =>
    translate(source, "en", values),
});
export const useLanguage = () => useContext(LanguageContext);
export function translateRuntime(
  source: string,
  values?: Record<string, unknown>,
) {
  const current =
    typeof document === "undefined" ? "en" : document.documentElement.lang;
  return translate(source, valid(current) ? current : "en", values);
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, update] = useState<Locale>("en");
  const pathname = usePathname();
  const setLocale = useCallback((next: Locale) => {
    if (!valid(next)) return;
    document.documentElement.lang = next;
    update(next);
    try {
      localStorage.setItem("rovyncore:language", next);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("rovyncore:language");
      if (valid(saved)) queueMicrotask(() => setLocale(saved));
    } catch {}
  }, [setLocale]);
  useEffect(() => {
    document.title = pageTitle(locale, pathname || "/");
  }, [locale, pathname]);
  const tr = useCallback(
    (source: string, values?: Record<string, unknown>) =>
      translate(source, locale, values),
    [locale],
  );
  return (
    <LanguageContext.Provider value={{ locale, setLocale, tr }}>
      {children}
    </LanguageContext.Provider>
  );
}
export function LanguagePicker() {
  const { locale, setLocale, tr } = useLanguage();
  return (
    <label className="language-picker">
      <span className="sr-only">{tr("語言")}</span>
      <select
        aria-label={tr("語言")}
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {Object.entries(localeNames).map(([value, label]) => (
          <option key={value} value={value} lang={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
