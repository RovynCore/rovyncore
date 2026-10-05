# Production deployment

## Selected RVYN and Onchain Records visuals (2026-09-30)

- Published the selected visual release from `E:\codex\專案四\genesis` to the
  Cloudflare Worker `rovyncore-production` with `--keep-vars`. Version
  `d2fff57d-3963-4fca-950e-bc3e614b4d52` serves 100% of traffic.
- The RVYN page retains its prior layout and functional whitelist/presale flow,
  adding the interactive seven-cap V5 allocation orbit. Onchain Records keeps
  its filters/list and adds the selected title-side orbit art. Public actions
  use the restrained dark-emerald outlined button style. Other large-upgrade
  mockup sections are not rendered; eight unused reference images were withheld
  from the deployed static assets.
- Added one 2026-09-30 development-log entry (`2026.09.30-01`) in four languages.
  The 234-file source-state inventory is
  `releases/production/snapshots/release-2026-09-30-01.json` (SHA-256
  `2BCF5FCC69F63592E786FC239BF1E48C9FD82F210D45DCE165715767CF216CFA`).
  The built Worker entry SHA-256 is
  `2CC30FB366AD4FF706D9CA98731562C6D66504E98C580804E100D9C42A2B2A04`.
  This inventory includes local unused draft sources and art for traceability;
  the actual upload contained 82 static files and only the selected
  `explorer-network-v1.webp` from `public/visual-upgrade`.
- Lint, typecheck, build, validation and localization tests, production
  Wrangler dry-run and live route checks passed. Live RVYN status remained
  `allowlist_prep`, `registryOpen: false`, `registrationStatus: disabled`,
  `purchasesOpen: false`. No D1 migration, wallet signature, or onchain
  transaction was performed.

## Homepage motion and RVYN CTA contrast (2026-09-28)

- Deployed the website-only release to `rovyncore-production` with `--keep-vars`.
  Worker version `71a4b0e5-1f0d-41ba-b69f-aabc3c382663` serves 100% of traffic.
- Added the homepage's scroll-led three-step creator route, staggered entrance for
  Onchain Record cards, restrained CTA hover motion, and an open-state-only
  whitelist status pulse. Corrected RVYN hero-button hover colors so labels
  and arrows remain readable.
- Updated the existing single 2026-09-28 Latest Information entry to
  `2026.09.28-05` in all four languages; no second same-day entry was added.
- The 216-file source inventory is
  `releases/production/snapshots/release-2026-09-28-05.json` (SHA-256
  `E1586589EFA6CC01D6745E27DB8E9318ABF74E72284BAB422D5ED1EEA10EF233`).
  Exactly six build inputs differ from the previous release: `app/globals.css`,
  `app/home-redesign/page.tsx`, `app/onchain-record/page.tsx`,
  `app/rvyn/page.tsx`, `components/home-journey.tsx`, and
  `app/development-log/page.tsx`.
- Lint, typecheck, localization tests, production build, and Wrangler dry-run
  passed. Live checks confirmed the homepage scroll progression, pinned record
  card reveal, readable RVYN hover state, same-day release note, and no browser
  console errors on the checked routes. `/api/rvyn/status` returned HTTP 200
  with `registryOpen: false` and `purchasesOpen: false`. No D1 migration,
  wallet signature, or onchain transaction was performed.

## RVYN English whitelist terminology (2026-09-28)

- Deployed to `rovyncore-production` with `--keep-vars`; Worker version
  `3f2b9b04-aadb-4d3a-bc50-3d965f3ed045` serves 100% of traffic.
- Standardized the RVYN page's English public wording to "Whitelist", including
  the section eyebrow and heading, registration and status steps, status copy,
  and page title/metadata. Internal `allowlist` API and contract identifiers
  were not renamed; registration and presale behavior did not change.
- Folded this copy update into the existing 2026-09-28 Latest Information entry
  as version `2026.09.28-04`, without adding a second entry for that date.
- The 215-file source inventory is
  `releases/production/snapshots/release-2026-09-28-04.json` (SHA-256
  `6346FB832BCB66A16FCAEDBB68526F1AC9A00FAD31A3BBA6177D03632A640694`).
  Exactly four build inputs differ from the prior release: `app/rvyn/page.tsx`,
  `app/rvyn/layout.tsx`, `lib/page-titles.ts`, and
  `app/development-log/page.tsx`.
- Build, lint, typecheck, localization tests, and production Wrangler dry-run
  passed. The live English RVYN page showed the updated wording; registration
  and purchases remained disabled. No D1 migration, wallet signature, or
  onchain transaction was performed.

## RVYN allowlist registration and presale entrypoints (2026-09-28)

- Deployed to `rovyncore-production` with `--keep-vars`; Worker version
  `2434215b-f901-427c-aee1-081667838af0` is serving 100% of traffic.
