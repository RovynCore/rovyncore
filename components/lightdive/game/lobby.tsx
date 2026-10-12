"use client";

// The Observatory: announcements and events, the Signal-Keeper, today's limits, the first-voyage
// quest and today's sky. It deliberately shows no fleet, asset or treasury details: those pages own them.
import { useEffect, useState } from "react";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { coordinate } from "@/lib/lightdive";
import { ATTRIBUTE, ATTRIBUTE_COLOR, DEPTH } from "@/lib/lightdive-copy";
import type { Announcement } from "@/lib/lightdive-announcements";
import { FAUCET_ETH, G, L, NAV } from "@/lib/lightdive-game-copy";
import type { Derived, Game, KeeperState, View } from "./game";
import { GameIcon } from "./icon";
import { Panel } from "./hud";
import { sfx } from "./sound";
import { countdown } from "./use-game";
import { fill, useT } from "./ui";

const EARLY_WINDOW = 48 * 3600;

export function Lobby({ g, d, keeper, go }: { g: Game; d: Derived; keeper: KeeperState; go: (v: View) => void }) {
  const { t } = useT();
  const o = g.data.overview!;
  const allSeekers = [...d.seekers, ...g.data.teams.flatMap((tm) => tm.seekers)];
  const sky = DEPTH.map((roman, i) => {
    const coord = coordinate(o.today, i);
    return { i, roman, coord, attuned: allSeekers.filter((s) => s.attributes.trait === coord.attribute).length };
  });
  const best = allSeekers.length ? sky.reduce((a, b) => (b.attuned > a.attuned || (b.attuned === a.attuned && b.attuned > 0 && b.i > a.i) ? b : a)) : null;

  return (
    <div className="hud-page hud-lobby">
      <section className="hud-panel hud-hero">
        <div className="hud-hero__copy">
          <span className="hud-kicker"><GameIcon name="overview" />{new Date(o.today * 86_400_000).toISOString().slice(0, 10)} · {t(L.lobbyKicker)}</span>
          <h1>{t(L.lobbyTitle).split("，")[0]}{t(L.lobbyTitle).includes("，") ? <>，<span>{t(L.lobbyTitle).split("，")[1]}</span></> : null}</h1>
          <p>{t(L.lobbyLead)}</p>
          <div className="hud-sky" aria-label={t(L.sky)}>
            {sky.map((s) => (
              <div key={s.i} className={`hud-coord${best && best.i === s.i && best.attuned > 0 ? " is-best" : ""}`} style={{ ["--c" as string]: ATTRIBUTE_COLOR[s.coord.attribute] }}>
                <i className="hud-coord__orb" />
                <b>{s.roman}</b>
                <span>{t(ATTRIBUTE[s.coord.attribute])}</span>
                <small>✦{o.depthMinLuminance[s.i]} · ×{(o.depthCoefBp[s.i] / 10_000).toFixed(2)}</small>
              </div>
            ))}
          </div>
        </div>
        <Keeper keeper={keeper} go={go} />
      </section>

      <div className="hud-lobby__grid">
        <Announcements />
        <Panel title={t(L.limits)} index="02" icon="clock">
          <ul className="hud-limits">
            <li>
              <span>{t(L.divesLeft)}</span>
              <b className="hud-num">{d.teamsReady.length}<small>/{g.data.teams.length}</small></b>
              <small>{t(L.divesNote)}</small>
            </li>
            <li>
              <span>{t(L.dayTurns)}</span>
              <b className="hud-num">{countdown(d.resetIn)}</b>
            </li>
            <li>
              <span>{t(L.summonLimit)}</span>
              <b>{t(L.summonLimitValue)}</b>
            </li>
            <li>
              <span>{t(L.earlyLimit)}</span>
              <b>{(() => {
                const start = Number(o.spireSaleStart);
                const early = start > 0 && g.now < start + EARLY_WINDOW;
                return early ? fill(t(L.earlyLeft), { n: Math.max(0, 3 - (g.data.player?.earlySpires ?? 0)) }) : t(L.earlyOver);
              })()}</b>
            </li>
          </ul>
          {d.teamsReady.length > 0 && d.canAct && (
            <button type="button" className="hud-btn hud-btn--primary hud-btn--block" onClick={() => { sfx.click(); go("dive"); }}><GameIcon name="launch" />{t(L.goDive)}</button>
          )}
        </Panel>
        <Quest g={g} d={d} go={go} />
        <Panel title={t(L.sky)} index="04" icon="expedition">
          {best && best.attuned > 0 ? (
            <div className="hud-best" style={{ ["--c" as string]: ATTRIBUTE_COLOR[best.coord.attribute] }}>
              <i className="hud-coord__orb" />
              <div>
                <span>{t(L.bestForYou)}</span>
                <b>{best.roman} · {t(ATTRIBUTE[best.coord.attribute])}</b>
                <small>{fill(t(L.bestLine), { n: best.attuned })}</small>
              </div>
            </div>
          ) : null}
          <p className="hud-note">{t(G.anomalyNote)}</p>
        </Panel>
      </div>
    </div>
  );
}

