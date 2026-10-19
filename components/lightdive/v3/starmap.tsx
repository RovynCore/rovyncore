"use client";

// Dive page for the v3 preview: star map -> cluster -> destination -> confirm, then voyage choices,
// the reveal, and a live log of everyone's dives on the right.
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Galaxy as GalaxyGl, GalaxyState } from "./galaxy-engine";
import { Burst, Dispatch, Ranking, ShareButtons } from "./extras";
import { play, useAmbience, useMusic } from "./audio";
import { CLUSTER_IMAGES, GALAXY_IMAGE } from "@/lib/lightdive-v3/credits";
import { ArrowLeft, Lock, Rocket, X } from "lucide-react";
import {
  DEEP_MIN_CLUSTER, DESTINATIONS, DIVES_PER_DAY, DIVES_PER_TEAM_PER_DAY, baseReward, basePoints, clusterRange, destinationBase, outcomesOf, overflowPoints, planDive, teamPower,
  type Choice, type DivePlan,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { deciding, passesOn, stabilityOf, teamInput, teamName, teamOut, turning, type Sim, type SimDive, type SimState } from "./sim";
import { SUPPLIES, SupplyPrompt, forgetSupply, rememberedSupply, type Departure } from "./provisions";
import { commissionTitle, readyBonus } from "./commissions";
import { unlocksOf } from "./unlocks";
import { bestTitle, openProfile, recordsOf } from "./logbook";
import { VoyageLog } from "./voyage";
import { BeamIcon, LightIcon, flyLight } from "./kit";
import { fxQuality } from "./settings";
import {
  BEAM, BEAM_HINT, CHOICE, CIRCLED, CLUSTER_HUE, ERROR, LIGHT, LIGHT_COLOR, OUTCOME, OUTCOME_TONE, RISK, SLOT, STAR, ago, clock, fmt, pct,
} from "./copy";
import { gameLocale, tl, localized } from "@/lib/lightdive-v3/i18n";

type TeamView = { spire: number; power: number; name: string; busy: boolean; waiting: boolean; teamToday: number };

function teamsOf(s: SimState, today: number): TeamView[] {
  return s.teams
    .filter((t) => t.seekers.length > 0)
    .map((t) => {
      const spire = s.nfts.find((n) => n.id === t.spire)!;
      return {
        spire: t.spire,
        power: teamPower(teamInput(s, t)),
        name: teamName(s, spire.id),
        busy: teamOut(s, t.spire),
        waiting: s.dives.some((d) => d.spire === t.spire && d.pending),
        teamToday: passesOn(s, today, t.spire),
      };
    })
    .sort((a, b) => b.power - a.power);
}

export function StarMap({ sim, say }: { sim: Sim; say: (line: string) => void }) {
  const s = sim.state!;
  // The lobby forecast can open a destination directly (stored for one visit).
  const [focus] = useState(() => { try { const v = sessionStorage.getItem("lightdive:v3:focus"); sessionStorage.removeItem("lightdive:v3:focus"); return v === null ? null : Number(v); } catch { return null; } });
  const [cluster, setCluster] = useState<number | null>(focus === null ? null : DESTINATIONS[focus].cluster);
  const [dest, setDest] = useState<number | null>(focus);
  const [watch, setWatch] = useState<number | null>(() => { // the voyage whose screen is open; the lobby can ask for one
    try { const v = sessionStorage.getItem("lightdive:v3:watch"); sessionStorage.removeItem("lightdive:v3:watch"); return v === null ? null : Number(v); } catch { return null; }
  });
  const [hover, setHover] = useState<number | null>(null);
  const [dispatching, setDispatching] = useState(false);
  useAmbience(true);
  useMusic(cluster !== null && cluster >= 3 ? "deep" : "map");
  const gl = useRef<GalaxyGl | null>(null);
  const clusterBox = useRef<HTMLDivElement>(null);
  // the voyage screen covers the map and draws its own scene: the map's stops while it is open
  const covered = watch !== null && dest === null;
  useEffect(() => { gl.current?.pause(covered); }, [covered]);
  // Reveal cards show for dives that resolve after this page opened.
  const [seenUpTo, setSeenUpTo] = useState(() => Math.max(0, ...s.dives.filter((d) => d.result).map((d) => d.id)));
  const teams = teamsOf(s, sim.today);
  const best = teams[0]?.power ?? 0;
  const used = passesOn(s, sim.today);

  // A result pops up once when it comes back; its reward only counts after the player collects it.
  const revealed = s.dives.find((d) => d.result && d.pending && d.id > seenUpTo);
  // when the voyage screen of the revealed dive is open, its arrival plays first and the dialog skips the radar scan
  const [arrived, setArrived] = useState<number | null>(null);
  const arriving = !!revealed && watch === revealed.id && arrived !== revealed.id;
  const waiting = s.dives.filter((d) => d.pending);
  const collectOne = async (d: SimDive) => {
    await sim.collect([d.id]);
    play("claim");
    const where = spotOf(d.dest);
    if (where) {
      const tone = OUTCOME_TONE[d.result!.outcome];
      gl.current?.float(where.x, where.y, d.result!.outcome === "empty" ? tl("空手而歸") : `+${fmt(d.reward ?? 0)}`, tone);
      if (d.result!.outcome !== "empty") gl.current?.burst(where.x, where.y, tone);
    }
    const pool = d.result!.wear > 1 ? TEXTS.rovyn.outcome.wear : TEXTS.rovyn.outcome[d.result!.outcome];
    say(pool[d.id % pool.length]);
  };
  // Collect every waiting result at once; Rovyn sums them up.
  const collectAll = async () => {
    if (!waiting.length) return;
    setSeenUpTo(Math.max(seenUpTo, ...waiting.map((d) => d.id)));
    const total = await sim.collect();
    play("claim");
    const best = waiting.reduce((a, d) => (d.result!.multX100 > a.result!.multX100 ? d : a));
    say(tl("{0} 道光橋的光都收下了，一共 {1}，最好的一趟是 ×{2}。", { 0: waiting.length, 1: fmt(total), 2: (best.result!.multX100 / 100).toFixed(2) }));
  };
  const closeReveal = async (collectIt: boolean) => {
    if (!revealed) return;
    setSeenUpTo(revealed.id);
    if (collectIt) await collectOne(revealed);
  };

  const pending = s.dives.filter((d) => !d.result);
  const [notice, setNotice] = useState<string | null>(null);
  // Same team, same destination, one more ticket.
  const [supplyFor, setSupplyFor] = useState<Departure | null>(null);
  // the revealed voyage meets the accepted commission: complete it from the reveal (it collects the result too)
  const cm = sim.commissions;
  const commissionHere = revealed && cm.active !== null && cm.ready === revealed.id ? {
    title: commissionTitle(cm.list[cm.active]),
    bonus: readyBonus(sim),
    complete: async () => {
      const id = revealed.id;
      const e = await cm.complete();
      setSeenUpTo(Math.max(seenUpTo, id));
      if (e) { setNotice(ERROR[e] ?? e); return; }
      play("claim");
      say(tl("委託完成。這趟的光和委託的獎勵都進了「可領取」。"));
    },
  } : null;
  const again = async () => {
    if (!revealed) return;
    await closeReveal(true);
    // a deep dive again only when today's passes still allow one; otherwise the same trip at normal depth
    const deep = !!revealed.deep && passesOn(s, sim.today) + 2 <= DIVES_PER_DAY && passesOn(s, sim.today, revealed.spire) + 2 <= DIVES_PER_TEAM_PER_DAY;
    const g = { spire: revealed.spire, dest: revealed.dest, deep };
    const kept = unlocksOf(s).supplies ? rememberedSupply() : 0;
    if (kept !== null) await departAgain(g, kept);
    else setSupplyFor(g);
  };
  const departAgain = async (g: Departure, supply: number) => {
    setSupplyFor(null);
    const r = await sim.dive(g.spire, g.dest, { supply, deep: g.deep });
    if (r.error) { setNotice(ERROR[r.error]); setCluster(DESTINATIONS[g.dest].cluster); setDest(g.dest); return; }
    setNotice(null);
    departed(r.id!, r.card, g.dest);
  };
  // Where a destination sits in the current view, for bridges and bursts.
  const spotOf = (destId: number) => (cluster === null ? NODE[DESTINATIONS[destId].cluster] : DESTINATIONS[destId].cluster === cluster ? SPOT[DESTINATIONS[destId].slot] : null);
  // After departure the voyage log opens; it writes itself over the five minutes of the voyage.
  const departed = (id: number, _card: number | undefined, destId: number) => {
    const p = spotOf(destId);
    if (p) gl.current?.burst(p.x, p.y, "#c9ff55");
    play("depart");
    setDest(null);
    setWatch(id);
  };
  // A chime and a word from Rovyn when a voyage reaches its decision.
  const notified = useRef(new Set<number>());
  useEffect(() => {
    for (const d of s.dives) {
      if (turning(d, sim.now) && !notified.current.has(-d.id)) {
        notified.current.add(-d.id);
        play("event");
        say(tl("深潛到了最深處，要繼續還是回航？打開那趟航行就能決定。"));
      }
      if (!deciding(d, sim.now) || notified.current.has(d.id)) continue;
      notified.current.add(d.id);
      play("event");
      const name = TEXTS.clusters[DESTINATIONS[d.dest].cluster].destinations[DESTINATIONS[d.dest].slot].name;
      say(TEXTS.rovyn.eventPending[d.id % TEXTS.rovyn.eventPending.length].replaceAll(tl("{目的地}"), name));
    }
  }, [s.dives, sim.now, say]);
  const scene: GalaxyState = cluster === null
    ? {
        orbs: NODE.map((p, c) => ({ x: p.x, y: p.y, color: CLUSTER_HUE[c], hue: CLUSTER_HUE[c], seed: c + 1, locked: best < clusterRange(c)[0], core: c === 5, photo: CLUSTER_IMAGES[c].src })),
        bridges: pending.map((d) => NODE[DESTINATIONS[d.dest].cluster]),
        hover,
        core: NODE[5],
        photo: GALAXY_IMAGE.src,
      }
    : {
        orbs: SPOT.map((p, i) => ({ x: p.x, y: p.y, color: LIGHT_COLOR[sim.sky.lights[cluster * 4 + i]], locked: best < DESTINATIONS[cluster * 4 + i].threshold, size: 1.15 + i * 0.1, hue: CLUSTER_HUE[cluster], seed: 100 + cluster * 4 + i })),
        bridges: pending.filter((d) => DESTINATIONS[d.dest].cluster === cluster).map((d) => SPOT[DESTINATIONS[d.dest].slot]),
        hover,
        core: { x: 94, y: 8 },
        photo: CLUSTER_IMAGES[cluster].src,
        frame: clusterBox, // the destination card can narrow the cluster view: the orbs follow its box
      };

  return (
    <div className="v3-dive">
      <section className="v3-map" aria-label={tl("星圖")} style={{ ["--photo" as string]: `url(${(cluster === null ? GALAXY_IMAGE : CLUSTER_IMAGES[cluster]).src})` }}>
        <Backdrop scene={scene} api={gl} />
        {cluster === null ? (
          <Galaxy sim={sim} best={best} pending={pending} onWatch={(id) => { setWatch(id); setDest(null); play("open"); }} onHover={(i) => { setHover(i); if (i !== null) play("hover"); }} onOpen={(c) => { setCluster(c); setDest(null); setHover(null); play("open"); }} />
        ) : (
          <ClusterView boxRef={clusterBox} sim={sim} c={cluster} best={best} dest={dest} pending={pending} onWatch={(id) => { setWatch(id); setDest(null); play("open"); }} onHover={setHover} onBack={() => { setCluster(null); setDest(null); setHover(null); }} onPick={(d) => { setDest(d); setWatch(null); play("click"); }} />
        )}
        {cluster !== null && dest !== null && (
          <DestinationCard key={dest} sim={sim} id={dest} teams={teams} used={used} onClose={() => setDest(null)} say={say} onDeparted={departed} />
        )}
        {watch !== null && dest === null && <VoyageLog sim={sim} id={watch} arriving={arriving} onArrived={() => setArrived(revealed?.id ?? null)} onClose={() => setWatch(null)} onSwitch={setWatch} onCollect={(d) => { setSeenUpTo((v) => Math.max(v, d.id)); collectOne(d); }} />}
        <Coach voyageOpen={watch !== null} step={waiting.length > 0 || revealed ? 4 : watch !== null || pending.length > 0 ? 3 : dest !== null ? 2 : cluster !== null ? 1 : 0}
          onOpenCluster={() => { setCluster(0); setDest(null); setHover(null); play("open"); }}
          onPickDest={() => {
            // the deepest destination the strongest team reaches in the open cluster (or its first one)
            const c = cluster ?? 0;
            const reach = DESTINATIONS.filter((d) => d.cluster === c && best >= d.threshold);
            if (cluster === null) setCluster(c);
            setDest((reach.at(-1) ?? DESTINATIONS[c * 4]).id); setWatch(null); play("click");
          }} />
        <div className="v3-flight" aria-live="polite">
          {notice && <span className="v3-flight__notice" role="alert">{notice}</span>}
          <span className="v3-flight__rate" title={tl("核光池每天釋出 1%，依當天所有人的光塵分；人越多，每點光塵分到越少")}>{tl("今日分配率")} <b>{sim.rate.toFixed(5)}</b> <RateChange sim={sim} /></span>
          <span className="v3-flight__tickets">{tl("出發令")} <b>{Math.max(0, DIVES_PER_DAY - used)}</b>{tl("／{0}", { 0: DIVES_PER_DAY })}</span>
          {used < DIVES_PER_DAY && teams.some((t) => !t.busy) && <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => setDispatching(true)}><Rocket aria-hidden="true" />{tl("一次派遣")}</button>}
          {waiting.length > 1 && <button type="button" className="hud-btn hud-btn--gold hud-btn--sm" onClick={(e) => { flyLight(e.currentTarget, ".hud-res--claim"); collectAll(); }}>{tl("全部收取（{0} 趟）", { 0: waiting.length })}</button>}
          {waiting.map((d) => (
            <button key={d.id} type="button" className={`v3-flight__item is-ready${watch === d.id ? " is-on" : ""}`} onClick={() => { setWatch(d.id); setDest(null); play("open"); }}>
              <Rocket aria-hidden="true" />
              <span>{TEXTS.clusters[DESTINATIONS[d.dest].cluster].destinations[DESTINATIONS[d.dest].slot].name}</span>
              <small>{tl("待收取 +")}{fmt(d.reward ?? 0)}</small>
            </button>
          ))}
          {pending.map((d) => (
            <button key={d.id} type="button" className={`v3-flight__item${deciding(d, sim.now) ? " is-event" : ""}${watch === d.id ? " is-on" : ""}`} onClick={() => { setWatch(d.id); setDest(null); play("open"); }}>
              <Rocket aria-hidden="true" />
              <span>{TEXTS.clusters[DESTINATIONS[d.dest].cluster].destinations[DESTINATIONS[d.dest].slot].name}</span>
              <small>{deciding(d, sim.now) ? tl("抉擇！點我") : tl("{0} 後揭曉", { 0: clock(d.revealAt - sim.now) })}</small>
            </button>
          ))}
        </div>
      </section>
      <LiveLog sim={sim} />
      {revealed && !arriving && <Reveal key={revealed.id} d={revealed} skipScan={arrived === revealed.id} commission={commissionHere} title={bestTitle(recordsOf(sim))} onCollect={() => closeReveal(true)} onLater={() => closeReveal(false)} onAgain={again} queued={waiting.length - 1} onAll={collectAll} />}
      {supplyFor && <SupplyPrompt sim={sim} go={[supplyFor]} onConfirm={(supply) => departAgain(supplyFor, supply)} onClose={() => setSupplyFor(null)} />}
      {dispatching && <Dispatch sim={sim} onClose={() => setDispatching(false)} onDeparted={departed} />}
    </div>
  );
}

