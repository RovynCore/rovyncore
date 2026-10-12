"""Command line.
  python -m lightdive_sim run <scenario> [--days N] [--seed S]   one scenario -> reports/<scenario>/
  python -m lightdive_sim all [--seeds N]                         every scenario, seed spread, comparison report
  python -m lightdive_sim sweep <scenario> --key K --values a,b,c [--seeds N] [--days D]
                                                                  one setting varied over values -> reports/sweep-<scenario>/
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import time

from .engine import Sim, write_csv
from .params import ROOT, Params
from .report import comparison_report, charts, sweep_report

SCENARIOS = ["base", "boom", "bust", "idle-market", "fail-tiny-pool", "fail-surge", "fail-keeper-down", "market-c", "market-c-boom"]


def override(scenario: str, key: str, value) -> dict:
    """An override tree setting `key`; a key inside an entry's value (e.g. market.order_book.list_rate) keeps the rest."""
    p = Params.load(scenario)
    parts = key.split(".")
    for i in range(len(parts), 0, -1):
        head = ".".join(parts[:i])
        try:
            entry = p.entry(head)
        except Exception:
            continue
        if "value" not in entry:
            break
        val = copy.deepcopy(entry["value"])
        if i == len(parts):
            val = value
        else:
            node = val
            for k in parts[i:-1]:
                node = node[k]
            if parts[-1] not in node:
                raise SystemExit(f"unknown setting {key}")
            node[parts[-1]] = value
        tree: dict = {"value": val}
        for k in reversed(parts[:i]):
            tree = {k: tree}
        return tree
    raise SystemExit(f"unknown setting {key}")


def run_one(scenario: str, days: int | None = None, seed: int | None = None, out_dir=None, quiet=False, overrides: dict | None = None,
            label: str | None = None) -> dict:
    p = Params.load(scenario, overrides)
    t0 = time.perf_counter()
    error = None
    sim = Sim(p, seed=seed, days=days)
    try:
        sim.run()
    except AssertionError as e:  # an invariant failed: keep the state, report it, do not hide it
        error = f"{type(e).__name__}: {e}"
    elapsed = time.perf_counter() - t0
    out = out_dir or (ROOT / "reports" / scenario)
    out.mkdir(parents=True, exist_ok=True)
    if sim.rows:
        write_csv(sim.rows, out / "daily.csv")
    digest = hashlib.sha256((out / "daily.csv").read_bytes()).hexdigest() if sim.rows else ""
    last = sim.rows[-1] if sim.rows else {}
    summary = {
        "scenario": label or scenario, "seed": sim.seed, "days_run": len(sim.rows), "config_digest": p.digest(), "daily_csv_sha256": digest,
        "runtime_seconds": round(elapsed, 2), "invariant_failure": error, "final_day": last,
        "players": sim.players_summary(), "pool_shortfall_rvyn": sim.pool.shortfall / 10**18,
        "days_with_blocked_dives": sum(1 for r in sim.rows if r["blocked_dives"] > 0),
        "blocked_dives_total": sum(r["blocked_dives"] for r in sim.rows),
        "rejected_players_total": sum(r["rejected_players"] for r in sim.rows),
        "flows_rvyn": {k: v / 10**18 for k, v in sorted(sim.ledger.flows.items())},
        "market": {
            "trades": sum(r["market_trades"] for r in sim.rows), "volume_rvyn": sum(r["market_rvyn"] for r in sim.rows),
            "sellers": sim.book.sellers if sim.book else None, "walked_away": sim.book.walked_away if sim.book else None,
            "delisted": sim.book.delisted if sim.book else None,
        },
    }
    (out / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")
    if not quiet:
        print(f"{label or scenario:18} days {len(sim.rows):3}  pool {last.get('pool_balance', 0):>12,.0f}  rate {last.get('rate', 0):.5f}  "
              f"active {last.get('players_active', 0):5}  {elapsed:5.1f}s  {'FAIL ' + error if error else 'ok'}")
    return summary


def main() -> None:
    ap = argparse.ArgumentParser(prog="lightdive_sim")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("run")
    r.add_argument("scenario")
    r.add_argument("--days", type=int)
    r.add_argument("--seed", type=int)
    a = sub.add_parser("all")
    a.add_argument("--seeds", type=int, default=5, help="seeds per main scenario for the spread")
    w = sub.add_parser("sweep")
    w.add_argument("scenario")
    w.add_argument("--key", required=True)
    w.add_argument("--values", required=True, help="comma separated numbers")
    w.add_argument("--seeds", type=int, default=3)
    w.add_argument("--days", type=int)
    args = ap.parse_args()
    if args.cmd == "run":
        run_one(args.scenario, args.days, args.seed)
        return
    if args.cmd == "sweep":
        values = [float(v) for v in args.values.split(",")]
        base_dir = ROOT / "reports" / f"sweep-{args.scenario}"
        runs: dict[float, list[dict]] = {}
        for v in values:
            runs[v] = []
            for i in range(args.seeds):
                seed = None if i == 0 else 1000 + i
                label = f"{args.key.split('.')[-1]}={v:g} s{i}"
                out = base_dir / f"{v:g}-s{i}"
                runs[v].append(run_one(args.scenario, args.days, seed, out_dir=out, overrides=override(args.scenario, args.key, v), label=label))
        sweep_report(args.scenario, args.key, runs, base_dir)
        print("sweep written to", base_dir)
        return
    results = {s: run_one(s) for s in SCENARIOS}
    spread: dict[str, list[dict]] = {}
    for s in ("base", "boom", "bust"):
        spread[s] = []
        for i in range(args.seeds):
            out = ROOT / "reports" / "_spread" / f"{s}-{i}"
            spread[s].append(run_one(s, seed=1000 + i, out_dir=out, quiet=True))
    (ROOT / "reports" / "spread.json").write_text(json.dumps(spread, indent=1, ensure_ascii=False), encoding="utf-8")
    charts(SCENARIOS)
    comparison_report(results, spread)
    print("reports written to", ROOT / "reports")


if __name__ == "__main__":
    main()
