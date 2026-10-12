"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Coins, ExternalLink, Rocket, ScrollText, Sparkles, X } from "lucide-react";
import { ABI, coordinate, readRecentActivity, type Activity, type Contracts, type Team } from "@/lib/lightdive";
import { ATTRIBUTE, ATTRIBUTE_COLOR, BEAM, DEPTH, KIND_NAME, LOG_LINE, OUTCOME, RARITY } from "@/lib/lightdive-copy";
import { A, G, L, NAV } from "@/lib/lightdive-game-copy";
import { GameIcon } from "./icon";
import { claimAll, feePct, settleAll, type Derived, type Game, type KeeperState, type View } from "./game";
import type { SceneBridge, SceneNode, SceneSpire } from "./scene";
import { PixiScene } from "./pixi-scene";
import { sfx } from "./sound";
import { countdown } from "./use-game";
import { NftCard, fill, nftName, rvyn, useT } from "./ui";

type Status = SceneSpire["status"];

export function Base({ g, d, c, keeper, go }: { g: Game; d: Derived; c: Contracts; keeper: KeeperState; go: (v: View) => void }) {
  const { t } = useT();
  const o = g.data.overview!;
  const [selected, setSelected] = useState<bigint | null>(null);
  const [depth, setDepth] = useState<number | null>(null);
  const [fresh, setFresh] = useState<bigint | null>(null);

  const status = (team: Team | null): Status => {
    if (!team || team.seekers.length === 0) return "unmanned";
    if (team.lastDiveDay === d.today) {
      const todays = g.data.dives.find((dv) => dv.spire === team.spire.id && dv.day === d.today);
      return todays && !todays.settled && !g.data.outcomes.has(todays.id) ? "bridge" : "rested";
    }
    return "ready";
  };
  const teams = g.data.teams;
  const sceneSpires: SceneSpire[] = useMemo(() => {
    const standing = teams.map((tm) => {
      const st = status(tm);
      const label = { ready: A.ready, bridge: A.onBridge, rested: A.resting, unmanned: A.unmanned }[st];
      return { id: tm.spire.id, rarity: tm.spire.attributes.rarity, level: tm.spire.attributes.trait, variant: tm.spire.attributes.variant, status: st, title: `${nftName(t, tm.spire)} #${tm.spire.id}`, sub: `✦ ${tm.luminance} · ${t(label)}`, crew: tm.seekers.map((sk) => ATTRIBUTE_COLOR[sk.attributes.trait]) };
    });
    const docked = d.spires.map((s) => ({ id: s.id, rarity: s.attributes.rarity, level: s.attributes.trait, variant: s.attributes.variant, status: "unmanned" as Status, title: `${nftName(t, s)} #${s.id}`, sub: t(A.docked) }));
    return [...standing, ...docked];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, d.spires, d.today, g.data.dives, g.data.outcomes, t]);

  const team = teams.find((tm) => tm.spire.id === selected) ?? null;
  const teamStatus = team ? status(team) : null;
  const lum = team ? Number(team.luminance) : 0;

  const nodes: SceneNode[] = DEPTH.map((roman, i) => {
    const coord = coordinate(d.today, i);
    let state: SceneNode["state"] = "idle";
    if (team && teamStatus === "ready") state = depth === i ? "selected" : lum >= o.depthMinLuminance[i] ? "reachable" : "locked";
    return { depth: i, roman, light: t(ATTRIBUTE[coord.attribute]), color: ATTRIBUTE_COLOR[coord.attribute], sub: `✦${o.depthMinLuminance[i]} · ×${(o.depthCoefBp[i] / 10_000).toFixed(2)}`, state };
  });

  const bridges: SceneBridge[] = g.data.dives
    .filter((dv) => dv.day === d.today)
    .map((dv) => {
      const outcome = dv.result ?? g.data.outcomes.get(dv.id) ?? null;
      return {
        spire: dv.spire,
        depth: dv.depth,
        color: ATTRIBUTE_COLOR[coordinate(dv.day, dv.depth).attribute],
        tier: outcome ? outcome.tier : null,
        label: outcome ? `${t(OUTCOME[outcome.tier])} ×${(outcome.multX100 / 100).toFixed(2)}` : undefined,
        fresh: fresh === dv.spire,
      };
    });

  if (team && depth !== null && teamStatus === "ready") {
    bridges.push({ spire: team.spire.id, depth, color: ATTRIBUTE_COLOR[coordinate(d.today, depth).attribute], tier: null, aim: true });
  }

  const onSpire = (id: bigint) => {
    sfx.click();
    const tm = teams.find((x) => x.spire.id === id);
    if (!tm || tm.seekers.length === 0) {
      go("plain");
      return;
    }
    setSelected(selected === id ? null : id);
    setDepth(null);
    if (status(tm) === "ready") {
      // Preselect the deepest reachable coordinate: deeper is always better for Lightdust.
      const deepest = o.depthMinLuminance.reduce((acc, min, i) => (Number(tm.luminance) >= min ? i : acc), 0);
      setDepth(deepest);
    }
  };
  const onNode = (i: number) => {
    sfx.select();
    setDepth(i);
  };

  const dive = async (tm: Team, at: number) => {
    const coord = coordinate(d.today, at);
    const ok = await g.run([{ label: G.stepDive, address: c.expedition, abi: ABI.Expedition, functionName: "dive", args: [tm.spire.id, at, coord.id] }]);
    if (ok) {
      sfx.launch();
      setFresh(tm.spire.id);
      setSelected(null);
      setDepth(null);
      window.setTimeout(() => setFresh(null), 4000);
    } else sfx.fail();
  };
  const launchAll = async () => {
    const steps = d.teamsReady.map((tm) => {
      const deepest = o.depthMinLuminance.reduce((acc, min, i) => (Number(tm.luminance) >= min ? i : acc), 0);
      return { label: { ...G.stepDive, en: `${G.stepDive.en} · #${tm.spire.id}`, "zh-Hant": `${G.stepDive["zh-Hant"]} · #${tm.spire.id}`, "zh-Hans": `${G.stepDive["zh-Hans"]} · #${tm.spire.id}`, ko: `${G.stepDive.ko} · #${tm.spire.id}` }, address: c.expedition, abi: ABI.Expedition, functionName: "dive", args: [tm.spire.id, deepest, coordinate(d.today, deepest).id] };
    });
    if (await g.run(steps)) sfx.launch();
    else sfx.fail();
  };
  const settleIds = d.settleable.map((x) => x.id).slice(0, 40);

  const answers = useAnswers(g);

  const prompt = !team ? (sceneSpires.length === 0 ? t(A.noSpireStands) : d.teamsReady.length && d.canAct ? t(A.pickSpire) : null) : teamStatus === "ready" ? t(A.pickNode) : null;

  return (
    <div className="ldg-base hud-dive">
      <div className="hud-dive__play">
      <div className="ldg-stage-scene">
        <PixiScene
          spires={sceneSpires}
          nodes={nodes}
          bridges={bridges}
          selected={selected}
          onSpire={onSpire}
          onNode={onNode}
          plainLabel={t(A.plain)}
          emptyLabel={t(A.noSpireStands)}
        />
        <div className="ldg-scene-top">
          <span className="ldg-scene-date">{new Date(d.today * 86_400_000).toISOString().slice(0, 10)} · {t(A.plain)}</span>
          {prompt && <span className="ldg-scene-prompt">{prompt}</span>}
        </div>

        {team && depth !== null && teamStatus === "ready" && (
          <LaunchDrawer g={g} d={d} team={team} depth={depth} onClose={() => { setSelected(null); setDepth(null); }} onLaunch={() => void dive(team, depth)} />
        )}
        {team && teamStatus !== "ready" && (
          <aside className="ldg-drawer ldg-drawer--info">
            <button type="button" className="ldg-icon ldg-drawer__close" onClick={() => setSelected(null)} aria-label={t(A.cancel)}><X aria-hidden="true" /></button>
            <h3>{nftName(t, team.spire)} #{String(team.spire.id)}</h3>
            <p className="ldg-dim">{teamStatus === "bridge" ? t(G.kOut) : fill(t(G.doveToday), { t: countdown(d.resetIn) })}</p>
            <button type="button" className="rv-btn rv-btn--secondary rv-btn--sm" onClick={() => go("treasury")}><ScrollText aria-hidden="true" />{t(NAV.treasury)}</button>
          </aside>
        )}

      </div>

      {answers.list.length > 0 && <Answers list={answers.list} onDone={answers.dismiss} />}
      <div className="ldg-console">
        <Dialogue keeper={keeper} go={go} />

        <div className="ldg-dock">
          {d.teamsReady.length > 1 && d.canAct && (
            <button type="button" className="ldg-dock__btn is-primary" onClick={() => void launchAll()} disabled={!!g.tx?.running} title={t(A.launchAllNote)}>
              <Rocket aria-hidden="true" /><span>{t(A.launchAll)}</span><i>{d.teamsReady.length}</i>
            </button>
          )}
          {d.drawsReady.length > 0 && (
            <button type="button" className="ldg-dock__btn" onClick={() => go("summon")}><Sparkles aria-hidden="true" /><span>{t(A.openDraws)}</span><i>{d.drawsReady.length}</i></button>
          )}
          {settleIds.length > 0 && (
            <button type="button" className="ldg-dock__btn" disabled={!!g.tx?.running} onClick={() => void settleAll(g, d)}>
              <ScrollText aria-hidden="true" /><span>{t(A.settle)}</span><i>{settleIds.length}</i>
            </button>
          )}
          {d.credit > 0n && (
            <button type="button" className="ldg-dock__btn is-gold" disabled={!!g.tx?.running} onClick={() => void claimAll(g)} title={t(G.feeStays)}><Coins aria-hidden="true" /><span>{t(A.claim)} {rvyn(d.credit, 2)}</span><small>−{feePct(g)}%</small></button>
          )}
        </div>
      </div>
      </div>
      <LiveLog g={g} c={c} today={d.today} />
    </div>
  );
}

