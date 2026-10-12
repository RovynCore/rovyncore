"""The Core Light Pool and the daily rate, as CoreLightPool3 + Expedition3 (method B): the rate is fixed by the day's
first dive from yesterday's points; every dive reserves its x1.00 reward against the day's ceiling."""
from __future__ import annotations

from collections import defaultdict

from .ledger import Ledger

BP = 10_000


class Pool:
    def __init__(self, ledger: Ledger, emission_bp: int, ceiling_bp: int, cap_per_point_wei: int, tax_to_pool_bp: int):
        self.ledger = ledger
        self.emission_bp = emission_bp
        self.ceiling_bp = ceiling_bp
        self.cap = cap_per_point_wei
        self.tax_to_pool_bp = tax_to_pool_bp
        self.owed = 0
        self.day_points_e2: dict[int, int] = defaultdict(int)
        self.day_rate: dict[int, int] = {}
        self.day_ceiling: dict[int, int] = {}
        self.day_reserved: dict[int, int] = defaultdict(int)
        self.shortfall = 0  # rewards that could not be credited in full (pool too small)

    @property
    def balance(self) -> int:
        return self.ledger.bal["pool"]

    @property
    def available(self) -> int:
        return max(0, self.balance - self.owed)

    def open_day(self, day: int) -> int:
        if day in self.day_rate:
            return self.day_rate[day]
        avail = self.available
        y = self.day_points_e2.get(day - 1, 0)
        rate = self.cap if y == 0 else min(self.cap, avail * self.emission_bp * 100 // (BP * y))
        self.day_rate[day] = max(rate, 1)
        self.day_ceiling[day] = avail * self.ceiling_bp // BP
        return self.day_rate[day]

    def reserve(self, day: int, points_e2: int) -> bool:
        rate = self.open_day(day)
        res = points_e2 * rate // 100
        if self.day_reserved[day] + res > self.day_ceiling[day]:
            return False
        self.day_reserved[day] += res
        self.day_points_e2[day] += points_e2
        return True

    def credit(self, amount: int) -> int:
        c = min(amount, self.available)
        self.shortfall += amount - c
        self.owed += c
        return c

    def burn_fee_share(self, fee: int, reason: str) -> int:
        """Burns the non-pool share of a fee the pool kept (departure cost)."""
        burn = fee * (BP - self.tax_to_pool_bp) // BP
        burn = min(burn, self.available)
        self.ledger.move("pool", "burned", burn, reason)
        return burn

    def pay_claim(self, account: str, gross: int, fee: int, reason: str = "claim") -> None:
        self.owed -= gross
        burn = fee * (BP - self.tax_to_pool_bp) // BP
        self.ledger.move("pool", account, gross - fee, reason)
        self.ledger.move("pool", "burned", burn, "claim_fee_burn")
        self.ledger.flows["claim_fee_pool"] += fee - burn

    def check(self, day: int) -> None:
        if self.owed > self.balance:
            raise AssertionError(f"day {day}: pool owes {self.owed} > balance {self.balance}")
        if self.day_reserved.get(day, 0) > self.day_ceiling.get(day, 0):
            raise AssertionError(f"day {day}: reserved over the ceiling")
        if self.day_rate.get(day, 0) > self.cap:
            raise AssertionError(f"day {day}: rate above the cap")
