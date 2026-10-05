# RovynCore operations runbook

Short, practical, and honest about what exists today. Update it whenever a step changes.

## Who can do what

| Action | Who | How |
|---|---|---|
| Deploy the website | Maintainer with Wrangler access to the Cloudflare account | `npm run build`, then `npx wrangler deploy --config wrangler.production.jsonc --keep-vars`; record the release (see below) |
| Roll the website back | Same | `npx wrangler rollback <previous-version-id> --config wrangler.production.jsonc`; the previous version id is in `releases/production/baseline.json` |
| Admin actions on the site | The admin wallet (signs each action) | `/admin` |
| Onchain actions for the V5/V6 sale | The Safe multisig (2 of 3 signers) | Admin page, "Multisig proposals (Safe)" panel, then Safe Transaction Builder |
| Platform contract owner / Treasury | The admin wallet (a single wallet; the founder decided on 2026-10-06 to keep it that way) | Only after founder approval |

Rule: no contract deployment, onchain transaction, D1 migration, sale opening or allowlist root change without the founder's explicit go-ahead. Keep at least two people able to perform every critical action; today that is not yet true for the website deploy and the Cloudflare account.

## Release record (every production publish)

1. `npm run typecheck`, `npm run lint`, the tests in `.github/workflows/ci.yml`.
2. `node scripts/production-source-inventory.mjs --out releases/production/snapshots/release-YYYY-MM-DD-NN.json --compare <previous snapshot>`.
3. Write `releases/production/release-YYYY-MM-DD-NN.md` and update `releases/production/baseline.json` (version id, snapshot hash, bundle hashes, previous version).

## If something goes wrong

1. **Site broken after a deploy**: roll back (above), then investigate. Rolling back does not touch D1 or R2.
2. **Suspected key compromise of the admin wallet**: stop using it; move assets that can be moved to the Safe; tell the other signers; do not sign anything on the old key. The V5 sponsor role is immutable, which is why the sale contract is sponsored by the Safe.
3. **Suspected compromise of a Safe signer**: the other two signers must not approve anything from that signer; replace the signer through a Safe transaction signed by the remaining two.
4. **Cloudflare account or API token exposure**: rotate the token in the Cloudflare dashboard, review Worker versions and D1/R2 activity, redeploy from a clean checkout.
5. **Data loss**: D1 Time Travel is the only automatic recovery today (see below). There is no scheduled export yet.

## Backups: current state

- The Worker contains an operations backup endpoint, but `OPS_TOKEN` is not configured and no scheduler calls it, so no scheduled backup runs. D1 Time Travel is the recovery path until that changes.
- To enable backups: set a random `OPS_TOKEN` secret on the Worker, schedule a daily call from a private place the founder controls, store the encrypted output off the Cloudflare account, and rehearse one full restore before relying on it. Record the rehearsal here.

## Monitoring: current state

- The X auto-sync cron was removed on 2026-10-05; the Worker has no cron triggers now.
- Nothing alerts anyone if the site or the RPC fails. Recommended next steps: an external uptime check on `/` and `/api/rvyn/status`, and a dedicated primary plus a separate fallback RPC for `RPC_MAINNET`.

## Security headers

- Enforced: HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Report-only: `Content-Security-Policy-Report-Only` (see `scripts/production-worker.mjs`). To enforce, browse every page and admin flow with the browser console open, fix anything reported, then rename the header to `Content-Security-Policy`.
