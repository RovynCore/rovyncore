# RovynCore

Website, smart contracts and tooling for **RovynCore** on Robinhood Chain (chain ID 4663). The first RovynCore game is in development; **RVYN** is planned as its currency. No game economy or token sale is open.

- Site: https://www.rovyncore.com
- Official X: [@RovynCORE](https://x.com/RovynCORE)
- Onchain facts and verification status: https://www.rovyncore.com/transparency

## Status, stated plainly

- The contracts in `packages/contracts` have been tested by their developers but **have not been audited by an independent third party**.
- The admin, Treasury and presale-sponsor roles are currently held by one externally owned wallet (not a multisig).
- This repository does not contain the game, private keys, deployment secrets or production data. Never put wallet keys or seed phrases in this project.

## Layout

| Path | What |
|---|---|
| `app/`, `components/`, `lib/`, `public/` | The website (React 19 on vinext/Vite, Cloudflare Workers) |
| `packages/contracts/` | Solidity sources, compiler settings and standard-input files (V1–V5) |
| `packages/web3/` | Chain config and client helpers |
| `tests/` | Unit and API integration tests |
| `scripts/` | Build, deployment and verification helpers |
| `releases/production/` | Per-release records with source-manifest hashes |
| `docs/` | Deployment and implementation notes |

## Verifying the contracts yourself

Each `packages/contracts/*/artifacts/standard-input.json` is the exact compiler input (solc 0.8.28, optimizer 200 runs, evm paris). Compile it and compare the runtime bytecode with `eth_getCode` at the addresses listed on the Transparency page.

## Develop

Node >= 22.13.

```sh
npm run install:ci
npm run contracts:compile
npm run typecheck
npm run build
```

Copy `.env.example` to `.env` for optional RPC endpoints. `docs/` describes the production deployment process; the Cloudflare resources named in `wrangler.production.jsonc` belong to the maintainers.

## Security

Report issues via `/.well-known/security.txt` on the site, or message [@RovynCORE](https://x.com/RovynCORE) on X. Do not open public issues for vulnerabilities.

## License

MIT. See [LICENSE](LICENSE). The RovynCore name, logos and brand assets in public/ are not licensed for reuse as a brand.
