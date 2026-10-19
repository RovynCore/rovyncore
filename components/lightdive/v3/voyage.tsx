"use client";

// The voyage screen: a five-minute dive shown as a route from 碑原 to the destination with the team's light moving
// along it, the crew, the odds, and a log that writes itself beside it. Lines unlock as the voyage goes on, the
// decision appears 30% in and stays open until the reveal, and the last line is the result.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FastForward, Sparkles, X } from "lucide-react";
import { DECISION_AT, DESTINATIONS, basePoints, planDive, skyOf, type Choice, type DivePlan } from "@/lib/lightdive-v3/rules";
import { CLUSTER_IMAGES } from "@/lib/lightdive-v3/credits";
import { NftArt } from "../game/art";
import { LightIcon, flyLight } from "./kit";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { play } from "./audio";
import { decisionAt, deciding, rateOf, stabilityOf, teamInput, teamName as teamNameOf, turnOpenAt, turning, type Sim, type SimDive, type SimNft } from "./sim";
import { BEAM, CHOICE, CIRCLED, CLUSTER_HUE, KIND, LIGHT, LIGHT_COLOR, OUTCOME_TONE, RARITY_COLOR, SLOT, STAR, TIER, clock, fmt, outcomeName, pct } from "./copy";
import { gap, tl } from "@/lib/lightdive-v3/i18n";
import { ROUTE_P as P, alongRoute, routeIn } from "./voyage-route";
import type { VoyageGl, VoyageView } from "./voyage-engine";
import { fxQuality } from "./settings";

const DAY = 86_400_000;
type Kind = "line" | "rovyn" | "seeker" | "star" | "decision" | "choice" | "after" | "result";
type Entry = { key: string; at: number; kind: Kind; text: string; color?: string; who?: SimNft };

const pick = <T,>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed)) % list.length];
const CHOICE_TONE: Record<Exclude<Choice, "none">, string> = { steady: "#7fd3ff", bold: "#ff8a5c", detour: "#c9ff55" };
const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;

/** Every line of one voyage that has happened by \`now\`, in order. Lines are picked from the dive id, so a voyage
 *  always tells the same story when you come back to it. */
function entriesOf(sim: Sim, d: SimDive, now: number): Entry[] {
  const s = sim.state!;
  const dest = DESTINATIONS[d.dest];
  const team = teamNameOf(s, d.spire);
  const seekers = (s.teams.find((t) => t.spire === d.spire)?.seekers ?? []).map((id) => s.nfts.find((n) => n.id === id)).filter((n): n is SimNft => !!n);
  // the Chinese lines put spaces around {目的地} for the source text only; other languages keep their spacing
  const fill = (text: string, seeker?: SimNft) => text.replaceAll(tl("{隊伍}"), team).replace(gap() ? /\{目的地\}/g : / ?\{目的地\} ?/g, destName(d.dest)).replaceAll(tl("{探索者}"), seeker ? `#${seeker.id}` : tl("探索者"));
  const V = TEXTS.voyage;
  const travel = V.travel[dest.cluster];
  const at = (k: number) => d.at + (d.revealAt - d.at) * k;
  const seekerLine = (n: number): Pick<Entry, "text" | "color" | "who"> => {
    const sk = seekers[(d.id + n) % Math.max(1, seekers.length)];
    return sk ? { text: fill(pick(V.seeker[sk.trait], d.id * 7 + n * 3), sk), color: LIGHT_COLOR[sk.trait], who: sk } : { text: fill(pick(travel, d.id + 4 + n)) };
  };
  const ev = d.plan.event;
  const list: Entry[] = [
    { key: "start", at: at(0), kind: "line", text: fill(pick(V.start, d.id)) },
    { key: "rovyn", at: at(0.02), kind: "rovyn", text: tl("Rovyn：「{0}」", { 0: pick(TEXTS.departures[dest.cluster], d.id) }) },
    { key: "t1", at: at(0.08), kind: "line", text: fill(pick(travel, d.id * 3)) },
    { key: "s1", at: at(0.18), kind: "seeker", ...seekerLine(0) },
    ev ? { key: "star", at: at(0.42), kind: "star", text: pick(V.star[ev], d.id), color: STAR[ev].color } : { key: "t2", at: at(0.42), kind: "line", text: fill(pick(travel, d.id * 3 + 1)) },
    { key: "t3", at: at(0.56), kind: "line", text: fill(pick(travel, d.id * 3 + 2)) },
    { key: "s2", at: at(0.68), kind: "seeker", ...seekerLine(1) },
    { key: "near", at: at(0.8), kind: "line", text: fill(pick(V.approach, d.id)) },
    { key: "close", at: at(0.92), kind: "line", text: fill(pick(V.closing, d.id)) },
  ];
  if (d.card !== undefined) {
    const card = TEXTS.cards[d.card];
    list.push({ key: "decision", at: decisionAt(d), kind: "decision", text: card.scene });
    if (d.choice && d.choiceAt) {
      const option = card.options.find((o) => o.choice === d.choice);
      list.push({ key: "choice", at: d.choiceAt, kind: "choice", text: tl("你選擇「{0}」——{1}：{2}。", { 0: option?.text ?? CHOICE[d.choice].name, 1: CHOICE[d.choice].name, 2: CHOICE[d.choice].effect }) });
      list.push({ key: "after", at: d.choiceAt + 1500, kind: "after", text: fill(pick(V.after[d.choice], d.id)) });
    } else if (d.result) {
      list.push({ key: "choice", at: d.revealAt - 1, kind: "choice", text: tl("沒有做出抉擇，這趟順其自然。") });
    }
  }
  if (d.deep) {
    list.push({ key: "deep", at: turnOpenAt(d), kind: "rovyn", text: tl("Rovyn：「到最深處了。光很亮，也很不穩——要繼續，還是回航？」") });
    if (d.turnedBack) list.push({ key: "back", at: d.revealAt - 60_000, kind: "choice", text: tl("你選擇回航：這趟固定 ×1.00，只耗損 1 次航程。") });
  }
  if (d.result) list.push({ key: "result", at: d.revealAt, kind: "result", text: d.log ?? "", color: OUTCOME_TONE[d.result.outcome] });
  return list.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
}

