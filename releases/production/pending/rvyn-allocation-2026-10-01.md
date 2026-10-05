# RVYN allocation layout and button update — 2026-10-01

Status: local preview only. Production has not been published.

## Changes

- Removed the entire “Make the rules clear before the story begins.” signal section and its supply/precision cards. The official onchain record still shows supply and decimals.
- The allocation section now directly follows the RVYN story. Desktop minimum height increased from 319px to 620px; the orbit increased from a 318px maximum to 510px.
- Enlarged explanatory text and allocation rows (62px high), with labels, amounts, and percentages kept readable.
- Replaced allocation cyan/multicolor styling with the site's dark green, olive, and lime palette. Seven categories retain distinct tonal markers and their text labels.
- Unified public primary/secondary CTA colors, hover, focus, disabled and selected states. Header, roadmap tabs, wallet option tiles, utility buttons and playback controls retain their functional shapes.
- Fixed RVYN hero labels being squeezed into a 20px grid column. They now occupy the full text track; desktop actions return to 56px height.

## Verification

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` — passed.
- Final production build: `node scripts/run-framework.mjs build` — passed; existing large-chunk warning remains.
- Browser: inspected home, RVYN, Launchpad, Onchain Record, official asset detail and wallet dialog. Shared CSS also covers legal/latest-information actions.
- Desktop and 390px mobile: allocation labels/amounts fit; document width does not exceed the viewport. Home hero buttons fit at 390px.
- Selecting the liquidity row updates the orbit to 50% and the matching label.
- Disabled whitelist/purchase and wallet actions remain disabled.
- No database, smart-contract, wallet transaction, or production deployment changes.

## Source files

- `app/rvyn/page.tsx`
- `components/visual/rvyn-canonical.tsx`
- `app/retained-visuals.css`
- `app/interaction-polish.css`

The accompanying source-hashes.json records the final SHA-256 hashes. Earlier local motion improvements remain pending as a separate change.
