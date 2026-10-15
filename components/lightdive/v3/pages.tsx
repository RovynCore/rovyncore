"use client";

// Every page of the v3 preview except the dive page. One page answers one question.
import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  DESTINATIONS, DIVES_PER_DAY, DIVES_PER_TEAM_PER_DAY, DOCK_DAYS, MAX_TEAMS, basePoints, claimFee, clusterRange, planDive, teamPower,
} from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { CLUSTER_IMAGES, GALAXY_IMAGE, ICON_CREDIT, MUSIC, SFX_CREDIT } from "@/lib/lightdive-v3/credits";
import { GameIcon } from "../game/icon";
import { PageHead, Panel } from "../game/hud";
import { dayOf, deciding, divesOn, owned, teamInput, teamName, teamOut, type Sim, type SimNft, type SimState } from "./sim";
import type { IconName } from "../game/icons";
import {
  CIRCLED, CLUSTER_HUE, KIND, LIGHT, LIGHT_COLOR, OUTCOME, OUTCOME_TONE, SLOT, STAR, ago, clock, fmt,
} from "./copy";
import { gap, tl } from "@/lib/lightdive-v3/i18n";

export type View = "lobby" | "dive" | "plain" | "spires" | "seekers" | "prisms" | "summon" | "market" | "buy" | "faucet" | "treasury" | "guide" | "story" | "credits" | "whitepaper" | "settings";
const DAY = 86_400_000;

const alive = (n: SimNft) => !n.homeAt;

// ---------------------------------------------------------------- Rovyn

/** Picks Rovyn's line pool from the player's state, in the playbook's priority order. */
export function rovynPool(sim: Sim): readonly string[] {
  const s = sim.state!;
  const r = TEXTS.rovyn;
  if (s.nfts.some((n) => n.dockedAt !== undefined && !n.homeAt)) return r.docked;
  if (s.dives.some((d) => d.pending)) return r.collect;
  if (s.dives.some((d) => deciding(d, sim.now))) return r.eventPending;
  const used = divesOn(s, sim.today).length;
  if (used < DIVES_PER_DAY) {
    // lines that name a destination need a team that can reach one
    const reach = s.teams.some((t) => t.seekers.length && teamPower(teamInput(s, t)) >= DESTINATIONS[0].threshold);
    const lines = reach ? r.recommend : r.recommend.filter((l) => !l.includes("{目的地}"));
    return lines.length ? lines : r.idle;
  }
  // with the fee already at 0, the lines that quote a fee or a wait make no sense
  if (s.credit > 0.5) return claimFee((sim.now - s.lastClaimAt) / DAY) > 0 ? r.claim : r.claim.filter((l) => !l.includes("{天}") && !l.includes("{費}"));
  return r.idle;
}

/** Types a line out letter by letter, the way a signal comes in. */
function Typed({ text }: { text: string }) {
  const [shown, setShown] = useState({ text, n: 0 });
  useEffect(() => {
    let n = 0;
    const t = window.setInterval(() => {
      n += 1;
      setShown({ text, n });
      if (n >= text.length) window.clearInterval(t);
    }, 28);
    return () => window.clearInterval(t);
  }, [text]);
  const n = shown.text === text ? shown.n : 0;
  return <span className="v3-typed"><span aria-hidden="true">{text.slice(0, n)}</span><i aria-hidden="true">{n < text.length ? "▍" : ""}</i><span className="sr-only">{text}</span></span>;
}

