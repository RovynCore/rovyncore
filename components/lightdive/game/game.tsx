"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, LogOut, RefreshCw, Volume2, VolumeX } from "lucide-react";
import { parseEther } from "viem";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import { ABI, CONTRACTS, GAME_CHAIN, KIND, type Contracts } from "@/lib/lightdive";
import { A, FAUCET_ETH, G, NAV, NAV_GROUP } from "@/lib/lightdive-game-copy";
import { useGame, countdown } from "./use-game";
import { TxPanel, fill, rvyn, useT, type Mood } from "./ui";
import { GameIcon } from "./icon";
import type { IconName } from "./icons";
import { Nebula } from "./nebula";
import { Lobby } from "./lobby";
import { Base } from "./base";
import { Hangar } from "./hangar";
import { Inventory } from "./inventory";
import { Summon } from "./summon";
import { Market } from "./market";
import { Treasury } from "./treasury";
import { Codex } from "./codex";
import { Guide } from "./guide";
import { sfx, useSound } from "./sound";
import "./game.css";
import "./app.css";
import "./hud.css";

export type View = "lobby" | "dive" | "plain" | "spires" | "seekers" | "prisms" | "summon" | "market" | "treasury" | "codex" | "guide";
type NavItem = { key: View; icon: IconName };
const MENU: { group: keyof typeof NAV_GROUP; items: NavItem[] }[] = [
  { group: "main", items: [{ key: "lobby", icon: "overview" }, { key: "dive", icon: "expedition" }, { key: "plain", icon: "fleets" }] },
  { group: "assets", items: [{ key: "spires", icon: "spires" }, { key: "seekers", icon: "seekers" }, { key: "prisms", icon: "prisms" }] },
  { group: "acquire", items: [{ key: "summon", icon: "summon" }, { key: "market", icon: "market" }] },
  { group: "earnings", items: [{ key: "treasury", icon: "treasury" }] },
  { group: "more", items: [{ key: "codex", icon: "codex" }, { key: "guide", icon: "guide" }] },
];
const VIEWS = MENU.flatMap((m) => m.items);
/** Phones show these five in the bottom bar; the rest live behind "more". */
const PHONE_BAR: View[] = ["lobby", "dive", "plain", "summon", "treasury"];
const LEGACY: Record<string, View> = { observatory: "lobby", draw: "summon", fleet: "plain", collection: "spires", log: "treasury" };

