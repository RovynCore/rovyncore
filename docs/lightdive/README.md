# RovynCore: Lightdive（潛光遠征）

Design documents for the first RovynCore game.

| File | What |
|---|---|
| `Lightdive-Whitepaper-v1.0.pdf` | Whitepaper and engineering design, v1.0 (decisions confirmed 2026-10-06). The source of truth for game rules and parameters. |
| `source/whitepaper.html` | Source of the PDF. Edit this, then re-render. |
| `simulation/sim.py` | Economy simulator (365 days, three scenarios). Parameters at the top mirror Appendix A of the whitepaper. |
| `simulation/sweep.py` | Parameter sweeps used while choosing the v1.0 values. |
| `simulation/charts.py` | Renders the simulation charts used in chapter 8. |

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

`source/render.js` prints `whitepaper.html` with Playwright's Chromium. It expects the chart PNGs next to the HTML and Noto Sans TC TTFs in `source/fonts/` (not committed; download from Google Fonts).

```sh
cd docs/lightdive/source
node render.js "$PWD/../Lightdive-Whitepaper-v1.0.pdf"
```