export function Rovyn({ sim, line, onNext }: { sim: Sim; line: string; onNext: () => void }) {
  const s = sim.state!;
  const best = useMemo(() => {
    const teams = s.teams.filter((t) => t.seekers.length).map((t) => ({ t, p: teamPower(teamInput(s, t)) }));
    return teams.sort((a, b) => b.p - a.p)[0];
  }, [s]);
  const values = useMemo(() => {
    const reach = DESTINATIONS.filter((d) => (best?.p ?? 0) >= d.threshold);
    const tide = reach.find((d) => sim.sky.events.get(d.id) === "tide") ?? reach.at(-1);
    const next = DESTINATIONS.find((d) => d.threshold > (best?.p ?? 0));
    const docked = s.nfts.find((n) => n.dockedAt !== undefined && !n.homeAt);
    const fee = claimFee((sim.now - s.lastClaimAt) / DAY);
    const name = (id?: number) => (id === undefined ? "" : TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name);
    return {
      剩: Math.max(0, DIVES_PER_DAY - divesOn(s, sim.today).length),
      目的地: name(tide?.id),
      差: next ? next.threshold - (best?.p ?? 0) : 0,
      名字: docked ? `${KIND[docked.kind]} #${docked.id}` : tl("探索者"),
      // docked: days left to renew; otherwise (the claim lines): days until withdrawing is free
      天: docked ? Math.max(0, 7 - Math.floor((sim.now - (docked.dockedAt ?? 0)) / DAY)) : Math.round(fee * 100),
      數量: fmt(s.dives.some((d) => d.pending) ? s.dives.reduce((a, d) => a + (d.pending ? d.reward ?? 0 : 0), 0) : s.credit),
      費: Math.round(fee * 100),
      費2: 0,
    };
  }, [s, sim.now, sim.today, sim.sky, best]);
  const text = line.replace(/\{([^}]+)\}/g, (m, k) => (k in values ? String(values[k as keyof typeof values]) : m));
  return (
    <button type="button" className="v3-rovyn" onClick={onNext} aria-label={tl("點一下換一句")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lightdive/keeper-portrait.webp" alt="" />
      <span className="v3-rovyn__speech">
        <b>{tl("訊號守望者・Rovyn")}</b>
        <Typed text={text} />
        <small>{tl("點一下換一句")}</small>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- 觀測站

export function Lobby({ sim, go, rovyn }: { sim: Sim; go: (v: View) => void; rovyn: React.ReactNode }) {
  const s = sim.state!;
  const date = new Date(sim.today * DAY).toISOString().slice(0, 10);
  const best = Math.max(0, ...s.teams.filter((t) => t.seekers.length).map((t) => teamPower(teamInput(s, t))));
  const items = todoItems(sim, go);
  return (
    <div className="hud-page v3-lobby">
      <section className="hud-panel hud-hero v3-hero" style={{ ["--photo" as string]: `url(${GALAXY_IMAGE.src})` }}>
        <div className="hud-hero__copy">
          <TodayRoute sim={sim} go={go} date={date} />
        </div>
        <div className="hud-keeper">{rovyn}</div>
      </section>

      <Today items={items} title={tl("今日待辦")} />

      <Yesterday sim={sim} />
      <div className="hud-lobby__grid v3-lobbycols">
        <div className="v3-lobbycol">
          <Announcements />
          <Panel title={tl("近期航行")} index="01" icon="voyage" action={<button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => go("treasury")}>{tl("全部紀錄")}</button>}>
            <RecentVoyages sim={sim} go={go} />
          </Panel>
          <Panel title={tl("我的隊伍")} index="02" icon="fleets" action={<button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => go("plain")}>{tl("到碑原")}</button>}>
            <TeamsAtGlance sim={sim} go={go} />
          </Panel>
        </div>
        <div className="v3-lobbycol">
        <Panel title={tl("今日星象")} index="03" icon="crystal">
          <p className="v3-skylegend"><span><i className="is-light" />{tl("點的顏色：這個目的地今天的光")}</span><span><i className="is-event" />{tl("外圈：今天有星象")}</span></p>
          <div className="v3-sky">
            {TEXTS.clusters.map((c, ci) => (
              <div key={ci} className="v3-sky__row" style={{ ["--hue" as string]: CLUSTER_HUE[ci] }}>
                <b>{CIRCLED[ci]} {c.name}</b>
                <span>
                  {[0, 1, 2, 3].map((i) => {
                    const id = ci * 4 + i;
                    const ev = sim.sky.events.get(id);
                    return <button type="button" key={id} title={tl("{0}：{1}{2}", { 0: c.destinations[i].name, 1: LIGHT[sim.sky.lights[id]], 2: ev ? `・${STAR[ev].name}` : "" })} aria-label={tl("前往 {0}", { 0: c.destinations[i].name })} className={ev ? "has-event" : ""} style={{ ["--lc" as string]: LIGHT_COLOR[sim.sky.lights[id]], ["--ec" as string]: ev ? STAR[ev].color : "transparent" }} onClick={() => { try { sessionStorage.setItem("lightdive:v3:focus", String(id)); } catch {} go("dive"); }} />;
                  })}
                </span>
              </div>
            ))}
          </div>
          <p className="hud-dim v3-skynote">{tl("點一下就會帶你到那個目的地。每天換日時，光和星象都會重新分配。")}</p>
        </Panel>
        <Panel title={tl("星團預報")} index="04" icon="crystal">
          <Forecast sim={sim} best={best} go={go} />
        </Panel>
        </div>
      </div>
    </div>
  );
}

