// 自動揭曉 (10-22): the site reveals every dive and summon as soon as its drand round is published, so nobody can look
// at a result first and leave a bad one unrevealed to collect the neutral fallback a day later (Expedition3 and
// LightdiveMinter3 both fall back after a day, and anyone may reveal). Runs from the Worker's cron
// (scripts/production-worker.mjs). It needs a keeper wallet that only pays gas: the founder creates it and sets its key
// as the Worker secret LIGHTDIVE_KEEPER_KEY. Without that secret it does nothing. The keeper can reveal and nothing
// else; rewards and cards always go to their owners.
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { gameChain, type GameChain } from "./deployment";
import { drandSignature } from "./onchain";

export type KeeperEnv = { DB: D1Database; LIGHTDIVE_KEEPER_KEY?: string };
export type KeeperStatus = {
  at: number; // unix seconds of the last run
  keeper: string | null;
  balanceWei: string | null;
  revealed: { dives: number; summons: number }; // this run
  total: { dives: number; summons: number }; // since the keeper started
  waiting: number; // due items whose drand round is not out yet
  skipped?: string[]; // why a due item was not sent (its simulation failed), the first few
  error?: string;
};

const SCAN = 400; // items looked at per run and kind
const BATCH = 20; // dives per revealMany
const SUMMONS_PER_RUN = 10; // the minter reveals one request per transaction
const GRACE = 3; // seconds after a round's time before asking drand for it

export const keeperKey = (chainId: number, block: number) => `lightdive-keeper:${chainId}:${block}`;
export const KEEPER_STATUS = "lightdive-keeper-status";

async function getSetting<T>(db: D1Database, key: string, fallback: T): Promise<T> {
  const r = await db.prepare("SELECT value FROM settings WHERE key=?").bind(key).first<{ value: string }>();
  return r ? (JSON.parse(r.value) as T) : fallback;
}
async function putSetting(db: D1Database, key: string, value: unknown) {
  await db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(key, JSON.stringify(value)).run();
}

/** Options for checks and tests: `dryRun` reads and simulates everything but sends and saves nothing; `game` and
 *  `from` point the keeper at a local chain and one of its unlocked accounts (scripts/lightdive-v3-keeper-test.mjs). */
type KeeperOptions = { dryRun?: boolean; game?: GameChain; from?: Address };

