"""Double-entry ledger for every RVYN movement, in wei. The sum over all accounts never changes, so conservation can be
checked at any time: outside (RVYN held outside the game) + ecosystem + players + pool + treasury + market + burned."""
from __future__ import annotations

from collections import defaultdict

WEI = 10**18


class LedgerError(AssertionError):
    pass


class Ledger:
    def __init__(self, outside: int, ecosystem: int):
        self.bal: dict[str, int] = defaultdict(int)
        self.bal["outside"] = outside
        self.bal["ecosystem"] = ecosystem
        self.total = outside + ecosystem
        self.flows: dict[str, int] = defaultdict(int)  # by reason, for reports

    def move(self, src: str, dst: str, amount: int, reason: str) -> None:
        if amount < 0:
            raise LedgerError(f"negative transfer {reason}")
        if amount == 0:
            return
        if self.bal[src] < amount:
            raise LedgerError(f"{src} cannot pay {amount} for {reason} (has {self.bal[src]})")
        self.bal[src] -= amount
        self.bal[dst] += amount
        self.flows[reason] += amount

    def pay(self, player: str, dst: str, amount: int, reason: str) -> int:
        """A player pays `amount`, buying the missing RVYN from outside first. Returns what had to be bought."""
        short = max(0, amount - self.bal[player])
        if short:
            self.move("outside", player, short, "buy_rvyn")
        self.move(player, dst, amount, reason)
        return short

    def check(self) -> None:
        s = sum(self.bal.values())
        if s != self.total:
            raise LedgerError(f"RVYN not conserved: {s} != {self.total}")
        neg = [k for k, v in self.bal.items() if v < 0]
        if neg:
            raise LedgerError(f"negative balances: {neg}")
