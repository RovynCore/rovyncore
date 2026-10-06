import { env } from "cloudflare:workers";
import { readEventWindow } from "./event-logs";
import {
  createPublicClient,
  http,
  fallback,
  formatEther,
  decodeEventLog,
  keccak256,
  toBytes,
  verifyMessage,
  type Address,
  type Hex,
} from "viem";
import {
  CHAINS,
  DEFAULT_CONFIG,
  OWNER,
  type PlatformConfig,
  type ChainId,
} from "@/packages/web3/config";
import artifacts from "@/packages/web3/artifacts.json";
import { tokenSchema, trendingScore } from "./validation";
import { eventStatement, launchRecordStatements } from "./asset-record";

export const bindings = () =>
  env as unknown as {
    DB: D1Database;
    BUCKET: R2Bucket;
    RPC_TESTNET?: string;
    RPC_MAINNET?: string;
    RPC_TESTNET_FALLBACK?: string;
    RPC_MAINNET_FALLBACK?: string;
    OPS_TOKEN?: string;
    HUMAN_VERIFICATION?: string;
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    TURNSTILE_HOSTNAMES?: string;
    LAUNCH_CONFIRMATION_DEPTH?: string;
    ASSET_STATE_FRESHNESS_SECONDS?: string;
    PUBLIC_API_RATE_LIMIT?: string;
  };
