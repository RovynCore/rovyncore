"use client";

import { useLanguage } from "@/components/language-provider";
import type { Locale } from "@/lib/translations";

type Copy = Record<Locale, string>;

// Decorative HUD framing for hero sections: corner brackets, edge rulers and a slow reticle.
// It carries no data of its own and is hidden from assistive technology.
export function HeroHud() {
  return (
    <div className="hud" aria-hidden="true">
      <span className="hud__corner hud__corner--tl" />
      <span className="hud__corner hud__corner--tr" />
      <span className="hud__corner hud__corner--bl" />
      <span className="hud__corner hud__corner--br" />
      <span className="hud__ruler hud__ruler--l" />
      <span className="hud__ruler hud__ruler--r" />
      <div className="hud__reticle">
        <i className="hud__ring hud__ring--a" />
        <i className="hud__ring hud__ring--b" />
        <i className="hud__ring hud__ring--c" />
        <i className="hud__cross hud__cross--h" />
        <i className="hud__cross hud__cross--v" />
      </div>
    </div>
  );
}

// Facts only: each cell is either a fixed contract fact or the live stage text passed in by the page.
export function TelemetryRail({ cells, label }: { cells: Array<{ key: string; label: Copy; value: string | Copy; live?: boolean }>; label: string }) {
  const { locale } = useLanguage();
  return (
    <dl className="telemetry" aria-label={label}>
      {cells.map((cell) => (
        <div key={cell.key} className={cell.live ? "telemetry__cell is-live" : "telemetry__cell"}>
          <dt>{cell.label[locale]}</dt>
          <dd>{typeof cell.value === "string" ? cell.value : cell.value[locale]}</dd>
        </div>
      ))}
    </dl>
  );
}
