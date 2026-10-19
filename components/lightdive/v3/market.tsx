"use client";

// Market: browse like a shop (art, rarity, numbers, price), open an item for the full detail, buy or manage
// your own listings. Preview mode: other sellers and purchases are simulated with test RVYN.
import { useState } from "react";
import { ShoppingCart, Tags } from "lucide-react";
import { DESTINATIONS, MARKET_TAX, POWER, TAX_TO_POOL, VOYAGES, type Kind } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { NftArt } from "../game/art";
import { PageHead } from "../game/hud";
import { idleCards, owned, type Sim } from "./sim";
import { BatchSell } from "./batch-sell";
import { NftDetail } from "./assets";
import type { View } from "./pages";
import { short } from "./chain";
import type { Listing } from "./market-data";
import { Modal, RarityGem, RarityTag, Tile, Trait, Voyages, traitName } from "./kit";
import { CardFace, Foil, HistoryPanel, Marks } from "./cards";
import { marksOf, type MarkKey } from "@/lib/lightdive-v3/history";
import { BEAM, CIRCLED, ERROR, KIND, LIGHT, LIGHT_COLOR, RARITY_COLOR, SLOT, TIER, ago, fmt } from "./copy";
import { play } from "./audio";
import { DockKeeper } from "./feeds";
import { tl } from "@/lib/lightdive-v3/i18n";

type Tab = "shop" | "mine" | "sales";
type Sort = "new" | "cheap" | "pricey" | "power";

