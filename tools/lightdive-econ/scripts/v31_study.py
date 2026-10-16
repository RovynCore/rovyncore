"""v3.1 design study (2026-10-16): destination crowding (C) and light combos (D).

Runs a scenario to a given day, takes every active team, then on that day's sky compares where three dives per team go
and how the day's release is shared:
  - today:   every dive to the destination with the most base points after the departure cost (what the route suggestion
             and the round-1 policy do), no crowding;
  - crowded: players arrive in random order and pick the destination with the most points after the crowding factor
             the destination has reached when they arrive (a greedy best response).
The pool releases a fixed amount a day shared by points, so what matters to a player is the SHARE of the day's points.
Light combos: how often a summoned team has a resonance (k seekers of one light) or a spectrum (all lights different,
at least m seekers), and what a bonus does to the shares.

    .venv/Scripts/python scripts/v31_study.py [scenario] [day]
"""
from __future__ import annotations

import json
import math
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from lightdive_sim.engine import Sim  # noqa: E402
from lightdive_sim.params import Params  # noqa: E402

BP = 10_000


def teams_on(scenario: str, day: int, seed: int = 20261016):
    p = Params.load(scenario)
    sim = Sim(p, seed=seed, days=day)
    sim.run()
    teams = [t for pl in sim.players if pl.active for t in pl.teams if t.seekers]
    return sim, teams


