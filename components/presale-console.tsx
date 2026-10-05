"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { api } from "@/components/platform-provider";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;
type SaleStatus = {
  phase: "allowlist_prep" | "allowlist_open" | "sale_open" | "sale_closed";
  purchasesOpen: boolean;
  registryOpen: boolean;
  registrationStatus: "disabled" | "scheduled" | "open" | "closed";
  registrationOpensAt: number | null;
  registrationClosesAt: number | null;
  allowlistEnforcedOnchain: boolean;
  listedCount: number | null;
};

// Only live status from the site's own sale desk plus the sale contract's fixed caps.
// No dates, raise totals or participation numbers are ever invented: missing data shows "TBA".
const copy = {
  kicker: { en: "RVYN LAUNCH CONSOLE", "zh-Hant": "RVYN 發射控制台", "zh-Hans": "RVYN 发射控制台", ko: "RVYN 런치 콘솔" },
  title: { en: "Live status, straight from the sale desk.", "zh-Hant": "預售狀態，即時同步。", "zh-Hans": "预售状态，实时同步。", ko: "프리세일 상태를 실시간으로." },
  s1: { en: "Prep", "zh-Hant": "準備", "zh-Hans": "准备", ko: "준비" },
  s2: { en: "Whitelist", "zh-Hant": "白名單", "zh-Hans": "白名单", ko: "화이트리스트" },
  s3: { en: "Presale", "zh-Hant": "預售", "zh-Hans": "预售", ko: "프리세일" },
  s4: { en: "Closed", "zh-Hant": "結束", "zh-Hans": "结束", ko: "종료" },
  now: { en: "NOW", "zh-Hant": "目前", "zh-Hans": "当前", ko: "현재" },
  registry: { en: "Whitelist registration", "zh-Hant": "白名單登記", "zh-Hans": "白名单登记", ko: "화이트리스트 신청" },
  purchases: { en: "Presale purchases", "zh-Hant": "預售購買", "zh-Hans": "预售购买", ko: "프리세일 구매" },
  listed: { en: "Wallets listed", "zh-Hant": "已列名錢包", "zh-Hans": "已列名钱包", ko: "등록된 지갑" },
  open: { en: "OPEN", "zh-Hant": "開放", "zh-Hans": "开放", ko: "열림" },
  closed: { en: "CLOSED", "zh-Hant": "關閉", "zh-Hans": "关闭", ko: "닫힘" },
  soon: { en: "SCHEDULED", "zh-Hant": "已排程", "zh-Hans": "已排程", ko: "예정" },
  tba: { en: "TBA", "zh-Hant": "待公布", "zh-Hans": "待公布", ko: "미정" },
  offline: { en: "Status offline — everything stays closed.", "zh-Hant": "狀態讀取失敗，一切維持關閉。", "zh-Hans": "状态读取失败，一切保持关闭。", ko: "상태를 읽을 수 없어 모두 닫혀 있습니다." },
  opensIn: { en: "Opens in", "zh-Hant": "開放倒數", "zh-Hans": "开放倒计时", ko: "시작까지" },
  closesIn: { en: "Closes in", "zh-Hant": "截止倒數", "zh-Hans": "截止倒计时", ko: "마감까지" },
  noDate: { en: "No date announced", "zh-Hant": "尚未公布日期", "zh-Hans": "尚未公布日期", ko: "일정 미공개" },
  allocTitle: { en: "10,000,000 RVYN · contract caps", "zh-Hant": "10,000,000 RVYN・合約上限", "zh-Hans": "10,000,000 RVYN・合约上限", ko: "10,000,000 RVYN · 계약 상한" },
  allocNote: { en: "Caps defined in the sale contract. Not a record of tokens sold or distributed.", "zh-Hant": "取自預售合約定義的上限，並非已售出或已分發的紀錄。", "zh-Hans": "取自预售合约定义的上限，并非已售出或已分发的记录。", ko: "판매 계약에 정의된 상한이며 판매·배분 기록이 아닙니다." },
  cta: { en: "Open the sale desk", "zh-Hant": "前往預售頁", "zh-Hans": "前往预售页", ko: "프리세일 페이지로" },
  days: { en: "d", "zh-Hant": "天", "zh-Hans": "天", ko: "일" },
} satisfies Record<string, Copy>;

