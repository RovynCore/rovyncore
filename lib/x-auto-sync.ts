import { canonicalXPost, importXUpdate, X_ACCOUNT, X_UPDATE_LIMIT, type XUpdate } from "./x-updates";
import { readStoredXCollection, writeStoredXUpdate } from "./x-updates-storage";

type Database = Pick<D1Database, "prepare">;
export const X_SYNC_INTERVAL = 300;
export const X_SYNC_STATE_KEY = "official:x-sync-state";
const LEASE_KEY = "official:x-sync-lease";
export type XSyncState = {
  status: "pending" | "ok" | "degraded" | "error";
  lastAttemptAt: number; lastSuccessAt: number; nextAttemptAt: number;
  failureCount: number; discoveredCount: number; importedCount: number;
  lastFullRefreshAt: number; error: "source_unavailable" | "partial_import" | null;
};
export type PublicXSync = { enabled: boolean; status: XSyncState["status"]; lastSuccessAt: number; intervalSeconds: number; delayed: boolean };
const initial: XSyncState = { status: "pending", lastAttemptAt: 0, lastSuccessAt: 0, nextAttemptAt: 0, failureCount: 0, discoveredCount: 0, importedCount: 0, lastFullRefreshAt: 0, error: null };
export async function readXSyncState(database: Database): Promise<XSyncState> {
  const row = await database.prepare("SELECT value FROM settings WHERE key=?").bind(X_SYNC_STATE_KEY).first<{ value: string }>();
  return row ? { ...initial, ...JSON.parse(row.value) } : { ...initial };
}
export function publicXSync(state: XSyncState, enabled: boolean, now = Math.floor(Date.now() / 1000)): PublicXSync {
  return { enabled, status: state.status, lastSuccessAt: state.lastSuccessAt, intervalSeconds: X_SYNC_INTERVAL,
    delayed: state.status === "error" || state.status === "degraded" || (state.lastSuccessAt > 0 && now - state.lastSuccessAt > 900) };
}

// Read identifiers from public markup/data only. Never execute remote scripts.
// Every discovered ID is verified independently by the official oEmbed author.
export function discoverXPostIds(html: string): string[] {
  const ids = new Set<string>();
  const patterns = [
    /["']?entry_id["']?\s*:\s*["']tweet-([1-9]\d{14,19})["']/g,
    /https:\/\/(?:www\.)?(?:x|twitter)\.com\/RovynCore\/status\/([1-9]\d{14,19})(?=[/"'?&\\<\s])/gi,
    /href=["']\/RovynCore\/status\/([1-9]\d{14,19})(?=[/"'?&])/gi,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      ids.add(canonicalXPost("https://x.com/" + X_ACCOUNT + "/status/" + match[1]).id);
      if (ids.size >= 100) break;
    }
  }
  return [...ids].sort((a, b) => BigInt(a) > BigInt(b) ? -1 : BigInt(a) < BigInt(b) ? 1 : 0).slice(0, X_UPDATE_LIMIT);
}
async function profileIds(fetcher: typeof fetch): Promise<string[]> {
  const response = await fetcher("https://x.com/" + X_ACCOUNT, {
    redirect: "manual", signal: AbortSignal.timeout(10000),
    headers: { Accept: "text/html", "Cache-Control": "no-cache" },
  });
  if (!response.ok || !response.body) throw new Error("Official profile unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 1500000) throw new Error("Official profile response too large.");
      chunks.push(next.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const ids = discoverXPostIds(new TextDecoder().decode(bytes));
  if (!ids.length) throw new Error("Official profile contains no readable post identifiers.");
  return ids;
}

// One global lease prevents cron and visitor-triggered refreshes from overlapping.
// The last successful collection survives upstream errors and partial imports.
export async function syncXUpdates(database: Database, options: { fetcher?: typeof fetch; now?: number } = {}): Promise<{ skipped: boolean; state: XSyncState }> {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  let previous = await readXSyncState(database);
  if (now < previous.nextAttemptAt) return { skipped: true, state: previous };
  const lease = JSON.stringify({ token: crypto.randomUUID(), expires: now + 180 });
  const acquired = await database.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE CAST(json_extract(settings.value,'$.expires') AS INTEGER)<? RETURNING key")
    .bind(LEASE_KEY, lease, now).first();
  if (!acquired) return { skipped: true, state: previous };
  let state: XSyncState | undefined;
  try {
    previous = await readXSyncState(database);
    if (now < previous.nextAttemptAt) return { skipped: true, state: previous };
    const fetcher = options.fetcher ?? fetch;
    const ids = await profileIds(fetcher);
    const saved = await readStoredXCollection(database);
    const fullRefresh = now - previous.lastFullRefreshAt >= 86400;
    const candidates = ids.filter(id => !saved.hiddenIds.includes(id) && (fullRefresh || !saved.posts.some(post => post.id === id)));
    const imported: XUpdate[] = [];
    let cursor = 0;
    let errors = 0;
    await Promise.all([0, 1].map(async () => {
      while (cursor < candidates.length) {
        const id = candidates[cursor++];
        try { imported.push(await importXUpdate("https://x.com/" + X_ACCOUNT + "/status/" + id, fetcher)); }
        catch (error) {
          // Retweets/quoted posts from another author are outside the official feed.
          if (!(error instanceof Error && error.message === "The post must belong to @RovynCore.")) errors++;
        }
      }
    }));
    if (errors && imported.length === 0) throw new Error("New official posts could not be verified.");
    if (imported.length) await writeStoredXUpdate(database, { sync: imported });
    state = { status: errors ? "degraded" : "ok", lastAttemptAt: now, lastSuccessAt: now,
      nextAttemptAt: now + X_SYNC_INTERVAL, failureCount: errors ? previous.failureCount + 1 : 0,
      discoveredCount: ids.length, importedCount: imported.length,
      lastFullRefreshAt: fullRefresh && !errors ? now : previous.lastFullRefreshAt, error: errors ? "partial_import" : null };
  } catch {
    const failures = previous.failureCount + 1;
    state = { ...previous, status: "error", lastAttemptAt: now, failureCount: failures, discoveredCount: 0, importedCount: 0,
      nextAttemptAt: now + Math.min(3600, X_SYNC_INTERVAL * 2 ** Math.min(failures - 1, 4)), error: "source_unavailable" };
  } finally {
    try {
      if (state) await database.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(X_SYNC_STATE_KEY, JSON.stringify(state)).run();
    } finally { await database.prepare("DELETE FROM settings WHERE key=? AND value=?").bind(LEASE_KEY, lease).run(); }
  }
  if (!state) throw new Error("X synchronization did not finish.");
  console.log("x-auto-sync", { status: state.status, discovered: state.discoveredCount, imported: state.importedCount, checkedAt: now });
  return { skipped: false, state };
}
