"use client";

import { ArrowUpRight } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;

// Placeholder only: nothing about gameplay, items, economy numbers or dates is announced until it is confirmed.
const copy = {
  kicker: { en: "FIRST GAME", "zh-Hant": "第一款遊戲", "zh-Hans": "第一款游戏", ko: "첫 게임" },
  title: { en: "In development.", "zh-Hant": "開發中。", "zh-Hans": "开发中。", ko: "개발 중입니다." },
  body: { en: "We will share details here once they are confirmed.", "zh-Hant": "確認後，我們會在這裡公開細節。", "zh-Hans": "确认后，我们会在这里公开细节。", ko: "확정되는 대로 이곳에서 공개합니다." },
  follow: { en: "Follow @RovynCORE", "zh-Hant": "在 X 追蹤 @RovynCORE", "zh-Hans": "在 X 关注 @RovynCORE", ko: "X에서 @RovynCORE 팔로우" },
} satisfies Record<string, Copy>;

export default function GamePage() {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  return (
    <main className="game-page game-placeholder" lang={locale}>
      <span className="game-chapter__kicker">{t(copy.kicker)}</span>
      <h1>{t(copy.title)}</h1>
      <p>{t(copy.body)}</p>
      <a className="game-chapter__primary" href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">{t(copy.follow)} <ArrowUpRight size={16} aria-hidden="true" /></a>
    </main>
  );
}
