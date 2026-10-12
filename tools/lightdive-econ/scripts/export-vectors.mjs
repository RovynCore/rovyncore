// Exports parity vectors from the real LightdiveConfig3 contract (deployed on a throwaway local chain) for the Python
// simulator's tests: the daily sky (lights and star events) and dive plans (odds table, risk, weight, cost, wear) for
// every destination, beam, decision and a spread of team powers. Read-only use of the contract; nothing is modified.
// Run from the repo root after `node scripts/compile-contracts-lightdive-v3.mjs`:
//   node --experimental-strip-types tools/lightdive-econ/scripts/export-vectors.mjs
import fs from "node:fs";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, defineChain } from "viem";

const A = JSON.parse(fs.readFileSync("packages/contracts/lightdive-v3/artifacts/contracts.json", "utf8"));
const ODDS = JSON.parse(fs.readFileSync("docs/lightdive/simulation/v3-odds.json", "utf8"));
const BEAM_KEY = ["廣域", "聚焦", "針芒"];
const THRESHOLDS = [51, 60, 70, 80, 92, 106, 122, 140, 160, 185, 215, 250, 290, 335, 385, 440, 500, 570, 650, 740, 840, 950, 1070, 1180];

const provider = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 1, defaultBalance: 100 }, chain: { chainId: 31337, hardfork: "shanghai" } });
const chain = defineChain({ id: 31337, name: "Local", nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: ["http://localhost"] } } });
const client = createPublicClient({ chain, transport: custom(provider) });
const wallet = createWalletClient({ chain, transport: custom(provider) });
const [admin] = await wallet.getAddresses();
const hash = await wallet.deployContract({ account: admin, abi: A.LightdiveConfig3.abi, bytecode: A.LightdiveConfig3.bytecode, args: [admin], gas: 14_000_000n });
const config = (await client.waitForTransactionReceipt({ hash })).contractAddress;
const read = (fn, args) => client.readContract({ address: config, abi: A.LightdiveConfig3.abi, functionName: fn, args });
for (let c = 0; c < 6; c++) {
  for (let b = 0; b < 3; b++) {
    const tiers = ODDS[`${c + 1}${BEAM_KEY[b]}`].map(([probBp, lo, hi]) => ({ probBp, lo, hi }));
    const h = await wallet.writeContract({ account: admin, address: config, abi: A.LightdiveConfig3.abi, functionName: "setTable", args: [c, b, tiers], gas: 3_000_000n });
    await client.waitForTransactionReceipt({ hash: h });
  }
}

const days = [20_000, 20_736, 20_737, 20_738, 30_123];
const sky = [];
for (const day of days) {
  const [dests, kinds] = await read("eventsOf", [day]);
  const lights = [];
  for (let d = 0; d < 24; d++) lights.push(Number(await read("lightOf", [day, d])));
  sky.push({ day, lights, events: [...dests].map((d, i) => [Number(d), Number(kinds[i])]) });
}

const plans = [];
for (const day of days.slice(1, 4)) {
  for (let dest = 0; dest < 24; dest++) {
    for (const beam of [0, 1, 2]) {
      for (const over of [0, 0.25, 0.6, 1.3]) {
        const power = Math.round(THRESHOLDS[dest] * (1 + over));
        for (const decision of [0, 1, 2, 3]) {
          const p = await read("plan", [dest, BigInt(power), beam, day, decision]);
          plans.push({
            day, dest, power, beam, decision,
            table: p.table.map((t) => [t.probBp, t.lo, t.hi]),
            risk: p.risk, starEvent: p.starEvent, coefBp: Number(p.coefBp), levyBp: p.levyBp, wear2Bp: p.wear2Bp, wear3Bp: p.wear3Bp,
          });
        }
      }
    }
  }
}
const claimFee = [];
for (const d of [0, 1, 7, 14, 15, 30]) claimFee.push([d, Number(await read("claimFeeBp", [BigInt(d * 86_400 + 5)]))]);

const out = { source: "LightdiveConfig3 (packages/contracts/lightdive-v3), exported on a local chain", sky, plans, claimFee };
fs.writeFileSync("tools/lightdive-econ/data/contract-vectors.json", JSON.stringify(out));
console.log(`exported ${sky.length} days of sky and ${plans.length} plans`);
await provider.disconnect();