def dest_value(sim: Sim, team, dest: int, day: int) -> int:
    """Points after the departure cost (x100) of one dive: the number the route suggestion maximises."""
    rules = sim.rules
    light = rules.sky(day)[0][dest]
    bonus = rules.attunement_x100([(s.power, s.trait) for s in team.seekers], team.power, light)
    pts = rules.points_e2(team.power, bonus, dest, day)
    levy = sim.p["play.levy_bp"][dest // 4]
    return pts * (BP - levy) // BP


def reachable(sim: Sim, team) -> list[int]:
    return [d for d, th in enumerate(sim.p["play.thresholds"]) if team.power >= th]


def crowd_factor(n_before: int, free: int, step_bp: int, per: int, floor_bp: int) -> int:
    """Weight (bp) of the (n_before + 1)-th dive of the day at a destination."""
    if n_before < free:
        return BP
    return max(floor_bp, BP - step_bp * ((n_before - free) // per + 1))


def allocate(sim: Sim, teams, day: int, rng: random.Random, crowd: dict | None):
    """Three dives per team. Returns per-team points (x100, after the departure cost) and per-destination counts."""
    counts = Counter()
    got = [0] * len(teams)
    order = [i for i in range(len(teams)) for _ in range(3)]
    rng.shuffle(order)
    total_dives = len(order)
    free = None
    if crowd:
        free = max(crowd["free_min"], math.ceil(total_dives * crowd["free_share_x24"] / 24))
    for i in order:
        t = teams[i]
        best, best_v = None, -1
        for d in reachable(sim, t):
            v = dest_value(sim, t, d, day)
            if crowd:
                v = v * crowd_factor(counts[d], free, crowd["step_bp"], crowd["per"], crowd["floor_bp"]) // BP
            if v > best_v:
                best, best_v = d, v
        if best is None:
            continue
        counts[best] += 1
        got[i] += best_v
    return got, counts, free


def deciles(values: list[int], powers: list[int]) -> list[float]:
    order = sorted(range(len(values)), key=lambda i: powers[i])
    n = len(order)
    out = []
    for k in range(10):
        idx = order[k * n // 10:(k + 1) * n // 10]
        out.append(sum(values[i] for i in idx))
    return out


def study_crowding(sim, teams, day, settings):
    rng = random.Random(1)
    base, base_counts, _ = allocate(sim, teams, day, rng, None)
    powers = [t.power for t in teams]
    base_total = sum(base)
    base_dec = deciles(base, powers)
    rows = []
    for name, crowd in settings.items():
        got, counts, free = allocate(sim, teams, day, random.Random(1), crowd)
        total = sum(got)
        dec = deciles(got, powers)
        # change in each decile's share of the day's release (share = points / all points)
        share_change = [((dec[k] / total) / (base_dec[k] / base_total) - 1) * 100 if base_dec[k] else 0 for k in range(10)]
        rows.append({
            "setting": name, "free": free,
            "top_dest_share_pct": round(100 * max(counts.values()) / sum(counts.values()), 1),
            "dests_used": len(counts),
            "points_vs_today_pct": round(100 * total / base_total - 100, 1),
            "share_change_by_power_decile_pct": [round(x, 1) for x in share_change],
        })
    return {
        "teams": len(teams), "dives": 3 * len(teams),
        "today": {"top_dest_share_pct": round(100 * max(base_counts.values()) / sum(base_counts.values()), 1), "dests_used": len(base_counts),
                  "busiest": base_counts.most_common(5)},
        "crowded": rows,
    }


def study_combos(teams, bonus_res_bp: int, k_res: int, m_spec: int):
    res = spec = 0
    berths = Counter(t.spire.trait for t in teams)
    for t in teams:
        lights = Counter(s.trait for s in t.seekers)
        if max(lights.values()) >= k_res:
            res += 1
        if len(t.seekers) >= m_spec and len(lights) == len(t.seekers):
            spec += 1
    n = len(teams)
    return {"teams": n, "spire_berths": dict(sorted(berths.items())), f"resonance_{k_res}_pct": round(100 * res / n, 1),
            f"spectrum_{m_spec}_pct": round(100 * spec / n, 1), "note": f"as summoned; a player who picks seekers for it does better"}


def best_possible_combos(trials: int = 20000, seed: int = 3):
    """With N random seekers to pick from (6 lights, uniform), can a team with b berths make a combo?"""
    rng = random.Random(seed)
    out = {}
    for owned in (5, 10, 20):
        for b in (2, 3, 4, 5):
            r2 = r3 = s3 = s4 = 0
            for _ in range(trials):
                lights = Counter(rng.randrange(6) for _ in range(owned))
                top = max(lights.values())
                r2 += min(top, b) >= 2
                r3 += min(top, b) >= 3
                s3 += min(len(lights), b) >= 3 and b >= 3
                s4 += min(len(lights), b) >= 4 and b >= 4
            out[f"own{owned}_berths{b}"] = {"res2": round(100 * r2 / trials), "res3": round(100 * r3 / trials),
                                            "spec3": round(100 * s3 / trials), "spec4": round(100 * s4 / trials)}
    return out


if __name__ == "__main__":
    scenario = sys.argv[1] if len(sys.argv) > 1 else "base"
    day = int(sys.argv[2]) if len(sys.argv) > 2 else 120
    sim, teams = teams_on(scenario, day)
    chain_day = sim.p["run.start_chain_day"] + day
    settings = {
        "A free x1.5 avg, -3%/5, floor 70%": {"free_min": 10, "free_share_x24": 1.5, "step_bp": 300, "per": 5, "floor_bp": 7000},
        "B free x1.0 avg, -2%/5, floor 80%": {"free_min": 10, "free_share_x24": 1.0, "step_bp": 200, "per": 5, "floor_bp": 8000},
        "C free x2.0 avg, -5%/5, floor 60%": {"free_min": 10, "free_share_x24": 2.0, "step_bp": 500, "per": 5, "floor_bp": 6000},
    }
    report = {
        "scenario": scenario, "day": day,
        "crowding": study_crowding(sim, teams, chain_day, settings),
        "combos_as_summoned": study_combos(teams, 500, 2, 3),
        "combos_if_picked": best_possible_combos(),
    }
    out = Path(__file__).resolve().parents[1] / "reports" / "v31-study" / f"{scenario}-day{day}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=1))
