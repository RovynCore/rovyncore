"use client";

// 故事: the novel of the world, read like a book. Contents on the left, the chapter on the right. The browser
// remembers the chapter you are on, the chapters you have read and your bookmarks. No sound on this page.
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Bookmark, BookmarkCheck, Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { CENTRED, CHAPTERS, loadStory, type Story as StoryText } from "@/lib/lightdive-v3/story";
import { PageHead } from "../game/hud";
import { gameLocale, tl } from "@/lib/lightdive-v3/i18n";
import type { Locale } from "@/lib/translations";

const KEY = "lightdive:v3:story:v2"; // v2: the rewritten novel, so old bookmarks do not point into it
const chaptersOf = (story: StoryText) => story.volumes.flatMap((v, vi) => v.chapters.map((c, ci) => ({ v: vi, c: ci, title: c.title, paras: c.paras, volume: v.title })));
const centred = (chapter: number, para: number) => CENTRED.some(([c, p]) => c === chapter && p === para);

type Mark = { at: number; para: number; time: number };
type Saved = { at: number; read: number[]; marks: Mark[] };
function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "") as Partial<Saved>;
    if (typeof s.at === "number" && Array.isArray(s.read)) return { at: s.at, read: s.read, marks: Array.isArray(s.marks) ? s.marks : [] };
  } catch {}
  return { at: 0, read: [], marks: [] };
}

export function Story() {
  // the text of the current language is loaded on demand (each language is its own chunk)
  const locale = gameLocale();
  const [text, setText] = useState<{ locale: Locale; story: StoryText } | null>(null);
  useEffect(() => {
    let live = true;
    loadStory(locale).then((story) => { if (live) setText({ locale, story }); });
    return () => { live = false; };
  }, [locale]);
  const [saved, setSaved] = useState<Saved>(() => (typeof window === "undefined" ? { at: 0, read: [], marks: [] } : load()));
  const [jump, setJump] = useState<number | null>(null); // paragraph to scroll to after a chapter opens
  const page = useRef<HTMLElement>(null);
  const paras = useRef<(HTMLParagraphElement | null)[]>([]);
  const at = Math.min(saved.at, CHAPTERS - 1);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch {}
  }, [saved]);
  useEffect(() => {
    if (jump === null) return;
    const el = jump > 0 ? paras.current[jump] : page.current;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    const t = window.setTimeout(() => setJump(null), 400);
    return () => window.clearTimeout(t);
  }, [jump, at]);
  const open = (i: number, para = 0) => {
    setSaved((s) => ({ ...s, at: i, read: s.read.includes(s.at) ? s.read : [...s.read, s.at] }));
    setJump(para);
  };
  // the first paragraph whose top is on screen is where the reader is
  const here = () => {
    const i = paras.current.findIndex((p) => p && p.getBoundingClientRect().bottom > 120);
    return Math.max(0, i);
  };
  const marked = saved.marks.find((m) => m.at === at);
  const toggleMark = () => setSaved((s) => ({
    ...s,
    marks: marked ? s.marks.filter((m) => m !== marked) : [...s.marks.filter((m) => m.at !== at), { at, para: here(), time: Date.now() }].sort((a, b) => a.at - b.at),
  }));
  const STORY = text?.locale === locale ? text.story : null;
  const LIST = useMemo(() => (STORY ? chaptersOf(STORY) : []), [STORY]);
  const ch = LIST[at];
  if (!STORY || !ch) {
    return (
      <div className="hud-page v3-story">
        <PageHead kicker={tl("故事")} icon="codex" title={tl("潛光紀")} lead={tl("讀取中…")} />
      </div>
    );
  }
  // reading time: about 500 Chinese characters or 250 words a minute
  const length = locale === "en" ? ch.paras.join(" ").split(/\s+/).length * 2 : ch.paras.join("").length;
  const minutes = Math.max(1, Math.round(length / 500));
  return (
    <div className="hud-page v3-story">
      <PageHead kicker={tl("故事")} icon="codex" title={STORY.title} lead={tl("觀測站、探索者和第一道光的故事。共 {0} 章。", { 0: CHAPTERS })} />
      <div className="v3-story__wrap">
        <nav className="v3-story__toc" aria-label={tl("目錄")}>
          {saved.marks.length > 0 && (
            <div className="v3-story__marks">
              <h3><Bookmark aria-hidden="true" />{tl("書籤")}</h3>
              <ol>
                {saved.marks.map((m) => (
                  <li key={`${m.at}-${m.time}`}>
                    <button type="button" onClick={() => open(m.at, m.para)}>
                      <span>{LIST[m.at]?.title}</span>
                      <small>{LIST[m.at]?.paras[m.para]?.slice(0, locale === "en" ? 42 : locale === "ko" ? 26 : 18)}…</small>
                    </button>
                    <button type="button" className="v3-story__unmark" aria-label={tl("移除書籤")} onClick={() => setSaved((s) => ({ ...s, marks: s.marks.filter((x) => x !== m) }))}><X aria-hidden="true" /></button>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {STORY.volumes.map((v, vi) => (
            <div key={v.title}>
              <h3>{v.title}</h3>
              <ol>
                {LIST.map((x, i) => x.v !== vi ? null : (
                  <li key={x.title}>
                    <button type="button" className={`${i === at ? "is-on" : ""}${saved.read.includes(i) ? " is-read" : ""}`} aria-current={i === at ? "page" : undefined} onClick={() => open(i)}>
                      <span>{x.title}</span>
                      {saved.marks.some((m) => m.at === i) ? <Bookmark aria-hidden="true" className="is-mark" /> : saved.read.includes(i) && i !== at ? <Check aria-hidden="true" /> : null}
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </nav>
        <select className="hud-select v3-story__pick" value={at} onChange={(e) => open(Number(e.target.value))} aria-label={tl("選擇章節")}>
          {LIST.map((x, i) => <option key={`${x.volume}${x.title}`} value={i}>{x.volume}　{x.title}{saved.marks.some((m) => m.at === i) ? tl("　🔖") : ""}</option>)}
        </select>
        <article className="v3-story__page" ref={page}>
          <header>
            <span className="hud-kicker"><BookOpen aria-hidden="true" />{ch.volume}</span>
            <h2>{ch.title}</h2>
            <small>{tl("第 {0} / {1} 章 · 約 {2} 分鐘", { 0: at + 1, 1: LIST.length, 2: minutes })}</small>
            <button type="button" className={`v3-story__mark${marked ? " is-on" : ""}`} onClick={toggleMark} aria-pressed={!!marked}>
              {marked ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{marked ? tl("已加書籤（再按一次移除）") : tl("在這裡夾書籤")}
            </button>
          </header>
          <div key={at} className="v3-story__text">
            {ch.paras.map((p, i) => (
              <p key={i} ref={(el) => { paras.current[i] = el; }} className={`${centred(at, i) ? "is-center" : ""}${marked?.para === i ? " is-marked" : ""}`}>{p}</p>
            ))}
          </div>
          <footer>
            <button type="button" className="hud-btn hud-btn--ghost" disabled={at === 0} onClick={() => open(at - 1)}><ChevronLeft aria-hidden="true" />{tl("上一章")}</button>
            <i style={{ ["--k" as string]: (at + 1) / LIST.length }} aria-hidden="true" />
            <button type="button" className="hud-btn hud-btn--primary" disabled={at === LIST.length - 1} onClick={() => open(at + 1)}>{tl("下一章")}<ChevronRight aria-hidden="true" /></button>
          </footer>
        </article>
      </div>
    </div>
  );
}
