"use client";

// 個人檔案 (10-19, grown out of 航海紀錄): who this observer is (the representative title, the best card, the career
// in numbers), the honorary titles, the footprints (two story fragments per destination, opened by the results
// collected there) and this week's boards. Anyone's profile can be opened: in the live game the boards and the dive
// log link to other wallets, and a profile has a link of its own to share. Honour only: nothing here pays anything,
// and nothing ranks earnings.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Copy, Lock } from "lucide-react";
import { DESTINATIONS } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { FOOTPRINTS, FOOTPRINT_UNLOCK } from "@/lib/lightdive-v3/footprints";
import { gameLocale, tl } from "@/lib/lightdive-v3/i18n";
import { PageHead } from "../game/hud";
import { Tile } from "./kit";
import { CardFace, Foil } from "./cards";
import { CIRCLED, CLUSTER_HUE, OUTCOME, OUTCOME_TONE, SLOT, fmt } from "./copy";
import { dayOf, owned, type FeedRow, type Sim, type SimDive, type SimState } from "./sim";

const DAY = 86_400_000;
const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;
const SEEN_KEY = "lightdive:v3:footprints-seen";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Results the player has collected (the only ones that count here). */
const done = (d: SimDive) => !!d.result && !d.pending;

export type Records = {
  dives: number;
  visited: number[]; // collected results per destination
  places: number;
  deepest: number | null;
  bestMult: number;
  legends: number;
  greats: number;
  streak: number;
  // v3.1
  deepDives: number;
  deepLegends: number;
  turnedBack: number;
  maxBond: number;
  supplyDays: number; // longest run of days with a supply on every departure
  commissions: number;
  // the profile
  brought: number; // $RVYN brought back, after departure costs
  summons: number;
  since: number | null; // the first summon or departure (ms)
};

export function recordsOf(sim: Sim): Records {
  return recordsFrom(sim.state!, sim.today);
}

/** The records of any observer's state (one's own, or a public profile read from the chain). */
export function recordsFrom(s: SimState, today: number): Records {
  const list = s.dives.filter(done);
  const visited = Array.from({ length: 24 }, (_, i) => list.filter((d) => d.dest === i).length);
  const days = new Set(s.dives.map((d) => dayOf(d.at)));
  // consecutive days with a departure, ending today (or yesterday, while today has none yet)
  let streak = 0;
  for (let day = days.has(today) ? today : today - 1; days.has(day); day--) streak++;
  // days on which every departure carried a supply, and the longest run of them
  const supplied = new Set([...days].filter((day) => s.dives.filter((d) => dayOf(d.at) === day).every((d) => (d.supply ?? 0) > 0)));
  let supplyDays = 0;
  for (const day of supplied) { let n = 0; while (supplied.has(day - n)) n++; supplyDays = Math.max(supplyDays, n); }
  const bit3 = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
  const starts = [...s.dives.map((d) => d.at), ...(s.pulls ?? []).map((p) => p.at), ...s.mints.map((m) => m.at)].filter((x) => x > 0);
  return {
    dives: list.length,
    visited,
    places: visited.filter((n) => n > 0).length,
    deepest: list.length ? Math.max(...list.map((d) => d.dest)) : null,
    bestMult: list.reduce((a, d) => Math.max(a, d.result!.multX100), 0),
    legends: list.filter((d) => d.result!.outcome === "legend").length,
    greats: list.filter((d) => d.result!.outcome === "great" || d.result!.outcome === "legend").length,
    streak,
    deepDives: list.filter((d) => d.deep).length,
    deepLegends: list.filter((d) => d.deep && !d.turnedBack && d.result!.outcome === "legend").length,
    turnedBack: list.filter((d) => d.turnedBack).length,
    maxBond: Math.max(0, ...s.teams.map((t) => t.bond ?? 0), ...s.dives.map((d) => d.bond ?? 0)),
    supplyDays,
    commissions: s.commissionsDone ?? Object.values(s.commissionMarks ?? {}).reduce((a, m) => a + bit3(m), 0),
    brought: list.reduce((a, d) => a + (d.reward ?? 0), 0),
    summons: (s.pulls ?? []).length + s.mints.length,
    since: starts.length ? Math.min(...starts) : null,
  };
}

