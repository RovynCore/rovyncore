"""T1-T4: the rules match the v3 contract exactly (vectors exported from LightdiveConfig3)."""
import json
import random

import pytest

from lightdive_sim.keccak import keccak256
from lightdive_sim.params import ROOT, Params
from lightdive_sim.rules import Rules, _avg2, _positions, _reshape, claim_fee_bp, draw

P = Params.load()
ODDS = json.loads((ROOT / "data" / "odds.json").read_text(encoding="utf-8"))
VECTORS = json.loads((ROOT / "data" / "contract-vectors.json").read_text(encoding="utf-8"))
RULES = Rules(ODDS, P["play.thresholds"], P["play.coef_bp"], P["play.levy_bp"], P["play.wear2_bp"], P["play.wear3_bp"])


def test_keccak_known_vectors():
    assert keccak256(b"").hex() == "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470"
    assert keccak256(b"abc").hex() == "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45"
    assert keccak256(b"a" * 200).hex() != keccak256(b"a" * 201).hex()  # multi-block input


def test_tables_sum_and_average():
    """T1: 18 tables, probabilities sum to 10,000 bp, average multiplier exactly 1.00, top at most x10."""
    assert len(ODDS) == 18
    for key, t in ODDS.items():
        assert sum(r[0] for r in t) == 10_000, key
        assert sum(p * (lo + hi) for p, lo, hi in t) == 2_000_000, key
        assert max(r[2] for r in t) <= 1000, key
        assert t[0][1:] == [0, 0], key


def test_sky_matches_contract():
    """T3: daily light and star events are the contract's keccak formula."""
    for s in VECTORS["sky"]:
        lights, events = RULES.sky(s["day"])
        assert list(lights) == s["lights"], s["day"]
        assert [[d, k] for d, k in events.items()] == s["events"], s["day"]


def test_plans_match_contract():
    """T2: 3,456 plans (3 days x 24 destinations x 3 beams x 4 powers x 4 decisions) match LightdiveConfig3.plan."""
    assert len(VECTORS["plans"]) == 3456
    for v in VECTORS["plans"]:
        q = RULES.plan(v["dest"], v["power"], v["beam"], v["day"], v["decision"])
        got = ([list(t) for t in q.table], q.risk, q.star_event, q.coef_bp, q.levy_bp, q.wear2_bp, q.wear3_bp)
        want = (v["table"], v["risk"], v["starEvent"], v["coefBp"], v["levyBp"], v["wear2Bp"], v["wear3Bp"])
        assert got == want, v


def test_claim_fee_matches_contract():
    for days, bp in VECTORS["claimFee"]:
        assert claim_fee_bp(days, P["fees.claim_fee_max_bp"], P["fees.claim_fee_step_bp"]) == bp


@pytest.mark.parametrize("key", sorted(ODDS))
def test_decision_averages(key):
    """T4: steady and bold reshape a table to 97% / 103% of its average, within integer rounding (0.5%)."""
    base = [list(r) for r in ODDS[key]]
    at = _positions(base)
    for steady, target in ((True, 0.97), (False, 1.03)):
        t = _reshape(base, at, steady)
        assert sum(r[0] for r in t) == 10_000
        assert abs(_avg2(t) / _avg2(base) - target) < 0.005, (key, steady)
        if steady:
            assert t[0][0] == 0, "steady never comes back empty"


def test_draw_converges_to_one():
    """T6: one million draws from the most volatile table average x1.00 within 0.01."""
    table = tuple(tuple(r) for r in ODDS["6針芒"])
    rng = random.Random(7)
    n = 1_000_000
    total = 0
    for _ in range(n):
        total += draw(table, rng.randrange(10_000), rng.getrandbits(64))[1]
    assert abs(total / n / 100 - 1.0) < 0.01
