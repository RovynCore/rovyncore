"use client";

// 觀測牆 (G3, 10-23): everyone's voyages on one big screen, for a stream, an event or a second monitor. No wallet:
// it reads the chain like the live log does. Bridges in flight with their countdowns, the latest reveal in large, the
// reveals before it, today's numbers, the sky and the latest summons. A result shows the moment drand decides it
// (decideFeed), before anyone settles it on chain. Refreshes every 10 seconds; nothing here can be clicked to play.
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, formatEther, http } from "viem";
import { DESTINATIONS, skyOf } from "@/lib/lightdive-v3/rules";
import { TEXTS } from "@/lib/lightdive-v3/texts";
import { syncGameLocale, tl } from "@/lib/lightdive-v3/i18n";
import { useLanguage } from "@/components/language-provider";
import { destImage } from "@/lib/lightdive-v3/art";
import { gameChain } from "@/lib/lightdive-v3/deployment";
import { outcomeNameOf } from "@/lib/lightdive-v3/history";
import { decideFeed, readFeed, readRecentSummons, readWorld, roundTime, type Ctx, type FeedItem, type RecentSummon, type World } from "@/lib/lightdive-v3/onchain";
import { CIRCLED, CLUSTER_HUE, KIND, OUTCOME, OUTCOME_TONE, RARITY_COLOR, SLOT, STAR, TIER, ago, clock, fmt } from "./copy";
import { RarityGem } from "./kit";
import "./wall.css";

type Outcome = keyof typeof OUTCOME;
type Row = { id: string; owner: string; dest: number; at: number; revealAt: number; outcome?: Outcome; mult?: number; decided?: boolean; deep: boolean };
type Data = { world: World; rows: Row[]; summons: RecentSummon[] };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const destName = (id: number) => TEXTS.clusters[DESTINATIONS[id].cluster].destinations[DESTINATIONS[id].slot].name;
const where = (id: number) => `${CIRCLED[DESTINATIONS[id].cluster]}${SLOT[DESTINATIONS[id].slot]}`;
const BIG: Outcome[] = ["great", "legend"];

function rowsOf(list: FeedItem[], w: World): Row[] {
  return list.map((f) => {
    const revealAt = roundTime(f.round) * 1000;
    const span = (f.long ? w.longVoyageSeconds : w.voyageSeconds) * 1000;
    return {
      id: String(f.id), owner: f.owner, dest: f.dest, at: revealAt - span, revealAt, deep: !!f.long, decided: f.decided,
      outcome: f.tier !== undefined ? (outcomeNameOf(f.dest, f.day, f.beam, !!f.long, f.tier) as Outcome) : undefined, mult: f.multX100,
    };
  }).sort((a, b) => b.revealAt - a.revealAt);
}

