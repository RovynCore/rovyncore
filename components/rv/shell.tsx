"use client";
// Site header, menus and footer. Brand first: the game and RVYN lead; the launchpad and records sit under Tools.
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { ChevronDown, Globe, Menu, Wallet, X } from "lucide-react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";

type C = Record<Locale, string>;
const L = {
  game: { en: "Game", "zh-Hant": "遊戲", "zh-Hans": "游戏", ko: "게임" },
  soon: { en: "Soon", "zh-Hant": "即將", "zh-Hans": "即将", ko: "예정" },
  tools: { en: "Tools", "zh-Hant": "工具", "zh-Hans": "工具", ko: "도구" },
  launchpad: { en: "Launchpad", "zh-Hant": "發射台", "zh-Hans": "发射台", ko: "런치패드" },
  records: { en: "Onchain Records", "zh-Hant": "鏈上紀錄", "zh-Hans": "链上记录", ko: "온체인 기록" },
  transparency: { en: "Transparency", "zh-Hant": "公開透明", "zh-Hans": "公开透明", ko: "투명성" },
  updates: { en: "Updates", "zh-Hant": "最新消息", "zh-Hans": "最新消息", ko: "소식" },
  terms: { en: "Terms & risks", "zh-Hant": "條款與風險", "zh-Hans": "条款与风险", ko: "약관·위험" },
  home: { en: "Home", "zh-Hant": "首頁", "zh-Hans": "首页", ko: "홈" },
  product: { en: "Product", "zh-Hant": "產品", "zh-Hans": "产品", ko: "제품" },
  trust: { en: "Trust & info", "zh-Hant": "信任與資訊", "zh-Hans": "信任与信息", ko: "신뢰·정보" },
  language: { en: "Language", "zh-Hant": "語言", "zh-Hans": "语言", ko: "언어" },
  openMenu: { en: "Open menu", "zh-Hant": "開啟選單", "zh-Hans": "打开菜单", ko: "메뉴 열기" },
  closeMenu: { en: "Close menu", "zh-Hant": "關閉選單", "zh-Hans": "关闭菜单", ko: "메뉴 닫기" },
  primaryNav: { en: "Primary", "zh-Hant": "主要導覽", "zh-Hans": "主要导航", ko: "주 메뉴" },
  tagline: { en: "A world in the making, with RVYN at its core. Built on Robinhood Chain, in public.", "zh-Hant": "一個正在成形的世界，以 RVYN 為核心。在 Robinhood Chain 上公開建置。", "zh-Hans": "一个正在成形的世界，以 RVYN 为核心。在 Robinhood Chain 上公开建置。", ko: "RVYN을 중심에 둔, 만들어지고 있는 세계. Robinhood Chain에서 공개적으로 만듭니다." },
  independent: { en: "Independent project · not affiliated with Robinhood Markets", "zh-Hant": "獨立營運 · 與 Robinhood Markets 無隸屬關係", "zh-Hans": "独立运营 · 与 Robinhood Markets 无隶属关系", ko: "독립 프로젝트 · Robinhood Markets와 무관" },
  risk: { en: "Unaudited · Not financial advice", "zh-Hant": "未經獨立審計 · 非投資建議", "zh-Hans": "未经独立审计 · 非投资建议", ko: "독립 감사 미실시 · 투자 조언 아님" },
} satisfies Record<string, C>;
const LANGS: Array<[Locale, string]> = [["en", "English"], ["zh-Hant", "繁體中文"], ["zh-Hans", "简体中文"], ["ko", "한국어"]];

