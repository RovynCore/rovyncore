"use client";

// Asset pages (spires, prisms, seekers): a clear card wall, and an NFT detail with on-chain data on the left,
// the art in the middle and in-game data on the right. Listing opens a sell dialog with market references.
import { useMemo, useState } from "react";
import { Anchor, ExternalLink, Store, Tag } from "lucide-react";
import { DESTINATIONS, MARKET_TAX, POWER, PRICE, RENEW_SHARE, TAX_TO_POOL, VOYAGES, type Kind } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { NftArt } from "../game/art";
import { PageHead } from "../game/hud";
import { owned, teamName, type Sim, type SimNft } from "./sim";
import { chainOf, short } from "./chain";
import { averagePrice, othersListings } from "./market-data";
import { Modal, RarityGem, RarityTag, Tile, Trait, Voyages, traitName } from "./kit";
import { BEAM, CIRCLED, ERROR, KIND, LIGHT, LIGHT_COLOR, RARITY_COLOR, SLOT, TIER, fmt } from "./copy";
import { play } from "./audio";
import { gap, tl, localized } from "@/lib/lightdive-v3/i18n";

const DAY = 86_400_000;
type Where = "all" | "team" | "idle" | "docked" | "listed";
type Sort = "rarity" | "power" | "voyages" | "id";
/** The trait values of a filterable kind: prism beams 0-2, seeker lights 0-5 (spires have none: level = rarity). */
const traitValues = (kind: Kind) => (kind === 1 ? [0, 1, 2] : [0, 1, 2, 3, 4, 5]);

const teamOf = (sim: Sim, id: number) => sim.state!.teams.find((t) => t.spire === id || t.prism === id || t.seekers.includes(id));
const whereOf = (sim: Sim, n: SimNft): Exclude<Where, "all"> =>
  n.listed !== undefined ? "listed" : n.dockedAt !== undefined ? "docked" : teamOf(sim, n.id) ? "team" : "idle";
const WHERE: Record<Where, string> = localized({ all: "全部", team: "隊伍上", idle: "閒置", docked: "停泊中", listed: "上架中" });

