"""Cards, decks, teams and players. Decks mirror LightdiveMinter3: exact counts per rarity, drawn without
replacement, a new deck when one runs out; prisms also carry an exact beam split per rarity."""
from __future__ import annotations

import random
from dataclasses import dataclass, field

SPIRE, PRISM, SEEKER = 0, 1, 2
KIND_NAMES = ("spire", "prism", "seeker")


@dataclass
class Card:
    id: int
    kind: int
    rarity: int
    trait: int  # spire: berths; prism: beam; seeker: light
    power: int
    voyages: int
    owner: int
    renewed: bool = False
    docked_day: int | None = None
    on_team: bool = False
    listed: bool = False


class Deck:
    def __init__(self, kind: int, counts: list[int], beam_tenths: list[int] | None):
        self.kind = kind
        self.counts = counts
        self.beam_tenths = beam_tenths
        self.number = 0
        self._open()

    def _open(self) -> None:
        self.number += 1
        self.left = list(self.counts)
        self.remaining = sum(self.counts)
        if self.kind == PRISM and self.beam_tenths:
            self.beam_left = []
            for n in self.left:
                wide = n * self.beam_tenths[0] // 10
                focused = n * self.beam_tenths[1] // 10
                self.beam_left.append([wide, focused, n - wide - focused])

    @staticmethod
    def _pick(left: list[int], rng: random.Random) -> int:
        x = rng.randrange(sum(left))
        for i, n in enumerate(left):
            if x < n:
                left[i] -= 1
                return i
            x -= n
        raise AssertionError("unreachable")

    def draw(self, rng: random.Random) -> tuple[int, int | None]:
        """(rarity, beam for prisms)."""
        if self.remaining == 0:
            self._open()
        rarity = self._pick(self.left, rng)
        self.remaining -= 1
        beam = self._pick(self.beam_left[rarity], rng) if self.kind == PRISM and self.beam_tenths else None
        return rarity, beam


@dataclass
class Team:
    spire: Card
    prism: Card | None
    seekers: list[Card]
    dives_today: int = 0

    @property
    def power(self) -> int:
        return self.spire.power + (self.prism.power if self.prism else 0) + sum(s.power for s in self.seekers)

    @property
    def beam(self) -> int:
        return self.prism.trait if self.prism else 1

    def cards(self) -> list[Card]:
        return [self.spire] + ([self.prism] if self.prism else []) + list(self.seekers)


@dataclass
class Player:
    id: int
    joined: int
    threshold: float
    active: bool = True
    teams: list[Team] = field(default_factory=list)
    cards: dict[int, Card] = field(default_factory=dict)
    credit: int = 0
    last_claim_day: int | None = None
    passes_today: int = 0
    spent: int = 0  # paid into the game (summons, renewals, market purchases)
    bought: int = 0  # RVYN bought from outside to pay
    received: int = 0  # claimed, after the claim fee
    earned: int = 0  # credited, before the claim fee
    sold: int = 0  # market sales, after tax
    left_day: int | None = None

    @property
    def account(self) -> str:
        return f"player:{self.id}"
