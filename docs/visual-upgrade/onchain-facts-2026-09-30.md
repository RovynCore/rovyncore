# RVYN mainnet facts used for visual acceptance

Read-only verification on 2026-09-30, near Robinhood Chain block `76496458`
(2026-09-30 11:56:38 UTC). Network identity and RPC/explorer endpoints come from
[Robinhood Chain's official documentation](https://docs.robinhood.com/chain/connecting/).
This record is an observation, not a custody audit or assurance about future
availability. No wallet signature or transaction was sent.

| Source | Observed fact |
| --- | --- |
| Robinhood Chain official RPC, `eth_chainId` / block | Chain ID `4663`; block `76496458`, hash `0x0f691d77a30efd530f970dbe30c594b5027e7df66d4e83f394f48a396bd4fc93`. |
| [RVYN token](https://robinhoodchain.blockscout.com/token/0x545a1ff27596de2f31480df39aa9548f363fc361), `totalSupply()` / `decimals()` | `10,000,000` RVYN, 18 decimals; [Blockscout token API](https://robinhoodchain.blockscout.com/api/v2/tokens/0x545a1ff27596de2f31480df39aa9548f363fc361) also returned name `RovynCore`, symbol `RVYN`, raw supply `10000000000000000000000000`, one holder at the time queried. |
| Token `balanceOf()` | Manager wallet `0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e`: `10,000,000` RVYN; [V5 sale contract](https://robinhoodchain.blockscout.com/address/0x3cb9443f4726155817106a0fe115b26e9ad14b5f): `0` RVYN. |
| V5 contract `TOTAL_INVENTORY()` and seven allocation constants | Inventory `10,000,000`: sale `1,000,000` (10%), liquidity `5,000,000` (50%), manager `500,000` (5%), team `1,000,000` (10%), product `1,000,000` (10%), community `1,000,000` (10%), airdrop `500,000` (5%). These are contract-defined caps, **not** proof that inventory has been transferred or distributed. |
| V5 `token()` / `state()` / `openedAt()` / `raised()` | Token points to `0x545a1ff27596de2F31480dF39AA9548f363Fc361`; state `0`, open timestamp `0`, raised `0`. |
| V5 `PRICE()` / `WALLET_CAP()` / `HARD_CAP()` / `DURATION()` / `lpLockDuration()` | `0.0001` ETH per RVYN, `0.25` ETH wallet cap (2,500 RVYN at that price), `100` ETH hard cap, 14-day contract duration once opened, and a 730-day LP lock duration. These terms are deployed code; the sale is **not open**. |
| [Public site config](https://www.rovyncore.com/api/config) / [sale status](https://www.rovyncore.com/api/rvyn/status) | Chain `4663`; V5 sale address above; `allowlist_prep`, purchases closed, registry closed at the time queried. |
| [Public Asset Record directory](https://www.rovyncore.com/api/v1/assets?limit=20) | Exactly one confirmed public asset in the returned page, RVYN, with `nextCursor: null`. Do not render other reference-image projects as actual records. |
| [Public RVYN Asset Record](https://www.rovyncore.com/api/v1/assets/0x545a1ff27596de2f31480df39aa9548f363fc361) | Original and last observed total supply both return 10,000,000 with 18 decimals. The observed current-state snapshot was explicitly marked `stale` (`blockNumber: 76516307`, `lastSyncedAt: 1790771401`, 600-second freshness threshold) at query time. Do not show this as a fresh chain read. |
| [Recorded launch transaction](https://robinhoodchain.blockscout.com/tx/0x59bda22cfb9ee771695b0b39788201340ce2c9c6e6c52d8e256164be207b9234) | Official RPC receipt returned `success` at block `62782806`, matching the public Asset Record. Its direct `contractAddress` receipt field is `null` (factory-mediated transaction), so the token address is corroborated separately by its live ERC-20 read and V5 `token()` getter. |

The PDF's `1B` RVYN and sample project/community counts are visual mock data,
not mainnet facts. Layout and visual density should follow the canonical image;
numeric labels, records, eligibility, transfers and sale states must follow the
verified sources above or show an honest pending/unavailable state. Re-query
mutable balances and sale state before any later release; the total supply and
V5 allocation constants are contract-defined, but transfer/funding state can
change.
