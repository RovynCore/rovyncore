// Produces a reproducible, non-deploying manifest. Never accepts private keys.
import fs from "node:fs";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const run = (...args) =>
  execFileSync(process.execPath, args, { stdio: "inherit", windowsHide: true });
run("scripts/compile-contracts-v2.mjs");
run("--test", "tests/contracts-v2.test.mjs", "tests/presale.test.mjs", "tests/presale-v3.test.mjs");
const root = "packages/contracts/v2/";
const files = [
  "GenesisPlatform.sol",
  "GenesisPresale.sol",
  "artifacts/contracts.json",
  "artifacts/standard-input.json",
  "artifacts/compiler.json",
];
const manifest = {
  version: "3.0.0-rc.1-rvyn-manual-pool",
  builtAt: new Date().toISOString(),
  status: "local-regression-passed-not-deployed",
  contracts: ["GenesisPlatform", "GenesisPresale", "GenesisPresaleV3", "GenesisTokenLock"],
  legacyOnly: ["GenesisSale"],
  compiler: JSON.parse(
    fs.readFileSync(root + "artifacts/compiler.json", "utf8"),
  ),
  files: Object.fromEntries(
    files.map((p) => [
      p,
      crypto
        .createHash("sha256")
        .update(fs.readFileSync(root + p))
        .digest("hex"),
    ]),
  ),
  deploymentGates: [
    "Independently review new presale and real DEX integration",
    "Verify chain-specific router/factory/WETH and deployed code",
    "Verify constructor arguments, sponsor wallet and GEN provenance",
    "Integrate version-aware website ABI and registration; deposit 8000000 RVYN before opening presale",
    "For V3, choose and disclose the pool ETH amount before settlement; only post-settlement surplus is withdrawable",
    "Publish operator, jurisdiction and contact details",
  ],
  rules: {
    supply: "10000000 RVYN",
    price: "0.0001 ETH",
    softCap: "none",
    hardCap: "100 ETH",
    walletCap: "0.25 ETH cumulative / 2500 RVYN",
    saleTokens: "1000000 RVYN",
    durationDays: 14,
    settlementWindowDays: 7,
    lpPercent: 50,
    teamPercent: 20,
    ecosystemPercent: 10,
    marketingPercent: 10,
    requiredEscrow: "8000000 RVYN",
    unsoldPresale: "burn",
    lpLockDays: 365,
    teamLockDays: 730,
    unusedReserveLockDays: 365,
  },
  testScope:
    "Local Ganache, mock DEX; not third-party audit or real-network acceptance",
};
fs.writeFileSync(
  root + "artifacts/release-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log("Release candidate saved; no transactions sent.");