type Todo = { key: string; icon: IconName; tone: "gold" | "lime" | "blue" | "warn" | "plain"; title: string; sub: string; action: string; run: () => void };

/** Today's to-do, most urgent first: open decisions, results waiting, tickets left, summons in progress, rewards to
 *  claim, docked cards, idle spires, and (for a wallet with nothing to send) building a team or summoning. Each one
 *  takes you straight to the place where it is done. */
function todoItems(sim: Sim, go: (v: View) => void): Todo[] {
  const s = sim.state!;
  const watch = (id: number) => { try { sessionStorage.setItem("lightdive:v3:watch", String(id)); } catch {} go("dive"); };
  const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;
  const items: Todo[] = [];
  const deciding_ = s.dives.filter((d) => deciding(d, sim.now));
  if (deciding_.length) {
    const d = deciding_[0];
    items.push({ key: "decide", icon: "signal", tone: "gold", title: tl("{0} 趟航行等你抉擇", { 0: deciding_.length }), sub: tl("{0} 在{1}遇到岔路，揭曉前 1 分鐘截止。", { 0: teamName(s, d.spire), 1: destName(d.dest) }), action: tl("去抉擇"), run: () => watch(d.id) });
  }
  const waiting = s.dives.filter((d) => d.pending);
  if (waiting.length) {
    const total = waiting.reduce((a, d) => a + (d.reward ?? 0), 0);
    items.push({ key: "collect", icon: "claim", tone: "gold", title: tl("{0} 趟結果待收取", { 0: waiting.length }), sub: tl("一共 {0} $RVYN，收下後才會進到「可領取」。", { 0: fmt(total) }), action: tl("去收取"), run: () => watch(waiting[0].id) });
  }
  const left = Math.max(0, DIVES_PER_DAY - divesOn(s, sim.today).length);
  const ready = s.teams.filter((x) => x.seekers.length && !teamOut(s, x.spire));
  if (left > 0 && ready.length) {
    items.push({ key: "dive", icon: "launch", tone: "lime", title: tl("還有 {0} 張出發令", { 0: left }), sub: tl("{0} 支隊伍待命中；換日後出發令不會累積。", { 0: ready.length }), action: tl("去潛光"), run: () => go("dive") });
  }
  if (s.mints.length) {
    items.push({ key: "mint", icon: "summon", tone: "blue", title: tl("召喚陣啟動中"), sub: tl("{0} 張卡正在等訊號，揭曉後到召喚頁翻牌。", { 0: s.mints.reduce((a, m) => a + m.qty, 0) }), action: tl("去召喚"), run: () => go("summon") });
  }
  if (s.credit > 0.004) {
    const fee = claimFee((sim.now - s.lastClaimAt) / DAY);
    items.push({ key: "claim", icon: "treasury", tone: "plain", title: tl("可領取 {0} $RVYN", { 0: fmt(s.credit) }), sub: fee > 0 ? tl("今天提領手續費 {0}%，每天降 1%，第 15 天起免費。", { 0: Math.round(fee * 100) }) : tl("今天提領免手續費。"), action: tl("去金庫"), run: () => go("treasury") });
  }
  const docked = s.nfts.filter((n) => owned(n) && n.dockedAt !== undefined);
  if (docked.length) {
    const soonest = Math.min(...docked.map((n) => DOCK_DAYS - Math.floor((sim.now - (n.dockedAt ?? 0)) / DAY)));
    items.push({ key: "dock", icon: "settle", tone: "warn", title: tl("{0} 張卡停泊中", { 0: docked.length }), sub: tl("最快的一張還剩 {0} 天可以續航，過了就會歸航。", { 0: Math.max(0, soonest) }), action: tl("去看看"), run: () => go(docked[0].kind === 0 ? "spires" : docked[0].kind === 1 ? "prisms" : "seekers") });
  }
  const inTeam = new Set(s.teams.map((x) => x.spire));
  const idle = s.nfts.filter((n) => n.kind === 0 && owned(n) && n.dockedAt === undefined && !n.listed && !inTeam.has(n.id));
  if (idle.length && s.teams.length < MAX_TEAMS) {
    items.push({ key: "idle", icon: "fleets", tone: "plain", title: tl("{0} 座光塔閒置", { 0: idle.length }), sub: tl("還能再組 {0} 支隊伍，放上探索者就能出發。", { 0: MAX_TEAMS - s.teams.length }), action: tl("去碑原"), run: () => go("plain") });
  }
  if (!s.teams.some((x) => x.seekers.length) && !s.dives.some((d) => !d.result || d.pending)) {
    const usable = (k: number) => s.nfts.some((n) => n.kind === k && owned(n) && n.dockedAt === undefined && n.listed === undefined);
    items.push(usable(0) && usable(2)
      ? { key: "team", icon: "fleets", tone: "lime", title: tl("還沒有可以出發的隊伍"), sub: tl("到碑原把探索者放上光塔，就能出發。"), action: tl("去組隊"), run: () => go("plain") }
      : { key: "summon", icon: "summon", tone: "lime", title: tl("先召喚光塔和探索者"), sub: tl("一支隊伍至少要一座光塔和一位探索者。"), action: tl("去召喚"), run: () => go("summon") });
  }
  return items;
}

