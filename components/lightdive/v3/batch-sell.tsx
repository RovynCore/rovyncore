"use client";

// Listing several idle cards at once (decision C, 10-10: the game keeps the contract's caps and relies on players
// passing cards they no longer use to others). On chain this is one LightdiveMarket3.listMany transaction, up to
// LIST_BATCH cards, after a one-time approval of the market for the player's cards. Each card keeps its own price;
// the default is the same reference the single sell dialog uses. Nothing here judges whether a price is a good deal.
import { useState } from "react";
import { Tags } from "lucide-react";
import { LIST_BATCH, MARKET_TAX, PRICE, TAX_TO_POOL, type Kind } from "@/lib/lightdive-v3/rules";
import { NftArt } from "../game/art";
import { idleCards, type Sim } from "./sim";
import { averagePrice } from "./market-data";
import { Modal, RarityTag, Tile, Trait, Voyages } from "./kit";
import { ERROR, KIND, RARITY_COLOR, fmt } from "./copy";
import { play } from "./audio";
import { tl } from "@/lib/lightdive-v3/i18n";

export function BatchSell({ sim, picked, onClose, onDone }: { sim: Sim; picked?: number[]; onClose: () => void; onDone: (msg: string) => void }) {
  const s = sim.state!;
  // the cards on offer are fixed when the dialog opens, so a card listed or moved elsewhere doesn't jump around
  const [cards] = useState(() => idleCards(s).sort((a, b) => a.kind - b.kind || b.rarity - a.rarity || b.power - a.power));
  const market = sim.market;
  const [prices, setPrices] = useState<Record<number, number>>(() =>
    Object.fromEntries(cards.map((n) => [n.id, Math.round(averagePrice(market, n.kind, n.rarity)?.average ?? PRICE[n.kind as Kind])])));
  const [on, setOn] = useState<Set<number>>(() => new Set((picked ?? []).filter((id) => cards.some((n) => n.id === id)).slice(0, LIST_BATCH)));
  const [error, setError] = useState<string | null>(null);
  const chosen = cards.filter((n) => on.has(n.id));
  const total = chosen.reduce((a, n) => a + (prices[n.id] || 0), 0);
  const full = on.size >= LIST_BATCH;
  const toggle = (id: number) => setOn((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else if (next.size < LIST_BATCH) next.add(id);
    return next;
  });
  const go = async () => {
    const e = await sim.listMany(chosen.map((n) => ({ id: n.id, price: prices[n.id] })));
    if (e) { setError(ERROR[e]); return; }
    play("claim");
    onDone(tl("已上架 {0} 張卡，總價 {1} $RVYN。", { 0: chosen.length, 1: fmt(total) }));
  };
  return (
    <Modal label={tl("上架閒置的卡")} onClose={onClose} className="v3-batchsell">
      <span className="hud-kicker"><Tags aria-hidden="true" />{tl("一次上架")}</span>
      <h2>{tl("上架閒置的卡")}</h2>
      <p className="v3-batchsell__lead">{tl("這些卡不在隊伍上、沒有停泊、也沒有上架。選擇要上架的卡（一次最多 {0} 張），每張可以設定自己的價格。上架期間卡由市集合約保管、不能出發，取消上架就會回到你手上。", { 0: LIST_BATCH })}</p>
      {cards.length ? (
        <>
          <div className="v3-batchsell__tools">
            <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => setOn(new Set(cards.slice(0, LIST_BATCH).map((n) => n.id)))}>{cards.length > LIST_BATCH ? tl("選前 {0} 張", { 0: LIST_BATCH }) : tl("全選")}</button>
            <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" disabled={!on.size} onClick={() => setOn(new Set())}>{tl("清除")}</button>
            <span>{tl("已選 {0}／{1}", { 0: on.size, 1: LIST_BATCH })}</span>
          </div>
          <ul className="v3-batchsell__list">
            {cards.map((n) => {
              const checked = on.has(n.id);
              return (
                <li key={n.id} className={checked ? "is-on" : ""} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
                  <label className="v3-batchsell__pick">
                    <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(n.id)} />
                    <span className="v3-batchsell__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
                    <span className="v3-batchsell__name">
                      <b>{KIND[n.kind]} #{n.id}</b>
                      <span><RarityTag rarity={n.rarity} compact /><small>{tl("戰力")} <b>{n.power}</b></small><Trait n={n} /></span>
                      <Voyages n={n} />
                    </span>
                  </label>
                  <span className="v3-price__input v3-batchsell__price">
                    <input type="number" min={1} step={1} value={prices[n.id] ?? ""} aria-label={tl("{0} #{1} 的價格", { 0: KIND[n.kind], 1: n.id })}
                      onChange={(e) => { setPrices((p) => ({ ...p, [n.id]: Number(e.target.value) })); if (!checked && !full) toggle(n.id); }} />
                    <em>$RVYN</em>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="v3-tiles is-4">
            <Tile label={tl("已選")} value={`${chosen.length} / ${LIST_BATCH}`} />
            <Tile label={tl("總售價")} value={fmt(total)} sub="$RVYN" />
            <Tile label={tl("交易稅 5%")} value={fmt(total * MARKET_TAX)} sub={tl("{0}% 回核光池、{1}% 銷毀", { 0: Math.round(TAX_TO_POOL * 100), 1: 100 - Math.round(TAX_TO_POOL * 100) })} />
            <Tile label={tl("全部賣出時實收")} value={fmt(total * (1 - MARKET_TAX))} sub="$RVYN" tone="#c9ff55" />
          </div>
        </>
      ) : (
        <p className="v3-empty">{tl("目前沒有閒置的卡。")}</p>
      )}
      {error && <p className="v3-error" role="alert">{error}</p>}
      <div className="v3-modal__actions">
        <button type="button" className="hud-btn hud-btn--ghost" onClick={onClose}>{tl("取消")}</button>
        <button type="button" className="hud-btn hud-btn--primary" onClick={go} disabled={!chosen.length || chosen.some((n) => !(prices[n.id] > 0))}>{tl("確認上架（{0} 張）", { 0: chosen.length })}</button>
      </div>
      <p className="v3-nftdetail__note">{tl("正式版會用市集合約一次簽名上架（第一次需要授權市集合約保管你的卡）。預覽模式：上架與成交都是模擬的。")}</p>
    </Modal>
  );
}
