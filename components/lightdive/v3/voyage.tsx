"use client";

// The voyage screen: a five-minute dive shown as a route from 碑原 to the destination with the team's light moving
// along it, the crew, the odds, and a log that writes itself beside it like a short story (v3.3: nothing to decide on
// the way). Lines unlock as the voyage goes on, and the last line is the result.
import { useEffect, useRef, useState, type RefObject } from "react";
import { FastForward, Sparkles, X } from "lucide-react";
import { DESTINATIONS, basePoints, skyOf } from "@/lib/lightdive-v3/rules";
import { DESCENT_AT, deepImage, destImage, eventImage, skyIcon } from "@/lib/lightdive-v3/art";
import { NftArt } from "../game/art";
import { LightIcon } from "./kit";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { play } from "./audio";
import { dayOf, rateOf, storyAt, teamName as teamNameOf, type Sim, type SimDive, type SimNft } from "./sim";
import { BEAM, CIRCLED, CLUSTER_HUE, KIND, LIGHT, LIGHT_COLOR, OUTCOME_TONE, RARITY_COLOR, SLOT, STAR, TIER, clock, fmt, outcomeName, pct } from "./copy";
import { gap, tl } from "@/lib/lightdive-v3/i18n";
import { ROUTE_P as P, alongRoute, routeIn } from "./voyage-route";
import type { VoyageGl, VoyageView } from "./voyage-engine";
import { fxQuality } from "./settings";

const DAY = 86_400_000;
type Kind = "line" | "rovyn" | "seeker" | "star" | "story" | "voice" | "episode" | "result" | "state" | "reading" | "attuned" | "omen";
type Entry = { key: string; at: number; kind: Kind; text: string; color?: string; who?: SimNft; light?: number };

const pick = <T,>(list: readonly T[], seed: number): T => list[Math.abs(Math.floor(seed)) % list.length];
/** Successive lines from one pool without repeats (as long as the pool lasts), starting from the dive's seed. */
function deal<T>(list: readonly T[], seed: number) {
  const n = list.length, step = n % 7 ? 7 : 1;
  let i = Math.abs(Math.floor(seed)) % n;
  return () => { const x = list[i]; i = (i + step) % n; return x; };
}
const STORY_TONE = "#f0c766";
const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;
type TeamState = "echo" | "first" | "deep" | "oil" | "chart" | "bond";
/** The empty-handed chance at which the readings turn from steady to even, and from even to hard. */
const READING_AT = [0.06, 0.18];
const READING_TONE = { steady: "#9fe8d6", even: "#e6f1ff", hard: "#ff8a6a" };

/** Every line of one voyage that has happened by \`now\`, in order. Lines are picked from the dive id, so a voyage
 *  always tells the same story when you come back to it.
 *
 *  The narrative (10-21, v3.3 10-23; docs/lightdive/TEXTS-v3-draft.md section 八): departure, the team's state, the
 *  place, a short story of the cluster, a seeker, the readings, attunement or the cluster, an event card told as a
 *  story (a crew member says one of its lines, then what followed), the sky, the place again, a second short story, a
 *  seeker, Rovyn from the observatory, the deep descent, the approach, the closing, and at the reveal an omen before
 *  the log. The event card's line is only words: nothing on the way changes the result. The team's state, the readings,
 *  attunement and the sky follow the voyage's real conditions (what it carried, its chance of coming back empty), so a
 *  well-prepared voyage reads better because it is better prepared; the words never change the odds. The omen is
 *  written only once the result exists, and a better result gets a longer one. */
