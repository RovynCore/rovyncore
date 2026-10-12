"use client";

// Treasury: what the player has earned and can claim, the light-decay fee, their record, and every voyage.
import { ABI, claimFeeNow, coordinate, type Contracts, type DiveRecord } from "@/lib/lightdive";
import { ATTRIBUTE, ATTRIBUTE_COLOR, BEAM, DEPTH, KIND_NAME, LOG_LINE, OUTCOME } from "@/lib/lightdive-copy";
import { G, L, NAV } from "@/lib/lightdive-game-copy";
import { settleAll, type Derived, type Game } from "./game";
import { GameIcon } from "./icon";
import { PageHead, Panel } from "./hud";
import { sfx } from "./sound";
import { countdown } from "./use-game";
import { dust, fill, rvyn, useT } from "./ui";

export function Treasury({ g, d, c }: { g: Game; d: Derived; c: Contracts }) {
  const { t } = useT();
  const o = g.data.overview!;
  const byDay = new Map<number, DiveRecord[]>();
  for (const dv of g.data.dives) byDay.set(dv.day, [...(byDay.get(dv.day) ?? []), dv]);
  const results = g.data.dives.map((dv) => dv.result ?? g.data.outcomes.get(dv.id) ?? null).filter((x): x is NonNullable<typeof x> => x !== null);
  const held = results.filter((r) => r.tier > 0).length;
  const best = results.reduce((m, r) => Math.max(m, r.multX100), 0);
  const dustHome = g.data.dives.reduce((s, dv) => s + (dv.result ? dv.result.lightdust : 0n), 0n);
  const settledRvyn = g.data.dives.reduce((s, dv) => s + (dv.result ? dv.result.reward : 0n), 0n);

  return (
    <div className="hud-page">
      <PageHead kicker={t(NAV.treasury)} icon="treasury" title={t(L.treasuryTitle)} lead={t(G.feeStays)} />
      <div className="hud-treasury__top">
        {g.data.player && <Claim g={g} d={d} c={c} />}
        <Panel title={t(L.stats)} index="02" icon="voyage">
          <div className="hud-statgrid">
            <span><small>{t(L.statDives)}</small><b>{g.data.dives.length}</b></span>
            <span><small>{t(L.statSuccess)}</small><b>{results.length ? `${Math.round((held / results.length) * 100)}%` : "—"}</b></span>
            <span><small>{t(L.statBest)}</small><b>{best ? `×${(best / 100).toFixed(2)}` : "—"}</b></span>
            <span><small>{t(L.statDust)}</small><b>{dust(dustHome)}</b></span>
            <span className="is-gold"><small>{t(L.statRvyn)}</small><b>{rvyn(settledRvyn, 2)}</b></span>
          </div>
        </Panel>
      </div>

      {d.settleable.length > 0 && (
        <section className="hud-panel hud-settle">
          <div>
            <b>{fill(t(G.settleBtn), { n: Math.min(40, d.settleable.length) })}</b>
            <p className="hud-dim">{t(G.settleNote)}</p>
          </div>
          <button type="button" className="hud-btn hud-btn--primary" disabled={!!g.tx?.running} onClick={() => void settleAll(g, d)}>
            <GameIcon name="settle" />{fill(t(G.settleBtn), { n: Math.min(40, d.settleable.length) })}
          </button>
        </section>
      )}

      <Panel title={t(G.logTitle)} index="03" icon="settle">
        {g.data.dives.length === 0 ? (
          <p className="hud-empty">{t(G.noDives)}</p>
        ) : (
          [...byDay.entries()].map(([day, dives]) => (
            <section key={day} className="hud-day">
              <h3>{new Date(day * 86_400_000).toISOString().slice(0, 10)} UTC</h3>
              <ol className="ldg-log">
                {dives.map((dv) => <Entry key={String(dv.id)} dv={dv} g={g} today={o.today} />)}
              </ol>
            </section>
          ))
        )}
      </Panel>
    </div>
  );
}

/** Story line for a result; CJK text gets spaces around the Latin coordinate. */
export function logLine(template: string, coord: string, name: string) {
  const cjk = /[㐀-鿿]/.test(template);
  return template.replaceAll("{coord}", cjk ? ` ${coord} ` : coord).replaceAll("{name}", name).replace(/ {2,}/g, " ").replace(/ ([，。、])/g, "$1");
}