/** How many footprint fragments are open: the count drives the menu badge. */
export function openFootprints(r: Records) {
  return FOOTPRINTS.filter((f) => r.visited[f.dest] >= FOOTPRINT_UNLOCK[f.n - 1]).length;
}
export function unseenFootprints(r: Records) {
  let seen = 0;
  try { seen = Number(localStorage.getItem(SEEN_KEY)) || 0; } catch {}
  return Math.max(0, openFootprints(r) - seen);
}

/** A title; `rank` orders them by how hard they are (the highest earned one represents the observer). */
type Title = { name: string; how: string; got: boolean; rank: number };
function titlesOf(r: Records): Title[] {
  const deepCluster = r.deepest === null ? -1 : DESTINATIONS[r.deepest].cluster;
  const cluster = (c: number, name: string, rank: number) => ({ name, how: tl("在 {0} {1} 收下結果", { 0: CIRCLED[c], 1: TEXTS.clusters[c].name }), got: deepCluster >= c, rank });
  return [
    { name: tl("初航者"), how: tl("收下第一趟結果"), got: r.dives > 0, rank: 1 },
    cluster(1, tl("礁海常客"), 2),
    cluster(2, tl("碑影行者"), 3),
    cluster(3, tl("霧中人"), 4),
    cluster(4, tl("裂光倖存者"), 6),
    cluster(5, tl("星冠見證者"), 8),
    { name: tl("傳說帶回者"), how: tl("帶回一次傳說"), got: r.legends > 0, rank: 7 },
    { name: tl("恆光航者"), how: tl("連續 7 天出航"), got: r.streak >= 7, rank: 6 },
    { name: tl("二十四地"), how: tl("二十四個目的地都去過"), got: r.places >= 24, rank: 9 },
    // v3.1
    { name: tl("深淵初探"), how: tl("完成第一趟深潛"), got: r.deepDives > 0, rank: 3 },
    { name: tl("深淵帶光者"), how: tl("深潛帶回一次傳說"), got: r.deepLegends > 0, rank: 9 },
    { name: tl("知進退"), how: tl("深潛時選擇回航一次"), got: r.turnedBack > 0, rank: 3 },
    { name: tl("同舟"), how: tl("一支隊伍的默契達到 5"), got: r.maxBond >= 5, rank: 5 },
    { name: tl("有備而行"), how: tl("連續 7 天，每一趟出發都帶補給"), got: r.supplyDays >= 7, rank: 5 },
    { name: tl("受託人"), how: tl("完成 10 個每日委託"), got: r.commissions >= 10, rank: 4 },
    { name: tl("老練受託人"), how: tl("完成 50 個每日委託"), got: r.commissions >= 50, rank: 7 },
  ];
}

/** The representative title: the hardest one earned (a newcomer has none). */
export function bestTitle(r: Records): string | null {
  const got = titlesOf(r).filter((t) => t.got).sort((a, b) => b.rank - a.rank);
  return got[0]?.name ?? null;
}

type Row = { who: string; owner?: string; me: boolean; dives: number; deepest: number; best: number; legends: number };

/** This week's boards: everyone's dives of the last 7 days, the player's own added from state. */
function boardsOf(sim: Sim): Row[] {
  const s = sim.state!;
  const since = (sim.today - 6) * DAY;
  const by = new Map<string, Row>();
  const add = (who: string, me: boolean, owner: string | undefined, r: Pick<FeedRow, "dest" | "outcome" | "mult">) => {
    const row = by.get(who) ?? { who, owner, me, dives: 0, deepest: -1, best: 0, legends: 0 };
    row.dives += 1;
    row.deepest = Math.max(row.deepest, r.dest);
    row.best = Math.max(row.best, r.mult ?? 0);
    if (r.outcome === "legend") row.legends += 1;
    by.set(who, row);
  };
  for (const o of sim.week) if (o.at >= since) add(o.who, false, o.owner, o);
  for (const d of s.dives) if (d.at >= since) add(tl("你"), true, undefined, { dest: d.dest, outcome: d.result?.outcome, mult: d.result?.multX100 });
  return [...by.values()];
}