export function Collection({ sim, kind }: { sim: Sim; kind: Kind }) {
  const s = sim.state!;
  const [where, setWhere] = useState<Where>("all");
  const [rarity, setRarity] = useState<number | null>(null);
  const [trait, setTrait] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("rarity");
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const mine = s.nfts.filter((n) => n.kind === kind && owned(n));
  const count = (w: Where) => (w === "all" ? mine.length : mine.filter((n) => whereOf(sim, n) === w).length);
  const list = mine
    .filter((n) => (where === "all" || whereOf(sim, n) === where) && (rarity === null || n.rarity === rarity) && (trait === null || n.trait === trait))
    .sort((a, b) => (sort === "rarity" ? b.rarity - a.rarity || b.power - a.power : sort === "power" ? b.power - a.power : sort === "voyages" ? a.voyages - b.voyages : a.id - b.id));
  const icon = kind === 0 ? "spires" : kind === 1 ? "prisms" : "seekers";
  return (
    <div className="hud-page v3-assets">
      <PageHead kicker={KIND[kind]} icon={icon} title={KIND[kind]} lead={kind === 0 ? tl("隊伍的基地。稀有度決定能坐幾位探索者：微光 1 位，曜核 5 位。") : kind === 1 ? tl("裝在光塔上，決定這支隊伍的風險風格。") : tl("坐上光塔出發的人。光紋和目的地同頻時帶回更多。")} />
      <div className="v3-assets__stats">
        <Tile label={tl("持有")} value={mine.length} />
        <Tile label={tl("隊伍上")} value={count("team")} />
        <Tile label={tl("閒置")} value={count("idle")} />
        <Tile label={tl("停泊中")} value={count("docked")} tone="#f0c766" />
        <Tile label={tl("上架中")} value={count("listed")} tone="#4aa8ff" />
        <Tile label={tl("戰力範圍")} value={`${POWER[kind][0][0]}–${POWER[kind][4][1]}`} />
      </div>
      <div className="v3-toolbar">
        <div className="hud-seg" role="group" aria-label={tl("位置")}>
          {(Object.keys(WHERE) as Where[]).map((w) => <button key={w} type="button" className={where === w ? "is-on" : ""} onClick={() => setWhere(w)}>{WHERE[w]} <em>{count(w)}</em></button>)}
        </div>
        <div className="hud-seg v3-gems" role="group" aria-label={tl("稀有度")}>
          <button type="button" className={rarity === null ? "is-on" : ""} onClick={() => setRarity(null)}>{tl("全部")}</button>
          {TIER.map((name, r) => <button key={name} type="button" className={rarity === r ? "is-on" : ""} onClick={() => setRarity(r)} title={name}><RarityGem rarity={r} size={16} />{name}</button>)}
        </div>
        {kind !== 0 && ( // spire level always equals its rarity, so the rarity row already covers it
        <div className={`hud-seg${kind === 2 ? " v3-lightseg" : ""}`} role="group" aria-label={traitName(kind)}>
          <button type="button" className={trait === null ? "is-on" : ""} onClick={() => setTrait(null)}>{tl("全部{0}", { 0: traitName(kind) })}</button>
          {traitValues(kind).map((v) => {
            const today = kind === 2 ? DESTINATIONS.filter((d) => sim.sky.lights[d.id] === v).length : 0;
            const have = mine.filter((n) => n.trait === v).length;
            return (
              <button key={v} type="button" className={trait === v ? "is-on" : ""} onClick={() => setTrait(v)} style={kind === 2 ? { ["--lc" as string]: LIGHT_COLOR[v] } : undefined}
                title={kind === 2 ? tl("今天有 {0} 個目的地是{1}", { 0: today, 1: LIGHT[v] }) : undefined} disabled={!have}>
                {kind === 2 && <i />}{kind === 1 ? BEAM[v] : LIGHT[v]}<em>{have}</em>
              </button>
            );
          })}
        </div>
        )}
        <label className="v3-select">{tl("排序")}
          <select className="hud-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="rarity">{tl("稀有度")}</option>
            <option value="power">{tl("戰力")}</option>
            <option value="voyages">{tl("剩餘航程（少的在前）")}</option>
            <option value="id">{tl("編號")}</option>
          </select>
        </label>
      </div>
      {msg && <p className="v3-notice" role="status">{msg}</p>}
      <div className="v3-nftgrid">
        {list.map((n) => {
          const w = whereOf(sim, n);
          return (
            <button key={n.id} type="button" className={`v3-nft r${n.rarity} is-${w}`} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }} onClick={() => { setOpen(n.id); play("click"); }}>
              <span className="v3-nft__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
              {w !== "idle" && <span className={`v3-nft__badge is-${w}`}>{w === "listed" ? tl("上架 {0}", { 0: fmt(n.listed ?? 0, 0) }) : WHERE[w]}</span>}
              <RarityTag rarity={n.rarity} compact />
              <span className="v3-nft__name">{KIND[n.kind]} #{n.id}</span>
              <span className="v3-nft__power"><small>{tl("戰力")}</small><b>{n.power}</b></span>
              <Trait n={n} />
              <Voyages n={n} />
            </button>
          );
        })}
        {!list.length && <p className="v3-empty">{tl("這裡沒有卡片。到「召喚」或「市集」取得。")}</p>}
      </div>
      {open !== null && <NftDetail sim={sim} id={open} onClose={() => setOpen(null)} onMsg={setMsg} />}
    </div>
  );
}