export const db = () => bindings().DB;
export const now = () => Math.floor(Date.now() / 1000);
function boundedEnvInteger(name: "LAUNCH_CONFIRMATION_DEPTH" | "ASSET_STATE_FRESHNESS_SECONDS" | "PUBLIC_API_RATE_LIMIT", fallback: number, min: number, max: number) {
  const value = Number(bindings()[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}
export const launchConfirmationDepth = () => boundedEnvInteger("LAUNCH_CONFIRMATION_DEPTH", 8, 1, 256);
export const assetStateFreshnessSeconds = () => boundedEnvInteger("ASSET_STATE_FRESHNESS_SECONDS", 600, 30, 86400);
export const publicApiRateLimit = () => boundedEnvInteger("PUBLIC_API_RATE_LIMIT", 120, 10, 10000);
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function fail(status: number, message: string): never {
  throw new ApiError(status, message);
}
export async function setting<T>(key: string, fallback: T): Promise<T> {
  const r = await db()
    .prepare("SELECT value FROM settings WHERE key=?")
    .bind(key)
    .first<{ value: string }>();
  return r ? JSON.parse(r.value) : fallback;
}
export async function setSetting(key: string, value: unknown) {
  await db()
    .prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .bind(key, JSON.stringify(value))
    .run();
}
export async function config(): Promise<PlatformConfig> {
  const base = await setting("config", DEFAULT_CONFIG);
  const deployment = await setting(`deployment:${base.chainId}`, {
    platform: null,
    deploymentBlock: 0,
    genesis: null,
    sale: null,
  });
  return {
    ...base,
    ...deployment,
    brand: base.brand === "Genesis" ? "ROVYN CORE" : base.brand,
    socialX: base.socialX || "https://x.com/RovynCORE",
  };
}
export function rpc(chainId: ChainId) {
  if (!CHAINS[chainId]) fail(400, "Unsupported chain");
  const url =
    chainId === 4663 ? bindings().RPC_MAINNET : bindings().RPC_TESTNET;
  const backup =
    chainId === 4663
      ? bindings().RPC_MAINNET_FALLBACK
      : bindings().RPC_TESTNET_FALLBACK;
  const endpoints = [
    ...new Set(
      [url, backup, CHAINS[chainId].rpcUrls.default.http[0]].filter(Boolean),
    ),
  ] as string[];
  return createPublicClient({
    chain: CHAINS[chainId],
    transport: fallback(
      endpoints.map((endpoint) =>
        http(endpoint, { timeout: 8000, retryCount: 0, batch: { batchSize: 50, wait: 10 } }),
      ),
      { retryCount: 0 },
    ),
  });
}
export async function liveConfig() {
  const c = await config();
  if (!c.platform) return { ...c, chainStatus: "not-deployed" };
  const p = rpc(c.chainId);
  const read = (functionName: string, args: readonly unknown[] = []) =>
    p.readContract({
      address: c.platform!,
      abi: artifacts.GenesisPlatform.abi,
      functionName,
      args,
    });
  try {
    // The public RPC is an optional live enhancement for the config endpoint.
    // Sites Workers can terminate a request that waits on a stalled upstream,
    // which otherwise turns the response into an HTML error page. Keep the
    // endpoint responsive and let the client use the persisted config when RPC
    // reads are temporarily unavailable.
    const reads = Promise.all([
      read("launchFee"),
      read("treasury"),
      read("paused"),
      ...c.plans.map((x) => read("plans", [x.id])),
    ]);
    const [fee, treasury, paused, ...plans] = await Promise.race([
      reads,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC config timeout")), 700),
      ),
    ]);
    return {
      ...c,
      treasury: treasury as Address,
      launchFee: formatEther(fee as bigint),
      maintenance: c.maintenance || Boolean(paused),
      plans: plans.map((raw, i) => {
        const v = raw as [bigint, bigint, number, boolean];
        return {
          ...c.plans[i],
          price: formatEther(v[0]),
          duration: Number(v[1]),
          units: Number(v[2]),
          enabled: v[3],
        };
      }),
      chainStatus: "connected",
    };
  } catch {
    return { ...c, chainStatus: "unavailable" };
  }
}
export async function jsonBody(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 15000)
    fail(413, "內容過大");
  const text = await request.text();
  if (text.length > 15000) fail(413, "內容過大");
  try {
    return JSON.parse(text);
  } catch {
    fail(400, "無效 JSON");
  }
}
export function sameOrigin(r: Request) {
  const origin = r.headers.get("origin");
  if (!origin || origin !== new URL(r.url).origin) fail(403, "來源不符");
}
export async function rate(r: Request, scope: string, max = 30) {
  const ip = r.headers.get("cf-connecting-ip") || "local";
  const minute = Math.floor(now() / 60);
  const key = `${scope}:${keccak256(toBytes(ip))}:${minute}`;
  const row = await db()
    .prepare(
      "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(key, now() + 120)
    .first<{ count: number }>();
  if (!row || row.count > max) throw new ApiError(429, "請稍後再試", "rate_limited", 60);
  await db()
    .prepare("DELETE FROM limits WHERE expires<?")
    .bind(now() - 60)
    .run();
}
export async function requireAdmin(
  request: Request,
  action: string,
  payload: unknown,
  auth: { id: string; signature: Hex },
) {
  const row = await db()
    .prepare("SELECT message,expires FROM challenges WHERE id=?")
    .bind(auth?.id || "")
    .first<{ message: string; expires: number }>();
  if (!row || row.expires < now()) fail(401, "簽署已過期，請重試");
  const digest = keccak256(toBytes(JSON.stringify({ action, payload })));
  if (
    !row.message.includes(`Origin: ${new URL(request.url).origin}\n`) ||
    !row.message.includes(`Payload: ${digest}\n`)
  )
    fail(401, "簽署內容不符");
  let valid = false;
  try {
    valid = await verifyMessage({
      address: OWNER,
      message: row.message,
      signature: auth.signature,
    });
  } catch {}
  if (!valid) fail(403, "需要管理錢包簽署");
  const deleted = await db()
    .prepare("DELETE FROM challenges WHERE id=? AND expires>=? RETURNING id")
    .bind(auth.id, now())
    .first();
  if (!deleted) fail(401, "此簽署已使用");
}
export async function auditAction(action: string, payload: unknown) {
  await db()
    .prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
    .bind(crypto.randomUUID(), action, JSON.stringify(payload), now())
    .run();
}

export async function indexReceipt(hash: Hex, c: PlatformConfig) {
  if (!c.platform) fail(409, "平台合約尚未部署");
  const client = rpc(c.chainId);
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (name === "TransactionReceiptNotFoundError" || /receipt.*not found|transaction.*not found|could not be found/i.test(message)) {
      await markLaunchUnavailable(c, hash, "receipt_not_found");
      fail(409, "尚未找到交易收據；紀錄若曾確認過，已標記為暫不可用。請稍後重試。");
    }
    throw error;
  }
  if (receipt.status !== "success") fail(400, "交易已上鏈但執行失敗（revert）；未建立 Asset Record");
  const latest = await client.getBlockNumber();
  const confirmations = Number(latest - receipt.blockNumber + 1n);
  if (confirmations < 1) fail(409, "等待交易進入區塊");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash) {
    await markLaunchUnavailable(c, hash, "block_hash_mismatch");
    fail(409, "交易所在區塊發生重組，紀錄已標記為暫不可用。");
  }
  const requiredConfirmations = launchConfirmationDepth();
  const recordStatus = confirmations >= requiredConfirmations ? "active" as const : "pending" as const;
  let count = 0;
  const statements: D1PreparedStatement[] = [];
  let launchedRecord: { address: string; status: "pending" | "active" } | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== c.platform.toLowerCase()) continue;
    let event;
    try {
      event = decodeEventLog({
        abi: artifacts.GenesisPlatform.abi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    const a = event.args as unknown as Record<string, unknown>;
    if (event.eventName === "TokenCreated") {
      const uri = String(a.metadataURI);
      const id = /^genesis:\/\/([a-f0-9-]{36})$/.exec(uri)?.[1] || null;
      let metadataValue: Record<string, unknown> | null = null;
      if (id) {
        const metadataRow = await db().prepare("SELECT data FROM metadata WHERE id=?").bind(id).first<{ data: string }>();
        if (metadataRow) {
          try {
            const value = JSON.parse(metadataRow.data);
            if (value && typeof value === "object" && !Array.isArray(value)) metadataValue = value;
          } catch {}
        }
      }
      const tokenAddress = String(a.token).toLowerCase();
      statements.push(
        db()
          .prepare(
            "INSERT INTO tokens(chain,address,creator,sequence,name,symbol,supply,metadata_id,tx,block,created) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(chain,address) DO UPDATE SET creator=excluded.creator,sequence=excluded.sequence,name=excluded.name,symbol=excluded.symbol,supply=excluded.supply,metadata_id=excluded.metadata_id,tx=excluded.tx,block=excluded.block,created=excluded.created",
          )
          .bind(
            c.chainId,
            String(a.token).toLowerCase(),
            String(a.creator).toLowerCase(),
            Number(a.sequence),
            String(a.name),
            String(a.symbol),
            String(a.supply),
            id,
            hash,
            Number(receipt.blockNumber),
            Number(block.timestamp),
          ),
      );
      statements.push(...launchRecordStatements(db(), {
        chainId: c.chainId,
        contractAddress: tokenAddress,
        creatorWallet: String(a.creator),
        factoryAddress: c.platform,
        factoryVersion: `v${c.platformVersion || 1}`,
        launchTx: hash,
        blockNumber: Number(receipt.blockNumber),
        blockHash: String(receipt.blockHash),
        timestamp: Number(block.timestamp),
        totalSupply: String(a.supply),
        name: String(a.name),
        symbol: String(a.symbol),
        metadata: metadataValue,
        status: recordStatus,
        confirmationDepth: confirmations,
        observedAt: now(),
      }));
      launchedRecord = { address: tokenAddress, status: recordStatus };
      count++;
    } else if (event.eventName === "BoostPurchased") {
      statements.push(
        db()
          .prepare(
            "INSERT INTO boosts(id,chain,token,buyer,units,expires,paid,block,tx) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
          )
          .bind(
            `${c.chainId}:${hash}:${log.logIndex}`,
            c.chainId,
            String(a.token).toLowerCase(),
            String(a.buyer).toLowerCase(),
            Number(a.units),
            Number(a.expiresAt),
            String(a.paid),
            Number(receipt.blockNumber),
            hash,
          ),
      );
      count++;
    }
  }
  if (statements.length) await db().batch(statements);
  return {
    indexed: count,
    block: Number(receipt.blockNumber),
    confirmations,
    requiredConfirmations,
    record: launchedRecord ? {
      contractAddress: launchedRecord.address,
      status: launchedRecord.status,
      url: `/assets/robinhood/${launchedRecord.address}`,
    } : null,
  };
}

async function markLaunchUnavailable(c: PlatformConfig, hash: Hex, reason: string) {
  const tx = hash.toLowerCase();
  const row = await db().prepare(
    "SELECT a.contract_address,o.block_hash,o.block_number,o.creator_wallet FROM assets a LEFT JOIN asset_origins o ON o.chain_id=a.chain_id AND o.contract_address=a.contract_address WHERE a.chain_id=? AND a.launch_tx=?",
  ).bind(c.chainId, tx).first<{ contract_address: string; block_hash: string | null; block_number: number | null; creator_wallet: string | null }>();
  if (!row) return;
  const address = row.contract_address.toLowerCase();
  const eventId = `reorg:${c.chainId}:${tx}:${row.block_hash || row.block_number || "unknown"}`;
  await db().batch([
    db().prepare("UPDATE assets SET record_status='unavailable',updated_at=? WHERE chain_id=? AND contract_address=?").bind(now(), c.chainId, address),
    eventStatement(db(), {
      id: eventId,
      chainId: c.chainId,
      contractAddress: address,
      eventType: "record_unavailable",
      source: "observed",
      actor: null,
      payload: { reason, launchTx: tx, previousBlockHash: row.block_hash, previousBlockNumber: row.block_number },
      createdAt: now(),
    }),
  ]);
}
export async function syncRange(
  c: PlatformConfig,
  checkpoint: () => Promise<void> = async () => {},
) {
  await checkpoint();
  if (!c.platform) return { indexed: 0, caughtUp: true };
  const client = rpc(c.chainId);
  const latest = Number(await client.getBlockNumber()) - 2;
  const key = `cursor:${c.chainId}:${c.platform.toLowerCase()}`;
  const cursor = await setting(key, c.deploymentBlock);
  const from = Math.max(c.deploymentBlock, cursor - 12);
  const to = Math.min(latest, from + 499);
  if (to < from) return { indexed: 0, caughtUp: true };
  const logs = await readEventWindow(
    (fromBlock, toBlock) => client.getLogs({ address: c.platform!, fromBlock, toBlock }),
    BigInt(from), BigInt(to),
  );
  await checkpoint();
  const hashes = [...new Set(logs.map((x) => x.transactionHash))];
  if (hashes.length > 80) fail(503, "索引批次過大，請使用交易收據同步");
  // Reconcile the overlapping window, including events removed by a short reorg.
  const canonical = new Set(hashes);
  const old = await db()
    .prepare(
      "SELECT tx FROM tokens WHERE chain=? AND block BETWEEN ? AND ? UNION SELECT tx FROM boosts WHERE chain=? AND block BETWEEN ? AND ?",
    )
    .bind(c.chainId, from, to, c.chainId, from, to)
    .all<{ tx: string }>();
  for (const row of old.results) {
    await checkpoint();
    if (!canonical.has(row.tx as Hex)) {
      await markLaunchUnavailable(c, row.tx as Hex, "event_removed_by_reorg");
      await db().batch([
        db().prepare("DELETE FROM boosts WHERE chain=? AND tx=?").bind(c.chainId, row.tx),
      ]);
    }
  }
  let indexed = 0;
  for (const hash of hashes) {
    await checkpoint();
    indexed += (await indexReceipt(hash, c)).indexed;
  }
  await checkpoint();
  await setSetting(key, to + 1);
  return { indexed, from, to, caughtUp: to >= latest };
}
export async function listTokens(
  c: PlatformConfig,
  tab: string,
  search: string,
  includeHidden = false,
  creator?: string,
) {
  const result = await db()
    .prepare(
      `SELECT t.*,m.data AS metadata,COALESCE((SELECT SUM(units) FROM boosts b WHERE b.chain=t.chain AND b.token=t.address AND b.expires>?),0) AS activeBoost,COALESCE((SELECT COUNT(DISTINCT buyer) FROM boosts b WHERE b.chain=t.chain AND b.token=t.address AND b.expires>?),0) AS boosters,COALESCE((SELECT COUNT(DISTINCT visitor) FROM views v WHERE v.chain=t.chain AND v.token=t.address AND v.created>?),0) AS views FROM tokens t LEFT JOIN metadata m ON t.metadata_id=m.id LEFT JOIN assets a ON a.chain_id=t.chain AND a.contract_address=t.address WHERE t.chain=? ${includeHidden ? "" : "AND t.hidden=0 AND a.record_status='active'"} AND (? IS NULL OR t.creator=?) AND (t.name LIKE ? ESCAPE '\\' OR t.symbol LIKE ? ESCAPE '\\' OR t.address LIKE ? ESCAPE '\\') ORDER BY t.created DESC LIMIT 500`,
    )
    .bind(
      now(),
      now(),
      now() - 86400,
      c.chainId,
      creator?.toLowerCase() || null,
      creator?.toLowerCase() || null,
      ...Array(3).fill("%" + search.replace(/[\\%_]/g, "\\$&") + "%"),
    )
    .all<Record<string, unknown>>();
  let rows: (Record<string, unknown> & { score: number })[] = result.results.map((r) => ({
    ...r,
    metadata: r.metadata ? JSON.parse(String(r.metadata)) : null,
    score: trendingScore(Number(r.views), Number(r.created), now()),
  }));
  if (tab === "boosted")
    rows = rows
      .filter((r) => Number(r.activeBoost) > 0)
      .sort(
        (a, b) =>
          Number(b.activeBoost) - Number(a.activeBoost) ||
          Number(b.created) - Number(a.created),
      );
  if (tab === "trending")
    rows.sort(
      (a, b) => b.score - a.score || Number(b.created) - Number(a.created),
    );
  return rows;
}
export async function saveMetadata(body: unknown) {
  const data = tokenSchema.parse(body);
  const id = crypto.randomUUID();
  await db()
    .prepare("INSERT INTO metadata(id,data,created) VALUES(?,?,?)")
    .bind(id, JSON.stringify(data), now())
    .run();
  return { id, uri: `genesis://${id}` };
}