- The RVYN hero now offers separate allowlist-registration and presale-purchase
  links. The allowlist section displays registration first and status lookup
  second, in all four languages. Registration remains visibly unavailable until
  the administrator opens it; a stale client state is checked against the
  server before wallet connection/signing.
- A signed registration creates a pending application, not immediate purchase
  eligibility. Administrator approval and publication of the onchain allowlist
  root are still required. Existing applications can be looked up after the
  registration window closes. No sale or contract state was changed.
- The same-day Latest Information entry was updated in place to version
  `2026.09.28-03`. Exactly five build inputs changed from the preceding release:
  `app/rvyn/page.tsx`, `app/globals.css`, `app/api/[...path]/route.ts`,
  `app/development-log/page.tsx`, and `tests/api-integration.mjs`.
- The 215-file source inventory is
  `releases/production/snapshots/release-2026-09-28-03.json` (SHA-256
  `1AD8F5D3C0AFF5F5CEA584DE0D2F110C99CC75A93D45C9F6BE4A7659E9FE5DF9`).
  Build, lint, typecheck, validation, localization, API integration tests, and
  Wrangler dry-run passed. Live desktop/mobile checks confirmed the new links,
  section order, closed registration/sale state, and no horizontal overflow at
  390px. `/api/rvyn/status` returned HTTP 200 with registration disabled and
  purchases closed. No D1 migration, wallet signature, or onchain transaction
  was performed for this release.

## Website audit fixes (2026-09-28)

- Final live Worker version: `006bd76c-6230-4d05-b0ee-5546b2632ab1`
  (100% traffic). An earlier build of the same release was briefly deployed as
  `ad4b69bb-4da7-4bf8-abf8-2979d28d8d40`; the final version also corrects a
  2px mobile overflow found during live Korean-language verification.
- Fixed the Latest Information X-embed overflow and added a localized fallback
  with a direct official-profile link when X cannot be displayed.
- Localized the official RVYN editorial summary and page titles in all four
  languages, while retaining the original creator-supplied English record.
  The homepage whitelist CTA now says to check status until registration is
  actually open; launchpad copy no longer implies a single-signature flow.
- Removed the development-only meta tag, improved hero heading accessibility,
  and added a confirmed clear-saved-draft control to the launchpad.
- Recorded SHA-256 hashes for all 215 build-input files in
  `releases/production/snapshots/release-2026-09-28-02.json`
  (manifest SHA-256:
  `D09BA608E0EF217652FD171D5BA5C79A9F5B495FD96018E488528F145BB50387`).
  Comparing this release with the pre-fix working-tree snapshot identified 20
  scoped website files. The pre-fix snapshot is not claimed to be an exact
  reconstruction of the prior Worker, whose full source hashes were not kept.
- `npm run build`, `npm run lint`, `npm run typecheck`, localization and
  validation tests, and Wrangler production dry-run passed. Live checks showed
  200 responses for the main pages and `/api/config` and `/api/rvyn/status`;
  registration remains disabled. Local 390px checks passed in all four
  languages; the live Korean page had no horizontal overflow and showed the X
  fallback when the embed was unavailable. No D1 migration, wallet signature, or onchain
  transaction/deployment occurred.

## Homepage three-button CTA redesign (2026-09-28)

- Deployed to `rovyncore-production` with `--keep-vars`; Worker version
  `6e6791c1-2944-4997-aa69-32c9e54dc0c0` is serving the `.com` site.
- Replaced the two small hero actions plus inline whitelist link with a large
  RVYN whitelist primary action and two companion actions. The primary is 84px
  high; the companion buttons are 66px. Labels are centered, contextual icons
  sit after the labels, and all three use a consistent right arrow.
- Confirmed on the live homepage that the three links and dimensions render,
  the hero video is playing, and `/rvyn`, `/launchpad`, `/onchain-record`,
  `/latest-info`, and `/admin` continue to render. The admin check was limited
  to the wallet-authentication gate; no wallet was connected.
- `npm run build`, `npm run lint`, `npm run typecheck`, and the Wrangler
  production dry-run passed. No D1 migration, wallet signature, or onchain
  transaction/deployment was performed.
- The same-day Latest Information page already contains one combined
  2026-09-28 entry; it remains one entry for the day.

## Homepage and footer refinement (2026-09-27)

- Deployed to `rovyncore-production` with `--keep-vars`; Worker version
  `ddf5b2fb-d2a5-4631-bfeb-40878aec5d0a` is serving the `.com` site.
- Added a staged hero-text entrance, moved the Robinhood Chain card to the
  upper-right, aligned four homepage destinations, and added a direct RVYN
  allowlist-details link. The footer now includes the brand mark and three
  evenly distributed links.
