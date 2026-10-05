# RovynCore Visual Engineering Upgrade — local acceptance record

Date: 2026-09-30 (UTC+8). Scope: CR-01 through CR-05 from
`網站視覺化/RovynCore_FINAL_Master_Build_Specification.pdf`.
This is a local implementation and QA record, **not a production release or
claim of final 92/100 visual acceptance**. No contract, database migration,
wallet signature, transaction, or production deployment was performed.

## Outcome by gate

| Gate | Result | Evidence / remaining condition |
| --- | --- | --- |
| G0 baseline | Pass | `G0-baseline.md` records routes, real-data constraints, and rollback boundaries. |
| G1 tokens and source | Pass | Five canonical images extracted to `output/visual-upgrade/references/`; global tokens and 4-tier visual quality settings implemented. |
| G2 Home geometry | Partial | At 1448×1086, header ends at y≈56, hero y≈56–438, story y≈438–740, roadmap y≈740–940; section placement follows the source. Detailed text/icon and art alignment has not been certified against the PDF's per-element tolerances. |
| G3 key visuals | Partial | Procedural globe, stream, four story states, ridge, asset mark, and RVYN allocation orbit render. Their visual detail remains distinguishable from the richer reference composites; 92/100 must not be asserted. |
| G4 motion | Partial | Ambient WebGL, pointer response, staged story/roadmap reveal, quality adaptation, and 30-second desktop/mobile timed captures exist. The orbit rotation now uses elapsed time rather than frame count; form-energy changes no longer recreate a WebGL scene. Full transition and motion-timing parity with the reference has not been formally certified. |
| G5 Launchpad | Functional smoke pass | Existing draft persistence, field validation, logo input, wallet/transaction boundary, formation preview and checklist retained. No transaction was signed in QA. Reference-only liquidity controls were not copied as fake functionality. |
| G6 Asset Record | Functional smoke pass | Origin/current comparison, honest unavailable state, timeline, JSON, anchor nodes, and existing metadata actions retained. Local current-state read can fail; the UI says so rather than inventing data. |
| G7 Explorer | Functional smoke pass | Search, reset, real RVYN card, pagination/empty-state layout retained. The other projects and metrics in the PDF are fictitious and were not presented as real. A metric counting only the six returned history items now says “Recent updates shown” rather than implying a total count of public onchain events. |
| G8 RVYN | Functional smoke pass | The actual 10M / seven-bucket V5 contract caps and 0.0001 ETH price were independently checked against the official chain RPC and token explorer; see `onchain-facts-2026-09-30.md`. The orbit uses these seven real proportions, not the PDF's 1B/six-bucket sample. Both the canonical and legacy sections now distinguish deployed contract constants from funding, distribution or an open sale. Whitelist and presale gates remain connected to application/chain state. |
| G9 regression / performance | Partial | On the latest rebuilt local production bundle, typecheck, lint, build, validation 10/10, allowlist 1/1, localization 2/2, wallet 13/13 and isolated API integration 27/27 pass. Five canonical routes were recaptured at 1448×1086 and checked at 390×844 with no horizontal overflow. The V5 labels were checked in all four locales. Earlier local warm WebGL samples: high ≈60 fps, medium ≈55 fps, low ≈55 fps; `visual=off` produced 0 WebGL canvases and 1 SVG fallback, and reduced-motion emulation selected the off tier. Earlier Lighthouse results below predate the latest orbit/hero/copy iteration and must not be presented as current scores. The build still emits a >500kB dynamic Three.js chunk warning. A post-iteration performance and full device/leak recheck remains open. |
| G10 acceptance | **Not passed** | The specification's ≥92/100 visual similarity and all quantitative hard gates remain unproven. Keep this work local until those conditions are met and explicitly approved for release. |

## Captures

- Three transparent illustration assets were generated as source art (orbital core, RVYN ring and explorer network), optimized into WebP under `public/visual-upgrade/`, and composited with live procedural/WebGL layers. They contain no text, asset listings, transaction details or simulated sale data. Their contribution is visual texture and depth, not a screenshot of a fake interface.
- Latest 1448×1086 implementation screenshots from the rebuilt local production bundle: `output/visual-upgrade/implementation/CR-01_impl_1448x1086.png` through `CR-05_impl_1448x1086.png`. The existing browser's Launchpad draft appears in its capture; it was not created as a fake production asset or cleared without permission.
- Canonical source screenshots: `output/visual-upgrade/references/CR-01_reference_1448x1086.png` through `CR-05_reference_1448x1086.png`.
- Canonical 50% alpha overlays, absolute diffs, and four-panel review boards: `output/visual-upgrade/comparison/CR-0*_overlay50_1448x1086.png`, `CR-0*_diff_1448x1086.png`, and `CR-0*_reference-actual-overlay-diff.jpg`.
- Mobile full-page captures: `output/visual-upgrade/implementation/CR-01_mobile_latest.png` through `CR-05_mobile_latest.png` (before the final WebGL lifecycle/rotation patch, which does not change layout); latest 390×844 fold captures also include `CR-01_mobile_fold_final.png` and `CR-03_mobile_390x844.png`. The capture tool failed on some very tall full-page mobile screenshots, so these are not claimed as new post-patch captures.
- Timed motion evidence: `output/visual-upgrade/motion/desktop-qa-30s.gif` and `mobile-qa-30s.gif` (30 one-second samples each; these are sampled GIFs, not high-frame-rate screen recordings).
- Static fallback: `output/visual-upgrade/implementation/CR-01_static-fallback.png`.
- Reduced-motion emulation: `output/visual-upgrade/implementation/CR-01_reduced-motion.png`.
- Latest 390×844 fold captures for Home and RVYN: `output/visual-upgrade/implementation/CR-01_mobile_fold_verified.png` and `CR-05_mobile_fold_verified.png`.

