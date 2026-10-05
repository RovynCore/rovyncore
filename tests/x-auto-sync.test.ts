import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { syncXUpdates, discoverXPostIds, readXSyncState, publicXSync } from "../lib/x-auto-sync.ts";
import { readStoredXUpdates, writeStoredXUpdate } from "../lib/x-updates-storage.ts";
import { INITIAL_X_UPDATES, X_UPDATES_KEY } from "../lib/x-updates.ts";
const first = INITIAL_X_UPDATES[0].id;
const second = "2102971536395427964";
const third = String(BigInt(first) + 999999999n);
let runtime: Miniflare;
let database: D1Database;
before(async () => {
  runtime = new Miniflare({ modules: true, compatibilityDate: "2026-05-15", d1Databases: ["DB"], script: 'export default {fetch(){return new Response("isolated");}}' });
  database = await runtime.getD1Database("DB") as unknown as D1Database;
  await database.prepare("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)").run();
});
beforeEach(async () => { await database.prepare("DELETE FROM settings").run(); });
after(async () => { await runtime.dispose(); });
function source(ids: string[], calls: string[], text = "Automatically discovered", foreign = ""): typeof fetch {
  return async input => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.origin === "https://x.com" && url.pathname === "/RovynCore") return new Response(ids.map(id => 'entry_id:"tweet-' + id + '"').join(","));
    assert.equal(url.origin, "https://publish.x.com");
    const post = url.searchParams.get("url")!;
    const id = post.split("/").at(-1);
    return Response.json({ url: post, author_url: id === foreign ? "https://x.com/other" : "https://x.com/RovynCore", html: "<p>" + text + " " + id + "</p>" });
  };
}
test("discovers new identifiers from public profile data, deduplicates and orders by newest", () => {
  const ids = discoverXPostIds('entry_id:"tweet-' + second + '",entry_id:"tweet-' + first + '",entry_id:"tweet-' + first + '"');
  assert.deepEqual(ids, [first, second]);
  assert.deepEqual(discoverXPostIds('<a href="/RovynCore/status/' + first + '">post</a>'), [first]);
  assert.deepEqual(discoverXPostIds('entry_id:"tweet-not-a-post"'), []);
  assert.equal(discoverXPostIds(Array.from({ length: 30 }, (_, index) => 'entry_id:"tweet-' + (BigInt(first) + BigInt(index)) + '"').join(",")).length, 20);
});
test("finds and saves previously unknown posts without receiving a post URL", async () => {
  const calls: string[] = [];
  const result = await syncXUpdates(database, { fetcher: source([first, second], calls), now: 2000000000 });
  assert.equal(result.state.status, "ok");
  assert.equal(result.state.importedCount, 2);
  assert.deepEqual((await readStoredXUpdates(database)).map(post => post.id), [first, second]);
  assert.equal(calls.filter(path => path === "/oembed").length, 2);
  const nextCalls: string[] = [];
  await syncXUpdates(database, { fetcher: source([third, first, second], nextCalls), now: 2000000300 });
  assert.equal(nextCalls.filter(path => path === "/oembed").length, 1);
  assert.deepEqual((await readStoredXUpdates(database)).map(post => post.id), [third, first, second]);
});
test("minimum interval avoids repeated external requests and duplicates", async () => {
  const calls: string[] = [];
  const fetcher = source([first, second], calls);
  await syncXUpdates(database, { fetcher, now: 2000000000 });
  const count = calls.length;
  assert.equal((await syncXUpdates(database, { fetcher, now: 2000000010 })).skipped, true);
  assert.equal(calls.length, count);
  await syncXUpdates(database, { fetcher, now: 2000000300 });
  assert.equal(calls.length, count + 1);
  assert.equal((await readStoredXUpdates(database)).length, 2);
});
test("source failures preserve successful posts and retry with bounded backoff", async () => {
  await syncXUpdates(database, { fetcher: source([first, second], []), now: 2000000000 });
  const saved = await readStoredXUpdates(database);
  const fail: typeof fetch = async () => new Response("Unavailable", { status: 503 });
  const one = await syncXUpdates(database, { fetcher: fail, now: 2000000300 });
  assert.equal(one.state.status, "error");
  assert.equal(one.state.lastSuccessAt, 2000000000);
  assert.equal(one.state.nextAttemptAt, 2000000600);
  const two = await syncXUpdates(database, { fetcher: fail, now: 2000000600 });
  assert.equal(two.state.nextAttemptAt, 2000001200);
  assert.deepEqual(await readStoredXUpdates(database), saved);
  assert.equal(publicXSync(two.state, true, 2000000600).delayed, true);
  const recovered = await syncXUpdates(database, { fetcher: source([first, second], []), now: 2000001200 });
  assert.equal(recovered.state.status, "ok");
  assert.equal(recovered.state.failureCount, 0);
});
test("redirects, missing post data and oversized profile responses fail closed", async () => {
  for (const fetcher of [
    async () => new Response(null, { status: 302, headers: { Location: "https://example.com/private" } }),
    async () => new Response("Login page without post data"),
    async () => new Response("x".repeat(1500001)),
  ]) {
    await database.prepare("DELETE FROM settings").run();
    const result = await syncXUpdates(database, { fetcher, now: 2000000000 });
    assert.equal(result.state.status, "error");
    assert.deepEqual(await readStoredXUpdates(database), INITIAL_X_UPDATES);
  }
});
test("concurrent scans share a lease and do not fetch the profile twice", async () => {
  let start!: () => void;
  let finish!: () => void;
  const started = new Promise<void>(resolve => { start = resolve; });
  const gate = new Promise<void>(resolve => { finish = resolve; });
  let count = 0;
  const inner = source([first, second], []);
  const fetcher: typeof fetch = async (input, options) => {
    if (String(input) === "https://x.com/RovynCore") { count++; start(); await gate; }
    return inner(input, options);
  };
  const running = syncXUpdates(database, { fetcher, now: 2000000000 });
  await started;
  assert.equal((await syncXUpdates(database, { fetcher, now: 2000000000 })).skipped, true);
  finish();
  await running;
  assert.equal(count, 1);
  assert.equal((await readXSyncState(database)).status, "ok");
});
test("hidden posts remain hidden across repeated automatic and daily refreshes", async () => {
  await syncXUpdates(database, { fetcher: source([first, second], []), now: 2000000000 });
  await writeStoredXUpdate(database, { remove: second });
  await syncXUpdates(database, { fetcher: source([first, second], []), now: 2000000300 });
  await syncXUpdates(database, { fetcher: source([first, second], []), now: 2000086400 });
  assert.deepEqual((await readStoredXUpdates(database)).map(post => post.id), [first]);
});
test("legacy arrays stay readable and daily refresh updates known text", async () => {
  await database.prepare("INSERT INTO settings(key,value) VALUES(?,?)").bind(X_UPDATES_KEY, JSON.stringify(INITIAL_X_UPDATES)).run();
  await syncXUpdates(database, { fetcher: source([first], [], "First text"), now: 2000000000 });
  await syncXUpdates(database, { fetcher: source([first], [], "New text"), now: 2000086400 });
  assert.match((await readStoredXUpdates(database))[0].text, /New text/);
});
test("posts belonging to another account never enter the official collection", async () => {
  const result = await syncXUpdates(database, { fetcher: source([first, second, third], [], "Verified", third), now: 2000000000 });
  assert.equal(result.state.status, "ok");
  assert.deepEqual((await readStoredXUpdates(database)).map(post => post.id), [first, second]);
});
