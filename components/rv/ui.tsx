"use client";
// Shared building blocks of the rv design system (app/rv.css). Pages compose these instead of inventing their own.
import { useEffect, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Locale } from "@/lib/translations";
import { api } from "@/components/platform-provider";

export type Copy4 = Record<Locale, string>;
export const pick = (locale: Locale, value: Copy4) => value[locale];

/** Eyebrow + title + one-line lead. Every section on every page starts with this. */
export function Head({ eyebrow, title, lead, center, action, level = 2, id }: { eyebrow?: string; title: ReactNode; lead?: ReactNode; center?: boolean; action?: ReactNode; level?: 1 | 2; id?: string }) {
  const H = level === 1 ? "h1" : "h2";
  const body = (
    <>
      {eyebrow && <span className="rv-eyebrow">{eyebrow}</span>}
      <H className={level === 1 ? "rv-h1" : "rv-h2"} id={id}>{title}</H>
      {lead && <p className="rv-lead">{lead}</p>}
    </>
  );
  if (action) return <div className="rv-head rv-head--row"><div>{body}</div>{action}</div>;
  return <div className={`rv-head${center ? " rv-head--center" : ""}`}>{body}</div>;
}

const copiedLabel: Copy4 = { en: "Copied", "zh-Hant": "已複製", "zh-Hans": "已复制", ko: "복사됨" };
const copyLabel: Copy4 = { en: "Copy address", "zh-Hant": "複製地址", "zh-Hans": "复制地址", ko: "주소 복사" };

/** Monospace address chip with a copy button. Shows the full address; CSS truncates on narrow screens. */
export function Address({ value, locale, href }: { value: string; locale: Locale; href?: string }) {
  const [done, setDone] = useState(false);
  return (
    <span className="rv-address">
      {href ? <a href={href} target="_blank" rel="noreferrer"><code>{value}</code></a> : <code>{value}</code>}
      <button type="button" className="rv-icon-btn" aria-label={copyLabel[locale]} title={copyLabel[locale]} onClick={() => {
        void navigator.clipboard.writeText(value).then(() => { setDone(true); toast.success(copiedLabel[locale]); window.setTimeout(() => setDone(false), 1600); });
      }}>
        {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
    </span>
  );
}

/** Adds .is-in to every .rv-reveal element as it enters the viewport (mounted once in the layout). */
export function RevealObserver() {
  useEffect(() => {
    if (!("IntersectionObserver" in window)) { document.querySelectorAll(".rv-reveal").forEach((el) => el.classList.add("is-in")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("is-in"); io.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const scan = () => document.querySelectorAll(".rv-reveal:not(.is-in)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mo.disconnect(); };
  }, []);
  return null;
}

const unitLabels: Record<Locale, [string, string, string, string]> = {
  en: ["days", "hrs", "min", "sec"], "zh-Hant": ["天", "時", "分", "秒"], "zh-Hans": ["天", "时", "分", "秒"], ko: ["일", "시", "분", "초"],
};
/** Live countdown to a unix timestamp (seconds). Renders nothing once the moment has passed. */
export function Countdown({ to, locale }: { to: number; locale: Locale }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const t = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => window.clearInterval(t); }, []);
  const left = to - now;
  if (left <= 0) return null;
  const parts = [Math.floor(left / 86400), Math.floor((left % 86400) / 3600), Math.floor((left % 3600) / 60), left % 60];
  return (
    <div className="rv-countdown" role="timer" aria-live="off">
      {parts.map((value, i) => <span key={i}>{String(value).padStart(2, "0")}<small>{unitLabels[locale][i]}</small></span>)}
    </div>
  );
}

export type SaleStatus = {
  phase: "allowlist_prep" | "allowlist_open" | "sale_open" | "sale_closed";
  effectivePhase?: string;
  purchasesOpen: boolean;
  registryOpen: boolean;
  registrationStatus: "disabled" | "scheduled" | "open" | "closed";
  registrationOpensAt: number | null;
  registrationClosesAt: number | null;
  allowlistEnforcedOnchain: boolean;
  listedCount: number | null;
};

/** Public sale-desk status, refreshed every 30 seconds. `failed` is true when the API could not be read. */
export function useSaleStatus() {
  const [status, setStatus] = useState<SaleStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try { const next = await api<SaleStatus>("rvyn/status"); if (active) { setStatus(next); setFailed(false); } }
      catch { if (active) setFailed(true); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return { status, failed };
}

/** Formats a unix timestamp in fixed UTC+8 so every visitor reads the same date as the admin set it. */
export function formatUtc8(seconds: number, locale: Locale, withTime = true) {
  return new Date(seconds * 1000).toLocaleString(locale, withTime
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Etc/GMT-8" }
    : { month: "short", day: "numeric", timeZone: "Etc/GMT-8" });
}
