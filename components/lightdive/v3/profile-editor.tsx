"use client";

// 自訂檔案 (10-21): the panel where an observer picks what their profile shows. Every choice applies at once, to the
// page above and to the postcard; nothing here changes a result, only what is on display.
import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { tl } from "@/lib/lightdive-v3/i18n";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { LIGHT, RARITY, RARITY_COLOR } from "./copy";
import { paintingOf } from "./cards";
import { destImage } from "@/lib/lightdive-v3/art";
import { MAX_STATS, MOTTOS, POSTCARD_STATS, SCENES, type ProfileStyle, type Scene, type SectionKey, type StatKey, type StyleSync } from "./profile-style";
import type { SimNft } from "./sim";

export const sceneName = (x: Scene) => (x.cluster !== undefined ? TEXTS.clusters[x.cluster].name : x.light !== undefined ? tl("{0}之地", { 0: LIGHT[x.light] }) : tl(x.name ?? ""));
export const SECTION_NAME: Record<SectionKey, () => string> = { titles: () => tl("稱號"), footprints: () => tl("足跡"), boards: () => tl("本週排行") };

const SYNC_TEXT: Record<Exclude<StyleSync, "local">, () => string> = {
  loading: () => tl("讀取中…"),
  saving: () => tl("儲存中…"),
  saved: () => tl("已儲存"),
  signin: () => tl("還沒存到伺服器：請重新連接錢包並簽名登入"),
  error: () => tl("儲存失敗，請稍後再改一次"),
};

type Props = {
  style: ProfileStyle;
  sync: StyleSync;
  update: (patch: Partial<ProfileStyle> | null) => void;
  titles: { index: number; name: string }[]; // the earned ones
  cards: SimNft[];
  cardScene: string; // the "card" scene, as the featured card paints it
  places: { id: number; name: string }[]; // destinations with a collected result: their paintings can be chosen
  stats: { key: StatKey; label: string }[]; // every number this observer can show
  shown: StatKey[];
  sections: SectionKey[]; // the ones this page has
};

type Tab = "title" | "card" | "scene" | "stats" | "motto" | "sections";
const TABS: { key: Tab; name: () => string }[] = [
  { key: "title", name: () => tl("代表稱號") },
  { key: "card", name: () => tl("代表卡") },
  { key: "scene", name: () => tl("背景") },
  { key: "stats", name: () => tl("顯示的數字") },
  { key: "motto", name: () => tl("一句話") },
  { key: "sections", name: () => tl("區塊與順序") },
];