function LaunchDrawer({ g, d, team, depth, onClose, onLaunch }: { g: Game; d: Derived; team: Team; depth: number; onClose: () => void; onLaunch: () => void }) {
  const { t } = useT();
  const o = g.data.overview!;
  const coord = coordinate(d.today, depth);
  const lum = Number(team.luminance);
  const beam = team.prism ? team.prism.attributes.trait : 1;
  const tiers = g.data.tiers?.[beam] ?? [];
  const attuned = team.seekers.filter((s) => s.attributes.trait === coord.attribute);
  const base = (lum * o.depthCoefBp[depth]) / 10_000;
  const leaving = [team.spire, ...(team.prism ? [team.prism] : []), ...team.seekers].filter((n) => n.attributes.voyagesLeft === 1);
  const s = team.spire.attributes;
  return (
    <aside className="ldg-drawer" style={{ ["--lc" as string]: ATTRIBUTE_COLOR[coord.attribute] }} aria-label={t(A.launch)}>
      <button type="button" className="ldg-icon ldg-drawer__close" onClick={onClose} aria-label={t(A.cancel)}><X aria-hidden="true" /></button>
      <span className="rv-eyebrow">{t(G.coordinate)} {coord.label}</span>
      <h3><i className="ldg-dot" style={{ background: ATTRIBUTE_COLOR[coord.attribute] }} />{DEPTH[depth]} · {t(ATTRIBUTE[coord.attribute])}</h3>
      <p className="ldg-dim ldg-small">{nftName(t, team.spire)} #{String(team.spire.id)} · {t(RARITY[s.rarity])} Lv.{s.trait} · ✦ {lum}</p>
      <div className="ldg-drawer__crew">
        {team.prism && <NftCard n={team.prism} compact />}
        {team.seekers.map((sk) => <NftCard key={String(sk.id)} n={sk} compact badge={sk.attributes.trait === coord.attribute ? t(G.attuned) : undefined} />)}
      </div>
      <dl className="ldg-kv">
        <div><dt>{t(G.beam)}</dt><dd>{t(BEAM[beam])}</dd></div>
        <div><dt>{t(G.baseDust)}</dt><dd>{base.toLocaleString(undefined, { maximumFractionDigits: 1 })}</dd></div>
      </dl>
      {attuned.length > 0 && <p className="ldg-attuned">{fill(t(G.attunedLine), { names: attuned.map((a) => `#${a.id}`).join("、") })}</p>}
      <ul className="ldg-tiers" aria-label={t(G.outcomes)}>
        {tiers.map((tier, i) => (
          <li key={i} className={`t${i}`} style={{ flexGrow: Math.max(tier.probBp, 400) }}>
            <b>{t(OUTCOME[i])}</b>
            <small>{(tier.probBp / 100).toFixed(1)}% · {tier.hi === 0 ? "×0" : `×${(tier.lo / 100).toFixed(2)}–${(tier.hi / 100).toFixed(2)}`}</small>
          </li>
        ))}
      </ul>
      {leaving.length > 0 && <p className="ldg-warn">{t(G.lastVoyage)}: {leaving.map((n) => `${nftName(t, n)} #${n.id}`).join("、")}</p>}
      <button type="button" className="rv-btn rv-btn--primary rv-btn--lg rv-btn--block ldg-launch" disabled={!d.canAct || !!g.tx?.running} onClick={onLaunch}>
        <Rocket aria-hidden="true" />{d.canAct ? t(A.launch) : t(G.signalOff)}
      </button>
    </aside>
  );
}