// ---------------------------------------------------------------- first-visit guide

const COACH_KEY = "lightdive:v3:coach-done";
const COACH = localized([
  { title: "這是今天的星圖", text: "六個星團由外往內，越靠近核心越危險、帶回的也越多。先點最外圈的 ① 微光淺域。出發後，你的隊伍會變成光橋上的一個光點。", pos: "is-right" },
  { title: "挑一個目的地", text: "每個目的地今天都有自己的光；和你的探索者同頻會多帶回一些。點一個亮著的目的地。", pos: "is-right-low" },
  { title: "看勝算，再出發", text: "目的地卡會算出這支隊伍的基礎收益和每種結果的機率。選好隊伍，按「出發」，會用掉 1 張出發令，並打開航行畫面。", pos: "is-mid" },
  { title: "出發之後：航行畫面", text: "光點沿著航線前進約 5 分鐘，右邊的日誌一段一段寫出路上發生的事。走到三成會跳出抉擇卡：求穩保底、求險搏大，或繞道護隊；揭曉前 1 分鐘截止。", pos: "is-voyage" },
  { title: "抵達，然後親手收下", text: "光點抵達目的地時，光環的顏色會先透露結果，接著揭曉倍率。按「收取」，光會飛進上方的「可領取」；之後到金庫提領到錢包。", pos: "is-voyage" },
]);

