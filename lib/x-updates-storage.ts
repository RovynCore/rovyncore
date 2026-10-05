import { INITIAL_X_UPDATES, X_UPDATES_KEY, upsertXUpdate, type XUpdate } from "./x-updates";

type Database = Pick<D1Database, "prepare">;
export type XCollection = { posts: XUpdate[]; hiddenIds: string[] };
function collection(value: string | null): XCollection {
  if (value === null) return { posts: INITIAL_X_UPDATES, hiddenIds: [] };
  const saved: unknown = JSON.parse(value);
  // Existing release04 arrays remain readable; no migration is needed.
  if (Array.isArray(saved)) return { posts: saved as XUpdate[], hiddenIds: [] };
  const data = saved as XCollection;
  if (!data || !Array.isArray(data.posts) || !Array.isArray(data.hiddenIds)) throw new Error("Invalid X collection.");
  return data;
}
export async function readStoredXCollection(database: Database): Promise<XCollection> {
  const row = await database.prepare("SELECT value FROM settings WHERE key=?").bind(X_UPDATES_KEY).first<{ value: string }>();
  return collection(row?.value ?? null);
}
export async function readStoredXUpdates(database: Database): Promise<XUpdate[]> {
  return (await readStoredXCollection(database)).posts;
}
export async function writeStoredXUpdate(database: Database, change: XUpdate | { remove: string } | { sync: XUpdate[] }): Promise<XUpdate[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await database.prepare("SELECT value FROM settings WHERE key=?").bind(X_UPDATES_KEY).first<{ value: string }>();
    const saved = collection(row?.value ?? null);
    let posts = saved.posts;
    let hiddenIds = saved.hiddenIds;
    if ("remove" in change) {
      posts = posts.filter(post => post.id !== change.remove);
      // Tombstones share the same atomic document, so periodic scans respect moderation.
      hiddenIds = [...new Set([...hiddenIds, change.remove])];
    } else if ("sync" in change) {
      for (const post of change.sync) if (!hiddenIds.includes(post.id)) posts = upsertXUpdate(posts, post);
    } else {
      hiddenIds = hiddenIds.filter(id => id !== change.id);
      posts = upsertXUpdate(posts, change);
    }
    const result = await database.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE settings.value=? RETURNING key")
      .bind(X_UPDATES_KEY, JSON.stringify({ posts, hiddenIds }), row?.value ?? null).first();
    if (result) return posts;
  }
  throw new Error("Updates changed in another session. Please try again.");
}