/** Types the newest line out letter by letter. */
function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) window.clearInterval(t);
    }, 26);
    return () => window.clearInterval(t);
  }, [text]);
  return <>{text.slice(0, n)}{n < text.length && <i className="v3-voyage__caret" aria-hidden="true">▍</i>}</>;
}

export function VoyageLog({ sim, id, arriving, onArrived, onClose, onSwitch, onCollect }: { sim: Sim; id: number; arriving?: boolean; onArrived?: () => void; onClose: () => void; onSwitch: (id: number) => void; onCollect: (d: SimDive) => void }) {
  const s = sim.state!;
  const d = s.dives.find((x) => x.id === id);
  const list = d ? entriesOf(sim, d, sim.now) : [];
  const body = useRef<HTMLOListElement>(null);
  const count = list.length;
  const [aside, setAside] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null); // a log line under the pointer, lit on the route
  const sceneRef = useRef<HTMLDivElement>(null);
  const routeRef = useRef<HTMLDivElement>(null);
  const gl = useVoyageGl(sim, d, list, arriving, sceneRef, routeRef);
  // the arrival: the light reaches the destination and the result's colour blooms there, then the dialog takes over
  const arrivedRef = useRef(onArrived);
  useEffect(() => { arrivedRef.current = onArrived; });
  useEffect(() => {
    if (!arriving) return;
    play("scan");
    const t = window.setTimeout(() => arrivedRef.current?.(), 2600);
    return () => window.clearTimeout(t);
  }, [arriving]);
  // keep the open voyage visible in the switcher when it scrolls sideways
  useEffect(() => {
    document.querySelector(".v3-voyage .v3-vtab.is-on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [id]);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".v3-modal")) close.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    body.current?.scrollTo({ top: body.current.scrollHeight, behavior: "smooth" });
    if (count > 1) play("hover", 0.7);
  }, [count]);
  if (!d) return null;
  const dest = DESTINATIONS[d.dest];
  const span = d.revealAt - d.at;
  const k = Math.min(1, Math.max(0, (sim.now - d.at) / span));
  const others = s.dives.filter((x) => !x.result || x.pending || x.id === d.id).sort((a, b) => a.id - b.id);
  const open = deciding(d, sim.now);
  const light = sim.sky.lights[d.dest];
  const staged = open && !d.choice;
  const showStage = staged && aside !== d.id;
  const collect = (el: Element) => {
    if (d.result && d.result.outcome !== "empty") flyLight(el, ".hud-res--claim", OUTCOME_TONE[d.result.outcome]);
    onCollect(d);
  };
  return (
    <section className={`v3-voyage${gl ? " has-gl" : ""}${arriving && d.result && (d.result.outcome === "great" || d.result.outcome === "legend") ? " is-flash" : ""}`} aria-label={tl("航行：{0}", { 0: destName(d.dest) })}
      style={{ ["--photo" as string]: `url(${CLUSTER_IMAGES[dest.cluster].src})`, ["--hue" as string]: CLUSTER_HUE[dest.cluster], ["--lc" as string]: LIGHT_COLOR[light] }}>
      <button type="button" className="v3-dest__close v3-voyage__close" onClick={onClose} aria-label={tl("關閉航行畫面")}><X aria-hidden="true" /></button>
      <div className="v3-voyage__scene" ref={sceneRef}>
        <header className="v3-voyage__head">
          <span className="hud-kicker">{CIRCLED[dest.cluster]}{SLOT[dest.slot]} · {TEXTS.clusters[dest.cluster].name} · {d.result ? (d.pending ? tl("已揭曉，待收取") : tl("已收取")) : open ? tl("抉擇中") : tl("航行中")}</span>
          <h2>{destName(d.dest)} <small>{teamNameOf(s, d.spire)}</small></h2>
          {others.length > 1 && (
            <div className="v3-voyage__tabs" role="tablist" aria-label={tl("航行中的隊伍")}>
              {others.map((x) => {
                const xk = Math.min(1, Math.max(0, (sim.now - x.at) / Math.max(1, x.revealAt - x.at)));
                const ev = deciding(x, sim.now);
                const state = x.pending ? tl("待收取") : x.result ? tl("已收取") : ev ? tl("抉擇！") : `${clock(x.revealAt - sim.now)}`;
                const xd = DESTINATIONS[x.dest];
                return (
                  <button key={x.id} type="button" role="tab" aria-selected={x.id === d.id} onClick={() => onSwitch(x.id)}
                    className={`v3-vtab${x.id === d.id ? " is-on" : ""}${ev ? " is-event" : ""}${x.pending ? " is-ready" : ""}${x.result && !x.pending ? " is-done" : ""}`}
                    style={{ ["--k" as string]: xk, ["--hue" as string]: CLUSTER_HUE[xd.cluster] }}>
                    <span className="v3-vtab__top"><b>{CIRCLED[xd.cluster]}{SLOT[xd.slot]} {destName(x.dest)}</b><em>{state}</em></span>
                    <small>{teamNameOf(s, x.spire)}</small>
                    <i className="v3-vtab__bar" aria-hidden="true"><i /></i>
                  </button>
                );
              })}
            </div>
          )}
        </header>
        <Route d={d} k={k} list={list} arriving={arriving} focus={focusKey} boxRef={routeRef} />
        {staged && !showStage && (
          <button type="button" className="v3-decidebar" onClick={() => setAside(null)}><Sparkles aria-hidden="true" />{tl("航行抉擇：{0} · 點這裡做出選擇", { 0: TEXTS.cards[d.card!].title })}</button>
        )}
        <div className="v3-voyage__progress" style={{ ["--k" as string]: k, ["--d" as string]: (decisionAt(d) - d.at) / span }}>
          <i />
          <span>{d.result ? tl("已揭曉") : open ? (d.deep ? tl("抉擇中 · 回航時刻前截止") : tl("抉擇中 · 揭曉前 1 分鐘截止")) : tl("{0} 後揭曉", { 0: clock(d.revealAt - sim.now) })}</span>
          {!d.result && sim.hurry && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => sim.hurry?.(d.id, 60_000)} title={tl("預覽用：讓這趟航行往前 1 分鐘")}><FastForward aria-hidden="true" />{tl("快轉 1 分鐘")}</button>}
        </div>
        <Tags d={d} />
        {d.deep && !d.result && <TurnBack sim={sim} d={d} />}
        <Crew sim={sim} d={d} />
        {d.result && arriving ? <p className="v3-voyage__signal"><i /><i /><i />{tl("光橋抵達{0}，訊號回傳中…", { 0: destName(d.dest) })}</p> : d.result ? <Outcome d={d} onCollect={collect} /> : <Odds d={d} />}
        {showStage && (
          <StageLayer>
            <div className="v3-decisionstage" role="dialog" aria-label={tl("航行抉擇：{0}", { 0: TEXTS.cards[d.card!].title })}>
              <Decision sim={sim} d={d} stage onLater={() => setAside(d.id)} />
            </div>
          </StageLayer>
        )}
      </div>
      <div className="v3-voyage__side">
        <div className="v3-voyage__sidehead">
          <b>{tl("航行日誌")}</b>
          <span>{tl("今天的光：")}<i style={{ color: LIGHT_COLOR[light] }}><LightIcon light={light} />{LIGHT[light]}</i></span>
        </div>
        <ol className="v3-voyage__log" ref={body}>
          {list.map((e, i) => (
            <li key={e.key} className={`is-${e.kind}${focusKey === e.key ? " is-focus" : ""}`} style={e.color ? { ["--ec" as string]: e.color } : undefined}
              onMouseEnter={() => setFocusKey(e.key)} onMouseLeave={() => setFocusKey((x) => (x === e.key ? null : x))}>
              <time>{clock(e.at - d.at)}</time>
              <LogIcon e={e} d={d} />
              {e.kind === "decision" ? (
                staged ? (
                  <div className="v3-decision is-note"><span className="v3-decision__kicker"><Sparkles aria-hidden="true" />{tl("航行抉擇")}</span><b className="v3-decision__title">{TEXTS.cards[d.card!].title}</b><p>{TEXTS.cards[d.card!].scene}</p>{!showStage && <button type="button" className="hud-btn hud-btn--gold hud-btn--sm" onClick={() => setAside(null)}>{tl("做出選擇")}</button>}</div>
                ) : <Decision sim={sim} d={d} />
              ) : e.kind === "result" && d.result ? (
                <div className="v3-voyage__result">
                  <b style={{ color: OUTCOME_TONE[d.result.outcome] }}>{outcomeName(d)} ×{(d.result.multX100 / 100).toFixed(2)}</b>
                  <p>{tl("「")}{i === list.length - 1 ? <Typewriter text={e.text} /> : e.text}{tl("」")}</p>
                </div>
              ) : (
                <p>{i === list.length - 1 ? <Typewriter text={e.text} /> : e.text}</p>
              )}
            </li>
          ))}
          {!d.result && !open && <li className="is-wait" aria-hidden="true"><time /><span className="v3-logicon is-line" /><p><i /><i /><i /></p></li>}
        </ol>
      </div>
    </section>
  );
}