/** The Signal-Keeper's dialogue box, typed out like a transmission. */
function Dialogue({ keeper, go }: { keeper: KeeperState; go: (v: View) => void }) {
  const { t } = useT();
  const [typed, setTyped] = useState(keeper.line);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      queueMicrotask(() => setTyped(keeper.line));
      return;
    }
    let i = 0;
    queueMicrotask(() => setTyped(""));
    const timer = window.setInterval(() => {
      i += 1;
      setTyped(keeper.line.slice(0, i));
      if (i >= keeper.line.length) window.clearInterval(timer);
    }, 28);
    return () => window.clearInterval(timer);
  }, [keeper.line]);
  const cta = keeper.cta;
  return (
    <div className={`ldg-dialogue is-${keeper.mood}`}>
      <div className="ldg-dialogue__face" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/lightdive/keeper-face.webp" alt="" width={256} height={256} />
        <span />
      </div>
      <div className="ldg-dialogue__body">
        <b>{t(G.keeperName)} <small>{t(G.keeperRole)}</small></b>
        <p aria-live="polite">{typed}<span className="ldg-caret" aria-hidden="true" /></p>
        {cta && (cta.href ? (
          <a className="rv-btn rv-btn--primary rv-btn--sm" href={cta.href} target="_blank" rel="noreferrer">{cta.label}<ExternalLink aria-hidden="true" /></a>
        ) : (
          <button type="button" className="rv-btn rv-btn--primary rv-btn--sm" onClick={() => { sfx.click(); if (cta.view) go(cta.view); else cta.act?.(); }}>{cta.label}<ArrowRight aria-hidden="true" /></button>
        ))}
      </div>
    </div>
  );
}

