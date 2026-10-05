"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check, Circle, LoaderCircle, Orbit } from "lucide-react";
import { useLanguage } from "./language-provider";
import { TokenAvatar } from "./token-actions";

const copy = {
  en: { preview: "Your token, taking shape", draft: "Live draft · not issued", name: "Your token name", supply: "Fixed supply", hint: "Updates as you fill in the details. Review everything before signing.", prepare: "Wallet review", submitted: "Transaction submitted", confirmed: "Block confirmations", record: "Public record ready", waiting: "Waiting for confirmation data", progress: "Launch progress", working: "Operation in progress", done: "Operation completed", failed: "Operation needs attention" },
  "zh-Hant": { preview: "讓你的 Token 逐步成形", draft: "即時草稿 · 尚未發行", name: "你的 Token 名稱", supply: "固定供應量", hint: "隨填寫資料更新；簽署前仍需核對完整內容。", prepare: "錢包核對", submitted: "交易已提交", confirmed: "區塊確認", record: "公開紀錄已建立", waiting: "等待區塊確認資料", progress: "發行進度", working: "操作處理中", done: "操作已完成", failed: "操作需要處理" },
  "zh-Hans": { preview: "让你的 Token 逐步成形", draft: "实时草稿 · 尚未发行", name: "你的 Token 名称", supply: "固定供应量", hint: "随填写资料更新；签署前仍需核对完整内容。", prepare: "钱包核对", submitted: "交易已提交", confirmed: "区块确认", record: "公开记录已建立", waiting: "等待区块确认资料", progress: "发行进度", working: "操作处理中", done: "操作已完成", failed: "操作需要处理" },
  ko: { preview: "완성되어 가는 나의 토큰", draft: "실시간 초안 · 아직 발행되지 않음", name: "토큰 이름", supply: "고정 공급량", hint: "입력한 내용이 반영됩니다. 서명 전에 모든 정보를 확인하세요.", prepare: "지갑에서 검토", submitted: "거래 제출됨", confirmed: "블록 확인", record: "공개 기록 생성됨", waiting: "블록 확인 데이터 대기 중", progress: "발행 진행 상태", working: "작업 처리 중", done: "작업 완료", failed: "작업 확인 필요" },
};

export function TokenDraftPreview({ name, symbol, supply, logo }: { name: string; symbol: string; supply: string; logo: string }) {
  const { locale } = useLanguage();
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animations = Array.from(ref.current?.querySelectorAll(".token-draft-preview__identity strong, .token-draft-preview__supply strong") ?? []).map(element => element.animate([{ opacity: .55 }, { opacity: 1 }], { duration: 220, easing: "ease-out" }));
    return () => animations.forEach(animation => animation.cancel());
  }, [name, symbol, supply]);
  const t = copy[locale];
  const count = /^\d+$/.test(supply) && Number(supply) <= 1e12 ? Number(supply).toLocaleString(locale) : "—";
  return <section ref={ref} className="panel token-draft-preview" aria-labelledby={id}>
    <div className="workflow-eyebrow"><Orbit size={15} aria-hidden="true" />{t.draft}</div>
    <h3 id={id}>{t.preview}</h3>
    <div className="token-draft-preview__identity"><TokenAvatar name={name || "Token"} logo={logo} /><div><strong>{name || t.name}</strong><span>${symbol || "TOKEN"}</span></div></div>
    <div className="token-draft-preview__supply"><span>{t.supply}</span><strong>{count}</strong></div>
    <p>{t.hint}</p>
  </section>;
}

export function LaunchProgress({ stage, confirmations, required }: { stage: "wallet" | "submitted" | "confirming" | "active"; confirmations?: number; required?: number }) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const index = { wallet: 0, submitted: 1, confirming: 2, active: 3 }[stage];
  const known = typeof confirmations === "number" && typeof required === "number" && required > 0;
  const fraction = known ? Math.max(0, Math.min(1, confirmations / required)) : 0;
  return <section className="launch-progress" aria-label={t.progress}>
    <ol>{[t.prepare, t.submitted, t.confirmed, t.record].map((label, i) => <li key={i} data-complete={i < index || stage === "active"} aria-current={i === index ? "step" : undefined}>
      <span className="launch-progress__node" aria-hidden="true">{i < index || stage === "active" ? <Check size={14} /> : i === index ? <LoaderCircle size={14} className="spin" /> : <Circle size={12} />}</span><span>{label}</span>
    </li>)}</ol>
    {stage === "confirming" && <div className="launch-progress__confirmations">
      <p role="status">{known ? `${confirmations} / ${required} · ${t.confirmed}` : t.waiting}</p>
      {known && <div className="launch-progress__track" role="progressbar" aria-label={t.confirmed} aria-valuemin={0} aria-valuemax={required} aria-valuenow={Math.min(required, Math.max(0, confirmations))}><span style={{ width: `${fraction * 100}%` }} /></div>}
    </div>}
  </section>;
}

/** Keeps content available to assistive technology and keyboard users when open. */
export function MotionDisclosure({ title, children, defaultOpen = false, className = "" }: { title: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={`motion-disclosure ${className}`} data-open={open}>
    <button className="motion-disclosure__toggle" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{title}<ChevronDown size={16} aria-hidden="true" /></button>
    <div className="motion-disclosure__body" id={id} aria-hidden={!open} inert={!open}><div>{children}</div></div>
  </div>;
}

/** A reading marker reflects actual section positions; it never hijacks scrolling. */
export function ReadingNav({ children, className, label }: { children: ReactNode; className: string; label: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const links = Array.from(nav.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    const sections = links.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1))));
    let frame = 0;
    let activeLink: HTMLAnchorElement | undefined;
    const update = () => {
      frame = 0;
      let active = 0;
      const readingLine = Math.max(160, window.innerHeight * .33);
      sections.forEach((section, i) => { if (section && section.getBoundingClientRect().top <= readingLine) active = i; });
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) active = links.length - 1;
      links.forEach((link, i) => { if (i === active) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current"); });
      // Reveal the current chapter inside the compact bar without moving the page.
      const current = links[active];
      if (current !== activeLink && current && nav.scrollWidth > nav.clientWidth) {
        const container = nav.getBoundingClientRect();
        const item = current.getBoundingClientRect();
        if (item.left < container.left + 8 || item.right > container.right - 8) {
          nav.scrollTo({ left: nav.scrollLeft + item.left - container.left - (nav.clientWidth - item.width) / 2, behavior: "instant" });
        }
      }
      activeLink = current;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    sections.forEach(section => { if (section) resize.observe(section); });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => { resize.disconnect(); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); if (frame) cancelAnimationFrame(frame); };
  }, [className]);
  return <nav ref={ref} className={`${className} reading-nav`} aria-label={label}>{children}</nav>;
}

export function OperationStatus({ busy, done, error }: { busy: boolean; done: boolean; error: boolean }) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const state = busy ? "busy" : error ? "error" : done ? "done" : "idle";
  return <div className="operation-status" data-state={state} role="status" aria-live="polite">
    {state !== "idle" && <><span aria-hidden="true">{busy ? <LoaderCircle size={16} className="spin" /> : error ? <Circle size={16} /> : <Check size={16} />}</span>{busy ? t.working : error ? t.failed : t.done}</>}
  </div>;
}