/** The address whose profile the page shows: `#logbook=0x…` (anyone's, live game), otherwise the player's own. */
function useProfileAddress(): string | null {
  const read = () => {
    if (typeof window === "undefined") return null;
    const m = window.location.hash.match(/^#logbook=(0x[0-9a-fA-F]{40})$/);
    return m ? m[1] : null;
  };
  const [address, setAddress] = useState<string | null>(read);
  useEffect(() => {
    const sync = () => setAddress(read());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return address;
}

/** Opens someone's profile (live game) or one's own. */
export function openProfile(address?: string) {
  window.location.hash = address ? `logbook=${address}` : "logbook";
}

export function Logbook({ sim }: { sim: Sim }) {
  const address = useProfileAddress();
  const me = sim.chain?.account ?? null;
  const other = address && (!me || address.toLowerCase() !== me.toLowerCase()) ? address : null;
  const [theirs, setTheirs] = useState<{ address: string; state: SimState | null } | null>(null);
  const loadProfile = sim.chain?.profile;
  useEffect(() => {
    if (!other || !loadProfile) return;
    let dead = false;
    void loadProfile(other).then((state) => { if (!dead) setTheirs({ address: other, state }); });
    return () => { dead = true; };
  }, [other, loadProfile]);
  if (other) {
    const loaded = theirs?.address === other ? theirs : null;
    return (
      <div className="hud-page v3-logbook">
        {/* a visitor without a wallet (or before their own profile opens) goes back to the observatory instead */}
        <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm v3-profile__back" onClick={() => { if (me && sim.state?.dives.some((d) => d.result && !d.pending)) openProfile(); else window.location.hash = "lobby"; }}>
          <ArrowLeft aria-hidden="true" />{me && sim.state?.dives.some((d) => d.result && !d.pending) ? tl("回到我的檔案") : tl("回到觀測站")}
        </button>
        {!sim.chain ? <p className="v3-muted">{tl("預覽模式裡的其他觀測者是模擬的，沒有個人檔案。")}</p>
          : !loaded ? <p className="v3-muted">{tl("從鏈上讀取 {0} 的檔案…", { 0: short(other) })}</p>
            : !loaded.state ? <p className="v3-error">{tl("讀不到這個錢包的檔案，請稍後再試。")}</p>
              : <ProfileBody sim={sim} s={loaded.state} address={other} mine={false} />}
      </div>
    );
  }
  return (
    <div className="hud-page v3-logbook">
      <ProfileBody sim={sim} s={sim.state!} address={me} mine />
    </div>
  );
}

function ProfileBody({ sim, s, address, mine }: { sim: Sim; s: SimState; address: string | null; mine: boolean }) {
  const r = recordsFrom(s, sim.today);
  const titles = titlesOf(r).sort((a, b) => Number(b.got) - Number(a.got) || b.rank - a.rank);
  const best = bestTitle(r);
  const rows = useMemo(() => (mine ? boardsOf(sim) : []), [sim, mine]);
  const opened = openFootprints(r);
  // opening one's own profile counts every open fragment as seen (clears the menu badge)
  useEffect(() => { if (mine) { try { localStorage.setItem(SEEN_KEY, String(opened)); } catch {} } }, [opened, mine]);
  const lang = gameLocale();
  const [cluster, setCluster] = useState(0);
  const [copied, setCopied] = useState(false);
  // the card that stands for this observer: the rarest, then the strongest, still in the wallet
  const cards = s.nfts.filter((n) => owned(n) && !n.soldAt);
  const top = [...cards].sort((a, b) => b.rarity - a.rarity || b.power - a.power)[0];
  const share = async () => {
    if (!address) return;
    try { await navigator.clipboard.writeText(`https://www.rovyncore.com/game/lightdive#logbook=${address}`); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <>
      <PageHead kicker={tl("個人檔案")} icon="voyage" title={mine ? tl("個人檔案") : tl("觀測者 {0}", { 0: address ? short(address) : "" })}
        lead={mine ? tl("你走過的地方、拿到的稱號、最強的卡，和每個目的地的故事。這一頁只記榮譽，不影響任何收益。") : tl("這位觀測者在鏈上的公開紀錄。")} />

      <section className="v3-panel v3-profile">
        <div className="v3-profile__card">
          {top ? <Foil rarity={top.rarity}><CardFace n={top} size="md" /></Foil> : <span className="v3-profile__nocard">{tl("還沒有卡")}</span>}
        </div>
        <div className="v3-profile__id">
          <small>{mine ? tl("我的代表稱號") : tl("代表稱號")}</small>
          <b className={best ? "is-title" : "is-none"}>{best ?? tl("還沒有稱號")}</b>
          <span>{address ? short(address) : tl("預覽模式")}{r.since ? tl(" · {0} 起出航", { 0: new Date(r.since).toISOString().slice(0, 10) }) : ""}</span>
          {mine && address && (
            <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={share}><Copy aria-hidden="true" />{copied ? tl("已複製連結") : tl("複製我的檔案連結")}</button>
          )}
          <p className="v3-muted">{mine ? tl("代表稱號是你拿到的稱號裡最難的一個，會顯示在排行榜和分享圖上。") : tl("代表稱號是這位觀測者拿到的稱號裡最難的一個。")}</p>
        </div>
        <div className="v3-tiles is-4 v3-profile__tiles">
          <Tile label={tl("收下的結果")} value={r.dives} sub={tl("趟")} />
          <Tile label={tl("到過的目的地")} value={`${r.places} / 24`} />
          <Tile label={tl("最深到達")} value={r.deepest === null ? "—" : `${CIRCLED[DESTINATIONS[r.deepest].cluster]}${SLOT[DESTINATIONS[r.deepest].slot]}`} sub={r.deepest === null ? undefined : destName(r.deepest)} tone="#3de7e0" />
          <Tile label={tl("最高倍率")} value={r.bestMult ? `×${(r.bestMult / 100).toFixed(2)}` : "—"} tone="#f0c766" />
          <Tile label={tl("傳說")} value={r.legends} sub={tl("大豐收以上 {0} 次", { 0: r.greats })} tone="#fff4d6" />
          <Tile label={tl("連續出航")} value={tl("{0} 天", { 0: r.streak })} />
          <Tile label={tl("召喚次數")} value={r.summons} />
          <Tile label={tl("完成的委託")} value={r.commissions} />
        </div>
        {mine && <p className="v3-muted v3-profile__note">{tl("累計帶回 {0} $RVYN（已扣出發成本）。收益的細節在金庫。", { 0: fmt(r.brought) })}</p>}
      </section>

      <section className="v3-panel">
        <h3>{tl("稱號")} <em>{titles.filter((t) => t.got).length}/{titles.length}</em></h3>
        <ul className="v3-titles">
          {titles.map((t) => (
            <li key={t.name} className={`${t.got ? "is-got" : ""}${t.name === best ? " is-best" : ""}`}>
              <b>{t.got ? t.name : <><Lock aria-hidden="true" />{t.name}</>}</b>
              <small>{t.how}</small>
            </li>
          ))}
        </ul>
      </section>

      <section className="v3-panel v3-footprints">
        <h3>{tl("足跡")} <em>{opened}/{FOOTPRINTS.length}</em></h3>
        <p className="v3-muted">{tl("在一個目的地第一次收下結果，會打開那裡的第一段故事；收下 {0} 次，打開第二段。", { 0: FOOTPRINT_UNLOCK[1] })}</p>
        <div className="v3-footprints__tabs" role="tablist">
          {TEXTS.clusters.map((c, i) => {
            const n = FOOTPRINTS.filter((f) => DESTINATIONS[f.dest].cluster === i && r.visited[f.dest] >= FOOTPRINT_UNLOCK[f.n - 1]).length;
            return (
              <button key={i} type="button" role="tab" aria-selected={cluster === i} className={cluster === i ? "is-on" : ""} style={{ ["--hue" as string]: CLUSTER_HUE[i] }} onClick={() => setCluster(i)}>
                {CIRCLED[i]} {c.name}<small>{n}/8</small>
              </button>
            );
          })}
        </div>
        <div className="v3-footprints__list">
          {DESTINATIONS.filter((d) => d.cluster === cluster).map((d) => (
            <article key={d.id} style={{ ["--hue" as string]: CLUSTER_HUE[d.cluster] }}>
              <header>
                <b>{SLOT[d.slot]} {destName(d.id)}</b>
                <small>{r.visited[d.id] ? tl("收下 {0} 次", { 0: r.visited[d.id] }) : tl("還沒去過")}</small>
              </header>
              {FOOTPRINTS.filter((f) => f.dest === d.id).map((f) => {
                const need = FOOTPRINT_UNLOCK[f.n - 1];
                return r.visited[d.id] >= need
                  ? <p key={f.n} className="v3-footprint">{f.text[lang]}</p>
                  : <p key={f.n} className="v3-footprint is-locked"><Lock aria-hidden="true" />{need === 1 ? tl("第一次在這裡收下結果時打開") : tl("在這裡收下 {0} 次時打開（{1}/{0}）", { 0: need, 1: r.visited[d.id] })}</p>;
              })}
            </article>
          ))}
        </div>
      </section>

      {mine && (
        <section className="v3-panel">
          <h3>{tl("本週排行")}</h3>
          <p className="v3-muted">{sim.chain ? tl("最近 7 天全服的出航。只排榮譽：出航次數、最深到達、最高倍率和傳說次數。點名字看那位觀測者的檔案。") : tl("最近 7 天全服的出航。只排榮譽：出航次數、最深到達、最高倍率和傳說次數。")}</p>
          <div className="v3-boards">
            <Board title={tl("出航最多")} rows={rows} myTitle={best} value={(x) => x.dives} show={(x) => tl("{0} 趟", { 0: x.dives })} />
            <Board title={tl("最深到達")} rows={rows.filter((x) => x.deepest >= 0)} myTitle={best} value={(x) => x.deepest} show={(x) => `${CIRCLED[DESTINATIONS[x.deepest].cluster]}${SLOT[DESTINATIONS[x.deepest].slot]} ${destName(x.deepest)}`} />
            <Board title={tl("最高倍率")} rows={rows.filter((x) => x.best > 0)} myTitle={best} value={(x) => x.best} show={(x) => `×${(x.best / 100).toFixed(2)}`} />
            <Board title={OUTCOME.legend} rows={rows.filter((x) => x.legends > 0)} myTitle={best} value={(x) => x.legends} show={(x) => tl("{0} 次", { 0: x.legends })} tone={OUTCOME_TONE.legend} />
          </div>
        </section>
      )}
    </>
  );
}

function Board({ title, rows, value, show, tone, myTitle }: { title: string; rows: Row[]; value: (r: Row) => number; show: (r: Row) => string; tone?: string; myTitle: string | null }) {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const top = sorted.slice(0, 10);
  const mine = sorted.findIndex((x) => x.me);
  const name = (x: Row) => (
    x.owner ? <button type="button" className="v3-board__who" onClick={() => openProfile(x.owner)}>{x.who}</button>
      : <span>{x.who}{x.me && myTitle ? <em className="v3-board__title">{myTitle}</em> : null}</span>
  );
  return (
    <div className="v3-board" style={tone ? { ["--tone" as string]: tone } : undefined}>
      <b>{title}</b>
      {!top.length ? <p className="v3-muted">{tl("這週還沒有紀錄。")}</p> : (
        <ol>
          {top.map((x, i) => <li key={x.who} className={x.me ? "is-me" : ""}><i>{i + 1}</i>{name(x)}<em>{show(x)}</em></li>)}
          {mine >= 10 && <li className="is-me is-far"><i>{mine + 1}</i>{name(sorted[mine])}<em>{show(sorted[mine])}</em></li>}
        </ol>
      )}
    </div>
  );
}