/** The WebGL scene behind a voyage (desktop, effects not set to low): created per voyage, fed every render, and told
 *  when something happens on the way: a crew line, the star event, the choice, the arrival. Returns whether it runs;
 *  without it the CSS version of the scene stays as it was. */
function useVoyageGl(sim: Sim, d: SimDive | undefined, list: Entry[], arriving: boolean | undefined, sceneRef: RefObject<HTMLDivElement | null>, routeRef: RefObject<HTMLDivElement | null>) {
  const api = useRef<VoyageGl | null>(null);
  const [on, setOn] = useState(false);
  const id = d?.id;
  const cluster = d ? DESTINATIONS[d.dest].cluster : 0;
  useEffect(() => {
    if (id === undefined || !sceneRef.current || !routeRef.current) return;
    if (window.matchMedia("(max-width: 1100px)").matches || fxQuality() === "low") return;
    let dead = false;
    let made: VoyageGl | null = null;
    const host = sceneRef.current, route = routeRef.current;
    import("./voyage-engine")
      .then((m) => m.createVoyage(host, route, CLUSTER_IMAGES[cluster].src, CLUSTER_HUE[cluster]))
      .then((g) => {
        if (dead) { g.destroy(); return; }
        made = g;
        api.current = g;
        setOn(true);
      })
      .catch(() => {});
    return () => { dead = true; made?.destroy(); api.current = null; setOn(false); };
  }, [id, cluster, sceneRef, routeRef]);

  // what the scene needs this render
  const s = sim.state!;
  const team = d ? s.teams.find((x) => x.spire === d.spire) : undefined;
  const light = d ? sim.sky.lights[d.dest] : 0;
  const crew: VoyageView["crew"] = d ? [
    { color: "#f0c766", attuned: false },
    ...(team?.prism !== undefined ? [{ color: "#7fd3ff", attuned: false }] : []),
    ...(team?.seekers ?? []).map((x) => s.nfts.find((n) => n.id === x)).filter((n): n is SimNft => !!n).map((n) => ({ color: LIGHT_COLOR[n.trait], attuned: n.trait === light })),
  ] : [];
  const tone = !d ? "#c9ff55" : d.result ? OUTCOME_TONE[d.result.outcome] : d.choice && d.choice !== "none" ? CHOICE_TONE[d.choice] : "#c9ff55";
  useEffect(() => {
    if (!d) return;
    api.current?.update({ at: d.at, revealAt: d.revealAt, deciding: deciding(d, sim.now) && !d.choice, tone, crew, done: !!d.result });
  });

  // events: compared with what this voyage looked like on the previous render
  const seen = useRef<{ id?: number; k: number; seekers: number; choice?: Choice; arrived: boolean }>({ k: 0, seekers: 0, arrived: false });
  const k = d ? Math.min(1, Math.max(0, (sim.now - d.at) / Math.max(1, d.revealAt - d.at))) : 0;
  const seekerLines = list.filter((e) => e.kind === "seeker");
  useEffect(() => {
    if (!d) return;
    const prev = seen.current;
    const g = api.current;
    if (prev.id === d.id && g) {
      if (d.plan.event && prev.k < 0.42 && k >= 0.42 && !d.result) g.storm(STAR[d.plan.event].color);
      if (seekerLines.length > prev.seekers) g.pulse(seekerLines[seekerLines.length - 1].color ?? "#c9ff55");
      if (!prev.choice && d.choice && d.choice !== "none") g.choose(CHOICE_TONE[d.choice]);
      if (arriving && d.result && !prev.arrived) g.arrive(d.result.outcome, OUTCOME_TONE[d.result.outcome]);
    }
    seen.current = { id: d.id, k, seekers: seekerLines.length, choice: d.choice, arrived: prev.id === d.id ? prev.arrived || !!(arriving && d.result && g) : !!(arriving && d.result) };
  });
  return on;
}