export function Market({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const s = sim.state!;
  const [tab, setTab] = useState<Tab>("shop");
  const [kind, setKind] = useState<Kind | null>(null);
  const [rarity, setRarity] = useState<number | null>(null);
  const [trait, setTrait] = useState<number | null>(null);
  const [minP, setMinP] = useState("");
  const [maxP, setMaxP] = useState("");
  const [sort, setSort] = useState<Sort>("new");
  const [open, setOpen] = useState<Listing | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [bought, setBought] = useState<number | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const [batch, setBatch] = useState(false);
  const idle = idleCards(s).length;
  const others = sim.market;
  const mineListings: Listing[] = (s.listings ?? []).flatMap((l) => {
    const n = s.nfts.find((x) => x.id === l.nftId && owned(x));
    return n ? [{ id: -n.id, nftId: n.id, kind: n.kind, rarity: n.rarity, power: n.power, trait: n.trait, voyages: n.voyages, renewed: n.renewed, price: l.price, seller: tl("你"), listedAt: l.at, mine: true }] : [];
  });
  const shop = [...others.filter((l) => l.listedAt <= sim.now), ...mineListings]
    .filter((l) => (kind === null || l.kind === kind) && (rarity === null || l.rarity === rarity) && (trait === null || l.trait === trait))
    .filter((l) => (!minP || l.price >= Number(minP)) && (!maxP || l.price <= Number(maxP)))
    .sort((a, b) => (sort === "new" ? b.listedAt - a.listedAt : sort === "cheap" ? a.price - b.price : sort === "pricey" ? b.price - a.price : b.power - a.power));
  const traits = kind === 1 ? BEAM : kind === 2 ? LIGHT : [] // spires: seats follow rarity, so the rarity filter covers them;
  const traitValue = (i: number) => (kind === 0 ? i + 1 : i);
  return (
    <div className="hud-page v3-market">
      <PageHead kicker={tl("市集")} icon="market" title={tl("市集")} lead={tl("用 $RVYN 跟其他觀測者買賣光塔、稜鏡、探索者。成交時從賣方收 5% 交易稅。")}
        side={<DockKeeper sim={sim} tab={tab} />} />
      <div className="v3-market__bar">
      <div className="hud-seg v3-tabs" role="tablist">
        {([["shop", tl("市場（{0}）", { 0: others.length })], ["mine", tl("我的掛單（{0}）", { 0: mineListings.length })], ["sales", tl("成交紀錄（{0}）", { 0: (s.sales ?? []).length })]] as [Tab, string][]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "is-on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <button type="button" className="hud-btn hud-btn--primary" onClick={() => { setBatch(true); play("open"); }}><Tags aria-hidden="true" />{tl("一次上架多張（{0}）", { 0: idle })}</button>
      </div>
      {msg && <p className="v3-notice" role="status">{msg}</p>}
      {tab === "shop" && (
        <>
          <div className="v3-toolbar">
            <div className="hud-seg" role="group" aria-label={tl("種類")}>
              <button type="button" className={kind === null ? "is-on" : ""} onClick={() => { setKind(null); setTrait(null); }}>{tl("全部")}</button>
              {([0, 1, 2] as Kind[]).map((k) => <button key={k} type="button" className={kind === k ? "is-on" : ""} onClick={() => { setKind(k); setTrait(null); }}>{KIND[k]}</button>)}
            </div>
            <div className="hud-seg v3-gems" role="group" aria-label={tl("稀有度")}>
              <button type="button" className={rarity === null ? "is-on" : ""} onClick={() => setRarity(null)}>{tl("全部")}</button>
              {TIER.map((name, r) => <button key={name} type="button" className={rarity === r ? "is-on" : ""} onClick={() => setRarity(r)}><RarityGem rarity={r} size={16} />{name}</button>)}
            </div>
          </div>
          <div className="v3-toolbar">
            {traits.length > 0 && (
              <div className="hud-seg" role="group" aria-label={traitName(kind ?? 2)}>
                <button type="button" className={trait === null ? "is-on" : ""} onClick={() => setTrait(null)}>{tl("全部")}{traitName(kind ?? 2)}</button>
                {traits.map((t, i) => <button key={t} type="button" className={trait === traitValue(i) ? "is-on" : ""} onClick={() => setTrait(traitValue(i))} style={kind === 2 ? { color: LIGHT_COLOR[i] } : undefined}>{t}</button>)}
              </div>
            )}
            <label className="v3-range">{tl("價格")}
              <input type="number" min={0} placeholder={tl("最低")} value={minP} onChange={(e) => setMinP(e.target.value)} />
              <span>–</span>
              <input type="number" min={0} placeholder={tl("最高")} value={maxP} onChange={(e) => setMaxP(e.target.value)} />
            </label>
            <label className="v3-select">{tl("排序")}
              <select className="hud-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="new">{tl("最新上架")}</option>
                <option value="cheap">{tl("價格低到高")}</option>
                <option value="pricey">{tl("價格高到低")}</option>
                <option value="power">{tl("戰力高到低")}</option>
              </select>
            </label>
          </div>
          <div className="v3-nftgrid">
            {shop.map((l) => <ListingCard key={l.id} l={l} marks={marksOf(sim.history(l.nftId ?? l.id), l.renewed)} onOpen={() => { setOpen(l); play("click"); }} />)}
            {!shop.length && <p className="v3-empty">{tl("沒有符合條件的商品。")}</p>}
          </div>
        </>
      )}
      {tab === "mine" && (
        <div className="v3-nftgrid">
          {mineListings.map((l) => <ListingCard key={l.id} l={l} marks={marksOf(sim.history(l.nftId ?? l.id), l.renewed)} onOpen={() => setOpen(l)} />)}
          {!mineListings.length && <p className="v3-empty">{tl("你還沒有上架任何卡。到光塔、稜鏡或探索者頁，打開一張閒置的卡就能上架。")}</p>}
        </div>
      )}
      {tab === "sales" && (
        <ul className="v3-ledger">
          {(s.sales ?? []).slice().reverse().map((x) => {
            const n = s.nfts.find((y) => y.id === x.nftId);
            return (
              <li key={`${x.nftId}-${x.at}`}>
                {n && <RarityTag rarity={n.rarity} compact />}
                <b>{n ? `${KIND[n.kind]} #${n.id}` : `#${x.nftId}`}</b>
                <span>{tl("售出 {0}", { 0: fmt(x.price) })} $RVYN</span>
                <span className="is-good">{tl("實收 {0}", { 0: fmt(x.price * (1 - MARKET_TAX)) })}</span>
                <small>{ago(sim.now - x.at)}</small>
              </li>
            );
          })}
          {!(s.sales ?? []).length && <p className="v3-empty">{tl("還沒有成交。")}</p>}
        </ul>
      )}
      {open && <ListingDetail sim={sim} l={open} onClose={() => setOpen(null)} onMsg={setMsg} onBought={setBought} />}
      {bought !== null && <Bought sim={sim} id={bought} onClose={() => setBought(null)} onInspect={() => { setInspect(bought); setBought(null); }} onTeam={() => go("plain")} />}
      {inspect !== null && <NftDetail sim={sim} id={inspect} onClose={() => setInspect(null)} onMsg={setMsg} />}
      {batch && <BatchSell sim={sim} onClose={() => setBatch(false)} onDone={(m) => { setMsg(m); setBatch(false); }} />}
    </div>
  );
}

function ListingCard({ l, onOpen, marks }: { l: Listing; onOpen: () => void; marks: MarkKey[] }) {
  return (
    <button type="button" className={`v3-nft v3-shopitem r${l.rarity}${l.mine ? " is-mine" : ""}`} style={{ ["--rc" as string]: RARITY_COLOR[l.rarity] }} onClick={onOpen}>
      <span className="v3-nft__art"><NftArt a={{ kind: l.kind, rarity: l.rarity, trait: l.trait, variant: 0 }} /></span>
      {l.mine && <span className="v3-nft__badge is-listed">{tl("我的掛單")}</span>}
      <RarityTag rarity={l.rarity} compact />
      <span className="v3-nft__name">{KIND[l.kind]}</span>
      <Marks keys={marks} max={2} />
      <span className="v3-nft__power"><small>{tl("戰力")}</small><b>{l.power}</b></span>
      <Trait n={l} />
      <Voyages n={l} />
      <span className="v3-shopitem__price"><b>{fmt(l.price)}</b><small>$RVYN</small></span>
    </button>
  );
}

function ListingDetail({ sim, l, onClose, onMsg, onBought }: { sim: Sim; l: Listing; onClose: () => void; onMsg: (m: string) => void; onBought: (id: number) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lo, hi] = POWER[l.kind][l.rarity];
  const buy = async () => {
    const r = await sim.buy(l);
    if (r.error || r.id === undefined) { setError(ERROR[r.error ?? "balance"]); return; }
    play("summon");
    onMsg(tl("買到了 {0}{1}（戰力 {2}），已放進你的{3}。", { 0: TIER[l.rarity], 1: KIND[l.kind], 2: l.power, 3: KIND[l.kind] }));
    onClose();
    onBought(r.id);
  };
  return (
    <Modal label={tl("{0} 商品", { 0: KIND[l.kind] })} onClose={onClose} className="v3-nftdetail">
      <section className="v3-nftdetail__chain" aria-label={tl("鏈上資料")}>
        <h3>{tl("鏈上資料")}</h3>
        <dl>
          <div><dt>Token ID</dt><dd>#{l.mine ? l.nftId : l.id}</dd></div>
          <div><dt>{tl("合約")}</dt><dd title={sim.chainOf(l).contract}>{short(sim.chainOf(l).contract)}</dd></div>
          <div><dt>{tl("賣家")}</dt><dd title={l.seller}>{l.mine ? tl("你") : short(l.seller)}</dd></div>
          <div><dt>{tl("上架時間")}</dt><dd>{ago(sim.now - l.listedAt)}</dd></div>
          <div><dt>{tl("標準")}</dt><dd>{tl("ERC-721（RVDIV）")}</dd></div>
        </dl>
        {sim.mode === "preview" && <p className="v3-nftdetail__note">{tl("預覽模式：掛單和購買都是模擬的。")}</p>}
      </section>
      <section className="v3-nftdetail__hero" style={{ ["--rc" as string]: RARITY_COLOR[l.rarity] }}>
        {/* the same card face as everywhere (10-19): 稜光 and 曜核 are full-art foil */}
        <div className="v3-nftdetail__art is-card"><Foil rarity={l.rarity}><CardFace n={{ id: l.nftId ?? l.id, kind: l.kind, rarity: l.rarity, power: l.power, trait: l.trait }} size="lg" /></Foil></div>
        <h2>{KIND[l.kind]} #{l.nftId ?? l.id}</h2>
      </section>
      <section className="v3-nftdetail__game" aria-label={tl("遊戲數據")}>
        <h3>{tl("遊戲數據")}</h3>
        <div className="v3-nftdetail__power"><small>{tl("戰力")}</small><b>{l.power}</b><span>{tl("{0}區間 {1}", { 0: TIER[l.rarity], 1: lo })}–{hi}</span></div>
        <div className="v3-tiles">
          <Tile label={traitName(l.kind)} value={<Trait n={l} />} />
          <Tile label={tl("剩餘航程")} value={`${l.voyages} / ${VOYAGES[l.kind]}`} sub={tl("每天 3 次約 {0} 天", { 0: Math.ceil(l.voyages / 3) })} />
          <Tile label={tl("續航")} value={l.renewed ? tl("已用過") : tl("可續 1 次")} />
        </div>
        {l.kind === 2 && (
          <div className="v3-nftdetail__list">
            <h4>{tl("今天同頻的目的地（{0}）", { 0: LIGHT[l.trait] })}</h4>
            <ul>{DESTINATIONS.filter((d) => sim.sky.lights[d.id] === l.trait).map((d) => <li key={d.id} style={{ color: LIGHT_COLOR[l.trait] }}>{CIRCLED[d.cluster]}{SLOT[d.slot]} {TEXTS.clusters[d.cluster].destinations[d.slot].name}<small>{tl("門檻 {0}", { 0: d.threshold })}</small></li>)}</ul>
          </div>
        )}
        <HistoryPanel h={sim.history(l.nftId ?? l.id)} renewed={l.renewed} />
      </section>
      <footer className="v3-nftdetail__actions v3-buybar">
        <div className="v3-buybar__price"><small>{tl("售價")}</small><b>{fmt(l.price)}</b><em>$RVYN</em></div>
        {l.mine ? (
          <button type="button" className="hud-btn hud-btn--ghost" onClick={async () => { await sim.unlist(l.nftId!); onMsg(tl("已取消上架。")); onClose(); }}>{tl("取消上架")}</button>
        ) : confirm ? (
          <>
            <span className="v3-dockinfo">{tl("付款 {0} $RVYN，賣家實收 {1}（5% 交易稅，{2}% 回核光池）。", { 0: fmt(l.price), 1: fmt(l.price * (1 - MARKET_TAX)), 2: Math.round(TAX_TO_POOL * 100) })}</span>
            <button type="button" className="hud-btn hud-btn--ghost" onClick={() => setConfirm(false)}>{tl("再想想")}</button>
            <button type="button" className="hud-btn hud-btn--primary" onClick={buy}>{tl("確認購買")}</button>
          </>
        ) : (
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => setConfirm(true)}><ShoppingCart aria-hidden="true" />{tl("購買")}</button>
        )}
      </footer>
      {error && <p className="v3-error" role="alert">{error}</p>}
    </Modal>
  );
}

/** After a purchase: the card arrives, with its stats and where to go next. */
function Bought({ sim, id, onClose, onInspect, onTeam }: { sim: Sim; id: number; onClose: () => void; onInspect: () => void; onTeam: () => void }) {
  const n = sim.state!.nfts.find((x) => x.id === id);
  if (!n) return null;
  const [lo, hi] = POWER[n.kind][n.rarity];
  return (
    <Modal label={tl("購入成功")} onClose={onClose} className="v3-bought">
      <div className="v3-bought__glow" aria-hidden="true" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }} />
      <span className="hud-kicker"><ShoppingCart aria-hidden="true" />{tl("購入成功")}</span>
      <div className="v3-bought__card" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
        <span className="v3-bought__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
        <RarityTag rarity={n.rarity} />
        <h2>{KIND[n.kind]} <small>#{n.id}</small></h2>
      </div>
      <dl className="v3-bought__stats">
        <div><dt>{tl("戰力")}</dt><dd style={{ color: RARITY_COLOR[n.rarity] }}>{n.power}<small>{tl("{0}區間 {1}", { 0: TIER[n.rarity], 1: lo })}–{hi}</small></dd></div>
        <div><dt>{traitName(n.kind)}</dt><dd><Trait n={n} /></dd></div>
        <div><dt>{tl("航程")}</dt><dd><Voyages n={n} /></dd></div>
      </dl>
      <p className="v3-bought__note">{n.kind === 1 ? tl("到碑原把它裝上光塔，隊伍的風險風格就會改變。") : n.kind === 2 ? tl("到碑原派它坐上光塔，和今天同頻的目的地會帶回更多。") : tl("到碑原用它組一支新隊伍，可以坐 {0} 位探索者。", { 0: n.trait })}</p>
      <div className="v3-bought__actions">
        <button type="button" className="hud-btn hud-btn--ghost" onClick={onInspect}>{tl("查看卡片資料")}</button>
        <button type="button" className="hud-btn hud-btn--primary" onClick={onTeam}>{tl("去碑原編隊")}</button>
        <button type="button" className="hud-btn hud-btn--ghost" onClick={onClose}>{tl("繼續逛")}</button>
      </div>
    </Modal>
  );
}