const ALLOCATIONS: Array<{ key: string; label: Copy; amount: number; color: string }> = [
  { key: "lp", label: { en: "Liquidity", "zh-Hant": "流動性", "zh-Hans": "流动性", ko: "유동성" }, amount: 5_000_000, color: "#c9ff55" },
  { key: "sale", label: { en: "Presale", "zh-Hant": "預售", "zh-Hans": "预售", ko: "프리세일" }, amount: 1_000_000, color: "#6ee7b7" },
  { key: "team", label: { en: "Team (vested)", "zh-Hant": "團隊（分期解鎖）", "zh-Hans": "团队（分期解锁）", ko: "팀 (베스팅)" }, amount: 1_000_000, color: "#38bdf8" },
  { key: "product", label: { en: "Product", "zh-Hant": "產品", "zh-Hans": "产品", ko: "제품" }, amount: 1_000_000, color: "#a78bfa" },
  { key: "community", label: { en: "Community", "zh-Hant": "社群", "zh-Hans": "社群", ko: "커뮤니티" }, amount: 1_000_000, color: "#f0abfc" },
  { key: "manager", label: { en: "Manager", "zh-Hant": "管理", "zh-Hans": "管理", ko: "매니저" }, amount: 500_000, color: "#fbbf24" },
  { key: "airdrop", label: { en: "Airdrop", "zh-Hant": "空投", "zh-Hans": "空投", ko: "에어드롭" }, amount: 500_000, color: "#fb7185" },
];
const STAGES = ["allowlist_prep", "allowlist_open", "sale_open", "sale_closed"] as const;

