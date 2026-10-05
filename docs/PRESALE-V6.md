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

## Tests

- `npm run test:presale:v6` (12 tests, ~20 s, in CI): custody before settlement; floor and ceiling; direct-mint pool against a Uniswap-V2-faithful fixture (real mint math, minimum liquidity burned); pre-created pair / donated WETH / donated and synced attacks; permissionless settle after the grace period (argument ignored for non-sponsors); zero raise; stepped withdrawals; two-step sponsor; cancel before open; later liquidity; allocation budgets; supply-conservation invariant; automatic close at the 100 ETH cap with 400 wallets.
- `node --experimental-strip-types tests/presale-v6.fork.mjs` (needs network, not in CI): forks Robinhood Chain locally and runs the flow against the **real** RVYN token, router, factory and WETH. Passed, plain and with `ATTACK=1` (pair pre-created and seeded with 5 WETH). Nothing is sent to the real chain.

Not done: independent audit, static analysis tool run (Slither/Mythril not installed here), formal verification, legal review.

## Observations

- Under the pre-seeded-pair attack the pool starts at the attacker's donated price (the donation stays in the pool, the attacker loses it). Settlement and claims are unaffected; the only effect is a different opening price, which only helps holders.
- Gas: `settle` used about 3.7 M gas on the fork (pair creation, lock and vesting contracts are created inside it).
- Contract size 21,530 bytes of runtime code (limit 24,576).

## Decisions still needed before any deployment

1. `withdrawStepBps` (suggested 2500 = 25% per 30 days, or 10000 if the founder prefers everything unlocked at settlement).
2. `teamBeneficiary` and `lpBeneficiary` wallets (V5 used the sponsor for LP; V6 lets them differ).
3. LP lock length (12–24 months).
4. Whether the V5 sale at `0x6496…46ac` (no buyers, nothing opened) is simply abandoned or cancelled first with `cancelBeforeOpen` (returns the inventory to the sponsor; needs a Safe transaction).
5. Independent audit and legal review; website, legal copy and `/transparency` must be updated to V6 wording (instant delivery and the ≤50% pool statement no longer apply) before opening.

Deployment, sale opening and every on-chain transaction need the founder's explicit go-ahead.
