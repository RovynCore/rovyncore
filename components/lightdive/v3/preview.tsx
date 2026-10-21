"use client";

// Lightdive v3: the game shell. The preview (/game/lightdive/preview) plays it on simulated state in this browser; the
// live game (/game/lightdive, live.tsx) plays the same pages on the v3 contracts with the player's wallet.
import { useCallback, useEffect, useMemo, useState, lazy, Suspense } from "react";
import { FlaskConical, Lock, LogOut, Music, Music2, Volume1, Volume2, VolumeX } from "lucide-react";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import { DIVES_PER_DAY } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { GameIcon } from "../game/icon";
import type { IconName } from "../game/icons";
import { Nebula } from "../game/nebula";
import { passesOn, useSim, type Game } from "./sim";
import { ChainStrip, DraftBar, Faucet, SummonBar, TxPanel, WalletBox } from "./live-ui";
import { StarMap } from "./starmap";
import { Credits, Lobby, Rovyn, rovynPool, type View } from "./pages";
import { Guide } from "./guide";
import { Story } from "./story";
import { Buy } from "./buy";
// the whitepaper (four languages, about 30 KB) loads only when it is opened
const Whitepaper = lazy(() => import("./whitepaper").then((m) => ({ default: m.Whitepaper })));
import { Plain } from "./plain";
import { Collection } from "./assets";
import { Summon } from "./summon";
import { Market } from "./market";
import { Treasury } from "./treasury";
import { Settings } from "./settings-page";
import { Logbook, recordsOf, unseenFootprints } from "./logbook";
import { CommissionsPage, commissionBadge } from "./commissions";
import { isDaylight, useSettings } from "./settings";
import { useVoyageAlerts } from "./alerts";
import { useLanguage } from "@/components/language-provider";
import { syncGameLocale } from "@/lib/lightdive-v3/i18n";
import { clock, fmt } from "./copy";
import { Broadcast } from "./extras";
import { WelcomeBack } from "./welcome";
import { ALL_UNLOCKED, UnlockNotice, unlocksOf } from "./unlocks";
import { ChatDock } from "./chat";
import { play, useMusic, useMusicToggle, useMute, useVolume } from "./audio";
import "../game/game.css";
import "../game/app.css";
import "../game/hud.css";
import "./v3.css";
import "./redesign.css";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

type MenuGroup = { group: string; items: { key: View; label: string; icon: IconName }[] };
const MENU_SRC: MenuGroup[] = [
  { group: "主要", items: [{ key: "lobby", label: "觀測站", icon: "overview" }, { key: "dive", label: "潛光", icon: "expedition" }, { key: "commissions", label: "每日委託", icon: "signal" }, { key: "plain", label: "碑原", icon: "fleets" }, { key: "logbook", label: "個人檔案", icon: "voyage" }] },
  { group: "資產", items: [{ key: "spires", label: "光塔", icon: "spires" }, { key: "prisms", label: "稜鏡", icon: "prisms" }, { key: "seekers", label: "探索者", icon: "seekers" }] },
  { group: "取得", items: [{ key: "summon", label: "召喚", icon: "summon" }, { key: "market", label: "市集", icon: "market" }, { key: "buy", label: "購買 $RVYN", icon: "rvyn" }] },
  { group: "收益", items: [{ key: "treasury", label: "金庫", icon: "treasury" }] },
  { group: "其他", items: [{ key: "guide", label: "玩法", icon: "guide" }, { key: "story", label: "故事", icon: "voyage" }, { key: "whitepaper", label: "白皮書", icon: "codex" }, { key: "credits", label: "素材授權", icon: "codex" }, { key: "settings", label: "設定", icon: "settings" }] },
];
const MENU = localized(MENU_SRC);
/** On the testnet the "buy $RVYN" page is the test-token faucet instead. */
const FAUCET_MENU = localized(MENU_SRC.map((m) => ({ ...m, items: m.items.map((i) => (i.key === "buy" ? { key: "faucet" as View, label: "測試幣", icon: i.icon } : i)) })));
const PHONE: View[] = ["lobby", "dive", "plain", "summon", "treasury"];