/** The to-do list under the hero: everything except what the hero already shows. Hidden when there is nothing. */
function Today({ items, title }: { items: Todo[]; title: string }) {
  if (!items.length) return null;
  return (
    <section className="v3-today" aria-label={title}>
      <header>
        <b>{title}</b>
        <small>{tl("{0} 件事", { 0: items.length })}</small>
      </header>
      {items.length ? (
        <ol>
          {items.map((x) => (
            <li key={x.key} className={`is-${x.tone}`}>
              <span className="v3-today__icon"><GameIcon name={x.icon} /></span>
              <span className="v3-today__text"><b>{x.title}</b><small>{x.sub}</small></span>
              <button type="button" className="hud-btn hud-btn--sm hud-btn--ghost" onClick={x.run}>{x.action}</button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

const STAGES = [
  { label: "召喚", sub: "取得光塔和探索者", steps: [0, 1] },
  { label: "組隊", sub: "探索者坐上光塔", steps: [2] },
  { label: "潛光", sub: "派隊伍到目的地", steps: [3, 4, 5] },
  { label: "收取", sub: "把帶回的光收進金庫", steps: [6, 7] },
] as const;

/** The top of the observatory: today's suggested route. For the strongest team that can still dive today, the
 *  reachable destination where today's light and sky do the most for it (the same base points the map shows), why,
 *  how close the next destination is, and one button that opens the map on that destination with that team.
 *  New players also see the four-step path. Facts only: no amounts of RVYN. */
function TodayRoute({ sim, go, date }: { sim: Sim; go: (v: View) => void; date: string }) {
  const s = sim.state!;
  const today = divesOn(s, sim.today);
  const left = Math.max(0, DIVES_PER_DAY - today.length);
  const teams = s.teams.filter((t) => t.seekers.length).map((t) => ({ t, input: teamInput(s, t), power: teamPower(teamInput(s, t)) }));
  const ready = teams.filter((x) => !teamOut(s, x.t.spire) && today.filter((d) => d.spire === x.t.spire).length < DIVES_PER_TEAM_PER_DAY);
  const team = (ready.length ? ready : teams).sort((a, b) => b.power - a.power)[0];
  const reach = team ? DESTINATIONS.filter((d) => team.power >= d.threshold) : [];
  const pick = team && reach.length
    ? reach.map((d) => { const plan = planDive(team.input, d, sim.sky); return { d, plan, score: basePoints(plan) * (1 - plan.levy) }; })
      .sort((a, b) => b.score - a.score || b.d.id - a.d.id)[0]
    : null;
  const next = team ? DESTINATIONS.find((d) => d.threshold > team.power) : undefined;
  const steps = questSteps(s);
  const done = steps.filter((x) => x.done).length;
  const current = steps.findIndex((x) => !x.done);
  const stage = current < 0 ? STAGES.length : STAGES.findIndex((g) => (g.steps as readonly number[]).includes(current));
  const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;
  const open = () => {
    try {
      if (pick) sessionStorage.setItem("lightdive:v3:focus", String(pick.d.id));
      if (team) sessionStorage.setItem("lightdive:v3:team", String(team.t.spire));
    } catch {}
    go("dive");
  };
  const path = current >= 0 && (
    <ol className="v3-route-hero__path" aria-label={tl("新手任務 {0}／{1}", { 0: done, 1: steps.length })}>
      {STAGES.map((g, i) => (
        <li key={g.label} className={i < stage ? "is-done" : i === stage ? "is-current" : ""}>
          <button type="button" onClick={() => go(steps[g.steps[0]].to)}><i>{i < stage ? "✓" : i + 1}</i><b>{tl(g.label)}</b></button>
        </li>
      ))}
      <li className="v3-route-hero__pathnote"><small>{tl("新手任務 {0}／{1}", { 0: done, 1: steps.length })}</small></li>
    </ol>
  );

  // What has to happen first, in order: the wallet (live game), results to collect, teams still on the bridge.
  const ch = sim.chain;
  const hero = (kicker: string, title: string, lead: string, cta: React.ReactNode) => (
    <div className="v3-route-hero">
      <span className="hud-kicker"><GameIcon name="signal" />{date} {kicker}</span>
      <h1>{title}</h1>
      <p className="v3-route-hero__lead">{lead}</p>
      <div className="v3-route-hero__go">{cta}</div>
      {path}
    </div>
  );
  const btn = (label: string, icon: IconName, onClick: () => void, disabled = false) => (
    <button type="button" className="hud-btn hud-btn--primary v3-route-hero__btn" onClick={onClick} disabled={disabled}><GameIcon name={icon} />{label}</button>
  );
  if (ch?.ready && ch.loaded) {
    const busy = !!ch.tx?.running;
    if (!ch.account) return hero(tl("· 第一步"), tl("連接錢包，開始潛光"), tl("卡片、隊伍和收益都記在你的錢包。這是測試網：用沒有價值的測試幣遊玩。"), btn(tl("連接錢包"), "rvyn", () => void ch.join()));
    if (ch.wrongChain) return hero(tl("· 第一步"), tl("切換到 {0}", { 0: ch.chainName }), tl("遊戲在這條鏈上，錢包要在同一條鏈才能交易。"), btn(tl("切換網路"), "rvyn", () => void ch.switchNetwork()));
    if (ch.eth === 0) return hero(tl("· 第一步"), tl("先領一點手續費用的測試 ETH"), tl("每筆交易都要一點點手續費。到 Robinhood 測試網水龍頭免費領取，再回來領測試 $RVYN。"), btn(tl("領取方式"), "rvyn", () => go("faucet")));
    if (ch.drip && s.balance < 20 && !s.nfts.some(owned)) {
      const wait = Math.max(0, ch.drip.nextAt - sim.now);
      return hero(tl("· 第二步"), tl("領 {0} 測試 $RVYN", { 0: fmt(ch.drip.amount, 0) }), tl("召喚光塔和探索者都用 $RVYN。測試幣每 24 小時可以領一次，沒有價值。"),
        btn(wait ? tl("{0} 後可以再領", { 0: clock(wait) }) : tl("領取 {0} tRVYN", { 0: fmt(ch.drip.amount, 0) }), "claim", () => void ch.drip!.run(), busy || wait > 0));
    }
  }
  const waiting = s.dives.filter((d) => d.pending);
  if (waiting.length) {
    const total = waiting.reduce((a, d) => a + (d.reward ?? 0), 0);
    return hero(tl("· 光橋回來了"), tl("{0} 趟結果等你收取", { 0: waiting.length }), tl("一共 {0} $RVYN。收取後才會進金庫，隊伍也才能再出發。", { 0: fmt(total) }),
      <>{btn(waiting.length > 1 ? tl("全部收取") : tl("收取結果"), "claim", () => void sim.collect(), !!ch?.tx?.running)}<button type="button" className="hud-btn hud-btn--ghost" onClick={() => go("dive")}>{tl("先看結果")}</button></>);
  }
  const onBridge = s.dives.filter((d) => !d.result);
  if (onBridge.length && !ready.length) {
    const first = Math.min(...onBridge.map((d) => d.revealAt));
    return hero(tl("· 航行中"), tl("{0} 支隊伍在光橋上", { 0: onBridge.length }), tl("{0} 後揭曉第一趟。揭曉後回來收取。", { 0: clock(Math.max(0, first - sim.now)) }), btn(tl("看航行"), "expedition", () => go("dive")));
  }

  if (!team || !pick) {
    const usable = (k: number) => s.nfts.some((n) => n.kind === k && owned(n) && n.dockedAt === undefined && n.listed === undefined);
    const toPlain = !team ? usable(0) && usable(2) : true;
    return (
      <div className="v3-route-hero">
        <span className="hud-kicker"><GameIcon name="signal" />{date} {tl("· 碑原觀測站")}</span>
        <h1>{!team ? tl("組一支隊伍，就能出發") : tl("隊伍還到不了任何目的地")}</h1>
        <p className="v3-route-hero__lead">{!team ? tl("一支隊伍是一座光塔，加上坐在泊位上的探索者。") : tl("最近的目的地門檻是 {0}，你的最強隊伍是 {1}。多放幾位探索者，或換一座泊位更多的光塔。", { 0: DESTINATIONS[0].threshold, 1: team.power })}</p>
        <div className="v3-route-hero__go">
          <button type="button" className="hud-btn hud-btn--primary v3-route-hero__btn" onClick={() => go(toPlain ? "plain" : "summon")}><GameIcon name={toPlain ? "fleets" : "summon"} />{toPlain ? tl("到碑原組隊") : tl("前往召喚")}</button>
        </div>
        {path}
      </div>
    );
  }

  const d = pick.d;
  const light = sim.sky.lights[d.id];
  const attuned = team.t.seekers.map((id) => s.nfts.find((n) => n.id === id)).filter((n) => n && n.trait === light).length;
  const ev = pick.plan.event;
  return (
    <div className="v3-route-hero" style={{ ["--hue" as string]: CLUSTER_HUE[d.cluster], ["--lc" as string]: LIGHT_COLOR[light] }}>
      <span className="hud-kicker"><GameIcon name="signal" />{date} {tl("· 今日航線建議")}</span>
      <div className="v3-route-hero__dest">
        <small>{CIRCLED[d.cluster]} {TEXTS.clusters[d.cluster].name}</small>
        <h1>{SLOT[d.slot]} {destName(d.id)}</h1>
      </div>
      <p className="v3-route-hero__lead">{tl("依今天的光和星象，{0}（戰力 {1}）最適合去這裡。", { 0: teamName(s, team.t.spire), 1: team.power })}</p>
      <ul className="v3-route-hero__why">
        <li className="is-light"><i />{attuned ? tl("今天的光：{0} · 你有 {1} 位探索者同頻", { 0: LIGHT[light], 1: attuned }) : tl("今天的光：{0}", { 0: LIGHT[light] })}</li>
        {ev && <li className="is-event" style={{ ["--ec" as string]: STAR[ev].color }}><i />{tl("星象：{0} · {1}", { 0: STAR[ev].name, 1: STAR[ev].effect })}</li>}
        <li className="is-reach"><i />{tl("門檻 {0} · 你的隊伍高出 {1}", { 0: d.threshold, 1: team.power - d.threshold })}</li>
      </ul>
      <div className="v3-route-hero__go">
        <button type="button" className="hud-btn hud-btn--primary v3-route-hero__btn" onClick={open}><GameIcon name="expedition" />{left ? tl("前往潛光") : tl("看今天的航行")}</button>
        <button type="button" className="hud-btn hud-btn--ghost" onClick={() => go("plain")}>{tl("到碑原調整隊伍")}</button>
        <small>{left ? (next ? tl("再 {0} 戰力就能到 {1}{2} {3}。", { 0: next.threshold - team.power, 1: CIRCLED[next.cluster], 2: SLOT[next.slot], 3: destName(next.id) }) : tl("二十四個目的地都到得了。"))
          : tl("今天的出發令用完了，{0} 後補滿。", { 0: clock((sim.today + 1) * DAY - sim.now) })}</small>
      </div>
      {path}
    </div>
  );
}

/** What came back yesterday: shown first thing in the morning, then it steps aside once today's dives begin. */
function Yesterday({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const list = s.dives.filter((d) => d.result && dayOf(d.at) === sim.today - 1);
  if (!list.length) return null;
  const total = list.reduce((a, d) => a + (d.reward ?? 0), 0);
  const best = list.reduce((a, d) => (d.result!.multX100 > a.result!.multX100 ? d : a));
  return (
    <section className="hud-panel v3-yesterday">
      <span className="hud-kicker"><GameIcon name="claim" />{tl("昨日回報")}</span>
      <div className="hud-statgrid">
        <span><small>{tl("出發")}</small><b>{tl("{0} 次", { 0: list.length })}</b></span>
        <span><small>{tl("帶回")}</small><b>{fmt(total)}</b></span>
        <span><small>{tl("最佳一趟")}</small><b style={{ color: OUTCOME_TONE[best.result!.outcome] }}>×{(best.result!.multX100 / 100).toFixed(2)}</b></span>
        <span><small>{tl("最佳目的地")}</small><b>{TEXTS.clusters[DESTINATIONS[best.dest].cluster].destinations[DESTINATIONS[best.dest].slot].name}</b></span>
      </div>
    </section>
  );
}

function Announcements() {
  const [items, setItems] = useState<{ id: string; kind: string; title: string; body: string; link?: string }[] | null>(null);
  useEffect(() => {
    fetch("/api/lightdive/announcements").then((r) => r.json() as Promise<{ items: typeof items }>).then((j) => setItems(j.items ?? [])).catch(() => setItems([]));
  }, []);
  if (!items || !items.length) return <p className="v3-newsline"><GameIcon name="signal" />{tl("公告與活動：")}{gap()}{items ? tl("目前沒有公告") : tl("讀取中…")}</p>;
  return (
    <Panel title={tl("公告與活動")} icon="signal">
    <ul className="hud-news__list">
      {items.map((a) => (
        <li key={a.id} className={`k-${a.kind} is-open`}>
          <button type="button"><span className="hud-news__kind">{a.kind}</span><b>{a.title}</b></button>
          <div className="hud-news__body"><p>{a.body}</p>{a.link && <a href={a.link} target="_blank" rel="noreferrer">{tl("連結")} <ExternalLink aria-hidden="true" /></a>}</div>
        </li>
      ))}
    </ul>
    </Panel>
  );
}

function questSteps(s: SimState): { label: string; done: boolean; to: View }[] {
  return [
    { label: tl("召喚一座光塔（預覽已附贈）"), done: s.nfts.some((n) => n.kind === 0), to: "summon" },
    { label: tl("召喚探索者（預覽已附贈）"), done: s.nfts.some((n) => n.kind === 2), to: "summon" },
    { label: tl("在碑原把探索者放上光塔"), done: s.teams.some((t) => t.seekers.length > 0), to: "plain" },
    { label: tl("到 ① 微光淺域出發一次"), done: s.dives.length > 0, to: "dive" },
    { label: tl("回答一張航行抉擇事件卡"), done: s.dives.some((d) => d.choice), to: "dive" },
    { label: tl("看一次光橋揭曉"), done: s.dives.some((d) => d.result), to: "dive" },
    { label: tl("親手收取一趟帶回的光"), done: s.dives.some((d) => d.result && !d.pending), to: "dive" },
    { label: tl("在金庫看到收益"), done: s.credit > 0 || s.claimed > 0, to: "treasury" },
  ];
}

function Forecast({ sim, best, go }: { sim: Sim; best: number; go: (v: View) => void }) {
  const s = sim.state!;
  const lights = new Map<number, number>();
  for (const n of s.nfts) if (n.kind === 2 && alive(n)) lights.set(n.trait, (lights.get(n.trait) ?? 0) + 1);
  return (
    <ul className="v3-forecast">
      {TEXTS.clusters.map((c, ci) => {
        const [lo] = clusterRange(ci);
        const ids = [0, 1, 2, 3].map((i) => ci * 4 + i);
        const pick = ids.map((id) => ({ id, attuned: lights.get(sim.sky.lights[id]) ?? 0, ev: sim.sky.events.get(id) })).sort((a, b) => (b.ev ? 1 : 0) - (a.ev ? 1 : 0) || b.attuned - a.attuned)[0];
        const d = DESTINATIONS[pick.id];
        return (
          <li key={ci} className={best < lo ? "is-locked" : ""} style={{ ["--hue" as string]: CLUSTER_HUE[ci], ["--photo" as string]: `url(${CLUSTER_IMAGES[ci].src})` }}>
            <button type="button" onClick={() => { try { if (best >= lo) sessionStorage.setItem("lightdive:v3:focus", String(d.id)); } catch {} go("dive"); }}>
              <b>{CIRCLED[ci]} {c.name}</b>
              <span>{best < lo ? tl("需要戰力 {0}", { 0: lo }) : `${SLOT[d.slot]} ${c.destinations[d.slot].name}`}</span>
              <small>
                {pick.ev ? <em style={{ color: STAR[pick.ev].color }}>{STAR[pick.ev].name}</em> : null}
                {pick.attuned ? tl(" 你有 {0} 位{1}探索者同頻", { 0: pick.attuned, 1: LIGHT[sim.sky.lights[pick.id]] }) : tl(" 今天的光：{0}", { 0: LIGHT[sim.sky.lights[pick.id]] })}
              </small>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------- 素材授權

export function Credits() {
  const images = [GALAXY_IMAGE, ...CLUSTER_IMAGES];
  return (
    <div className="hud-page">
      <PageHead kicker={tl("素材授權")} icon="guide" title={tl("素材授權")} lead={tl("遊戲裡使用的第三方影像、音樂、音效與圖示，以及它們要求的標註。")} />
      <Panel title={tl("太空影像（ESA/Hubble，CC BY 4.0）")} index="01" icon="crystal">
        <ul className="v3-credits">
          {images.map((i) => (
            <li key={i.src}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.src} alt="" loading="lazy" />
              <span><b>{i.title}</b><small>Credit: {i.credit}</small><a href={i.url} target="_blank" rel="noreferrer">{i.url}</a></span>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title={tl("音樂（CC BY 4.0）")} index="02" icon="signal">
        <ul className="v3-credits is-text">
          {Object.values(MUSIC).map((m) => <li key={m.src}><span><b>{m.title}</b><small>{m.credit}</small></span></li>)}
        </ul>
      </Panel>
      <Panel title={tl("音效與圖示")} index="03" icon="voyage">
        <p className="hud-dim">{SFX_CREDIT}</p>
        <p className="hud-dim">{ICON_CREDIT}</p>
        <p className="hud-note">{tl("影像的使用不代表 ESA、NASA 或任何機構為本遊戲背書。")}</p>
      </Panel>
    </div>
  );
}

/** The last few voyages: where, which team, the outcome and what it brought back; a click opens that voyage. */
function RecentVoyages({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const s = sim.state!;
  const list = s.dives.filter((d) => d.result).sort((a, b) => b.revealAt - a.revealAt).slice(0, 6);
  if (!list.length) return <p className="hud-empty">{tl("還沒有航行紀錄。到潛光派一支隊伍出發吧。")}</p>;
  const open = (id: number) => { try { sessionStorage.setItem("lightdive:v3:watch", String(id)); } catch {} go("dive"); };
  return (
    <ul className="v3-recentdives">
      {list.map((d) => {
        const r = d.result!;
        const dest = DESTINATIONS[d.dest];
        return (
          <li key={d.id} style={{ ["--tc" as string]: OUTCOME_TONE[r.outcome], ["--hue" as string]: CLUSTER_HUE[dest.cluster] }}>
            <button type="button" onClick={() => open(d.id)}>
              <span className="v3-recentdives__where"><b>{CIRCLED[dest.cluster]}{SLOT[dest.slot]} {TEXTS.clusters[dest.cluster].destinations[dest.slot].name}</b><small>{teamName(s, d.spire)} · {ago(sim.now - d.revealAt)}</small></span>
              <span className="v3-recentdives__mult"><small>{OUTCOME[r.outcome]}</small><b>×{(r.multX100 / 100).toFixed(2)}</b></span>
              <span className="v3-recentdives__reward">{d.pending ? <em>{tl("待收取")}</em> : null}+{fmt(d.reward ?? 0)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Each team in one line: name, power, members and what it is doing right now. */
function TeamsAtGlance({ sim, go }: { sim: Sim; go: (v: View) => void }) {
  const s = sim.state!;
  const teams = s.teams.filter((x) => x.seekers.length);
  if (!teams.length) return <p className="hud-empty">{tl("還沒有隊伍。到碑原把探索者放上光塔。")}</p>;
  const left = Math.max(0, DIVES_PER_DAY - divesOn(s, sim.today).length);
  return (
    <ul className="v3-teamsglance">
      {teams.map((x) => {
        const out = s.dives.find((d) => d.spire === x.spire && !d.result);
        const waiting = s.dives.find((d) => d.spire === x.spire && d.pending);
        const today = divesOn(s, sim.today).filter((d) => d.spire === x.spire).length;
        const st = out ? (deciding(out, sim.now) ? { t: tl("抉擇中"), c: "gold" } : { t: tl("航行中 · {0}", { 0: clock(out.revealAt - sim.now) }), c: "blue" })
          : waiting ? { t: tl("待收取"), c: "gold" } : today >= 3 ? { t: tl("今天已出發 3 次"), c: "dim" } : !left ? { t: tl("出發令已用完"), c: "dim" } : { t: tl("可出發"), c: "lime" };
        const spire = s.nfts.find((n) => n.id === x.spire);
        return (
          <li key={x.spire}>
            <button type="button" onClick={() => { try { sessionStorage.setItem("lightdive:v3:team", String(x.spire)); } catch {} go("plain"); }}>
              <span className="v3-teamsglance__name"><b>{teamName(s, x.spire)}</b><small>{spire ? tl("{0}／{1} 泊位", { 0: x.seekers.length, 1: spire.trait }) : tl("{0} 位探索者", { 0: x.seekers.length })}{x.prism ? tl(" · 有稜鏡") : ""}</small></span>
              <span className="v3-teamsglance__power"><b>{teamPower(teamInput(s, x))}</b><small>{tl("戰力")}</small></span>
              <span className={`v3-chip is-${st.c}`}>{st.t}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