function countdown(seconds: number, dayUnit: string) {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${d > 0 ? `${d}${dayUnit} ` : ""}${h}:${m}:${sec}`;
}

export function PresaleConsole({ variant = "page" }: { variant?: "page" | "home" }) {
  const { locale } = useLanguage();
  const t = (value: Copy) => value[locale];
  const [status, setStatus] = useState<SaleStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [hot, setHot] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = () => api<SaleStatus>("rvyn/status").then((s) => { if (active) { setStatus(s); setFailed(false); } }).catch(() => { if (active) { setStatus(null); setFailed(true); } });
    void load();
    const poll = window.setInterval(() => void load(), 30000);
    const tick = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => { active = false; window.clearInterval(poll); window.clearInterval(tick); };
  }, []);

  const stageIndex = status ? STAGES.indexOf(status.phase) : -1;
  const stageLabels = [copy.s1, copy.s2, copy.s3, copy.s4];
  const progress = stageIndex < 0 ? 0 : (stageIndex + 1) / STAGES.length;
  const RING = 2 * Math.PI * 52;

  const timer = useMemo(() => {
    if (!status) return null;
    if (status.registrationStatus === "scheduled" && status.registrationOpensAt && status.registrationOpensAt > now) return { label: copy.opensIn, value: countdown(status.registrationOpensAt - now, copy.days[locale]) };
    if (status.registryOpen && status.registrationClosesAt && status.registrationClosesAt > now) return { label: copy.closesIn, value: countdown(status.registrationClosesAt - now, copy.days[locale]) };
    return null;
  }, [status, now, locale]);

  const registryState = !status ? copy.closed : status.registryOpen ? copy.open : status.registrationStatus === "scheduled" ? copy.soon : copy.closed;
  const registryLive = Boolean(status?.registryOpen);
  const purchasesLive = Boolean(status?.purchasesOpen);

  const total = ALLOCATIONS.reduce((s, a) => s + a.amount, 0);
  const circumference = 2 * Math.PI * 70;
  const segments = ALLOCATIONS.map((a, i) => ({
    ...a,
    len: (a.amount / total) * circumference,
    offset: (ALLOCATIONS.slice(0, i).reduce((s, x) => s + x.amount, 0) / total) * circumference,
  }));
  const hotSeg = segments.find((s) => s.key === hot);

  return (
    <section className={`plc plc--${variant}`} aria-labelledby={`plc-title-${variant}`}>
      <header className="plc__head">
        <span className="plc__kicker"><i aria-hidden="true" />{t(copy.kicker)}</span>
        <h2 id={`plc-title-${variant}`}>{t(copy.title)}</h2>
      </header>

      <ol className="plc__track" aria-label="stages">
        {STAGES.map((stage, i) => {
          const state = stageIndex < 0 ? "idle" : i < stageIndex ? "done" : i === stageIndex ? "now" : "next";
          return (
            <li key={stage} className={`plc__stage plc__stage--${state}`} aria-current={state === "now" ? "step" : undefined}>
              <span className="plc__node"><b>{String(i + 1).padStart(2, "0")}</b></span>
              <span className="plc__stage-label">{t(stageLabels[i])}</span>
              {state === "now" && <em>{t(copy.now)}</em>}
            </li>
          );
        })}
      </ol>

      <div className="plc__grid">
        <div className="plc__panel plc__panel--status">
          <div className="plc__gauge" role="img" aria-label={`${Math.round(progress * 100)}%`}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="plc__gauge-bg" cx="60" cy="60" r="52" />
              <circle className="plc__gauge-fg" cx="60" cy="60" r="52" strokeDasharray={RING} strokeDashoffset={RING * (1 - progress)} />
              <circle className="plc__gauge-tick" cx="60" cy="60" r="58" />
            </svg>
            <div className="plc__gauge-core">
              <strong>{stageIndex < 0 ? "--" : `${stageIndex + 1}/4`}</strong>
              <span>{stageIndex < 0 ? "" : t(stageLabels[stageIndex])}</span>
            </div>
          </div>
          <dl className="plc__readout">
            <div><dt>{t(copy.registry)}</dt><dd className={registryLive ? "is-live" : ""}><i aria-hidden="true" />{t(registryState)}</dd></div>
            <div><dt>{t(copy.purchases)}</dt><dd className={purchasesLive ? "is-live" : ""}><i aria-hidden="true" />{t(purchasesLive ? copy.open : copy.closed)}</dd></div>
            <div><dt>{t(copy.listed)}</dt><dd>{status?.listedCount != null ? status.listedCount.toLocaleString(locale) : t(copy.tba)}</dd></div>
          </dl>
          <div className="plc__timer" aria-live="off">
            {timer ? (<><span>{t(timer.label)}</span><strong>{timer.value}</strong></>) : (<><span>{failed ? t(copy.offline) : t(copy.noDate)}</span><strong>--:--:--</strong></>)}
          </div>
        </div>

        <div className="plc__panel plc__panel--alloc">
          <h3>{t(copy.allocTitle)}</h3>
          <div className="plc__alloc">
            <svg viewBox="0 0 180 180" className="plc__donut" aria-hidden="true">
              <g transform="rotate(-90 90 90)">
                {segments.map((s) => (
                  <circle key={s.key} cx="90" cy="90" r="70" fill="none" stroke={s.color} strokeWidth={hot === s.key ? 20 : 14}
                    strokeDasharray={`${Math.max(0, s.len - 2)} ${2 * Math.PI * 70}`} strokeDashoffset={-s.offset}
                    opacity={hot && hot !== s.key ? 0.3 : 1} className="plc__seg" />
                ))}
              </g>
            </svg>
            <div className="plc__donut-core">
              <strong>{hotSeg ? `${((hotSeg.amount / total) * 100).toFixed(hotSeg.amount % 1_000_000 ? 1 : 0)}%` : "10M"}</strong>
              <span>{hotSeg ? t(hotSeg.label) : "RVYN"}</span>
            </div>
          </div>
          <ul className="plc__legend">
            {ALLOCATIONS.map((a) => (
              <li key={a.key} onMouseEnter={() => setHot(a.key)} onMouseLeave={() => setHot(null)} onFocus={() => setHot(a.key)} onBlur={() => setHot(null)} tabIndex={0}>
                <i style={{ background: a.color }} aria-hidden="true" />
                <span>{t(a.label)}</span>
                <b>{(a.amount / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })}M</b>
              </li>
            ))}
          </ul>
          <p className="plc__note">{t(copy.allocNote)}</p>
        </div>
      </div>

      {variant === "home" && (
        <Link className="plc__cta" href="/rvyn">{t(copy.cta)} <ArrowUpRight size={16} aria-hidden="true" /></Link>
      )}
    </section>
  );
}
