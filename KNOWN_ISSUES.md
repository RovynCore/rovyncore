# Known issues and remaining validation

- The pending, **not yet deployed** sale-desk update includes a local-only D1
  migration (`0002_rvyn_sale_desk.sql`). The current presale contract does not
  enforce an allowlist onchain, so `sale_open` and Buy remain intentionally
  unavailable. Production database migration, privileged-wallet UI testing,
  and live-domain smoke testing must wait for an explicitly approved release.
- The pending Asset Record comparison now omits template capabilities that
  cannot be read (owner, mint/pause, proxy and taxes) instead of showing them
  as "unknown" safety signals. Historical deployment notes below describe
  what the older, currently live release displayed.
- Local browser testing of the RVYN Asset Record showed its immutable
  10,000,000 RVYN / 18-decimal snapshot, but current-state RPC reads returned
  unavailable. The UI correctly distinguishes this from the confirmed launch
  snapshot. Local RPC failure is not evidence of production RPC failure.

- No real Robinhood Testnet/mainnet launch transaction or real user-wallet reconnect/recovery session was performed. Production read-only Asset Record endpoints and the existing RVYN state observation work; this does not substitute for a real wallet launch rehearsal or independent RPC/provider failover test.
- Synchronization remains receipt-triggered plus the existing operations runner/scheduler hook. This is not a continuously managed, full-history chain indexer. The current record observes only its supported ERC-20 fields; it does not claim complete transfer, holder, liquidity-pair, or DEX history.
- Migration backfills legacy launches from fields available in the previous schema. Some old records may have incomplete block hash, factory/version, origin, or metadata provenance; the record marks missing values rather than inventing them.
- Creator edit sessions and website administration currently rely on EOA wallet signatures. EIP-1271 smart-contract wallet authentication and multi-sig website administration are not implemented. The admin correction path was reviewed and its append-only data constraints tested, but a real privileged wallet correction was not submitted to production.
- External asset registration, ERC-721/1155 adapters, full indexer operation, LP/pair observation, API keys, SDK, webhooks, paid analytics, and a developer portal are intentionally outside this current implementation and remain future scope.
- No independent contract/security audit, sustained-load/Sybil test, production backup restore drill, or legal review has been completed. Public records and contract facts are not safety ratings, endorsements, or legal advice.
- Repository-wide lint is clean as of 2026-09-25 (`npm run lint`: 0 errors, 0 warnings). The previous 78 errors and 33 warnings were fixed; see `TEST_REPORT.md` for verification details.
- Automated browser smoke tests passed locally. Production smoke checks also passed for the homepage (including muted hero video), Onchain Record directory/detail, Launchpad, and legacy route redirects. Current-state data was live on the production detail page; the local RPC configuration had previously returned unavailable and must not be treated as evidence about the production provider.
- A verified local pre-migration SQLite backup remains at `%TEMP%\rovyncore-local-d1-before-v12-19478b823bc5436984688c0870793178.sqlite`. The verified production pre-migration SQL backup and deployment evidence are recorded in `docs/PRODUCTION-DEPLOYMENT.md`.
- The 2026-09-25 recommendation follow-up is live on `www.rovyncore.com` (Worker version `6bd1ea3b-da4b-4350-9ba1-cbca695c7bc3`). Legacy RVYN factory provenance is unavailable in the imported source, so the UI reports that gap and leaves unobservable tax fields unknown. The live sale is not open. A real-wallet launch rehearsal and production restore drill remain manual follow-ups.
