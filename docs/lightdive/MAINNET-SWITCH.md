# Lightdive v3: testnet deployment and the mainnet switch

Written 2026-10-15. The contracts are in `packages/contracts/lightdive-v3/`. They are candidates and **have not been audited**.

The website reads `packages/web3/lightdive-v3.json` and plays on whatever deployment that file names. It shows "testnet" and the faucet page from the chain id in that file, so switching is: deploy, fill the file, redeploy the website.

The private key is only ever typed by the founder. The script reads it from the terminal without showing it and never writes it anywhere. Claude never sees it.

## 1. Testnet (now)

What it does: deploys the 8 contracts, writes the 18 odds tables, wires the contracts together, mints 1,000,000 tRVYN into the Core Light Pool and opens summons. Then it writes `packages/web3/lightdive-v3.json`.

1. The deployer wallet needs a little Robinhood Chain testnet ETH, about 0.01 is plenty. Faucets:
   - https://faucet.testnet.chain.robinhood.com
   - https://www.alchemy.com/faucets/robinhood-testnet
2. In PowerShell, in the website folder:
   ```
   npm run lightdive:v3:deploy -- --network testnet
   ```
   It asks for the deployer's private key (0x…), which is not shown on screen.
3. It prints every step and finishes with `Wrote packages/web3/lightdive-v3.json.`
   - It takes about 30 transactions.
   - If it stops halfway, run the same command again. It continues from `tmp/lightdive-v3-deploy-testnet-46630.json`.
4. Tell Claude. Claude then:
   - checks the deployment on chain;
   - plays one full loop on the testnet;
   - deploys the website (release record);
   - pushes to GitHub.

Optional: `TREASURY_ADDRESS` (who receives the treasury share and royalties) and `POOL_SEED`. Without them, the deployer receives the treasury share and royalties, and the pool gets 1,000,000.

## 2. Mainnet: what is prepared

- **Deploy script:** `npm run lightdive:v3:deploy -- --network mainnet`. It needs:
  - `CONFIRM_MAINNET=yes`
  - `OWNER_ADDRESS`: the multisig that will own every contract, for example the Safe on /transparency.
  - `TREASURY_ADDRESS`
  - It uses the RVYN on /transparency (`0x545a1ff27596de2f31480df39aa9548f363fc361`). On 10-15 we checked that this token has `burn` and 18 decimals, which the game needs.
- **What the script does on mainnet:**
  - It uses the real RVYN and deploys no test token and no faucet.
  - It deploys and wires everything, then proposes the multisig as owner of each contract.
  - It does not fund the pool and does not open summons.
  - It writes `packages/web3/lightdive-v3.mainnet.json`. The website keeps playing on the testnet.
- **Randomness:** drand evmnet. Verifying a signature on Robinhood Chain mainnet was checked on 10-15 (about 180k gas). No operator or key is needed.

## 3. The switch (only when the founder says so)

Each step below is an on-chain or financial action and needs the founder's explicit go-ahead at the time:

1. Run the mainnet deploy (section 2) with the founder's deployer key and the env values above.
2. From the multisig, call `acceptOwnership` on config, nft, pool, minter, expedition, market and commissions (v3.1).
3. From the multisig, approve RVYN and call `CoreLightPool3.fund(amount)` to seed the pool. The founder decides the amount. The whitepaper assumes 1,000,000.
4. From the multisig, call `LightdiveMinter3.openSale(start)`, with 0 for now.
   - The first 48 hours limit each wallet to 3 spires.
   - Optionally, `setPricer` sets who may move summon prices within their bounds.
5. Claude copies `lightdive-v3.mainnet.json` over `lightdive-v3.json` and deploys the website with a release record. The faucet page then turns back into "Buy $RVYN", and the testnet badges disappear.
6. Testnet cards and tRVYN do not carry over. The testnet game can stay up at its own address or be retired.

**Before real value is at stake, strongly recommended:**
- an external audit of the v3 contracts;
- a timelock in front of the multisig (the contracts have owner setters with hard bounds, but no delay);
- a published bug-bounty contact.