function useView(): [View, (v: View) => void] {
  const read = () => {
    const h = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    if (LEGACY[h]) return LEGACY[h];
    return (VIEWS.some((v) => v.key === h) ? h : "lobby") as View;
  };
  const [view, setView] = useState<View>("lobby");
  useEffect(() => {
    const sync = () => setView(read());
    queueMicrotask(sync);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  const go = useCallback((v: View) => {
    if (window.location.hash.slice(1) !== v) window.location.hash = v;
    setView(v);
    document.getElementById("ldg-main")?.scrollTo({ top: 0 });
  }, []);
  return [view, go];
}

export function LightdiveGame() {
  const { t } = useT();
  if (!CONTRACTS) {
    return (
      <main className="ldg ldg-app hud">
        <div className="ldg-main"><p className="rv-lead" style={{ padding: "80px 24px" }}>{t(G.notDeployed)}</p></div>
      </main>
    );
  }
  return <Game c={CONTRACTS} />;
}

export type Game = ReturnType<typeof useGame>;
export type Derived = ReturnType<typeof derive>;

function derive(g: Game) {
  const { data, account, now } = g;
  const o = data.overview;
  const today = Math.floor(now / 86_400);
  const spires = data.nfts.filter((n) => n.attributes.kind === KIND.spire);
  const prisms = data.nfts.filter((n) => n.attributes.kind === KIND.prism);
  const seekers = data.nfts.filter((n) => n.attributes.kind === KIND.seeker);
  const canAct = !!o && o.diveScheduled && !o.paused.expedition;
  const teamsReady = data.teams.filter((tm) => tm.seekers.length > 0 && tm.lastDiveDay !== today);
  const drawsReady = data.requests.filter((r) => !r.fulfilled && r.ready);
  const drawsWaiting = data.requests.filter((r) => !r.fulfilled && !r.ready);
  const open = data.dives.filter((d) => !d.settled);
  const divesOut = open.filter((d) => !data.outcomes.has(d.id));
  const resultsKnown = open.filter((d) => data.outcomes.has(d.id) && !data.settleable.has(d.id));
  const settleable = open.filter((d) => data.settleable.has(d.id));
  const credit = data.player?.credit ?? 0n;
  return {
    today, spires, prisms, seekers, canAct, teamsReady, drawsReady, drawsWaiting, divesOut, resultsKnown, settleable, credit,
    connected: !!account,
    onTestnet: data.walletChain === null || data.walletChain === GAME_CHAIN.id,
    noGas: data.gas !== null && data.gas < parseEther("0.00002"),
    hasRvyn: (data.player?.rvyn ?? 0n) > 0n,
    resetIn: (today + 1) * 86_400 - now,
    nextSlotIn: (Math.floor(now / 60) + 1) * 60 - now,
  };
}

export type KeeperState = { line: string; mood: Mood; cta?: { label: string; view?: View; href?: string; act?: () => void } };

/** What the Signal-Keeper says next, and where it points the player. */
export function keeperState(g: Game, d: Derived, t: (v: import("@/lib/lightdive-copy").Copy) => string): KeeperState {
  const o = g.data.overview;
  if (!d.connected) return { line: t(G.kConnect), mood: "idle", cta: { label: t(G.connect), act: () => void g.join() } };
  if (!d.onTestnet) return { line: t(G.kNetwork), mood: "alert", cta: { label: t(G.wrongNetwork), act: () => void g.switchNetwork() } };
  if (!g.data.player) return { line: t(G.loading), mood: "idle" };
  if (d.noGas) return { line: t(G.kGas), mood: "alert", cta: { label: t(G.getEth), href: FAUCET_ETH } };
  if (o && (o.paused.expedition || o.paused.minter)) return { line: t(G.paused), mood: "dim" };
  if (o && !o.slotScheduled) return { line: t(G.kSignalOff), mood: "dim" };
  if (d.drawsReady.length) return { line: t(G.kDrawReady), mood: "active", cta: { label: t(NAV.summon), view: "summon" } };
  if (d.settleable.length) return { line: t(G.kSettle), mood: "active", cta: { label: `${t(A.settle)} ${d.settleable.length}`, act: () => void settleAll(g, d) } };
  if (d.teamsReady.length) return { line: fill(t(G.kDive), { n: d.teamsReady.length }), mood: "active", cta: { label: t(NAV.dive), view: "dive" } };
  if (g.data.teams.length === 0) {
    if (d.spires.length && d.seekers.length) return { line: t(G.kAssemble), mood: "active", cta: { label: t(NAV.plain), view: "plain" } };
    if (d.drawsWaiting.length) return { line: t(G.kDrawWait), mood: "idle", cta: { label: t(NAV.summon), view: "summon" } };
    if (d.seekers.length) return { line: t(G.kNeedSpire), mood: "idle", cta: { label: t(NAV.summon), view: "summon" } };
    if (d.spires.length) return { line: t(G.kNeedSeeker), mood: "idle", cta: { label: t(NAV.summon), view: "summon" } };
    if (!d.hasRvyn) return { line: t(G.kNoRvyn), mood: "dim" };
    return { line: t(G.kStart), mood: "idle", cta: { label: t(NAV.summon), view: "summon" } };
  }
  if (d.credit > 0n && g.data.player && o) {
    const fee = feePct(g);
    return { line: fill(t(G.kClaim), { x: rvyn(d.credit), f: fee }), mood: "active", cta: { label: t(NAV.treasury), view: "treasury" } };
  }
  if (d.drawsWaiting.length) return { line: t(G.kDrawWait), mood: "idle" };
  if (d.divesOut.length) return { line: t(G.kOut), mood: "idle", cta: { label: t(NAV.dive), view: "dive" } };
  if (d.resultsKnown.length) return { line: t(G.kResults), mood: "active", cta: { label: t(NAV.treasury), view: "treasury" } };
  return { line: t(G.kIdle), mood: "idle" };
}

/** One-tap settle of every ready voyage (up to 40 per transaction). */
export async function settleAll(g: Game, d: Derived) {
  if (!CONTRACTS) return;
  const ids = d.settleable.map((x) => x.id).slice(0, 40);
  if (await g.run([{ label: G.stepSettle, address: CONTRACTS.expedition, abi: ABI.Expedition, functionName: "settle", args: [ids] }])) sfx.success();
  else sfx.fail();
}

export async function claimAll(g: Game) {
  if (!CONTRACTS) return;
  if (await g.run([{ label: G.stepClaim, address: CONTRACTS.expedition, abi: ABI.Expedition, functionName: "claim" }])) sfx.success();
  else sfx.fail();
}

export function feePct(g: Game) {
  const o = g.data.overview;
  const p = g.data.player;
  if (!o || !p) return 0;
  if (p.lastClaimAt === 0n) return o.claimFeeMaxBp / 100;
  const days = Math.floor((g.now - Number(p.lastClaimAt)) / 86_400);
  return days >= o.claimFeeDecayDays ? 0 : Math.floor((o.claimFeeMaxBp * (o.claimFeeDecayDays - days)) / o.claimFeeDecayDays) / 100;
}

function Game({ c }: { c: Contracts }) {
  const { t, locale } = useT();
  const g = useGame(c);
  const [view, go] = useView();
  const [sound, toggleSound] = useSound();
  const [more, setMore] = useState(false);
  const d = derive(g);
  const keeper = keeperState(g, d, t);
  const o = g.data.overview;
  const counts: Partial<Record<View, number>> = {
    plain: g.data.teams.length,
    spires: d.spires.length + g.data.teams.length,
    seekers: d.seekers.length + g.data.teams.reduce((s, tm) => s + tm.seekers.length, 0),
    prisms: d.prisms.length + g.data.teams.filter((tm) => tm.prism).length,
  };
  const badges: Partial<Record<View, number | string>> = {
    dive: d.teamsReady.length || undefined,
    summon: d.drawsReady.length || undefined,
    treasury: d.settleable.length || d.credit > 0n ? "!" : undefined,
  };
  const navigate = (v: View) => {
    sfx.click();
    setMore(false);
    go(v);
  };
  const navButton = ({ key, icon }: NavItem) => (
    <button key={key} type="button" className={`hud-nav${view === key ? " is-on" : ""}`} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}>
      <GameIcon name={icon} />
      <span>{t(NAV[key])}</span>
      {badges[key] ? <i className="hud-badge">{badges[key]}</i> : counts[key] ? <small>{counts[key]}</small> : null}
    </button>
  );

  return (
    <main className={`ldg ldg-app hud is-${view}`} lang={locale}>
      <aside className="hud-rail" aria-label="Lightdive">
        <div className="hud-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lightdive/keeper-face.webp" alt="" width={44} height={44} />
          <span><b>{t(G.obsTitle)}</b><small>LIGHTDIVE · {t(G.testnetBadge)}</small></span>
        </div>
        <nav className="hud-menu">
          {MENU.map((m) => (
            <div key={m.group} className="hud-menu__group">
              <span className="hud-menu__label">{t(NAV_GROUP[m.group])}</span>
              {m.items.map(navButton)}
            </div>
          ))}
        </nav>
        <div className="hud-rail__foot">
          {!d.connected ? (
            <button type="button" className="hud-btn hud-btn--primary hud-btn--block" onClick={() => void g.join()}>{t(G.connect)}</button>
          ) : !d.onTestnet ? (
            <button type="button" className="hud-btn hud-btn--primary hud-btn--block" onClick={() => void g.switchNetwork()}>{t(G.wrongNetwork)}</button>
          ) : (
            <div className="hud-wallet"><i />{g.account ? `${g.account.slice(0, 6)}…${g.account.slice(-4)}` : ""}<small>{t(G.testnetBadge)}</small></div>
          )}
          <div className="hud-tools">
            <button type="button" className="hud-icon" onClick={toggleSound} aria-pressed={sound} aria-label={t(sound ? A.soundOff : A.soundOn)} title={t(sound ? A.soundOff : A.soundOn)}>{sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}</button>
            <button type="button" className="hud-icon" onClick={() => void g.load()} aria-label={t(G.refresh)} disabled={g.loading}>{g.loading ? <LoaderCircle className="ldg-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}</button>
            <a className="hud-icon" href="/game" aria-label={t(A.exit)} title={t(A.exit)}><LogOut aria-hidden="true" /></a>
          </div>
        </div>
      </aside>

      <div className="hud-main" id="ldg-main">
        {view !== "dive" && <Nebula className="hud-nebula" />}
        <header className="hud-top">
          <Res icon="rvyn" label={t(A.hud.rvyn)} value={g.data.player ? rvyn(g.data.player.rvyn, 0) : "—"} />
          <Res icon="claim" tone="gold" label={t(A.hud.credit)} value={rvyn(d.credit, 2)} onClick={() => navigate("treasury")} />
          <Res icon="pool" label={t(A.hud.pool)} value={o ? rvyn(o.pool.balance, 0) : "—"} className="hud-res--wide" />
          <span className="hud-top__space" />
          <Res icon="signal" tone={o && !o.slotScheduled ? "warn" : undefined} label={t(A.hud.signal)} value={countdown(d.nextSlotIn)} />
          <Res icon="clock" label={t(A.hud.reset)} value={countdown(d.resetIn)} className="hud-res--wide" />
        </header>
        {g.failed && <p className="ldg-banner" role="status">{t(G.readError)}</p>}
        {d.connected && d.noGas && <p className="ldg-banner">{t(G.lowGas)} · <a href={FAUCET_ETH} target="_blank" rel="noreferrer">{t(G.getEth)} ↗</a></p>}
        {!o ? (
          <div className="ldg-loading"><LoaderCircle className="ldg-spin" aria-hidden="true" />{t(G.loading)}</div>
        ) : view === "lobby" ? (
          <Lobby g={g} d={d} keeper={keeper} go={go} />
        ) : view === "dive" ? (
          <Base g={g} d={d} c={c} keeper={keeper} go={go} />
        ) : view === "plain" ? (
          <Hangar g={g} d={d} c={c} go={go} />
        ) : view === "spires" || view === "seekers" || view === "prisms" ? (
          <Inventory g={g} d={d} kind={view === "spires" ? KIND.spire : view === "seekers" ? KIND.seeker : KIND.prism} go={go} />
        ) : view === "summon" ? (
          <Summon g={g} d={d} c={c} go={go} />
        ) : view === "market" ? (
          <Market />
        ) : view === "treasury" ? (
          <Treasury g={g} d={d} c={c} />
        ) : view === "codex" ? (
          <Codex g={g} d={d} />
        ) : (
          <div className="hud-page"><Guide g={g} /></div>
        )}
      </div>

      <nav className="hud-tabbar" aria-label="Lightdive">
        {PHONE_BAR.map((key) => {
          const item = VIEWS.find((v) => v.key === key)!;
          return (
            <button key={key} type="button" className={view === key ? "is-on" : ""} aria-current={view === key ? "page" : undefined} onClick={() => navigate(key)}>
              <GameIcon name={item.icon} />
              <span>{t(NAV[key])}</span>
              {badges[key] ? <i className="hud-badge">{badges[key]}</i> : null}
            </button>
          );
        })}
        <button type="button" className={more || !PHONE_BAR.includes(view) ? "is-on" : ""} aria-expanded={more} onClick={() => setMore((m) => !m)}>
          <GameIcon name="codex" />
          <span>{t(NAV_GROUP.more)}</span>
        </button>
      </nav>
      {more && (
        <div className="hud-more" role="dialog" aria-label={t(NAV_GROUP.more)} onClick={() => setMore(false)}>
          <div className="hud-more__sheet" onClick={(e) => e.stopPropagation()}>
            {VIEWS.filter((v) => !PHONE_BAR.includes(v.key)).map(navButton)}
          </div>
        </div>
      )}
      {g.tx && <TxPanel tx={g.tx} onClose={g.closeTx} />}
    </main>
  );
}

function Res({ icon, label, value, tone, className, onClick }: { icon: IconName; label: string; value: string; tone?: "gold" | "warn"; className?: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`hud-res${tone ? ` hud-res--${tone}` : ""}${className ? ` ${className}` : ""}`} onClick={onClick}>
      <span className="hud-res__ico"><GameIcon name={icon} /></span>
      <span><small>{label}</small><b>{value}</b></span>
    </Tag>
  );
}