/** Reads the chain every 10 seconds (and right after a bridge is due). */
function useWall() {
  const G = useMemo(() => gameChain(true), []);
  const ctx = useMemo<Ctx | null>(() => (G.contracts ? {
    client: createPublicClient({ chain: G.chain, transport: http(G.rpcUrl), cacheTime: 0 }) as never,
    c: G.contracts, abi: G.abi, fromBlock: BigInt(G.deployment.deploymentBlock), multicall: G.multicall,
  } : null), [G]);
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!ctx) return;
    try {
      const world = await readWorld(ctx, G.testToken);
      const [feed, summons] = await Promise.all([
        readFeed(ctx).then((f) => decideFeed(ctx, f, world, 60)),
        readRecentSummons(ctx, 10).catch(() => [] as RecentSummon[]),
      ]);
      setData({ world, rows: rowsOf(feed, world), summons });
      setFailed(false);
    } catch (e) {
      console.warn("lightdive wall", e);
      setFailed(true);
    }
  }, [ctx, G]);
  useEffect(() => {
    queueMicrotask(() => void load());
    const t = window.setInterval(() => void load(), 10_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { data, failed, ready: !!ctx, testnet: G.testnet, load };
}

export function LightdiveWall() {
  syncGameLocale(useLanguage().locale);
  const { data, failed, ready, testnet, load } = useWall();
  const [now, setNow] = useState(0);
  useEffect(() => {
    queueMicrotask(() => setNow(Date.now()));
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  // a bridge just came due: look again a few seconds later (drand publishes a little after the round's time)
  const due = data?.rows.filter((r) => !r.outcome && now >= r.revealAt + 3000).length ?? 0;
  useEffect(() => {
    if (!due) return;
    const t = window.setTimeout(() => void load(), 2500);
    return () => window.clearTimeout(t);
  }, [due, load]);

  // nothing in a language until mounted: the server and the first render in the browser are then the same
  if (!now) return <div className="ldw is-empty" aria-busy="true" />;
  if (!ready) return <div className="ldw is-empty"><p>{tl("合約部署中，遊戲即將開放。")}</p></div>;
  if (!data) return <div className="ldw is-empty"><p>{failed ? tl("讀不到鏈上資料，稍後會自動重試。") : tl("讀取鏈上資料…")}</p></div>;

  const day = Math.floor(now / 86_400_000);
  const sky = skyOf(day);
  const flying = data.rows.filter((r) => !r.outcome && now < r.revealAt + 60_000).sort((a, b) => a.revealAt - b.revealAt);
  const revealed = data.rows.filter((r) => r.outcome);
  const spotlight = revealed.find((r) => r.outcome && BIG.includes(r.outcome) && now - r.revealAt < 30 * 60_000) ?? revealed[0];
  const today = data.rows.filter((r) => Math.floor(r.at / 86_400_000) === day);
  const todayRevealed = today.filter((r) => r.outcome);
  const best = todayRevealed.reduce<Row | null>((a, r) => (!a || (r.mult ?? 0) > (a.mult ?? 0) ? r : a), null);
  const observers = new Set(today.map((r) => r.owner.toLowerCase())).size;
  const w = data.world;

  return (
    <div className="ldw">
      <header className="ldw__head">
        <div className="ldw__brand"><b>{tl("潛光遠征")}</b><span>{tl("觀測牆")}{testnet ? ` · ${tl("測試網")}` : ""}</span></div>
        <dl className="ldw__stats">
          <div><dt>{tl("今天出發")}</dt><dd>{today.length}</dd></div>
          <div><dt>{tl("觀測者")}</dt><dd>{observers}</dd></div>
          <div><dt>{tl("最高倍率")}</dt><dd>{best?.mult ? `×${(best.mult / 100).toFixed(2)}` : "—"}</dd></div>
          <div><dt>{tl("傳說")}</dt><dd>{todayRevealed.filter((r) => r.outcome === "legend").length}</dd></div>
          <div><dt>{tl("今日分配率")}</dt><dd>{Number(formatEther(w.rate)).toFixed(5)}</dd></div>
          <div><dt>{tl("核光池")}</dt><dd>{fmt(Number(formatEther(w.poolBalance)), 0)}</dd></div>
        </dl>
        <time className="ldw__clock">{new Date(now).toISOString().slice(11, 19)} UTC</time>
      </header>

      <section className="ldw__flying" aria-label={tl("光橋上")}>
        <h2>{tl("光橋上")} <small>{flying.length}</small></h2>
        {!flying.length && <p className="ldw__muted">{tl("現在沒有隊伍在光橋上。")}</p>}
        <ol>
          {flying.slice(0, 12).map((r) => {
            const k = Math.min(1, Math.max(0, (now - r.at) / Math.max(1, r.revealAt - r.at)));
            return (
              <li key={r.id} style={{ ["--hue" as string]: CLUSTER_HUE[DESTINATIONS[r.dest].cluster], ["--k" as string]: k }}>
                <span className="ldw__where"><b>{where(r.dest)} {destName(r.dest)}</b><small>{short(r.owner)}{r.deep ? ` · ${tl("深潛")}` : ""}</small></span>
                <em>{now < r.revealAt ? clock(r.revealAt - now) : tl("揭曉中")}</em>
                <i className="ldw__bar" aria-hidden="true"><i /></i>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="ldw__spot" aria-label={tl("最新揭曉")} aria-live="polite">
        {spotlight?.outcome ? (
          <article key={spotlight.id} className={`ldw__card is-${spotlight.outcome}`} style={{ ["--tc" as string]: OUTCOME_TONE[spotlight.outcome], ["--photo" as string]: `url(${destImage(spotlight.dest)})` }}>
            <span className="ldw__kicker">{BIG.includes(spotlight.outcome) && spotlight !== revealed[0] ? tl("今天的高光") : tl("最新揭曉")} · {ago(now - spotlight.revealAt)}</span>
            <h1>{OUTCOME[spotlight.outcome]}</h1>
            <b className="ldw__mult">×{((spotlight.mult ?? 0) / 100).toFixed(2)}</b>
            <p>{where(spotlight.dest)} {destName(spotlight.dest)} · {short(spotlight.owner)}{spotlight.deep ? ` · ${tl("深潛")}` : ""}</p>
          </article>
        ) : <p className="ldw__muted">{tl("今天還沒有揭曉的航程。")}</p>}
        <div className="ldw__sky">
          {[...sky.events].map(([dest, ev]) => (
            <span key={dest} style={{ ["--sc" as string]: STAR[ev].color }}><b>{STAR[ev].name}</b>{where(dest)} {destName(dest)}</span>
          ))}
        </div>
      </section>

      <aside className="ldw__side">
        <section aria-label={tl("剛揭曉")}>
          <h2>{tl("剛揭曉")}</h2>
          <ol className="ldw__reveals">
            {revealed.slice(0, 10).map((r) => (
              <li key={r.id} className={r.outcome && BIG.includes(r.outcome) ? "is-big" : ""} style={{ ["--tc" as string]: OUTCOME_TONE[r.outcome!] }}>
                <span><b>{OUTCOME[r.outcome!]}</b> ×{((r.mult ?? 0) / 100).toFixed(2)}</span>
                <small>{where(r.dest)} {destName(r.dest)} · {short(r.owner)}</small>
                <time>{ago(now - r.revealAt)}</time>
              </li>
            ))}
          </ol>
        </section>
        <section aria-label={tl("全服召喚動態")}>
          <h2>{tl("全服召喚動態")}</h2>
          <ol className="ldw__summons">
            {data.summons.map((x) => (
              <li key={String(x.id)} style={{ ["--rc" as string]: RARITY_COLOR[x.rarity] }} className={x.rarity >= 3 ? "is-rare" : ""}>
                <RarityGem rarity={x.rarity} />
                <span><b>{TIER[x.rarity]}</b> {KIND[x.kind]}</span>
                <small>{short(x.who)} · {ago(now - x.at * 1000)}</small>
              </li>
            ))}
          </ol>
        </section>
      </aside>
      <footer className="ldw__foot">{tl("結果由 drand 公開隨機數決定，揭曉當下就會出現在這裡。")}<a href="/game/lightdive">{tl("進入遊戲")}</a></footer>
    </div>
  );
}
