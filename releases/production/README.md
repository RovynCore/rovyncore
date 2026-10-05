# Production release baseline

This folder tracks what is actually live so future releases can distinguish new work from already-published work without repeatedly asking the user to review old changes.

## Rules

1. Read `baseline.json` before a release.
2. Compare the requested release with the recorded production baseline and deploy only that scope. Never treat all modified or untracked files as automatically authorized for deployment.
3. After a successful deployment, record the Cloudflare Worker version and the exact Git revision or source-file hashes used. Record checks and state explicitly whether D1 migrations or onchain actions occurred.
4. Keep source files in their normal application folders. This folder contains release records and manifests, not replacements for build inputs.
5. If a release is blocked, leave the production baseline unchanged and record the attempted release as not deployed.

## Current known state

The latest documented live Worker release is recorded in `baseline.json`, with a
SHA-256 inventory of its local source/build-input files under `snapshots/` (279 files as of 2026-10-05-01). Compare
future candidates with that inventory, not with the dirty Git status alone. The
full source hashes for releases *before* this inventory were not retained, so
the pre-fix working-tree snapshot is not proof of an exact prior Worker build.
The 2026-09-30 and 2026-10-01 uploads withheld eight unused reference images from the generated
static artifact; the source inventory still lists those local-only files.





