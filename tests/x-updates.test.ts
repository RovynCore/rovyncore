import test from "node:test";
import assert from "node:assert/strict";
import { canonicalXPost, importXUpdate, updateFromOEmbed, upsertXUpdate, INITIAL_X_UPDATES, type XUpdate } from "../lib/x-updates.ts";
import { readStoredXUpdates, writeStoredXUpdate } from "../lib/x-updates-storage.ts";
const post = INITIAL_X_UPDATES[0];
const reply = { url: post.url, author_url: "https://x.com/RovynCore", html: '<blockquote><p lang="en">Hello &amp; goodbye<br>Line &#x1F680; &lt;safe&gt;<a href="https://t.co/abc">pic.twitter.com/abc</a></p></blockquote>' };
test("normalizes the supplied URL and legacy Twitter URLs", () => {
  assert.equal(canonicalXPost(post.url + "?s=20").url, post.url);
  assert.equal(canonicalXPost(post.url.replace("x.com/RovynCore", "twitter.com/ROVYNCORE")).url, post.url);
});
test("rejects other accounts, insecure hosts, credentials, ports and SSRF targets", () => {
  for (const url of ["http://x.com/RovynCore/status/" + post.id, post.url.replace("RovynCore", "other"), post.url.replace("x.com", "x.com.evil.test"), post.url.replace("x.com", "127.0.0.1"), post.url.replace("x.com", "user@x.com"), post.url.replace("x.com", "x.com:8443"), "https://x.com/i/status/" + post.id]) assert.throws(() => canonicalXPost(url));
});
test("extracts safe plain text, newlines, entities and preserves the original date", () => {
  const result = updateFromOEmbed(post.url, reply);
  assert.equal(result.text, "Hello & goodbye\nLine 🚀 <safe>");
  assert.equal(result.publishedAt, post.publishedAt);
  assert.equal(result.publishedAt.slice(0,10), "2026-10-01");
});
test("refuses wrong authors, mismatched posts, unsupported HTML and empty posts", () => {
  for (const data of [{ ...reply, author_url: "https://x.com/other" }, { ...reply, url: post.url.replace(post.id, "2000000000000000000") }, { ...reply, html: "<p><script>alert(1)</script></p>" }, { ...reply, html: "<p><img src=x onerror=alert(1)></p>" }, { ...reply, html: "<p> </p>" }]) assert.throws(() => updateFromOEmbed(post.url, data));
});
test("official import fetches only the fixed oEmbed endpoint and disables redirects", async () => {
  const imported = await importXUpdate(post.url + "?s=20", async (input, options) => {
    const target = new URL(String(input));
    assert.equal(target.origin, "https://publish.x.com");
    assert.equal(target.pathname, "/oembed");
    assert.equal(target.searchParams.get("url"), post.url);
    assert.equal(options?.redirect, "manual");
    assert.ok(options?.signal);
    return Response.json(reply);
  });
  assert.equal(imported.id, post.id);
  let called = false;
  await assert.rejects(importXUpdate("https://localhost/private", async () => { called = true; return Response.json(reply); }));
  assert.equal(called, false);
});
test("failed and oversized responses cannot become imported posts", async () => {
  await assert.rejects(importXUpdate(post.url, async () => new Response("Not found", { status: 404 })));
  await assert.rejects(importXUpdate(post.url, async () => new Response("x".repeat(70000))));
  await assert.rejects(importXUpdate(post.url, async () => new Response("not JSON")));
  await assert.rejects(importXUpdate(post.url, async () => new Response(null, { status: 302, headers: { Location: "https://example.com/private" } })));
});
test("deduplicates refreshed posts, keeps date order and bounds the collection", () => {
  const posts: XUpdate[] = Array.from({ length: 25 }, (_, i) => ({ ...post, id: String(i), publishedAt: new Date(Date.UTC(2026, 8, i + 1)).toISOString() }));
  const next = upsertXUpdate(posts, { ...post, text: "refreshed" });
  assert.equal(next.length, 20);
  assert.equal(next[0].id, post.id);
  assert.equal(upsertXUpdate(next, { ...post, text: "again" }).length, 20);
  assert.equal(upsertXUpdate(next, { ...post, text: "again" })[0].text, "again");
});
function memoryDatabase() {
  let value: string | null = null;
  let race: XUpdate[] | null = null;
  const database = {
    prepare(sql: string) {
      let args: unknown[] = [];
      return { bind(...input: unknown[]) { args = input; return this; }, async first() {
        if (sql.startsWith("SELECT")) return value === null ? null : { value };
        if (race) { value = JSON.stringify(race); race = null; }
        if (value !== null && value !== args[2]) return null;
        value = args[1] as string;
        return { key: args[0] };
      } };
    },
  } as unknown as Pick<D1Database, "prepare">;
  return { database, setRace(posts: XUpdate[]) { race = posts; } };
}
test("missing storage uses verified seed; removing it persists a truly empty list", async () => {
  const { database } = memoryDatabase();
  assert.deepEqual(await readStoredXUpdates(database), INITIAL_X_UPDATES);
  assert.deepEqual(await writeStoredXUpdate(database, { remove: post.id }), []);
  assert.deepEqual(await readStoredXUpdates(database), []);
  await writeStoredXUpdate(database, { ...post, text: "updated" });
  assert.equal((await readStoredXUpdates(database))[0].text, "updated");
});
test("concurrent imports retry without losing an already saved post", async () => {
  const { database, setRace } = memoryDatabase();
  const other = { ...post, id: "2000000000000000000", publishedAt: "2025-01-01T00:00:00.000Z" };
  await writeStoredXUpdate(database, post);
  setRace([other, post]);
  const result = await writeStoredXUpdate(database, { ...post, text: "updated" });
  assert.equal(result.length, 2);
  assert.equal(result.find(item => item.id === other.id)?.id, other.id);
  assert.equal(result.find(item => item.id === post.id)?.text, "updated");
});

