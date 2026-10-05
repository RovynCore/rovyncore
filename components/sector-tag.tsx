"use client";

import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;

// Decorative section marker for the console theme: a numbered sector label with a ruler line.
export function SectorTag({ n, label, aside }: { n: string; label: Copy; aside?: string }) {
  const { locale } = useLanguage();
  return (
    <div className="sector" role="presentation">
      <span className="sector__n">SEC·{n}</span>
      <span className="sector__label">{label[locale]}</span>
      <i className="sector__rule" aria-hidden="true" />
      {aside && <span className="sector__aside" aria-hidden="true">{aside}</span>}
    </div>
  );
}
