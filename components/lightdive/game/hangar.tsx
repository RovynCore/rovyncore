"use client";

import { useMemo, useState } from "react";
import { Lock, Plus, Wand2, X } from "lucide-react";
import { ABI, previewLuminance, type Contracts, type Nft } from "@/lib/lightdive";
import { DEPTH, RARITY, RARITY_COLOR } from "@/lib/lightdive-copy";
import { A, G } from "@/lib/lightdive-game-copy";
import { NftArt, SpireArt } from "./art";
import type { Derived, Game, View } from "./game";
import { sfx } from "./sound";
import { NftCard, fill, nftName, useT } from "./ui";

const METER_MAX = 1000;

export function Hangar({ g, d, c, go }: { g: Game; d: Derived; c: Contracts; go: (v: View) => void }) {
  const { t } = useT();
  const o = g.data.overview!;
  const teams = g.data.teams;
  const all = [...teams.map((tm) => tm.spire), ...d.spires];
  const [spireId, setSpireId] = useState<bigint | null>(null);
  const current = spireId ?? all[0]?.id ?? null;
  const team = teams.find((tm) => tm.spire.id === current) ?? null;
  const spire = team?.spire ?? d.spires.find((s) => s.id === current) ?? null;

  const [prismId, setPrismId] = useState<bigint | null>(null);
  const [seats, setSeats] = useState<bigint[]>([]);
  const [tab, setTab] = useState<"seekers" | "prisms">("seekers");
  const level = spire?.attributes.trait ?? 0;

  const seekers = useMemo(() => [...d.seekers].sort((a, b) => b.attributes.luminance - a.attributes.luminance), [d.seekers]);
  const chosenSeekers = seats.map((id) => seekers.find((s) => s.id === id)).filter((x): x is Nft => !!x);
  const prism = team ? team.prism : d.prisms.find((p) => p.id === prismId) ?? null;
  const crew = team ? team.seekers : chosenSeekers;
  const lum = team ? Number(team.luminance) : spire && crew.length ? previewLuminance(spire, prism, crew) : 0;
  const reach = o.depthMinLuminance.reduce((acc, min, i) => (lum >= min ? i : acc), -1);

  const pick = (id: bigint) => {
    sfx.click();
    setSpireId(id);
    setSeats([]);
    setPrismId(null);
  };
  const seatSeeker = (n: Nft) => {
    if (!spire || team) return;
    sfx.select();
    setSeats((s) => (s.includes(n.id) ? s.filter((x) => x !== n.id) : s.length < level ? [...s, n.id] : s));
  };
  const mountPrism = (n: Nft) => {
    if (!spire || team) return;
    sfx.select();
    setPrismId((p) => (p === n.id ? null : n.id));
  };
  const autoFill = () => {
    sfx.select();
    setSeats(seekers.slice(0, level).map((s) => s.id));
    if (prismId === null && d.prisms.length) setPrismId([...d.prisms].sort((a, b) => b.attributes.luminance - a.attributes.luminance)[0].id);
  };
  const assemble = async () => {
    if (!spire) return;
    const steps = [];
    if (!g.data.player?.approvedForGame) steps.push({ label: G.stepApproveNft, address: c.nft, abi: ABI.LightdiveNFT, functionName: "setApprovalForAll", args: [c.expedition, true] });
    steps.push({ label: G.stepAssemble, address: c.expedition, abi: ABI.Expedition, functionName: "equip", args: [spire.id, prism?.id ?? 0n, chosenSeekers.map((s) => s.id)] });
    if (await g.run(steps)) {
      sfx.success();
      setSeats([]);
      setPrismId(null);
    } else sfx.fail();
  };
  const disband = async () => {
    if (!team) return;
    if (await g.run([{ label: G.stepDisband, address: c.expedition, abi: ABI.Expedition, functionName: "unequip", args: [team.spire.id] }])) sfx.success();
  };

  if (all.length === 0) {
    return (
      <div className="ldg-panel-view">
        <section className="ldg-card-panel ldg-empty-hangar">
          <h2>{t(A.hangarTitle)}</h2>
          <p>{t(G.noSpires)}</p>
          <button type="button" className="rv-btn rv-btn--primary" onClick={() => go("summon")}>{t(A.summonTitle)}</button>
        </section>
      </div>
    );
  }

  return (
    <div className="ldg-hangar">
      <aside className="ldg-hangar__list" aria-label={t(A.yourSpires)}>
        <h2 className="ldg-sub">{t(A.yourSpires)}</h2>
        {all.map((s) => {
          const tm = teams.find((x) => x.spire.id === s.id);
          return (
            <button key={String(s.id)} type="button" className={`ldg-spire-row${current === s.id ? " is-on" : ""}`} style={{ ["--rc" as string]: RARITY_COLOR[s.attributes.rarity] }} onClick={() => pick(s.id)}>
              <NftArt a={s.attributes} className="ldg-spire-row__art" />
              <span>
                <b>{nftName(t, s)} #{String(s.id)}</b>
                <small>{t(RARITY[s.attributes.rarity])} · Lv.{s.attributes.trait}</small>
                <i className={tm ? "is-assembled" : ""}>{tm ? `${t(A.assembled)} · ✦ ${tm.luminance}` : t(A.docked)}</i>
              </span>
            </button>
          );
        })}
      </aside>

      <section className="ldg-bay" style={{ ["--rc" as string]: spire ? RARITY_COLOR[spire.attributes.rarity] : undefined }}>
        <p className="ldg-dim ldg-small ldg-bay__lead">{t(A.hangarLead)}</p>
        {spire && (
          <>
            <div className="ldg-bay__stage">
              <button type="button" className={`ldg-slot ldg-slot--mount${prism ? " is-filled" : ""}`} disabled={!!team || !prism} onClick={() => setPrismId(null)} aria-label={t(A.mount)}>
                {prism ? <NftArt a={prism.attributes} /> : <Plus aria-hidden="true" />}
                <small>{prism ? `${nftName(t, prism)} · ✦${prism.attributes.luminance}` : `${t(A.mount)} · ${t(G.emptyMount)}`}</small>
              </button>
              <div className="ldg-bay__spire">
                <SpireArt rarity={spire.attributes.rarity} level={spire.attributes.trait} variant={spire.attributes.variant} />
              </div>
              <div className="ldg-bay__seats">
                {Array.from({ length: level }, (_, i) => {
                  const sk = crew[i];
                  return (
                    <button key={i} type="button" className={`ldg-slot${sk ? " is-filled" : ""}`} disabled={!!team || !sk} onClick={() => sk && seatSeeker(sk)} aria-label={fill(t(A.seat), { n: i + 1 })}>
                      {sk ? <NftArt a={sk.attributes} /> : <Plus aria-hidden="true" />}
                      <small>{sk ? `#${sk.id} · ✦${sk.attributes.luminance}` : fill(t(A.seat), { n: i + 1 })}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="ldg-meter" aria-label={t(G.totalLum)}>
              <div className="ldg-meter__head">
                <span>{t(G.totalLum)} <b>{lum || "—"}</b></span>
                {reach >= 0 && lum > 0 && <span className="ldg-pill ldg-pill--ok"><i />{fill(t(G.reaches), { d: DEPTH[reach] })}</span>}
              </div>
              <div className="ldg-meter__bar">
                <i style={{ width: `${Math.min(100, (lum / METER_MAX) * 100)}%` }} />
                {o.depthMinLuminance.map((min, i) => (
                  <span key={i} className={lum >= min ? "is-reached" : ""} style={{ left: `${(min / METER_MAX) * 100}%` }}><b>{DEPTH[i]}</b><small>{min}</small></span>
                ))}
              </div>
              {!team && crew.length > 0 && crew.length < level && <p className="ldg-dim ldg-small">{t(G.seatWaste)}</p>}
            </div>

            <div className="ldg-bay__actions">
              {team ? (
                <>
                  <span className="ldg-dim ldg-small"><Lock aria-hidden="true" /> {t(A.crewLocked)}</span>
                  <button type="button" className="rv-btn rv-btn--secondary" onClick={() => void disband()} disabled={!!g.tx?.running} title={t(G.disbandNote)}>{t(G.disband)}</button>
                </>
              ) : (
                <>
                  <button type="button" className="rv-btn rv-btn--ghost" onClick={autoFill} disabled={seekers.length === 0}><Wand2 aria-hidden="true" />{t(G.autoFill)}</button>
                  <button type="button" className="rv-btn rv-btn--ghost" onClick={() => { setSeats([]); setPrismId(null); }} disabled={seats.length === 0 && prismId === null}><X aria-hidden="true" />{t(G.clear)}</button>
                  <button type="button" className="rv-btn rv-btn--primary rv-btn--lg" disabled={crew.length === 0 || o.paused.expedition || !!g.tx?.running} onClick={() => void assemble()}>{t(G.assembleBtn)}</button>
                </>
              )}
            </div>
          </>
        )}
      </section>

      {!team && spire && (
        <section className="ldg-tray" aria-label={t(A.tray)}>
          <header>
            <div className="ldg-seg" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "seekers"} className={tab === "seekers" ? "is-on" : ""} onClick={() => setTab("seekers")}>{t(A.seekersTab)} <small>{seekers.length}</small></button>
              <button type="button" role="tab" aria-selected={tab === "prisms"} className={tab === "prisms" ? "is-on" : ""} onClick={() => setTab("prisms")}>{t(A.prismsTab)} <small>{d.prisms.length}</small></button>
            </div>
            <small className="ldg-dim">{t(A.trayHint)}</small>
          </header>
          {tab === "seekers" ? (
            seekers.length === 0 ? <p className="ldg-dim">{t(G.noSeekers)} <button type="button" className="rv-link" onClick={() => go("summon")}>{t(A.summonTitle)} →</button></p> : (
              <div className="ldg-tray__grid">
                {seekers.map((s) => <NftCard key={String(s.id)} n={s} compact selected={seats.includes(s.id)} disabled={!seats.includes(s.id) && seats.length >= level} onClick={() => seatSeeker(s)} />)}
              </div>
            )
          ) : d.prisms.length === 0 ? <p className="ldg-dim">{t(G.noPrism)}</p> : (
            <div className="ldg-tray__grid">
              {d.prisms.map((p) => <NftCard key={String(p.id)} n={p} compact selected={prismId === p.id} onClick={() => mountPrism(p)} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
