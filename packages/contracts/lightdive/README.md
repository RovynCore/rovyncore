# Lightdive contracts (candidate, unaudited)

Contracts for RovynCore: Lightdive. Design and parameters: `docs/lightdive/Lightdive-Whitepaper-v1.0.pdf` (chapter 9 and Appendix A).

| Contract | Role |
|---|---|
| `LightdiveConfig` | Every tunable parameter with hard bounds. Beam tables must average exactly 1.00x and cap at 10x. |
| `LightdiveNFT` | RVDIV collection (ERC-721 + ERC-2981). Onchain attributes, voyages, live supply per kind and the only-lowerable live cap. |
| `RandomnessBeacon` | Hourly commit-reveal randomness. Unrevealed hours expire after 48h to a neutral result. |
| `CoreLightPool` | Holds reward RVYN. Daily budget = min(1% of available, points x 0.18). No owner withdrawal. |
| `LightdiveMinter` | Deck draws with exact rarity counts, two-step mint, first-mint discount, early spire limit, 70/15/15 split with burn. |
| `Expedition` | Teams, one dive per spire per day, settlement by Lightdust share, claims with the decaying fee, homecoming burns. |

```sh
npm run contracts:compile:lightdive   # writes artifacts/ (git-ignored)
npm run test:lightdive                # compiles, then runs tests/lightdive.test.mjs on ganache
```

Not for mainnet until an independent audit is done, ownership sits with a multisig behind a timelock, and the randomness source has been reviewed (a VRF if Robinhood Chain offers one).