- Added release `2026.09.27-05` to the Latest Information page in all four
  languages. The allowlist and sale remain governed by their existing state;
  this release did not open registration or sales.
- No database migration, wallet signature, or onchain transaction was needed.
  `npm run lint`, `npm run typecheck`, `npm run build`, and Wrangler dry-run
  passed. Production checks confirmed the four hero links, `/rvyn#allowlist`,
  footer logo and three footer links, and the new release entry. No browser
  console errors were observed.

The primary website is https://www.rovyncore.com; the apex
https://rovyncore.com redirects there. It is a direct Cloudflare Worker:

- Account: (redacted)
- Worker: rovyncore-production
- Configuration: wrangler.production.jsonc
- D1: rovyncore-prod-db
- R2: rovyncore-prod-assets

Build with the existing framework build script, then deploy the generated
dist/server/index.js and dist/client assets with the production Wrangler config,
preserving remote variables. Verify the actual .com origin after publishing.
Normal content and functionality releases do not require DNS changes.

## Website release: V5-ready experience (2026-09-27)

- Deployed the current site build to `rovyncore-production` with existing Worker
  variables retained. Worker version: `6c2c2af8-9648-4369-b46b-e19fd45ec92a`.
- No D1 migration was needed (`wrangler d1 migrations list --remote` reported
  no pending migrations).
- `npm run lint`, `npm run typecheck`, `npm run build`, and all five V5 presale
  tests passed. Wrangler production dry-run completed before publishing.
- Post-deploy GET checks returned HTTP 200 for `/`, `/rvyn`, `/launchpad`,
  `/onchain-record`, `/admin`, `/development-log`, and the public RVYN status
  and allowlist APIs.
- Production status remains `allowlist_prep`; purchases are closed and
  registration is disabled. The new V5 sale contract has not yet been deployed
  or configured, so this release does not open a sale.

## Completed release: RVYN sale desk and report-driven UX (2026-09-25)

- Before migration `0002_rvyn_sale_desk.sql`, exported the existing production
  D1 database to the local Temp file `rovyncore-prod-pre-0002-20260925.sql`.
  SHA-256: `F7C8E9EB3F60D2AD5D4ED509584E7A4CCA0102E0C453F44998E79AD8B277B6FA`.
  Restored the export into an isolated SQLite database; `PRAGMA integrity_check`
  returned `ok`, and the migration trial created `rvyn_allowlist` with eight
  columns. The backup is retained outside the repository.
- Applied the additive migration to the existing `rovyncore-prod-db`; Wrangler
  subsequently reported no pending migrations. The public status and allowlist
  APIs also confirmed the new table is available.
- Deployed to `rovyncore-production`, version
  `c56f2a1e-f3b0-464f-abad-0f550ff2c99b`, with 100% traffic and `--keep-vars`.
  No DNS or `.net` Sites deployment was changed.
- Lint, typecheck, production build, 50 unit tests, 8 validation tests, 22
  contract tests and 27 API integration checks passed. The API test runner
  emitted a non-fatal Node `MaxListenersExceededWarning` while all 27 checks
  passed.
- Checked the live `.com` homepage and Traditional Chinese language switch,
  `/rvyn`, `/launchpad`, `/onchain-record`, the canonical RVYN Asset Record,
  and the unauthenticated `/admin` gate. The RVYN English copy states all four
  allowlist caveats (eligibility only, not an NFT, not a live sale, and no
  token allocation); no Buy RVYN button is rendered. The wallet chooser lists
  MetaMask, Phantom, Coinbase Wallet, Rabby and Brave. Home and RVYN pages had
  no horizontal overflow at a 390px viewport.
- `/api/rvyn/status` and `/api/rvyn/allowlist` returned HTTP 200. The live
  stage is `allowlist_prep`; purchases and address lookup remain closed, and
  the zero-address read returned `preparing`. No wallet was connected and no
  onchain transaction was sent during acceptance.

The sale desk defaults to `allowlist_prep`. Admin-signed updates may open the
address lookup (`allowlist_open`), list or revoke wallets, and record a reason.
The `sale_open` transition and the admin's direct onchain open controls are
deliberately locked: the existing V3 presale contract does not enforce the
allowlist onchain. The public purchase gate also fails closed if stage data or
RPC state is unavailable. A future sale requires a separately developed and
verified allowlist-enforcing contract, legal review, funding, Record entry and
explicit stage transition; this UI release does not authorize purchases.

The Functional V1.2 Asset Record release requires D1 migration
`drizzle/0001_asset_record_layer.sql`. The 2026-09-24 release was backed up,
migrated, deployed and verified:

