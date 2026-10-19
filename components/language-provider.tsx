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
const COOKIE = "rovyncore-lang";
const remember = (next: Locale) => {
  try { localStorage.setItem("rovyncore:language", next); } catch {}
  // the server reads this to render the next page in the same language (no flash of English)
  document.cookie = `${COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
};
export function LanguageProvider({ children, initial = "en" }: { children: ReactNode; initial?: Locale }) {
  const [locale, update] = useState<Locale>(initial);
  const pathname = usePathname();
  const setLocale = useCallback((next: Locale) => {
    if (!valid(next)) return;
    document.documentElement.lang = next;
    update(next);
    remember(next);
  }, []);
  useEffect(() => {
    try {
      // a choice saved before the cookie existed: apply it and write the cookie for the next page
      const saved = localStorage.getItem("rovyncore:language");
      if (valid(saved) && saved !== initial) queueMicrotask(() => setLocale(saved));
      else if (!document.cookie.includes(`${COOKIE}=`) && valid(saved)) remember(saved);
    } catch {}
  }, [setLocale, initial]);
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