function entriesOf(sim: Sim, d: SimDive, now: number): Entry[] {
  const s = sim.state!;
  const dest = DESTINATIONS[d.dest];
  const team = teamNameOf(s, d.spire);
  const seekers = (s.teams.find((t) => t.spire === d.spire)?.seekers ?? []).map((id) => s.nfts.find((n) => n.id === id)).filter((n): n is SimNft => !!n);
  // the Chinese lines put spaces around {目的地} for the source text only; other languages keep their spacing
  const fill = (text: string, seeker?: SimNft) => text.replaceAll(tl("{隊伍}"), team).replace(gap() ? /\{目的地\}/g : / ?\{目的地\} ?/g, destName(d.dest)).replaceAll(tl("{探索者}"), seeker ? `#${seeker.id}` : tl("探索者"));
  const V = TEXTS.voyage;
  const travel = deal(V.travel[dest.cluster], d.id * 3);
  const place = deal(V.place[d.dest], d.id);
  const at = (k: number) => d.at + (d.revealAt - d.at) * k;
  const seekerLine = (n: number): Pick<Entry, "text" | "color" | "who"> => {
    const sk = seekers[(d.id + n) % Math.max(1, seekers.length)];
    return sk ? { text: fill(pick(V.seeker[sk.trait], d.id * 7 + n * 5), sk), color: LIGHT_COLOR[sk.trait], who: sk } : { text: fill(travel()) };
  };
  // what this voyage carried, most notable first: the first line about the team takes one, a later line the next
  const states: TeamState[] = [];
  if (d.echo) states.push("echo");
  if (d.first) states.push("first");
  if (d.deep) states.push("deep");
  if (d.supply === 1) states.push("oil");
  if (d.supply === 2) states.push("chart");
  if ((d.bond ?? 0) >= 3) states.push("bond");
  const stateLine = (st: TeamState | "plain") => fill(pick(V.state[st], d.id));
  // the readings: the voyage's real chance of coming back empty, after power, bond, supplies, the sky and the beam
  const empty = (d.plan.table[0]?.[0] ?? 0) / 10000;
  const reading = empty <= READING_AT[0] ? "steady" : empty <= READING_AT[1] ? "even" : "hard";
  const light = skyOf(dayOf(d.at)).lights[d.dest];
  const tuned = d.plan.bonus > 0 ? seekers.find((n) => n.trait === light) : undefined;
  const ev = d.plan.event;
  // two short stories, three lines each: one of the destination's cluster, one that could happen anywhere; one seeker
  // of the team plays the part in each
  const story = (pool: readonly (readonly string[])[], seed: number, key: string, from: number) => {
    const sk = seekers[(d.id + seed) % Math.max(1, seekers.length)];
    return pick(pool, d.id * 3 + seed).map((text, i): Entry => ({ key: `${key}${i}`, at: at(from + i * 0.03), kind: "episode", text: fill(text, sk) }));
  };
  const list: Entry[] = [
    { key: "start", at: at(0), kind: "line", text: fill(pick(V.start, d.id)) },
    { key: "rovyn", at: at(0.02), kind: "rovyn", text: tl("Rovyn：「{0}」", { 0: pick(TEXTS.departures[dest.cluster], d.id) }) },
    { key: "state", at: at(0.05), kind: "state", text: stateLine(states[0] ?? "plain") },
    { key: "p1", at: at(0.08), kind: "line", text: fill(place()) },
    ...story(V.episode[dest.cluster], 0, "e1", 0.12),
    { key: "s1", at: at(0.22), kind: "seeker", ...seekerLine(0) },
    { key: "reading", at: at(0.26), kind: "reading", text: fill(pick(V.reading[reading], d.id)), color: READING_TONE[reading] },
    { key: "t1", at: at(0.3), kind: "line", text: fill(travel()) },
    tuned ? { key: "tuned", at: at(0.34), kind: "attuned", text: fill(pick(V.attuned[light], d.id), tuned), color: LIGHT_COLOR[light], light, who: tuned } : { key: "t2", at: at(0.34), kind: "line", text: fill(travel()) },
    ev ? { key: "star", at: at(0.49), kind: "star", text: pick(V.star[ev], d.id), color: STAR[ev].color } : { key: "t3", at: at(0.49), kind: "line", text: fill(travel()) },
    { key: "p2", at: at(0.53), kind: "line", text: fill(place()) },
    ...story(V.episode[6], 1, "e2", 0.57),
    { key: "s2", at: at(0.67), kind: "seeker", ...seekerLine(1) },
    states[1] ? { key: "state2", at: at(0.71), kind: "state", text: stateLine(states[1]) } : { key: "t4", at: at(0.71), kind: "line", text: fill(travel()) },
    { key: "midway", at: at(0.75), kind: "rovyn", text: pick(V.midway, d.id * 7 + 3) },
    { key: "near", at: at(0.8), kind: "line", text: fill(pick(V.near[dest.cluster], d.id)) },
    { key: "approach", at: at(0.86), kind: "line", text: fill(pick(V.approach, d.id)) },
    { key: "close", at: at(0.93), kind: "line", text: fill(pick(V.closing, d.id)) },
  ];
  if (d.card !== undefined) {
    // the event card, told: the scene, one crew member's line (its options are only words now), what followed
    const card = TEXTS.cards[d.card];
    const sk = seekers[(d.id + 2) % Math.max(1, seekers.length)];
    const said = card.options[d.id % card.options.length].text;
    list.push(
      { key: "story", at: storyAt(d), kind: "story", text: card.scene, color: STORY_TONE },
      { key: "voice", at: storyAt(d) + (d.revealAt - d.at) * 0.03, kind: "voice", text: sk ? tl("#{0}：「{1}」", { 0: sk.id, 1: said }) : tl("「{0}」", { 0: said }), color: sk ? LIGHT_COLOR[sk.trait] : STORY_TONE, who: sk },
      { key: "aftermath", at: storyAt(d) + (d.revealAt - d.at) * 0.06, kind: "line", text: fill(pick(V.aftermath, d.id), sk) },
    );
  }
  if (d.deep) {
    // the descent past the destination
    const down = deal(V.deep[dest.cluster], d.id);
    list.push({ key: "down1", at: at(DESCENT_AT), kind: "line", text: fill(down()) }, { key: "down2", at: at(0.69), kind: "line", text: fill(down()) });
  }
  if (d.result) {
    const tone = OUTCOME_TONE[d.result.outcome];
    const omen = omenOf(sim, d);
    omen.forEach((text, i) => list.push({ key: `omen${i}`, at: d.revealAt - (omen.length - i), kind: "omen", text, color: tone }));
    list.push({ key: "result", at: d.revealAt, kind: "result", text: d.log ?? "", color: tone });
  }
  return list.filter((e) => e.at <= now).sort((a, b) => a.at - b.at);
}

