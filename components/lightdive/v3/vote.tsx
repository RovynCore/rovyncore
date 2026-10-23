"use client";

// 世界觀投票 (G5, 10-23): one question a month about where the story goes next. One vote per wallet (it can be
// changed until the month ends); the counts show once you have voted, and last month's result is always shown. The
// result changes no rule, odd or reward: it only decides what the next chapters and voyage stories are about.
import { useCallback, useEffect, useState } from "react";
import { Check, Vote as VoteIcon } from "lucide-react";
import { PageHead } from "../game/hud";
import { tl } from "@/lib/lightdive-v3/i18n";
import { closesAt, monthOf, previousVote, voteOf, type Vote } from "@/lib/lightdive-v3/votes";
import { clock } from "./copy";
import type { Sim } from "./sim";

type Tally = { counts: number[]; mine: number | null; off?: boolean };

async function readTally(month: string): Promise<Tally | null> {
  const r = await fetch(`/api/lightdive/vote?month=${month}`, { cache: "no-store" }).catch(() => null);
  if (!r?.ok) return null;
  return (await r.json()) as Tally;
}

function Bars({ vote, tally, mine }: { vote: Vote; tally: Tally; mine?: number | null }) {
  const total = tally.counts.reduce((a, n) => a + n, 0);
  const top = Math.max(...tally.counts);
  return (
    <ol className="v3-vote__bars">
      {vote.options.map((o, i) => {
        const share = total ? tally.counts[i] / total : 0;
        return (
          <li key={o.title} className={`${mine === i ? "is-mine" : ""}${total && tally.counts[i] === top ? " is-top" : ""}`} style={{ ["--k" as string]: share }}>
            <b>{o.title}</b>
            <span>{tl("{0}%（{1} 票）", { 0: Math.round(share * 100), 1: tally.counts[i] })}</span>
            <i aria-hidden="true"><i /></i>
          </li>
        );
      })}
    </ol>
  );
}

export function VotePage({ sim }: { sim: Sim }) {
  const month = monthOf(sim.now);
  const vote = voteOf(month);
  const before = previousVote(month);
  const [tally, setTally] = useState<Tally | null>(null);
  const [past, setPast] = useState<Tally | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ch = sim.chain;
  const reload = useCallback(async () => {
    const [t, p] = await Promise.all([vote ? readTally(month) : Promise.resolve(null), before ? readTally(before.month) : Promise.resolve(null)]);
    setTally(t);
    setPast(p);
  }, [vote, before, month]);
  useEffect(() => { queueMicrotask(() => void reload()); }, [reload, ch?.account]);

  const cast = async (choice: number) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/lightdive/vote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, choice }) });
      if (r.status === 401) setError(tl("請先連接錢包並簽名登入，才能投票。"));
      else if (!r.ok) setError(tl("沒有投成，請稍後再試。"));
      else await reload();
    } finally {
      setBusy(false);
    }
  };

  const voted = tally?.mine ?? null;
  const canVote = !!ch && !!ch.account && !tally?.off;
  return (
    <div className="hud-page v3-vote">
      <PageHead kicker={tl("世界觀投票")} icon="codex" title={vote ? vote.question : tl("世界觀投票")}
        lead={tl("每個月一題，由觀測者決定故事接下來往哪裡寫。結果只影響故事，不會改變任何規則、機率或收益。")}
        side={vote ? <span className="v3-vote__close">{closesAt(month) - sim.now > 86_400_000 ? tl("{0} 天後截止", { 0: Math.ceil((closesAt(month) - sim.now) / 86_400_000) }) : tl("{0} 後截止", { 0: clock(closesAt(month) - sim.now) })}</span> : undefined} />
      {vote ? (
        <section className="v3-panel">
          <p className="v3-vote__lead">{vote.lead}</p>
          {voted !== null && tally ? <Bars vote={vote} tally={tally} mine={voted} /> : null}
          <ul className="v3-vote__options">
            {vote.options.map((o, i) => (
              <li key={o.title} className={voted === i ? "is-mine" : ""}>
                <b>{o.title}</b>
                <p>{o.text}</p>
                {canVote && (
                  <button type="button" className={`hud-btn hud-btn--sm ${voted === i ? "hud-btn--gold" : "hud-btn--primary"}`} disabled={busy || voted === i} onClick={() => void cast(i)}>
                    {voted === i ? <><Check aria-hidden="true" />{tl("你的選擇")}</> : <><VoteIcon aria-hidden="true" />{voted === null ? tl("投這個") : tl("改投這個")}</>}
                  </button>
                )}
              </li>
            ))}
          </ul>
          {tally?.off ? <p className="v3-muted">{tl("投票即將開放。")}</p>
            : !ch ? <p className="v3-muted">{tl("預覽模式不能投票；到正式版連接錢包後就能投。")} <a href="/game/lightdive#vote">{tl("前往正式版")}</a></p>
              : !ch.account ? <p className="v3-muted">{tl("連接錢包後就能投票，一個錢包一票。")} <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => void ch.join()}>{tl("連接錢包")}</button></p>
                : <p className="v3-muted">{voted === null ? tl("一個錢包一票，月底前都可以改。投了之後就看得到目前的票數。") : tl("月底前都可以改投。")}</p>}
          {error && <p className="v3-error" role="alert">{error} {ch && <button type="button" className="hud-btn hud-btn--ghost hud-btn--sm" onClick={() => void ch.join()}>{tl("重新連接")}</button>}</p>}
        </section>
      ) : <p className="v3-muted">{tl("這個月沒有投票。")}</p>}
      {before && past && (
        <section className="v3-panel">
          <h3>{tl("上個月的結果：{0}", { 0: before.question })}</h3>
          <Bars vote={before} tally={past} />
          <p className="v3-muted">{tl("票數最多的那一個，會寫進接下來的故事。")}</p>
        </section>
      )}
    </div>
  );
}
