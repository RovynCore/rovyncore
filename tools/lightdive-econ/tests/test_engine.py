"""Engine-level tests: invariants every day (I1-I7), determinism (T5), ledger and config safety."""
import pytest

from lightdive_sim.engine import Sim
from lightdive_sim.ledger import WEI, Ledger, LedgerError
from lightdive_sim.params import ConfigError, Params


def test_ledger_conserves_and_refuses_overdraft():
    lg = Ledger(outside=100, ecosystem=50)
    lg.move("outside", "pool", 30, "x")
    lg.pay("player:1", "burned", 20, "y")  # buys the 20 it lacks from outside
    lg.check()
    assert lg.bal["burned"] == 20 and lg.bal["outside"] == 50
    with pytest.raises(LedgerError):
        lg.move("pool", "treasury", 31, "too much")
    with pytest.raises(LedgerError):
        lg.move("pool", "treasury", -1, "negative")


def test_config_requires_a_source_for_every_value():
    with pytest.raises(ConfigError):
        Params({"pool": {"emission_bp": {"value": 100}}})
    with pytest.raises(ConfigError):
        Params({"pool": {"emission_bp": {"value": 100, "source": "rumour"}}})
    p = Params.load("boom")
    assert p["behaviour.arrivals"]["peak"] == 300
    assert p.entry("behaviour.arrivals")["source"] == "assumption"  # scenario overrides keep the source tag


@pytest.mark.parametrize("scenario,days", [("base", 120), ("idle-market", 120), ("market-c", 120), ("fail-tiny-pool", 60), ("fail-surge", 80), ("fail-keeper-down", 90)])
def test_invariants_hold_every_day(scenario, days):
    """I1-I7 are checked inside the engine at the end of every day; any failure raises."""
    sim = Sim(Params.load(scenario), days=days).run()
    assert len(sim.rows) == days
    for r in sim.rows:
        assert r["reserved"] <= r["ceiling"] + 1e-9
        assert r["rate"] <= 0.015 + 1e-12
        assert r["alive_spire"] <= 3000 and r["alive_prism"] <= 6000 and r["alive_seeker"] <= 12_000


def test_rvyn_totals_add_up():
    sim = Sim(Params.load("base"), days=45).run()
    b = sim.ledger.bal
    players = sum(v for k, v in b.items() if k.startswith("player:"))
    assert b["outside"] + b["ecosystem"] + players + b["pool"] + b["treasury"] + b["burned"] + b["market"] == sim.ledger.total
    assert sum(pl.credit for pl in sim.players) == sim.pool.owed
    assert sim.pool.owed <= b["pool"]


def test_same_seed_same_result_other_seed_differs():
    a = Sim(Params.load("base"), days=40).run().rows
    b = Sim(Params.load("base"), days=40).run().rows
    c = Sim(Params.load("base"), seed=99, days=40).run().rows
    assert a == b
    assert a != c


def test_ceiling_blocks_a_launch_rush_and_a_tiny_pool_stays_solvent():
    """The surge scenario must hit the daily ceiling (dives refused), and the tiny pool must never owe more than it holds."""
    surge = Sim(Params.load("fail-surge"), days=20).run()
    assert sum(r["blocked_dives"] for r in surge.rows) > 0
    tiny = Sim(Params.load("fail-tiny-pool"), days=60).run()
    assert tiny.pool.owed <= tiny.ledger.bal["pool"]
    assert all(r["pool_balance"] >= 0 for r in tiny.rows)
    base = Sim(Params.load("base"), days=60).run()
    assert tiny.rows[-1]["rate"] < base.rows[-1]["rate"]  # smaller release; summon income refills it (about half the base rate by day 60)


def test_caps_block_newcomers_when_idle_cards_hold_them():
    """Finding R8: with no resale, cards of players who quit stay alive and keep the spire cap full."""
    sim = Sim(Params.load("base"), days=120).run()
    late = sim.rows[-1]
    assert late["alive_spire"] == 3000
    assert late["idle_spires"] > 0
    assert sum(r["rejected_players"] for r in sim.rows) > 0
