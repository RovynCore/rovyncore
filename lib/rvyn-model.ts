// V5 allocation and supply constants were read back from the deployed mainnet
// contracts on 2026-09-30 (the V6 candidate keeps the same allocations). Contract-defined allocations do not imply funding,
// distribution, whitelist opening or sale opening. See the onchain-facts audit.
export const RVYN_MODEL = {
  name: "RovynCore",
  symbol: "RVYN",
  // Canonical mainnet #001 contract; used for read-only Record links when the
  // deployment setting has not yet been restored on a local/preview database.
  contractMainnet: "0x545a1ff27596de2f31480df39aa9548f363fc361",
  supply: "10000000",
  decimals: 18,
  priceEth: "0.0001",
  presaleTokens: "1000000",
  // The full fixed supply is deposited into the sale contract, which holds it until settlement.
  escrowTokens: "10000000",
  walletCapEth: "0.25",
  walletCapTokens: 2500,
  teamCliffYears: 1,
  teamVestingMonths: 24,
  // Official Uniswap V2 Router02 deployment on Robinhood Chain (chain 4663).
  routerMainnet: "0x89e5DB8B5aA49aA85AC63f691524311AEB649eba",
  // Safe multisig (2 of 3, deployed 2026-10-05) that may sponsor a V5 sale instead of the single admin wallet.
  multisigMainnet: "0xe574e30153efcd94F686124B2d586A0643b33Ef4",
  factoryMainnet: "0x8bceaa40b9acdfaedf85adf4ff01f5ad6517937f",
  wethMainnet: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
  // Constructor parameters decided by the founder on 2026-10-05 for the V6 sale (not yet deployed): the Safe is sponsor,
  // team beneficiary and LP beneficiary; LP locked 24 months; operating funds unlock 25% per 30 days from settlement.
  v6Deployment: {
    lpLockSeconds: 730 * 24 * 60 * 60,
    withdrawStepBps: 2500,
  },
  allocations: [
    { label: "Presale", percent: 10, tokens: 1000000 },
    { label: "Liquidity allocation", percent: 50, tokens: 5000000 },
    { label: "Manager wallet", percent: 5, tokens: 500000 },
    { label: "Team vesting", percent: 10, tokens: 1000000 },
    { label: "Product and ecosystem", percent: 10, tokens: 1000000 },
    { label: "Community and creators", percent: 10, tokens: 1000000 },
    { label: "Airdrop reserve", percent: 5, tokens: 500000 },
  ],
} as const;
