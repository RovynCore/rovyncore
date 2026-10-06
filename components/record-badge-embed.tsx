"use client";

import { useState } from "react";
import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";
import { badgeSnippets } from "@/lib/record-badge";
import "./record-badge-embed.css";

type Copy = Record<Locale, string>;
const L = (en: string, hant: string, hans: string, ko: string): Copy => ({ en, "zh-Hant": hant, "zh-Hans": hans, ko });

const copy = {
  eyebrow: L("EMBED", "嵌入", "嵌入", "삽입"),
  title: L("Show this record on your site", "在你的網站顯示這筆紀錄", "在你的网站显示这笔记录", "내 사이트에 이 기록 표시"),
  body: L(
    "A small image that links back to this asset's public record. It says only that a launch was confirmed, and when. It is not a safety rating, audit or endorsement.",
    "一張連回此資產公開紀錄的小圖。它只說明發射已被確認以及確認時間，不是安全評級、審計或背書。",
    "一张链回此资产公开记录的小图。它只说明发行已被确认以及确认时间，不是安全评级、审计或背书。",
    "이 자산의 공개 기록으로 연결되는 작은 이미지입니다. 발행이 확인되었다는 사실과 시점만 나타내며 안전 등급, 감사, 보증이 아닙니다.",
  ),
  html: L("HTML", "HTML", "HTML", "HTML"),
  markdown: L("Markdown", "Markdown", "Markdown", "Markdown"),
  copy: L("Copy", "複製", "复制", "복사"),
  copied: L("Copied", "已複製", "已复制", "복사됨"),
  failed: L("Could not copy. Select the text and copy it manually.", "無法自動複製，請選取文字後手動複製。", "无法自动复制，请选取文字后手动复制。", "자동 복사에 실패했습니다. 텍스트를 선택해 직접 복사하세요."),
  alt: L("Onchain Record badge preview", "鏈上紀錄徽章預覽", "链上记录徽章预览", "온체인 기록 배지 미리보기"),
  label: L("Embed code", "嵌入程式碼", "嵌入代码", "삽입 코드"),
};

type Props = { address: string; status: string };

/** Offered only for records that are confirmed; a pending or unavailable record is not promoted. */
export function RecordBadgeEmbed({ address, status }: Props) {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  const [format, setFormat] = useState<"html" | "markdown">("html");
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  if (status !== "active") return null;
  const snippets = badgeSnippets(address);
  const text = snippets[format];

  const copyText = () => {
    navigator.clipboard.writeText(text).then(
      () => setResult("copied"),
      () => setResult("failed"),
    );
  };

  return (
    <section className="rv-card rv-stack record-badge-embed" aria-labelledby="record-badge-title">
      <span className="rv-eyebrow">{t(copy.eyebrow)}</span>
      <h2 id="record-badge-title">{t(copy.title)}</h2>
      <p className="rv-caption">{t(copy.body)}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- the badge is a tiny SVG served by our own route */}
      <img src={`/badge/${address.toLowerCase()}.svg`} width={360} height={96} alt={t(copy.alt)} />
      <div className="record-badge-embed__tabs" role="group" aria-label={t(copy.label)}>
        {(["html", "markdown"] as const).map((id) => (
          <button key={id} type="button" aria-pressed={format === id} onClick={() => { setFormat(id); setResult("idle"); }}>{t(copy[id])}</button>
        ))}
      </div>
      <textarea className="record-badge-embed__code" readOnly value={text} aria-label={t(copy.label)} onFocus={(event) => event.currentTarget.select()} />
      <div className="record-badge-embed__row">
        <button type="button" className="record-badge-embed__copy" onClick={copyText}>{t(copy.copy)}</button>
        <span className="record-badge-embed__status" role="status">{result === "copied" ? t(copy.copied) : result === "failed" ? t(copy.failed) : ""}</span>
      </div>
    </section>
  );
}
