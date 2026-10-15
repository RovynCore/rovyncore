"use client";

// 碑原: build teams. Every spire with its status on the left, the stage in the middle (prism on top, seeker
// berths around the spire), and what this team can do today on the right: power, reach, risk, attunement, life.
import { useState } from "react";
import { Check, Eraser, PenLine, Plus, Rocket, X } from "lucide-react";
import { DESTINATIONS, DIVES_PER_DAY, DIVES_PER_TEAM_PER_DAY, MAX_TEAM, MAX_TEAMS, VOYAGES, attunement, clusterRange, teamPower, type Kind } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { NftArt } from "../game/art";
import { PageHead } from "../game/hud";
import { play } from "./audio";
import { TEAM_NAME_MAX, divesOn, owned, teamInput, teamName, type Sim, type SimNft, type SimTeam } from "./sim";
import { BatchSell } from "./batch-sell";
import { CountUp, Modal, RarityGem, RarityTag, Tile, Trait, Voyages } from "./kit";
import { BEAM, BEAM_HINT, CIRCLED, CLUSTER_HUE, ERROR, KIND, LIGHT, LIGHT_COLOR, RARITY_COLOR, SLOT } from "./copy";
import type { View } from "./pages";
import { gap, tl } from "@/lib/lightdive-v3/i18n";

const TEAM_KEY = "lightdive:v3:team";
const LOW = 6; // voyages left: about two days at three dives a day

const destName = (id: number) => {
  const d = DESTINATIONS[id];
  return `${CIRCLED[d.cluster]}${SLOT[d.slot]} ${TEXTS.clusters[d.cluster].destinations[d.slot].name}`;
};
const usable = (n: SimNft) => owned(n) && n.dockedAt === undefined && n.listed === undefined;

type Status = { label: string; tone: "go" | "busy" | "done" | "empty" };

function statusOf(sim: Sim, spire: number): Status {
  const s = sim.state!;
  const team = s.teams.find((t) => t.spire === spire);
  if (s.dives.some((d) => d.spire === spire && !d.result)) return { label: tl("光橋上"), tone: "busy" };
  if (s.dives.some((d) => d.spire === spire && d.pending)) return { label: tl("待收取"), tone: "busy" };
  if (!team) return s.teams.length >= MAX_TEAMS ? { label: tl("隊伍已滿"), tone: "done" } : { label: tl("未組隊"), tone: "empty" };
  if (!team.seekers.length) return { label: tl("缺探索者"), tone: "empty" };
  if (sim.chain?.drafts.includes(spire)) return { label: tl("未儲存"), tone: "empty" }; // live game: saved with the dive or the save bar
  const today = divesOn(s, sim.today).filter((d) => d.spire === spire).length;
  if (today >= DIVES_PER_TEAM_PER_DAY) return { label: tl("今天已滿"), tone: "done" };
  return { label: tl("可出發"), tone: "go" };
}

