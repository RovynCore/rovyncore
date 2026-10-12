"use client";

// Codex: what the player has encountered and collected so far. Collection progress only, no rewards.
import { coordinate } from "@/lib/lightdive";
import { ATTRIBUTE, ATTRIBUTE_COLOR, KIND_NAME, OUTCOME, RARITY, RARITY_COLOR, SIGNATURE } from "@/lib/lightdive-copy";
import { G, NAV } from "@/lib/lightdive-game-copy";
import type { Derived, Game } from "./game";
import { PageHead, Panel } from "./hud";
import { useT } from "./ui";

export function Codex({ g, d }: { g: Game; d: Derived }) {
  const { t } = useT();
  const all = [...g.data.nfts, ...g.data.teams.flatMap((tm) => [tm.spire, ...(tm.prism ? [tm.prism] : []), ...tm.seekers])];
  const lights = new Set(g.data.dives.map((dv) => coordinate(dv.day, dv.depth).attribute));
  const seen = new Set<number>();
  for (const dv of g.data.dives) {
    const tier = dv.result?.tier ?? g.data.outcomes.get(dv.id)?.tier;
    if (tier !== undefined) seen.add(tier);
  }
  const has = (kind: number, rarity: number) => all.some((n) => n.attributes.kind === kind && n.attributes.rarity === rarity);
  const lightsHeld = new Set(all.filter((n) => n.attributes.kind === 2).map((n) => n.attributes.trait));
  const specials = { sig: new Set(all.filter((n) => n.attributes.kind === 2 && n.attributes.variant).map((n) => n.attributes.variant)) }; // seeker signatures only
  void d;
  const Chip = ({ on, color, label }: { on: boolean; color: string; label: string }) => (
    <li className={on ? "is-found" : ""} style={{ ["--lc" as string]: color }}><i />{on ? label : "？"}</li>
  );
  return (
    <div className="hud-page">
      <PageHead kicker={t(NAV.codex)} icon="codex" title={t(G.codex)} lead={t(G.homecoming)} />
      <div className="hud-codex">
        <Panel title={t(G.codexLights)} index="01" icon="expedition" action={<span className="hud-num hud-dim">{lights.size}/6</span>}>
          <ul className="hud-chips">{ATTRIBUTE.map((name, i) => <Chip key={i} on={lights.has(i)} color={ATTRIBUTE_COLOR[i]} label={t(name)} />)}</ul>
        </Panel>
        <Panel title={t(G.codexOutcomes)} index="02" icon="launch" action={<span className="hud-num hud-dim">{seen.size}/5</span>}>
          <ul className="hud-chips">{OUTCOME.map((name, i) => <Chip key={i} on={seen.has(i)} color={["#ff8a7a", "#c9ff55", "#3de7e0", "#e8c46a", "#fff4d6"][i]} label={t(name)} />)}</ul>
        </Panel>
        {[0, 1, 2].map((kind) => (
          <Panel key={kind} title={t(KIND_NAME[kind])} index={`0${kind + 3}`} icon={kind === 0 ? "spires" : kind === 1 ? "prisms" : "seekers"} action={<span className="hud-num hud-dim">{RARITY.filter((_, r) => has(kind, r)).length}/5</span>}>
            <ul className="hud-chips">{RARITY.map((name, r) => <Chip key={r} on={has(kind, r)} color={RARITY_COLOR[r]} label={t(name)} />)}</ul>
            {kind === 2 && <ul className="hud-chips">{ATTRIBUTE.map((name, i) => <Chip key={i} on={lightsHeld.has(i)} color={ATTRIBUTE_COLOR[i]} label={t(name)} />)}</ul>}
            {kind === 2 && <ul className="hud-chips">{SIGNATURE.map((name, i) => <Chip key={i} on={specials.sig.has(i + 1)} color="#fff4d6" label={t(name)} />)}</ul>}
          </Panel>
        ))}
      </div>
    </div>
  );
}
