"""Lightdive economy simulator (whitepaper v0.1).

Everything is denominated in RVYN. No RVYN market price is modelled: the point is to
show how the reward pool, emission, burn and per-player yield behave as the player
count changes, independent of price.
"""
import json
import math
import random
import sys

DAYS = 365

P = dict(
    pool_seed=1_000_000,        # RVYN moved from Product & Ecosystem allocation
    emission_rate=0.010,        # share of pool emitted per daily epoch
    price_spire=300, price_prism=120, price_seeker=40,
    life_spire=120, life_prism=30, life_seeker=10,
    split_pool=0.70, split_burn=0.15, split_treasury=0.15,
    claim_fee_max=0.15, claim_fee_days=15,
    spire_cap_per_season=3000, season_days=180,
    yield_cap_per_lum=0.18,     # max RVYN per Lightdust-base point per day (launch guard)
)

# Average setup per player (from rarity decks, see whitepaper section 6)
SPIRE_DECK = {1: 1440, 2: 870, 3: 450, 4: 210, 5: 30}
SPIRE_LUM = {1: 40, 2: 70, 3: 110, 4: 160, 5: 230}
PRISM_LUM = {1: 10, 2: 20, 3: 32, 4: 48, 5: 70}
SEEKER_LUM = {1: 25, 2: 38.5, 3: 58, 4: 87.5, 5: 140}  # range midpoints
RARITY_W = {1: .50, 2: .28, 3: .15, 4: .06, 5: .01}
DEPTH_COEF = 1.05  # average depth coefficient across coordinates

BEAMS = {  # (probability_bp, low_x100, high_x100); multiplier uniform in [low, high] at 0.01 steps
    "wide":    [(1500, 0, 0), (7200, 100, 120), (1300, 140, 180)],
    "focused": [(2250, 0, 0), (6050, 100, 120), (1330, 150, 200), (370, 250, 300)],
    "needle":  [(4500, 0, 0), (2700, 100, 120), (1850, 180, 220), (870, 260, 340), (80, 800, 1000)],
}


def check_beams():
    out = {}
    for name, rows in BEAMS.items():
        total = sum(p for p, _, _ in rows)
        ev_num = sum(p * (lo + hi) for p, lo, hi in rows)  # = 2 * sum(p * mid * 100)
        assert total == 10_000, (name, total)
        assert ev_num == 2 * 10_000 * 100, (name, ev_num)
        e2 = 0.0
        for p, lo, hi in rows:
            vals = range(lo, hi + 1)
            e2 += p / 1e4 * sum((v / 100) ** 2 for v in vals) / len(vals)
        out[name] = dict(ev=ev_num / 2e6, sd=math.sqrt(e2 - 1), fail=rows[0][0] / 100)
    return out


def avg_setup():
    n = sum(SPIRE_DECK.values())
    seats = sum(lv * c for lv, c in SPIRE_DECK.items()) / n
    spire = sum(SPIRE_LUM[lv] * c for lv, c in SPIRE_DECK.items()) / n
    prism = sum(PRISM_LUM[r] * w for r, w in RARITY_W.items())
    seeker = sum(SEEKER_LUM[r] * w for r, w in RARITY_W.items())
    lum = spire + prism + seats * seeker
    cost_day = (P["price_spire"] / P["life_spire"] + P["price_prism"] / P["life_prism"]
                + seats * P["price_seeker"] / P["life_seeker"])
    return dict(seats=seats, lum=lum, cost_day=cost_day,
                upfront=P["price_spire"] + P["price_prism"] + seats * P["price_seeker"])


def arrivals(day, scenario):
    ramp = min(day / 30, 1.0)
    if scenario == "base":
        base = 60 * ramp if day < 90 else max(8, 60 * 0.98 ** (day - 90))
    elif scenario == "boom":
        base = 300 * ramp if day < 90 else max(30, 300 * 0.98 ** (day - 90))
    elif scenario == "bust":
        base = 60 * ramp if day < 45 else 0
    return base


