// 卡片履歷 (10-19): what each card has lived through, kept by the card itself and following it from owner to owner.
// It is read from the chain's public events alone (no contract stores it): a team's roster at the moment of each dive
// comes from the TeamSet / TeamDisbanded events before it, and the dive's result from Revealed. The marks it earns
// are honour only: they change no power, no odds and no reward. Relative imports only (Node runs the stats on it).
import { DESTINATIONS, baseTable, outcomesOf, skyOf, type Beam, type Sky } from "./rules.ts";

export type CardHistory = {
  dives: number; // voyages it set out on (any position on the team)
  collected: number; // of them, with a revealed result
  deepest: number; // the deepest destination reached (-1: none)
  best: number; // best multiplier x100
  legends: number;
  greats: number; // great haul or better
  deepDives: number; // deep dives that pressed on to the end
  spires: number; // different teams (spires) it sailed with
  first: number | null; // day of its first voyage
};

export const emptyHistory = (): CardHistory => ({ dives: 0, collected: 0, deepest: -1, best: 0, legends: 0, greats: 0, deepDives: 0, spires: 0, first: null });

const skies = new Map<number, Sky>();
const sky = (day: number) => { if (!skies.has(day)) skies.set(day, skyOf(day)); return skies.get(day)!; };
/** The name of a result tier, from the table the dive drew from (cluster and risk, as the game shows it). */
export function outcomeNameOf(dest: number, day: number, beam: number, long: boolean, tier: number): string {
  if (tier === 254) return "turnedBack";
  const ev = sky(day).events.get(dest);
  const risk = Math.max(0, Math.min(2, beam + (ev === "storm" ? 1 : ev === "calm" ? -1 : 0) + (long ? 1 : 0))) as Beam;
  return outcomesOf(baseTable(DESTINATIONS[dest].cluster, risk))[tier] ?? "normal";
}

/** One voyage as the history needs it. */
export type Voyage = { crew: number[]; spire: number; dest: number; day: number; outcome?: string; multX100?: number; deep?: boolean; turnedBack?: boolean };

/** Folds voyages into each card's history. */
export function historiesOf(voyages: Voyage[]): Map<number, CardHistory> {
  const out = new Map<number, CardHistory>();
  const spires = new Map<number, Set<number>>();
  for (const v of voyages) {
    for (const id of new Set(v.crew)) {
      const h = out.get(id) ?? emptyHistory();
      h.dives += 1;
      h.first = h.first === null ? v.day : Math.min(h.first, v.day);
      if (v.outcome) {
        h.collected += 1;
        h.deepest = Math.max(h.deepest, v.dest);
        h.best = Math.max(h.best, v.multX100 ?? 0);
        if (v.outcome === "legend") h.legends += 1;
        if (v.outcome === "great" || v.outcome === "legend") h.greats += 1;
        if (v.deep && !v.turnedBack) h.deepDives += 1;
      }
      if (!spires.has(id)) spires.set(id, new Set());
      spires.get(id)!.add(v.spire);
      h.spires = spires.get(id)!.size;
      out.set(id, h);
    }
  }
  return out;
}

type Ev = { args: Record<string, unknown>; blockNumber: bigint; logIndex: number };
export type LedgerLogs = { teamSet: Ev[]; disbanded: Ev[]; dived: Ev[]; details: Ev[]; turned: Ev[]; revealed: Ev[] };

/** Voyages from the chain's events: each dive with the roster its team had at that moment. */
export function voyagesFromLogs(l: LedgerLogs): Voyage[] {
  type Step = { at: [bigint, number]; kind: "set" | "off" | "dive"; e: Ev };
  const steps: Step[] = [
    ...l.teamSet.map((e) => ({ at: [e.blockNumber, e.logIndex] as [bigint, number], kind: "set" as const, e })),
    ...l.disbanded.map((e) => ({ at: [e.blockNumber, e.logIndex] as [bigint, number], kind: "off" as const, e })),
    ...l.dived.map((e) => ({ at: [e.blockNumber, e.logIndex] as [bigint, number], kind: "dive" as const, e })),
  ].sort((a, b) => (a.at[0] === b.at[0] ? a.at[1] - b.at[1] : a.at[0] < b.at[0] ? -1 : 1));
  const long = new Set(l.details.filter((e) => e.args.long).map((e) => String(e.args.diveId)));
  const back = new Map(l.turned.map((e) => [String(e.args.diveId), Boolean(e.args.turnBack)]));
  const result = new Map(l.revealed.map((e) => [String(e.args.diveId), e.args]));
  const roster = new Map<number, number[]>();
  const out: Voyage[] = [];
  for (const s of steps) {
    const a = s.e.args;
    const spire = Number(a.spire);
    if (s.kind === "set") roster.set(spire, [Number(a.prism), ...(a.seekers as bigint[]).map(Number)].filter((x) => x > 0));
    else if (s.kind === "off") roster.delete(spire);
    else {
      const id = String(a.diveId), dest = Number(a.dest), day = Number(a.day);
      const r = result.get(id);
      const deep = long.has(id);
      out.push({
        crew: [spire, ...(roster.get(spire) ?? [])], spire, dest, day, deep, turnedBack: back.get(id) ?? false,
        outcome: r ? (r.fallbackUsed ? "normal" : outcomeNameOf(dest, day, Number(a.beam), deep, Number(r.tier))) : undefined,
        multX100: r ? Number(r.multX100) : undefined,
      });
    }
  }
  return out;
}

/** A mark a card has earned, hardest first. */
export type MarkKey = "legend" | "crown" | "abyss" | "harvest" | "veteran" | "renewed";
export function marksOf(h: CardHistory | null | undefined, renewed?: boolean): MarkKey[] {
  const out: MarkKey[] = [];
  if (h && h.legends > 0) out.push("legend");
  if (h && h.deepest >= 0 && DESTINATIONS[h.deepest].cluster >= 5) out.push("crown");
  if (h && h.deepDives > 0) out.push("abyss");
  if (h && h.greats >= 10) out.push("harvest");
  if (h && h.dives >= 30) out.push("veteran");
  if (renewed) out.push("renewed");
  return out;
}
