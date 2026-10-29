# Retired: Lightdive v1 contracts

These are the Lightdive **v1** contracts. They were replaced by v3 (`packages/contracts/lightdive-v3/`) on 2026-10-16 and are kept for history only. Do not deploy or run them.

v1 drew its randomness from an operator-run hash chain (`RandomnessBeacon.sol`): whoever held the operator's seed secret (`LIGHTDIVE_SEED_SECRET`) could predict results. v3 removed that design entirely: results come from **drand evmnet**, verified on chain, with no operator, seed or key (see `docs/lightdive/README.md`).

Retired with them:
- the operator Worker `workers/lightdive-operator/`
- `scripts/lightdive-operator.mjs`, `scripts/lightdive-operator-core.mjs`
- the workflows `.github/workflows/lightdive-operator.yml` and `lightdive-operator-deploy.yml` (manual-only since 2026-10-30, never to be run again)

The v1 testnet addresses are recorded in `docs/lightdive/WORKLOG.md`.
