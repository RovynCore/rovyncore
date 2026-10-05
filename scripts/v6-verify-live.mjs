// Read-only check of a deployed RovynPresaleV6 against the compiled artifact and the founder's decided parameters.
// Usage: node --experimental-strip-types scripts/v6-verify-live.mjs <saleAddress>
import crypto from "node:crypto";
import fs from "node:fs";
import { createPublicClient, getAddress, http, formatEther } from "viem";
import { RVYN_MODEL } from "../lib/rvyn-model.ts";

const sale = process.argv[2];
if (!sale) throw new Error("usage: v6-verify-live.mjs <saleAddress>");
const A = JSON.parse(fs.readFileSync("packages/contracts/v6/artifacts/contracts.json", "utf8")).RovynPresaleV6;
const c = createPublicClient({ transport: http(process.env.RPC || "https://rpc.mainnet.chain.robinhood.com") });
const read = (functionName) => c.readContract({ address: sale, abi: A.abi, functionName });
const code = (await c.getBytecode({ address: sale })) || "0x";
const results = [];
const check = (name, ok, detail = "") => { results.push(ok); console.log(`${ok ? "  ok " : "  FAIL"} ${name}${detail ? " · " + detail : ""}`); };

// Immutables (token, router, beneficiaries, lock, ...) are written into the runtime code at deployment, once per use, so
// the live code may differ from the artifact only in 32-byte slots that are zero in the artifact and hold one of the
// expected constructor values in the live code. Everything else must be byte-identical.
const pad = (hex) => hex.replace(/^0x/, "").toLowerCase().padStart(64, "0");
async function sameExceptImmutables(live, artifact) {
  const expected = new Set([
    ...(await Promise.all(["token", "router", "factory", "weth", "teamBeneficiary", "lpBeneficiary"].map((n) => read(n)))).map((v) => pad(v)),
    pad((await read("lpLockDuration")).toString(16)), pad((await read("withdrawStepBps")).toString(16)),
  ]);
  const a = live.slice(2).toLowerCase(); const b = artifact.slice(2).toLowerCase();
  if (a.length !== b.length) return { ok: false, slots: 0, why: "length differs" };
  let slots = 0;
  for (let i = 0; i < a.length;) {
    if (a.slice(i, i + 2) === b.slice(i, i + 2)) { i += 2; continue; }
    let matched = false;
    for (let w = Math.max(0, i - 62); w <= i; w += 2) {
      if (w + 64 > a.length) break;
      if (/^0+$/.test(b.slice(w, w + 64)) && expected.has(a.slice(w, w + 64))) { slots++; i = w + 64; matched = true; break; }
    }
    if (!matched) return { ok: false, slots, why: `unexplained difference at byte ${i / 2}` };
  }
  return { ok: slots > 0, slots, why: "" };
}
const same = await sameExceptImmutables(code, A.runtime);
check("runtime code equals the compiled artifact except immutable slots", same.ok, `${same.slots} immutable slots ${same.why}; sha256 ${crypto.createHash("sha256").update(Buffer.from(code.slice(2), "hex")).digest("hex")}`);
const safe = getAddress(RVYN_MODEL.multisigMainnet);
check("sponsor is the Safe", getAddress(await read("sponsor")) === safe);
check("team beneficiary is the Safe", getAddress(await read("teamBeneficiary")) === safe);
check("LP beneficiary is the Safe", getAddress(await read("lpBeneficiary")) === safe);
check("token is RVYN", getAddress(await read("token")) === getAddress(RVYN_MODEL.contractMainnet));
check("router, factory, WETH are the real ones", getAddress(await read("router")) === getAddress(RVYN_MODEL.routerMainnet) && getAddress(await read("factory")) === getAddress(RVYN_MODEL.factoryMainnet) && getAddress(await read("weth")) === getAddress(RVYN_MODEL.wethMainnet));
check("LP lock is 730 days", (await read("lpLockDuration")) === 730n * 86400n);
check("withdraw step is 25%", (await read("withdrawStepBps")) === 2500n);
check("pool floor 50% and grace 7 days", (await read("MIN_POOL_BPS")) === 5000n && (await read("SETTLE_GRACE")) === 7n * 86400n);
check("untouched: state Pending, nothing raised, no inventory", (await read("state")) === 0 && (await read("raised")) === 0n && (await read("inventoryDeposited")) === false, `raised ${formatEther(await read("raised"))}`);
console.log(results.every(Boolean) ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
process.exit(results.every(Boolean) ? 0 : 1);
