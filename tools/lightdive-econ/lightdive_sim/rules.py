"""Lightdive v3 game rules, ported from LightdiveConfig3 / Expedition3 with the same integer arithmetic, so a dive
here is the dive the contract would make. Every number comes from the config (params.Params); nothing is hard-coded
except the shape of the rules themselves."""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from .keccak import keccak256

BP = 10_000
TIDE, SURGE, STORM, CALM = 1, 2, 3, 4
NONE, STEADY, BOLD, DETOUR = 0, 1, 2, 3
BEAM_KEYS = ("廣域", "聚焦", "針芒")

Tier = tuple[int, int, int]  # (probability bp, multiplier low x100, multiplier high x100)


@dataclass(frozen=True)
class Plan:
    table: tuple[Tier, ...]
    risk: int
    star_event: int
    coef_bp: int
    levy_bp: int
    wear2_bp: int
    wear3_bp: int


class Rules:
    """The rulebook for one parameter set. Cached: plans only depend on (dest, overflow points, beam, day, decision)."""

    def __init__(self, odds: dict[str, list[list[int]]], thresholds: list[int], coef_bp: list[int],
                 levy_bp: list[int], wear2_bp: list[int], wear3_bp: list[int]):
        self.tables: dict[tuple[int, int], tuple[Tier, ...]] = {}
        for c in range(6):
            for b in range(3):
                t = tuple(tuple(row) for row in odds[f"{c + 1}{BEAM_KEYS[b]}"])
                self.tables[(c, b)] = t  # type: ignore[assignment]
        self.thresholds = thresholds
        self.coef_bp = coef_bp
        self.levy_bp = levy_bp
        self.wear2_bp = wear2_bp
        self.wear3_bp = wear3_bp
        self._plan = lru_cache(maxsize=200_000)(self._plan_uncached)
        self._sky = lru_cache(maxsize=4096)(self._sky_uncached)

    # ------------------------------------------------------------ sky

    @staticmethod
    def light_of(day: int, dest: int) -> int:
        return int.from_bytes(keccak256(b"lightdive.light" + day.to_bytes(4, "big") + dest.to_bytes(1, "big")), "big") % 6

    def _sky_uncached(self, day: int) -> tuple[tuple[int, ...], dict[int, int]]:
        lights = tuple(self.light_of(day, d) for d in range(24))
        events: dict[int, int] = {}
        i = 0
        while len(events) < 4:
            h = int.from_bytes(keccak256(b"lightdive.event" + day.to_bytes(4, "big") + i.to_bytes(1, "big")), "big")
            dest = h % 24
            if dest not in events:
                events[dest] = (h >> 8) % 4 + 1
            i += 1
        return lights, events

    def sky(self, day: int) -> tuple[tuple[int, ...], dict[int, int]]:
        """(today's light per destination, {destination: star event code})."""
        return self._sky(day)

    # ------------------------------------------------------------ planning

    def overflow_points(self, power: int, threshold: int) -> int:
        if power <= threshold:
            return 0
        return min(5, (power - threshold) * 5 // threshold)

    def plan(self, dest: int, power: int, beam: int, day: int, decision: int) -> Plan:
        return self._plan(dest, self.overflow_points(power, self.thresholds[dest]), beam, day, decision)

    def _plan_uncached(self, dest: int, over: int, beam: int, day: int, decision: int) -> Plan:
        cluster = dest // 4
        event = self.sky(day)[1].get(dest, 0)
        risk = beam
        levy = self.levy_bp[cluster]
        coef = self.coef_bp[dest]
        wear2, wear3 = self.wear2_bp[cluster], self.wear3_bp[cluster]
        if event == STORM:
            risk += 1
            levy = levy - 200 if levy > 200 else 0
        elif event == CALM:
            risk -= 1
        elif event == SURGE:
            coef = coef * 105 // 100
        elif event == TIDE:
            wear2 = wear3 = 0
        if decision == DETOUR:
            wear2 = wear3 = 0
            levy += 200
        risk = max(0, min(2, risk))
        base = [list(t) for t in self.tables[(cluster, risk)]]
        at = _positions(base)
        cut = min(over * 100, base[0][0])
        if cut:
            base[0][0] -= cut
            base[at["normal"]][0] += cut
        if decision == STEADY:
            table = _reshape(base, at, True)
        elif decision == BOLD:
            table = _reshape(base, at, False)
        else:
            table = base
        return Plan(tuple(tuple(t) for t in table), risk, event, coef, levy, wear2, wear3)  # type: ignore[arg-type]

    # ------------------------------------------------------------ team values

    @staticmethod
    def attunement_x100(seekers: list[tuple[int, int]], team_power: int, light: int) -> int:
        """seekers: [(power, light)]. +15% of each attuned seeker's power, at most +10% of the team (x100)."""
        attuned = sum(15 * p for p, l in seekers if l == light)
        return min(attuned, team_power * 10)

    def points_e2(self, power: int, bonus_x100: int, dest: int, day: int) -> int:
        coef = self.coef_bp[dest]
        if self.sky(day)[1].get(dest) == SURGE:
            coef = coef * 105 // 100
        return (power * 100 + bonus_x100) * coef // BP


# ---------------------------------------------------------------- decisions (mirrors LightdiveConfig3._reshape)

def _round(a: int, b: int) -> int:
    return (2 * a + b) // (2 * b)


def _avg2(t: list[list[int]]) -> int:
    return sum(p * (lo + hi) for p, lo, hi in t)


def _positions(t: list[list[int]]) -> dict[str, int]:
    at = {"slight": 0, "normal": 0, "good": 0, "great": 0, "legend": 0}
    i = 1
    if t[1][2] <= 80:
        at["slight"] = i
        i += 1
    at["normal"] = i
    i += 1
    for name in ("good", "great", "legend"):
        if i < len(t):
            at[name] = i
            i += 1
    return at


def _reshape(table: list[list[int]], at: dict[str, int], steady: bool) -> list[list[int]]:
    n = len(table)
    t = [list(r) for r in table]
    p = [r[0] for r in table]
    if steady:
        p[1] += p[0]
        p[0] = 0
        if at["good"]:
            for i in range(at["good"] + 1, n):
                p[at["good"]] += p[i]
                p[i] = 0
    else:
        donor_pool = p[at["normal"]] + (p[at["slight"]] if at["slight"] else 0) + (p[at["good"]] if at["good"] else 0)
        rows = [0, at["great"], at["legend"]]
        target = [min(6000, _round(3 * p[0], 2) + 400), 0, 0]
        if at["great"]:
            target[1] = _round(5 * p[at["great"]], 2)
        if at["legend"]:
            target[2] = p[at["legend"]] * 3
        live = [j for j in range(3) if j == 0 or rows[j]]
        need = sum(target[j] - p[rows[j]] for j in live)
        full = need == 0 or donor_pool * 85 >= need * 100
        for j in live:
            d = target[j] - p[rows[j]]
            p[rows[j]] += d if full else _round(d * donor_pool * 85, need * 100)
        extra = sum(p) - BP
        left = extra
        donors = [at["slight"], at["normal"], at["good"]]
        last = max(j for j in range(3) if donors[j])
        for j in range(3):
            if not donors[j]:
                continue
            take = left if j == last else _round(extra * table[donors[j]][0], donor_pool)
            p[donors[j]] -= take
            left -= take
    for i in range(n):
        t[i][0] = p[i]
    num = (97 if steady else 103) * _avg2(table)
    den = 100 * _avg2(t)
    for i in range(1, n):
        lo = _round(t[i][1] * num, den)
        hi = _round(t[i][2] * num, den)
        t[i][1] = lo
        t[i][2] = max(lo, hi)
    return t


def draw(table: tuple[Tier, ...], x: int, y: int) -> tuple[int, int]:
    """Outcome row from x in [0, 10000), multiplier within the row from y (any non-negative int): as Expedition3._draw."""
    acc = 0
    for i, (prob, lo, hi) in enumerate(table):
        acc += prob
        if x < acc:
            return i, lo + y % (hi - lo + 1)
    last = table[-1]
    return len(table) - 1, last[1]


def wear_of(plan: Plan, w: int) -> int:
    """Voyages of wear from w in [0, 10000)."""
    if w < plan.wear3_bp:
        return 3
    if w < plan.wear3_bp + plan.wear2_bp:
        return 2
    return 1


def claim_fee_bp(days_since_claim: int, max_bp: int, step_bp: int) -> int:
    cut = days_since_claim * step_bp
    return 0 if cut >= max_bp else max_bp - cut
