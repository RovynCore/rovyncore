# Retired: Lightdive v1 randomness operator

This Worker served the Lightdive **v1** contracts, which drew randomness from an operator-run hash chain. Lightdive v3 uses drand evmnet, verified on chain, with no operator (see `docs/lightdive/README.md` and `packages/contracts/lightdive/DEPRECATED.md`).

It is kept for history only. Do not deploy it, and do not put its secrets (`OPERATOR_PRIVATE_KEY`, `LIGHTDIVE_SEED_SECRET`) anywhere again.