function useActive() {
  const pathname = usePathname() || "/";
  return (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`) || (href === "/onchain-record" && pathname.startsWith("/assets/")) || (href === "/latest-info" && pathname === "/development-log");
}

/** Closes an open <details> menu when the user clicks elsewhere or presses Escape. */
function useCloseDetails() {
  useEffect(() => {
    const close = (event: Event) => {
      document.querySelectorAll<HTMLDetailsElement>("details.rv-menu[open]").forEach((menu) => {
        if (event.type === "keydown" ? (event as KeyboardEvent).key === "Escape" : !menu.contains(event.target as Node)) menu.open = false;
      });
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", close); };
  }, []);
}

export function SiteHeader({ walletLabel, onWallet, walletBusy }: { walletLabel: string; onWallet: () => void; walletBusy: boolean }) {
  const { locale, setLocale } = useLanguage();
  const active = useActive();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const burger = useRef<HTMLButtonElement>(null);
  useCloseDetails();
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); burger.current?.focus(); } };
    const wide = window.matchMedia("(min-width: 981px)");
    const onWide = () => { if (wide.matches) setOpen(false); };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); document.body.style.overflow = ""; };
  }, [open]);
  const t = (c: C) => c[locale];
  const link = (href: string, label: string, extra?: React.ReactNode) => (
    <Link href={href} className={active(href) ? "is-active" : ""} aria-current={active(href) ? "page" : undefined}>{label}{extra}</Link>
  );
  const toolsActive = active("/launchpad") || active("/onchain-record");
  return (
    <>
      <header className={`rv-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="rv-container rv-header__inner">
          <Link className="rv-brand" href="/" aria-label="ROVYN CORE">
            <Image src="/favicon.svg" alt="" width={28} height={28} priority />
            <span>ROVYN CORE</span>
          </Link>
          <nav className="rv-nav" aria-label={t(L.primaryNav)}>
            {link("/game", t(L.game), <span className="rv-nav__soon">{t(L.soon)}</span>)}
            {link("/rvyn", "RVYN")}
            <details className="rv-menu">
              <summary className={toolsActive ? "is-active" : ""} style={toolsActive ? { color: "var(--rv-text)" } : undefined}>{t(L.tools)} <ChevronDown aria-hidden="true" /></summary>
              <div className="rv-menu__panel">
                <Link href="/launchpad" aria-current={active("/launchpad") ? "true" : undefined}>{t(L.launchpad)}</Link>
                <Link href="/onchain-record" aria-current={active("/onchain-record") ? "true" : undefined}>{t(L.records)}</Link>
              </div>
            </details>
            {link("/transparency", t(L.transparency))}
            {link("/latest-info", t(L.updates))}
          </nav>
          <div className="rv-header__actions">
            <details className="rv-menu rv-lang">
              <summary aria-label={t(L.language)}><Globe aria-hidden="true" />{LANGS.find(([code]) => code === locale)?.[1]}</summary>
              <div className="rv-menu__panel">
                {LANGS.map(([code, name]) => (
                  <button key={code} type="button" aria-current={code === locale ? "true" : undefined} onClick={(event) => { setLocale(code); (event.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}>{name}</button>
                ))}
              </div>
            </details>
            <button type="button" className="rv-btn rv-btn--secondary rv-wallet-btn" onClick={onWallet} disabled={walletBusy}>
              <Wallet aria-hidden="true" />{walletLabel}
            </button>
            <button type="button" ref={burger} className="rv-burger" aria-label={open ? t(L.closeMenu) : t(L.openMenu)} aria-expanded={open} aria-controls="rv-mobile-nav" onClick={() => setOpen((value) => !value)}>
              {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      <nav id="rv-mobile-nav" className={`rv-mobile${open ? " is-open" : ""}`} aria-label={t(L.primaryNav)} hidden={!open} onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setOpen(false); }}>
        {link("/", t(L.home))}
        {link("/game", t(L.game), <span className="rv-nav__soon">{t(L.soon)}</span>)}
        {link("/rvyn", "RVYN")}
        {link("/launchpad", t(L.launchpad))}
        {link("/onchain-record", t(L.records))}
        {link("/transparency", t(L.transparency))}
        {link("/latest-info", t(L.updates))}
        {link("/legal", t(L.terms))}
        <span className="rv-mobile__group">{t(L.language)}</span>
        <div className="rv-mobile__langs">
          {LANGS.map(([code, name]) => <button key={code} type="button" aria-pressed={code === locale} onClick={() => setLocale(code)}>{name}</button>)}
        </div>
      </nav>
    </>
  );
}

export function SiteFooter() {
  const { locale } = useLanguage();
  const t = (c: C) => c[locale];
  return (
    <footer className="rv-footer">
      <div className="rv-container">
        <div className="rv-footer__top">
          <div>
            <Link className="rv-brand" href="/"><Image src="/favicon.svg" alt="" width={28} height={28} /><span>ROVYN CORE</span></Link>
            <p>{t(L.tagline)}</p>
          </div>
          <nav aria-label={t(L.product)}>
            <h2>{t(L.product)}</h2>
            <div>
              <Link href="/game">{t(L.game)}</Link>
              <Link href="/rvyn">RVYN</Link>
              <Link href="/launchpad">{t(L.launchpad)}</Link>
              <Link href="/onchain-record">{t(L.records)}</Link>
            </div>
          </nav>
          <nav aria-label={t(L.trust)}>
            <h2>{t(L.trust)}</h2>
            <div>
              <Link href="/transparency">{t(L.transparency)}</Link>
              <Link href="/latest-info">{t(L.updates)}</Link>
              <Link href="/legal">{t(L.terms)}</Link>
              <a href="https://github.com/RovynCore/rovyncore" target="_blank" rel="noreferrer">GitHub ↗</a>
              <a href="https://x.com/RovynCORE" target="_blank" rel="noreferrer">X ↗</a>
            </div>
          </nav>
        </div>
        <div className="rv-footer__base">
          <span>© 2026 ROVYN CORE · Robinhood Chain 4663</span>
          <span>{t(L.risk)}</span>
          <span>{t(L.independent)}</span>
        </div>
      </div>
    </footer>
  );
}