type Answer = { id: bigint; spire: bigint; depth: number; day: number; tier: number; mult: number; lightdust: bigint; reward: bigint | null };
const SEEN_KEY = "lightdive:seen-answers";

/** Dive results not shown yet on this browser: the moment the light answers. */
function useAnswers(g: Game) {
  const [seen, setSeen] = useState<Set<string> | null>(null);
  const all: Answer[] = g.data.dives
    .map((dv) => {
      const o = dv.result ?? g.data.outcomes.get(dv.id) ?? null;
      if (!o) return null;
      const lightdust = dv.result ? dv.result.lightdust : (dv.points * BigInt(o.multX100)) / 100n;
      return { id: dv.id, spire: dv.spire, depth: dv.depth, day: dv.day, tier: o.tier, mult: o.multX100, lightdust, reward: dv.result ? dv.result.reward : null };
    })
    .filter((x): x is Answer => x !== null);
  const loaded = !!g.data.player;
  const key = all.map((a) => String(a.id)).join(",");
  useEffect(() => {
    if (!loaded || seen !== null) return;
    let ids: string[];
    try {
      const raw = window.localStorage.getItem(SEEN_KEY);
      // First visit on this browser: earlier results count as seen, so only new answers celebrate.
      ids = raw ? (JSON.parse(raw) as string[]) : key ? key.split(",") : [];
      if (!raw) window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
    } catch {
      ids = key ? key.split(",") : [];
    }
    queueMicrotask(() => setSeen(new Set(ids)));
  }, [loaded, seen, key]);
  const list = seen ? all.filter((a) => !seen.has(String(a.id))).slice(0, 4) : [];
  const dismiss = () => {
    const next = new Set(seen ?? []);
    for (const a of list) next.add(String(a.id));
    try {
      window.localStorage.setItem(SEEN_KEY, JSON.stringify([...next].slice(-300)));
    } catch {
      // storage unavailable: the answers stay dismissed for this visit
    }
    setSeen(next);
  };
  return { list, dismiss };
}