function Keeper({ keeper, go }: { keeper: KeeperState; go: (v: View) => void }) {
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
    }, 26);
    return () => window.clearInterval(timer);
  }, [keeper.line]);
  const cta = keeper.cta;
  return (
    <div className={`hud-keeper is-${keeper.mood}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/lightdive/keeper-portrait.webp" alt="" width={640} height={953} />
      <div className="hud-keeper__speech" aria-live="polite">
        <b>{t(G.keeperName)} · {t(G.keeperRole)}</b>
        <p>{typed}<span className="ldg-caret" aria-hidden="true" /></p>
        {cta && (cta.href ? (
          <a className="hud-btn hud-btn--primary" href={cta.href} target="_blank" rel="noreferrer">{cta.label}<ExternalLink aria-hidden="true" /></a>
        ) : (
          <button type="button" className="hud-btn hud-btn--primary" onClick={() => { sfx.click(); if (cta.view) go(cta.view); else cta.act?.(); }}>{cta.label}<ArrowRight aria-hidden="true" /></button>
        ))}
      </div>
    </div>
  );
}

function Announcements() {
  const { t, locale } = useT();
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [open, setOpen] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/lightdive/announcements", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ items: Announcement[] }>) : { items: [] }))
      .then((data) => alive && setItems(data.items))
      .catch(() => alive && setItems([]));
    void load();
    const timer = window.setInterval(() => void load(), 5 * 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);
  const en = locale === "en" || locale === "ko";
  const title = (a: Announcement) => (en && a.titleEn ? a.titleEn : a.title);
  const body = (a: Announcement) => (en && a.bodyEn ? a.bodyEn : a.body);
  return (
    <Panel title={t(L.news)} index="01" icon="signal" className="hud-news">
      {items === null ? (
        <p className="hud-note">{t(G.loading)}</p>
      ) : items.length === 0 ? (
        <p className="hud-empty">{t(L.noNews)}</p>
      ) : (
        <ol className="hud-news__list">
          {items.map((a, i) => (
            <li key={a.id} className={`k-${a.kind}${open === i ? " is-open" : ""}`}>
              <button type="button" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span className="hud-news__kind">{t(L.kinds[a.kind])}</span>
                <b>{title(a)}</b>
                {a.startsAt > 0 && <small>{new Date(a.startsAt * 1000).toLocaleDateString()}</small>}
              </button>
              {open === i && (body(a) || a.link) && (
                <div className="hud-news__body">
                  {body(a) && <p>{body(a)}</p>}
                  {a.link && <a href={a.link} target="_blank" rel="noreferrer">{t(L.readMore)} <ExternalLink aria-hidden="true" /></a>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function Quest({ g, d, go }: { g: Game; d: Derived; go: (v: View) => void }) {
  const { t } = useT();
  const ownsSpire = d.spires.length > 0 || g.data.teams.length > 0;
  const ownsSeeker = d.seekers.length > 0 || g.data.teams.some((tm) => tm.seekers.length > 0);
  const done = [
    d.connected,
    d.connected && d.onTestnet,
    d.connected && g.data.gas !== null && !d.noGas,
    d.hasRvyn || g.data.nfts.length > 0 || g.data.teams.length > 0,
    ownsSpire && ownsSeeker,
    g.data.teams.length > 0,
    g.data.dives.length > 0,
    g.data.dives.some((x) => x.settled),
  ];
  const next = done.indexOf(false);
  const targets: (View | "faucet" | "connect" | "switch" | null)[] = ["connect", "switch", "faucet", null, "summon", "plain", "dive", "treasury"];
  const target = next >= 0 ? targets[next] : null;
  const progress = done.filter(Boolean).length;
  return (
    <Panel title={t(L.quest)} index="03" icon="voyage" action={<span className="hud-num hud-dim">{progress}/{done.length}</span>}>
      {next === -1 ? (
        <p className="hud-empty is-done"><Check aria-hidden="true" />{t(L.questDone)}</p>
      ) : (
        <ol className="hud-quest">
          {G.onb.map((label, i) => (
            <li key={i} className={done[i] ? "is-done" : i === next ? "is-current" : ""}>
              <span className="hud-quest__dot">{done[i] ? <Check aria-hidden="true" /> : i + 1}</span>
              <span>{t(label)}</span>
              {i === next && target && (
                target === "faucet" ? (
                  <a className="hud-btn hud-btn--primary hud-btn--sm" href={FAUCET_ETH} target="_blank" rel="noreferrer">{t(G.getEth)}<ExternalLink aria-hidden="true" /></a>
                ) : target === "connect" ? (
                  <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => void g.join()}>{t(G.connect)}</button>
                ) : target === "switch" ? (
                  <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => void g.switchNetwork()}>{t(G.wrongNetwork)}</button>
                ) : (
                  <button type="button" className="hud-btn hud-btn--primary hud-btn--sm" onClick={() => { sfx.click(); go(target); }}>{t(NAV[target])}<ArrowRight aria-hidden="true" /></button>
                )
              )}
              {i === next && i === 3 && <small className="hud-dim">{t(G.kNoRvyn)}</small>}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