/** The NFT detail: on-chain data | art | in-game data, with actions underneath. */
export function NftDetail({ sim, id, onClose, onMsg }: { sim: Sim; id: number; onClose: () => void; onMsg: (m: string) => void }) {
  const s = sim.state!;
  const n = s.nfts.find((x) => x.id === id);
  const [selling, setSelling] = useState(false);
  if (!n) return null;
  const c = chainOf(n);
  const team = teamOf(sim, n.id);
  const w = whereOf(sim, n);
  const [lo, hi] = POWER[n.kind][n.rarity];
  const attuned = n.kind === 2 ? DESTINATIONS.filter((d) => sim.sky.lights[d.id] === n.trait) : [];
  const spireDives = n.kind === 0 ? s.dives.filter((d) => d.spire === n.id && d.result) : [];
  const brought = spireDives.reduce((a, d) => a + (d.reward ?? 0), 0);
  return (
    <>
    <Modal label={`${KIND[n.kind]} #${n.id}`} onClose={onClose} className="v3-nftdetail">
      <section className="v3-nftdetail__chain" aria-label={tl("鏈上資料")}>
        <h3>{tl("鏈上資料")}</h3>
        <dl>
          <div><dt>Token ID</dt><dd>#{c.tokenId}</dd></div>
          <div><dt>{tl("合約")}</dt><dd title={c.contract}>{short(c.contract)}</dd></div>
          <div><dt>{tl("擁有者")}</dt><dd title={c.owner}>{tl("{0}（你）", { 0: short(c.owner) })}</dd></div>
          <div><dt>{tl("鏈")}</dt><dd>{c.chain}</dd></div>
          <div><dt>{tl("標準")}</dt><dd>{c.standard}</dd></div>
          <div><dt>{tl("鑄造區塊")}</dt><dd>{c.mintBlock.toLocaleString()}</dd></div>
          <div><dt>{tl("鑄造交易")}</dt><dd title={c.mintTx}>{short(c.mintTx, 10, 6)}</dd></div>
          <div><dt>{tl("牌組")}</dt><dd>{tl("第 {0} 副", { 0: c.deck })}</dd></div>
          <div><dt>DNA</dt><dd>{c.dna}</dd></div>
          <div><dt>{tl("版稅")}</dt><dd>{c.royalty}</dd></div>
        </dl>
        <p className="v3-nftdetail__note">{tl("預覽模式：鏈上資料為模擬，v3 合約部署後會換成真實資料。")}</p>
        <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" disabled title={tl("合約部署後開放")}><ExternalLink aria-hidden="true" />{tl("在區塊瀏覽器查看")}</button>
      </section>

      <section className="v3-nftdetail__hero" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
        <div className="v3-nftdetail__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></div>
        <RarityTag rarity={n.rarity} />
        <h2>{KIND[n.kind]} #{n.id}</h2>
        <span className={`v3-nft__badge is-${w}`}>{w === "listed" ? tl("上架中 {0} $RVYN", { 0: fmt(n.listed ?? 0) }) : WHERE[w]}</span>
      </section>

      <section className="v3-nftdetail__game" aria-label={tl("遊戲數據")}>
        <h3>{tl("遊戲數據")}</h3>
        <div className="v3-nftdetail__power"><small>{tl("戰力")}</small><b>{n.power}</b><span>{tl("{0}區間 {1}", { 0: TIER[n.rarity], 1: lo })}–{hi}</span></div>
        <div className="v3-tiles">
          <Tile label={traitName(n.kind)} value={<Trait n={n} />} />
          <Tile label={tl("剩餘航程")} value={`${n.voyages} / ${VOYAGES[n.kind]}`} sub={tl("每天 3 次約 {0} 天", { 0: Math.ceil(n.voyages / 3) })} tone={n.voyages / VOYAGES[n.kind] < 0.15 ? "#ff8a7a" : undefined} />
          <Tile label={tl("續航")} value={n.renewed ? tl("已用過") : tl("可續 1 次")} sub={tl("費用 {0} $RVYN", { 0: fmt(PRICE[n.kind] * RENEW_SHARE) })} />
          <Tile label={tl("位置")} value={team ? teamName(s, team.spire) : WHERE[w]} />
          {n.kind === 0 && <Tile label={tl("累計出發")} value={spireDives.length} sub={tl("帶回 {0}", { 0: fmt(brought) })} />}
        </div>
        {n.kind === 2 && (
          <div className="v3-nftdetail__list">
            <h4>{tl("今天同頻的目的地（{0}）", { 0: LIGHT[n.trait] })}</h4>
            {attuned.length ? <ul>{attuned.map((d) => <li key={d.id} style={{ color: LIGHT_COLOR[n.trait] }}>{CIRCLED[d.cluster]}{SLOT[d.slot]} {TEXTS.clusters[d.cluster].destinations[d.slot].name}<small>{tl("門檻 {0}", { 0: d.threshold })}</small></li>)}</ul> : <p>{tl("今天沒有。")}</p>}
          </div>
        )}
        {n.kind === 1 && <p className="v3-nftdetail__hint">{tl("{0}稜鏡：", { 0: BEAM[n.trait] })}{n.trait === 0 ? tl("空手機率較低，大獎較小。") : n.trait === 1 ? tl("標準的風險和報酬。") : tl("空手機率較高，大獎較大。")}{gap()}{tl("平均倍率都相同。")}</p>}
        {n.kind === 0 && <p className="v3-nftdetail__hint">{tl("這座光塔可坐 {0} 位探索者，外加 1 面稜鏡。", { 0: n.trait })}</p>}
      </section>

      <footer className="v3-nftdetail__actions">
        {n.dockedAt !== undefined && (
          <>
            <span className="v3-dockinfo"><Anchor aria-hidden="true" />{tl("停泊中，剩 {0} 天", { 0: Math.max(0, 7 - Math.floor((sim.now - n.dockedAt) / DAY)) })}</span>
            {!n.renewed && <button type="button" className="hud-btn hud-btn--gold" onClick={() => { const e = sim.renew(n.id); onMsg(e ? ERROR[e] : tl("{0} #{1} 續航完成。", { 0: KIND[n.kind], 1: n.id })); onClose(); }}>{tl("續航（{0} $RVYN）", { 0: fmt(PRICE[n.kind] * RENEW_SHARE) })}</button>}
            <button type="button" className="hud-btn hud-btn--ghost" onClick={() => { sim.sendHome(n.id); onClose(); }}>{tl("讓它歸航")}</button>
          </>
        )}
        {w === "listed" ? (
          <button type="button" className="hud-btn hud-btn--ghost" onClick={() => { sim.unlist(n.id); onMsg(tl("#{0} 已取消上架。", { 0: n.id })); onClose(); }}>{tl("取消上架")}</button>
        ) : w === "idle" ? (
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => setSelling(true)}><Store aria-hidden="true" />{tl("上架市集")}</button>
        ) : w === "team" ? (
          <span className="v3-dockinfo">{tl("在隊伍上的卡要先到碑原拿下，才能上架。")}</span>
        ) : null}
      </footer>
    </Modal>
    {/* a sibling, not a child: the dialog backdrop blur would otherwise become the sell dialog's containing block */}
    {selling && <SellDialog sim={sim} n={n} onClose={() => setSelling(false)} onDone={(m) => { onMsg(m); setSelling(false); onClose(); }} />}
    </>
  );
}