- Before migration, exported the production D1 database to
  `<local temp>\rovyncore-prod-pre-v12-20260924-a5b9c347ee184597bceca682da688b46.sql`.
  SHA-256: `91A4F05FEE46098D2A3743C2A8EB2A657E4754A2BE7D7BA8A118CB4A94062B0A`.
  The export was restored to an isolated SQLite database, integrity-checked,
  and the migration was dry-run against that copy before production apply.
- Applied the additive migration to the existing `rovyncore-prod-db`. The
  migration ledger has no pending entries. Production read-only checks found
  one row each in `assets`, `asset_origins`, `asset_states`, `asset_metadata`
  and `asset_events`; two `asset_links`; the existing single legacy Token row;
  and four append-only triggers. All verification queries reported zero rows
  written.
- Deployed to `rovyncore-production`, version
  `23ec6ef5-b3f7-4959-b7a2-9dfb9e251085`, with 100% traffic.
- Verified the live `.com` homepage (including muted looping hero video),
  `/onchain-record`, the RVYN detail at
  `/assets/robinhood/0x545a1ff27596de2f31480df39aa9548f363fc361`, and
  `/launchpad`. The `/explore?q=RVYN` and `/verify` compatibility routes
  resolve to the expected Onchain Record views. Public directory, detail,
  state and history API requests returned HTTP 200 with schema version 1.0.0.

- Full V1.2 revalidation and redeployment on 2026-09-24: Worker
  `rovyncore-production`, version
  `01458967-5406-40e0-b950-79c5864b4530`, 100% traffic. Deployed with
  `--keep-vars`; no D1 migration was run because the V1.2 schema is already
  present in production. Post-deploy checks confirmed the `.com` homepage
  video is muted/autoplay/loop, Launchpad and Onchain Record routes render,
  RVYN detail and `/rvyn` public token page are readable, and
  `/explore?q=RVYN` and `/verify` resolve to the
  directory and My Launches views. The list/detail/state/history public API
  endpoints returned HTTP 200 with schema version 1.0.0. RVYN's latest
  observed state is fresh: 10,000,000 total supply and 18 decimals match its
  launch snapshot; fields the record layer cannot observe remain unknown.
  The RVYN page visibly remains in `Preparing launch` state; this release does
  not represent the presale as open.

- Priority fixes and UI/UX recommendation follow-up, 2026-09-25: deployed to
  `rovyncore-production`, version
  `6bd1ea3b-da4b-4350-9ba1-cbca695c7bc3`, with 100% traffic and `--keep-vars`.
  No database migration was run. Updated `.com` canonical metadata and the
  homepage CTA hierarchy, connected RVYN to the canonical Asset Record, aligned
  legal copy with the currently closed Boost service, and clarified legacy
  provenance when factory identity is absent. Verified the live homepage
  (muted looping hero video), `/rvyn` (`PURCHASES NOT OPEN`), `/legal`, the RVYN
  Asset Record, and `/record` compatibility redirect. Public list/detail/state/
  history API reads succeeded. RVYN is labeled `legacy_import` with
  `legacy-indexed-launch-event` snapshot provenance; unsupported buy/sell tax
  fields remain `unknown`, and the latest state is fresh. No real-wallet or
  onchain transaction was sent.

- Repeat acceptance and production release, 2026-09-25: deployed to
  `rovyncore-production`, version
  `3879825e-13b2-4e35-903b-846b12b35f6d`, with 100% traffic and `--keep-vars`.
  No D1 migration was run. Lint, typecheck, production build, 5 validation
  tests, 22 contract tests, 13 wallet tests and 26 API integration checks
  passed. The built Worker preview and live `www.rovyncore.com` were checked;
  the live homepage video is muted/autoplay/loop, Onchain Record lists the
  canonical RVYN record, `/rvyn` shows 10,000,000 RVYN and
  `PURCHASES NOT OPEN`, and its Asset Record renders the preserved snapshot and
  current comparison. The built preview also confirmed the RVYN template and
  blank-form reset. No browser runtime errors were observed on the checked
  routes. Wrangler's remote D1 migration-list
  preflight was denied with Cloudflare API 7403; the existing V1.2 schema was
  already recorded as deployed, and no migration was attempted.

Keep the backup until a separate, verified restore point supersedes it. Do not
recreate the database or run a local D1 migration against production by
accident. This is a completed release record, not evidence of a completed
production restore drill or an independent security audit.

The .openai/hosting.json project is a separate Sites deployment currently used
by rovyncore.net. Publishing to Sites does NOT update the direct .com Worker.
These deployments also have separate data bindings; do not claim they share a
database or migrate/replace production data implicitly.

Wallet login uses one-time signed challenges and expiring HttpOnly sessions in
the existing challenges table with wallet-login: and wallet-session: prefixes.
Administrative actions continue to require their own specific signatures.
