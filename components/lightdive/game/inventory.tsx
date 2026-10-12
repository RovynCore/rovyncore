"use client";

// Asset pages: one inventory per kind (spires, seekers, prisms), with filters, sorting and details.
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ExternalLink, X } from "lucide-react";
import { CONTRACTS, EXPLORER, KIND, type Nft } from "@/lib/lightdive";
import { ATTRIBUTE, ATTRIBUTE_COLOR, KIND_NAME, RARITY, RARITY_COLOR, SIGNATURE } from "@/lib/lightdive-copy";
import { A, G, L, NAV } from "@/lib/lightdive-game-copy";
import { NftArt } from "./art";
import type { Derived, Game, View } from "./game";
import { PageHead } from "./hud";
import type { IconName } from "./icons";
import { MAX_VOYAGES, NftCard, nftName, nftTrait, useT } from "./ui";

type Where = "all" | "wallet" | "team";
type Sort = "rarity" | "luminance" | "voyages" | "id";
const ICON: Record<number, IconName> = { [KIND.spire]: "spires", [KIND.seeker]: "seekers", [KIND.prism]: "prisms" };
const VIEW_OF: Record<number, View> = { [KIND.spire]: "spires", [KIND.seeker]: "seekers", [KIND.prism]: "prisms" };

export function Inventory({ g, d, kind, go }: { g: Game; d: Derived; kind: number; go: (v: View) => void }) {
  const { t } = useT();
  const [rarity, setRarity] = useState<number | null>(null);
  const [where, setWhere] = useState<Where>("all");
  const [sort, setSort] = useState<Sort>("rarity");
  const [open, setOpen] = useState<Nft | null>(null);
  const onTeam = useMemo(() => g.data.teams.flatMap((tm) => [tm.spire, ...(tm.prism ? [tm.prism] : []), ...tm.seekers]), [g.data.teams]);
  const teamIds = new Set(onTeam.map((n) => n.id));
  const all = [...(kind === KIND.spire ? d.spires : kind === KIND.seeker ? d.seekers : d.prisms), ...onTeam.filter((n) => n.attributes.kind === kind)];
  const by: Record<Sort, (a: Nft, b: Nft) => number> = {
    rarity: (a, b) => b.attributes.rarity - a.attributes.rarity || b.attributes.luminance - a.attributes.luminance,
    luminance: (a, b) => b.attributes.luminance - a.attributes.luminance,
    voyages: (a, b) => a.attributes.voyagesLeft - b.attributes.voyagesLeft,
    id: (a, b) => Number(a.id - b.id),
  };
  const list = all
    .filter((n) => (rarity === null || n.attributes.rarity === rarity) && (where === "all" || (where === "team") === teamIds.has(n.id)))
    .sort(by[sort]);
  const nearHome = all.filter((n) => n.attributes.voyagesLeft <= 2).length;

  return (
    <div className="hud-page">
      <PageHead kicker={t(NAV[VIEW_OF[kind]])} icon={ICON[kind]} title={t(KIND_NAME[kind])} lead={t(G.kindRole[kind])}
        side={
          <div className="hud-stats">
            <span><small>{t(G.all)}</small><b>{all.length}</b></span>
            <span><small>{t(G.onSpire)}</small><b>{all.filter((n) => teamIds.has(n.id)).length}</b></span>
            <span><small>{t(G.inWallet)}</small><b>{all.filter((n) => !teamIds.has(n.id)).length}</b></span>
            <span className={nearHome ? "is-warn" : ""}><small>{t(G.lastVoyage)}</small><b>{nearHome}</b></span>
          </div>
        } />
      <div className="hud-filters">
        <div className="hud-seg" role="group">
          <button type="button" className={rarity === null ? "is-on" : ""} onClick={() => setRarity(null)}>{t(G.all)}</button>
          {RARITY.map((r, i) => (
            <button key={i} type="button" className={rarity === i ? "is-on" : ""} style={{ ["--rc" as string]: RARITY_COLOR[i] }} onClick={() => setRarity(i)}><i />{t(r)} <small>{all.filter((n) => n.attributes.rarity === i).length}</small></button>
          ))}
        </div>
        <div className="hud-seg" role="group">
          {(["all", "wallet", "team"] as Where[]).map((w) => (
            <button key={w} type="button" className={where === w ? "is-on" : ""} onClick={() => setWhere(w)}>{t({ all: G.all, wallet: G.inWallet, team: G.onSpire }[w])}</button>
          ))}
        </div>
        <select className="hud-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={t(L.sortLabel)}>
          <option value="rarity">{t(L.sortRarity)}</option>
          <option value="luminance">{t(L.sortLuminance)}</option>
          <option value="voyages">{t(L.sortVoyages)}</option>
          <option value="id">{t(L.sortId)}</option>
        </select>
      </div>
      {list.length === 0 ? (
        <div className="hud-panel hud-emptybox">
          <p>{t(G.empty)}</p>
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => go("summon")}>{t(A.summonTitle)}<ArrowRight aria-hidden="true" /></button>
        </div>
      ) : (
        <div className="hud-cards">
          {list.map((n) => <NftCard key={String(n.id)} n={n} badge={teamIds.has(n.id) ? t(G.onSpire) : undefined} onClick={() => setOpen(n)} />)}
        </div>
      )}
      <p className="hud-note">{t(G.homecoming)}</p>
      {open && <Detail n={open} onTeam={teamIds.has(open.id)} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function Detail({ n, onTeam, onClose }: { n: Nft; onTeam: boolean; onClose: () => void }) {
  const { t } = useT();
  const a = n.attributes;
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="ldg-modal" role="dialog" aria-modal="true" aria-labelledby="ldg-detail-title" onClick={onClose}>
      <div className="ldg-modal__card ldg-detail hud-detail" style={{ ["--rc" as string]: RARITY_COLOR[a.rarity] }} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="ldg-icon ldg-modal__close" onClick={onClose} aria-label={t(G.close)}><X aria-hidden="true" /></button>
        <div className="ldg-detail__art"><NftArt a={a} /></div>
        <div className="ldg-detail__body">
          <span className="ldg-nft__rarity">{"★".repeat(a.rarity + 1)} {t(RARITY[a.rarity])}</span>
          <h2 id="ldg-detail-title">{nftName(t, n)} <span className="hud-dim">#{String(n.id)}</span></h2>
          <p className="hud-dim">{t(KIND_NAME[a.kind])} · {nftTrait(t, n)}{onTeam ? ` · ${t(G.onSpire)}` : ""}</p>
          <dl className="ldg-kv">
            <div><dt>{t(G.luminance)}</dt><dd>✦ {a.luminance}</dd></div>
            <div><dt>{t(G.voyagesLeft)}</dt><dd>{a.voyagesLeft} / {MAX_VOYAGES[a.kind]}</dd></div>
            {a.kind === KIND.seeker && <div><dt>{t(G.lightPattern)}</dt><dd><i className="ldg-dot" style={{ background: ATTRIBUTE_COLOR[a.trait] }} />{t(ATTRIBUTE[a.trait])}</dd></div>}
            {a.kind === KIND.seeker && a.variant > 0 && <div><dt>{t(G.signature)}</dt><dd>{t(SIGNATURE[a.variant - 1])}</dd></div>}
            <div><dt>{t(G.deck)}</dt><dd>#{a.deck}</dd></div>
            <div><dt>{t(G.dna)}</dt><dd className="ldg-mono">{a.dna.toString(16).padStart(16, "0")}</dd></div>
          </dl>
          <div className="ldg-voyagebar"><i style={{ width: `${(a.voyagesLeft / MAX_VOYAGES[a.kind]) * 100}%` }} /></div>
          {EXPLORER && CONTRACTS && (
            <a className="hud-btn hud-btn--ghost hud-btn--sm" href={`${EXPLORER}/token/${CONTRACTS.nft}/instance/${n.id}`} target="_blank" rel="noreferrer">{t(G.viewExplorer)}<ExternalLink aria-hidden="true" /></a>
          )}
        </div>
      </div>
    </div>
  );
}
