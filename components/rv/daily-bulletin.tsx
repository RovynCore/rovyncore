"use client";

// 觀測站日報 on the home page (10-19): yesterday in Lightdive, from the chain (`/api/lightdive/daily`), with a line from
// Rovyn. Honour and activity only: no reward figures, no promise of any return.
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import Link from "@/components/site-link";
import { useLanguage } from "@/components/language-provider";
import { syncGameLocale, tl } from "@/lib/lightdive-v3/i18n";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { shortAddress, type Daily } from "@/lib/lightdive-v3/daily";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];
const place = (dest: number) => {
  const d = DESTINATIONS[dest];
  return `${CIRCLED[d.cluster]} ${TEXTS.clusters[d.cluster].destinations[d.slot].name}`;
};

function rovynLine(d: Daily) {
  if (d.legends[0]) return tl("昨天有 {0} 次傳說。{1} 在 {2} 帶回了 ×{3}，光橋到現在還亮著。", { 0: d.legendCount, 1: shortAddress(d.legends[0].who), 2: place(d.legends[0].dest), 3: (d.legends[0].mult / 100).toFixed(2) });
  if (d.dives && d.popular) return tl("昨天 {0} 位觀測者出航了 {1} 趟，最熱鬧的是 {2}。今天的天象已經換了。", { 0: d.observers, 1: d.dives, 2: place(d.popular.dest) });
  return tl("昨天的光橋很安靜。今天的第一道光，也許是你的。");
}

export function DailyBulletin() {
  const { locale } = useLanguage();
  syncGameLocale(locale);
  const [d, setD] = useState<Daily | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    fetch("/api/lightdive/daily").then((r) => (r.ok ? (r.json() as Promise<Daily>) : Promise.reject(r.status))).then((x) => { if (on) setD(x); }).catch(() => { if (on) setFailed(true); });
    return () => { on = false; };
  }, []);
  if (failed) return null;
  const date = d ? new Date(d.day * 86_400_000).toISOString().slice(0, 10) : "";
  const tiles: [string, string, string?][] = d ? [
    [tl("出航"), tl("{0} 趟", { 0: d.dives }), d.deep ? tl("其中深潛 {0} 趟", { 0: d.deep }) : undefined],
    [tl("出航的觀測者"), tl("{0} 位", { 0: d.observers }), d.newcomers ? tl("新加入 {0} 位", { 0: d.newcomers }) : undefined],
    [tl("傳說"), tl("{0} 次", { 0: d.legendCount })],
    [tl("最高倍率"), d.best ? `×${(d.best.mult / 100).toFixed(2)}` : "—", d.best ? `${shortAddress(d.best.who)} · ${place(d.best.dest)}` : undefined],
    [tl("到過的目的地"), `${d.places} / 24`, d.popular ? tl("最熱門：{0}", { 0: place(d.popular.dest) }) : undefined],
    [tl("光橋回聲"), tl("{0} 次", { 0: d.echoes }), tl("跟著別人的光橋走")],
  ] : [];
  return (
    <section className="rv-section rv-section--line rv-daily" aria-label={tl("觀測站日報")}>
      <div className="rv-container">
        <div className="rv-daily__head">
          <div>
            <span className="rv-eyebrow">{tl("觀測站日報")}{date ? ` · ${date} (UTC)` : ""}</span>
            <div className="rv-daily__rovyn">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/lightdive/npc/rovyn-pose-guide.webp" alt="" width={96} height={117} />
              <p>{d ? rovynLine(d) : tl("正在讀取鏈上紀錄…")}<small>{tl("—— Rovyn，訊號看守者")}</small></p>
            </div>
          </div>
          <Link className="rv-btn rv-btn--primary" href="/game/lightdive">{tl("進入潛光遠征")}<ArrowRight aria-hidden="true" /></Link>
        </div>
        <div className="rv-daily__tiles">
          {(d ? tiles : Array.from({ length: 6 }, () => ["", ""] as [string, string])).map(([label, value, sub], i) => (
            <div key={i} className={`rv-card rv-daily__tile${d ? "" : " is-loading"}`}>
              <span className="rv-stat__label">{label}</span>
              <b className="rv-num">{value}</b>
              {sub ? <small>{sub}</small> : null}
            </div>
          ))}
        </div>
        <p className="rv-caption">{tl("潛光遠征目前在測試網，使用測試幣，沒有價值。數字直接讀自鏈上的公開紀錄。")}</p>
      </div>
    </section>
  );
}
