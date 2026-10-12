"""Order-book market for decision C (10-10): no contract change; idle cards free the caps only if their owners sell them.

Sellers: a player who quits lists all their undocked cards with probability `list_rate`. A listing's ask is a share of
the new price for the voyages it has left: `factor x summon price x voyages left / full voyages`. The factor starts in
`ask_start_range`, falls by `markdown_per_day` while unsold, never goes below `ask_floor`, and after `delist_after_days`
the seller gives up (the card stays alive and idle).
Buyers: a player who needs a card takes the cheapest listing per voyage if its factor is at most `buy_vs_new`, or
`buy_vs_new_capped` when a new summon is blocked by the cap; otherwise they summon. Card power and rarity are ignored.

All listings of one kind fall at the same rate, so their order never changes: the heap key is the factor projected back
to day 0 (log start - listed_day x log(1 - markdown)), and the floor only creates ties at the bottom."""
from __future__ import annotations

import heapq
import math
import random
from collections import deque
from dataclasses import dataclass

from .entities import Card, Player


@dataclass
class Listing:
    card: Card
    start: float
    day: int
    seq: int
    dead: bool = False


class OrderBook:
    def __init__(self, p, prices: list[int], voyages: list[int], rng: random.Random):
        m = p["market.order_book"]
        self.list_rate = m["list_rate"]
        self.ask_lo, self.ask_hi = m["ask_start_range"]
        self.markdown = m["markdown_per_day"]
        self.floor = m["ask_floor"]
        self.delist_after = m["delist_after_days"]
        self.buy_vs_new = m["buy_vs_new"]
        self.buy_vs_new_capped = m["buy_vs_new_capped"]
        if not (0 <= self.markdown < 1 and 0 < self.floor <= self.ask_lo <= self.ask_hi):
            raise ValueError("market.order_book: need 0 <= markdown < 1 and 0 < floor <= ask range")
        self.prices = prices
        self.voyages = voyages
        self.rng = rng
        self.heaps: list[list[tuple[float, int, Listing]]] = [[], [], []]
        self.by_day: deque[Listing] = deque()
        self.seq = 0
        self.open = [0, 0, 0]
        self.delisted = 0
        self.sellers = 0
        self.walked_away = 0

    def factor(self, ls: Listing, day: int) -> float:
        return max(self.floor, ls.start * (1 - self.markdown) ** (day - ls.day))

    def ask(self, ls: Listing, day: int) -> int:
        c = ls.card
        return int(self.prices[c.kind] * self.factor(ls, day) * c.voyages / self.voyages[c.kind])

    def on_quit(self, player: Player, day: int) -> None:
        cards = [c for c in player.cards.values() if c.docked_day is None and c.voyages > 0]
        if not cards:
            return
        if self.rng.random() >= self.list_rate:
            self.walked_away += 1
            return
        self.sellers += 1
        start = self.ask_lo + self.rng.random() * (self.ask_hi - self.ask_lo)
        for c in cards:
            self.seq += 1
            ls = Listing(c, start, day, self.seq)
            c.listed = True
            key = math.log(start) - day * math.log(1 - self.markdown) if self.markdown else math.log(start)
            heapq.heappush(self.heaps[c.kind], (key, ls.seq, ls))
            self.by_day.append(ls)
            self.open[c.kind] += 1

    def _close(self, ls: Listing) -> None:
        ls.dead = True
        ls.card.listed = False
        self.open[ls.card.kind] -= 1

    def expire(self, day: int) -> None:
        """Sellers give up on listings older than delist_after_days (listings are appended in day order)."""
        while self.by_day and (self.by_day[0].dead or day - self.by_day[0].day > self.delist_after):
            ls = self.by_day.popleft()
            if not ls.dead:
                self._close(ls)
                self.delisted += 1

    def best(self, kind: int, alive: dict[int, Card]) -> Listing | None:
        h = self.heaps[kind]
        while h:
            ls = h[0][2]
            if ls.dead or ls.card.id not in alive or not ls.card.listed:
                heapq.heappop(h)
                if not ls.dead:
                    self._close(ls)
                continue
            return ls
        return None

    def take(self, kind: int, day: int, capped: bool, alive: dict[int, Card]) -> tuple[Card, int] | None:
        """The card a buyer takes instead of summoning, and its price; None to summon."""
        ls = self.best(kind, alive)
        if ls is None:
            return None
        if self.factor(ls, day) > (self.buy_vs_new_capped if capped else self.buy_vs_new):
            return None
        price = self.ask(ls, day)
        heapq.heappop(self.heaps[kind])
        self._close(ls)
        return ls.card, price
