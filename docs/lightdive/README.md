# RovynCore: Lightdive（潛光遠征）

Design documents for the first RovynCore game.

| File | What |
|---|---|
| `Lightdive-Whitepaper-v1.0.pdf` | Whitepaper and engineering design, v1.0 (decisions confirmed 2026-10-06). The source of truth for game rules and parameters. |
| `source/whitepaper.html` | Source of the PDF. Edit this, then re-render. |
| `simulation/sim.py` | Economy simulator (365 days, three scenarios). Parameters at the top mirror Appendix A of the whitepaper. |
| `simulation/sweep.py` | Parameter sweeps used while choosing the v1.0 values. |
| `simulation/charts.py` | Renders the simulation charts used in chapter 8. |
| `ART-ASSETS.md` | Art asset checklist (specs, counts, priorities) for the art team. |
| `WORKLOG.md` | Work log: what was decided, built and deployed, and what is still open. |

The contracts that implement this design live in `packages/contracts/lightdive/`.

## Changing a parameter

1. Change the value in `source/whitepaper.html` (Appendix A and the chapter that explains it).
2. Change the same value in `simulation/sim.py` and re-run it.
3. Change the default in `packages/contracts/lightdive/LightdiveConfig.sol` and run `npm run test:lightdive`.

## Re-running the simulation

```sh
cd docs/lightdive/simulation
python3 sim.py sim.json          # prints the scenario summary and writes sim.json
python3 charts.py                # needs matplotlib and Noto Sans TC TTFs in ./fonts
```

## Re-rendering the PDF

`source/render.mjs` prints `whitepaper.html` with Playwright's Chromium. Set `CHROMIUM_PATH` to use a specific Chromium build. It expects the chart PNGs next to the HTML and Noto Sans TC TTFs in `source/fonts/` (not committed; download from Google Fonts).

```sh
cd docs/lightdive/source
NODE_PATH=$(npm root -g) node render.mjs "$PWD/../Lightdive-Whitepaper-v1.0.pdf"   # needs a global playwright install
```

## Testnet runbook

Everything below runs from a maintainer's own terminal. Private keys are read from the environment at run time and never written to the repository; the website itself never holds a key.

1. **Compile**: `npm run contracts:compile:lightdive`
2. **Deploy** (Robinhood Chain testnet, 46630). Use a separate operator wallet that will never play.
   ```sh
   DEPLOYER_PRIVATE_KEY=0x... OPERATOR_ADDRESS=0x... npm run lightdive:deploy
   ```
   Without `RVYN_ADDRESS` a test token `tRVYN` is deployed and 1,000,000 of it seeds the Core Light Pool. The script writes the addresses to `packages/web3/lightdive.json`; commit that file to point the site at the deployment. Mainnet is refused on purpose.
3. **Run the randomness operator** continuously (cron every 10 minutes, or `--watch`):
   ```sh
   OPERATOR_PRIVATE_KEY=0x... LIGHTDIVE_SEED_SECRET=0x<64 random hex> npm run lightdive:operator -- --watch
   ```
   Mints and dives are refused in any hour without a commitment, so the game pauses whenever the operator stops. Keep `LIGHTDIVE_SEED_SECRET` private.
4. **Open the spire sale** from `/admin/lightdive` with the deployer wallet (the contract owner). Seekers and prisms can be minted as soon as the operator has committed the current hour.
5. **Play** at `/game/lightdive` (not linked from the site and not indexed).

For local development, point reads at a local chain by adding `"rpcUrl": "http://127.0.0.1:8545"` to `packages/web3/lightdive.json` (do not commit it).
