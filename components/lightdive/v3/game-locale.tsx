"use client";

// Waits for the player's language dictionary before Lightdive renders (10-20, smaller first load). Traditional
// Chinese, the source text, needs none and renders at once; any other language loads only its own dictionary. The
// server renders after the same wait, and the browser keeps the server's page on screen while its copy loads, so a
// player never sees the game flash in another language.
import { Suspense, use, type ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import { loadLocale, localeLoaded } from "@/lib/lightdive-v3/i18n";

function Gate({ children }: { children: ReactNode }) {
  const { locale } = useLanguage();
  if (!localeLoaded(locale)) use(loadLocale(locale));
  return <>{children}</>;
}

export function GameLocale({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  return <Suspense fallback={fallback}><Gate>{children}</Gate></Suspense>;
}
