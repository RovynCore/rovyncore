"use client";

// Summon: three banners stacked top to bottom (spire, prism, seeker), then a full-screen pull: the circle charges
// while the signal comes in, a pillar of light in the colour of the best card, and the cards dealt face down.
import { useEffect, useRef, useState } from "react";
import type { SummonFx } from "./summon-fx";
import { Sparkles } from "lucide-react";
import { DESTINATIONS, DIVES_PER_DAY, ODDS_BP, POWER, PRICE, PRICE_CEILING, PRICE_FLOOR, RENEW_SHARE, VOYAGES, type Kind } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { NftArt } from "../game/art";
import { PageHead } from "../game/hud";
import { play } from "./audio";
import { SummonFeed } from "./feeds";
import { SummonHistory } from "./history";
import { fxQuality } from "./settings";
import { owned, type Sim, type SimNft } from "./sim";
import { RarityGem, RarityTag, Trait, Voyages, traitName } from "./kit";
import { NftDetail } from "./assets";
import { CardSupply } from "./supply";
import { BEAM, CIRCLED, ERROR, KIND, LIGHT, LIGHT_COLOR, RARITY_COLOR, SLOT, TIER, clock, fmt } from "./copy";
import { tl, localized } from "@/lib/lightdive-v3/i18n";

/** Banner art per kind. Drop the final images into public/lightdive/summon/ and set the paths here;
 *  until then each banner is composed from its top cards over a Hubble photo. */
const BANNER_ART: Record<Kind, string | null> = { 0: null, 1: null, 2: null };
const BANNER_PHOTO: Record<Kind, string> = { 0: "/lightdive/space/galaxy.jpg", 1: "/lightdive/space/cluster-3.jpg", 2: "/lightdive/space/cluster-2.jpg" };
const ACCENT: Record<Kind, string> = { 0: "#f0c766", 1: "#7fd3ff", 2: "#c9ff55" };
const TITLE: Record<Kind, [string, string]> = localized({
  0: ["光塔召喚", "SPIRE"],
  1: ["稜鏡召喚", "PRISM"],
  2: ["探索者召喚", "SEEKER"],
});
const PITCH: Record<Kind, string> = localized({
  0: "隊伍的基地。稀有度越高，泊位越多：微光 1 位，曜核 5 位。",
  1: "裝在光塔頂端，決定隊伍的風險風格：廣域求穩、聚焦標準、針芒求搏。",
  2: "坐上光塔出發的人。六種光紋，和目的地同頻時帶回更多。",
});
const PULLS = [1, 5, 10];
const STEP = 420;

type Pull = { id: number; kind: Kind; qty: number };

