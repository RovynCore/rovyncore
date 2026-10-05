# Visual Engineering Upgrade: G0 baseline

Source of truth: `網站視覺化/RovynCore_FINAL_Master_Build_Specification.pdf`
(55 pages, 2026-09-29). Canonical pages are the five 1448 × 1086 images
embedded on PDF pages 3–7. The PDF converts its original PNG image sources
to JPEG XObjects; the embedded visuals retain their native size, but the
original PNG byte hashes from chapter 25 cannot be reconstructed from the PDF.
Extracted pixel-equivalent PNGs are in `output/visual-upgrade/references/`.

## Route / component / data map

| Canonical | Route | Existing presentation | Data / actions to preserve |
| --- | --- | --- | --- |
| CR-01 Home | `/` (`/home-redesign` preview) | `app/home-redesign/page.tsx`, `components/home-content.tsx`, `components/home-journey.tsx` | Sale status, platform config, featured assets, links to launchpad/records/RVYN. |
| CR-02 Launchpad | `/launchpad` | `app/launchpad/page.tsx` | `TokenDraft` validation, logo upload, wallet connection, `transact()`, launch receipt sync, draft persistence. |
| CR-03 Explorer | `/onchain-record` (`/explore` redirect) | `app/onchain-record/page.tsx` | `v1/assets` search, creator filter, cursor pagination, pinned official RVYN. |
| CR-04 Asset Record | `/assets/robinhood/[contract]` (`/token/[address]` redirect) | `app/assets/robinhood/[contract]/page.tsx` | Canonical record + history APIs, observed-state refresh, creator metadata updates, links and copy actions. |
| CR-05 RVYN | `/rvyn` | `app/rvyn/page.tsx` | Onchain token facts, 10M allocation model, whitelist application/status, presale chain reads and purchase action. |

Global shell: `components/platform-provider.tsx`, `components/language-provider.tsx`,
`app/layout.tsx`, `app/globals.css`. Existing visual motion consists primarily
of CSS transitions, reveal observers and MP4/video hero media. No new visual
component may claim a wallet/transaction/sale success state without the real
underlying API or chain state.

## Before captures

`output/visual-upgrade/baseline/CR-0*` contains local 1448 × 1086 viewport
screenshots. The browser's existing Launchpad draft was preserved and is visible
in that baseline. No local-storage reset or wallet transaction was performed.
The local data set exposes one verified RVYN Asset Record, not the many sample
cards and activity values pictured in CR-03. The local current-state read of
that record is unavailable; this must remain an honest error state.

## G0 functional baseline

- `npm run typecheck` — pass.
- `npm run lint` — pass.
- `npm run test:validation` — 9/9 pass.
- `npm run test:allowlist` — 1/1 pass.
- Browser route smoke: all five routes render with English UI, and core links,
  form, search, record and RVYN sections are present.
- No mainnet signature, launch, purchase, D1 migration or deployment is part of
  this visual baseline. Core transaction behavior remains covered by existing
  automated tests and read-only UI inspection.

## Isolation / rollback

- Visual layer is isolated behind a `visual` quality setting (`off`, `low`,
  `medium`, `high`, or `auto`). `off` removes procedural visual layers only;
  content and transactional controls remain usable.
- Preserve the current dirty worktree; do not reset or move existing source.
- Do not publish this upgrade, run a D1 migration or touch onchain contracts
  without a separate user request. The existing production baseline is tracked
  under `releases/production/`.

## Main risks

1. PDF reference uses synthetic counts, projects and investment-like copy. Use
   the exact geometry and visual hierarchy but show real data or labelled empty
   states. Do not claim verification or liquidity not supported by records.
2. Existing wallet and launch flows carry real assets. Keep business logic in
   the current components; attach visual state through props and pure data
   mappings, not by moving it into shaders.
3. WebGL availability and GPU power vary. Canvas/SVG/CSS fallback, quality
   tiers, reduced motion, and offscreen cleanup are mandatory.
4. The canonical reference has a 4:3 viewport and very high visual density;
   mobile is a structural adaptation, not a scaled-down screenshot.
