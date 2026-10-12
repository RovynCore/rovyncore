"""Player behaviour. Round 1 has one policy that reproduces the sim-v3.cjs assumptions; round 2's agent-based model
plugs in here. Everything a player decides goes through these methods, and every number comes from the config."""
from __future__ import annotations

import math
import random

from .entities import Player
from .params import Params

DECISIONS = ("none", "steady", "bold", "detour")


class SimpleV3Policy:
    def __init__(self, p: Params):
        self.p = p
        self.arr = p["behaviour.arrivals"]
        self.thresholds = p["play.thresholds"]
        self.renew_rate = p["behaviour.renew_rate"]
        self.claim_every = p["behaviour.claim_every_days"]
        self.mix = p["behaviour.decision_mix"]
        self.lo, self.hi = p["behaviour.quit_threshold_range"]
        if p["behaviour.destination"] != "deepest":
            raise ValueError("round 1 only models the 'deepest' destination choice")
        if p["behaviour.teams_per_player"] != 1:
            raise ValueError("round 1 models one team per player (multi-team players are round 2)")

    def expected_arrivals(self, day: int, yield_ratio: float) -> float:
        a = self.arr
        surge = a.get("surge")
        if surge and surge["from"] <= day < surge["from"] + surge["days"]:
            return float(surge["per_day"])
        if a.get("stop_day") is not None and day >= a["stop_day"]:
            return 0.0
        ramp = min(day / a["ramp_days"], 1.0)
        base = a["peak"] * ramp if day < a["hold_days"] else max(a["floor"], a["peak"] * a["decay"] ** (day - a["hold_days"]))
        return base * max(0.2, min(1.5, yield_ratio))

    def arrivals(self, day: int, yield_ratio: float, rng: random.Random) -> int:
        want = self.expected_arrivals(day, yield_ratio)
        n = math.floor(want)
        return n + (1 if rng.random() < want - n else 0)

    def new_threshold(self, rng: random.Random) -> float:
        return self.lo + rng.random() * (self.hi - self.lo)

    def destination(self, power: int) -> int:
        d = 0
        for i, t in enumerate(self.thresholds):
            if power >= t:
                d = i
        return d

    def decision(self, rng: random.Random) -> int:
        x = rng.random()
        acc = 0.0
        for i, name in enumerate(DECISIONS):
            acc += self.mix.get(name, 0.0)
            if x < acc:
                return i
        return 0

    def keeps_playing(self, player: Player, yield_ratio: float) -> bool:
        return yield_ratio >= player.threshold

    def renews(self, rng: random.Random) -> bool:
        return rng.random() < self.renew_rate

    def claims_today(self, player: Player, day: int) -> bool:
        return player.credit > 0 and player.last_claim_day is not None and day - player.last_claim_day >= self.claim_every
