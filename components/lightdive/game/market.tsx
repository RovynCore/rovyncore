"use client";

// Market: trading between observers needs its own contract, which comes after the core game.
import { L, NAV } from "@/lib/lightdive-game-copy";
import { GameIcon } from "./icon";
import { PageHead } from "./hud";
import { useT } from "./ui";

export function Market() {
  const { t } = useT();
  return (
    <div className="hud-page">
      <PageHead kicker={t(NAV.market)} icon="market" title={t(L.marketTitle)} />
      <section className="hud-panel hud-soon">
        <GameIcon name="market" />
        <p>{t(L.marketSoon)}</p>
      </section>
    </div>
  );
}
