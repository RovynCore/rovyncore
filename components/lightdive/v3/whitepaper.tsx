"use client";

// 白皮書: the rules and economy of the game, laid out like the story page: sections on the left, one section at a
// time on the right. The last section read is remembered in this browser.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { WHITEPAPERS, type WpBlock } from "@/lib/lightdive-v3/whitepaper";
import { PageHead } from "../game/hud";
import { gameLocale, tl } from "@/lib/lightdive-v3/i18n";

const KEY = "lightdive:v3:whitepaper";
const COUNT = WHITEPAPERS["zh-Hant"].sections.length; // every language has the same sections

/** **bold** inside a line. */
function inline(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
}

function Block({ b }: { b: WpBlock }) {
  if (b.t === "ul") return <ul>{b.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</ul>;
  if (b.t !== "table") return b.t === "h3" ? <h3>{b.text}</h3> : <p>{inline(b.text)}</p>;
  return (
    <div className="v3-wp__table">
      <table>
        <thead><tr>{b.head.map((h, i) => <th key={i}>{inline(h)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Whitepaper() {
  const [at, setAt] = useState(() => {
    if (typeof window === "undefined") return 0;
    try { return Math.min(COUNT - 1, Number(localStorage.getItem(KEY)) || 0); } catch { return 0; }
  });
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    try { localStorage.setItem(KEY, String(at)); } catch {}
  }, [at]);
  const open = (i: number) => {
    setAt(i);
    page.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const WHITEPAPER = WHITEPAPERS[gameLocale()];
  const SECTIONS = WHITEPAPER.sections;
  const s = SECTIONS[at];
  return (
    <div className="hud-page v3-story v3-wp">
      <PageHead kicker={tl("白皮書")} icon="codex" title={WHITEPAPER.title} lead={tl("潛光遠征的規則、收益與 $RVYN 經濟。合約未經審計，內容不是投資建議。")} />
      <div className="v3-story__wrap">
        <nav className="v3-story__toc" aria-label={tl("白皮書目錄")}>
          <div>
            <h3>{tl("目錄")}</h3>
            <ol>
              {SECTIONS.map((x, i) => (
                <li key={x.title}>
                  <button type="button" className={i === at ? "is-on" : ""} aria-current={i === at ? "page" : undefined} onClick={() => open(i)}>
                    <span>{x.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <select className="hud-select v3-story__pick" value={at} onChange={(e) => open(Number(e.target.value))} aria-label={tl("選擇章節")}>
          {SECTIONS.map((x, i) => <option key={x.title} value={i}>{x.title}</option>)}
        </select>
        <article className="v3-story__page v3-wp__page" ref={page}>
          <header>
            <span className="hud-kicker"><FileText aria-hidden="true" />{tl("白皮書 v3")}</span>
            <h2>{s.title}</h2>
            <small>{tl("第 {0} / {1} 節", { 0: at + 1, 1: SECTIONS.length })}</small>
          </header>
          <div key={at} className="v3-wp__body">
            {s.blocks.map((b, i) => <Block key={i} b={b} />)}
          </div>
          <footer>
            <button type="button" className="hud-btn hud-btn--ghost" disabled={at === 0} onClick={() => open(at - 1)}><ChevronLeft aria-hidden="true" />{tl("上一節")}</button>
            <i style={{ ["--k" as string]: (at + 1) / SECTIONS.length }} aria-hidden="true" />
            <button type="button" className="hud-btn hud-btn--primary" disabled={at === SECTIONS.length - 1} onClick={() => open(at + 1)}>{tl("下一節")}<ChevronRight aria-hidden="true" /></button>
          </footer>
        </article>
      </div>
    </div>
  );
}
