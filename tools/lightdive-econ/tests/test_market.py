"""Decision C (10-10): the order-book market. Asks fall to a floor, sellers give up, buyers take the cheapest per voyage,
and more sellers free more of the spire cap."""
import random

from lightdive_sim.engine import Sim
from lightdive_sim.entities import SPIRE, Card, Player
from lightdive_sim.market import OrderBook
from lightdive_sim.params import Params
from lightdive_sim.__main__ import override

WEI = 10**18


def book(**changes) -> OrderBook:
    p = Params.load("market-c", override("market-c", "market.order_book", {**Params.load("market-c")["market.order_book"], **changes}))
    return OrderBook(p, [50 * WEI, 30 * WEI, 20 * WEI], [180, 135, 45], random.Random(1))


def seller(cards: list[Card]) -> Player:
    pl = Player(0, 0, 1.0)
    pl.cards = {c.id: c for c in cards}
    return pl


def test_ask_falls_to_the_floor_and_sellers_give_up():
    b = book(list_rate=1.0, ask_start_range=[0.8, 0.8], markdown_per_day=0.1, ask_floor=0.3, delist_after_days=20)
    card = Card(1, SPIRE, 0, 1, 50, 90, owner=0)
    b.on_quit(seller([card]), day=0)
    ls = b.heaps[SPIRE][0][2]
    assert b.ask(ls, 0) == 50 * WEI * 0.8 * 90 // 180   # half the voyages left: half of 80% of the new price
    assert b.factor(ls, 5) < 0.8 and b.factor(ls, 100) == 0.3
    b.expire(20)
    assert b.open[SPIRE] == 1
    b.expire(21)
    assert b.open[SPIRE] == 0 and b.delisted == 1 and not card.listed


def test_buyers_take_the_cheapest_per_voyage_only_when_it_beats_new():
    b = book(list_rate=1.0, ask_start_range=[0.95, 0.95], markdown_per_day=0.0, ask_floor=0.2, buy_vs_new=0.9, buy_vs_new_capped=1.0)
    dear = Card(1, SPIRE, 0, 1, 50, 180, owner=0)
    b.on_quit(seller([dear]), day=0)
    alive = {1: dear}
    assert b.take(SPIRE, 1, capped=False, alive=alive) is None          # 95% of new: not cheap enough
    got = b.take(SPIRE, 1, capped=True, alive=alive)                   # but taken when summoning is blocked
    assert got and got[0] is dear and got[1] == 50 * WEI * 95 // 100
    assert b.open[SPIRE] == 0


def test_listing_order_follows_price_across_days():
    b = book(list_rate=1.0, markdown_per_day=0.05)
    b.ask_lo = b.ask_hi = 0.9
    old = Card(1, SPIRE, 0, 1, 50, 180, owner=0)
    b.on_quit(seller([old]), day=0)
    b.ask_lo = b.ask_hi = 0.7
    new = Card(2, SPIRE, 0, 1, 50, 180, owner=0)
    b.on_quit(seller([new]), day=10)                                    # 0.9 x 0.95^10 = 0.54 < 0.7: the old one is cheaper
    assert b.best(SPIRE, {1: old, 2: new}).card is old


def test_market_c_invariants_and_seller_proceeds():
    sim = Sim(Params.load("market-c"), days=150).run()
    assert sum(r["market_trades"] for r in sim.rows) > 0
    assert sum(pl.sold for pl in sim.players) == sim.ledger.flows["market_sale"]
    assert sim.pool.owed <= sim.ledger.bal["pool"]


def test_more_sellers_free_more_of_the_cap():
    runs = {}
    for rate in (0.0, 1.0):
        p = Params.load("market-c", override("market-c", "market.order_book.list_rate", rate))
        runs[rate] = Sim(p, days=200).run().rows
    rejected = {k: sum(r["rejected_players"] for r in v) for k, v in runs.items()}
    assert sum(r["market_trades"] for r in runs[0.0]) == 0
    assert rejected[1.0] < rejected[0.0]
    assert runs[1.0][-1]["players_active"] > runs[0.0][-1]["players_active"]
