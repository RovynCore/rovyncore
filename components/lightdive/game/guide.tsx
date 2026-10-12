"use client";

import { BEAM, DEPTH, OUTCOME } from "@/lib/lightdive-copy";
import { G } from "@/lib/lightdive-game-copy";
import type { Game } from "./game";
import { SectionHead, useT } from "./ui";

export function Guide({ g }: { g: Game }) {
  const { t } = useT();
  const o = g.data.overview!;
  const tiers = g.data.tiers;
  return (
    <div className="ldg-view">
      <SectionHead kicker={t(G.guideKicker)} title={t(G.guideTitle)} />
      <ol className="ldg-loop">
        {G.guideSteps.map(([title, body], i) => (
          <li key={i}>
            <span className="ldg-loop__n">{String(i + 1).padStart(2, "0")}</span>
            <b>{t(title)}</b>
            <p>{t(body)}</p>
          </li>
        ))}
      </ol>

      <div className="ldg-split">
        <section className="ldg-panel">
          <header className="ldg-panel__head"><h2 className="rv-h3">{t(G.formulaTitle)}</h2></header>
          <ul className="ldg-formulas">
            <li>{t(G.formulaLum)}</li>
            <li>{t(G.formulaDust)}</li>
            <li>{t(G.formulaReward)}</li>
          </ul>
          <p className="ldg-note">{t(G.poolRule)}</p>
          <h3 className="ldg-sub">{t(G.depthTable)}</h3>
          <table className="ldg-table">
            <thead><tr><th>{t(G.depth)}</th><th>{t(G.minLumCol)}</th><th>{t(G.coefCol)}</th></tr></thead>
            <tbody>
              {DEPTH.map((label, i) => (
                <tr key={label}><td>{label}</td><td className="ldg-mono">{o.depthMinLuminance[i]}</td><td className="ldg-mono">×{(o.depthCoefBp[i] / 10_000).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="ldg-panel">
          <header className="ldg-panel__head"><h2 className="rv-h3">{t(G.beamTable)}</h2></header>
          {tiers ? (
            <div className="ldg-beams">
              {tiers.map((rows, b) => (
                <table key={b} className="ldg-table">
                  <caption>{t(BEAM[b])}</caption>
                  <thead><tr><th /><th>{t(G.chance)}</th><th>{t(G.multiplier)}</th></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className={`t${i}`}><td>{t(OUTCOME[i])}</td><td className="ldg-mono">{(r.probBp / 100).toFixed(2)}%</td><td className="ldg-mono">{r.hi === 0 ? "×0" : `×${(r.lo / 100).toFixed(2)}–${(r.hi / 100).toFixed(2)}`}</td></tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          ) : null}
          <p className="ldg-note">{t(G.beamNote)}</p>
        </section>
      </div>
      <p className="ldg-note">{t(G.noPromise)}</p>
    </div>
  );
}