/** The route scene: the light bridge fills up behind the team's light; what happened (and what is still ahead) sits on
 *  the route as markers. */
function Route({ d, k, list, arriving, focus, boxRef }: { d: SimDive; k: number; list: Entry[]; arriving?: boolean; focus?: string | null; boxRef?: RefObject<HTMLDivElement | null> }) {
  const span = d.revealAt - d.at;
  const ev = d.plan.event;
  const marks: { key: string; u: number; kind: string; label?: string; color?: string; done: boolean }[] = [];
  for (const e of list) {
    if (e.kind === "seeker") marks.push({ key: e.key, u: (e.at - d.at) / span, kind: "seeker", color: e.color, done: true });
  }
  if (ev) marks.push({ key: "star", u: 0.42, kind: "star", label: STAR[ev].name, color: STAR[ev].color, done: k >= 0.42 });
  if (d.card !== undefined) marks.push({ key: "decision", u: DECISION_AT, kind: "decision", label: d.choice ? CHOICE[d.choice].name : tl("抉擇"), color: "#f0c766", done: k >= DECISION_AT });
  const own = useRef<HTMLDivElement>(null);
  const box = boxRef ?? own;
  const [size, setSize] = useState({ w: 100, h: 100 });
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(1, e.contentRect.width), h: Math.max(1, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [box]);
  const ROUTE = routeIn(size.w, size.h);
  const along = alongRoute(size.w, size.h);
  const ship = along(k);
  const tone = d.result ? OUTCOME_TONE[d.result.outcome] : d.choice && d.choice !== "none" ? CHOICE_TONE[d.choice] : "#c9ff55";
  return (
    <div ref={box} className={`v3-route2${d.result ? " is-done" : ""}`} style={{ ["--tone" as string]: tone }}>
      <svg viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
        <path d={ROUTE} className="v3-route2__track" pathLength={100} />
        <path d={ROUTE} className="v3-route2__glow" pathLength={100} style={{ strokeDashoffset: 100 - k * 100 }} />
        <path d={ROUTE} className="v3-route2__line" pathLength={100} style={{ strokeDashoffset: 100 - k * 100 }} />
      </svg>
      <span className="v3-route2__node is-home" style={{ left: `${P[0][0]}%`, top: `${P[0][1]}%` }}><i /><b>{tl("碑原")}</b></span>
      <span className="v3-route2__node is-dest" style={{ left: `${P[3][0]}%`, top: `${P[3][1]}%` }}><i /><b>{destName(d.dest)}</b><small>{tl("門檻 {0}", { 0: DESTINATIONS[d.dest].threshold })}</small></span>
      {marks.map((m) => {
        const p = along(m.u);
        return (
          <span key={m.key} className={`v3-route2__mark is-${m.kind}${m.done ? " is-done" : ""}${focus === m.key ? " is-focus" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%`, ["--mc" as string]: m.color ?? "#fff" }}>
            <i />{m.label && <b>{m.label}</b>}
          </span>
        );
      })}
      {!d.result && <span className={`v3-route2__ship${d.choice ? ` is-${d.choice}` : ""}`} style={{ left: `${ship.x}%`, top: `${ship.y}%` }} aria-hidden="true"><i />{d.choice && <b key={d.choice} className="v3-route2__burst" />}</span>}
      <span className="v3-route2__dust" aria-hidden="true" />
      {arriving && d.result && (
        <span className={`v3-route2__arrive is-${d.result.outcome}`} style={{ left: `${P[3][0]}%`, top: `${P[3][1]}%`, ["--tone" as string]: OUTCOME_TONE[d.result.outcome] }} aria-hidden="true">
          <i /><i /><i /><b />
        </span>
      )}
    </div>
  );
}