/** The picture behind a voyage: its destination, or for a deep dive that kept going, the layer below its cluster once
 *  the descent begins. */
function backdropOf(d: SimDive, now: number) {
  const descending = d.deep && now >= d.at + (d.revealAt - d.at) * DESCENT_AT;
  return descending ? deepImage(DESTINATIONS[d.dest].cluster) : destImage(d.dest);
}

/** The omen: what the voyage home looked like, written once the result exists; longer for a better result (a legend:
 *  three lines, rising). The voyage log shows it before the result, and the reveal while the signal comes in. */
export function omenOf(sim: Sim, d: SimDive): string[] {
  if (!d.result) return [];
  const o = d.result.outcome;
  const L: readonly string[] = TEXTS.voyage.omen[o];
  const lines = o === "legend" ? [L[d.id % 2], L[2 + (d.id % 2)], L[4]] : o === "good" || o === "great" ? [L[d.id % 4], L[4]] : [pick(L, d.id)];
  const team = teamNameOf(sim.state!, d.spire);
  return lines.map((text) => text.replaceAll(tl("{隊伍}"), team));
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

export function VoyageLog({ sim, id, arriving, onArrived, onClose, onSwitch }: { sim: Sim; id: number; arriving?: boolean; onArrived?: () => void; onClose: () => void; onSwitch: (id: number) => void }) {
  const s = sim.state!;
  const d = s.dives.find((x) => x.id === id);
  const list = d ? entriesOf(sim, d, sim.now) : [];
  const body = useRef<HTMLOListElement>(null);
  const count = list.length;
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
  const others = s.dives.filter((x) => !x.result || x.id === d.id).sort((a, b) => a.id - b.id);
  const light = sim.sky.lights[d.dest];
  return (
    <section className={`v3-voyage${gl ? " has-gl" : ""}${arriving && d.result && (d.result.outcome === "great" || d.result.outcome === "legend") ? " is-flash" : ""}`} aria-label={tl("航行：{0}", { 0: destName(d.dest) })}
      style={{ ["--photo" as string]: `url(${backdropOf(d, sim.now)})`, ["--hue" as string]: CLUSTER_HUE[dest.cluster], ["--lc" as string]: LIGHT_COLOR[light] }}>
      <button type="button" className="v3-dest__close v3-voyage__close" onClick={onClose} aria-label={tl("關閉航行畫面")}><X aria-hidden="true" /></button>
      <div className="v3-voyage__scene" ref={sceneRef}>
        <header className="v3-voyage__head">
          <span className="hud-kicker">{CIRCLED[dest.cluster]}{SLOT[dest.slot]} · {TEXTS.clusters[dest.cluster].name} · {d.result ? tl("已揭曉") : tl("航行中")}</span>
          <h2>{destName(d.dest)} <small>{teamNameOf(s, d.spire)}</small></h2>
          {others.length > 1 && (
            <div className="v3-voyage__tabs" role="tablist" aria-label={tl("航行中的隊伍")}>
              {others.map((x) => {
                const xk = Math.min(1, Math.max(0, (sim.now - x.at) / Math.max(1, x.revealAt - x.at)));
                const state = x.result ? tl("已揭曉") : `${clock(x.revealAt - sim.now)}`;
                const xd = DESTINATIONS[x.dest];
                return (
                  <button key={x.id} type="button" role="tab" aria-selected={x.id === d.id} onClick={() => onSwitch(x.id)}
                    className={`v3-vtab${x.id === d.id ? " is-on" : ""}${x.result ? " is-done" : ""}`}
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
        <div className="v3-voyage__progress" style={{ ["--k" as string]: k }}>
          <i />
          <span>{d.result ? tl("已揭曉") : tl("{0} 後揭曉", { 0: clock(d.revealAt - sim.now) })}</span>
          {!d.result && sim.hurry && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => sim.hurry?.(d.id, 60_000)} title={tl("預覽用：讓這趟航行往前 1 分鐘")}><FastForward aria-hidden="true" />{tl("快轉 1 分鐘")}</button>}
        </div>
        <Tags d={d} />
        <Crew sim={sim} d={d} />
        {d.result && arriving ? <p className="v3-voyage__signal"><i /><i /><i />{tl("光橋抵達{0}，訊號回傳中…", { 0: destName(d.dest) })}</p> : d.result ? <Outcome d={d} /> : <Odds d={d} />}
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
              {e.kind === "story" && d.card !== undefined ? (
                <div className="v3-decision is-note is-story">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="v3-decision__art" src={eventImage(d.card)} alt="" loading="lazy" />
                  <span className="v3-decision__kicker"><Sparkles aria-hidden="true" />{tl("航行插曲")}</span><b className="v3-decision__title">{TEXTS.cards[d.card].title}</b><p>{i === list.length - 1 ? <Typewriter text={e.text} /> : e.text}</p>
                </div>
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
          {!d.result && <li className="is-wait" aria-hidden="true"><time /><span className="v3-logicon is-line" /><p><i /><i /><i /></p></li>}
        </ol>
      </div>
    </section>
  );
}

/** The WebGL scene behind a voyage (desktop, effects not set to low): created per voyage, fed every render, and told
 *  when something happens on the way: a crew line, the star event, the story card, the arrival. Returns whether it runs;
 *  without it the CSS version of the scene stays as it was. */
function useVoyageGl(sim: Sim, d: SimDive | undefined, list: Entry[], arriving: boolean | undefined, sceneRef: RefObject<HTMLDivElement | null>, routeRef: RefObject<HTMLDivElement | null>) {
  const api = useRef<VoyageGl | null>(null);
  const [on, setOn] = useState(false);
  const id = d?.id;
  const cluster = d ? DESTINATIONS[d.dest].cluster : 0;
  const photo = d ? backdropOf(d, sim.now) : ""; // a change (the deep descent) rebuilds the scene once
  useEffect(() => {
    if (id === undefined || !sceneRef.current || !routeRef.current) return;
    if (window.matchMedia("(max-width: 1100px)").matches || fxQuality() === "low") return;
    let dead = false;
    let made: VoyageGl | null = null;
    const host = sceneRef.current, route = routeRef.current;
    import("./voyage-engine")
      .then((m) => m.createVoyage(host, route, photo, CLUSTER_HUE[cluster]))
      .then((g) => {
        if (dead) { g.destroy(); return; }
        made = g;
        api.current = g;
        setOn(true);
      })
      .catch(() => {});
    return () => { dead = true; made?.destroy(); api.current = null; setOn(false); };
  }, [id, cluster, photo, sceneRef, routeRef]);

  // what the scene needs this render
  const s = sim.state!;
  const team = d ? s.teams.find((x) => x.spire === d.spire) : undefined;
  const light = d ? sim.sky.lights[d.dest] : 0;
  const crew: VoyageView["crew"] = d ? [
    { color: "#f0c766", attuned: false },
    ...(team?.prism !== undefined ? [{ color: "#7fd3ff", attuned: false }] : []),
    ...(team?.seekers ?? []).map((x) => s.nfts.find((n) => n.id === x)).filter((n): n is SimNft => !!n).map((n) => ({ color: LIGHT_COLOR[n.trait], attuned: n.trait === light })),
  ] : [];
  const tone = !d ? "#c9ff55" : d.result ? OUTCOME_TONE[d.result.outcome] : "#c9ff55";
  useEffect(() => {
    if (!d) return;
    api.current?.update({ at: d.at, revealAt: d.revealAt, deciding: false, tone, crew, done: !!d.result });
  });

  // events: compared with what this voyage looked like on the previous render
  const seen = useRef<{ id?: number; k: number; seekers: number; arrived: boolean }>({ k: 0, seekers: 0, arrived: false });
  const k = d ? Math.min(1, Math.max(0, (sim.now - d.at) / Math.max(1, d.revealAt - d.at))) : 0;
  const seekerLines = list.filter((e) => e.kind === "seeker");
  useEffect(() => {
    if (!d) return;
    const prev = seen.current;
    const g = api.current;
    if (prev.id === d.id && g) {
      if (d.plan.event && prev.k < 0.42 && k >= 0.42 && !d.result) g.storm(STAR[d.plan.event].color);
      if (seekerLines.length > prev.seekers) g.pulse(seekerLines[seekerLines.length - 1].color ?? "#c9ff55");
      const u = d.card !== undefined ? (storyAt(d) - d.at) / Math.max(1, d.revealAt - d.at) : 2;
      if (prev.k < u && k >= u && !d.result) g.choose(STORY_TONE);
      if (arriving && d.result && !prev.arrived) g.arrive(d.result.outcome, OUTCOME_TONE[d.result.outcome]);
    }
    seen.current = { id: d.id, k, seekers: seekerLines.length, arrived: prev.id === d.id ? prev.arrived || !!(arriving && d.result && g) : !!(arriving && d.result) };
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
  if (d.card !== undefined) {
    const u = (storyAt(d) - d.at) / span;
    marks.push({ key: "story", u, kind: "decision", label: tl("插曲"), color: STORY_TONE, done: k >= u });
  }
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
  const tone = d.result ? OUTCOME_TONE[d.result.outcome] : "#c9ff55";
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
      {!d.result && <span className="v3-route2__ship" style={{ left: `${ship.x}%`, top: `${ship.y}%` }} aria-hidden="true"><i /></span>}
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
 *  carry a 同頻 badge; hovering any member shows what it brings to this trip. */
function Crew({ sim, d }: { sim: Sim; d: SimDive }) {
  const s = sim.state!;
  const team = s.teams.find((x) => x.spire === d.spire);
  const ids = [d.spire, ...(team?.prism !== undefined ? [team.prism] : []), ...(team?.seekers ?? [])];
  const cards = ids.map((x) => s.nfts.find((n) => n.id === x)).filter((n): n is SimNft => !!n);
  const here = skyOf(Math.floor(d.at / DAY)).lights[d.dest];
  // each attuned seeker's share of the team's attunement bonus (15% of its power, the team capped at +10%)
  const raw = cards.filter((n) => n.kind === 2 && n.trait === here).reduce((x, n) => x + 0.15 * n.power, 0);
  const scale = raw > 0 ? d.plan.bonus / raw : 0;
  return (
    <div className="v3-voyage__crew" aria-label={tl("出發隊伍")}>
      <small>{tl("隊伍戰力")} <b>{d.plan.power}</b>{d.plan.bonus ? <em>{tl("同頻加成 +{0}", { 0: Math.round(d.plan.bonus) })}</em> : null}</small>
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

/** After the reveal: the outcome, the multiplier and the reward rolling up (counted at once, v3.3). */
function Outcome({ d }: { d: SimDive }) {
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
      <em className="v3-voyage__done">{d.unsettled ? tl("已算進「可領取」· 下次交易時一起寫入鏈上") : tl("已算進「可領取」")}</em>
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

/** What this voyage carries: a deep dive, a supply, the crew bond at departure. */
function Tags({ d }: { d: SimDive }) {
  const tags: [string, string | null][] = [];
  if (d.deep) tags.push([tl("深潛 · 光塵 ×2"), null]);
  if (d.supply === 1) tags.push([tl("燈油 · 只耗損 1 次"), "/lightdive/items/lamp-oil.webp"]);
  if (d.supply === 2) tags.push([tl("星圖殘頁 · 空手 −3%"), "/lightdive/items/star-chart-fragment.webp"]);
  if (d.bond) tags.push([tl("默契 {0} · 空手 −{0}%", { 0: d.bond }), null]);
  if (d.echo) tags.push([tl("光橋殘光 · 空手 −{0}%", { 0: d.echo }), null]);
  if (d.first) tags.push([tl("今日首航"), null]);
  if (!tags.length) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <p className="v3-voyage__tags">{tags.map(([t, icon]) => <span key={t}>{icon && <img src={icon} alt="" />}{t}</span>)}</p>;
}

/** The small mark beside a log line: Rovyn's face, the seeker who spoke, the star event, the story card, the result. */
function LogIcon({ e, d }: { e: Entry; d: SimDive }) {
  if (e.kind === "rovyn") {
    // eslint-disable-next-line @next/next/no-img-element
    return <span className="v3-logicon is-rovyn"><img src="/lightdive/keeper-face.webp" alt="" /></span>;
  }
  if ((e.kind === "seeker" || e.kind === "voice") && e.who) {
    return <span className="v3-logicon is-seeker" title={tl("探索者 #{0}", { 0: e.who.id })}><NftArt a={{ kind: 2, rarity: e.who.rarity, trait: e.who.trait, variant: 0 }} /></span>;
  }
  // eslint-disable-next-line @next/next/no-img-element
  if (e.kind === "star") return d.plan.event ? <span className="v3-logicon is-sky" aria-hidden="true"><img src={skyIcon(d.plan.event)} alt="" /></span> : <span className="v3-logicon is-star" aria-hidden="true" />;
  if (e.kind === "story" || e.kind === "voice") return <span className="v3-logicon is-decision" aria-hidden="true" />;
  if (e.kind === "result" && d.result) return <span className="v3-logicon is-result" style={{ ["--tc" as string]: OUTCOME_TONE[d.result.outcome] }} aria-hidden="true" />;
  if (e.kind === "attuned" && e.light !== undefined) return <span className="v3-logicon is-attuned" aria-hidden="true"><LightIcon light={e.light} /></span>;
  if (e.kind === "omen" || e.kind === "reading" || e.kind === "state") return <span className={`v3-logicon is-${e.kind}`} aria-hidden="true" />;
  return <span className={`v3-logicon is-${e.kind === "episode" ? "after" : "line"}`} aria-hidden="true" />;
}
