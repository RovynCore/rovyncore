import { syncXUpdates, readXSyncState, publicXSync } from "@/lib/x-auto-sync";
import { canonicalXPost, importXUpdate } from "@/lib/x-updates";
import { readXUpdates, saveXUpdate } from "@/lib/x-updates-store";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { walletSession, walletSessionAccount } from "@/lib/wallet-session";
import {
  HumanVerificationError,
  protectionStatus,
  verifyHumanRequest,
} from "@/lib/human-verification";
import {
  isAddress,
  encodeFunctionData,
  keccak256,
  toBytes,
  formatEther,
  parseEther,
  type Address,
  type Hex,
} from "viem";
import {
  ApiError,
  fail,
  db,
  bindings,
  config,
  liveConfig,
  rpc,
  now,
  setting,
  setSetting,
  jsonBody,
  sameOrigin,
  rate,
  requireAdmin,
  auditAction,
  indexReceipt,
  listTokens,
  saveMetadata,
  assetStateFreshnessSeconds,
  publicApiRateLimit,
} from "@/lib/server";
import { eventStatement, getAssetRecord, listAssetEvents, listAssetRecords } from "@/lib/asset-record";
import { OWNER, type ChainId, type PlatformConfig } from "@/packages/web3/config";
import artifacts from "@/packages/web3/artifacts.json";
import rvynArtifacts from "@/packages/contracts/v2/artifacts/contracts.json";
import rvynV4Artifacts from "@/packages/contracts/v4/artifacts/contracts.json";
import rvynV5Artifacts from "@/packages/contracts/v5/artifacts/contracts.json";
import { RVYN_MODEL } from "@/lib/rvyn-model";
import { buildAllowlistTree } from "@/lib/allowlist-merkle";
import { DEFAULT_ALLOWLIST_WINDOW, DEFAULT_SALE_DESK, SALE_PHASES, allowlistRootKey, allowlistWindowKey, allowlistWindowStatus, allowedPhaseChange, normalizeAllowlistWindow, normalizeSaleDesk, saleDeskKey, saleIsPubliclyOpen } from "@/lib/rvyn-sale-desk";
import { safeUrl } from "@/lib/validation";
import {
  authorizeOps,
  operationsStatus,
  operationsSync,
  operationsSnapshot,
  operationsMedia,
  consumeWriteQuota,
} from "@/lib/operations";
export const dynamic = "force-dynamic";
const address = z.string().refine(isAddress);
const hash = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const erc20ReadAbi = [
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
] as const;
const BACKGROUND_STATE_REFRESH_RETRY_SECONDS = 300;

async function appendCurrentState(chainId: number, contractAddress: string, actor: string | null, source: "manual" | "system") {
  const database = db();
  const tokenAddress = address.parse(contractAddress) as Address;
  let blockNumber: number | null = null;
  try {
    const client = rpc(chainId as ChainId);
    const block = await client.getBlockNumber();
    blockNumber = Number(block);
    const [totalSupply, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress, abi: erc20ReadAbi, functionName: "totalSupply", blockNumber: block }),
      client.readContract({ address: tokenAddress, abi: erc20ReadAbi, functionName: "decimals", blockNumber: block }),
    ]);
    const payload = { totalSupply: String(totalSupply), decimals: Number(decimals) };
    const previous = await database.prepare(
      "SELECT version,payload FROM asset_states WHERE chain_id=? AND contract_address=? AND state_kind='current' ORDER BY version DESC LIMIT 1",
    ).bind(chainId, tokenAddress.toLowerCase()).first<{ version: number; payload: string }>();
    let previousPayload: Record<string, unknown> | null = null;
    try { previousPayload = previous ? JSON.parse(previous.payload) : null; } catch {}
    const version = Number(previous?.version || 0) + 1;
    const timestamp = now();
    const changed = !previousPayload || Object.keys(payload).some((key) => String(previousPayload?.[key]) !== String(payload[key as keyof typeof payload]));
    const statements: D1PreparedStatement[] = [
      database.prepare("INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES(?,?,?,'current',?,?,'robinhood-rpc','fresh',?,?,?)")
        .bind(`current:${chainId}:${tokenAddress.toLowerCase()}:${version}`, chainId, tokenAddress.toLowerCase(), version, JSON.stringify(payload), blockNumber, timestamp, timestamp),
      eventStatement(database, {
        id: crypto.randomUUID(), chainId, contractAddress: tokenAddress, eventType: "state_refresh", source, actor,
        payload: { syncStatus: "fresh", dataSource: "robinhood-rpc", blockNumber, changed }, createdAt: timestamp,
      }),
    ];
    if (changed) statements.push(eventStatement(database, {
      id: `state-change:${chainId}:${tokenAddress.toLowerCase()}:${version}`,
      chainId, contractAddress: tokenAddress, eventType: "observed_state_change", source: "observed", actor: null,
      payload: { previous: previousPayload, current: payload, blockNumber }, createdAt: timestamp,
    }));
    await database.batch(statements);
    return { syncStatus: "fresh", lastSyncedAt: timestamp, dataSource: "robinhood-rpc", blockNumber };
  } catch {
    const previous = await database.prepare(
      "SELECT version,payload FROM asset_states WHERE chain_id=? AND contract_address=? AND state_kind='current' ORDER BY version DESC LIMIT 1",
    ).bind(chainId, tokenAddress.toLowerCase()).first<{ version: number; payload: string }>();
    const version = Number(previous?.version || 0) + 1;
    const timestamp = now();
    let payload = "{}";
    try { if (previous) payload = JSON.stringify(JSON.parse(previous.payload)); } catch {}
    await database.batch([
      database.prepare("INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES(?,?,?,'current',?,?,'robinhood-rpc','unavailable',?,?,?)")
        .bind(`current:${chainId}:${tokenAddress.toLowerCase()}:${version}`, chainId, tokenAddress.toLowerCase(), version, payload, blockNumber, timestamp, timestamp),
      eventStatement(database, {
        id: crypto.randomUUID(), chainId, contractAddress: tokenAddress, eventType: "state_refresh", source, actor,
        payload: { syncStatus: "unavailable", dataSource: "robinhood-rpc", blockNumber }, createdAt: timestamp,
      }),
    ]);
    return { syncStatus: "unavailable", lastSyncedAt: timestamp, dataSource: "robinhood-rpc", blockNumber };
  }
}

async function claimBackgroundRefresh(chainId: number, contractAddress: string) {
  const timestamp = now();
  const key = `asset-sync:${chainId}:${contractAddress.toLowerCase()}`;
  const row = await db().prepare(
    "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires=excluded.expires WHERE limits.expires<=? RETURNING key",
  ).bind(key, timestamp + BACKGROUND_STATE_REFRESH_RETRY_SECONDS, timestamp).first();
  return Boolean(row);
}

async function maybeRefreshInBackground(chainId: number, contractAddress: string) {
  const record = await getAssetRecord(db(), chainId, contractAddress);
  if (!record || record.asset.recordStatus !== "active") return;
  const lastSyncedAt = record.lastSyncedAt as number | null;
  const syncStatus = String(record.currentState.syncStatus);
  if (lastSyncedAt && syncStatus === "fresh" && now() - lastSyncedAt < assetStateFreshnessSeconds()) return;
  if (!await claimBackgroundRefresh(chainId, contractAddress)) return;
  const refresh = appendCurrentState(chainId, contractAddress, null, "system").catch(() => undefined);
  try {
    waitUntil(refresh);
  } catch {
    // Some non-Worker runtimes do not expose an active execution context.
    // Keep the public record response available there as well.
    await refresh;
  }
}

function exposeFreshness<T extends { currentState: { syncStatus: string; lastSyncedAt: number | null } }>(record: T | null) {
  if (!record) return null;
  const threshold = assetStateFreshnessSeconds();
  if (record.currentState.syncStatus === "fresh" && record.currentState.lastSyncedAt && now() - record.currentState.lastSyncedAt > threshold)
    record.currentState.syncStatus = "stale";
  return { ...record, currentState: { ...record.currentState, freshnessThresholdSeconds: threshold } };
}