export function ProfileEditor({ style, sync, update, titles, cards, cardScene, places, stats, shown, sections }: Props) {
  const [tab, setTab] = useState<Tab>("title");
  const toggleStat = (k: StatKey) => {
    const next = shown.includes(k) ? shown.filter((x) => x !== k) : [...shown, k].slice(0, MAX_STATS);
    if (next.length) update({ stats: next });
  };
  const move = (k: SectionKey, by: number) => {
    const order = [...style.order];
    const i = order.indexOf(k), j = i + by;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    update({ order });
  };
  const sorted = [...cards].sort((a, b) => b.rarity - a.rarity || b.power - a.power);
  return (
    <section className="v3-panel v3-pedit" aria-label={tl("自訂檔案")}>
      <header className="v3-pedit__head">
        <h3>{tl("自訂檔案")}</h3>
        <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => update(null)}><RotateCcw aria-hidden="true" />{tl("恢復預設")}</button>
      </header>
      <div className="v3-pedit__tabs" role="tablist">
        {TABS.map((t) => <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? "is-on" : ""} onClick={() => setTab(t.key)}>{t.name()}</button>)}
      </div>
      <p className="v3-muted">
        {tl("選你今天想展示的樣子，上面的檔案和明信片會一起改。")}
        {sync === "local" ? tl("預覽模式的選擇只存在這台裝置上。") : tl("選擇會存到伺服器，別人打開你的檔案時也看得到。")}
        {sync !== "local" && <em className={`v3-pedit__sync is-${sync}`}>{SYNC_TEXT[sync]()}</em>}
      </p>

      {tab === "title" && (
      <div className="v3-pedit__group" role="tabpanel">
        <h4>{tl("代表稱號")}</h4>
        <div className="v3-chips" role="radiogroup" aria-label={tl("代表稱號")}>
          <button type="button" role="radio" aria-checked={style.title === null} className={style.title === null ? "is-on" : ""} onClick={() => update({ title: null })}>{tl("自動（最難的一個）")}</button>
          {titles.map((t) => (
            <button key={t.index} type="button" role="radio" aria-checked={style.title === t.index} className={`is-gold${style.title === t.index ? " is-on" : ""}`} onClick={() => update({ title: t.index })}>{t.name}</button>
          ))}
          {!titles.length && <span className="v3-muted">{tl("收下第一趟結果，就有第一個稱號。")}</span>}
        </div>
      </div>
      )}

      {tab === "card" && (
      <div className="v3-pedit__group" role="tabpanel">
        <h4>{tl("代表卡")} <em>{cards.length}</em></h4>
        <div className="v3-pedit__cards" role="radiogroup" aria-label={tl("代表卡")}>
          <button type="button" role="radio" aria-checked={style.card === null} className={`is-auto${style.card === null ? " is-on" : ""}`} onClick={() => update({ card: null })}>{tl("自動")}<small>{tl("最稀有的")}</small></button>
          {sorted.map((n) => (
            <button key={n.id} type="button" role="radio" aria-checked={style.card === n.id} className={style.card === n.id ? "is-on" : ""} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }} onClick={() => update({ card: n.id })} title={`${RARITY[n.rarity]} #${n.id}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={paintingOf(n)} alt="" loading="lazy" />
              <small>#{n.id}</small>
            </button>
          ))}
        </div>
      </div>
      )}

      {tab === "scene" && (
      <div className="v3-pedit__group" role="tabpanel">
        <h4>{tl("背景")}</h4>
        <div className="v3-pedit__scenes" role="radiogroup" aria-label={tl("背景")}>
          {SCENES.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={style.scene === x.id} className={style.scene === x.id ? "is-on" : ""} onClick={() => update({ scene: x.id })}>
              <span style={{ backgroundImage: `url(${x.src || cardScene})` }} />
              <small>{sceneName(x)}</small>
            </button>
          ))}
        </div>
        <h4>{tl("到過的目的地")} <em>{places.length}/24</em></h4>
        <p className="v3-muted">{tl("在一個目的地收下結果，就能用那裡的畫當背景。")}</p>
        <div className="v3-pedit__scenes" role="radiogroup" aria-label={tl("到過的目的地")}>
          {places.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={style.scene === `d${x.id}`} className={style.scene === `d${x.id}` ? "is-on" : ""} onClick={() => update({ scene: `d${x.id}` })}>
              <span style={{ backgroundImage: `url(${destImage(x.id)})` }} />
              <small>{x.name}</small>
            </button>
          ))}
        </div>
      </div>
      )}

      {tab === "stats" && (
      <div className="v3-pedit__group" role="tabpanel">
        <h4>{tl("顯示的數字")} <em>{shown.length}/{MAX_STATS}</em></h4>
        <p className="v3-muted">{tl("點選要顯示的數字，順序就是點選的順序。最多 {0} 項；明信片用前 {1} 項。", { 0: MAX_STATS, 1: POSTCARD_STATS })}</p>
        <div className="v3-chips" aria-label={tl("顯示的數字")}>
          {stats.map((s) => {
            const at = shown.indexOf(s.key);
            return (
              <button key={s.key} type="button" aria-pressed={at >= 0} className={at >= 0 ? "is-on" : ""} disabled={at < 0 && shown.length >= MAX_STATS} onClick={() => toggleStat(s.key)}>
                {at >= 0 && <i>{at + 1}</i>}{s.label}
              </button>
            );
          })}
          <button type="button" className="is-reset" onClick={() => update({ stats: null })}>{tl("預設八項")}</button>
        </div>
      </div>
      )}

      {tab === "motto" && (
      <div className="v3-pedit__group" role="tabpanel">
        <h4>{tl("一句話")}</h4>
        <div className="v3-chips" role="radiogroup" aria-label={tl("一句話")}>
          <button type="button" role="radio" aria-checked={style.motto === null} className={style.motto === null ? "is-on" : ""} onClick={() => update({ motto: null })}>{tl("不寫")}</button>
          {MOTTOS.map((m, i) => (
            <button key={m} type="button" role="radio" aria-checked={style.motto === i} className={style.motto === i ? "is-on" : ""} onClick={() => update({ motto: i })}>{tl(m)}</button>
          ))}
        </div>
      </div>
      )}

      {tab === "sections" && (
      <div className="v3-pedit__group" role="tabpanel">
        <h4>{tl("區塊與順序")}</h4>
        <ol className="v3-pedit__sections">
          {style.order.filter((k) => sections.includes(k)).map((k, i, list) => {
            const hidden = style.hidden.includes(k);
            return (
              <li key={k} className={hidden ? "is-hidden" : ""}>
                <b>{SECTION_NAME[k]()}</b>
                <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" aria-pressed={!hidden} onClick={() => update({ hidden: hidden ? style.hidden.filter((x) => x !== k) : [...style.hidden, k] })}>
                  {hidden ? <><EyeOff aria-hidden="true" />{tl("已隱藏")}</> : <><Eye aria-hidden="true" />{tl("顯示中")}</>}
                </button>
                <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" aria-label={tl("往上移")} disabled={i === 0} onClick={() => move(k, -1)}><ArrowUp aria-hidden="true" /></button>
                <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" aria-label={tl("往下移")} disabled={i === list.length - 1} onClick={() => move(k, 1)}><ArrowDown aria-hidden="true" /></button>
              </li>
            );
          })}
        </ol>
      </div>
      )}
    </section>
  );
}