/** Listing a card: market reference for the same kind and rarity, your price, and what you receive. */
function SellDialog({ sim, n, onClose, onDone }: { sim: Sim; n: SimNft; onClose: () => void; onDone: (m: string) => void }) {
  const market = useMemo(() => othersListings(sim.now, sim.state!.sold ?? []), [sim.now, sim.state]);
  const ref = averagePrice(market, n.kind, n.rarity);
  const [price, setPrice] = useState(() => (ref ? Math.round(ref.average) : PRICE[n.kind]));
  const [error, setError] = useState<string | null>(null);
  const tax = price * MARKET_TAX;
  const go = () => {
    const e = sim.listNft(n.id, price);
    if (e) { setError(ERROR[e]); return; }
    play("claim");
    onDone(tl("{0} #{1} 已上架，價格 {2} $RVYN。", { 0: KIND[n.kind], 1: n.id, 2: fmt(price) }));
  };
  return (
    <Modal label={tl("上架市集")} onClose={onClose} className="v3-sell">
      <span className="hud-kicker"><Tag aria-hidden="true" />{tl("上架市集")}</span>
      <div className="v3-sell__head" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
        <span className="v3-sell__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
        <div>
          <RarityTag rarity={n.rarity} />
          <h2>{KIND[n.kind]} #{n.id}</h2>
          <p>{tl("戰力")} <b>{n.power}</b> · <Trait n={n} /> {tl("· 航程 {0}", { 0: n.voyages })}/{VOYAGES[n.kind]}</p>
        </div>
      </div>
      <h3>{tl("同類行情（{0}", { 0: TIER[n.rarity] })} · {tl("{0}）", { 0: KIND[n.kind] })}</h3>
      {ref ? (
        <div className="v3-tiles is-4">
          <Tile label={tl("目前掛單")} value={tl("{0} 筆", { 0: ref.count })} />
          <Tile label={tl("平均價")} value={fmt(ref.average)} sub="$RVYN" tone="#f0c766" />
          <Tile label={tl("最低價")} value={fmt(ref.low)} sub="$RVYN" />
          <Tile label={tl("最高價")} value={fmt(ref.high)} sub="$RVYN" />
        </div>
      ) : (
        <p className="v3-empty">{tl("市場上目前沒有同類掛單。")}</p>
      )}
      <label className="v3-price">
        <span>{tl("你的售價")}</span>
        <span className="v3-price__input"><input type="number" min={1} step={1} value={price} onChange={(e) => setPrice(Number(e.target.value))} /><em>$RVYN</em></span>
      </label>
      <div className="v3-tiles is-3">
        <Tile label={tl("交易稅 5%")} value={fmt(tax)} sub={tl("{0}% 回核光池、{1}% 銷毀", { 0: Math.round(TAX_TO_POOL * 100), 1: 100 - Math.round(TAX_TO_POOL * 100) })} />
        <Tile label={tl("你實收")} value={fmt(price - tax)} sub="$RVYN" tone="#c9ff55" />
        <Tile label={tl("上架後")} value={tl("不能出發")} sub={tl("取消上架即可恢復")} />
      </div>
      {error && <p className="v3-error" role="alert">{error}</p>}
      <div className="v3-modal__actions">
        <button type="button" className="hud-btn hud-btn--ghost" onClick={onClose}>{tl("取消")}</button>
        <button type="button" className="hud-btn hud-btn--primary" onClick={go} disabled={!(price > 0)}>{tl("確認上架")}</button>
      </div>
      <p className="v3-nftdetail__note">{tl("預覽模式：上架與成交都是模擬的。正式版由市集合約處理。")}</p>
    </Modal>
  );
}