## Local Lighthouse, earlier production bundle

All figures below are earlier local lab runs on `127.0.0.1:8787`, not field data or current-build scores. Performance/accessibility are out of 100. The later orbit, Launchpad art and copy changes require a fresh Lighthouse run before citing current scores.

| Route | Desktop performance | Accessibility | CLS | LCP |
| --- | ---: | ---: | ---: | ---: |
| Home | 94 | 97 | 0.033 | 1.52 s |
| Launchpad | 97 | 95 | 0 | 1.21 s |
| Explorer | 96 | 100 | 0.049 | 1.32 s |
| Asset Record | 93 | 96 | 0 | 1.67 s |
| RVYN | 94 | 100 | 0 | 1.52 s |

Home at mobile Lighthouse profile: performance 75, accessibility 97, CLS 0.052, LCP 4.53 s. The five JSON reports are `output/visual-upgrade/lighthouse-final-{desktop,mobile,launchpad-desktop,explorer-desktop,asset-desktop,rvyn-desktop}.json` (the plain `desktop`/`mobile` reports are Home).

## Functional regression evidence

- 10 local route changes between Home and Launchpad retained one active visual canvas per route, with no console errors or warnings; the launch formation energy update no longer recreates its canvas. This is not a long-duration GPU-memory leak test.
- On the rebuilt local production bundle, every canonical route yielded byte-identical 1448×1086 viewport screenshots taken one second apart with `?visual-test=1` after settling. This confirms a stable capture state for those five page states, not every possible interactive state.
- Explorer search returns a real RVYN result or a clear empty state. Launchpad text fields update the formation/checklist/contract preview; a local draft was cleared through the UI. No wallet signature, launch transaction, or production write occurred.
- `node --experimental-transform-types --test tests/wallet.test.ts` passes 13/13 mock/isolated wallet and session checks. `npm run test:api` passes 27/27 against a temporary local Ganache/D1/R2 state, covering launch receipts, record indexing/history, search, pagination and access control. Its temporary server emitted one Node `MaxListenersExceededWarning`; no production API was used. This does not replace a user-wallet or mainnet signing test.
- Five routes were checked in English, Traditional Chinese, Simplified Chinese and Korean, including 390px mobile overflow checks. The asset detail's async loading was allowed to settle before its localized heading was verified.
- No fake onchain record, wallet, sale state, tokenomics value, or activity was inserted to match reference art. The RVYN supply, seven V5 allocation caps and sale constants were rechecked read-only against mainnet; V5 currently has zero RVYN inventory and purchases remain closed. These observations can change and require a fresh read before publication.
- The local Worker logs a 404 for one existing record-logo media key (`/api/media/a65f51bc-fae2-4271-9b4d-10c57218ebba.png`) because that object is not present in the local R2 binding. `TokenAvatar` falls back to the asset initial on image error. This is not a browser-console failure or a newly generated visual asset; production R2 availability was not inferred from the local failure.

## Honest deviations and next acceptance work

1. The PDF's launch counts, communities, project cards, holder counts, sale
   countdown, liquidity controls and allocation figures are illustrative. They
   are not used as live facts or implemented as controls without backend support.
2. The procedural visuals preserve the reference's direction and composition,
   but not its exact dense artistic detail. The new Launchpad energy strands and
   seven-section RVYN orbit particle texture/color separation improve this iteration, yet the
   updated boards still show substantial differences in key art and some
   layouts. A genuine ≥92 visual sign-off needs quantitative geometry/key-visual
   scoring plus a design review against all five boards and likely further art
   or shader work. Do not substitute a baked screenshot containing false
   text/data for the live interface.
3. Lighthouse and reduced-motion emulation have now been run locally. CLS has
   Lighthouse lab evidence, not a full real-user device matrix. Home mobile
   performance (75) and the large dynamic Three.js bundle remain optimization
   targets; high-frame-rate 30-second recordings and a long-running GPU leak
   test are still missing.
4. The local Asset Record's current-state read can fail. A read-only public
   production API check returned a 10M / 18-decimal current-state snapshot but
   marked it `stale`; it cannot be presented as a fresh chain read. Resolve
   RPC refresh separately rather than declaring the asset safe or current from
   the visual layer.

All pre-existing dirty worktree files were preserved. Visual-source changes are
in `components/visual/`, `lib/visual/`, `app/visual-upgrade.css`, and the five
in-scope page wrappers. This report does not authorize deploying the entire
dirty worktree.
