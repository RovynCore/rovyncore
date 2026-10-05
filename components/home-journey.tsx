"use client";

import { useEffect, useRef } from "react";
import { FileSearch, Lightbulb, Rocket } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;

const copy = {
  eyebrow: { en: "THE CREATOR'S ROUTE", "zh-Hant": "創作者的路徑", "zh-Hans": "创作者的路径", ko: "크리에이터의 여정" },
  title: { en: "From an idea to a public record.", "zh-Hant": "從一個想法，走到公開紀錄。", "zh-Hans": "从一个想法，走到公开记录。", ko: "아이디어에서 공개 기록까지." },
  lead: { en: "Three clear steps. Your wallet stays in your hands, and every confirmed launch leaves a trail anyone can check.", "zh-Hant": "三個清楚的步驟。錢包始終由你掌握，確認後的發行會留下可供核對的公開紀錄。", "zh-Hans": "三个清晰的步骤。钱包始终由你掌握，确认后的发行会留下可供核对的公开记录。", ko: "세 단계로 이어집니다. 지갑은 직접 관리하고, 확인된 발행은 누구나 검증할 수 있는 공개 기록으로 남습니다." },
  idea: { en: "Shape the idea", "zh-Hant": "寫下想法", "zh-Hans": "写下想法", ko: "아이디어 구체화" },
  ideaBody: { en: "Give your token a name, symbol and fixed supply.", "zh-Hant": "為 Token 設定名稱、代號與固定供應量。", "zh-Hans": "为 Token 设置名称、代号与固定供应量。", ko: "토큰의 이름, 심볼, 고정 공급량을 정하세요." },
  launch: { en: "Launch with your wallet", "zh-Hant": "用自己的錢包發行", "zh-Hans": "用自己的钱包发行", ko: "내 지갑으로 발행" },
  launchBody: { en: "Review the details, then confirm the transaction yourself.", "zh-Hant": "先核對發行內容，再由你親自在錢包確認交易。", "zh-Hans": "先核对发行内容，再由你亲自在钱包确认交易。", ko: "내용을 검토한 뒤 직접 지갑에서 거래를 승인하세요." },
  record: { en: "Follow the record", "zh-Hant": "查看公開紀錄", "zh-Hans": "查看公开记录", ko: "공개 기록 확인" },
  recordBody: { en: "After confirmation, verify the launch origin onchain.", "zh-Hant": "交易確認後，在鏈上核對發行的起點。", "zh-Hans": "交易确认后，在链上核对发行的起点。", ko: "거래가 확인되면 온체인에서 발행 출처를 검증하세요." },
} satisfies Record<string, Copy>;

export function HomeJourney() {
  const { locale } = useLanguage();
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    section.dataset.motion = "true";
    const update = () => {
      frame = 0;
      const rect = section.getBoundingClientRect();
      const travel = window.innerHeight * 0.78 + rect.height * 0.34;
      const progress = Math.max(0, Math.min(1, (window.innerHeight * 0.78 - rect.top) / travel));
      section.style.setProperty("--journey-progress", progress.toFixed(3));
      section.dataset.step = String(progress >= 0.68 ? 3 : progress >= 0.36 ? 2 : progress >= 0.04 ? 1 : 0);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const steps = [
    { number: "01", Icon: Lightbulb, title: copy.idea[locale], body: copy.ideaBody[locale] },
    { number: "02", Icon: Rocket, title: copy.launch[locale], body: copy.launchBody[locale] },
    { number: "03", Icon: FileSearch, title: copy.record[locale], body: copy.recordBody[locale] },
  ];

  return <section ref={sectionRef} className="home-journey" aria-labelledby="home-journey-title">
    <div className="home-journey__heading">
      <span className="reboot-kicker">{copy.eyebrow[locale]}</span>
      <h2 id="home-journey-title">{copy.title[locale]}</h2>
      <p>{copy.lead[locale]}</p>
    </div>
    <div className="home-journey__track">
      {steps.map(({ number, Icon, title, body }) => <article className="home-journey__step" key={number}>
        <div className="home-journey__node"><Icon aria-hidden="true" size={24} /></div>
        <span className="home-journey__number">{number} / 03</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </article>)}
    </div>
  </section>;
}
