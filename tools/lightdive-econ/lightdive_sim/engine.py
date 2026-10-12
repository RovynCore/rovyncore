"""The daily engine. One simulated day, in order:
1. the day's sky; passes reset          2. expired docked cards go home (the keeper)
3. newcomers build teams (summon / buy)  4. dives in random player order: rate fixed by the first dive, reservation
   against the ceiling, outcome, reward, departure cost, wear, docking, renewal or replacement, quitting
5. market tax (fixed_ratio mode)        6. claims                       7. perceived return ratio, metrics, invariants
Every RVYN movement goes through the ledger; every random number comes from a named, seeded stream."""
from __future__ import annotations

import json
import random
from collections import deque
from pathlib import Path

from .entities import KIND_NAMES, PRISM, SEEKER, SPIRE, Card, Deck, Player, Team
from .ledger import WEI, Ledger
from .market import OrderBook
from .params import ROOT, Params
from .policies import SimpleV3Policy
from .pool import BP, Pool
from .rules import Rules, claim_fee_bp, draw, wear_of


class Sim:
    def __init__(self, p: Params, seed: int | None = None, days: int | None = None):
        self.p = p
        self.seed = p["run.seed"] if seed is None else seed
        self.days = p["run.days"] if days is None else days
        self.start = p["run.start_chain_day"]
        self.checks = p["run.check_invariants"]
        self.rng = {k: random.Random(f"{self.seed}:{k}") for k in ("arrivals", "draw", "dive", "behave", "order", "market")}
        odds = json.loads((ROOT / p["play.odds_file"]).read_text(encoding="utf-8"))
        self.rules = Rules(odds, p["play.thresholds"], p["play.coef_bp"], p["play.levy_bp"], p["play.wear2_bp"], p["play.wear3_bp"])
        self.policy = SimpleV3Policy(p)

        initial = int(p["pool.initial_rvyn"] * WEI)
        self.ledger = Ledger(outside=10**12 * WEI, ecosystem=initial)
        self.ledger.move("ecosystem", "pool", initial, "pool_seed")
        self.pool = Pool(self.ledger, p["pool.emission_bp"], p["pool.ceiling_bp"], int(round(p["pool.cap_per_point_rvyn"] * WEI)), p["fees.tax_to_pool_bp"])

        deck = p["summon.deck"]
        self.decks = [Deck(SPIRE, deck["spire"], None), Deck(PRISM, deck["prism"], p["summon.deck_prism_beam_tenths"]), Deck(SEEKER, deck["seeker"], None)]
        self.bands = [p["summon.power_bands"][k] for k in KIND_NAMES]
        self.price = [int(x * WEI) for x in p["summon.price_rvyn"]]
        self.launch_price = list(self.price)
        self.split = p["summon.split_bp"]
        self.voyages = p["summon.voyages"]
        self.caps = p["summon.caps"]
        self.alive = [0, 0, 0]
        self.dock_days = p["summon.dock_days"]
        self.passes = p["play.daily_passes"]
        self.team_dives = p["play.team_dives_per_day"]
        self.market_mode = p["market.mode"]
        if self.market_mode not in ("fixed_ratio", "idle_inventory", "order_book"):
            raise ValueError(f"unknown market.mode {self.market_mode}")
        self.inventory: list[deque[Card]] = [deque(), deque(), deque()]
        self.book = OrderBook(p, self.price, self.voyages, self.rng["market"]) if self.market_mode == "order_book" else None
        self.day = 0

        self.cards: dict[int, Card] = {}
        self.next_card = 1
        self.players: list[Player] = []
        self.docked: deque[Card] = deque()
        self.yield_ratio = float(p["behaviour.initial_yield_ratio"])
        self.rows: list[dict] = []
        self.failures: list[str] = []
        self.homecomings = 0
        self.renewals = 0
        self.today: dict = {}

    # ------------------------------------------------------------ cards

    def _new_card(self, owner: Player, kind: int) -> Card | None:
        if self.alive[kind] >= self.caps[kind]:
            self.today["cap_blocked"] += 1
            return None
        rarity, beam = self.decks[kind].draw(self.rng["draw"])
        lo, hi = self.bands[kind][rarity]
        power = lo + self.rng["draw"].randrange(hi - lo + 1)
        trait = rarity + 1 if kind == SPIRE else beam if kind == PRISM else self.rng["draw"].randrange(6)
        card = Card(self.next_card, kind, rarity, trait, power, self.voyages[kind], owner.id)
        self.next_card += 1
        self.cards[card.id] = card
        owner.cards[card.id] = card
        self.alive[kind] += 1
        return card

    def _pay(self, player: Player, total: int, split: dict[str, int], reason: str) -> None:
        to_pool = total * split["pool"] // BP
        to_burn = total * split["burn"] // BP
        to_treasury = total - to_pool - to_burn
        player.bought += self.ledger.pay(player.account, "pool", to_pool, f"{reason}_pool")
        player.bought += self.ledger.pay(player.account, "burned", to_burn, f"{reason}_burn")
        player.bought += self.ledger.pay(player.account, "treasury", to_treasury, f"{reason}_treasury")
        player.spent += total

    def summon(self, player: Player, kind: int) -> Card | None:
        card = self._new_card(player, kind)
        if card:
            self._pay(player, self.price[kind], self.split, "summon")
            self.today["summon_rvyn"] += self.price[kind]
        return card

    def acquire(self, player: Player, kind: int) -> Card | None:
        """A card for a team: a used one from the market (idle_inventory / order_book mode) or a new summon."""
        if self.market_mode == "idle_inventory":
            inv = self.inventory[kind]
            while inv:
                card = inv.popleft()
                if card.id in self.cards and card.docked_day is None and card.listed:
                    return self._buy_used(player, card, int(self.price[card.kind] * self.p["market.idle_price_vs_summon"]))
        elif self.book is not None:
            got = self.book.take(kind, self.day, self.alive[kind] >= self.caps[kind], self.cards)
            if got:
                return self._buy_used(player, *got)
        return self.summon(player, kind)

    def _buy_used(self, buyer: Player, card: Card, price: int) -> Card:
        tax = price * self.p["fees.market_tax_bp"] // BP
        tax_pool = tax * self.p["fees.tax_to_pool_bp"] // BP
        seller = self.players[card.owner]
        buyer.bought += self.ledger.pay(buyer.account, seller.account, price - tax, "market_sale")
        buyer.bought += self.ledger.pay(buyer.account, "pool", tax_pool, "market_tax_pool")
        buyer.bought += self.ledger.pay(buyer.account, "burned", tax - tax_pool, "market_tax_burn")
        buyer.spent += price
        seller.sold += price - tax
        del seller.cards[card.id]
        card.owner = buyer.id
        card.listed = False
        buyer.cards[card.id] = card
        self.today["market_trades"] += 1
        self.today["market_rvyn"] += price
        return card

    def renew(self, player: Player, card: Card) -> None:
        basis = self.price if self.p["summon.renew_basis"] == "current_price" else self.launch_price
        cost = basis[card.kind] * self.p["summon.renew_share_bp"] // BP
        self._pay(player, cost, self.split, "renew")
        card.voyages = self.voyages[card.kind]
        card.renewed = True
        card.docked_day = None
        self.renewals += 1
        self.today["renew_rvyn"] += cost

    def home(self, card: Card) -> None:
        owner = self.players[card.owner]
        owner.cards.pop(card.id, None)
        del self.cards[card.id]
        self.alive[card.kind] -= 1
        self.homecomings += 1

    # ------------------------------------------------------------ teams

    def build_team(self, player: Player, spire: Card | None = None, keep: list[Card] | None = None) -> bool:
        spire = spire or self.acquire(player, SPIRE)
        if spire is None:
            return False
        keep = keep or []
        for c in keep:
            c.on_team = False  # only the cards that fit the new team go back on it
        prism = next((c for c in keep if c.kind == PRISM), None) or self.acquire(player, PRISM)
        seekers = [c for c in keep if c.kind == SEEKER][: spire.trait]
        while len(seekers) < spire.trait:
            s = self.acquire(player, SEEKER)
            if s is None:
                break
            seekers.append(s)
        if not seekers:
            return False
        team = Team(spire, prism, seekers)
        for c in team.cards():
            c.on_team = True
        player.teams = [team]
        return True

    def quit(self, player: Player, day: int) -> None:
        player.active = False
        player.left_day = day
        for team in player.teams:
            for c in team.cards():
                c.on_team = False
        player.teams = []
        if self.book is not None:
            self.book.on_quit(player, day)
        elif self.market_mode == "idle_inventory":
            for c in player.cards.values():
                if c.docked_day is None:
                    c.listed = True
                    self.inventory[c.kind].append(c)

    def _retire(self, card: Card, day: int) -> None:
        card.on_team = False
        if card.renewed:
            self.home(card)
        else:
            card.docked_day = day
            self.docked.append(card)

    # ------------------------------------------------------------ one dive

    def dive(self, player: Player, team: Team, day: int, chain_day: int) -> bool:
        power = team.power
        dest = self.policy.destination(power)
        lights, _ = self.rules.sky(chain_day)
        bonus = self.rules.attunement_x100([(s.power, s.trait) for s in team.seekers], power, lights[dest])
        points = self.rules.points_e2(power, bonus, dest, chain_day)
        if not self.pool.reserve(day, points):
            return False
        rate = self.pool.day_rate[day]
        decision = self.policy.decision(self.rng["behave"])
        plan = self.rules.plan(dest, power, team.beam, chain_day, decision)
        r = self.rng["dive"]
        tier, mult = draw(plan.table, r.randrange(BP), r.getrandbits(64))
        wear = wear_of(plan, r.randrange(BP))
        t = self.today
        t["dives"] += 1
        t["mult_sum"] += mult
        if mult == 0:
            t["empty"] += 1
        else:
            gross = points * mult * rate // 10_000
            levy = gross * plan.levy_bp // BP
            credited = self.pool.credit(gross - levy)
            player.credit += credited
            player.earned += credited
            t["credited"] += credited
            t["levy"] += levy
            self.pool.burn_fee_share(levy, "levy_burn")
            self.ledger.flows["levy_pool"] += levy - levy * (BP - self.pool.tax_to_pool_bp) // BP
        player.passes_today += 1
        team.dives_today += 1
        if player.last_claim_day is None:
            player.last_claim_day = day
        self._wear(player, team, wear, day)
        return True

    def _wear(self, player: Player, team: Team, n: int, day: int) -> None:
        out: list[Card] = []
        for c in team.cards():
            c.voyages = max(0, c.voyages - n)
            if c.voyages == 0:
                out.append(c)
        if not out:
            return
        if not self.policy.keeps_playing(player, self.yield_ratio):
            for c in out:
                self._retire(c, day)
            self.quit(player, day)
            return
        for c in out:
            if not c.renewed and self.policy.renews(self.rng["behave"]):
                self.renew(player, c)  # docks and is renewed at once; stays on the team
            else:
                self._retire(c, day)
        # replace what left the team
        if team.spire.voyages == 0:
            keep = [c for c in team.cards() if c is not team.spire and c.voyages > 0]
            player.teams = []
            if not self.build_team(player, keep=keep):
                self.quit(player, day)
            return
        if team.prism is not None and team.prism.voyages == 0:
            team.prism = self.acquire(player, PRISM)
            if team.prism:
                team.prism.on_team = True
        team.seekers = [s for s in team.seekers if s.voyages > 0]
        while len(team.seekers) < team.spire.trait:
            s = self.acquire(player, SEEKER)
            if s is None:
                break
            s.on_team = True
            team.seekers.append(s)
        if not team.seekers:
            self.quit(player, day)

    # ------------------------------------------------------------ a day

    def _perceived_ratio(self, player: Player, rate: int) -> float | None:
        if not player.teams:
            return None
        team = player.teams[0]
        dest = self.policy.destination(team.power)
        cluster = dest // 4
        fee = claim_fee_bp(self.p["behaviour.claim_every_days"], self.p["fees.claim_fee_max_bp"], self.p["fees.claim_fee_step_bp"]) / BP
        daily = 3 * team.power * self.p["play.coef_bp"][dest] / BP * rate / WEI * (1 - self.p["play.levy_bp"][cluster] / BP) * (1 - fee)
        rr = self.p["behaviour.renew_rate"]
        renew = self.p["summon.renew_share_bp"] / BP
        wf = self.p["behaviour.wear_factor"][cluster]
        cost = 0.0
        for c in team.cards():
            life_days = self.voyages[c.kind] / 3
            cost += (self.price[c.kind] / WEI) * (1 + renew * rr) / (life_days * (1 + rr)) * wf
        return daily / cost if cost else None

    def step(self, day: int) -> None:
        chain_day = self.start + day
        self.day = day
        self.today = {k: 0 for k in ("new_players", "rejected_players", "cap_blocked", "dives", "blocked_dives", "empty", "mult_sum",
                                    "credited", "levy", "summon_rvyn", "renew_rvyn", "market_trades", "market_rvyn", "claims", "claimed", "claim_fee")}
        t = self.today
        for pl in self.players:
            pl.passes_today = 0
            for team in pl.teams:
                team.dives_today = 0

        # 2. keeper sends expired docked cards home
        delay = self.p["behaviour.keeper_delay_days"]
        keep: deque[Card] = deque()
        while self.docked:
            c = self.docked.popleft()
            if c.id not in self.cards or c.docked_day is None:
                continue
            if day >= c.docked_day + self.dock_days + delay:
                self.home(c)
            else:
                keep.append(c)
        self.docked = keep
        if self.book is not None:
            self.book.expire(day)

        # 3. newcomers
        for _ in range(self.policy.arrivals(day, self.yield_ratio, self.rng["arrivals"])):
            pl = Player(len(self.players), day, self.policy.new_threshold(self.rng["arrivals"]))
            self.players.append(pl)
            if self.build_team(pl):
                t["new_players"] += 1
            else:
                t["rejected_players"] += 1
                pl.active = False
                pl.left_day = day
                if self.book is not None:  # cards bought before the team failed (e.g. a spire, then no seekers)
                    self.book.on_quit(pl, day)

        # 4. dives, players in random order
        order = [pl for pl in self.players if pl.active]
        self.rng["order"].shuffle(order)
        full = False
        for pl in order:
            while pl.active and pl.teams and pl.passes_today < self.passes:
                team = pl.teams[0]
                if team.dives_today >= self.team_dives or not team.seekers:
                    break
                if full or not self.dive(pl, team, day, chain_day):
                    full = True
                    t["blocked_dives"] += self.passes - pl.passes_today
                    break

        # 5. market tax (fixed ratio of the day's summons, paid by buyers from outside the game)
        if self.market_mode == "fixed_ratio":
            trade = int(t["summon_rvyn"] * self.p["market.trade_volume_vs_mint"])
            tax = trade * self.p["fees.market_tax_bp"] // BP
            tax_pool = tax * self.p["fees.tax_to_pool_bp"] // BP
            self.ledger.move("outside", "pool", tax_pool, "market_tax_pool")
            self.ledger.move("outside", "burned", tax - tax_pool, "market_tax_burn")

        # 6. claims
        for pl in self.players:
            if self.policy.claims_today(pl, day):
                fee = pl.credit * claim_fee_bp(day - pl.last_claim_day, self.p["fees.claim_fee_max_bp"], self.p["fees.claim_fee_step_bp"]) // BP
                self.pool.pay_claim(pl.account, pl.credit, fee)
                pl.received += pl.credit - fee
                t["claims"] += 1
                t["claimed"] += pl.credit - fee
                t["claim_fee"] += fee
                pl.credit = 0
                pl.last_claim_day = day

        # 7. perceived ratio (sim-v3's smoothing), metrics, invariants
        rate = self.pool.day_rate.get(day, self.pool.cap)
        ratios = [r for r in (self._perceived_ratio(pl, rate) for pl in self.players if pl.active) if r is not None]
        avg = sum(ratios) / len(ratios) if ratios else 2.0
        s = self.p["behaviour.ratio_smoothing"]
        self.yield_ratio = s * self.yield_ratio + (1 - s) * avg
        self._record(day, rate, avg)
        if self.checks:
            self.check(day)

    def _record(self, day: int, rate: int, avg_ratio: float) -> None:
        t = self.today
        b = self.ledger.bal
        active = sum(1 for pl in self.players if pl.active)
        idle_spires = sum(1 for c in self.cards.values() if c.kind == SPIRE and not c.on_team and c.docked_day is None)
        self.rows.append({
            "day": day + 1, "players_active": active, "players_total": len(self.players), "new_players": t["new_players"],
            "rejected_players": t["rejected_players"], "cap_blocked": t["cap_blocked"], "dives": t["dives"], "blocked_dives": t["blocked_dives"],
            "empty_share": t["empty"] / t["dives"] if t["dives"] else 0.0, "avg_mult": t["mult_sum"] / t["dives"] / 100 if t["dives"] else 0.0,
            "rate": rate / WEI, "ceiling": self.pool.day_ceiling.get(day, 0) / WEI, "reserved": self.pool.day_reserved.get(day, 0) / WEI,
            "credited": t["credited"] / WEI, "levy": t["levy"] / WEI, "claimed": t["claimed"] / WEI, "claim_fee": t["claim_fee"] / WEI,
            "summon_rvyn": t["summon_rvyn"] / WEI, "renew_rvyn": t["renew_rvyn"] / WEI, "market_trades": t["market_trades"],
            "market_rvyn": t["market_rvyn"] / WEI, "listings_open": sum(self.book.open) if self.book else 0,
            "listed_spires": self.book.open[0] if self.book else 0, "delisted": self.book.delisted if self.book else 0,
            "pool_balance": b["pool"] / WEI, "pool_available": self.pool.available / WEI, "owed": self.pool.owed / WEI,
            "burned": b["burned"] / WEI, "treasury": b["treasury"] / WEI,
            "alive_spire": self.alive[0], "alive_prism": self.alive[1], "alive_seeker": self.alive[2], "idle_spires": idle_spires,
            "docked": sum(1 for c in self.cards.values() if c.docked_day is not None), "homecomings": self.homecomings, "renewals": self.renewals,
            "yield_ratio": self.yield_ratio, "avg_ratio": avg_ratio,
        })

    def check(self, day: int) -> None:
        """Invariants I1-I7 of the round 1 test plan; a failure stops the run with the day's state."""
        self.ledger.check()                                                       # I1 conservation
        self.pool.check(day)                                                      # I2 solvency, I3 ceiling and cap
        for k in range(3):                                                        # I5 caps
            if self.alive[k] > self.caps[k]:
                raise AssertionError(f"day {day}: {KIND_NAMES[k]} alive {self.alive[k]} over cap {self.caps[k]}")
            if self.alive[k] != sum(1 for c in self.cards.values() if c.kind == k):
                raise AssertionError(f"day {day}: alive count drifted for {KIND_NAMES[k]}")
        for c in self.cards.values():
            if c.voyages < 0 or (c.renewed and c.docked_day is not None):
                raise AssertionError(f"day {day}: card {c.id} in an impossible state")
        for pl in self.players:                                                   # I6 limits
            if pl.passes_today > self.passes or len(pl.teams) > self.p["play.max_teams"]:
                raise AssertionError(f"day {day}: player {pl.id} over the limits")
            for team in pl.teams:
                if team.dives_today > self.team_dives or len(team.seekers) > team.spire.trait:
                    raise AssertionError(f"day {day}: team over the limits")
        owed = sum(pl.credit for pl in self.players)
        if owed != self.pool.owed:
            raise AssertionError(f"day {day}: player credits {owed} != pool owed {self.pool.owed}")

    def run(self) -> "Sim":
        for day in range(self.days):
            self.step(day)
        return self

    # ------------------------------------------------------------ results

    def players_summary(self) -> dict:
        joined = [pl for pl in self.players if pl.spent > 0]
        if not joined:
            return {}
        rois = sorted((pl.received + pl.credit + pl.sold) / pl.spent for pl in joined)
        pct = lambda q: rois[min(len(rois) - 1, int(q * (len(rois) - 1)))]
        return {
            "players": len(joined),
            "roi_p10": pct(0.1), "roi_p50": pct(0.5), "roi_p90": pct(0.9), "roi_p99": pct(0.99),
            "share_roi_at_least_1": sum(1 for r in rois if r >= 1) / len(rois),
            "spent_total": sum(pl.spent for pl in joined) / WEI,
            "received_total": sum(pl.received for pl in joined) / WEI,
            "unclaimed_credit": sum(pl.credit for pl in joined) / WEI,
            "sold_total": sum(pl.sold for pl in joined) / WEI,
        }


def write_csv(rows: list[dict], path: Path) -> None:
    import csv
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        for r in rows:
            w.writerow({k: (f"{v:.8f}" if isinstance(v, float) else v) for k, v in r.items()})
