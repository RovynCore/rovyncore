# RovynCore: Lightdive（潛光遠征）

Design documents for the first RovynCore game.

## Current: Lightdive v3 (testnet)

The live game at `/game/lightdive` runs on the v3 contracts in `packages/contracts/lightdive-v3/` (deployment in `packages/web3/lightdive-v3.json`). The contracts are candidates and **have not been audited**.

| File | What |
|---|---|
| `WHITEPAPER-v3.md` (`.en.md`, `.ko.md`) | Rules and economy as they are now. `scripts/lightdive-v3-whitepaper.mjs` builds the game's 白皮書 page from them. |
| `V31-SPEC.md` | The v3.1 additions (deep dives, crew bond, supplies, daily commissions). |
| `TEXTS-v3-draft.md` | All game text (Traditional Chinese source); `scripts/lightdive-v3-texts.mjs` builds `lib/lightdive-v3/texts.ts`. |
| `MAINNET-SWITCH.md` | The step-by-step mainnet switch; every step needs the founder's explicit approval at the time. |
| `WORKLOG.md` | Work log: what was decided, built and deployed, and what is still open. |
| `econ-sim/` | The v3 economy simulator. |

### Randomness: drand, no operator

Every random result in v3 (dive results, summoned cards) comes from **drand evmnet**, a public randomness beacon run by many independent organisations that publishes a new round every 3 seconds.

- A dive or summon fixes its drand round **when it is sent** (a round a few seconds or minutes in the future), so nobody, the team included, can know the result before the round is published.
- The contracts verify the round's BLS signature on chain (`DrandEvmnet.sol`, `RoundRandomness.sol`). Nobody holds a seed or a key that decides results.
- Results are settled by the player's next transaction, which carries the published signatures (`Expedition3.Settle`); anyone may also call `settle`.
- If a round's proof never arrives, only the owner may settle by the fallback, which is never better than a normal draw: empty-handed with the most wear for a dive, the weakest cards for a summon.
- Any revealed dive can be recomputed by anyone at `/game/lightdive/verify/<dive id>` from the public drand signature.

There is no randomness operator, no seed secret and no keeper in v3.

### Testnet runbook (v3)

Everything below runs from a maintainer's own terminal. The site never holds a key.

1. **Compile and test**: `npm run test:lightdive:v3`
2. **Local chain** (ganache with real drand rounds): `npm run lightdive:v3:localnet`, then `node --experimental-strip-types scripts/lightdive-v3-smoke.mjs` plays the whole loop and checks the website's predictions against the chain.
3. **Deploy to the testnet** from the browser wallet, with no private key in any file: `npm run lightdive:v3:deploy:web`, open http://127.0.0.1:8790 and sign each step. The page writes `packages/web3/lightdive-v3.json`; commit it to point the site at the deployment.
4. **Owner settings** (signed in the browser wallet): `npm run lightdive:v3:owner:web` (http://127.0.0.1:8791).
5. **Play** at `/game/lightdive`; the wallet-free preview is `/game/lightdive/preview`.

## Legacy: Lightdive v1 (retired 2026-10-16)

v1 used an operator-run hash chain for randomness (`LIGHTDIVE_SEED_SECRET`). It was replaced by drand in v3 and is **retired**: its contracts (`packages/contracts/lightdive/`), its operator (`workers/lightdive-operator/`, `scripts/lightdive-operator*.mjs`) and its workflows are kept for history only and must not be run again. See `packages/contracts/lightdive/DEPRECATED.md`.

The v1 design documents:

| File | What |
|---|---|
| `Lightdive-Whitepaper-v1.0.pdf` | Whitepaper and engineering design, v1.0 (decisions confirmed 2026-10-06). Superseded by `WHITEPAPER-v3.md`. |
| `source/whitepaper.html` | Source of the PDF. |
| `simulation/sim.py`, `sweep.py`, `charts.py` | The v1 economy simulator, sweeps and charts. |
| `ART-ASSETS.md` | Art asset checklist (specs, counts, priorities). |
| `Lightdive-Art-Direction-v1.0.pdf` | Brief for every non-NFT art asset. Source: `source/art-direction.html`; reference art in `source/ref/`. |
| `Lightdive-NFT-Art-Direction-v2.1.pdf` | Proposal for the spire and seeker NFT art. Source: `source/nft-art-direction.html`. |

To re-run the v1 simulation: `cd docs/lightdive/simulation && python3 sim.py sim.json && python3 charts.py` (charts need matplotlib and Noto Sans TC TTFs in `./fonts`). To re-render a PDF: `source/render.mjs` prints `whitepaper.html` (or another page) with Playwright's Chromium.