function Entry({ dv, g, today }: { dv: DiveRecord; g: Game; today: number }) {
  const { t } = useT();
  const coord = coordinate(dv.day, dv.depth);
  const outcome = dv.result ?? g.data.outcomes.get(dv.id) ?? null;
  const tier = outcome?.tier;
  const settleable = g.data.settleable.has(dv.id);
  const name = `${t(KIND_NAME[0])} #${dv.spire}`;
  const status = dv.settled ? t(G.stSettled)
    : settleable ? t(G.stSettleable)
    : outcome ? t(G.stWaitDay)
    : fill(t(G.stInFlight), { t: countdown((Number(dv.slot) + 1) * 60 - g.now) });
  const lightdust = dv.result ? dv.result.lightdust : outcome ? (dv.points * BigInt(outcome.multX100)) / 100n : null;
  return (
    <li className={`ldg-entry${tier !== undefined ? ` t${tier}` : " is-flight"}`} style={{ ["--lc" as string]: ATTRIBUTE_COLOR[coord.attribute] }}>
      <span className="ldg-entry__mark" aria-hidden="true" />
      <div className="ldg-entry__main">
        <div className="ldg-entry__top">
          <b>{tier !== undefined ? `${t(OUTCOME[tier])} ×${(outcome!.multX100 / 100).toFixed(2)}` : t(G.onBridge)}</b>
          <span className={`ldg-pill ${dv.settled ? "ldg-pill--plain" : settleable ? "ldg-pill--ok" : "ldg-pill--warn"}`}><i />{status}</span>
        </div>
        {tier !== undefined && <p>{logLine(t(LOG_LINE[tier]), coord.label, name)}</p>}
        {"fallbackUsed" in (outcome ?? {}) && outcome?.fallbackUsed && <p className="hud-dim">{t(G.stFallback)}</p>}
        <p className="ldg-mono hud-dim ldg-small">
          #{String(dv.id)} · {name} · {t(G.depth)} {DEPTH[dv.depth]} · {coord.label} · <i className="ldg-dot" style={{ background: ATTRIBUTE_COLOR[coord.attribute] }} />{t(ATTRIBUTE[coord.attribute])} · {t(BEAM[dv.beam])} · ✦ {String(dv.luminance)}
        </p>
      </div>
      <div className="ldg-entry__nums">
        <span><small>{t(G.lightdust)}</small><b>{lightdust !== null ? dust(lightdust) : dust(dv.points)}</b></span>
        <span><small>{t(G.reward)}</small><b>{dv.result ? `+${rvyn(dv.result.reward, 4)}` : dv.day < today ? "…" : "—"}</b></span>
      </div>
    </li>
  );
}

function Claim({ g, d, c }: { g: Game; d: Derived; c: Contracts }) {
  const { t } = useT();
  const o = g.data.overview!;
  const p = g.data.player!;
  const feeBp = claimFeeNow(o, p, g.now);
  const fee = (d.credit * BigInt(feeBp)) / 10_000n;
  const since = p.lastClaimAt === 0n ? null : Math.floor((g.now - Number(p.lastClaimAt)) / 86_400);
  const days = Array.from({ length: o.claimFeeDecayDays + 1 }, (_, i) => ({ i, bp: Math.floor((o.claimFeeMaxBp * Math.max(0, o.claimFeeDecayDays - i)) / o.claimFeeDecayDays) }));
  // A useful hint: how long until the fee roughly halves.
  const waitDays = since === null ? null : Math.max(0, Math.ceil(o.claimFeeDecayDays / 2) - since);
  const waitBp = waitDays === null ? 0 : Math.floor((o.claimFeeMaxBp * Math.max(0, o.claimFeeDecayDays - (since! + waitDays))) / o.claimFeeDecayDays);
  return (
    <Panel title={t(G.claimTitle)} index="01" icon="claim" className="hud-claim">
      <div className="hud-claim__amount">
        <span className="hud-chest"><GameIcon name="treasury" /></span>
        <div>
          <b>{rvyn(d.credit, 4)}</b>
          <small>RVYN · {t(G.feeNow)} {(feeBp / 100).toFixed(0)}%</small>
        </div>
      </div>
      {d.credit > 0n ? (
        <>
          <dl className="ldg-kv">
            <div><dt>{t(G.feeNow)}</dt><dd>−{rvyn(fee, 4)}</dd></div>
            <div><dt>{t(G.youReceive)}</dt><dd>{rvyn(d.credit - fee, 4)} RVYN</dd></div>
          </dl>
          <button type="button" className="hud-btn hud-btn--gold hud-btn--block" disabled={!!g.tx?.running} onClick={() => void g.run([{ label: G.stepClaim, address: c.expedition, abi: ABI.Expedition, functionName: "claim" }]).then((ok) => (ok ? sfx.success() : sfx.fail()))}>
            {fill(t(G.claimBtn), { x: rvyn(d.credit - fee, 2) })}
          </button>
        </>
      ) : (
        <p className="hud-dim">{t(G.nothingYet)}</p>
      )}
      <figure className="ldg-decay">
        <figcaption className="hud-dim ldg-small">{t(G.decayChart)}</figcaption>
        <div className="ldg-decay__bars">
          {days.map(({ i, bp }) => (
            <span key={i} className={since !== null && Math.min(since, o.claimFeeDecayDays) === i ? "is-now" : ""} title={`${fill(t(G.dayN), { n: i })}: ${(bp / 100).toFixed(0)}%`}>
              <i style={{ height: `${Math.max(3, (bp / o.claimFeeMaxBp) * 100)}%` }} />
              {i % 5 === 0 && <small>{i}</small>}
            </span>
          ))}
        </div>
      </figure>
      {waitDays !== null && waitDays > 0 && d.credit > 0n && <p className="hud-note">{fill(t(L.waitTip), { d: waitDays, f: (waitBp / 100).toFixed(0) })}</p>}
    </Panel>
  );
}