export function Summon({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const [pull, setPull] = useState<Pull | null>(null);
  const [hidden, setHidden] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const start = (kind: Kind, qty: number) => {
    const r = sim.mint(kind, qty);
    if (r.error || r.id === undefined) { setMsg(ERROR[r.error ?? "balance"]); return; }
    setMsg(null);
    setPull({ id: r.id, kind, qty });
    setHidden(false);
    play("summon");
  };
  const ready = pull && !s.mints.some((m) => m.id === pull.id);
  const recent = s.nfts.filter((n) => n.mint !== undefined).slice(-12).reverse();
  return (
    <div className="hud-page v3-summonpage">
      <PageHead kicker={tl("召喚")} icon="summon" title={tl("召喚")} lead={tl("用 $RVYN 申請召喚，幾秒後隨機訊號公開就能揭曉。所有機率公開。")}
        side={<SummonFeed sim={sim} />} />
      {msg && <p className="v3-error" role="alert">{msg}</p>}
      {pull && hidden && (
        <button type="button" className={`v3-pullbar${ready ? " is-ready" : ""}`} onClick={() => setHidden(false)}>
          <Sparkles aria-hidden="true" />
          {ready ? tl("{0} ×{1} 已揭曉，點這裡翻牌", { 0: KIND[pull.kind], 1: pull.qty }) : tl("召喚陣啟動中：{0} ×{1}，回到召喚陣", { 0: KIND[pull.kind], 1: pull.qty })}
        </button>
      )}
      <div className="v3-banners">
        {([0, 1, 2] as Kind[]).map((k) => <Banner key={k} sim={sim} kind={k} busy={!!pull} onPull={(q) => start(k, q)} />)}
      </div>
      <CardSupply sim={sim} />
      {recent.length > 0 && (
        <section className="v3-recent">
          <h3>{tl("最近召喚")}</h3>
          <ul>
            {recent.map((n) => (
              <li key={n.id} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
                <button type="button" onClick={() => setInspect(n.id)} aria-label={tl("{0} #{1}，查看資料", { 0: KIND[n.kind], 1: n.id })}>
                  <span className="v3-recent__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
                  <RarityTag rarity={n.rarity} compact />
                  <b>{KIND[n.kind]} #{n.id}</b>
                  <small>{tl("戰力 {0}", { 0: n.power })}</small>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <SummonHistory sim={sim} onInspect={setInspect} />
      {pull && !hidden && (
        <PullScreen key={pull.id} sim={sim} pull={pull}
          onInspect={setInspect}
          onHide={() => setHidden(true)}
          onDone={() => setPull(null)}
          onAgain={() => { const p = pull; setPull(null); start(p.kind, p.qty); }} />
      )}
      {/* full card data, above the pull overlay (a sibling of it, so nothing traps the fixed dialog) */}
      {inspect !== null && <NftDetail sim={sim} id={inspect} onClose={() => setInspect(null)} onMsg={setMsg} />}
    </div>
  );
}

function Banner({ sim, kind, busy, onPull }: { sim: Sim; kind: Kind; busy: boolean; onPull: (qty: number) => void }) {
  const s = sim.state!;
  const mine = s.nfts.filter((n) => n.kind === kind && owned(n));
  const top = mine.reduce((a, n) => Math.max(a, n.rarity), -1);
  const art = BANNER_ART[kind];
  return (
    <section className={`v3-banner k${kind}`} style={{ ["--accent" as string]: ACCENT[kind], ["--photo" as string]: `url(${BANNER_PHOTO[kind]})` }}>
      <div className="v3-banner__art">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" />
        ) : (
          <div className="v3-banner__cards" aria-hidden="true">
            <span className="is-back is-l"><NftArt a={{ kind, rarity: 2, trait: kind === 0 ? 3 : kind === 1 ? 0 : 2, variant: 1 }} /></span>
            <span className="is-back is-r"><NftArt a={{ kind, rarity: 3, trait: kind === 0 ? 4 : kind === 1 ? 2 : 4, variant: 2 }} /></span>
            <span className="is-main"><NftArt a={{ kind, rarity: 4, trait: kind === 0 ? 5 : 1, variant: 0 }} /></span>
          </div>
        )}
        <span className="v3-banner__dust" aria-hidden="true" />
        <div className="v3-banner__title">
          <small>LIGHTDIVE · {TITLE[kind][1]}</small>
          <h2>{TITLE[kind][0]}</h2>
          <p>{PITCH[kind]}</p>
        </div>
      </div>
      <div className="v3-banner__side">
        <div className="v3-banner__price">
          <small>{tl("單抽價格")}</small>
          <b>{fmt(PRICE[kind])}</b><em>$RVYN</em>
          <span>{tl("每天依流動池均價調整，範圍 {0}", { 0: PRICE[kind] * PRICE_FLOOR })}–{PRICE[kind] * PRICE_CEILING}</span>
        </div>
        <ul className="v3-droprates">
          {[4, 3, 2, 1, 0].map((r) => (
            <li key={r} style={{ ["--rc" as string]: RARITY_COLOR[r] }}>
              <RarityGem rarity={r} size={20} />
              <b>{TIER[r]}</b>
              <small>{kind === 0 ? tl("{0} 泊位 · ", { 0: r + 1 }) : ""}{tl("戰力 {0}", { 0: POWER[kind][r][0] })}–{POWER[kind][r][1]}</small>
              <em>{(ODDS_BP[kind][r] / 100).toFixed(ODDS_BP[kind][r] % 100 ? 1 : 0)}%</em>
            </li>
          ))}
        </ul>
        <div className="v3-banner__pulls">
          {PULLS.map((q) => (
            <button key={q} type="button" className={`v3-pullbtn${q > 1 ? " is-multi" : ""}`} disabled={busy || s.balance < PRICE[kind] * q} onClick={() => onPull(q)}>
              <span>{tl("召喚 ×{0}", { 0: q })}</span>
              <small>{fmt(PRICE[kind] * q)} $RVYN</small>
            </button>
          ))}
        </div>
        <p className="v3-banner__own">{tl("持有")} <b>{mine.length}</b>{top >= 0 && <> {tl("· 最高")} <b style={{ color: RARITY_COLOR[top] }}>{TIER[top]}</b></>}</p>
      </div>
    </section>
  );
}

/** The pull itself, full screen. */
function PullScreen({ sim, pull, onInspect, onHide, onDone, onAgain }: { sim: Sim; pull: Pull; onInspect: (id: number) => void; onHide: () => void; onDone: () => void; onAgain: () => void }) {
  const s = sim.state!;
  const req = s.mints.find((m) => m.id === pull.id);
  const cards = s.nfts.filter((n) => n.mint === pull.id);
  const ready = !req && cards.length > 0;
  const best = cards.reduce((a, n) => Math.max(a, n.rarity), 0);
  const [phase, setPhase] = useState<"beam" | "cards">("beam");
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [shake, setShake] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  // the tier climb after the signal arrives: 微光 → … → best, one step every STEP ms (the rarity tell)
  const [step, setStep] = useState(0);
  const climbed = ready && step >= best;
  // WebGL magic circle behind the overlay; the CSS circle stays as the fallback
  const fxHost = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLDivElement>(null);
  const fx = useRef<SummonFx | null>(null);
  const pending = useRef<{ progress: number; reveal?: [string, number] }>({ progress: 0 });
  const [gl, setGl] = useState(false);
  useEffect(() => {
    let dead = false;
    const host = fxHost.current;
    const q = fxQuality();
    if (!host || q === "low") return;
    const lite = q === "standard" || window.innerWidth < 760 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const anchor = () => {
      const el = circleRef.current;
      if (!el) return null;
      const a = el.getBoundingClientRect(), b = host.getBoundingClientRect();
      return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, r: a.width / 2 };
    };
    import("./summon-fx").then((m) => m.createSummonFx(host, ACCENT[pull.kind], anchor, lite)).then((f) => {
      if (dead) { f.destroy(); return; }
      fx.current = f;
      f.charge(pending.current.progress);
      if (pending.current.reveal) f.reveal(...pending.current.reveal);
      setGl(true);
    }).catch(() => {});
    return () => { dead = true; fx.current?.destroy(); fx.current = null; };
  }, [pull.kind]);

  useEffect(() => {
    if (!ready) return;
    const timers: number[] = [];
    for (let i = 1; i <= best; i++) {
      timers.push(window.setTimeout(() => {
        setStep(i);
        if (i < best) { fx.current?.tell(RARITY_COLOR[i], i); play("click"); }
      }, i * STEP));
    }
    timers.push(window.setTimeout(() => play(best >= 4 ? "legend" : best >= 3 ? "great" : best >= 2 ? "good" : "normal"), best * STEP));
    timers.push(window.setTimeout(() => setPhase("cards"), best * STEP + (best >= 3 ? 2600 : 1700)));
    return () => timers.forEach((x) => window.clearTimeout(x));
  }, [ready, best]);

  const flip = (n: SimNft) => {
    setOpen((o) => (o.has(n.id) ? o : new Set(o).add(n.id)));
    setFocus(n.id);
    play(n.rarity >= 4 ? "legend" : n.rarity >= 3 ? "great" : n.rarity >= 2 ? "good" : "click");
    if (n.rarity >= 3) {
      setShake(true);
      window.setTimeout(() => setShake(false), 520);
    }
  };
  const flipAll = () => {
    const rest = cards.filter((n) => !open.has(n.id));
    rest.forEach((n, i) => window.setTimeout(() => flip(n), i * 220));
    // when everything is open, show the best card of the pull
    const top = [...cards].sort((a, b) => b.rarity - a.rarity || b.power - a.power)[0];
    if (top) window.setTimeout(() => setFocus(top.id), rest.length * 220 + 60);
  };
  const focused = cards.find((n) => n.id === focus && open.has(n.id));
  const allOpen = cards.length > 0 && cards.every((n) => open.has(n.id));
  const progress = req ? Math.min(1, (sim.now - req.at) / Math.max(1, req.revealAt - req.at)) : 1;
  const counts = [4, 3, 2, 1, 0].map((r) => ({ r, c: cards.filter((n) => n.rarity === r).length })).filter((x) => x.c);
  const cost = PRICE[pull.kind] * pull.qty;
  const phaseName = !ready ? "charge" : phase;
  useEffect(() => {
    pending.current.progress = progress;
    fx.current?.charge(progress);
  }, [progress]);
  useEffect(() => {
    if (!climbed) return;
    pending.current.reveal = [RARITY_COLOR[best], best];
    fx.current?.reveal(RARITY_COLOR[best], best);
  }, [climbed, best]);
  const shown = ready ? Math.min(step, best) : 0;
  useEffect(() => {
    if (phase === "cards") fx.current?.settle();
  }, [phase]);

  return (
    <div className={`v3-pull is-${phaseName}${shake ? " is-shake" : ""}${gl ? " has-gl" : ""}${climbed ? " is-climbed" : ""}`} role="dialog" aria-label={tl("召喚 {0} ×{1}", { 0: KIND[pull.kind], 1: pull.qty })} style={{ ["--rc" as string]: RARITY_COLOR[climbed ? best : shown], ["--accent" as string]: ACCENT[pull.kind] }}>
      <div className="v3-pull__sky" aria-hidden="true" />
      <div className="v3-pull__fx" ref={fxHost} aria-hidden="true" />
      {phaseName !== "cards" && (
        <div className="v3-pull__stage">
          <div className="v3-pull__circle" aria-hidden="true" ref={circleRef}>
            <i /><i /><i />
            <svg viewBox="0 0 200 200">
              <circle cx="100" cy="100" r="92" className="v3-pull__track" />
              <circle cx="100" cy="100" r="92" className="v3-pull__bar" style={{ strokeDashoffset: 578 * (1 - progress) }} />
            </svg>
            <span className="v3-pull__core" />
          </div>
          {phaseName === "beam" && climbed && <span className="v3-pull__pillar" aria-hidden="true" />}
          <div className="v3-pull__text">
            <b>{phaseName === "charge" ? tl("召喚陣啟動") : tl("訊號抵達")}</b>
            <span>{KIND[pull.kind]} ×{pull.qty}</span>
            {phaseName === "beam" && (
              <ol className="v3-pull__ladder" aria-label={tl("訊號強度：{0}", { 0: TIER[shown] })}>
                {TIER.map((name, i) => (
                  <li key={name} className={`${i <= shown ? "is-on" : ""}${i === shown ? " is-now" : ""}`} style={{ ["--rc" as string]: RARITY_COLOR[i] }} />
                ))}
              </ol>
            )}
            {phaseName === "beam" && <i className="v3-pull__tier" key={shown}>{TIER[shown]}</i>}
            {phaseName === "charge" && req && <em>{clock(req.revealAt - sim.now)}</em>}
          </div>
          {phaseName === "charge" && <button type="button" className="hud-btn hud-btn--ghost" onClick={onHide}>{tl("在背景等待")}</button>}
        </div>
      )}
      {phaseName === "cards" && (
        <div className="v3-pull__deal">
          <header>
            <b>{allOpen ? tl("召喚結果") : tl("點卡片翻開")}<small>{allOpen ? tl("點任一張卡，看它的戰力、特性和航程") : tl("翻開後再點一下，就能看那張卡的資料")}</small></b>
            {!allOpen && <button type="button" className="hud-btn hud-btn--primary" onClick={flipAll}>{tl("全部翻開")}</button>}
          </header>
          <div className="v3-pull__table">
          <div className={`v3-pull__grid n${Math.min(cards.length, 10)}`}>
            {cards.map((n, i) => (
              <button key={n.id} type="button" className={`v3-pcard r${n.rarity}${open.has(n.id) ? " is-open" : ""}${focused?.id === n.id ? " is-focus" : ""}`} style={{ ["--rc" as string]: RARITY_COLOR[n.rarity], ["--i" as string]: i, ["--col" as string]: cards.length >= 5 ? i % 5 : i - (cards.length - 1) / 2 + 2 }} onClick={() => (open.has(n.id) ? setFocus(n.id) : flip(n))} aria-pressed={open.has(n.id) ? focused?.id === n.id : undefined} aria-label={open.has(n.id) ? tl("{0}{1} #{2}，戰力 {3}", { 0: TIER[n.rarity], 1: KIND[n.kind], 2: n.id, 3: n.power }) : tl("翻開這張卡")}>
                <span className="v3-pcard__inner">
                  <span className={`v3-pcard__back h${n.rarity}`}><i className="v3-pcard__seal" aria-hidden="true" /><CardBack /><small>LIGHTDIVE</small></span>
                  <span className="v3-pcard__front">
                    <span className="v3-pcard__top"><RarityTag rarity={n.rarity} compact /><small>#{n.id}</small></span>
                    <span className="v3-pcard__art"><NftArt a={{ kind: n.kind, rarity: n.rarity, trait: n.trait, variant: 0 }} /></span>
                    <b className="v3-pcard__name">{TIER[n.rarity]}{KIND[n.kind]}</b>
                    <span className="v3-pcard__pw"><small>{tl("戰力")}</small><b>{n.power}</b></span>
                    <Trait n={n} />
                  </span>
                </span>
                {open.has(n.id) && <i className="v3-pcard__burst" aria-hidden="true" />}
                {n.rarity >= 3 && open.has(n.id) && <i className="v3-pcard__flare" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <aside className="v3-pull__panel" aria-live="polite">
            {focused ? <ResultPanel key={focused.id} sim={sim} n={focused} onInspect={() => onInspect(focused.id)} /> : <p className="v3-pull__panelhint">{tl("翻開一張卡，這裡會顯示它的戰力、特性、航程和今天能去的地方。")}</p>}
          </aside>
          </div>
          {allOpen && (
            <footer className="v3-pull__summary">
              <ul>{counts.map(({ r, c }) => <li key={r} style={{ ["--rc" as string]: RARITY_COLOR[r] }}><RarityGem rarity={r} size={18} /><b>{TIER[r]}</b> ×{c}</li>)}</ul>
              <div>
                <button type="button" className="hud-btn hud-btn--ghost" disabled={s.balance < cost} onClick={onAgain}>{tl("再召喚 ×{0}（{1} $RVYN）", { 0: pull.qty, 1: cost })}</button>
                <button type="button" className="hud-btn hud-btn--primary" onClick={onDone}>{tl("收下")}</button>
              </div>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}

/** Power with where it sits in its rarity's range: the marker shows how lucky the roll was. */
function PowerRange({ n }: { n: SimNft }) {
  const [lo, hi] = POWER[n.kind][n.rarity];
  const k = hi > lo ? (n.power - lo) / (hi - lo) : 1;
  return (
    <span className="v3-pcard__power">
      <span><small>{tl("戰力")}</small><b>{n.power}</b><em>{k >= 0.85 ? tl("頂標") : k >= 0.5 ? tl("中上") : tl("一般")}</em></span>
      <span className="v3-pcard__range" aria-label={tl("{0}區間 {1}–{2}", { 0: TIER[n.rarity], 1: lo, 2: hi })}><i style={{ left: `${k * 100}%` }} /></span>
      <small className="v3-pcard__rangetext">{tl("{0}區間 {1}", { 0: TIER[n.rarity], 1: lo })}–{hi}</small>
    </span>
  );
}

/** The data of one card from the pull: everything that matters for play, and a way to the full on-chain detail. */
function ResultPanel({ sim, n, onInspect }: { sim: Sim; n: SimNft; onInspect: () => void }) {
  const attuned = n.kind === 2 ? DESTINATIONS.filter((d) => sim.sky.lights[d.id] === n.trait) : [];
  return (
    <div className="v3-result" style={{ ["--rc" as string]: RARITY_COLOR[n.rarity] }}>
      <header>
        <RarityTag rarity={n.rarity} />
        <h3>{KIND[n.kind]} <small>#{n.id}</small></h3>
      </header>
      <PowerRange n={n} />
      <dl>
        <div>
          <dt>{traitName(n.kind)}</dt>
          <dd>
            <Trait n={n} />
            <small>
              {n.kind === 0 && tl("可坐 {0} 位探索者，外加 1 面稜鏡。", { 0: n.trait })}
              {n.kind === 1 && tl("{0}稜鏡：{1}。平均倍率都相同。", { 0: BEAM[n.trait], 1: [tl("空手機率較低，大獎較小"), tl("標準的風險和報酬"), tl("空手機率較高，大獎較大")][n.trait] })}
              {n.kind === 2 && tl("今天和 {0} 個目的地同頻，在同頻的地方帶回更多。", { 0: attuned.length })}
            </small>
          </dd>
        </div>
        <div>
          <dt>{tl("航程")}</dt>
          <dd><Voyages n={n} /><small>{tl("每次出發用掉 1 趟；每天最多 {0} 次，約可用 {1} 天。", { 0: DIVES_PER_DAY, 1: Math.ceil(n.voyages / DIVES_PER_DAY) })}</small></dd>
        </div>
        <div>
          <dt>{tl("續航")}</dt>
          <dd>{tl("可續 1 次")}<small>{tl("航程用完後停泊 7 天，期間付 {0} $RVYN 可補滿 {1} 趟。", { 0: fmt(PRICE[n.kind] * RENEW_SHARE), 1: VOYAGES[n.kind] })}</small></dd>
        </div>
        {n.kind === 2 && attuned.length > 0 && (
          <div>
            <dt>{tl("今天同頻")}</dt>
            <dd className="v3-result__dests">
              {attuned.slice(0, 4).map((d) => (
                <span key={d.id} style={{ color: LIGHT_COLOR[n.trait] }}>{CIRCLED[d.cluster]}{SLOT[d.slot]} {TEXTS.clusters[d.cluster].destinations[d.slot].name}<small>{tl("門檻 {0}", { 0: d.threshold })}</small></span>
              ))}
              {attuned.length > 4 && <small>{tl("還有 {0} 個", { 0: attuned.length - 4 })}</small>}
            </dd>
          </div>
        )}
        {n.kind === 2 && <div><dt>{tl("光紋")}</dt><dd style={{ color: LIGHT_COLOR[n.trait] }}>{LIGHT[n.trait]}<small>{tl("每天的光會變，同頻的目的地也會換。")}</small></dd></div>}
      </dl>
      <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={onInspect}>{tl("完整資料（含鏈上資料）")}</button>
    </div>
  );
}

/** The back of a summoned card: a double frame with corner diamonds and the summon emblem (circle, hexagram, core). */
function CardBack() {
  const hex = (r: number, rot: number) => Array.from({ length: 3 }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / 3;
    return `${50 + Math.cos(a) * r},${50 + Math.sin(a) * r}`;
  }).join(" ");
  return (
    <svg className="v3-cardback" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="34" className="is-ring" />
      <circle cx="50" cy="50" r="29" className="is-thin" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2, l = i % 6 === 0 ? 5 : 2.5;
        return <line key={i} x1={50 + Math.cos(a) * 34} y1={50 + Math.sin(a) * 34} x2={50 + Math.cos(a) * (34 - l)} y2={50 + Math.sin(a) * (34 - l)} className="is-tick" />;
      })}
      <polygon points={hex(27, -Math.PI / 2)} className="is-star" />
      <polygon points={hex(27, Math.PI / 2)} className="is-star" />
      <circle cx="50" cy="50" r="10" className="is-thin" />
      <circle cx="50" cy="50" r="5" className="is-core" />
    </svg>
  );
}