export function Plain({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const s = sim.state!;
  const byId = (id: number) => s.nfts.find((n) => n.id === id)!;
  const teamFor = (id: number): SimTeam => s.teams.find((t) => t.spire === id) ?? { spire: id, seekers: [] };
  const powerOf = (id: number) => teamPower(teamInput(s, teamFor(id)));
  const spires = s.nfts.filter((n) => n.kind === 0 && usable(n)).sort((a, b) => b.trait - a.trait || b.power - a.power || a.id - b.id);
  const [sel, setSel] = useState<number | null>(() => { try { return Number(sessionStorage.getItem(TEAM_KEY)) || null; } catch { return null; } });
  const [picking, setPicking] = useState<null | { kind: Kind; index: number }>(null);
  const [delta, setDelta] = useState<{ v: number; k: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [choosingSpire, setChoosingSpire] = useState(false);
  const [freed, setFreed] = useState<number[] | null>(null); // cards a disbanded team left idle
  const [selling, setSelling] = useState<number[] | null>(null);
  const spire = spires.find((n) => n.id === sel) ?? spires.find((n) => s.teams.some((x) => x.spire === n.id)) ?? spires[0];
  const docked = s.nfts.filter((n) => n.kind === 0 && owned(n) && n.dockedAt !== undefined).length;

  if (!spire) {
    return (
      <div className="hud-page v3-plainpage">
        <PageHead kicker={tl("碑原 · 組隊")} icon="fleets" title={tl("碑原")} lead={tl("組隊要先有一座光塔。")} />
        <div className="v3-emptystate">
          <p>{docked ? tl("你的 {0} 座光塔都在停泊中，到光塔頁續航後就能再組隊。", { 0: docked }) : tl("你還沒有可以用的光塔。")}</p>
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => go(docked ? "spires" : "summon")}>{docked ? tl("前往光塔") : tl("前往召喚")}</button>
        </div>
      </div>
    );
  }

  const team = teamFor(spire.id);
  const input = teamInput(s, team);
  const power = teamPower(input);
  const busy = s.dives.some((d) => d.spire === spire.id && !d.result);
  const built = s.teams.length;
  // a spire without a team can't start one while the wallet already has the maximum number of teams
  const capped = !s.teams.some((x) => x.spire === spire.id) && built >= MAX_TEAMS;
  const prism = team.prism ? byId(team.prism) : undefined;
  const seekers = team.seekers.map(byId);
  const members = [spire, ...(prism ? [prism] : []), ...seekers];
  const reach = DESTINATIONS.filter((d) => power >= d.threshold);
  const deepest = reach.at(-1);
  const next = DESTINATIONS.find((d) => d.threshold > power);
  const todayDives = divesOn(s, sim.today).filter((d) => d.spire === spire.id).length;
  const ticketsLeft = Math.max(0, DIVES_PER_DAY - divesOn(s, sim.today).length);
  const attuned = team.seekers.length
    ? reach.map((d) => ({ d, bonus: attunement(input, sim.sky.lights[d.id]) })).filter((x) => x.bonus > 0).sort((a, b) => b.bonus - a.bonus || b.d.id - a.d.id)
    : [];
  const lowLife = members.filter((n) => n.voyages <= LOW).sort((a, b) => a.voyages - b.voyages);
  const free = (kind: Kind) => s.nfts.filter((n) => n.kind === kind && usable(n) && !s.teams.some((t) => t.prism === n.id || t.seekers.includes(n.id)));
  const freeSeekers = free(2).length;
  const freePrisms = free(1).length;
  const best = Math.max(0, ...spires.map((n) => powerOf(n.id)));
  const teamSpires = s.teams.map((x) => spires.find((n) => n.id === x.spire)).filter((n): n is SimNft => !!n);
  const freeSpires = spires.filter((n) => !s.teams.some((x) => x.spire === n.id));
  const building = teamSpires.some((n) => n.id === spire.id) ? null : spire; // chosen, no members yet

  const choose = (id: number) => {
    setSel(id);
    try { sessionStorage.setItem(TEAM_KEY, String(id)); } catch {}
    play("click");
  };
  const apply = async (t: SimTeam) => {
    if (busy) return;
    const v = teamPower(teamInput(s, t)) - power;
    const e = await sim.setTeam(t);
    setMsg(e ? ERROR[e] : null);
    if (!e && v) setDelta((p) => ({ v, k: (p?.k ?? 0) + 1 }));
  };
  const clear = () => {
    if (busy) return;
    const left = [spire.id, ...(team.prism ? [team.prism] : []), ...team.seekers];
    apply({ spire: spire.id, seekers: [] });
    setFreed(left);
    play("toggle");
  };
  const dive = () => {
    try { sessionStorage.setItem(TEAM_KEY, String(spire.id)); if (deepest) sessionStorage.setItem("lightdive:v3:focus", String((attuned[0]?.d ?? deepest).id)); } catch {}
    go("dive");
  };

  return (
    <div className="hud-page v3-plainpage">
      <PageHead kicker={tl("碑原 · 組隊")} icon="fleets" title={tl("碑原")} lead={tl("把探索者送上光塔的泊位，裝上一面稜鏡。隊伍戰力 = 光塔 + 稜鏡 + 每位探索者。")} />
      <div className="v3-tiles is-6 v3-plain__summary">
        <Tile label={tl("隊伍")} value={`${built} / ${MAX_TEAMS}`} sub={tl("同時最多 {0} 支", { 0: MAX_TEAMS })} tone={built >= MAX_TEAMS ? "#f0c766" : undefined} />
        <Tile label={tl("今日出發令")} value={`${ticketsLeft} / ${DIVES_PER_DAY}`} tone="#c9ff55" />
        <Tile label={tl("最強隊伍")} value={best} sub={tl("戰力")} tone="#f0c766" />
        <Tile label={tl("閒置探索者")} value={freeSeekers} sub={freeSeekers ? tl("可以上隊") : tl("到召喚或市集取得")} />
        <Tile label={tl("閒置稜鏡")} value={freePrisms} />
        <Tile label={tl("停泊中的光塔")} value={docked} tone={docked ? "#ff9d6a" : undefined} />
      </div>

      <div className="v3-plain">
        <section className="v3-roster" aria-label={tl("我的隊伍")}>
          <h3>{tl("我的隊伍")} <em>{built}/{MAX_TEAMS}</em></h3>
          <div className="v3-roster__list">
            {Array.from({ length: MAX_TEAMS }, (_, i) => {
              const n = teamSpires[i];
              if (!n && building && i === teamSpires.length) {
                return (
                  <button key="new" type="button" className="v3-teamrow is-on is-new" style={{ ["--rc" as string]: RARITY_COLOR[building.rarity] }} aria-pressed="true" onClick={() => setChoosingSpire(true)}>
                    <span className="v3-teamrow__art"><NftArt a={{ kind: 0, rarity: building.rarity, trait: building.trait, variant: 0 }} /></span>
                    <span className="v3-teamrow__main">
                      <span className="v3-teamrow__name"><RarityGem rarity={building.rarity} size={15} />{tl("光塔 #{0}", { 0: building.id })}</span>
                      <span className="v3-teamrow__tags"><span className="v3-chip is-empty">{tl("組建中")}</span></span>
                      <small className="v3-teamrow__hint">{tl("放上探索者就成隊；點這裡換光塔")}</small>
                    </span>
                  </button>
                );
              }
              if (!n) {
                return (
                  <button key={`empty-${i}`} type="button" className="v3-teamslot" disabled={!!building || freeSpires.length === 0} onClick={() => setChoosingSpire(true)}>
                    <Plus aria-hidden="true" />
                    <span><b>{tl("組新隊伍")}</b><small>{freeSpires.length ? tl("選一座閒置的光塔（{0}）", { 0: freeSpires.length }) : tl("沒有閒置的光塔")}</small></span>
                  </button>
                );
              }
              const tm = teamFor(n.id);
              const st = statusOf(sim, n.id);
              const lowest = Math.min(n.voyages, ...[tm.prism, ...tm.seekers].filter((x): x is number => x !== undefined).map((x) => byId(x).voyages));
              return (
                <button key={n.id} type="button" className={`v3-teamrow${n.id === spire.id ? " is-on" : ""}`} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }} onClick={() => choose(n.id)} aria-pressed={n.id === spire.id}>
                  <span className="v3-teamrow__art"><NftArt a={{ kind: 0, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
                  <span className="v3-teamrow__main">
                    <span className="v3-teamrow__name"><RarityGem rarity={n.rarity} size={15} /><b>{s.teamNames?.[n.id] || tl("隊伍 {0}", { 0: i + 1 })}</b><small>{tl("光塔 #{0}", { 0: n.id })}</small></span>
                    <span className="v3-teamrow__seats" aria-label={tl("泊位 {0}/{1}，稜鏡 {2}/1", { 0: tm.seekers.length, 1: n.trait, 2: tm.prism ? 1 : 0 })}>
                      <i className={`is-prism${tm.prism ? " is-full" : ""}`} />
                      {Array.from({ length: n.trait }, (_, k) => {
                        const x = tm.seekers[k];
                        return <i key={k} className={x ? "is-full" : ""} style={x ? { ["--lc" as string]: LIGHT_COLOR[byId(x).trait] } : undefined} />;
                      })}
                    </span>
                    <span className="v3-teamrow__tags">
                      <span className={`v3-chip is-${st.tone}`}>{st.label}</span>
                      {lowest <= LOW && <span className="v3-chip is-warn">{tl("即將停泊")}</span>}
                    </span>
                  </span>
                  <span className="v3-teamrow__power"><b>{powerOf(n.id)}</b><small>{tl("戰力")}</small></span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="v3-stagewrap" aria-label={tl("光塔 #{0}", { 0: spire.id })}>
          <header className="v3-stagewrap__head">
            <div>
              <RarityTag rarity={spire.rarity} />
              <TeamName key={spire.id} sim={sim} spire={spire} />
            </div>
            <span className={`v3-chip is-${statusOf(sim, spire.id).tone}`}>{statusOf(sim, spire.id).label}</span>
          </header>
          <Stage spire={spire} team={team} byId={byId} busy={busy || capped} onPick={(kind, index) => { setPicking({ kind, index }); play("open"); }} onRemove={(id) => { apply({ ...team, prism: team.prism === id ? undefined : team.prism, seekers: team.seekers.filter((x) => x !== id) }); play("toggle"); }} />
          {busy && <p className="v3-notice is-busy">{tl("這支隊伍在光橋上，揭曉後才能調整。")}</p>}
          {capped && <p className="v3-notice is-cap">{tl("已經組了 {0} 支隊伍（上限）。要用這座光塔，先到其他光塔按「解散隊伍」。", { 0: MAX_TEAMS })}</p>}
          {msg && <p className="v3-error" role="alert">{msg}</p>}
          <div className="v3-stagewrap__actions">
            <button type="button" className="hud-btn hud-btn--ghost" disabled={busy || (!team.prism && !team.seekers.length)} onClick={clear}><Eraser aria-hidden="true" />{tl("解散隊伍")}</button>
            <button type="button" className="hud-btn hud-btn--primary" disabled={!team.seekers.length || busy || todayDives >= DIVES_PER_TEAM_PER_DAY || !ticketsLeft} onClick={dive}><Rocket aria-hidden="true" />{tl("帶這支隊伍去潛光")}</button>
          </div>
        </section>

        <section className="v3-teaminfo" aria-label={tl("隊伍數據")}>
          <div className="v3-teampower">
            <small>{tl("隊伍戰力")}</small>
            <div className="v3-teampower__num">
              <b><CountUp value={power} /></b>
              {delta && <em key={delta.k} className={delta.v > 0 ? "is-up" : "is-down"}>{delta.v > 0 ? "+" : ""}{delta.v}</em>}
            </div>
            <PowerBar spire={spire} prism={prism} seekers={seekers} power={power} />
            <ul className="v3-teampower__legend">
              <li><i className="is-spire" />{tl("光塔")} <b>{spire.power}</b></li>
              <li><i className="is-prism" />{tl("稜鏡")} <b>{prism?.power ?? 0}</b></li>
              <li><i className="is-seeker" />{tl("探索者 ×{0}", { 0: seekers.length })} <b>{seekers.reduce((a, n) => a + n.power, 0)}</b></li>
            </ul>
          </div>
          <div className="v3-tiles is-2">
            <Tile label={tl("可前往")} value={`${reach.length} / 24`} sub={deepest ? tl("最深 {0}", { 0: destName(deepest.id) }) : tl("還到不了任何目的地")} />
            <Tile label={tl("下一個目的地")} value={next ? tl("還差 {0}", { 0: next.threshold - power }) : tl("全部可達")} sub={next ? tl("{0}（{1}）", { 0: destName(next.id), 1: next.threshold }) : undefined} tone={next ? undefined : "#c9ff55"} />
            <Tile label={tl("風險風格")} value={prism ? `${BEAM[prism.trait]} · ${BEAM_HINT[prism.trait]}` : `${BEAM[1]} · ${BEAM_HINT[1]}`} sub={prism ? tl("由稜鏡決定") : tl("沒裝稜鏡時的預設")} />
            <Tile label={tl("這隊今天")} value={`${todayDives} / ${DIVES_PER_TEAM_PER_DAY}`} sub={tl("已出發次數")} />
          </div>
          <div className="v3-teaminfo__block">
            <h4>{tl("今天同頻")} <em>{attuned.length}</em></h4>
            {attuned.length ? (
              <ul className="v3-attune">
                {attuned.slice(0, 6).map(({ d, bonus }) => (
                  <li key={d.id} style={{ ["--lc" as string]: LIGHT_COLOR[sim.sky.lights[d.id]], ["--hue" as string]: CLUSTER_HUE[d.cluster] }}>
                    <span>{destName(d.id)}</span>
                    <i>{LIGHT[sim.sky.lights[d.id]]}</i>
                    <b>+{((bonus / power) * 100).toFixed(1)}%</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="v3-muted">{team.seekers.length ? tl("今天你到得了的目的地，光紋都對不上。") : tl("放上探索者後會顯示。")}</p>
            )}
          </div>
          <div className="v3-teaminfo__block">
            <h4>{tl("航程")} {lowLife.length ? <em className="is-warn">{tl("{0} 張快用完", { 0: lowLife.length })}</em> : null}</h4>
            <ul className="v3-life">
              {[...members].sort((a, b) => a.voyages / VOYAGES[a.kind] - b.voyages / VOYAGES[b.kind]).slice(0, 4).map((n) => (
                <li key={n.id} className={n.voyages <= LOW ? "is-low" : ""}>
                  <span><RarityGem rarity={n.rarity} size={13} />{KIND[n.kind]} #{n.id}</span>
                  <Voyages n={n} />
                </li>
              ))}
            </ul>
            {lowLife.length > 0 && <p className="v3-muted">{tl("航程用完會停泊，7 天內可以續航一次。")}</p>}
          </div>
        </section>
      </div>

      {choosingSpire && (
        <Modal label={tl("選一座光塔")} onClose={() => setChoosingSpire(false)} className="v3-picker">
          <header className="v3-picker__head">
            <span className="hud-kicker">{tl("組新隊伍 · {0}", { 0: built })}/{MAX_TEAMS}</span>
            <h2>{tl("選一座閒置的光塔")}</h2>
          </header>
          <div className="v3-picker__grid">
            {freeSpires.map((n) => (
              <button key={n.id} type="button" className="v3-pickcard" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }} onClick={() => { choose(n.id); setChoosingSpire(false); }}>
                <span className="v3-pickcard__art"><NftArt a={{ kind: 0, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
                <RarityTag rarity={n.rarity} compact />
                <span className="v3-pickcard__power"><b>{n.power}</b></span>
                <Trait n={n} />
                <Voyages n={n} />
              </button>
            ))}
            {!freeSpires.length && <p className="v3-empty">{tl("沒有閒置的光塔，可以到召喚或市集取得。")}</p>}
          </div>
        </Modal>
      )}
      {picking && (
        <Picker sim={sim} team={team} spire={spire} slot={picking} onClose={() => setPicking(null)}
          onPick={async (n, from) => {
            if (from) await sim.setTeam({ ...from, prism: from.prism === n.id ? undefined : from.prism, seekers: from.seekers.filter((x) => x !== n.id) });
            if (picking.kind === 1) void apply({ ...team, prism: n.id });
            else {
              const list = [...team.seekers];
              if (picking.index < list.length) list[picking.index] = n.id; else list.push(n.id);
              void apply({ ...team, seekers: list });
            }
            play("click");
            setPicking(null);
          }}
          onRemove={(id) => { apply({ ...team, prism: team.prism === id ? undefined : team.prism, seekers: team.seekers.filter((x) => x !== id) }); play("toggle"); setPicking(null); }} />
      )}
      {freed && (
        <Modal label={tl("隊伍已解散")} onClose={() => setFreed(null)} className="v3-freed">
          <span className="hud-kicker"><Eraser aria-hidden="true" />{tl("隊伍已解散")}</span>
          <h2>{tl("這 {0} 張卡現在閒置", { 0: freed.length })}</h2>
          <p>{tl("可以留著之後再組隊，或上架到市集讓其他觀測者使用。閒置的卡仍然佔著全服的數量上限，直到它被用掉或歸航。")}</p>
          <ul className="v3-freed__cards">
            {freed.map(byId).filter((n): n is SimNft => !!n).map((n) => (
              <li key={n.id} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
                <span className="v3-freed__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
                <b>{KIND[n.kind]} #{n.id}</b>
                <small>{tl("戰力 {0}", { 0: n.power })}</small>
              </li>
            ))}
          </ul>
          <div className="v3-modal__actions">
            <button type="button" className="hud-btn hud-btn--ghost" onClick={() => setFreed(null)}>{tl("留著")}</button>
            <button type="button" className="hud-btn hud-btn--primary" onClick={() => { setSelling(freed); setFreed(null); }}>{tl("上架這些卡")}</button>
          </div>
        </Modal>
      )}
      {selling && <BatchSell sim={sim} picked={selling} onClose={() => setSelling(null)} onDone={(m) => { setMsg(m); setSelling(null); }} />}
    </div>
  );
}

/** Power as a bar up to 1200, split into spire, prism and each seeker, with the cluster starts marked. The scale is a
 *  square root so the six cluster marks are spread out instead of crowding at the start. */
function PowerBar({ spire, prism, seekers, power }: { spire: SimNft; prism?: SimNft; seekers: SimNft[]; power: number }) {
  const x = (v: number) => Math.sqrt(Math.max(0, v) / MAX_TEAM) * 100;
  const parts = [{ id: "spire", cls: "is-spire", v: spire.power, lc: undefined as string | undefined }, ...(prism ? [{ id: "prism", cls: "is-prism", v: prism.power, lc: undefined }] : []), ...seekers.map((n) => ({ id: `s${n.id}`, cls: "is-seeker", v: n.power, lc: LIGHT_COLOR[n.trait] }))];
  let sum = 0;
  return (
    <div className="v3-powerbar" role="img" aria-label={tl("戰力 {0}，最高 {1}", { 0: power, 1: MAX_TEAM })}>
      <span className="v3-powerbar__fill">
        {parts.map((p) => {
          const from = x(sum);
          sum += p.v;
          return <i key={p.id} className={p.cls} style={{ width: `${x(sum) - from}%`, ...(p.lc ? { ["--lc" as string]: p.lc } : {}) }} />;
        })}
      </span>
      {[0, 1, 2, 3, 4, 5].map((c) => {
        const at = clusterRange(c)[0];
        return <em key={c} className={power >= at ? "is-reached" : ""} style={{ left: `${x(at)}%`, ["--hue" as string]: CLUSTER_HUE[c] }} title={tl("{0} {1}：{2}", { 0: CIRCLED[c], 1: TEXTS.clusters[c].name, 2: at })}>{CIRCLED[c]}</em>;
      })}
    </div>
  );
}

/** The spire on its stele with the prism mount above and the seeker berths around it. */
function Stage({ spire, team, byId, busy, onPick, onRemove }: {
  spire: SimNft; team: SimTeam; byId: (id: number) => SimNft; busy: boolean;
  onPick: (kind: Kind, index: number) => void; onRemove: (id: number) => void;
}) {
  const seats = spire.trait;
  const seatAt = (i: number) => {
    // berths sit on the sides and below the spire; the top is the prism mount
    const a = -0.12 * Math.PI + 1.24 * Math.PI * ((i + 0.5) / seats);
    return { left: `${50 + Math.cos(a) * 34}%`, top: `${54 + Math.sin(a) * 33}%` };
  };
  const prism = team.prism ? byId(team.prism) : undefined;
  return (
    <div className={`v3-stage${busy ? " is-busy" : ""}${team.seekers.length ? " is-ready" : ""}`} style={{ ["--rc" as string]: RARITY_COLOR[spire.rarity] }}>
      <svg className="v3-stage__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="v3-stage-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="currentColor" stopOpacity="0.05" /><stop offset="1" stopColor="currentColor" stopOpacity="0.55" /></linearGradient>
        </defs>
        {[{ left: "50%", top: "15%" }, ...Array.from({ length: seats }, (_, i) => seatAt(i))].map((p, i) => {
          const filled = i === 0 ? !!team.prism : !!team.seekers[i - 1];
          return <line key={i} x1="50" y1="52" x2={parseFloat(p.left)} y2={parseFloat(p.top)} className={filled ? "is-full" : ""} />;
        })}
      </svg>
      <div className="v3-stage__floor" aria-hidden="true" />
      <div className="v3-stage__spire">
        <NftArt a={{ kind: 0, rarity: spire.rarity, trait: spire.trait, variant: 0 }} className="v3-stage__art" />
        <span className="v3-stage__label"><b>{spire.power}</b> {tl("光塔")}</span>
      </div>
      <Seat n={prism} label={tl("稜鏡座")} style={{ left: "50%", top: "15%" }} prism busy={busy} onAdd={() => onPick(1, 0)} onRemove={() => prism && onRemove(prism.id)} />
      {Array.from({ length: seats }, (_, i) => {
        const id = team.seekers[i];
        const n = id ? byId(id) : undefined;
        return <Seat key={i} n={n} label={tl("泊位 {0}", { 0: i + 1 })} style={seatAt(i)} busy={busy} onAdd={() => onPick(2, i)} onRemove={() => n && onRemove(n.id)} />;
      })}
    </div>
  );
}

function Seat({ n, label, style, prism, busy, onAdd, onRemove }: { n?: SimNft; label: string; style: React.CSSProperties; prism?: boolean; busy: boolean; onAdd: () => void; onRemove: () => void }) {
  if (!n) {
    return (
      <button type="button" className={`v3-seat${prism ? " is-prism" : ""}`} style={style} disabled={busy} onClick={onAdd} aria-label={tl("{0}：放上{1}", { 0: label, 1: prism ? tl("稜鏡") : tl("探索者") })}>
        <Plus aria-hidden="true" />
        <small>{label}</small>
      </button>
    );
  }
  return (
    <div className={`v3-seat is-full${prism ? " is-prism" : ""}`} style={{ ...style, ["--rc" as string]: RARITY_COLOR[n.rarity], ["--lc" as string]: n.kind === 2 ? LIGHT_COLOR[n.trait] : RARITY_COLOR[n.rarity] }}>
      <button type="button" className="v3-seat__body" disabled={busy} onClick={onAdd} aria-label={tl("更換 {0} #{1}", { 0: KIND[n.kind], 1: n.id })}>
        <NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} className="v3-seat__art" />
        <RarityGem rarity={n.rarity} size={14} className="v3-seat__gem" />
      </button>
      <small><b>{n.power}</b>{n.kind === 2 ? <i style={{ color: LIGHT_COLOR[n.trait] }}>{LIGHT[n.trait]}</i> : <i>{BEAM[n.trait]}</i>}</small>
      {!busy && <button type="button" className="v3-seat__x" onClick={onRemove} aria-label={tl("拿下 {0} #{1}", { 0: KIND[n.kind], 1: n.id })}><X aria-hidden="true" /></button>}
    </div>
  );
}

type PickSort = "power" | "voyages" | "attune" | "opens";

/** Choose who goes into a berth or onto the prism mount. Cards on other idle teams can be moved over. */
function Picker({ sim, team, spire, slot, onClose, onPick, onRemove }: {
  sim: Sim; team: SimTeam; spire: SimNft; slot: { kind: Kind; index: number };
  onClose: () => void; onPick: (n: SimNft, from?: SimTeam) => void; onRemove: (id: number) => void;
}) {
  const s = sim.state!;
  const [light, setLight] = useState<number | null>(null);
  const [sort, setSort] = useState<PickSort>("power");
  const [others, setOthers] = useState(false);
  const currentId = slot.kind === 1 ? team.prism : team.seekers[slot.index];
  const current = currentId ? s.nfts.find((n) => n.id === currentId) : undefined;
  const busySpires = new Set(s.dives.filter((d) => !d.result).map((d) => d.spire));
  const homeOf = (id: number) => s.teams.find((t) => t.prism === id || t.seekers.includes(id));
  const power = teamPower(teamInput(s, team));
  const reach = DESTINATIONS.filter((d) => power >= d.threshold);
  const attuneCount = (l: number) => reach.filter((d) => sim.sky.lights[d.id] === l).length;
  // what this card would do to the team: its real power change and how many destinations it would open
  const withCard = (n: SimNft) => {
    const next: SimTeam = slot.kind === 1 ? { ...team, prism: n.id } : { ...team, seekers: [...team.seekers.slice(0, slot.index), n.id, ...team.seekers.slice(slot.index + 1)].filter((x) => x !== undefined) };
    const p = teamPower(teamInput(s, next));
    const opens = DESTINATIONS.filter((d) => p >= d.threshold && power < d.threshold);
    return { gain: p - power, opens };
  };
  const pool = s.nfts
    .filter((n) => n.kind === slot.kind && usable(n) && n.id !== currentId)
    .map((n) => ({ n, from: homeOf(n.id) }))
    .filter(({ from }) => !from || (others && from.spire !== team.spire && !busySpires.has(from.spire)))
    .filter(({ from }) => !(from && from.spire === team.spire))
    .filter(({ n }) => light === null || n.trait === light)
    .sort((a, b) => (sort === "power" ? b.n.power - a.n.power : sort === "voyages" ? b.n.voyages - a.n.voyages : sort === "opens" ? withCard(b.n).opens.length - withCard(a.n).opens.length || b.n.power - a.n.power : attuneCount(b.n.trait) - attuneCount(a.n.trait) || b.n.power - a.n.power));
  const onOtherTeams = s.nfts.filter((n) => n.kind === slot.kind && usable(n) && homeOf(n.id) && homeOf(n.id)!.spire !== team.spire).length;
  const lights = [0, 1, 2, 3, 4, 5].map((l) => ({ l, today: attuneCount(l) }));
  return (
    <Modal label={slot.kind === 1 ? tl("選擇稜鏡") : tl("第 {0} 泊位", { 0: slot.index + 1 })} onClose={onClose} className="v3-picker">
      <header className="v3-picker__head">
        <span className="hud-kicker">{tl("光塔 #{0}", { 0: spire.id })} · {slot.kind === 1 ? tl("稜鏡座") : tl("泊位 {0}", { 0: slot.index + 1 })}</span>
        <h2>{slot.kind === 1 ? tl("裝上一面稜鏡") : tl("派一位探索者上去")}</h2>
      </header>
      {current && (
        <div className="v3-picker__current" style={{ ["--rc" as string]: RARITY_COLOR[current.rarity] }}>
          <span className="v3-picker__thumb"><NftArt a={{ kind: current.kind, rarity: current.rarity, trait: current.trait, variant: 0 }} /></span>
          <span><small>{tl("目前")}</small><b>{KIND[current.kind]} #{current.id}</b><span><RarityTag rarity={current.rarity} compact /> {tl("戰力 {0}", { 0: current.power })} · <Trait n={current} /></span></span>
          <button type="button" className="hud-btn hud-btn--ghost" onClick={() => onRemove(current.id)}>{tl("拿下")}</button>
        </div>
      )}
      <div className="v3-toolbar">
        {slot.kind === 2 && (
          <div className="hud-seg v3-lightseg" role="group" aria-label={tl("光紋")}>
            <button type="button" className={light === null ? "is-on" : ""} onClick={() => setLight(null)}>{tl("全部")}</button>
            {lights.map(({ l, today }) => (
              <button key={l} type="button" className={light === l ? "is-on" : ""} onClick={() => setLight(l)} style={{ ["--lc" as string]: LIGHT_COLOR[l] }}>
                <i />{LIGHT[l]}{today ? <em>{today}</em> : null}
              </button>
            ))}
          </div>
        )}
        <label className="v3-select">{tl("排序")}
          <select className="hud-select" value={sort} onChange={(e) => setSort(e.target.value as PickSort)}>
            <option value="power">{tl("戰力")}</option>
            <option value="opens">{tl("解鎖目的地多")}</option>
            <option value="voyages">{tl("剩餘航程")}</option>
            {slot.kind === 2 && <option value="attune">{tl("今天同頻多")}</option>}
          </select>
        </label>
        {onOtherTeams > 0 && (
          <label className="v3-check"><input type="checkbox" checked={others} onChange={(e) => setOthers(e.target.checked)} />{tl("顯示其他隊伍的（{0}）", { 0: onOtherTeams })}</label>
        )}
      </div>
      {slot.kind === 2 && <p className="v3-muted">{tl("數字是今天這支隊伍到得了、而且光紋相同的目的地數；同頻的探索者那一趟多帶回 15% 自身戰力（整隊最多 +10%）。")}</p>}
      <div className="v3-picker__grid">
        {pool.map(({ n, from }) => {
          const { gain: d, opens } = withCard(n);
          const first = opens[0];
          return (
            <button key={n.id} type="button" className="v3-pickcard" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }} onClick={() => onPick(n, from)}>
              <span className="v3-pickcard__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
              <RarityTag rarity={n.rarity} compact />
              <span className="v3-pickcard__power"><b>{n.power}</b><em className={d >= 0 ? "is-up" : "is-down"}>{d >= 0 ? "+" : ""}{d}</em></span>
              <Trait n={n} />
              {n.kind === 2 && <span className="v3-pickcard__attune">{tl("今天同頻")} <b>{attuneCount(n.trait)}</b> {tl("處")}</span>}
              {opens.length > 0 && first && <span className="v3-pickcard__opens" title={opens.map((x) => TEXTS.clusters[x.cluster].destinations[x.slot].name).join(tl("、"))}>{tl("解鎖")} <b>{opens.length}</b> {tl("處 · {0}{1} {2}", { 0: CIRCLED[first.cluster], 1: SLOT[first.slot], 2: TEXTS.clusters[first.cluster].destinations[first.slot].name })}{opens.length > 1 ? tl(" 等") : ""}</span>}
              <Voyages n={n} />
              {from && <span className="v3-pickcard__from">{tl("在「{0}」上，選了會移過來", { 0: teamName(s, from.spire) })}</span>}
            </button>
          );
        })}
        {!pool.length && <p className="v3-empty">{tl("沒有可用的{0}。", { 0: KIND[slot.kind] })}{slot.kind === 2 ? gap() + tl("可以到召喚或市集取得。") : ""}</p>}
      </div>
    </Modal>
  );
}

/** The team's name, renamed in place: click the pencil, type, Enter (or the tick) to keep, Escape to drop. */
function TeamName({ sim, spire }: { sim: Sim; spire: SimNft }) {
  const given = sim.state!.teamNames?.[spire.id] ?? "";
  const [edit, setEdit] = useState<string | null>(null);
  const save = () => {
    if (edit === null) return;
    sim.nameTeam(spire.id, edit);
    setEdit(null);
    play("toggle");
  };
  if (edit !== null) {
    return (
      <form className="v3-teamname is-edit" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <input autoFocus value={edit} maxLength={TEAM_NAME_MAX} placeholder={tl("光塔 #{0}", { 0: spire.id })} aria-label={tl("隊伍名稱")}
          onChange={(e) => setEdit(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setEdit(null); } }} />
        <small>{[...edit].length}/{TEAM_NAME_MAX}</small>
        <button type="submit" className="hud-icon" aria-label={tl("儲存名稱")}><Check aria-hidden="true" /></button>
        <button type="button" className="hud-icon" aria-label={tl("取消")} onClick={() => setEdit(null)}><X aria-hidden="true" /></button>
      </form>
    );
  }
  return (
    <div className="v3-teamname">
      <h2>{given || tl("光塔 #{0}", { 0: spire.id })}</h2>
      {given && <small>{tl("光塔 #{0}", { 0: spire.id })}</small>}
      <button type="button" className="hud-icon" aria-label={tl("為隊伍命名")} title={tl("為隊伍命名")} onClick={() => setEdit(given)}><PenLine aria-hidden="true" /></button>
    </div>
  );
}
