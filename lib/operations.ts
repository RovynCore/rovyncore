import {
  bindings,
  db,
  config,
  rpc,
  setting,
  setSetting,
  syncRange,
  now,
  fail,
} from "./server";

const TABLES = [
  "settings",
  "metadata",
  "tokens",
  "assets",
  "asset_origins",
  "asset_states",
  "asset_metadata",
  "asset_links",
  "asset_events",
  "boosts",
  "views",
  "reports",
  "audit",
  "rvyn_allowlist",
] as const;
// Hash both inputs and compare all bytes; never place secrets in URLs or logs.
export async function authorizeOps(request: Request) {
  const secret = bindings().OPS_TOKEN;
  if (!secret || secret.length < 32) fail(503, "Operations not configured");
  const provided = request.headers.get("authorization") || "";
  const digest = async (s: string) =>
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    );
  const a = await digest(provided);
  const b = await digest(`Bearer ${secret}`);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  if (diff !== 0) fail(401, "Unauthorized");
}
export async function operationsStatus() {
  await db().prepare("SELECT 1").first();
  const c = await config();
  const client = rpc(c.chainId);
  const head = await client.getBlock();
  const sync = await setting<{ at: number; ok: boolean; error?: string }>(
    "ops:last-sync",
    { at: 0, ok: false },
  );
  const cursor = c.platform
    ? await setting(
        `cursor:${c.chainId}:${c.platform.toLowerCase()}`,
        c.deploymentBlock,
      )
    : 0;
  const lag = c.platform
    ? Math.max(0, Number(head.number) - 2 - cursor + 1)
    : null;
  const staleHead = now() - Number(head.timestamp) > 120;
  const staleSync = !!c.platform && (!sync.ok || now() - sync.at > 900);
  return {
    ok: !staleHead && !staleSync,
    checkedAt: now(),
    database: "ok",
    rpc: staleHead ? "stale" : "ok",
    chainId: c.chainId,
    platformConfigured: !!c.platform,
    privateRpcConfigured: !!(c.chainId === 4663
      ? bindings().RPC_MAINNET
      : bindings().RPC_TESTNET),
    fallbackConfigured: !!(c.chainId === 4663
      ? bindings().RPC_MAINNET_FALLBACK
      : bindings().RPC_TESTNET_FALLBACK),
    sync,
    lagBlocks: lag,
  };
}
export async function operationsSync(batchLimit = 5) {
  const lease = crypto.randomUUID();
  const key = "ops:sync-lease";
  const result = await db()
    .prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.expires') AS INTEGER)<? RETURNING key",
    )
    .bind(key, JSON.stringify({ lease, expires: now() + 180 }), now())
    .first();
  if (!result) fail(409, "Sync already running");
  const checkpoint = async () => {
    const renewed = await db()
      .prepare(
        "UPDATE settings SET value=? WHERE key=? AND json_extract(value,'$.lease')=? AND CAST(json_extract(value,'$.expires') AS INTEGER)>? RETURNING key",
      )
      .bind(JSON.stringify({ lease, expires: now() + 180 }), key, lease, now())
      .first();
    if (!renewed) fail(409, "Sync lease expired");
  };
  try {
    const c = await config();
    let last;
    const started = Date.now();
    for (let i = 0; i < batchLimit; i++) {
      last = await syncRange(c, checkpoint);
      if (last.caughtUp || Date.now() - started > 45000) break;
    }
    await setSetting("ops:last-sync", { at: now(), ok: true, ...last });
    return last;
  } catch (error) {
    await setSetting("ops:last-sync", {
      at: now(),
      ok: false,
      error: "Indexing failed; check RPC and deployment",
    });
    throw error;
  } finally {
    await db()
      .prepare(
        "DELETE FROM settings WHERE key=? AND json_extract(value,'$.lease')=?",
      )
      .bind(key, lease)
      .run();
  }
}
// A bounded transactional D1 snapshot, not silently truncated pagination.
// R2 objects are immutable UUID keys; the runner exports objects before accepting a backup.
export async function operationsSnapshot() {
  const results = await db().batch<Record<string, unknown>>(
    TABLES.map((table) => db().prepare(`SELECT * FROM ${table} LIMIT 10001`)),
  );
  if (results.some((r) => r.results.length > 10000))
    fail(413, "Snapshot exceeds starter limit; use provider-native export");
  const tables = Object.fromEntries(
    TABLES.map((table, i) => [table, results[i].results]),
  );
  tables.settings = tables.settings.filter(
    (row) => !String(row.key).startsWith("ops:"),
  );
  const objects = await bindings().BUCKET.list({ limit: 1000 });
  if (objects.truncated) fail(413, "Object count exceeds starter backup limit");
  if (objects.objects.reduce((sum, o) => sum + o.size, 0) > 100_000_000)
    fail(413, "Media exceeds starter backup limit");
  return {
    schemaVersion: 2,
    createdAt: new Date().toISOString(),
    tables,
    objects: objects.objects.map((o) => ({
      key: o.key,
      size: o.size,
      etag: o.etag,
    })),
    excluded: ["challenges", "limits"],
    limits: { rowsPerTable: 10000, objects: 1000, totalMediaBytes: 100000000 },
  };
}
export async function operationsMedia(key: string) {
  if (!/^[a-f0-9-]+\.(png|jpg|webp)$/.test(key)) fail(400, "Invalid object");
  const object = await bindings().BUCKET.get(key);
  if (!object) fail(404, "Missing backup object");
  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType || "application/octet-stream",
      "Cache-Control": "no-store",
      ETag: object.etag,
    },
  });
}

// Global quotas in addition to per-IP limits. Charge before writes, including failed attempts.
export async function consumeWriteQuota(scope: "upload" | "metadata") {
  const day = Math.floor(now() / 86400);
  const cap = scope === "upload" ? 100 : 1000;
  const row = await db()
    .prepare(
      "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(`daily:${scope}:${day}`, (day + 1) * 86400)
    .first<{ count: number }>();
  if (!row || row.count > cap) fail(429, "今日新增容量已滿，請稍後再試");
}
