# RVYN presale V6 (candidate, not deployed, not audited)

Source: `packages/contracts/v6/RovynPresaleV6.sol`. Founder decision (2026-10-05): claim after settlement, 7-day settle grace period, pool floor 50% of the raise.

## What changed against V5 and why

| V5 weakness (verified) | V6 rule |
|---|---|
| RVYN was delivered at purchase, so a buyer could seed the RVYN/WETH pair first and make the sponsor's router-based pool creation fail or lock | Nothing leaves the contract before settlement. Buyers only record ETH; they `claim()` RVYN after `settle()`. |
| Pool built through the router with exact minimums | Pool built by **direct pair mint** (WETH + RVYN sent to the pair, `mint` reads the balance difference). A pre-created pair or donated WETH cannot make it fail. |
| No minimum pool size | `settle` requires pool ETH ≥ 50% of the raise plus every forwarded revenue deposit (`minPoolEth`). |
| Settlement depended on the sponsor | Anyone may `close()` after the sale period and anyone may `settle()` 7 days after closing (always at `minPoolEth`). |
| Sponsor immutable | Two-step `proposeSponsor` / `acceptSponsor`. |
| Manager 5% released at open | Released at settlement. |
| Operating funds | Everything not put in the pool, unlocked `withdrawStepBps` per 30 days from settlement (constructor parameter; 10000 = all at once). |

Unchanged: price 0.0001 ETH, hard cap 100 ETH, wallet cap 0.25 ETH, Merkle allowlist, 14-day sale, no refund, no pause, team 1,000,000 RVYN vested (12-month cliff, 24 monthly releases), LP lock 12–24 months, airdrop/product/community budgets.

## Rules a buyer can verify in the code

- Paying ETH never moves RVYN. `claim()` pays exactly `paid / 0.0001` RVYN, once per address, only after settlement.
- RVYN owed to buyers (`sold`) stays in the contract; the only other RVYN transfers are the capped allocations, so no budget can eat into buyers' claims (tested).
- Unsold sale RVYN is burned at settlement. Supply is conserved (tested).
- Because there is no refund, buyers rely on settlement happening and on the 50% floor. A sponsor who never opens the sale raises nothing; a sponsor who vanishes after the sale closes cannot block settlement or claims.

## Tests and checks

- `npm run test:presale:v6` (13 tests, ~1 min, in CI)
  - 12 scenario tests: custody before settlement; floor and ceiling; direct-mint pool against a Uniswap-V2-faithful fixture (real mint math, minimum liquidity burned); pre-created pair / donated WETH / donated-and-synced attacks; permissionless settle after the grace period (argument ignored for non-sponsors); zero raise; stepped withdrawals; two-step sponsor; cancel before open; later liquidity; allocation budgets; supply-conservation invariant; automatic close at the 100 ETH cap with 400 wallets.
  - 1 stateful fuzz test (`tests/presale-v6.fuzz.test.mjs`): random legal and illegal actions in random order (buy, revenue, close, settle by sponsor or stranger, claim, withdraw, allocations, airdrop, later liquidity, time jumps), checking after every action that RVYN and ETH balances reconcile exactly with the contract's own accounting, supply is conserved, nothing is delivered before settlement, the hard cap holds and withdrawals never exceed what is unlocked. Reproducible with `FUZZ_SEED`; sized with `FUZZ_RUNS` / `FUZZ_STEPS`. A 40-run × 60-action sweep (seed 777) also passed.
- Mutation check (done by hand, not in CI): six deliberately planted bugs (no pool floor, double claim, no burn of unsold tokens, instant unlock of all operating funds, no grace period, strangers closing early) were each caught by the scenario tests.
- `node --experimental-strip-types tests/presale-v6.fork.mjs` (needs network, not in CI): runs the flow on a local fork against the **real** RVYN token, router, factory and WETH; passes plain and with `ATTACK=1` (pair pre-created and seeded with 5 WETH).
- `npm run v6:preflight` (needs network, not in CI): reads live state, deploys with the final constructor arguments on a fork, reads every immutable back, and walks deposit → open → buy → close → settle → claim with the Safe as sponsor. Passed on 2026-10-06 (init code 23,717 bytes, deployment gas about 4.77 M).

Not done: independent audit (the founder decided against one), static analysis tool run (Slither/Mythril are not installed here), formal verification, legal review. Without an audit, every public statement about V6 must say it is unaudited.

## Observations

- Under the pre-seeded-pair attack the pool starts at the attacker's donated price (the donation stays in the pool, the attacker loses it). Settlement and claims are unaffected; the only effect is a different opening price, which only helps holders.
- Gas: `settle` used about 3.7 M gas on the fork (pair creation, lock and vesting contracts are created inside it).
- Contract size 21,530 bytes of runtime code (limit 24,576).

## Decisions (founder, 2026-10-05) and constructor parameters

| Parameter | Value |
|---|---|
| Sponsor, team beneficiary, LP beneficiary | the Safe `0xe574…3Ef4` (2 of 3) |
| LP lock | 730 days (24 months) |
| `withdrawStepBps` | 2500 (25% of operating funds per 30 days, first step at settlement) |
| Old V5 sale `0x6496…46ac` | cancelled through the Safe on 2026-10-06 (state 4, nothing had been deposited) |
| Independent audit | not pursued |

The constants live in `lib/rvyn-model.ts` (`v6Deployment`) and the admin page's deploy button (closed until the founder approves).

## Deployment sequence (each on-chain step needs the founder's explicit go-ahead)

1. `npm run v6:preflight` again on the day, to confirm live state has not changed.
2. Enable `V6_MAINNET_DEPLOYMENT_ENABLED` in `app/admin/page.tsx`, deploy the site, and send the deployment from the admin wallet (registers the sale automatically; it replaces the cancelled V5 record).
3. Verify the new contract source on the explorer (standard input in `packages/contracts/v6/artifacts/standard-input.json`, solc 0.8.28, optimizer 200, paris).
4. Send the 10,000,000 RVYN from the admin wallet to the Safe (the sponsor deposits the inventory from its own balance).
5. Safe batches from the admin page: publish allowlist root, approve + deposit inventory, open.
6. In the same release as step 2: switch the legal text, the `/rvyn` terms and `/transparency` to V6 wording and update the health panel's getters.
7. After the sale closes: settle (Safe, or anyone after 7 days), buyers claim, operating funds unlock by schedule.