function Answers({ list, onDone }: { list: Answer[]; onDone: () => void }) {
  const { t, locale } = useT();
  const best = list.reduce((m, a) => Math.max(m, a.tier), 0);
  useEffect(() => {
    sfx.reveal(best);
  }, [best]);
  const cjk = locale === "zh-Hant" || locale === "zh-Hans";
  return (
    <div className="ldg-answers" role="dialog" aria-modal="true" aria-labelledby="ldg-answers-title" style={{ ["--tc" as string]: TIER_COLORS[best] }}>
      <span className="ldg-reveal__burst" aria-hidden="true" />
      <div className="ldg-answers__card">
        <h2 id="ldg-answers-title" className="rv-h2">{t(ANSWER_TITLE)}</h2>
        <ul>
          {list.map((a, i) => {
            const coord = coordinate(a.day, a.depth);
            const line = t(LOG_LINE[a.tier]).replaceAll("{coord}", cjk ? ` ${coord.label} ` : coord.label).replaceAll("{name}", `${t(KIND_NAME[0])} #${a.spire}`);
            return (
              <li key={String(a.id)} style={{ ["--tc" as string]: TIER_COLORS[a.tier], ["--i" as string]: i }}>
                <b>{t(OUTCOME[a.tier])}</b>
                <strong>×{(a.mult / 100).toFixed(2)}</strong>
                <p>{line}</p>
                <small className="ldg-mono">{t(G.lightdust)} {(Number(a.lightdust) / 10_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}{a.reward !== null ? ` · +${rvyn(a.reward, 4)} RVYN` : ` · ${t(G.stWaitDay)}`}</small>
              </li>
            );
          })}
        </ul>
        <button type="button" className="rv-btn rv-btn--primary rv-btn--block" onClick={() => { sfx.click(); onDone(); }}>{t(ANSWER_OK)}</button>
      </div>
    </div>
  );
}

const TIER_COLORS = ["#ff8a7a", "#c9ff55", "#3de7e0", "#e8c46a", "#fff4d6"];
const ANSWER_TITLE = { en: "The light answers", "zh-Hant": "光的回應", "zh-Hans": "光的回应", ko: "빛의 응답" };
const ANSWER_OK = { en: "Receive", "zh-Hant": "收下", "zh-Hans": "收下", ko: "받기" };

/** Every bridge raised on the plain, by everyone, refreshed every 30 seconds. */
function LiveLog({ g, c, today }: { g: Game; c: Contracts; today: number }) {
  const { t } = useT();
  const [items, setItems] = useState<Activity[] | null>(null);
  const me = g.account?.toLowerCase();
  // Reload right away when this player's own dives change, not only on the timer.
  const pulse = `${g.data.dives.length}:${g.data.outcomes.size}:${g.data.dives.filter((x) => x.settled).length}`;
  useEffect(() => {
    let alive = true;
    const load = () =>
      readRecentActivity(g.client, c)
        .then((list) => alive && setItems(list))
        .catch(() => alive && setItems((cur) => cur ?? []));
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [g.client, c, pulse]);
  const todays = (items ?? []).filter((x) => x.day === today);
  const observers = new Set(todays.map((x) => x.owner.toLowerCase())).size;
  const slotNow = Math.floor(g.now / 60); // one-minute randomness slots
  return (
    <aside className="hud-live" aria-label={t(L.live)}>
      <header>
        <span className="hud-kicker"><GameIcon name="signal" />{t(L.live)}</span>
        <p>{t(L.liveLead)}</p>
        <div className="hud-live__stats">
          <span><small>{t(L.liveToday)}</small><b>{todays.length}</b></span>
          <span><small>{t(L.liveDivers)}</small><b>{observers}</b></span>
        </div>
      </header>
      {items === null ? (
        <p className="hud-dim hud-live__empty">{t(G.loading)}</p>
      ) : todays.length === 0 && items.length === 0 ? (
        <p className="hud-dim hud-live__empty">{t(L.liveEmpty)}</p>
      ) : (
        <ol className="hud-live__list">
          {items.map((x) => {
            const coord = coordinate(x.day, x.depth);
            const mine = x.owner.toLowerCase() === me;
            const ago = Number(BigInt(slotNow) - x.slot);
            const when = x.day !== today ? new Date(x.day * 86_400_000).toISOString().slice(5, 10) : ago <= 0 ? t(L.liveNow) : fill(t(L.liveAgo), { m: ago });
            const tier = x.result?.tier;
            return (
              <li key={String(x.id)} className={`${mine ? "is-mine" : ""}${tier !== undefined ? ` t${tier}` : " is-flight"}`} style={{ ["--lc" as string]: ATTRIBUTE_COLOR[coord.attribute] }}>
                <i className="hud-live__mark" />
                <div>
                  <p><b>{mine ? t(L.liveYou) : `${x.owner.slice(0, 6)}…${x.owner.slice(-4)}`}</b> · {t(KIND_NAME[0])} #{String(x.spire)}</p>
                  <p className="hud-live__what">{fill(t(L.liveDived), { coord: coord.label })} <span style={{ color: ATTRIBUTE_COLOR[coord.attribute] }}>{t(ATTRIBUTE[coord.attribute])}</span></p>
                  {tier !== undefined ? (
                    <p className="hud-live__result">{t(OUTCOME[tier])} ×{(x.result!.multX100 / 100).toFixed(2)}</p>
                  ) : (
                    <p className="hud-live__result is-flight">{t(G.onBridge)}</p>
                  )}
                </div>
                <small>{when}</small>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
