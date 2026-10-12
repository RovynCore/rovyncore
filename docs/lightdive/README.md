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
| `Lightdive-Art-Direction-v1.0.pdf` | Detailed brief for every non-NFT art asset (star chart, observatory, Signal-Keeper poses and glow layers, icons, card back, wordmark, share images): story, gameplay use, composition, layers, prompts and acceptance checks. |
| `Lightdive-NFT-Art-Direction-v2.1.pdf` | Proposal (pending sign-off) to redesign the spire and seeker NFT art: low-angle monumental spires with countable berths, five faceless seeker classes instead of the 7-layer portrait, and a five-signal rarity system. No contract change. Source: `source/nft-art-direction.html`. |
| `source/art-direction.html` | Source of the art brief PDF; reference art in `source/ref/`. |
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

`source/render.mjs` prints `whitepaper.html` (or another page passed as the second argument, e.g. `art-direction.html`) with Playwright's Chromium. Set `CHROMIUM_PATH` to use a specific Chromium build. It expects the chart PNGs next to the HTML and Noto Sans TC TTFs in `source/fonts/` (not committed; download from Google Fonts).

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
3. **Run the randomness operator.** Time is cut into one-minute slots with one hash chain per UTC day. The operator commits today and the next two days, and each minute reveals the finished slot that a mint or dive waits for (mints resolve in about a minute, dives five minutes after departure). Mints and dives are refused in slots whose day has no commitment, so the game pauses if the operator stops for two days.
   - Primary: the Cloudflare Worker in `workers/lightdive-operator`, every minute:
     ```sh
     npx wrangler deploy -c workers/lightdive-operator/wrangler.jsonc
     npx wrangler secret put OPERATOR_PRIVATE_KEY -c workers/lightdive-operator/wrangler.jsonc
     npx wrangler secret put LIGHTDIVE_SEED_SECRET -c workers/lightdive-operator/wrangler.jsonc
     ```
     The Worker bundles `packages/web3/lightdive.json`, so redeploy it after every contract deployment.
   - Backup: `.github/workflows/lightdive-operator.yml` every five minutes on `main` (repository secrets `LIGHTDIVE_OPERATOR_PRIVATE_KEY`, `LIGHTDIVE_SEED_SECRET`).
   - Local: `OPERATOR_PRIVATE_KEY=0x... LIGHTDIVE_SEED_SECRET=0x<64 random hex> npm run lightdive:operator -- --watch`

   Keep `LIGHTDIVE_SEED_SECRET` private: anyone holding it can predict results.
4. **Open the spire sale** from `/admin/lightdive` with the deployer wallet (the contract owner). Seekers and prisms can be minted as soon as the operator has committed the current day.
5. **Play** at `/game/lightdive` (not linked from the site and not indexed).

For local development, point reads at a local chain by adding `"rpcUrl": "http://127.0.0.1:8545"` to `packages/web3/lightdive.json` (do not commit it).
