"use client";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { legalCopy } from "@/lib/legal-copy";
import { OWNER } from "@/packages/web3/config";
import { ReadingNav } from "@/components/workflow-motion";
const contentsLabel = { en: "On this page", "zh-Hant": "本頁目錄", "zh-Hans": "本页目录", ko: "페이지 목차" };
export default function Legal() {
  const { locale, tr } = useLanguage();
  const copy = legalCopy[locale];
  return (
    <main className="workspace legal" lang={locale}>
      <header className="legal__heading">
        <div className="eyebrow">ROVYN CORE</div><h1>{copy.title}</h1>
      </header>
      <div className="legal__layout">
        <aside className="legal__sidebar">
          <ReadingNav className="legal__contents" label={contentsLabel[locale]}>
            <strong>{contentsLabel[locale]}</strong>
            {copy.sections.map(([title], index) => <a key={title} href={`#legal-section-${index + 1}`}><span>{String(index + 1).padStart(2, "0")}</span>{title}</a>)}
          </ReadingNav>
          <div className="legal__operator">
            <a href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">@RovynCORE ↗</a>
            <p>{tr("管理錢包")}</p><code>{OWNER}</code>
          </div>
        </aside>
        <div className="legal__body">
          {copy.sections.map(([title, body], index) => <section key={title} id={`legal-section-${index + 1}`} aria-labelledby={`legal-title-${index + 1}`}>
            <span className="legal__section-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <h2 id={`legal-title-${index + 1}`}>{title}</h2><p>{body}</p>
          </section>)}
          <Link className="secondary" href="/onchain-record">{tr("查看鏈上紀錄")}</Link>
        </div>
      </div>
    </main>
  );
}