function useView(ITEMS: MenuGroup["items"]): [View, (v: View) => void] {
  const [view, setView] = useState<View>("lobby");
  useEffect(() => {
    const sync = () => {
      // a view may carry a parameter after "=" (someone's profile: #logbook=0x…)
      const h = window.location.hash.slice(1).split("=")[0] as View;
      setView(ITEMS.some((i) => i.key === h) ? h : "lobby");
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [ITEMS]);
  const go = useCallback((v: View) => {
    if (window.location.hash.slice(1).split("=")[0] !== v || window.location.hash.includes("=")) window.location.hash = v;
    setView(v);
    document.getElementById("v3-main")?.scrollTo({ top: 0 });
  }, []);
  return [view, go];
}

export function LightdivePreview() {
  const sim = useSim();
  return <LightdiveApp sim={sim} />;
}

export function LightdiveApp({ sim }: { sim: Game }) {
  const live = sim.mode === "chain";
  // step-by-step unlocks: every page stays in the menu; one that is not open yet shows a lock and says how it opens
  const unlocks = sim.state ? unlocksOf(sim.state) : ALL_UNLOCKED;
  const locked = unlocks.profile ? "" : "logbook";
  const baseMenu = live && sim.chain?.testToken ? FAUCET_MENU : MENU;
  const menu = baseMenu;
  const ITEMS = useMemo(() => menu.flatMap((m) => m.items), [menu]);
  // routing knows every page: a locked page is only left out of the menu (a shared profile link must still open)
  const ROUTES = useMemo(() => baseMenu.flatMap((m) => m.items), [baseMenu]);
  const [view, go] = useView(ROUTES);
  const [more, setMore] = useState(false);
  const [muted, toggleMute] = useMute();
  const settings = useSettings();
  useVoyageAlerts(sim);
  const { locale: siteLocale } = useLanguage();
  const lang = syncGameLocale(siteLocale); // the language actually shown (falls back until a translation is complete)
  const [musicOn, toggleMusic] = useMusicToggle();
  const [lineIndex, setLineIndex] = useState(0);
  // a line Rovyn said in reply to something, kept with the language it was said in (a language switch drops it)
  const [spoken, setSpoken] = useState<{ text: string; lang: string } | null>(null);
  const pool = sim.state ? rovynPool(sim) : TEXTS.rovyn.idle;
  const line = spoken && spoken.lang === lang ? spoken.text : pool[lineIndex % pool.length];
  const next = useCallback(() => { setSpoken(null); setLineIndex((i) => i + 1); }, []);
  const say = useCallback((l: string) => setSpoken({ text: l, lang }), [lang]);
  const s = sim.state;

  const badges = useMemo(() => {
    if (!s) return {} as Partial<Record<View, number>>;
    const docked = (k: number) => s.nfts.filter((n) => n.kind === k && n.dockedAt !== undefined && !n.homeAt).length;
    return {
      // results waiting to be collected come first; otherwise the tickets left today
      dive: s.dives.filter((d) => d.pending).length || Math.max(0, DIVES_PER_DAY - passesOn(s, sim.today)),
      spires: docked(0), prisms: docked(1), seekers: docked(2),
      treasury: s.credit > 0 ? 1 : 0,
      logbook: view === "logbook" ? 0 : unseenFootprints(recordsOf(sim)), // opening the page marks them seen
      commissions: unlocksOf(s).commissions ? commissionBadge(sim) : 0,
    } as Partial<Record<View, number>>;
  }, [s, sim.today, view]); // eslint-disable-line react-hooks/exhaustive-deps -- `sim` is a new object every render; its state and day are what matter

  if (!s) {
    const wait = !live ? tl("讀取預覽資料…") : sim.chain?.ready ? tl("讀取鏈上資料…") : tl("合約部署中，遊戲即將開放。");
    return <main className="ldg ldg-app hud"><div className="ldg-loading">{wait}</div></main>;
  }

  const rovyn = <Rovyn sim={sim} line={line} onNext={next} />;
  const nav = (i: (typeof ITEMS)[number]) => (
    <button key={i.key} type="button" className={`hud-nav${view === i.key ? " is-on" : ""}${locked === i.key ? " is-locked" : ""}`} aria-current={view === i.key ? "page" : undefined} title={locked === i.key ? tl("收下第一趟結果後開放") : undefined} onClick={() => { setMore(false); go(i.key); play("click"); }}>
      <GameIcon name={i.icon} />{i.label}{locked === i.key && <Lock className="hud-nav__lock" aria-label={tl("尚未開放")} />}
      {badges[i.key] ? <i className="hud-badge">{badges[i.key]}</i> : null}
    </button>
  );
  const resetIn = (sim.today + 1) * 86_400_000 - sim.now;

  return (
    <main className={`ldg ldg-app hud v3 is-${view}${settings.calm ? " is-calm" : ""}`} lang={lang}>
      <aside className="hud-rail" aria-label={tl("潛光遠征")}>
        <div className="hud-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/lightdive/keeper-face.webp" alt="" width={44} height={44} />
          <span><b>{tl("潛光遠征")}</b><small>{!live ? tl("LIGHTDIVE · 預覽 v3") : sim.chain?.testnet ? tl("LIGHTDIVE · 測試網") : "LIGHTDIVE"}</small></span>
        </div>
        <nav className="hud-menu">
          {menu.map((m) => (
            <div key={m.group} className="hud-menu__group">
              <span className="hud-menu__label">{m.group}</span>
              {m.items.map(nav)}
            </div>
          ))}
        </nav>
        <div className="hud-rail__foot">
          {live ? <WalletBox sim={sim} /> : <div className="hud-wallet"><FlaskConical aria-hidden="true" />{tl("預覽模式")}<small>{tl("不上鏈")}</small></div>}
          <div className="hud-tools">
            <VolumeControl kind="sfx" on={!muted} onToggle={toggleMute} />
            <VolumeControl kind="music" on={musicOn} onToggle={toggleMusic} />
            {sim.skipDay && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={sim.skipDay} title={tl("預覽用：讓時間前進一天")}>{tl("快轉一天")}</button>}
            {!live && <a className="hud-icon" href="/game/lightdive" aria-label={tl("回到正式版")} title={tl("回到正式版")}><LogOut aria-hidden="true" /></a>}
          </div>
        </div>
      </aside>

      <div className="hud-main" id="v3-main">
        {/* daylight (the founder's light backgrounds, 10-18): the Stele Plain at dawn; the night sky otherwise */}
        {view === "plain" && isDaylight(settings.sky, new Date(sim.now))
          ? <div className="hud-daybg is-plain" aria-hidden="true" />
          : view !== "dive" && <Nebula className="hud-nebula" />}
        <header className="hud-top">
          <Res icon="rvyn" label={sim.chain?.testToken ? "tRVYN" : "$RVYN"} value={fmt(s.balance)} className="hud-res--wallet" onClick={sim.chain?.testToken ? () => go("faucet") : undefined} />
          <Res icon="claim" tone="gold" label={tl("可領取")} value={fmt(s.credit)} className="hud-res--claim" onClick={() => go("treasury")} />
          <Res icon="launch" label={tl("出發令")} value={tl("{0}／{1}", { 0: Math.max(0, DIVES_PER_DAY - passesOn(s, sim.today)), 1: DIVES_PER_DAY })} onClick={() => go("dive")} />
          <Res icon="rvyn" tone="gold" label={tl("核光池")} value={fmt(sim.pool)} className="hud-res--pool" onClick={() => go("treasury")} />
          <span className="hud-top__space" />
          {live
            ? sim.chain?.testnet && <span className="v3-badge"><FlaskConical aria-hidden="true" />{tl("測試網：用測試幣遊玩，沒有價值 · 合約未審計")}</span>
            : <span className="v3-badge"><FlaskConical aria-hidden="true" />{tl("預覽模式：結果是模擬的，不會上鏈")}</span>}
          <Res icon="clock" label={tl("換日")} value={clock(resetIn)} className="hud-res--wide" />
        </header>
        {live && view !== "lobby" && <div className="v3-chainstrip"><ChainStrip sim={sim} onFaucet={() => go("faucet")} /></div>}
        <div key={view} className="v3-view">
        {view === "lobby" ? <Lobby sim={sim} go={go} rovyn={rovyn} />
          : view === "dive" ? <StarMap sim={sim} say={say} />
          : view === "plain" ? <Plain sim={sim} go={go} />
          : view === "logbook" ? <Logbook sim={sim} />
          : view === "commissions" ? <CommissionsPage sim={sim} go={go} />
          : view === "spires" ? <Collection sim={sim} kind={0} />
          : view === "prisms" ? <Collection sim={sim} kind={1} />
          : view === "seekers" ? <Collection sim={sim} kind={2} />
          : view === "summon" ? <Summon sim={sim} go={go} />
          : view === "market" ? <Market sim={sim} go={go} />
          : view === "treasury" ? <Treasury sim={sim} />
          : view === "credits" ? <Credits />
          : view === "story" ? <Story />
          : view === "buy" ? <Buy />
          : view === "faucet" && live ? <Faucet sim={sim} />
          : view === "whitepaper" ? <Suspense fallback={<p className="hud-dim">{tl("載入中…")}</p>}><Whitepaper /></Suspense>
          : view === "settings" ? <Settings sim={sim} muted={muted} toggleMute={toggleMute} musicOn={musicOn} toggleMusic={toggleMusic} />
          : <Guide sim={sim} go={go} />}
        </div>
        <Broadcast sim={sim} />
        <WelcomeBack sim={sim} go={go} />
        <UnlockNotice unlocks={unlocks} go={go} />
        <ChatDock sim={sim} />
        {view === "dive" && <div className="v3-dock-rovyn">{rovyn}</div>}
        {view !== "dive" && <ObservatoryMusic quiet={view === "story" || view === "whitepaper"} />}
      </div>
      {live && <><DraftBar sim={sim} /><SummonBar sim={sim} /><TxPanel sim={sim} /></>}

      <nav className="hud-tabbar" aria-label={tl("潛光遠征")}>
        {PHONE.map((k) => {
          const i = ITEMS.find((x) => x.key === k)!;
          return (
            <button key={k} type="button" className={view === k ? "is-on" : ""} onClick={() => go(k)}>
              <GameIcon name={i.icon} /><span>{i.label}</span>{badges[k] ? <i className="hud-badge">{badges[k]}</i> : null}
            </button>
          );
        })}
        <button type="button" className={more ? "is-on" : ""} aria-expanded={more} onClick={() => setMore((m) => !m)}><GameIcon name="guide" /><span>{tl("更多")}</span></button>
      </nav>
      {more && (
        <div className="hud-more" role="dialog" aria-label={tl("更多")} onClick={() => setMore(false)}>
          <div className="hud-more__sheet" onClick={(e) => e.stopPropagation()}>{ITEMS.filter((i) => !PHONE.includes(i.key)).map(nav)}</div>
        </div>
      )}
    </main>
  );
}

/** Plays the observatory theme on every page except the star map (its own music) and the story (reading is quiet). */
function ObservatoryMusic({ quiet }: { quiet?: boolean }) {
  useMusic(quiet ? null : "observatory");
  return null;
}

function Res({ icon, label, value, tone, className, onClick }: { icon: IconName; label: string; value: string; tone?: "gold"; className?: string; onClick?: () => void }) {
  const inner = (<><span className="hud-res__ico"><GameIcon name={icon} /></span><span><small>{label}</small><b>{value}</b></span></>);
  const cls = `hud-res${tone ? ` hud-res--${tone}` : ""}${className ? ` ${className}` : ""}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

/** A sound button: click to switch it on or off; hover (or focus) to drag the volume. */
function VolumeControl({ kind, on, onToggle }: { kind: "sfx" | "music"; on: boolean; onToggle: () => void }) {
  const [level, setLevel] = useVolume(kind);
  const label = kind === "sfx" ? tl("音效") : tl("音樂");
  const audible = on && level > 0;
  const icon = kind === "music"
    ? (audible ? <Music2 aria-hidden="true" /> : <Music aria-hidden="true" className="is-off" />)
    : (!audible ? <VolumeX aria-hidden="true" /> : level < 0.5 ? <Volume1 aria-hidden="true" /> : <Volume2 aria-hidden="true" />);
  return (
    <div className={`v3-vol${audible ? "" : " is-off"}`}>
      <button type="button" className="hud-icon" onClick={onToggle} aria-pressed={on} aria-label={on ? tl("關閉{0}", { 0: label }) : tl("開啟{0}", { 0: label })}>{icon}</button>
      <div className="v3-vol__pop">
        <span>{label}</span>
        <input type="range" min={0} max={100} step={1} value={Math.round(level * 100)} aria-label={tl("{0}音量", { 0: label })} style={{ ["--v" as string]: `${Math.round(level * 100)}%` }}
          onChange={(e) => { setLevel(Number(e.target.value) / 100); if (!on) onToggle(); }}
          onPointerUp={() => { if (kind === "sfx") play("click"); }} />
        <b>{audible ? Math.round(level * 100) : 0}</b>
      </div>
    </div>
  );
}