def run(scenario, seed=7):
    rng = random.Random(seed)
    s = avg_setup()
    pool = P["pool_seed"]
    burned = treasury = emitted = 0.0
    players = []  # dict(next_seeker, next_prism, next_spire, threshold)
    spires_minted_season = 0
    rows = []
    yield_ratio = 2.0  # attractiveness signal seen by newcomers (trailing)
    for d in range(DAYS):
        season_start = (d % P["season_days"]) == 0
        if season_start:
            spires_minted_season = 0
        spend = 0.0
        # Renewals for existing players
        survivors = []
        for pl in players:
            alive = True
            for key, price, life in (("next_seeker", s["seats"] * P["price_seeker"], P["life_seeker"]),
                                     ("next_prism", P["price_prism"], P["life_prism"]),
                                     ("next_spire", P["price_spire"], P["life_spire"])):
                if pl[key] == d:
                    if yield_ratio >= pl["threshold"]:  # renewal frees and reuses the same circulating slot
                        spend += price
                        pl[key] = d + life
                        if key == "next_spire":
                            spires_minted_season += 1
                    else:
                        alive = False
            if alive:
                survivors.append(pl)
        players = survivors
        # Newcomers react to recent yield
        want = arrivals(d, scenario) * max(0.2, min(1.5, yield_ratio))
        n_new = int(want) + (1 if rng.random() < want - int(want) else 0)
        n_new = min(n_new, P["spire_cap_per_season"] - len(players))  # circulating (alive) cap
        for _ in range(max(0, n_new)):
            players.append(dict(next_seeker=d + P["life_seeker"], next_prism=d + P["life_prism"],
                                next_spire=d + P["life_spire"], threshold=rng.uniform(0.35, 1.2)))
            spend += s["upfront"]
            spires_minted_season += 1
        # Fee split
        pool += spend * P["split_pool"]
        burned += spend * P["split_burn"]
        treasury += spend * P["split_treasury"]
        # Daily epoch: emission is a fixed share of pool, shared by Lightdust
        total_lum = len(players) * s["lum"] * DEPTH_COEF
        emission = min(pool * P["emission_rate"], total_lum * P["yield_cap_per_lum"]) if players else 0.0
        pool -= emission
        emitted += emission
        # Claim fee recycled: assume average claim interval of 7 days -> fee 15% * (1 - 7/15)
        recycled = emission * P["claim_fee_max"] * (1 - 7 / P["claim_fee_days"])
        pool += recycled
        net_paid = emission - recycled
        per_player = net_paid / len(players) if players else 0.0
        ratio_today = per_player / s["cost_day"] if players else 2.0
        yield_ratio = 0.8 * yield_ratio + 0.2 * ratio_today
        fixed_model = len(players) * s["cost_day"] * 1.5  # "fixed reward" counterfactual: 1.5x cost/day per player
        capped = emission < pool * P["emission_rate"] - 1e-9
        rows.append(dict(day=d + 1, capped=capped, players=len(players), pool=pool, emission=emission,
                         paid=net_paid, spend=spend, burned=burned, treasury=treasury,
                         emitted=emitted, per_player=per_player, ratio=ratio_today,
                         total_lum=total_lum, fixed_model=fixed_model))
    return rows


if __name__ == "__main__":
    beams = check_beams()
    setup = avg_setup()
    res = {sc: run(sc) for sc in ("base", "boom", "bust")}
    b90 = res["base"][89]
    rate = b90["paid"] / b90["total_lum"]
    cap_rate = P["yield_cap_per_lum"] * (1 - P["claim_fee_max"] * (1 - 7 / P["claim_fee_days"]))
    def setup_row(name, lv, prism_r, seekers):
        lum = SPIRE_LUM[lv] + PRISM_LUM[prism_r] + sum(SEEKER_LUM[r] for r in seekers)
        cost = P["price_spire"] / P["life_spire"] + P["price_prism"] / P["life_prism"] + len(seekers) * P["price_seeker"] / P["life_seeker"]
        return dict(name=name, lum=lum, cost=cost, day_mid=lum * rate, ratio_mid=lum * rate / cost,
                    day_cap=lum * cap_rate, ratio_cap=lum * cap_rate / cost)
    table = [
        setup_row("starter", 1, 1, [1]),
        setup_row("avg", 2, 1, [1, 2]),
        setup_row("clear", 3, 3, [3, 2, 1]),
        setup_row("spectral", 4, 4, [4, 3, 3, 2]),
        setup_row("radiant", 5, 5, [5] * 5),
    ]
    out = dict(params=P, beams=beams, setup=setup, results=res, rate=rate, cap_rate=cap_rate, table=table)
    for t in table: print(t)
    print("rate", rate, "cap_rate", cap_rate)
    json.dump(out, open(sys.argv[1] if len(sys.argv) > 1 else "sim.json", "w"))
    print("beams", json.dumps(beams, indent=1))
    print("setup", setup)
    for sc, rows in res.items():
        for d in (30, 90, 180, 365):
            r = rows[d - 1]
            print(f"{sc:5} d{d:3} players={r['players']:5} pool={r['pool']:9.0f} emis={r['emission']:6.0f} "
                  f"perP={r['per_player']:5.2f} ratio={r['ratio']:4.2f} burned={r['burned']:9.0f} treas={r['treasury']:9.0f}")
