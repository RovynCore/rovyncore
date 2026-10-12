# Lightdive v3 economy simulator (round 1)

An offline, reproducible model of the Lightdive v3 economy, built on the same rules as the v3 contracts
(`packages/contracts/lightdive-v3`, unaudited, not deployed). It does not touch the game, the website or the contracts,
needs no keys and makes no network calls.

## Setup

```sh
cd tools/lightdive-econ
python -m venv .venv                       # Python 3.12
.venv/Scripts/python -m pip install -r requirements.txt
```

## Run

```sh
.venv/Scripts/python -m pytest                       # 41 tests: contract parity, invariants, determinism, order book
.venv/Scripts/python -m lightdive_sim run base       # one scenario -> reports/base/{daily.csv,summary.json}
.venv/Scripts/python -m lightdive_sim all --seeds 5  # every scenario + seed spread + reports/comparison.md + overview.png
# one setting over several values -> reports/sweep-market-c/{sweep.md,sweep.json,sweep.png}
.venv/Scripts/python -m lightdive_sim sweep market-c --key market.order_book.list_rate --values 0,0.25,0.5,1 --seeds 3
```

The contract parity data (`data/contract-vectors.json`) is exported from the real `LightdiveConfig3` on a local chain:
`node --experimental-strip-types tools/lightdive-econ/scripts/export-vectors.mjs` (from the repo root, after compiling).

## Layout

| Path | What |
|---|---|
| `config/base.yaml` | every number the model uses, each tagged `source` (contract / whitepaper / draft / assumption) and `status` |
| `config/scenarios/*.yaml` | base, boom, bust, idle-market, market-c, market-c-boom and the failure cases (tiny pool, launch rush, keeper down) |
| `lightdive_sim/market.py` | the order book for decision C (keep the contract, rely on resale): listings, falling asks, buyers |
| `lightdive_sim/rules.py`, `keccak.py` | odds tables, daily sky, dive plans, decisions: integer arithmetic identical to the contract |
| `lightdive_sim/entities.py`, `pool.py`, `ledger.py` | cards and decks, the Core Light Pool (method B), a double-entry RVYN ledger |
| `lightdive_sim/policies.py` | player behaviour (round 1: the sim-v3 assumptions; round 2's agent model plugs in here) |
| `lightdive_sim/engine.py` | the daily loop; checks invariants I1-I7 at the end of every day |
| `tests/` | T1-T6 and I1-I7 from the round 1 plan |
| `reports/` | outputs; `reports/round1/` and `reports/decision-c/` keep the test and run logs |

## Reproducibility

All randomness comes from named streams seeded by `run.seed` (Python's `random.Random`, string seeds). The same config
and seed give a byte-identical `daily.csv`; its SHA-256 is recorded in each `summary.json` with the config digest.

## Limits (round 1)

- Player behaviour (arrivals, quitting, renewals, claims, trade volume) is assumed, copied from `sim-v3.cjs`; it is not
  data and the results are not forecasts or promises of any return.
- One team per player, always the deepest reachable destination, no decisions by default; summon prices fixed at launch
  (no RVYN price, no AMM); market tax either a fixed share of summons or resale of idle cards to newcomers.
- Days are simulated as a whole: dives within a day are sequential in random player order.
- Market modes: `fixed_ratio` (sim-v3), `idle_inventory` (every quitter sells at 80%), `order_book` (decision C, 10-10).
- Round 2 (not built): agent-based behaviour, RVYN/ETH AMM, deposits and exits, order book, Monte Carlo, dashboard.
