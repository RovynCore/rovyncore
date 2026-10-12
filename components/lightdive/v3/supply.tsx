"use client";

// Server-wide card counts against the caps (decision C, 10-10): how many of each kind exist, how many are on teams,
// how many are on the market and how many sit unused. Cards that sit unused keep their place under the cap until they
// come home, so the split is shown as plain facts. Blocks, not bars (UI rule): ten blocks per kind, one per tenth.
import { ALIVE_CAP, type Kind } from "@/lib/lightdive-v3/rules";
import { othersListings, simulatedSupply, type Supply } from "./market-data";
import type { Sim } from "./sim";
import { KIND } from "./copy";
import { tl } from "@/lib/lightdive-v3/i18n";

const ACCENT: Record<Kind, string> = { 0: "#f0c766", 1: "#7fd3ff", 2: "#c9ff55" };

export function CardSupply({ sim }: { sim: Sim }) {
  const s = sim.state!;
  const day = Math.floor(sim.now / 86_400_000);
  const market = othersListings(sim.now, s.sold ?? []);
  const mine = s.listings ?? [];
  const listed = ([0, 1, 2] as Kind[]).map((k) =>
    market.filter((l) => l.kind === k).length + mine.filter((l) => s.nfts.find((n) => n.id === l.nftId)?.kind === k).length) as [number, number, number];
  const supply = simulatedSupply(day, listed);
  return (
    <section className="v3-supply" aria-labelledby="v3-supply-title">
      <header>
        <h3 id="v3-supply-title">{tl("全服卡片數量")}</h3>
        <p>{tl("每種卡同時存在的數量有上限。停泊中和上架中的卡也算在內，卡歸航後名額才會空出來。")}</p>
      </header>
      <div className="v3-supply__grid">
        {([0, 1, 2] as Kind[]).map((k) => <KindSupply key={k} kind={k} v={supply[k]} />)}
      </div>
      <p className="v3-nftdetail__note">{tl("預覽模式：數字是模擬的。合約部署後會直接讀取鏈上的數量。")}</p>
    </section>
  );
}

function KindSupply({ kind, v }: { kind: Kind; v: Supply }) {
  const cap = ALIVE_CAP[kind];
  const other = Math.max(0, v.alive - v.onTeam - v.listed);
  // ten blocks, one per tenth of the cap; each block takes the colour of the group that fills most of it
  const blocks = Array.from({ length: 10 }, (_, i) => {
    const mid = (i + 0.5) * cap / 10;
    return mid <= v.onTeam ? "is-team" : mid <= v.onTeam + v.listed ? "is-listed" : mid <= v.alive ? "is-other" : "";
  });
  return (
    <div className="v3-supply__kind" style={{ ["--accent" as string]: ACCENT[kind] }}>
      <div className="v3-supply__head"><b>{KIND[kind]}</b><span><em>{v.alive.toLocaleString()}</em> / {cap.toLocaleString()}</span></div>
      <div className="v3-supply__blocks" aria-hidden="true">{blocks.map((c, i) => <i key={i} className={c} />)}</div>
      <dl>
        <div className="is-team"><dt>{tl("在隊伍上")}</dt><dd>{v.onTeam.toLocaleString()}</dd></div>
        <div className="is-listed"><dt>{tl("市集上架中")}</dt><dd>{v.listed.toLocaleString()}</dd></div>
        <div className="is-other"><dt>{tl("閒置或停泊")}</dt><dd>{other.toLocaleString()}</dd></div>
        <div><dt>{tl("還能召喚")}</dt><dd>{(cap - v.alive).toLocaleString()}</dd></div>
      </dl>
    </div>
  );
}