export async function runKeeper(env: KeeperEnv, { dryRun = false, game, from }: KeeperOptions = {}): Promise<KeeperStatus | null> {
  const G = game ?? gameChain();
  const key = env.LIGHTDIVE_KEEPER_KEY?.trim();
  if (!G.contracts || (!key && !dryRun && !from)) return null; // off until the founder sets the keeper's key
  const account = key ? privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex) : { address: from ?? ("0x000000000000000000000000000000000000dEaD" as Address) };
  const pub = createPublicClient({ chain: G.chain, transport: http(G.rpcUrl) });
  const wallet = "signTransaction" in account ? createWalletClient({ account, chain: G.chain, transport: http(G.rpcUrl) })
    : from ? createWalletClient({ account: from, chain: G.chain, transport: http(G.rpcUrl) }) : null;
  const C = G.contracts, A = G.abi;
  const cursorKey = keeperKey(G.deployment.chainId, G.deployment.deploymentBlock);
  const cursor = dryRun ? { dive: 0, summon: 0, total: { dives: 0, summons: 0 } } : await getSetting(env.DB, cursorKey, { dive: 0, summon: 0, total: { dives: 0, summons: 0 } });
  const prev = dryRun ? null : await getSetting<KeeperStatus | null>(env.DB, KEEPER_STATUS, null);
  const now = Math.floor(Date.now() / 1000);
  const sigs = new Map<bigint, Hex | null>();
  const signature = async (round: bigint) => {
    if (!sigs.has(round)) sigs.set(round, await drandSignature(round).catch(() => null));
    return sigs.get(round)!;
  };
  // many reads at once: one multicall where the chain has it (testnet, mainnet), one by one on a local chain
  type Read = { address: Address; abi: unknown; functionName: string; args: unknown[] };
  const reads = (calls: Read[]): Promise<unknown[]> => G.multicall
    ? pub.multicall({ multicallAddress: G.multicall, allowFailure: true, contracts: calls as never })
    : Promise.all(calls.map((x) => pub.readContract(x as never).then((result) => ({ status: "success", result }), () => ({ status: "failure" }))));
  const times = new Map<bigint, Promise<bigint>>();
  const roundTime = (round: bigint) => {
    if (!times.has(round)) times.set(round, pub.readContract({ address: C.rng, abi: A.DrandEvmnetRandomness, functionName: "roundTime", args: [round] }) as Promise<bigint>);
    return times.get(round)!;
  };
  // a reveal mints cards and settles rewards: gas is estimated, then given half again as headroom
  const send = async (call: Read) => {
    const gas = await pub.estimateContractGas({ ...call, account: account.address } as never);
    const hash = await wallet!.writeContract({ ...call, gas: (gas * 3n) / 2n } as never);
    return pub.waitForTransactionReceipt({ hash, timeout: 25_000 });
  };
  const skip = (what: string, e: unknown) => {
    const why = String((e as { shortMessage?: string })?.shortMessage ?? (e as Error)?.message ?? e).slice(0, 160);
    if ((status.skipped ??= []).length < 5) status.skipped.push(`${what}: ${why}`);
    return false;
  };
  const status: KeeperStatus = { at: now, keeper: account.address, balanceWei: null, revealed: { dives: 0, summons: 0 }, total: cursor.total, waiting: 0 };

  try {
    // ---- dives: scan from the oldest one that may still be open
    const count = Number(await pub.readContract({ address: C.expedition, abi: A.Expedition3, functionName: "diveCount" }));
    const ids = Array.from({ length: Math.min(SCAN, Math.max(0, count - cursor.dive)) }, (_, i) => BigInt(cursor.dive + i));
    const infos = await reads(ids.map((id) => ({ address: C.expedition, abi: A.Expedition3, functionName: "diveInfo", args: [id] })));
    const due: { id: bigint; sig: Hex }[] = [];
    let lowestOpen: number | null = null;
    for (let i = 0; i < ids.length; i++) {
      const r = infos[i] as { status: string; result?: { owner: Address; revealed: boolean; round: bigint } };
      const d = r.status === "success" ? r.result! : null;
      if (!d || d.revealed || /^0x0+$/.test(d.owner)) continue;
      lowestOpen ??= Number(ids[i]);
      if (Number(await roundTime(d.round)) + GRACE > now) { status.waiting++; continue; }
      const sig = await signature(d.round);
      if (sig) due.push({ id: ids[i], sig }); else status.waiting++;
    }
    for (let i = 0; i < due.length; i += BATCH) {
      const part = due.slice(i, i + BATCH);
      // simulate first: a dive its owner revealed a moment ago would make the whole batch revert
      const ok: typeof part = [];
      for (const x of part) {
        const sim = await pub.simulateContract({ account: account.address, address: C.expedition, abi: A.Expedition3, functionName: "revealMany", args: [[x.id], [x.sig]] }).then(() => true, (e) => skip(`dive ${x.id}`, e));
        if (sim) ok.push(x);
      }
      if (!ok.length) continue;
      if (dryRun) { status.revealed.dives += ok.length; continue; }
      const call = { address: C.expedition, abi: A.Expedition3, functionName: "revealMany", args: [ok.map((x) => x.id), ok.map((x) => x.sig)] };
      const receipt = await send(call);
      if (receipt.status === "success") status.revealed.dives += ok.length; else skip(`dives ${ok.map((x) => x.id).join(",")}`, "reverted");
    }
    cursor.dive = lowestOpen ?? cursor.dive + ids.length;

    // ---- summons: the minter reveals one request per transaction
    const rcount = Number(await pub.readContract({ address: C.minter, abi: A.LightdiveMinter3, functionName: "requestCount" }));
    const rids = Array.from({ length: Math.min(SCAN, Math.max(0, rcount - cursor.summon)) }, (_, i) => BigInt(cursor.summon + i));
    const reqs = await reads(rids.map((id) => ({ address: C.minter, abi: A.LightdiveMinter3, functionName: "request", args: [id] })));
    let lowestReq: number | null = null;
    let sent = 0;
    for (let i = 0; i < rids.length; i++) {
      const r = reqs[i] as { status: string; result?: { player: Address; revealed: boolean; round: bigint } };
      const q = r.status === "success" ? r.result! : null;
      if (!q || q.revealed || /^0x0+$/.test(q.player)) continue;
      lowestReq ??= Number(rids[i]);
      if (sent >= SUMMONS_PER_RUN || Number(await roundTime(q.round)) + GRACE > now) { status.waiting++; continue; }
      const sig = await signature(q.round);
      if (!sig) { status.waiting++; continue; }
      const sim = await pub.simulateContract({ account: account.address, address: C.minter, abi: A.LightdiveMinter3, functionName: "reveal", args: [rids[i], sig] }).then(() => true, (e) => skip(`summon ${rids[i]}`, e));
      if (!sim) continue;
      if (dryRun) { status.revealed.summons++; sent++; continue; }
      const receipt = await send({ address: C.minter, abi: A.LightdiveMinter3, functionName: "reveal", args: [rids[i], sig] });
      if (receipt.status === "success") { status.revealed.summons++; sent++; } else skip(`summon ${rids[i]}`, "reverted");
    }
    cursor.summon = lowestReq ?? cursor.summon + rids.length;
  } catch (e) {
    status.error = String((e as Error)?.message ?? e).slice(0, 300);
  }
  status.total = { dives: cursor.total.dives + status.revealed.dives, summons: cursor.total.summons + status.revealed.summons };
  cursor.total = status.total;
  status.balanceWei = await pub.getBalance({ address: account.address }).then(String, () => prev?.balanceWei ?? null);
  if (dryRun) return status;
  await putSetting(env.DB, cursorKey, cursor);
  await putSetting(env.DB, KEEPER_STATUS, status);
  return status;
}