/** Rovyn walks a first-time player through one dive, then never shows again. */
function Coach({ step, voyageOpen, onOpenCluster, onPickDest }: { step: number; voyageOpen: boolean; onOpenCluster: () => void; onPickDest: () => void }) {
  const [done, setDone] = useState(() => { try { return localStorage.getItem(COACH_KEY) === "1"; } catch { return true; } });
  // "next" can move the guide ahead of the player's own actions; it never goes back
  const [seen, setSeen] = useState(0);
  const finish = () => { setDone(true); try { localStorage.setItem(COACH_KEY, "1"); } catch {} };
  if (done) return null;
  const shown = Math.max(step, seen);
  const c = COACH[shown];
  // the first two steps do the step for the player; departing stays the player's own click (it spends a Dive Pass)
  const next = () => {
    if (shown === 0) onOpenCluster();
    if (shown === 1) onPickDest();
    setSeen(shown + 1);
    play("click");
  };
  const nextLabel = shown === 0 ? tl("下一步：前往 ① 微光淺域") : shown === 1 ? tl("下一步：選一個目的地") : tl("下一步");
  return (
    <div className={`v3-coach ${c.pos === "is-voyage" && !voyageOpen ? "is-left" : c.pos}`} role="note">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lightdive/keeper-face.webp" alt="" />
      <div>
        <span className="hud-kicker">{tl("新手引導 {0}", { 0: shown + 1 })}/{COACH.length}</span>
        <b>{c.title}</b>
        <p>{c.text}</p>
        <div className="v3-coach__actions">
          {shown === COACH.length - 1
            ? <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={finish}>{tl("知道了，開始玩")}</button>
            : <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={next}>{nextLabel}</button>}
          {shown < COACH.length - 1 && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={finish}>{tl("跳過引導")}</button>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- WebGL backdrop

/** Loads the Pixi scene behind the map; without WebGL the CSS version stays as it is. */
function Backdrop({ scene, api }: { scene: GalaxyState; api: RefObject<GalaxyGl | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(scene);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // phones get the lighter CSS map (and save battery); WebGL is for wider screens
    if (window.matchMedia("(max-width: 860px)").matches || fxQuality() === "low") return;
    let dead = false;
    let made: GalaxyGl | null = null;
    import("./galaxy-engine")
      .then((m) => m.createGalaxy(host.current!))
      .then((g) => {
        if (dead) { g.destroy(); return; }
        made = g;
        api.current = g;
        g.update(latest.current);
        setReady(true);
      })
      .catch(() => {});
    return () => { dead = true; made?.destroy(); api.current = null; };
  }, [api]);
  useEffect(() => {
    latest.current = scene;
    api.current?.update(scene);
  });
  return <div ref={host} className={`v3-gl${ready ? " is-ready" : ""}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------- level 0: the galaxy

const NODE = [
  { x: 14, y: 70 }, { x: 30, y: 30 }, { x: 52, y: 78 }, { x: 70, y: 32 }, { x: 80, y: 66 }, { x: 52, y: 50 },
];

function Galaxy({ sim, best, pending, onOpen, onHover, onWatch }: { sim: Sim; best: number; pending: SimDive[]; onOpen: (c: number) => void; onHover: (i: number | null) => void; onWatch: (id: number) => void }) {
  const events = [...sim.sky.events.entries()];
  return (
    <div className="v3-galaxy">
      <header className="v3-map__head">
        <span className="hud-kicker">{tl("星圖 · STAR MAP")}</span>
        <h1>{tl("今天要潛向哪裡？")}</h1>
        <p>{tl("越往中心越接近核心，光越多，也越危險。你最強的隊伍戰力")} <b>{best}</b>{tl("。")}</p>
      </header>
      <span className="v3-core" style={{ left: `${NODE[5].x}%`, top: `${NODE[5].y}%` }} aria-hidden="true" />
      <svg className="v3-galaxy__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {[12, 22, 32, 42].map((r) => <ellipse key={r} cx={NODE[5].x} cy={NODE[5].y} rx={r * 1.1} ry={r * 0.9} className="v3-orbit" />)}
        <polyline className="v3-route" points={NODE.map((n) => `${n.x},${n.y}`).join(" ")} />
        <Bridges pending={pending} at={(d) => NODE[DESTINATIONS[d].cluster]} />
      </svg>
      <FlightMarkers sim={sim} pending={pending} at={(d) => NODE[DESTINATIONS[d].cluster]} onWatch={onWatch} />
      {NODE.map((p, c) => {
        const [lo, hi] = clusterRange(c);
        const locked = best < lo;
        const ev = events.filter(([id]) => DESTINATIONS[id].cluster === c);
        const info = TEXTS.clusters[c];
        return (
          <button
            key={c}
            type="button"
            className={`v3-node${locked ? " is-locked" : ""}${c === 5 ? " is-core" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, ["--hue" as string]: CLUSTER_HUE[c] }}
            onClick={() => onOpen(c)}
            onMouseEnter={() => onHover(c)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(c)}
            onBlur={() => onHover(null)}
          >
            <span className="v3-node__orb"><i /><i /><i /></span>
            <span className="v3-node__label">
              <b><i>{CIRCLED[c]}</i>{info.name}{locked && <Lock aria-label={tl("未解鎖")} />}</b>
              {gameLocale() !== "en" && <small>{info.en}</small>}
              <span className="v3-maplabel__meta">{tl("戰力 {0}", { 0: lo })}–{hi}</span>
              {ev.length > 0 && <em className="is-event">{ev.map(([, e]) => STAR[e].name).join(tl("・"))}</em>}
              <span className="v3-maplabel__more"><span>
                <em>{tl("風險：{0}", { 0: RISK[c] })}</em>
                <em className="is-base">{tl("基礎收益 {0}", { 0: fmt(destinationBase(DESTINATIONS[c * 4], sim.rate)) })}–{fmt(destinationBase(DESTINATIONS[c * 4 + 3], sim.rate))} $RVYN</em>
                {locked ? <em className="is-lock"><Lock aria-hidden="true" />{tl("需要戰力 {0}", { 0: lo })}</em> : <em className="is-go">{tl("點一下進入星團")}</em>}
              </span></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- level 1: one cluster

const SPOT = [{ x: 14, y: 72 }, { x: 34, y: 40 }, { x: 54, y: 72 }, { x: 76, y: 34 }];

/** Where each team is on its light bridge right now: the same curve the backdrop draws (from the observatory at the
 *  bottom left), a marker you can hover for the destination, team and time left, and click to open the voyage. */
function FlightMarkers({ sim, pending, at, onWatch }: { sim: Sim; pending: SimDive[]; at: (dest: number) => { x: number; y: number }; onWatch: (id: number) => void }) {
  const s = sim.state!;
  return (
    <>
      {pending.map((d) => {
        const to = at(d.dest);
        const from = { x: 2, y: 98 };
        const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 30 };
        const k = Math.min(1, Math.max(0, (sim.now - d.at) / Math.max(1, d.revealAt - d.at)));
        const x = (1 - k) ** 2 * from.x + 2 * (1 - k) * k * ctrl.x + k * k * to.x;
        const y = (1 - k) ** 2 * from.y + 2 * (1 - k) * k * ctrl.y + k * k * to.y;
        const decide = deciding(d, sim.now);
        const name = TEXTS.clusters[DESTINATIONS[d.dest].cluster].destinations[DESTINATIONS[d.dest].slot].name;
        return (
          <button key={d.id} type="button" className={`v3-flightmark${decide ? " is-decide" : ""}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={() => onWatch(d.id)}
            aria-label={tl("{0} 前往{1}，{2}", { 0: teamName(s, d.spire), 1: name, 2: decide ? tl("等你抉擇") : tl("{0} 後揭曉", { 0: clock(d.revealAt - sim.now) }) })}>
            <i>{decide ? "!" : ""}</i>
            <span className="v3-flightmark__tip">
              <b>{name}</b>
              <small>{teamName(s, d.spire)}</small>
              <em>{decide ? tl("等你抉擇 · 點一下去選") : tl("{0} 後揭曉 · 點一下看航行", { 0: clock(d.revealAt - sim.now) })}</em>
            </span>
            <span className="v3-flightmark__time">{decide ? tl("抉擇") : clock(d.revealAt - sim.now)}</span>
          </button>
        );
      })}
    </>
  );
}

/** Light bridges from the observatory (bottom left) to every destination with a dive in flight. */
function Bridges({ pending, at }: { pending: SimDive[]; at: (dest: number) => { x: number; y: number } }) {
  return (
    <>
      {pending.map((d) => {
        const p = at(d.dest);
        const path = `M 2 98 Q ${(2 + p.x) / 2} ${Math.min(98, p.y) - 30} ${p.x} ${p.y}`;
        return (
          <g key={d.id} className="v3-bridge">
            <path d={path} className="v3-bridge__glow" />
            <path d={path} className="v3-bridge__line" />
            <circle r="0.9" className="v3-bridge__spark"><animateMotion dur="2.4s" repeatCount="indefinite" path={path} /></circle>
          </g>
        );
      })}
    </>
  );
}

function ClusterView({ sim, c, best, dest, pending, onBack, onPick, onHover, onWatch, boxRef }: { sim: Sim; c: number; best: number; dest: number | null; pending: SimDive[]; onBack: () => void; onPick: (d: number) => void; onHover: (i: number | null) => void; onWatch: (id: number) => void; boxRef: RefObject<HTMLDivElement | null> }) {
  const info = TEXTS.clusters[c];
  return (
    <div className="v3-cluster" ref={boxRef} style={{ ["--hue" as string]: CLUSTER_HUE[c] }}>
      <header className="v3-map__head">
        <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={onBack}><ArrowLeft aria-hidden="true" />{tl("星圖")}</button>
        <span className="hud-kicker">{tl("{0} 星團 · 風險：{1}", { 0: CIRCLED[c], 1: RISK[c] })}</span>
        <h1>{info.name} {gameLocale() !== "en" && <small>{info.en}</small>}</h1>
        <p>{info.intro}</p>
      </header>
      <svg className="v3-cluster__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <polyline className="v3-route is-cluster" points={SPOT.map((p) => `${p.x},${p.y}`).join(" ")} />
        <Bridges pending={pending.filter((d) => DESTINATIONS[d.dest].cluster === c)} at={(d) => SPOT[DESTINATIONS[d].slot]} />
      </svg>
      <FlightMarkers sim={sim} pending={pending.filter((d) => DESTINATIONS[d.dest].cluster === c)} at={(d) => SPOT[DESTINATIONS[d].slot]} onWatch={onWatch} />
      {SPOT.map((p, i) => {
        const id = c * 4 + i;
        const d = DESTINATIONS[id];
        const light = sim.sky.lights[id];
        const ev = sim.sky.events.get(id);
        const locked = best < d.threshold;
        const echo = sim.bridge(id);
        return (
          <button
            key={id}
            type="button"
            className={`v3-spot${locked ? " is-locked" : ""}${dest === id ? " is-on" : ""}${p.x > 70 ? " is-flip" : ""}${echo ? " has-echo" : ""}`}
            style={{ left: `${p.x}%`, top: `${p.y}%`, ["--lc" as string]: LIGHT_COLOR[light] }}
            onClick={() => onPick(id)}
            onMouseEnter={() => onHover(i)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(i)}
            onBlur={() => onHover(null)}
          >
            <span className="v3-spot__orb" />
            <span className="v3-spot__label">
              <b><i>{SLOT[i]}</i>{info.destinations[i].name}{locked && <Lock aria-label={tl("未解鎖")} />}</b>
              <span className="v3-maplabel__meta">{tl("門檻 {0} · 今天的光", { 0: d.threshold })} <i style={{ color: LIGHT_COLOR[light] }}><LightIcon light={light} />{LIGHT[light]}</i></span>
              {ev && <em style={{ color: STAR[ev].color }}>{STAR[ev].name}</em>}
              {echo > 0 && <em className="is-echo">{tl("光橋殘光")}</em>}
              <span className="v3-maplabel__more"><span>
                <em className="is-base">{tl("基礎收益 {0} $RVYN 起", { 0: fmt(destinationBase(d, sim.rate)) })}</em>
                {echo > 0 && <em className="is-echo">{tl("今天有人走過這裡，空手 −{0}%", { 0: echo })}</em>}
                {ev && <em>{STAR[ev].effect}</em>}
                {locked ? <em className="is-lock"><Lock aria-hidden="true" />{tl("還差 {0} 戰力", { 0: d.threshold - best })}</em> : <em className="is-go">{tl("點一下看詳情、派隊伍")}</em>}
              </span></span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- destination card and confirm

function DestinationCard({ sim, id, teams, used, onClose, say, onDeparted }: { sim: Sim; id: number; teams: TeamView[]; used: number; onClose: () => void; say: (l: string) => void; onDeparted: (id: number, card: number | undefined, dest: number) => void }) {
  const s = sim.state!;
  const d = DESTINATIONS[id];
  const info = TEXTS.clusters[d.cluster].destinations[d.slot];
  const eligible = teams.filter((t) => t.power >= d.threshold);
  const [pick, setPick] = useState<number | null>(() => {
    // the team last chosen on the plain goes first when it can make this trip
    let pref: number | null = null;
    try { pref = Number(sessionStorage.getItem("lightdive:v3:team")) || null; } catch {}
    return eligible.find((t) => t.spire === pref && !t.busy)?.spire ?? eligible.find((t) => !t.busy)?.spire ?? null;
  });
  const [error, setError] = useState<string | null>(null);
  const canDeep = d.cluster >= DEEP_MIN_CLUSTER;
  const [deep, setDeep] = useState(false);
  const [asking, setAsking] = useState(false);
  const team = s.teams.find((t) => t.spire === pick);
  const echo = sim.bridge(id);
  const plan: DivePlan | null = useMemo(
    () => (team ? planDive(teamInput(s, team), d, sim.sky, "none", { stability: stabilityOf(team.bond, 0, echo), deep: canDeep && deep }) : null),
    [team, s, d, sim.sky, deep, canDeep, echo],
  );
  const light = sim.sky.lights[id];
  const ev = sim.sky.events.get(id);
  const uses = canDeep && deep ? 2 : 1;
  const teamUsed = pick === null ? 0 : passesOn(s, sim.today, pick);
  const go = async (supply: number) => {
    if (pick === null) return;
    setAsking(false);
    const r = await sim.dive(pick, id, { supply, deep: canDeep && deep });
    if (r.error) { setError(ERROR[r.error]); return; }
    if (r.id !== undefined) onDeparted(r.id, r.card, id);
    const lines = TEXTS.departures[d.cluster];
    say(lines[(r.id ?? 0) % lines.length]);
    onClose();
  };
  return (
    <aside className="v3-dest" aria-label={info.name}>
      <button type="button" className="v3-dest__close" onClick={onClose} aria-label={tl("關閉")}><X aria-hidden="true" /></button>
      <div className="v3-dest__banner" style={{ ["--photo" as string]: `url(${CLUSTER_IMAGES[d.cluster].src})`, ["--lc" as string]: LIGHT_COLOR[sim.sky.lights[id]] }} aria-hidden="true" />
      <span className="hud-kicker">{tl("{0}{1} · 目的地", { 0: CIRCLED[d.cluster], 1: SLOT[d.slot] })}</span>
      <h2>{info.name}</h2>
      <p className="v3-dest__intro">{info.intro}</p>
      <dl className="v3-kv">
        <div><dt>{tl("戰力門檻")}</dt><dd>{d.threshold}</dd></div>
        <div><dt>{tl("今天的光")}</dt><dd style={{ color: LIGHT_COLOR[light] }}><LightIcon light={light} />{LIGHT[light]}</dd></div>
        <div><dt>{tl("收益係數")}</dt><dd>×{(plan?.coef ?? d.coef).toFixed(3)}</dd></div>
        <div><dt>{tl("出發成本")}</dt><dd>{tl("收益的 {0}（回來後扣）", { 0: pct(plan?.levy ?? d.levy) })}</dd></div>
        <div><dt>{tl("耗損")}</dt><dd>{d.wear2 + d.wear3 === 0 || plan?.wear2 === 0 ? tl("一律 1 次航程") : tl("{0} 耗損 2、{1} 耗損 3", { 0: pct(plan?.wear2 ?? d.wear2, 1), 1: pct(plan?.wear3 ?? d.wear3, 1) })}</dd></div>
        {ev && <div><dt>{tl("今日星象")}</dt><dd style={{ color: STAR[ev].color }}>{tl("{0}：{1}", { 0: STAR[ev].name, 1: STAR[ev].effect })}</dd></div>}
        {echo > 0 && <div><dt>{tl("光橋殘光")}</dt><dd className="is-echo">{tl("今天有人走過這裡，空手 −{0}%", { 0: echo })}</dd></div>}
      </dl>

      <h3>{tl("選擇隊伍")}</h3>
      {teams.length === 0 ? (
        <p className="hud-dim">{tl("還沒有組好的隊伍，先到碑原組隊。")}</p>
      ) : (
        <div className="v3-teams">
          {teams.map((t) => {
            const ok = t.power >= d.threshold;
            const team = s.teams.find((x) => x.spire === t.spire)!;
            const attuned = team.seekers.filter((sid) => s.nfts.find((n) => n.id === sid)?.trait === light).length;
            return (
              <button key={t.spire} type="button" disabled={!ok || t.busy} className={pick === t.spire ? "is-on" : ""} onClick={() => setPick(t.spire)}>
                <b>{t.name}</b>
                <span>{tl("戰力 {0}", { 0: t.power })}{!ok ? tl("（差 {0}）", { 0: d.threshold - t.power }) : overflowPoints(t.power, d.threshold) ? tl(" · 穩定 −{0}%", { 0: overflowPoints(t.power, d.threshold) }) : ""}</span>
                <small>{t.waiting ? tl("上一趟還沒收取") : t.busy ? tl("光橋上") : tl("今天已出發 {0}/3", { 0: t.teamToday })}{attuned ? tl(" · 同頻 {0} 位", { 0: attuned }) : ""}{team.bond ? tl(" · 默契 {0}", { 0: team.bond }) : ""}</small>
              </button>
            );
          })}
        </div>
      )}

      {canDeep && (
        <>
          <h3>{tl("航程")}</h3>
          <div className="v3-depth" role="radiogroup" aria-label={tl("航程")}>
            <button type="button" role="radio" aria-checked={!deep} className={!deep ? "is-on" : ""} onClick={() => setDeep(false)}>
              <b>{tl("一般")}</b><span>{tl("5 分鐘 · 1 張出發令")}</span>
            </button>
            <button type="button" role="radio" aria-checked={deep} className={deep ? "is-on" : ""} onClick={() => setDeep(true)}>
              <b>{tl("深潛")}</b><span>{tl("15 分鐘 · 2 張出發令 · 光塵 ×2 · 稜鏡風險高一級")}</span>
            </button>
          </div>
          {deep && <p className="hud-note">{tl("深潛前段有一次抉擇；最後 10 分鐘可以選擇回航，回航固定 ×1.00、只耗損 1 次航程。")}</p>}
        </>
      )}
      {plan && (
        <>
          <h3>{tl("這次的勝算")} <small><BeamIcon beam={plan.risk} />{tl("稜鏡：{0}（{1}）", { 0: BEAM[plan.risk], 1: BEAM_HINT[plan.risk] })}</small></h3>
          <div className="v3-base">
            <div>
              <small>{tl("這支隊伍的基礎收益")}</small>
              <b>{fmt(baseReward(plan, sim.rate) * uses)}<em>$RVYN</em></b>
              <span>{tl("結果倍率 ×1.00 時帶回，已扣出發成本；揭曉時乘上結果倍率。")} <RateChange sim={sim} /></span>
            </div>
            <div>
              <small>{tl("這個目的地的基準")}</small>
              <b className="is-ref">{fmt(destinationBase(d, sim.rate))}<em>$RVYN</em></b>
              <span>{tl("戰力剛好 {0}、沒有同頻的隊伍", { 0: d.threshold })}</span>
            </div>
          </div>
          <Odds plan={plan} base={baseReward(plan, sim.rate) * uses} />
          {team?.bond ? <p className="hud-note">{tl("默契 {0}：空手機率已少 {0} 個百分點。", { 0: team.bond })}</p> : null}
          {echo > 0 && <p className="hud-note">{tl("光橋殘光：跟著今天前一位觀測者留下的光橋走，空手機率少 {0} 個百分點。你出發後，殘光就換成你的，留給下一位。", { 0: echo })}</p>}
          <p className="v3-estimate">{tl("光塵 {0}", { 0: fmt(basePoints(plan) * uses, 0) })}{plan.bonus ? tl("（含同頻 +{0}）", { 0: fmt(plan.bonus, 0) }) : ""} {tl("× 今日分配率 {0}", { 0: sim.rate.toFixed(5) })} $RVYN <RateChange sim={sim} />{tl("。分配率每天依核光池和參與人數調整，基礎收益跟著變。")}</p>
        </>
      )}
      {error && <p className="v3-error" role="alert">{error}</p>}
      <p className="hud-note">{tl("失敗時沒有收益，也就不用付出發成本；但航程照樣耗損。")}</p>
      <button type="button" className="hud-btn hud-btn--primary hud-btn--block v3-dest__go" disabled={!plan || used + uses > DIVES_PER_DAY || teamUsed + uses > 3} onClick={() => { const kept = unlocksOf(s).supplies ? rememberedSupply() : 0; if (kept !== null) void go(kept); else setAsking(true); }}>
        <Rocket aria-hidden="true" />{used + uses > DIVES_PER_DAY ? (used >= DIVES_PER_DAY ? tl("今天的出發令用完了") : tl("出發令不夠深潛")) : teamUsed + uses > 3 ? tl("這支隊伍今天的次數不夠") : uses === 2 ? tl("深潛（用 2 張出發令）") : tl("出發（用 1 張出發令）")}
      </button>
      {unlocksOf(s).supplies && <KeptSupply onChange={() => setAsking(true)} />}
      {asking && pick !== null && <SupplyPrompt sim={sim} go={[{ spire: pick, dest: id, deep: canDeep && deep }]} onConfirm={go} onClose={() => setAsking(false)} />}
    </aside>
  );
}

/** When today's supply is remembered: what it is, and a way to choose again. */
export function KeptSupply({ onChange }: { onChange: () => void }) {
  // the card only opens after a click in the browser, so reading the browser's storage here is safe
  const [kept, setKept] = useState<number | null>(() => rememberedSupply());
  if (kept === null) return null;
  return (
    <p className="v3-keptsupply">
      {tl("今天自動帶：{0}", { 0: SUPPLIES[kept]?.name() ?? "" })}
      <button type="button" onClick={() => { forgetSupply(); setKept(null); onChange(); }}>{tl("修改")}</button>
    </p>
  );
}

function Odds({ plan, base }: { plan: DivePlan; base?: number }) {
  const names = plan.names ?? outcomesOf(plan.table);
  return (
    <ul className="v3-odds">
      {plan.table.map(([p, lo, hi], i) => (
        <li key={i} style={{ ["--w" as string]: `${p / 100}%`, ["--tc" as string]: OUTCOME_TONE[names[i]] }}>
          <span>{OUTCOME[names[i]]}</span>
          <i />
          <b>{(p / 100).toFixed(p % 100 ? 1 : 0)}%</b>
          <small>{lo === 0 && hi === 0 ? "—" : `×${(lo / 100).toFixed(2)}–${(hi / 100).toFixed(2)}`}{base !== undefined && hi > 0 ? <em>{fmt((base * lo) / 100)}–{fmt((base * hi) / 100)}</em> : null}</small>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- voyage choice and reveal

/** The reveal: a short scan while the signal "comes back", then the result with a counting multiplier. */
type RevealCommission = { title: string; bonus: number | null; complete: () => Promise<void> };
function Reveal({ d, skipScan, onCollect, onLater, onAgain, queued, onAll, commission, title }: { d: SimDive; skipScan?: boolean; onCollect: () => void; onLater: () => void; onAgain: () => void; queued: number; onAll: () => void; commission?: RevealCommission | null; title?: string | null }) {
  const [completing, setCompleting] = useState(false);
  const r = d.result!;
  const dest = DESTINATIONS[d.dest];
  const reason = r.wear > 1 ? TEXTS.wearReasons[dest.cluster][d.id % Math.max(1, TEXTS.wearReasons[dest.cluster].length)] : null;
  const [stage, setStage] = useState<"scan" | "show">(skipScan ? "show" : "scan");
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (skipScan) { play(r.outcome === "partial" ? "empty" : r.outcome); return; }
    play("scan");
    const t = window.setTimeout(() => { setStage("show"); play(r.outcome === "partial" ? "empty" : r.outcome); }, 1700);
    return () => window.clearTimeout(t);
  }, [r.outcome, skipScan]);
  useEffect(() => {
    if (stage !== "show") return;
    let raf = 0;
    const start = performance.now(), dur = r.outcome === "legend" || r.outcome === "great" ? 1400 : 700;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      setShown(r.multX100 * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, r.multX100, r.outcome]);
  const name = TEXTS.clusters[dest.cluster].destinations[dest.slot].name;
  if (stage === "scan") {
    return (
      <div className="v3-modal" role="dialog" aria-label={tl("光橋揭曉中")}>
        <div className="v3-modal__card v3-scan">
          <span className="hud-kicker">{tl("{0} · 訊號回傳中", { 0: name })}</span>
          <div className="v3-scan__radar" aria-hidden="true"><i /><i /><i /></div>
          <p>{tl("Rovyn 正在對齊光橋……")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="v3-modal" role="dialog" aria-label={tl("揭曉")}>
      {r.outcome === "legend" && <div className="v3-flash" aria-hidden="true" />}
      <div className={`v3-modal__card v3-reveal is-${r.outcome}`} style={{ ["--tc" as string]: OUTCOME_TONE[r.outcome] }} onClick={(e) => e.stopPropagation()}>
        <Burst tone={OUTCOME_TONE[r.outcome]} level={{ empty: 0, partial: 0, normal: 1, good: 2, great: 4, legend: 7 }[r.outcome]} />
        <span className="hud-kicker">{tl("{0} · 光橋揭曉", { 0: name })}</span>
        <h2>{d.turnedBack ? tl("回航") : OUTCOME[r.outcome]}</h2>
        <b className="v3-reveal__mult">×{(shown / 100).toFixed(2)}</b>
        <p className="v3-reveal__log">{tl("「{0}」", { 0: d.log })}</p>
        <dl className="v3-kv">
          <div><dt>{tl("帶回（已扣出發成本）")}</dt><dd>{fmt(d.reward ?? 0)} $RVYN</dd></div>
          <div><dt>{tl("出發成本")}</dt><dd>{fmt(d.levyPaid ?? 0)}</dd></div>
          <div><dt>{tl("耗損航程")}</dt><dd>{tl("{0} 次", { 0: r.wear })}{reason ? tl("：{0}", { 0: reason }) : ""}</dd></div>
          {d.choice && <div><dt>{tl("你的抉擇")}</dt><dd>{tl("{0}（{1}）", { 0: CHOICE[d.choice].name, 1: CHOICE[d.choice].tag })}</dd></div>}
        </dl>
        <ShareButtons d={d} title={title} />
        {queued > 0 && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm v3-acceptall" onClick={onAll}>{tl("還有 {0} 趟等著收取 · 全部收取", { 0: queued })}</button>}
        {commission && (
          <div className="v3-reveal__commission">
            <span>{tl("這趟符合今天的委託「{0}」", { 0: commission.title })}</span>
            <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" disabled={completing} onClick={async (e) => { setCompleting(true); flyLight(e.currentTarget, ".hud-res--claim", "#c9ff55"); await commission.complete(); }}>
              {commission.bonus !== null ? tl("收取並完成委託（+{0}）", { 0: fmt(commission.bonus) }) : tl("收取並完成委託")}
            </button>
          </div>
        )}
        <div className="v3-reveal__actions">
          <button type="button" className="hud-btn hud-btn--gold" onClick={(e) => { if (r.outcome !== "empty") flyLight(e.currentTarget, ".hud-res--claim", OUTCOME_TONE[r.outcome]); onCollect(); }}>{r.outcome === "empty" ? tl("確認") : tl("收取 +{0}", { 0: fmt(d.reward ?? 0) })}</button>
          <button type="button" className="hud-btn hud-btn--primary" onClick={(e) => { if (r.outcome !== "empty") flyLight(e.currentTarget, ".hud-res--claim", OUTCOME_TONE[r.outcome]); onAgain(); }}><Rocket aria-hidden="true" />{tl("收取並同隊再出發")}</button>
        </div>
        <button type="button" className="v3-reveal__later" onClick={onLater}>{tl("稍後再收（結果會留在潛光頁下方）")}</button>
      </div>
    </div>
  );
}

/** Today's rate against yesterday's, as an arrow and a percentage. */
function RateChange({ sim }: { sim: Sim }) {
  const k = sim.rate / sim.rateYesterday - 1;
  if (Math.abs(k) < 0.0005) return <em className="v3-rate is-flat">{tl("較昨日持平")}</em>;
  return <em className={`v3-rate ${k > 0 ? "is-up" : "is-down"}`}>{tl("較昨日")} {k > 0 ? "▲" : "▼"}{Math.abs(k * 100).toFixed(1)}%</em>;
}

// ---------------------------------------------------------------- live log

function LiveLog({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const [tab, setTab] = useState<"all" | "mine" | "rank">("all");
  const mine = tab === "mine";
  const bucket = Math.floor(sim.now / 30_000);
  const others = useMemo(() => sim.feed(bucket * 30_000), [sim, bucket]);
  const own = s.dives.slice(-20).map((d) => ({ id: `me-${d.id}`, who: tl("你"), dest: d.dest, outcome: d.result?.outcome, mult: d.result?.multX100, at: d.at, choice: d.choice, me: true }));
  const items = [...own, ...(mine ? [] : others.map((o) => ({ ...o, me: false })))].sort((a, b) => b.at - a.at).slice(0, 30);
  const todayCount = others.filter((o) => Math.floor(o.at / 86_400_000) === sim.today).length + passesOn(s, sim.today);
  return (
    <aside className="hud-live" aria-label={tl("即時探索日誌")}>
      <header>
        <span className="hud-kicker">{tl("即時探索日誌")}</span>
        <p>{sim.mode === "preview" ? tl("所有觀測者的光橋。預覽模式：其他人的動態是模擬的。") : tl("所有觀測者的光橋，直接讀取鏈上紀錄。")}</p>
        <div className="hud-live__stats">
          <span><small>{tl("今天出發")}</small><b>{todayCount}</b></span>
          <span><small>{tl("最高倍率")}</small><b>{items.some((i) => i.mult !== undefined) ? `×${(Math.max(...items.map((i) => i.mult ?? 0)) / 100).toFixed(2)}` : "—"}</b></span>
        </div>
        <div className="hud-seg" role="group">
          <button type="button" className={tab === "all" ? "is-on" : ""} onClick={() => setTab("all")}>{tl("全部")}</button>
          <button type="button" className={tab === "mine" ? "is-on" : ""} onClick={() => setTab("mine")}>{tl("只看我")}</button>
          <button type="button" className={tab === "rank" ? "is-on" : ""} onClick={() => setTab("rank")}>{tl("今日榜")}</button>
        </div>
      </header>
      {tab === "rank" ? <Ranking sim={sim} /> : (
      <ol className="hud-live__list">
        {items.map((x) => {
          const d = DESTINATIONS[x.dest];
          const light = sim.sky.lights[x.dest];
          const big = x.outcome === "great" || x.outcome === "legend";
          return (
            <li key={x.id} className={`${x.me ? "is-mine" : ""}${x.outcome ? "" : " is-flight"}${big ? " is-big" : ""}`} style={{ ["--lc" as string]: LIGHT_COLOR[light] }}>
              <i className="hud-live__mark" />
              <div>
                <p>{"owner" in x && x.owner ? <button type="button" className="v3-who" onClick={() => openProfile(x.owner)} title={tl("看這位觀測者的檔案")}>{x.who}</button> : <b>{x.who}</b>} · {CIRCLED[d.cluster]} {TEXTS.clusters[d.cluster].destinations[d.slot].name}</p>
                {x.outcome ? (
                  <p className="hud-live__result" style={{ ["--tc" as string]: OUTCOME_TONE[x.outcome as keyof typeof OUTCOME_TONE] }}>{OUTCOME[x.outcome as keyof typeof OUTCOME]} ×{((x.mult ?? 0) / 100).toFixed(2)}{x.choice && x.choice !== "none" ? ` · ${CHOICE[x.choice as Choice].name}` : ""}</p>
                ) : (
                  <p className="hud-live__result is-flight">{tl("光橋上")}</p>
                )}
              </div>
              <small>{ago(sim.now - x.at)}</small>
            </li>
          );
        })}
      </ol>
      )}
    </aside>
  );
}