function respond(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
async function readAllowlist(chainId: number) {
  const [rows, count] = await Promise.all([
    db().prepare("SELECT wallet_address,status,source,public_note,listed_at,updated_at,updated_by FROM rvyn_allowlist WHERE chain_id=? ORDER BY updated_at DESC LIMIT 200")
      .bind(chainId).all(),
    db().prepare("SELECT COUNT(*) AS total FROM rvyn_allowlist WHERE chain_id=? AND status='listed'")
      .bind(chainId).first<{ total: number }>(),
  ]);
  const pending = await db().prepare("SELECT COUNT(*) AS total FROM rvyn_allowlist WHERE chain_id=? AND status='pending'")
    .bind(chainId).first<{ total: number }>();
  const approved = await db().prepare("SELECT COUNT(*) AS total FROM rvyn_allowlist WHERE chain_id=? AND status='approved'")
    .bind(chainId).first<{ total: number }>();
  return { allowlist: rows.results, allowlistCount: Number(count?.total || 0), pendingCount: Number(pending?.total || 0), approvedCount: Number(approved?.total || 0) };
}
async function handle(request: Request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname.slice(5).split("/");
    const route = path[0];
    if (route === "wallet") {
      if (request.method !== "GET") {
        sameOrigin(request);
        await rate(request, "wallet", 30);
      }
      return await walletSession(request, db(), (await config()).chainId);
    }
    const protection = {
      mode: bindings().HUMAN_VERIFICATION,
      siteKey: bindings().TURNSTILE_SITE_KEY,
      secret: bindings().TURNSTILE_SECRET_KEY,
      hostnames: bindings().TURNSTILE_HOSTNAMES,
    };
    if (route === "ops") {
      await authorizeOps(request);
      if (request.method === "GET" && path[1] === "status")
        return respond(await operationsStatus());
      if (request.method === "POST" && path[1] === "sync")
        return respond(await operationsSync());
      if (request.method === "GET" && path[1] === "snapshot")
        return respond(await operationsSnapshot());
      if (request.method === "GET" && path[1] === "media" && path[2])
        return await operationsMedia(path[2]);
      fail(404, "Unknown operations endpoint");
    }
    if (request.method === "GET") {
      if (route === "x-updates" && path.length === 1) {
        const enabled = bindings().X_AUTO_SYNC === "enabled";
        if (enabled) waitUntil(syncXUpdates(db()).catch(() => console.warn("x-auto-sync", { status: "storage_unavailable" })));
        const [posts, state] = await Promise.all([readXUpdates(), readXSyncState(db())]);
        return respond({ posts, sync: publicXSync(state, enabled) });
      }
      if (route === "rvyn" && (path[1] === "status" || path[1] === "allowlist")) {
        await rate(request, "rvyn-public", 120);
        const c = await config();
        const desk = normalizeSaleDesk(await setting(saleDeskKey(c.chainId), DEFAULT_SALE_DESK));
        const allowlistWindow = normalizeAllowlistWindow(await setting(allowlistWindowKey(c.chainId), DEFAULT_ALLOWLIST_WINDOW));
        const registrationStatus = allowlistWindowStatus(allowlistWindow, now());
        const snapshot = await setting<{ root: Hex; addresses: string[]; tx: string; committedAt: number } | null>(allowlistRootKey(c.chainId), null);
        let onchainRoot = "0x";
        let onchainState = -1;
        let onchainClosedAt = 0n;
        let onchainEndsAt = 0n;
        if (c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5)) {
          try {
            const client = rpc(c.chainId);
            const allowlistAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
            const [root, state, closedAt, endsAt] = await Promise.all([
              client.readContract({ address: c.sale, abi: allowlistAbi, functionName: "allowlistRoot" }),
              client.readContract({ address: c.sale, abi: allowlistAbi, functionName: "state" }),
              client.readContract({ address: c.sale, abi: allowlistAbi, functionName: "closedAt" }),
              client.readContract({ address: c.sale, abi: allowlistAbi, functionName: "endsAt" }),
            ]);
            onchainRoot = String(root).toLowerCase();
            onchainState = Number(state);
            onchainClosedAt = closedAt as bigint;
            onchainEndsAt = endsAt as bigint;
          } catch {
            // Unknown chain state must stay fail-closed.
          }
        }
        const rootVerified = Boolean(snapshot?.root && snapshot.addresses?.length && onchainRoot === snapshot.root.toLowerCase());
        const allowlistContract = c.presaleVersion === 4 || c.presaleVersion === 5;
        const registryOpen = registrationStatus === "open" && desk.phase !== "sale_open" && desk.phase !== "sale_closed" && (!c.sale || !allowlistContract || onchainState === 0);
        const legacyListed = registryOpen && !allowlistContract
          ? await db().prepare("SELECT COUNT(*) AS total FROM rvyn_allowlist WHERE chain_id=? AND status='listed'")
            .bind(c.chainId).first<{ total: number }>()
          : null;
        const listedCount = rootVerified ? snapshot!.addresses.length : Number(legacyListed?.total || 0);
        const chainSaleActive = onchainState === 1 && onchainClosedAt === 0n && BigInt(Math.floor(now())) < onchainEndsAt;
        const publicStatus = {
          phase: desk.phase,
          effectivePhase: desk.phase === "sale_open" ? "allowlist_open" : desk.phase,
          purchasesOpen: saleIsPubliclyOpen(desk, chainSaleActive, rootVerified && allowlistContract),
          allowlistEnforcedOnchain: rootVerified && allowlistContract,
          registryOpen,
          registrationStatus,
          registrationOpensAt: allowlistWindow.enabled ? allowlistWindow.opensAt : null,
          registrationClosesAt: allowlistWindow.enabled ? allowlistWindow.closesAt : null,
          listedCount: registryOpen || rootVerified ? listedCount : null,
          updatedAt: desk.updatedAt,
        };
        if (path[1] === "status") return respond(publicStatus);
        const rawAddress = url.searchParams.get("address");
        if (!rawAddress) return respond({ ...publicStatus, result: "enter_address" });
        const walletAddress = address.parse(rawAddress).toLowerCase();
        const row = await db().prepare("SELECT status,listed_at,updated_at FROM rvyn_allowlist WHERE chain_id=? AND wallet_address=?")
          .bind(c.chainId, walletAddress).first<{ status: string; listed_at: number; updated_at: number }>();
        if (row?.status === "revoked") return respond({ ...publicStatus, address: walletAddress, result: "not_listed", listedAt: null });
        if (row?.status === "pending") return respond({ ...publicStatus, address: walletAddress, result: "pending" });
        if (row?.status === "approved" && !rootVerified) return respond({ ...publicStatus, address: walletAddress, result: "approved" });
        // Keep submitted application status visible after registration closes;
        // a database row alone is not an onchain purchase entitlement.
        if (!registryOpen && !rootVerified) return respond({ ...publicStatus, address: walletAddress, result: "preparing" });
        if (row?.status === "listed" && !rootVerified && c.presaleVersion !== 4 && c.presaleVersion !== 5)
          return respond({ ...publicStatus, address: walletAddress, result: "listed", listedAt: row.listed_at || null });
        if (rootVerified && snapshot) {
          const tree = buildAllowlistTree(snapshot.addresses);
          const proof = tree.proofFor(walletAddress);
          return respond({ ...publicStatus, address: walletAddress, result: proof ? "listed" : "not_listed", proof: proof || undefined, listedAt: proof ? row?.listed_at || snapshot.committedAt : null });
        }
        return respond({ ...publicStatus, address: walletAddress, result: "not_listed", listedAt: null });
      }
      if (route === "v1") {
        await rate(request, "public-api-v1", publicApiRateLimit());
        if (path[1] === "assets" && !path[2]) {
          const c = await config();
          const limitResult = z.coerce.number().int().min(1).max(100).safeParse(url.searchParams.get("limit") || "25");
          if (!limitResult.success) fail(400, "limit 必須介於 1 到 100");
          const creatorValue = url.searchParams.get("creator");
          const creator = creatorValue ? address.parse(creatorValue).toLowerCase() : undefined;
          const excludedValue = url.searchParams.get("exclude");
          const excludeAddress = excludedValue ? address.parse(excludedValue).toLowerCase() : undefined;
          const cursor = url.searchParams.get("cursor") || undefined;
          if (cursor && !/^\d{1,12}:0x[a-fA-F0-9]{40}$/.test(cursor)) fail(400, "cursor 格式無效");
          const result = await listAssetRecords(db(), {
            chainId: c.chainId,
            query: (url.searchParams.get("q") || "").slice(0, 100),
            creator,
            excludeAddress,
            limit: limitResult.data,
            cursor,
          });
          return respond({ schemaVersion: "1.0.0", ...result });
        }
        if (path[1] === "creators" && path[2] && path[3] === "assets") {
          const c = await config();
          const creator = address.parse(path[2]).toLowerCase();
          const excludedValue = url.searchParams.get("exclude");
          const excludeAddress = excludedValue ? address.parse(excludedValue).toLowerCase() : undefined;
          const limitResult = z.coerce.number().int().min(1).max(100).safeParse(url.searchParams.get("limit") || "25");
          if (!limitResult.success) fail(400, "limit 必須介於 1 到 100");
          const cursor = url.searchParams.get("cursor") || undefined;
          if (cursor && !/^\d{1,12}:0x[a-fA-F0-9]{40}$/.test(cursor)) fail(400, "cursor 格式無效");
          const result = await listAssetRecords(db(), {
            chainId: c.chainId,
            query: (url.searchParams.get("q") || "").slice(0, 100),
            creator,
            excludeAddress,
            limit: limitResult.data,
            cursor,
          });
          return respond({ schemaVersion: "1.0.0", ...result, creator });
        }
        if (path[1] === "assets" && path[2]) {
          const c = await config();
          const contractAddress = address.parse(path[2]).toLowerCase();
          const record = await getAssetRecord(db(), c.chainId, contractAddress);
          if (!record) fail(404, "找不到此資產紀錄");
          if (path[3] === "history") {
            const limitResult = z.coerce.number().int().min(1).max(100).safeParse(url.searchParams.get("limit") || "50");
            if (!limitResult.success) fail(400, "limit 必須介於 1 到 100");
            const cursor = url.searchParams.get("cursor") || undefined;
            if (cursor && !/^\d{1,12}:[A-Za-z0-9:_-]{1,120}$/.test(cursor)) fail(400, "cursor 格式無效");
            const history = await listAssetEvents(db(), c.chainId, contractAddress, limitResult.data, cursor);
            return respond({ schemaVersion: "1.0.0", contractAddress, ...history });
          }
          if (path[3] === "state") {
            await maybeRefreshInBackground(c.chainId, contractAddress);
            const refreshed = record;
            return respond({
              schemaVersion: "1.0.0",
              contractAddress,
              currentState: refreshed ? exposeFreshness(refreshed)?.currentState : undefined,
              comparison: refreshed?.comparison,
              recordStatus: refreshed?.recordStatus,
              dataSource: refreshed?.dataSource,
              lastSyncedAt: refreshed?.lastSyncedAt,
            });
          }
          await maybeRefreshInBackground(c.chainId, contractAddress);
          return respond(exposeFreshness(record));
        }
        fail(404, "找不到此 API 路徑");
      }
      if (route === "protection") return respond(protectionStatus(protection));
      if (route === "config") return respond(await liveConfig());
      if (route === "tokens") {
        const c = await config();
        const creatorParam = url.searchParams.get("creator");
        const creator = creatorParam ? address.parse(creatorParam).toLowerCase() : undefined;
        return respond({
          tokens: await listTokens(
            c,
            url.searchParams.get("tab") || "new",
            (url.searchParams.get("q") || "").slice(0, 100),
            false,
            creator,
          ),
          chainId: c.chainId,
        });
      }
      if (route === "metadata" && path[1]) {
        const row = await db()
          .prepare("SELECT data FROM metadata WHERE id=?")
          .bind(path[1])
          .first<{ data: string }>();
        return row
          ? respond(JSON.parse(row.data))
          : respond({ error: "找不到資料" }, 404);
      }
      if (route === "token" && path[1]) {
        const c = await config();
        const rows = await listTokens(c, "new", address.parse(path[1]));
        const token = rows.find((r) => r.address === path[1].toLowerCase());
        if (!token) fail(404, "找不到此 Token");
        const activity = await db()
          .prepare(
            "SELECT buyer,units,expires,paid,tx FROM boosts WHERE chain=? AND token=? ORDER BY block DESC LIMIT 30",
          )
          .bind(c.chainId, path[1].toLowerCase())
          .all();
        return respond({ token, activity: activity.results });
      }
      if (
        route === "media" &&
        /^[a-f0-9-]+\.(png|jpg|webp)$/.test(path[1] || "")
      ) {
        const object = await bindings().BUCKET.get(path[1]);
        if (!object) fail(404, "找不到圖片");
        return new Response(object.body, {
          headers: {
            "Content-Type":
              object.httpMetadata?.contentType || "application/octet-stream",
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'",
          },
        });
      }
      if (route === "health") {
        await db().prepare("SELECT 1").first();
        return respond({ ok: true, version: "1.0.0" });
      }
      fail(404, "找不到頁面");
    }
    sameOrigin(request);
    await rate(request, route, route === "upload" ? 5 : 40);
    if (route === "v1") await rate(request, "public-api-v1", publicApiRateLimit());
    if (["upload", "metadata", "report"].includes(route)) {
      try {
        await verifyHumanRequest(request, route, protection);
      } catch (error) {
        const known = error instanceof HumanVerificationError;
        // Never log the proof, secret, request headers, or file contents.
        console.error("human-verification", {
          action: route,
          code: known ? error.code : "unexpected-response",
        });
        fail(
          known ? error.status : 503,
          known ? error.message : "Verification service unavailable",
        );
      }
    }
    if (route === "upload") {
      if ((await config()).maintenance) fail(503, "平台維護中");
      await consumeWriteQuota("upload");
      if (Number(request.headers.get("content-length") || 0) > 2_200_000)
        fail(413, "圖片上限 2 MB");
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size > 2_000_000 || file.size < 16)
        fail(400, "請上傳 2 MB 以下圖片");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const png = bytes
        .slice(0, 8)
        .every((v, i) => v === [137, 80, 78, 71, 13, 10, 26, 10][i]);
      const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const webp =
        new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
        new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
      const ext = png ? "png" : jpg ? "jpg" : webp ? "webp" : null;
      if (!ext) fail(400, "僅接受 PNG、JPEG、WebP 圖片");
      const key = `${crypto.randomUUID()}.${ext}`;
      await bindings().BUCKET.put(key, bytes, {
        httpMetadata: {
          contentType: ext === "jpg" ? "image/jpeg" : `image/${ext}`,
        },
      });
      return respond({ url: `/api/media/${key}` });
    }
    const body = await jsonBody(request);
    if (route === "rvyn" && path[1] === "register") {
      z.object({}).strict().parse(body);
      const c = await config();
      const desk = normalizeSaleDesk(await setting(saleDeskKey(c.chainId), DEFAULT_SALE_DESK));
      const allowlistWindow = normalizeAllowlistWindow(await setting(allowlistWindowKey(c.chainId), DEFAULT_ALLOWLIST_WINDOW));
      if (c.maintenance) fail(503, "平台維護中，白名單登記暫停");
      if (desk.phase === "sale_open" || desk.phase === "sale_closed" || allowlistWindowStatus(allowlistWindow, now()) !== "open") fail(409, "白名單登記目前尚未開放");
      const actor = await walletSessionAccount(request, db());
      if (!actor) fail(401, "請先連接錢包並簽署登入訊息；這不會送出交易或花費資產");
      if (c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5)) {
        const allowlistAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
        const state = await rpc(c.chainId).readContract({ address: c.sale, abi: allowlistAbi, functionName: "state" }).catch(() => null);
        if (state !== 0) fail(409, "白名單已凍結；目前不接受新登記");
      }
      const walletAddress = actor.toLowerCase();
      const previous = await db().prepare("SELECT status FROM rvyn_allowlist WHERE chain_id=? AND wallet_address=?")
        .bind(c.chainId, walletAddress).first<{ status: string }>();
      if (previous) {
        if (previous.status === "revoked") fail(409, "此地址的登記已撤銷，請聯絡管理者");
        return respond({ ok: true, status: previous.status, idempotent: true });
      }
      const timestamp = now();
      const key = `rvyn-allowlist-signup:${c.chainId}:${walletAddress}`;
      const acquired = await db().prepare(
        "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires=excluded.expires WHERE limits.expires<=? RETURNING key",
      ).bind(key, timestamp + 60, timestamp).first();
      if (!acquired) fail(429, "此錢包剛完成登記，請稍後再試");
      await db().batch([
        db().prepare("INSERT INTO rvyn_allowlist(chain_id,wallet_address,status,source,public_note,listed_at,updated_at,updated_by) VALUES(?,?,'pending','public-signup','',0,?,?) ON CONFLICT(chain_id,wallet_address) DO NOTHING")
          .bind(c.chainId, walletAddress, timestamp, walletAddress),
        db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
          .bind(crypto.randomUUID(), "allowlist-signup", JSON.stringify({ chainId: c.chainId, address: walletAddress }), timestamp),
      ]);
      const submitted = await db().prepare("SELECT status FROM rvyn_allowlist WHERE chain_id=? AND wallet_address=?")
        .bind(c.chainId, walletAddress).first<{ status: string }>();
      return respond({ ok: true, status: submitted?.status || "pending", idempotent: false }, 201);
    }
    if (route === "v1" && path[1] === "assets" && path[2]) {
      const c = await config();
      const contractAddress = address.parse(path[2]).toLowerCase();
      const record = await getAssetRecord(db(), c.chainId, contractAddress);
      if (!record) fail(404, "找不到此資產紀錄");
      if (path[3] === "refresh") {
        const actor = await walletSessionAccount(request, db());
        if (!actor) fail(401, "請先連接並簽署錢包登入，再重新整理鏈上狀態");
        const key = `manual-refresh:${actor.toLowerCase()}:${c.chainId}:${contractAddress}`;
        const timestamp = now();
        const acquired = await db().prepare(
          "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires=excluded.expires WHERE limits.expires<=? RETURNING key",
        ).bind(key, timestamp + 30, timestamp).first();
        if (!acquired) {
          const existing = await db().prepare("SELECT expires FROM limits WHERE key=?").bind(key).first<{ expires: number }>();
          throw new ApiError(429, "此資產每個錢包至少間隔 30 秒才能手動更新", "refresh_throttled", Math.max(1, Number(existing?.expires || timestamp + 30) - timestamp));
        }
        await appendCurrentState(c.chainId, contractAddress, actor, "manual");
        return respond(exposeFreshness(await getAssetRecord(db(), c.chainId, contractAddress)));
      }
      if (path[3] === "metadata") {
        const actor = await walletSessionAccount(request, db());
        if (!actor) fail(401, "請先連接並簽署錢包登入");
        if (actor.toLowerCase() !== String(record.origin.creatorWallet).toLowerCase()) fail(403, "只有發行者錢包可以更新此資產的展示資料");
        const parsed = z.object({
          name: z.string().trim().min(1).max(40),
          logo: z.string().max(120).regex(/^(\/api\/media\/[a-f0-9-]+\.(png|jpg|webp))?$/),
          description: z.string().trim().min(10).max(2000),
          links: z.object({ website: safeUrl, x: safeUrl, telegram: safeUrl, liquidity: safeUrl }).strict(),
        }).strict().parse(body);
        const currentRow = await db().prepare("SELECT data,version FROM asset_metadata WHERE chain_id=? AND contract_address=?").bind(c.chainId, contractAddress).first<{ data: string; version: number }>();
        const previous = currentRow ? JSON.parse(currentRow.data) as Record<string, unknown> : {};
        const next = { ...previous, name: parsed.name, logo: parsed.logo, description: parsed.description };
        const oldLinks = await db().prepare("SELECT link_type,url FROM asset_links WHERE chain_id=? AND contract_address=?").bind(c.chainId, contractAddress).all<{ link_type: string; url: string }>();
        const beforeLinks = Object.fromEntries(oldLinks.results.map((row) => [row.link_type, row.url]));
        const nextLinks = parsed.links as Record<string, string>;
        const metadataChanged = ["name", "logo", "description"].some((key) => String(previous[key] || "") !== String(next[key as keyof typeof next] || ""));
        const changedLinks = Object.keys(nextLinks).filter((key) => String(beforeLinks[key] || "") !== String(nextLinks[key] || ""));
        if (!metadataChanged && changedLinks.length === 0) return respond(exposeFreshness(record));
        const timestamp = now();
        const statements: D1PreparedStatement[] = [];
        if (metadataChanged) {
          statements.push(db().prepare(
            "INSERT INTO asset_metadata(chain_id,contract_address,data,version,updated_by,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(chain_id,contract_address) DO UPDATE SET data=excluded.data,version=asset_metadata.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at",
          ).bind(c.chainId, contractAddress, JSON.stringify(next), actor.toLowerCase(), timestamp));
          statements.push(eventStatement(db(), {
            id: crypto.randomUUID(), chainId: c.chainId, contractAddress, eventType: "metadata_updated", source: "creator", actor,
            payload: { previous: { name: previous.name || "", logo: previous.logo || "", description: previous.description || "" }, current: { name: next.name, logo: next.logo, description: next.description } }, createdAt: timestamp,
          }));
        }
        if (changedLinks.length) {
          statements.push(db().prepare("DELETE FROM asset_links WHERE chain_id=? AND contract_address=?").bind(c.chainId, contractAddress));
          for (const [type, url] of Object.entries(nextLinks)) if (url) {
            statements.push(db().prepare(
              "INSERT INTO asset_links(id,chain_id,contract_address,link_type,url,source,updated_by,created_at,updated_at) VALUES(?,?,?,?,?,'creator',?,?,?) ON CONFLICT(chain_id,contract_address,link_type) DO UPDATE SET url=excluded.url,source='creator',updated_by=excluded.updated_by,updated_at=excluded.updated_at",
            ).bind(crypto.randomUUID(), c.chainId, contractAddress, type, url, actor.toLowerCase(), timestamp, timestamp));
          }
          for (const type of changedLinks) statements.push(eventStatement(db(), {
            id: crypto.randomUUID(), chainId: c.chainId, contractAddress, eventType: "link_updated", source: "creator", actor,
            payload: { linkType: type, previous: beforeLinks[type] || null, current: nextLinks[type] || null }, createdAt: timestamp,
          }));
        }
        await db().batch(statements);
        return respond(exposeFreshness(await getAssetRecord(db(), c.chainId, contractAddress)));
      }
    }
    if (route === "metadata") {
      const c = await config();
      if (c.maintenance) fail(503, "平台維護中");
      await consumeWriteQuota("metadata");
      return respond(await saveMetadata(body), 201);
    }
    if (route === "sync") {
      const c = await config();
      if (body.tx)
        return respond(await indexReceipt(hash.parse(body.tx) as Hex, c));
      return respond(await operationsSync(1));
    }
    if (route === "view") {
      const c = await config();
      const token = address.parse(body.token).toLowerCase();
      const exists = await db()
        .prepare(
          "SELECT address FROM tokens WHERE chain=? AND address=? AND hidden=0",
        )
        .bind(c.chainId, token)
        .first();
      if (!exists) fail(404, "找不到此 Token");
      const visitor = keccak256(
        toBytes(
          `${request.headers.get("cf-connecting-ip") || "local"}:${request.headers.get("user-agent") || ""}:${Math.floor(now() / 86400)}`,
        ),
      );
      await db()
        .prepare(
          "INSERT INTO views(chain,token,visitor,day,created) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",
        )
        .bind(c.chainId, token, visitor, Math.floor(now() / 86400), now())
        .run();
      return respond({ ok: true });
    }
    if (route === "report") {
      const c = await config();
      const parsed = z
        .object({ token: address, reason: z.string().trim().min(10).max(1000) })
        .parse(body);
      const exists = await db()
        .prepare("SELECT t.address FROM tokens t JOIN assets a ON a.chain_id=t.chain AND a.contract_address=t.address WHERE t.chain=? AND t.address=? AND a.record_status='active'")
        .bind(c.chainId, parsed.token.toLowerCase())
        .first();
      if (!exists) fail(404, "找不到此 Token");
      await db()
        .prepare(
          "INSERT INTO reports(id,chain,token,reason,created) VALUES(?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          c.chainId,
          parsed.token.toLowerCase(),
          parsed.reason,
          now(),
        )
        .run();
      return respond({ ok: true });
    }
    if (route === "challenge") {
      const { action, payload } = z
        .object({
          action: z.enum([
            "dashboard",
            "x-update-import",
            "x-update-remove",
            "settings",
            "deployment",
            "moderate",
            "resolve",
            "genesis",
            "sale",
            "metadata",
            "record-correction",
            "sale-desk",
            "allowlist-window",
            "allowlist-import",
            "allowlist-revoke",
            "allowlist-approve",
            "allowlist-root-preview",
            "allowlist-root-confirm",
          ]),
          payload: z.unknown(),
        })
        .parse(body);
      const id = crypto.randomUUID();
      const message = `ROVYN CORE administration\nOrigin: ${url.origin}\nWallet: ${OWNER}\nAction: ${action}\nPayload: ${keccak256(toBytes(JSON.stringify({ action, payload })))}\nNonce: ${id}\nExpires: ${now() + 300}`;
      await db()
        .prepare("INSERT INTO challenges(id,message,expires) VALUES(?,?,?)")
        .bind(id, message, now() + 300)
        .run();
      await db()
        .prepare("DELETE FROM challenges WHERE expires<?")
        .bind(now())
        .run();
      return respond({ id, message });
    }
    if (route === "admin") {
      const { action, payload, auth } = body;
      await requireAdmin(request, action, payload, auth);
      if (action === "x-update-import") {
        const input = z.object({ url: z.string().min(1).max(500) }).parse(payload);
        try { canonicalXPost(input.url); } catch { fail(400, "Use an official @RovynCore post URL."); }
        let post;
        try { post = await importXUpdate(input.url); } catch (error) { console.warn("x-update-import", error instanceof Error ? { name: error.name, message: error.message } : { name: "unknown" }); fail(502, "X could not provide this public post. Check the URL or try again later."); }
        const posts = await saveXUpdate(post);
        await auditAction(action, { id: post.id, url: post.url });
        return respond({ posts });
      }
      if (action === "x-update-remove") {
        const input = z.object({ id: z.string().regex(/^[1-9]\d{14,19}$/) }).parse(payload);
        const posts = await saveXUpdate({ remove: input.id });
        await auditAction(action, { id: input.id });
        return respond({ posts });
      }
      const c = await liveConfig();
      if (action === "dashboard") {
        const tokens = await listTokens(c, "new", "", true);
        const reports = await db()
          .prepare(
            "SELECT * FROM reports WHERE chain=? ORDER BY created DESC LIMIT 100",
          )
          .bind(c.chainId)
          .all();
        const history = await db()
          .prepare("SELECT * FROM audit ORDER BY created DESC LIMIT 30")
          .all();
        let treasuryBalance = "0";
        if (c.platform)
          treasuryBalance = formatEther(
            (await rpc(c.chainId).readContract({
              address: c.platform,
              abi: artifacts.GenesisPlatform.abi,
              functionName: "proceeds",
              args: [c.treasury],
            })) as bigint,
          );
        let saleStatus: {
          state: string;
          raised: string;
          poolEth: string;
          withdrawable: string;
          closedAt: string;
          allowlistRoot: string;
          inventory: string;
          inventoryAllowance?: string;
          endsAt: string;
          settlementReady: boolean;
          failAvailable: boolean;
          liquidityRevenue?: string;
          lpRemaining?: string;
          productRemaining?: string;
          communityRemaining?: string;
          airdropRemaining?: string;
          teamVesting?: string;
        } | null = null;
        if (c.sale && (c.presaleVersion === 3 || c.presaleVersion === 4 || c.presaleVersion === 5)) {
          try {
          const saleAbi = c.presaleVersion === 5
            ? rvynV5Artifacts.RovynPresaleV5.abi
            : c.presaleVersion === 4 ? rvynV4Artifacts.GenesisPresaleV4.abi : rvynArtifacts.GenesisPresaleV3.abi;
          const saleClient = rpc(c.chainId);
          if (c.presaleVersion === 5) {
            const [state, raised, poolEth, withdrawable, closedAt, endsAt, allowlistRoot, inventory, inventoryAllowance, revenue, lpRemaining, productSpent, communitySpent, airdropSpent, teamVesting] = await Promise.all([
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "state" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "raised" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "initialPoolEth" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "withdrawableProjectEth" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "closedAt" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "endsAt" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "allowlistRoot" }),
              c.genesis ? saleClient.readContract({ address: c.genesis, abi: rvynArtifacts.LaunchToken.abi, functionName: "balanceOf", args: [c.sale] }) : Promise.resolve(0n),
              c.genesis ? saleClient.readContract({ address: c.genesis, abi: rvynArtifacts.LaunchToken.abi, functionName: "allowance", args: [OWNER, c.sale] }) : Promise.resolve(0n),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "liquidityRevenueReceived" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "lpTokensRemaining" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "productSpent" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "communitySpent" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "airdropSpent" }),
              saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "teamVesting" }),
            ]);
            saleStatus = {
              state: String(state),
              raised: formatEther(raised as bigint),
              poolEth: formatEther(poolEth as bigint),
              withdrawable: formatEther(withdrawable as bigint),
              closedAt: String(closedAt),
              allowlistRoot: String(allowlistRoot),
              inventory: formatEther(inventory as bigint),
              inventoryAllowance: formatEther(inventoryAllowance as bigint),
              endsAt: String(endsAt),
              settlementReady: Number(state) === 2 && ((raised as bigint) > 0n || (revenue as bigint) > 0n),
              failAvailable: false,
              liquidityRevenue: formatEther(revenue as bigint),
              lpRemaining: formatEther(lpRemaining as bigint),
              productRemaining: formatEther(parseEther("1000000") - (productSpent as bigint)),
              communityRemaining: formatEther(parseEther("1000000") - (communitySpent as bigint)),
              airdropRemaining: formatEther(parseEther("500000") - (airdropSpent as bigint)),
              teamVesting: String(teamVesting),
            };
          } else {
          const [state, raised, poolEth, withdrawable, closedAt, endsAt, hardCap, settlementDeadline] = await Promise.all([
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "state" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "raised" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "poolEthAmount" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "withdrawableEth" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "closedAt" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "endsAt" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "HARD_CAP" }),
            saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "settlementDeadline" }),
          ]);
          const inventory = c.genesis ? await saleClient.readContract({ address: c.genesis, abi: rvynArtifacts.LaunchToken.abi, functionName: "balanceOf", args: [c.sale] }) : 0n;
          const raisedWei = raised as bigint;
          const closedAtSeconds = closedAt as bigint;
          const endsAtSeconds = endsAt as bigint;
          const settlementDeadlineSeconds = settlementDeadline as bigint;
          const hardCapWei = hardCap as bigint;
          const currentTime = BigInt(now());
          const allowlistRoot = c.presaleVersion === 4
            ? String(await saleClient.readContract({ address: c.sale, abi: saleAbi, functionName: "allowlistRoot" }))
            : "0x";
          saleStatus = {
            state: String(state),
            raised: formatEther(raised as bigint),
            poolEth: formatEther(poolEth as bigint),
            withdrawable: formatEther(withdrawable as bigint),
            closedAt: String(closedAt),
            allowlistRoot,
            inventory: formatEther(inventory as bigint),
            endsAt: String(endsAt),
            settlementReady: state === 1 && raisedWei > 0n && (closedAtSeconds > 0n || currentTime >= endsAtSeconds || raisedWei === hardCapWei),
            failAvailable: state === 1 && ((currentTime >= endsAtSeconds && raisedWei === 0n) || currentTime >= settlementDeadlineSeconds),
          };
          }
          } catch {
            // Preserve management access if the chain RPC is temporarily unavailable.
          }
        }
        const saleDesk = normalizeSaleDesk(await setting(saleDeskKey(c.chainId), DEFAULT_SALE_DESK));
        const allowlistWindow = normalizeAllowlistWindow(await setting(allowlistWindowKey(c.chainId), DEFAULT_ALLOWLIST_WINDOW));
        const allowlistSnapshot = await readAllowlist(c.chainId);
        const allowlistRoot = await setting<{ root: string; addresses: string[]; tx: string; committedAt: number } | null>(allowlistRootKey(c.chainId), null);
        let allowlistRootMatchesList = false;
        if (c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5) && allowlistRoot?.root && saleStatus?.allowlistRoot) {
          const currentMembers = await db().prepare("SELECT wallet_address FROM rvyn_allowlist WHERE chain_id=? AND status IN ('approved','listed') ORDER BY wallet_address")
            .bind(c.chainId).all<{ wallet_address: string }>();
          if (currentMembers.results.length) {
            const currentRoot = buildAllowlistTree(currentMembers.results.map((row) => row.wallet_address)).root.toLowerCase();
            allowlistRootMatchesList = currentRoot === allowlistRoot.root.toLowerCase() && currentRoot === saleStatus.allowlistRoot.toLowerCase();
          }
        }
        return respond({
          tokens,
          reports: reports.results,
          audit: history.results,
          treasuryBalance,
          saleStatus,
          saleDesk,
          allowlistWindow,
          allowlistWindowStatus: allowlistWindowStatus(allowlistWindow, now()),
          allowlistRoot,
          allowlistRootMatchesList,
          ...allowlistSnapshot,
        });
      }
      if (action === "allowlist-window") {
        const p = z.object({ enabled: z.boolean(), opensAt: z.number().int().nonnegative(), closesAt: z.number().int().nonnegative() }).strict().parse(payload);
        const timestamp = now();
        if (p.enabled && (p.closesAt <= p.opensAt || p.closesAt <= timestamp || p.closesAt - p.opensAt > 366 * 24 * 60 * 60))
          fail(400, "白名單登記時間無效；請確認截止時間晚於開始時間與現在，且期間不超過一年");
        if (p.enabled && c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5)) {
          const allowlistAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
          const state = await rpc(c.chainId).readContract({ address: c.sale, abi: allowlistAbi, functionName: "state" }).catch(() => null);
          if (state !== 0) fail(409, "預售已開始或已結束，不能再開放白名單登記");
        }
        const next = normalizeAllowlistWindow({ ...p, updatedAt: timestamp, updatedBy: OWNER.toLowerCase() });
        await db().batch([
          db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(allowlistWindowKey(c.chainId), JSON.stringify(next)),
          db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
            .bind(crypto.randomUUID(), "allowlist-window", JSON.stringify({ chainId: c.chainId, ...next }), timestamp),
        ]);
        return respond({ ok: true, allowlistWindow: next, allowlistWindowStatus: allowlistWindowStatus(next, timestamp) });
      } else if (action === "sale-desk") {
        const p = z.object({ phase: z.enum(SALE_PHASES), reason: z.string().trim().min(10).max(500) }).strict().parse(payload);
        const previous = normalizeSaleDesk(await setting(saleDeskKey(c.chainId), DEFAULT_SALE_DESK));
        if (!allowedPhaseChange(previous.phase, p.phase)) fail(409, "此階段轉換不允許；請先確認目前狀態");
        if (p.phase === "sale_open") {
          if (!c.sale || (c.presaleVersion !== 4 && c.presaleVersion !== 5)) fail(409, "必須先部署並驗證具鏈上白名單功能的預售合約");
          const registrationStatus = allowlistWindowStatus(
            normalizeAllowlistWindow(await setting(allowlistWindowKey(c.chainId), DEFAULT_ALLOWLIST_WINDOW)),
            now(),
          );
          if (registrationStatus === "open" || registrationStatus === "scheduled") fail(409, "白名單登記必須先關閉，才能開啟預售");
          const saleAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
          const [state, closedAt, endsAt, root, members] = await Promise.all([
            rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "state" }),
            rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "closedAt" }),
            rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "endsAt" }),
            rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "allowlistRoot" }),
            db().prepare("SELECT wallet_address FROM rvyn_allowlist WHERE chain_id=? AND status IN ('approved','listed') ORDER BY wallet_address")
              .bind(c.chainId).all<{ wallet_address: string }>(),
          ]);
          if (state !== 1 || closedAt !== 0n || BigInt(Math.floor(now())) >= (endsAt as bigint))
            fail(409, "請確認預售仍在有效期間內，且尚未關閉");
          if (!members.results.length) fail(409, "目前沒有可發布的白名單地址");
          const tree = buildAllowlistTree(members.results.map((row) => row.wallet_address));
          const snapshot = await setting<{ root: Hex; addresses: string[] } | null>(allowlistRootKey(c.chainId), null);
          if (String(root).toLowerCase() !== tree.root.toLowerCase() || snapshot?.root?.toLowerCase() !== tree.root.toLowerCase())
            fail(409, "鏈上白名單根與目前核准名單不一致；請重新發布並確認根值");
        }
        if (p.phase === "sale_closed") {
          if (!c.sale || (c.presaleVersion !== 4 && c.presaleVersion !== 5)) fail(409, "目前預售合約不支援此階段同步");
          const saleAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
          const [state, closedAt] = await Promise.all([
            rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "state" }),
            rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "closedAt" }),
          ]);
          if (state === 1 && closedAt === 0n) fail(409, "請先在鏈上執行關閉預售，再同步公開階段");
        }
        const next = { phase: p.phase, updatedAt: now(), updatedBy: OWNER.toLowerCase(), reason: p.reason };
        await db().batch([
          db().prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
            .bind(saleDeskKey(c.chainId), JSON.stringify(next)),
          db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
            .bind(crypto.randomUUID(), "sale-desk", JSON.stringify({ chainId: c.chainId, previous: previous.phase, next: p.phase, reason: p.reason }), next.updatedAt),
        ]);
        return respond({ ok: true, saleDesk: next });
      } else if (action === "allowlist-import") {
        if (c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5)) {
          const allowlistAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
          const state = await rpc(c.chainId).readContract({ address: c.sale, abi: allowlistAbi, functionName: "state" });
          if (state !== 0) fail(409, "預售已開始；白名單已凍結，不能新增地址");
        }
        const p = z.object({
          addresses: z.array(address).min(1).max(100),
          source: z.string().trim().min(2).max(100),
          publicNote: z.string().trim().max(200).default(""),
        }).strict().parse(payload);
        const addresses = [...new Set(p.addresses.map((item) => item.toLowerCase()))];
        const timestamp = now();
        await db().batch([...addresses.map((walletAddress) => db().prepare(
          "INSERT INTO rvyn_allowlist(chain_id,wallet_address,status,source,public_note,listed_at,updated_at,updated_by) VALUES(?,?,'approved',?,?,0,?,?) ON CONFLICT(chain_id,wallet_address) DO UPDATE SET status=CASE WHEN rvyn_allowlist.status='listed' THEN 'listed' ELSE 'approved' END,source=excluded.source,public_note=excluded.public_note,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
        ).bind(c.chainId, walletAddress, p.source, p.publicNote, timestamp, OWNER.toLowerCase())),
          db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
            .bind(crypto.randomUUID(), "allowlist-import", JSON.stringify({ chainId: c.chainId, addresses, source: p.source }), timestamp),
        ]);
        return respond({ ok: true, imported: addresses.length, ...await readAllowlist(c.chainId) });
      } else if (action === "allowlist-approve") {
        if (c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5)) {
          const allowlistAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
          const state = await rpc(c.chainId).readContract({ address: c.sale, abi: allowlistAbi, functionName: "state" });
          if (state !== 0) fail(409, "預售已開始；白名單已凍結，不能再核准地址");
        }
        const p = z.object({ addresses: z.array(address).min(1).max(100) }).strict().parse(payload);
        const addresses = [...new Set(p.addresses.map((item) => item.toLowerCase()))];
        const timestamp = now();
        const statements: D1PreparedStatement[] = [];
        for (const walletAddress of addresses) {
          const row = await db().prepare("SELECT status FROM rvyn_allowlist WHERE chain_id=? AND wallet_address=?")
            .bind(c.chainId, walletAddress).first<{ status: string }>();
          if (!row || !["pending", "approved", "listed"].includes(row.status)) fail(409, "只能核准待審核的白名單申請");
          if (row.status === "pending") statements.push(db().prepare("UPDATE rvyn_allowlist SET status='approved',updated_at=?,updated_by=? WHERE chain_id=? AND wallet_address=?")
            .bind(timestamp, OWNER.toLowerCase(), c.chainId, walletAddress));
        }
        statements.push(db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
          .bind(crypto.randomUUID(), "allowlist-approve", JSON.stringify({ chainId: c.chainId, addresses }), timestamp));
        await db().batch(statements);
        return respond({ ok: true, ...await readAllowlist(c.chainId) });
      } else if (action === "allowlist-root-preview") {
        z.object({}).strict().parse(payload);
        if (!c.sale || (c.presaleVersion !== 4 && c.presaleVersion !== 5)) fail(409, "請先部署並登錄支援鏈上白名單的預售合約");
        const saleAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
        const [state, members] = await Promise.all([
          rpc(c.chainId).readContract({ address: c.sale, abi: saleAbi, functionName: "state" }),
          db().prepare("SELECT wallet_address FROM rvyn_allowlist WHERE chain_id=? AND status IN ('approved','listed') ORDER BY wallet_address")
            .bind(c.chainId).all<{ wallet_address: string }>(),
        ]);
        if (state !== 0) fail(409, "白名單根只能在預售開始前更新");
        if (!members.results.length) fail(409, "目前沒有已核准的白名單地址");
        const tree = buildAllowlistTree(members.results.map((row) => row.wallet_address));
        return respond({ root: tree.root, count: tree.addresses.length, addresses: tree.addresses });
      } else if (action === "allowlist-root-confirm") {
        const p = z.object({ tx: hash, root: z.string().regex(/^0x[a-fA-F0-9]{64}$/) }).strict().parse(payload);
        if (!c.sale || (c.presaleVersion !== 4 && c.presaleVersion !== 5)) fail(409, "請先部署並登錄支援鏈上白名單的預售合約");
        const saleAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
        const client = rpc(c.chainId);
        const receipt = await client.getTransactionReceipt({ hash: p.tx as Hex });
        if (receipt.status !== "success" || receipt.from.toLowerCase() !== OWNER.toLowerCase() || receipt.to?.toLowerCase() !== c.sale.toLowerCase())
          fail(400, "白名單根值交易無效");
        const submittedTx = await client.getTransaction({ hash: p.tx as Hex });
        const expectedInput = encodeFunctionData({ abi: saleAbi, functionName: "setAllowlistRoot", args: [p.root as Hex] });
        if (submittedTx.input.toLowerCase() !== expectedInput.toLowerCase()) fail(400, "交易呼叫的根值與預覽值不相符");
        if ((await client.getBlockNumber()) < receipt.blockNumber + 2n) fail(409, "等待白名單根值交易確認");
        const [state, committedRoot, members] = await Promise.all([
          client.readContract({ address: c.sale, abi: saleAbi, functionName: "state" }),
          client.readContract({ address: c.sale, abi: saleAbi, functionName: "allowlistRoot" }),
          db().prepare("SELECT wallet_address FROM rvyn_allowlist WHERE chain_id=? AND status IN ('approved','listed') ORDER BY wallet_address")
            .bind(c.chainId).all<{ wallet_address: string }>(),
        ]);
        if (state !== 0 || String(committedRoot).toLowerCase() !== p.root.toLowerCase()) fail(409, "鏈上白名單根值尚未與預覽值一致");
        const tree = buildAllowlistTree(members.results.map((row) => row.wallet_address));
        if (tree.root.toLowerCase() !== p.root.toLowerCase()) fail(409, "名單在確認前已變更；請重新產生根值");
        const timestamp = now();
        await db().batch([
          db().prepare("UPDATE rvyn_allowlist SET status='approved' WHERE chain_id=? AND status='listed'").bind(c.chainId),
          db().prepare("UPDATE rvyn_allowlist SET status='listed',listed_at=?,updated_at=?,updated_by=? WHERE chain_id=? AND status='approved'")
            .bind(timestamp, timestamp, OWNER.toLowerCase(), c.chainId),
          db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
            .bind(crypto.randomUUID(), "allowlist-root-confirm", JSON.stringify({ chainId: c.chainId, root: p.root, count: tree.addresses.length, tx: p.tx }), timestamp),
        ]);
        await setSetting(allowlistRootKey(c.chainId), { root: p.root.toLowerCase(), addresses: tree.addresses.map((item) => item.toLowerCase()), tx: p.tx, committedAt: timestamp });
        return respond({ ok: true, root: p.root, addresses: tree.addresses.map((item) => item.toLowerCase()), tx: p.tx, committedAt: timestamp, count: tree.addresses.length, ...await readAllowlist(c.chainId) });
      } else if (action === "allowlist-revoke") {
        const p = z.object({ address, reason: z.string().trim().min(10).max(500) }).strict().parse(payload);
        const walletAddress = p.address.toLowerCase();
        const existing = await db().prepare("SELECT status FROM rvyn_allowlist WHERE chain_id=? AND wallet_address=?")
          .bind(c.chainId, walletAddress).first<{ status: string }>();
        if (!existing || !["pending", "approved", "listed"].includes(existing.status)) fail(404, "找不到可撤銷的登記地址");
        if (existing.status === "listed" && c.sale && (c.presaleVersion === 4 || c.presaleVersion === 5)) {
          const allowlistAbi = c.presaleVersion === 5 ? rvynV5Artifacts.RovynPresaleV5.abi : rvynV4Artifacts.GenesisPresaleV4.abi;
          const state = await rpc(c.chainId).readContract({ address: c.sale, abi: allowlistAbi, functionName: "state" });
          if (state !== 0) fail(409, "預售已開始，鏈上根值已凍結；此地址不能再從有效資格中撤銷");
        }
        const timestamp = now();
        await db().batch([
          db().prepare("UPDATE rvyn_allowlist SET status='revoked',updated_at=?,updated_by=? WHERE chain_id=? AND wallet_address=?")
            .bind(timestamp, OWNER.toLowerCase(), c.chainId, walletAddress),
          db().prepare("INSERT INTO audit(id,action,detail,created) VALUES(?,?,?,?)")
            .bind(crypto.randomUUID(), "allowlist-revoke", JSON.stringify({ chainId: c.chainId, address: walletAddress, reason: p.reason }), timestamp),
        ]);
        return respond({ ok: true, ...await readAllowlist(c.chainId) });
      } else if (action === "settings") {
        const p = z
          .object({
            brand: z.string().trim().min(1).max(30),
            chainId: z.union([z.literal(46630), z.literal(4663)]),
            maintenance: z.boolean(),
            socialX: z.string().max(250),
            socialTelegram: z.string().max(250),
          })
          .strict()
          .parse(payload);
        for (const s of [p.socialX, p.socialTelegram])
          if (
            s &&
            (!s.startsWith("https://") ||
              new URL(s).username ||
              new URL(s).password)
          )
            fail(400, "請使用 HTTPS 網址");
        await setSetting("config", { ...c, ...p });
      } else if (action === "deployment") {
        const p = z
          .object({
            chainId: z.union([z.literal(46630), z.literal(4663)]),
            tx: hash,
          })
          .strict()
          .parse(payload);
        const client = rpc(p.chainId);
        const receipt = await client.getTransactionReceipt({
          hash: p.tx as Hex,
        });
        if (
          receipt.status !== "success" ||
          !receipt.contractAddress ||
          receipt.from.toLowerCase() !== OWNER.toLowerCase()
        )
          fail(400, "需要管理錢包的合約部署交易");
        if ((await client.getBlockNumber()) < receipt.blockNumber + 2n)
          fail(409, "等待部署確認");
        const deployed = receipt.contractAddress;
        const code = await client.getCode({ address: deployed });
        const tx = await client.getTransaction({ hash: p.tx as Hex });
        const v2 = tx.input.startsWith(rvynArtifacts.GenesisPlatform.bytecode);
        const expectedRuntime = v2
          ? rvynArtifacts.GenesisPlatform.runtime
          : artifacts.GenesisPlatform.runtime;
        if (!code || keccak256(code) !== keccak256(expectedRuntime as Hex))
          fail(400, "合約 bytecode 與編譯版本不符");
        const owner = await client.readContract({
          address: deployed,
          abi: v2 ? rvynArtifacts.GenesisPlatform.abi : artifacts.GenesisPlatform.abi,
          functionName: "owner",
        });
        if (String(owner).toLowerCase() !== OWNER.toLowerCase())
          fail(400, "合約 owner 不符");
        const previous = await setting<Partial<PlatformConfig> | null>(`deployment:${p.chainId}`, null);
        if (
          !v2 &&
          previous?.platform &&
          previous.platform.toLowerCase() !== deployed.toLowerCase()
        )
          fail(409, "此網路已有平台，不能覆寫現有 Registry");
        await setSetting(`deployment:${p.chainId}`, {
          platform: deployed,
          deploymentBlock: Number(receipt.blockNumber),
          genesis: previous?.genesis || null,
          sale: previous?.sale || null,
          platformVersion: v2 ? 2 : 1,
          legacyPlatform: v2
            ? previous?.legacyPlatform || previous?.platform || null
            : previous?.legacyPlatform || null,
          presaleVersion: previous?.presaleVersion,
        });
      } else if (action === "genesis") {
        const p = z.object({ address }).strict().parse(payload);
        const row = await db()
          .prepare(
            "SELECT creator,sequence FROM tokens WHERE chain=? AND address=?",
          )
          .bind(c.chainId, p.address.toLowerCase())
          .first<{ creator: string; sequence: number }>();
        if (!row || row.creator !== OWNER.toLowerCase() || row.sequence !== 1)
          fail(400, "Genesis 必須是管理錢包透過平台發行的 #001");
        await setSetting(`deployment:${c.chainId}`, {
          platform: c.platform,
          deploymentBlock: c.deploymentBlock,
          genesis: p.address,
          sale: c.sale,
          platformVersion: c.platformVersion,
          legacyPlatform: c.legacyPlatform,
          presaleVersion: c.presaleVersion,
        });
      } else if (action === "sale") {
        const p = z
          .object({ tx: hash, replace: z.boolean().optional() })
          .strict()
          .parse(payload);
        if (!c.genesis) fail(409, "請先設定 RovynCore #001");
        const client = rpc(c.chainId);
        const receipt = await client.getTransactionReceipt({
          hash: p.tx as Hex,
        });
        if (
          receipt.status !== "success" ||
          !receipt.contractAddress ||
          receipt.from.toLowerCase() !== OWNER.toLowerCase()
        )
          fail(400, "無效 sale 部署");
        if ((await client.getBlockNumber()) < receipt.blockNumber + 2n)
          fail(409, "等待部署確認");
        const tx = await client.getTransaction({ hash: p.tx as Hex });
        // Normalize hex before matching: some RPC providers may vary casing.
        // Keep this check strict while avoiding a false negative on valid V2 deploys.
        const txInput = tx.input.toLowerCase();
        const isPresaleV5 = txInput.startsWith(rvynV5Artifacts.RovynPresaleV5.bytecode.toLowerCase());
        const isPresaleV4 = txInput.startsWith(rvynV4Artifacts.GenesisPresaleV4.bytecode.toLowerCase());
        const isPresaleV3 = txInput.startsWith(
          rvynArtifacts.GenesisPresaleV3.bytecode.toLowerCase(),
        );
        const isPresale = isPresaleV5 || isPresaleV4 || isPresaleV3 || txInput.startsWith(
          rvynArtifacts.GenesisPresale.bytecode.toLowerCase(),
        );
        if (
          !isPresale &&
          txInput.startsWith(artifacts.GenesisSale.bytecode.toLowerCase()) ===
            false
        )
          fail(400, "Sale 合約 bytecode 不符");
        const sale = receipt.contractAddress;
        if (isPresale) {
          if (c.chainId !== 4663) fail(400, "RVYN 正式預售只能部署在 Robinhood Chain 主網");
          // Read the fixed parameters sequentially.  A burst of ten eth_call
          // requests can trigger provider throttling, which used to surface as
          // a generic 503 even though the deployment itself was valid.
          const presaleAbi = isPresaleV5
            ? rvynV5Artifacts.RovynPresaleV5.abi
            : isPresaleV4
            ? rvynV4Artifacts.GenesisPresaleV4.abi
            : isPresaleV3
            ? rvynArtifacts.GenesisPresaleV3.abi
            : rvynArtifacts.GenesisPresale.abi;
          if (isPresaleV5) {
            const readNames = [
              "sponsor", "token", "router", "PRICE", "HARD_CAP", "WALLET_CAP",
              "SALE_TOKENS", "LP_ALLOCATION", "MANAGER_ALLOCATION", "TEAM_ALLOCATION",
              "PRODUCT_ALLOCATION", "COMMUNITY_ALLOCATION", "AIRDROP_ALLOCATION", "TOTAL_INVENTORY",
              "teamBeneficiary", "lpLockDuration",
            ] as const;
            const reads: unknown[] = [];
            for (const functionName of readNames) {
              reads.push(await client.readContract({ address: sale, abi: presaleAbi, functionName }));
            }
            const token = String(reads[1]).toLowerCase();
            const totalSupply = await client.readContract({ address: token as Address, abi: rvynArtifacts.LaunchToken.abi, functionName: "totalSupply" });
            const expected = [
              parseEther(RVYN_MODEL.priceEth), parseEther("100"), parseEther(RVYN_MODEL.walletCapEth),
              parseEther("1000000"), parseEther("5000000"), parseEther("500000"), parseEther("1000000"),
              parseEther("1000000"), parseEther("1000000"), parseEther("500000"), parseEther(RVYN_MODEL.supply),
            ];
            if (
              ![OWNER, RVYN_MODEL.multisigMainnet].some((allowed) => allowed.toLowerCase() === String(reads[0]).toLowerCase()) ||
              token !== c.genesis.toLowerCase() ||
              String(reads[2]).toLowerCase() !== RVYN_MODEL.routerMainnet.toLowerCase() ||
              String(reads[14]).toLowerCase() === "0x0000000000000000000000000000000000000000" ||
              BigInt(String(reads[15])) < 365n * 24n * 60n * 60n ||
              BigInt(String(reads[15])) > 730n * 24n * 60n * 60n ||
              reads.slice(3, 14).some((value, index) => String(value) !== expected[index].toString()) ||
              totalSupply !== parseEther(RVYN_MODEL.supply)
            ) fail(400, "RVYN V5 預售參數不符");
          } else {
          const readNames = [
            "sponsor",
            "token",
            "router",
            "PRICE",
            "HARD_CAP",
            "WALLET_CAP",
            "SALE_TOKENS",
            "LP_TOKENS",
            "TEAM_TOKENS",
            "REQUIRED_TOKENS",
          ] as const;
          const reads: unknown[] = [];
          for (const functionName of readNames) {
            reads.push(
              await client.readContract({
                address: sale,
                abi: presaleAbi,
                functionName,
              }),
            );
          }
          const token = String(reads[1]).toLowerCase();
          const router = String(reads[2]).toLowerCase();
          const totalSupply = await client.readContract({
            address: token as Address,
            abi: rvynArtifacts.LaunchToken.abi,
            functionName: "totalSupply",
          });
          const expected = [
            parseEther(RVYN_MODEL.priceEth),
            parseEther("100"),
            parseEther(RVYN_MODEL.walletCapEth),
            parseEther(RVYN_MODEL.presaleTokens),
            parseEther("5000000"),
            parseEther("2000000"),
            parseEther(RVYN_MODEL.escrowTokens),
          ];
          if (
            String(reads[0]).toLowerCase() !== OWNER.toLowerCase() ||
            token !== c.genesis.toLowerCase() ||
            router !== RVYN_MODEL.routerMainnet.toLowerCase() ||
            reads.slice(3).some((v, i) => String(v) !== expected[i].toString()) ||
            totalSupply !== parseEther(RVYN_MODEL.supply)
          ) fail(400, "RVYN 預售參數不符");
          }
        } else {
          if (c.chainId === 4663) fail(400, "主網必須使用 RVYN 預售合約");
          const reads = await Promise.all(
            ["owner", "token", "treasury", "pricePerToken"].map((functionName) =>
              client.readContract({
                address: sale,
                abi: artifacts.GenesisSale.abi,
                functionName,
              }),
            ),
          );
          if (
            String(reads[0]).toLowerCase() !== OWNER.toLowerCase() ||
            String(reads[1]).toLowerCase() !== c.genesis.toLowerCase() ||
            String(reads[2]).toLowerCase() !== c.treasury.toLowerCase()
          ) fail(400, "Sale 參數不符");
        }
        if (c.sale && c.sale.toLowerCase() !== sale.toLowerCase()) {
          if (!p.replace)
            fail(409, "Sale 已設定；若要替換未啟用版本，請明確選擇新版替換");
          if (c.chainId !== 4663 || (c.presaleVersion !== 2 && c.presaleVersion !== 3 && c.presaleVersion !== 4 && c.presaleVersion !== 5))
            fail(409, "只能替換 Robinhood Chain 上尚未啟用的 RVYN 預售");
          const oldAbi = c.presaleVersion === 5
            ? rvynV5Artifacts.RovynPresaleV5.abi
            : c.presaleVersion === 4
            ? rvynV4Artifacts.GenesisPresaleV4.abi
            : c.presaleVersion === 3 ? rvynArtifacts.GenesisPresaleV3.abi : rvynArtifacts.GenesisPresale.abi;
          const [oldState, oldRaised, oldToken] = await Promise.all([
            client.readContract({ address: c.sale, abi: oldAbi, functionName: "state" }),
            client.readContract({ address: c.sale, abi: oldAbi, functionName: "raised" }),
            client.readContract({ address: c.sale, abi: oldAbi, functionName: "token" }),
          ]);
          const oldInventory = await client.readContract({
            address: oldToken as Address,
            abi: rvynArtifacts.LaunchToken.abi,
            functionName: "balanceOf",
            args: [c.sale as Address],
          });
          if (!(["0", "3"].includes(String(oldState)) && String(oldRaised) === "0" && String(oldInventory) === "0"))
            fail(409, "舊預售已啟用、募資或持有庫存，不能替換");
        }
        await setSetting(`deployment:${c.chainId}`, {
          platform: c.platform,
          deploymentBlock: c.deploymentBlock,
          genesis: c.genesis,
          sale,
          platformVersion: c.platformVersion,
          legacyPlatform: c.legacyPlatform,
          presaleVersion: isPresaleV5 ? 5 : isPresaleV4 ? 4 : isPresaleV3 ? 3 : isPresale ? 2 : 1,
        });
      } else if (action === "metadata") {
        const p = z
          .object({ address, liquidityUrl: safeUrl })
          .strict()
          .parse(payload);
        const token = await db()
          .prepare("SELECT metadata_id FROM tokens WHERE chain=? AND address=?")
          .bind(c.chainId, p.address.toLowerCase())
          .first<{ metadata_id: string | null }>();
        if (!token) fail(404, "找不到此 Token");
        let current: Record<string, unknown> = {};
        if (token.metadata_id) {
          const row = await db()
            .prepare("SELECT data FROM metadata WHERE id=?")
            .bind(token.metadata_id)
            .first<{ data: string }>();
          if (row) {
            try {
              const parsed = JSON.parse(row.data);
              if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
                current = parsed as Record<string, unknown>;
            } catch {
              current = {};
            }
          }
        }
        const next = JSON.stringify({ ...current, liquidityUrl: p.liquidityUrl });
        if (token.metadata_id) {
          await db()
            .prepare("UPDATE metadata SET data=? WHERE id=?")
            .bind(next, token.metadata_id)
            .run();
        } else {
          const id = crypto.randomUUID();
          await db()
            .prepare("INSERT INTO metadata(id,data,created) VALUES(?,?,?)")
            .bind(id, next, now())
            .run();
          await db()
            .prepare("UPDATE tokens SET metadata_id=? WHERE chain=? AND address=?")
            .bind(id, c.chainId, p.address.toLowerCase())
            .run();
        }
        const previousLink = await db().prepare(
          "SELECT url FROM asset_links WHERE chain_id=? AND contract_address=? AND link_type='liquidity'",
        ).bind(c.chainId, p.address.toLowerCase()).first<{ url: string }>();
        if ((previousLink?.url || "") !== p.liquidityUrl) {
          const timestamp = now();
          const statements: D1PreparedStatement[] = [eventStatement(db(), {
            id: crypto.randomUUID(), chainId: c.chainId, contractAddress: p.address, eventType: "link_updated", source: "admin", actor: OWNER,
            payload: { linkType: "liquidity", previous: previousLink?.url || null, current: p.liquidityUrl || null, emergency: true }, createdAt: timestamp,
          })];
          if (p.liquidityUrl) statements.push(db().prepare(
            "INSERT INTO asset_links(id,chain_id,contract_address,link_type,url,source,updated_by,created_at,updated_at) VALUES(?,?,?,'liquidity',?,'admin',?,?,?) ON CONFLICT(chain_id,contract_address,link_type) DO UPDATE SET url=excluded.url,source='admin',updated_by=excluded.updated_by,updated_at=excluded.updated_at",
          ).bind(crypto.randomUUID(), c.chainId, p.address.toLowerCase(), p.liquidityUrl, OWNER.toLowerCase(), timestamp, timestamp));
          else statements.push(db().prepare("DELETE FROM asset_links WHERE chain_id=? AND contract_address=? AND link_type='liquidity'").bind(c.chainId, p.address.toLowerCase()));
          await db().batch(statements);
        }
      } else if (action === "record-correction") {
        const p = z.object({
          address,
          reason: z.string().trim().min(10).max(1000),
          canonicalState: z.object({
            totalSupply: z.string().regex(/^\d{1,80}$/),
            decimals: z.number().int().min(0).max(255),
          }).strict(),
        }).strict().parse(payload);
        const existing = await getAssetRecord(db(), c.chainId, p.address.toLowerCase(), true);
        if (!existing) fail(404, "找不到此資產紀錄");
        const versionRow = await db().prepare(
          "SELECT COALESCE(MAX(version),0) AS version FROM asset_states WHERE chain_id=? AND contract_address=? AND state_kind='correction'",
        ).bind(c.chainId, p.address.toLowerCase()).first<{ version: number }>();
        const version = Number(versionRow?.version || 0) + 1;
        const timestamp = now();
        const previous = existing.canonicalState?.values || existing.originalState?.values || null;
        const canonical = { ...(previous || {}), ...p.canonicalState };
        await db().batch([
          db().prepare("INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES(?,?,?,'correction',?,?,'operator-correction','fresh',NULL,?,?)")
            .bind(`correction:${c.chainId}:${p.address.toLowerCase()}:${version}`, c.chainId, p.address.toLowerCase(), version, JSON.stringify(canonical), timestamp, timestamp),
          eventStatement(db(), {
            id: `correction:${c.chainId}:${p.address.toLowerCase()}:${version}`, chainId: c.chainId, contractAddress: p.address,
            eventType: "correction", source: "correction", actor: OWNER,
            payload: { reason: p.reason, previous, canonical, version }, createdAt: timestamp,
          }),
        ]);
      } else if (action === "moderate") {
        const p = z
          .object({ address, hidden: z.boolean() })
          .strict()
          .parse(payload);
        await db()
          .prepare("UPDATE tokens SET hidden=? WHERE chain=? AND address=?")
          .bind(p.hidden ? 1 : 0, c.chainId, p.address.toLowerCase())
          .run();
      } else if (action === "resolve") {
        const p = z.object({ id: z.string().uuid() }).strict().parse(payload);
        await db()
          .prepare(
            "UPDATE reports SET status='resolved' WHERE id=? AND chain=?",
          )
          .bind(p.id, c.chainId)
          .run();
      } else fail(400, "未知操作");
      await auditAction(action, payload);
      return respond({ ok: true, config: await liveConfig() });
    }
    fail(404, "找不到頁面");
  } catch (error) {
    if (error instanceof ApiError) {
      // Keep operational diagnostics in Worker logs without exposing auth,
      // wallet signatures, RPC URLs, or request payloads to the client.
      const logRejectedRequest = error.status >= 500 ? console.error : console.warn;
      logRejectedRequest("API rejected", {
        status: error.status,
        message: error.message,
      });
      return respond({
        error: error.message,
        code: error.code || (error.status === 404 ? "not_found" : error.status === 429 ? "rate_limited" : error.status >= 500 ? "temporarily_unreachable" : "request_rejected"),
        ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
      }, error.status, error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {});
    }
    if (error instanceof z.ZodError) {
      console.error("API validation", {
        issues: error.issues.map((issue) => issue.message),
      });
      return respond(
        { error: error.issues.map((x) => x.message).join("；"), code: "invalid_request" },
        400,
      );
    }
    // Upstream RPC errors may contain private endpoint credentials.
    console.error(
      "API failed",
      error instanceof Error
        ? { name: error.name, message: error.message }
        : "Unknown",
    );
    return respond({ error: "服務暫時無法完成此請求，請稍後重試。", code: "temporarily_unreachable" }, 503);
  }
}
export const GET = (request: Request) => handle(request);
export const POST = (request: Request) => handle(request);