/** Who is on the bridge: the spire, its prism and the seekers. Seekers whose light matches today's light here glow and
 *  carry a 同頻 badge; hovering any member shows what it brings to this trip. After the decision the crew takes its colour. */
function Crew({ sim, d }: { sim: Sim; d: SimDive }) {
  const s = sim.state!;
  const team = s.teams.find((x) => x.spire === d.spire);
  const ids = [d.spire, ...(team?.prism !== undefined ? [team.prism] : []), ...(team?.seekers ?? [])];
  const cards = ids.map((x) => s.nfts.find((n) => n.id === x)).filter((n): n is SimNft => !!n);
  const here = skyOf(Math.floor(d.at / DAY)).lights[d.dest];
  // each attuned seeker's share of the team's attunement bonus (15% of its power, the team capped at +10%)
  const raw = cards.filter((n) => n.kind === 2 && n.trait === here).reduce((x, n) => x + 0.15 * n.power, 0);
  const scale = raw > 0 ? d.plan.bonus / raw : 0;
  const tone = d.choice && d.choice !== "none" ? CHOICE_TONE[d.choice] : undefined;
  return (
    <div className={`v3-voyage__crew${tone ? " has-choice" : ""}`} aria-label={tl("出發隊伍")} style={tone ? { ["--cc" as string]: tone } : undefined}>
      <small>{tl("隊伍戰力")} <b>{d.plan.power}</b>{d.plan.bonus ? <em>{tl("同頻加成 +{0}", { 0: Math.round(d.plan.bonus) })}</em> : null}{tone && d.choice ? <i>{CHOICE[d.choice].name} · {CHOICE[d.choice].tag}</i> : null}</small>
      <ul>
        {cards.map((n) => {
          const attuned = n.kind === 2 && n.trait === here;
          const share = attuned ? 0.15 * n.power * scale : 0;
          const role = n.kind === 0 ? tl("光塔：戰力 +{0}，可坐 {1} 位探索者", { 0: n.power, 1: n.trait })
            : n.kind === 1 ? tl("{0}稜鏡：戰力 +{1}，{2}", { 0: BEAM[n.trait], 1: n.power, 2: [tl("空手機率較低、大獎較小"), tl("標準的風險和報酬"), tl("空手機率較高、大獎較大")][n.trait] })
            : attuned ? tl("戰力 +{0}，{1}和這裡同頻：再帶回 +{2} 光塵", { 0: n.power, 1: LIGHT[n.trait], 2: Math.round(share) })
            : tl("戰力 +{0}；光紋是{1}，今天這裡是{2}", { 0: n.power, 1: LIGHT[n.trait], 2: LIGHT[here] });
          return (
            <li key={n.id} className={attuned ? "is-attuned" : ""} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity], ["--lc" as string]: n.kind === 2 ? LIGHT_COLOR[n.trait] : RARITY_COLOR[n.rarity] }} tabIndex={0} aria-label={tl("{0} #{1}，{2}", { 0: KIND[n.kind], 1: n.id, 2: role })}>
              <span><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
              <small>{n.kind === 0 ? tl("{0} 泊位", { 0: n.trait }) : n.kind === 1 ? BEAM[n.trait] : LIGHT[n.trait]}</small>
              {attuned && <em className="v3-crew__attune">{tl("同頻")}</em>}
              <span className="v3-crew__tip" role="tooltip">
                <b>{KIND[n.kind]} #{n.id}</b>
                <small style={{ color: RARITY_COLOR[n.rarity] }}>{tl("{0} · 戰力 {1}", { 0: TIER[n.rarity], 1: n.power })}</small>
                <em>{role}</em>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** While the voyage runs: what this trip is worth and how the odds look right now. */
function Odds({ d }: { d: SimDive }) {
  const p = d.plan;
  const names = p.names ?? [];
  const empty = p.table[0][0] / 100;
  const big = p.table.reduce((a, [prob], i) => a + (names[i] === "great" || names[i] === "legend" ? prob : 0), 0) / 100;
  const base = basePoints(p) * (d.rate ?? rateOf(Math.floor(d.at / DAY)));
  return (
    <dl className="v3-voyage__odds">
      <div><dt>{tl("基礎收益")}</dt><dd>{fmt(base * (1 - p.levy))}<small>{tl("$RVYN · 再乘上揭曉倍率")}</small></dd></div>
      <div><dt>{tl("空手機率")}</dt><dd>{empty.toFixed(empty % 1 ? 1 : 0)}%</dd></div>
      <div><dt>{tl("大豐收以上")}</dt><dd>{big.toFixed(big % 1 ? 1 : 0)}%</dd></div>
      <div><dt>{tl("出發成本")}</dt><dd>{pct(p.levy, 0)}</dd></div>
    </dl>
  );
}

/** After the reveal: the outcome, the multiplier and the reward rolling up, and the collect button. */
function Outcome({ d, onCollect }: { d: SimDive; onCollect: (el: Element) => void }) {
  const r = d.result!;
  const base = basePoints(d.plan) * (d.deep ? 2 : 1) * (d.rate ?? rateOf(Math.floor(d.at / DAY)));
  return (
    <div className={`v3-voyage__outcome is-${r.outcome}`} style={{ ["--tc" as string]: OUTCOME_TONE[r.outcome] }}>
      <div>
        <small>{outcomeName(d)}</small>
        <b>×<Roll value={r.multX100 / 100} /></b>
      </div>
      <p>{tl("基礎 {0}", { 0: fmt(base) })} × {tl("{0} − 出發成本", { 0: (r.multX100 / 100).toFixed(2) })} {fmt(d.levyPaid ?? 0)} {tl("· 耗損 {0} 次航程", { 0: r.wear })}</p>
      <strong>+<Roll value={d.reward ?? 0} /> <small>$RVYN</small></strong>
      {d.pending ? (
        <button type="button" className="hud-btn hud-btn--gold" onClick={(e) => onCollect(e.currentTarget)}>{r.outcome === "empty" ? tl("確認") : tl("收取 +{0}", { 0: fmt(d.reward ?? 0) })}</button>
      ) : <em className="v3-voyage__done">{tl("已收取，在「可領取」裡")}</em>}
    </div>
  );
}

/** A number that rolls up from zero when it first shows. */
function Roll({ value }: { value: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const q = Math.min(1, (now - start) / 1100);
      setV(value * (1 - (1 - q) ** 3));
      if (q < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toFixed(2)}</>;
}

/** The decision of this voyage: the scene, and each option with what it does to this dive in numbers. */
function Decision({ sim, d, stage, onLater }: { sim: Sim; d: SimDive; stage?: boolean; onLater?: () => void }) {
  const s = sim.state!;
  const card = TEXTS.cards[d.card!];
  const team = s.teams.find((x) => x.spire === d.spire);
  const plan = (c: Choice): DivePlan | null =>
    (team ? planDive(teamInput(s, team), DESTINATIONS[d.dest], skyOf(Math.floor(d.at / DAY)), c, { stability: stabilityOf(d.bond, d.supply), deep: d.deep }) : null);
  const stats = (p: DivePlan | null) => {
    if (!p) return null;
    const names = p.names ?? [];
    return {
      empty: p.table[0][0] / 100,
      big: p.table.reduce((a, [prob], i) => a + (names[i] === "great" || names[i] === "legend" ? prob : 0), 0) / 100,
      wear: p.wear2 + p.wear3,
      levy: p.levy,
    };
  };
  const base = stats(plan("none"));
  const open = deciding(d, sim.now);
  const choose = (c: Choice) => { sim.choose(d.id, c); play(c === "bold" ? "great" : "toggle"); };
  const mark = (v: number, b: number | undefined, higherIsGood: boolean) => (b === undefined || Math.abs(v - b) < 1e-9 ? "" : (v > b) === higherIsGood ? "is-up" : "is-down");
  return (
    <div className={`v3-decision${open ? " is-open" : ""}${stage ? " is-stage" : ""}`}>
      <span className="v3-decision__kicker"><Sparkles aria-hidden="true" />{tl("航行抉擇")}</span>
      <b className="v3-decision__title">{card.title}</b>
      <p>{card.scene}</p>
      <div className="v3-decision__options">
        {card.options.map((o, oi) => {
          const c = o.choice as Choice;
          const st = stats(plan(c));
          const chosen = d.choice === c;
          return (
            <button key={o.text} type="button" className={`is-${c}${chosen ? " is-chosen" : ""}`} disabled={!open} onClick={() => choose(c)} style={{ ["--n" as string]: oi }}>
              <span className="v3-decision__text">{o.text}</span>
              <span className="v3-decision__tag">{CHOICE[c].name} · {CHOICE[c].tag}</span>
              {st && (
                <span className="v3-decision__stats">
                  <span className={mark(st.empty, base?.empty, false)}><small>{tl("空手")}</small>{st.empty.toFixed(st.empty % 1 ? 1 : 0)}%</span>
                  <span className={mark(st.big, base?.big, true)}><small>{tl("大豐收以上")}</small>{st.big.toFixed(st.big % 1 ? 1 : 0)}%</span>
                  <span className={mark(st.wear, base?.wear, false)}><small>{tl("多耗損")}</small>{st.wear ? pct(st.wear, 0) : tl("無")}</span>
                  <span className={mark(st.levy, base?.levy, false)}><small>{tl("出發成本")}</small>{pct(st.levy, 0)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      {open && <small className="v3-decision__hint">{d.deep ? tl("回航時刻（揭曉前 10 分鐘）前截止；沒選就當作順其自然。") : tl("揭曉前 1 分鐘截止；沒選就當作順其自然。")}</small>}
      {stage && onLater && <button type="button" className="v3-decision__later" onClick={onLater}>{tl("先看航線，等一下再選")}</button>}
    </div>
  );
}

/** Below 1180px the decision covers the whole screen; the voyage scene is its own stacking context, so a full-screen
 *  layer inside it would sit under the menu and the log. There it renders at the game root instead. */
function StageLayer({ children }: { children: ReactNode }) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 1180px)");
    const on = () => setNarrow(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  const host = narrow ? document.querySelector(".ldg-app") : null;
  return host ? createPortal(children, host) : <>{children}</>;
}

/** What this voyage carries: a deep dive, a supply, the crew bond at departure. */
function Tags({ d }: { d: SimDive }) {
  const tags: [string, string | null][] = [];
  if (d.deep) tags.push([tl("深潛 · 光塵 ×2"), null]);
  if (d.supply === 1) tags.push([tl("燈油 · 只耗損 1 次"), "/lightdive/items/lamp-oil.webp"]);
  if (d.supply === 2) tags.push([tl("星圖殘頁 · 空手 −3%"), "/lightdive/items/star-chart-fragment.webp"]);
  if (d.bond) tags.push([tl("默契 {0} · 空手 −{0}%", { 0: d.bond }), null]);
  if (!tags.length) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <p className="v3-voyage__tags">{tags.map(([t, icon]) => <span key={t}>{icon && <img src={icon} alt="" />}{t}</span>)}</p>;
}

/** A deep dive's second decision: from 10 minutes before the reveal until 1 minute before it, press on or turn back. */
function TurnBack({ sim, d }: { sim: Sim; d: SimDive }) {
  const open = turning(d, sim.now);
  const set = (back: boolean) => { sim.turnBack(d.id, back); play(back ? "toggle" : "great"); };
  if (sim.now < turnOpenAt(d)) {
    return <p className="v3-turnback is-later">{tl("深潛的最後 10 分鐘可以選擇回航（{0} 後）。", { 0: clock(turnOpenAt(d) - sim.now) })}</p>;
  }
  return (
    <div className={`v3-turnback${open ? " is-open" : ""}`}>
      <b>{tl("深潛 · 繼續還是回航？")}</b>
      <div>
        <button type="button" className={!d.turnedBack ? "is-on" : ""} disabled={!open} onClick={() => set(false)}>
          <b>{tl("繼續深潛")}</b><span>{tl("照這趟的勝算揭曉，光塵 ×2")}</span>
        </button>
        <button type="button" className={d.turnedBack ? "is-on" : ""} disabled={!open} onClick={() => set(true)}>
          <b>{tl("回航")}</b><span>{tl("固定 ×1.00，只耗損 1 次航程")}</span>
        </button>
      </div>
      <small>{open ? tl("揭曉前 1 分鐘截止，截止前可以改。") : tl("已截止。")}</small>
    </div>
  );
}

/** The small mark beside a log line: Rovyn's face, the seeker who spoke, the star event, the decision, the result. */
function LogIcon({ e, d }: { e: Entry; d: SimDive }) {
  if (e.kind === "rovyn") {
    // eslint-disable-next-line @next/next/no-img-element
    return <span className="v3-logicon is-rovyn"><img src="/lightdive/keeper-face.webp" alt="" /></span>;
  }
  if (e.kind === "seeker" && e.who) {
    return <span className="v3-logicon is-seeker" title={tl("探索者 #{0}", { 0: e.who.id })}><NftArt a={{ kind: 2, rarity: e.who.rarity, trait: e.who.trait, variant: 0 }} /></span>;
  }
  if (e.kind === "star") return <span className="v3-logicon is-star" aria-hidden="true" />;
  if (e.kind === "decision" || e.kind === "choice") return <span className={`v3-logicon is-decision${d.choice ? ` is-${d.choice}` : ""}`} aria-hidden="true" />;
  if (e.kind === "result" && d.result) return <span className="v3-logicon is-result" style={{ ["--tc" as string]: OUTCOME_TONE[d.result.outcome] }} aria-hidden="true" />;
  return <span className={`v3-logicon is-${e.kind === "after" ? "after" : "line"}`} aria-hidden="true" />;
}
