// Shared logic of the Lightdive randomness operator, used by the CLI (scripts/lightdive-operator.mjs)
// and the Cloudflare Worker (workers/lightdive-operator). No file or environment access here.
//
// Every UTC day has one hash chain: v[last] = keccak256(secret, day), v[i] = keccak256(v[i+1]),
// anchor = keccak256(v[0]). The operator commits the anchors of today and the next days ahead of
// time and, each minute, reveals the latest finished slot that a mint or dive is waiting for.
// Revealing slot i also fixes every earlier slot of that day, so idle minutes cost nothing.
import { keccak256, encodeAbiParameters, parseAbiItem } from "viem";

export const SLOT_SECONDS = 60;
export const SLOTS_PER_DAY = 1440;
export const DAYS_AHEAD = 2; // commit today plus this many days
const ZERO = `0x${"0".repeat(64)}`;
const MAX_LOG_SPAN = 99_000n; // the public RPC allows 100,000 blocks per log query

const MINT_REQUESTED = parseAbiItem(
  "event MintRequested(uint256 indexed requestId, address indexed player, uint8 kind, uint16 qty, uint64 slot, uint256 paid, uint256 discount)",
);
const DIVED = parseAbiItem(
  "event Dived(uint256 indexed diveId, address indexed owner, uint256 indexed spire, uint8 depth, uint32 coordinate, uint256 luminance, uint256 points, uint8 beam, uint32 day, uint64 slot)",
);

/** The chain values v[0..SLOTS_PER_DAY-1] and the anchor for one day. */
export function chainFor(secret, day) {
  const v = new Array(SLOTS_PER_DAY);
  v[SLOTS_PER_DAY - 1] = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }], [secret, day]));
  for (let i = SLOTS_PER_DAY - 2; i >= 0; i--) v[i] = keccak256(v[i + 1]);
  return { v, anchor: keccak256(v[0]) };
}

/** v[index] of one day, hashing only from the top of the chain down to it. */
export function seedAt(secret, day, index) {
  let x = keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint32" }], [secret, day]));
  for (let i = SLOTS_PER_DAY - 1; i > index; i--) x = keccak256(x);
  return x;
}

// Hashing a whole day takes 15-20 ms of CPU, more than a free-plan Worker run may use, so a pass
// hashes only when it must: once a day to commit, and per reveal only down to the slot revealed.
// Anchors are kept for the life of the isolate.
const anchors = new Map();
const anchorFor = (secret, day) => {
  const key = `${secret}:${day}`;
  if (!anchors.has(key)) anchors.set(key, keccak256(seedAt(secret, day, 0)));
  return anchors.get(key);
};

/**
 * One operator pass. `lookbackBlocks` bounds how far back it looks for waiting requests.
 * @returns a short list of what it did, for logging
 */
export async function tick({ client, wallet, deployment, abi, secret, lookbackBlocks = 30_000n }) {
  const done = [];
  const beacon = deployment.beacon;
  const read = (functionName, args = []) => client.readContract({ address: beacon, abi, functionName, args });
  const write = async (functionName, args) => {
    // Simulate first so a revert surfaces with its reason instead of a bare failed receipt.
    const { request } = await client.simulateContract({ account: wallet.account, address: beacon, abi, functionName, args });
    // Reveals hash a chain forward, so their cost varies with the gap; leave generous headroom.
    const gas = await client.estimateContractGas({ account: wallet.account, address: beacon, abi, functionName, args });
    const hash = await wallet.writeContract({ ...request, gas: gas * 3n / 2n });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${functionName} failed: ${hash}`);
  };

  const now = Number(await read("currentSlot"));
  const today = Math.floor(now / SLOTS_PER_DAY);

  // 1. Commit today and the days ahead that have no anchor yet.
  for (let day = today; day <= today + DAYS_AHEAD; day++) {
    const [anchor] = await read("chainOf", [day]);
    if (anchor === ZERO) {
      await write("commit", [day, anchorFor(secret, day)]);
      done.push(`committed day ${day}`);
    }
  }

  // 2. Find finished slots that a recent mint or dive is waiting for.
  const latest = await client.getBlockNumber();
  const span = lookbackBlocks > MAX_LOG_SPAN ? MAX_LOG_SPAN : lookbackBlocks;
  const fromBlock = latest > span ? latest - span : 0n;
  const [mints, dives] = await Promise.all([
    client.getLogs({ address: deployment.minter, event: MINT_REQUESTED, fromBlock, toBlock: latest }),
    client.getLogs({ address: deployment.expedition, event: DIVED, fromBlock, toBlock: latest }),
  ]);
  const waiting = new Set();
  for (const log of [...mints, ...dives]) {
    const slot = Number(log.args.slot);
    if (slot < now) waiting.add(slot);
  }

  // 3. Per day, reveal the latest waiting slot whose seed is still unknown; that fixes the rest.
  const latestPerDay = new Map();
  for (const slot of waiting) {
    const day = Math.floor(slot / SLOTS_PER_DAY);
    if (!latestPerDay.has(day) || slot > latestPerDay.get(day)) latestPerDay.set(day, slot);
  }
  for (const [day, slot] of [...latestPerDay].sort((a, b) => a[0] - b[0])) {
    const [known] = await read("seedOf", [BigInt(slot)]);
    if (known) continue;
    const [anchor] = await read("chainOf", [day]);
    if (anchor === ZERO) continue;
    // A wrong secret makes the simulated reveal revert, so it surfaces as an error.
    await write("reveal", [BigInt(slot), seedAt(secret, day, slot % SLOTS_PER_DAY)]);
    done.push(`revealed slot ${slot}`);
  }
  return done;
}
