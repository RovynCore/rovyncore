import sim
BASE = dict(sim.P)
def go(name, **kw):
    sim.P.clear(); sim.P.update(BASE); sim.P.update(kw)
    s = sim.avg_setup()
    sim.P["yield_cap_per_lum"] = 2.0 * s["cost_day"] / (s["lum"] * 1.05) / (1 - 0.15*(1-7/15))
    out = []
    for sc in ("base", "bust"):
        r = sim.run(sc)
        steady = sum(x["ratio"] for x in r[59:]) / len(r[59:])
        out.append((sc, steady, r[-1]["pool"], min(x["pool"] for x in r), sum(x["players"] for x in r)/365,
                    r[-1]["burned"], r[-1]["treasury"], sum(x["spend"] for x in r), r[0]["emission"]))
    print(f"\n== {name}  cost/day={s['cost_day']:.2f}  upfront={s['upfront']:.0f}")
    for sc, st, p365, pmin, avgp, b, t, sp, e1 in out:
        print(f"  {sc:4} 穩定收支比={st:.2f} 池365={p365/1e3:6.0f}k 池最低={pmin/1e3:5.0f}k 平均光塔={avgp:5.0f} 一年鑄造額={sp/1e6:5.2f}M 銷毀={b/1e3:5.0f}k 金庫={t/1e3:5.0f}k")
go("A 原提案", )
go("B 你的: 100萬 / 1.0% / 70-15-15", pool_seed=1_000_000, emission_rate=0.010, split_pool=.70, split_burn=.15, split_treasury=.15)
go("C B + 80萬", pool_seed=800_000, emission_rate=0.010, split_pool=.70, split_burn=.15, split_treasury=.15)
go("D B + 0.8%", pool_seed=1_000_000, emission_rate=0.008, split_pool=.70, split_burn=.15, split_treasury=.15)
kw = dict(pool_seed=1_000_000, emission_rate=0.010, split_pool=.70, split_burn=.15, split_treasury=.15)
go("E B + 次數大減 光塔60/稜鏡30/探索者10", life_spire=60, life_prism=30, life_seeker=10, **kw)
go("F B + 次數減半 光塔90/稜鏡45/探索者15", life_spire=90, life_prism=45, life_seeker=15, **kw)
go("G F + 價格x1.5 (450/180/60)", life_spire=90, life_prism=45, life_seeker=15, price_spire=450, price_prism=180, price_seeker=60, **kw)
go("H F + 價格x2 (600/240/80)", life_spire=90, life_prism=45, life_seeker=15, price_spire=600, price_prism=240, price_seeker=80, **kw)

print("\n--- 一年合計：玩家領走 ÷ 玩家投入 ---")
def agg(name, **kw):
    sim.P.clear(); sim.P.update(BASE); sim.P.update(kw)
    s = sim.avg_setup()
    sim.P["yield_cap_per_lum"] = 2.0 * s["cost_day"] / (s["lum"] * 1.05) / (1 - 0.15*(1-7/15))
    res = []
    for sc in ("base", "boom", "bust"):
        r = sim.run(sc)
        res.append(f"{sc} {sum(x['paid'] for x in r)/sum(x['spend'] for x in r):.2f}")
    print(f"{name:34} " + "  ".join(res))
agg("A 原提案")
agg("B 100萬/1.0%/70-15-15", **kw)
agg("D 100萬/0.8%/70-15-15", pool_seed=1_000_000, emission_rate=0.008, split_pool=.70, split_burn=.15, split_treasury=.15)
agg("E B+60/30/10", life_spire=60, life_prism=30, life_seeker=10, **kw)
agg("F B+90/45/15", life_spire=90, life_prism=45, life_seeker=15, **kw)
agg("G F+價格x1.5", life_spire=90, life_prism=45, life_seeker=15, price_spire=450, price_prism=180, price_seeker=60, **kw)
