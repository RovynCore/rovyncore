# RovynCore

Website, smart contracts and tooling for **RovynCore** on Robinhood Chain (chain ID 4663). The first RovynCore game, **Lightdive**, is open on the Robinhood Chain **testnet** with test tokens that have no value. **RVYN** is its currency. No mainnet game economy or token sale is open.

- Site: https://www.rovyncore.com
- Play (testnet): https://www.rovyncore.com/game/lightdive
- Onchain facts and verification status: https://www.rovyncore.com/transparency
- Official X: a new account will be announced on the site; the old @RovynCORE account is not active.

## Status, stated plainly

- The contracts in `packages/contracts` have been tested by their developers but **have not been audited by an independent third party**.
- The admin and Treasury roles are currently held by one externally owned wallet (not a multisig). The V6 presale contract is controlled by a 2-of-3 Safe.
- Lightdive's randomness comes from **drand evmnet**, verified on chain, with no operator, seed or key (see `docs/lightdive/README.md`). The Lightdive v1 contracts and their randomness operator are retired and kept for history only.
- This repository does not contain private keys, deployment secrets or production data. Never put wallet keys or seed phrases in this project.

## Layout

| Path | What |
|---|---|
| `app/`, `components/`, `lib/`, `public/` | The website and the Lightdive game client (React 19 on vinext/Vite, Cloudflare Workers) |
| `packages/contracts/` | Solidity sources, compiler settings and standard-input files; `lightdive-v3/` is the live game |
| `packages/web3/` | Chain config, deployments and client helpers |
| `tests/` | Unit, contract and API integration tests |
| `scripts/` | Build, deployment and verification helpers |
| `releases/production/` | Per-release records with source-manifest hashes |
| `docs/` | Deployment, implementation and game design notes |

## Verifying the contracts yourself

Each `packages/contracts/*/artifacts/standard-input.json` is the exact compiler input (solc 0.8.28, optimizer 200 runs, evm paris). Compile it and compare the runtime bytecode with `eth_getCode` at the addresses listed on the Transparency page. Any Lightdive dive can be recomputed from the public drand signature at `/game/lightdive/verify/<dive id>`.

## Develop

Node >= 22.13.

```sh
npm run install:ci
npm run contracts:compile
npm run typecheck
npm run test:lightdive:v3
npm run build
```

Copy `.env.example` to `.env` for optional RPC endpoints. `docs/` describes the production deployment process; the Cloudflare resources named in `wrangler.production.jsonc` belong to the maintainers.

## Security

Report issues via `/.well-known/security.txt` on the site. Do not open public issues for vulnerabilities.

## License

MIT. See [LICENSE](LICENSE). The RovynCore name, logos and brand assets in public/ are not licensed for reuse as a brand.
