import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, spawnSync } from "node:child_process";
const root = process.cwd();
const state = fs.mkdtempSync(path.join(os.tmpdir(), "rovyncore-auto-x-"));
const configPath = path.join(state, "worker.json");
const base = "http://127.0.0.1:8792";
const config = {
  name: "rovyncore-auto-x-isolated",
  main: path.join(root, "scripts/production-worker.mjs"),
  compatibility_date: "2026-05-15", compatibility_flags: ["nodejs_compat"],
  d1_databases: [{ binding: "DB", database_name: "auto-x-isolated", database_id: "00000000-0000-4000-8000-000000000000" }],
  r2_buckets: [{ binding: "BUCKET", bucket_name: "auto-x-isolated" }],
  assets: { directory: path.join(root, "dist/client") },
  vars: { X_AUTO_SYNC: "enabled" },
  triggers: { crons: ["*/5 * * * *"] },
};
fs.writeFileSync(configPath, JSON.stringify(config));
function sql(args) {
  const result = spawnSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "d1", "execute", "DB", "--local", "--config", configPath, "--persist-to", state, ...args], { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
let worker;
let logs = "";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  sql(["--file", "drizzle/0000_chief_tenebrous.sql"]);
  // Empty database collection: no post URL or hard-coded content is supplied to the scan.
  sql(["--command", "INSERT INTO settings(key,value) VALUES('official:x-updates','{\"posts\":[],\"hiddenIds\":[]}')"]);
  worker = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", configPath, "--local", "--persist-to", state, "--ip", "127.0.0.1", "--port", "8792", "--inspector-port", "0", "--test-scheduled"], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  worker.stdout.on("data", data => { logs += data; });
  worker.stderr.on("data", data => { logs += data; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch {}
    await delay(500);
  }
  assert.ok(ready, "Scheduled wrapper startup failed: " + logs.slice(-3000));
  const cron = await fetch(base + "/__scheduled?cron=" + encodeURIComponent("*/5 * * * *"));
  assert.equal(cron.status, 200, await cron.text());
  let feed;
  for (let attempt = 0; attempt < 30; attempt++) {
    feed = await (await fetch(base + "/api/x-updates")).json();
    if (feed.sync.status === "ok" && feed.posts.length >= 2) break;
    await delay(300);
  }
  assert.equal(feed.sync.status, "ok", logs.slice(-3000));
  assert.equal(feed.sync.enabled, true);
  assert.equal(feed.sync.intervalSeconds, 300);
  assert.equal(feed.posts.length, 2);
  assert.ok(feed.posts.some(post => post.id === "2105584118692200907"));
  assert.ok(feed.posts.some(post => post.id === "2102971536395427964"));
  assert.match(feed.posts.find(post => post.id === "2102971536395427964").text, /infrastructure on Robinhood Chain/i);
  const html = await (await fetch(base + "/latest-info")).text();
  assert.match(html, /What if a game token/);
  assert.match(html, /infrastructure on Robinhood Chain/);
  console.log("PASS actual scheduled Worker discovers, verifies, saves and renders both official X posts without a supplied URL");
  const previous = feed.sync.lastSuccessAt;
  assert.equal((await fetch(base + "/__scheduled?cron=" + encodeURIComponent("*/5 * * * *"))).status, 200);
  feed = await (await fetch(base + "/api/x-updates")).json();
  assert.equal(feed.posts.length, 2);
  assert.equal(feed.sync.lastSuccessAt, previous);
  console.log("PASS repeated cron and public reads respect the interval without duplicates");
  sql(["--command", "UPDATE settings SET value='{\"posts\":[],\"hiddenIds\":[]}' WHERE key='official:x-updates'; UPDATE settings SET value=json_set(value,'$.nextAttemptAt',0) WHERE key='official:x-sync-state'"]);
  await fetch(base + "/api/x-updates");
  for (let attempt = 0; attempt < 30; attempt++) {
    feed = await (await fetch(base + "/api/x-updates")).json();
    if (feed.posts.length === 2) break;
    await delay(300);
  }
  assert.equal(feed.posts.length, 2);
  assert.equal(feed.sync.status, "ok");
  console.log("PASS visitor refresh automatically wakes a due scan and restores the collection");
  const unauthorized = await fetch(base + "/api/admin", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ action: "x-update-remove", payload: { id: "2102971536395427964" } }) });
  assert.equal(unauthorized.status, 401);
  console.log("PASS automatic reads do not authorize public moderation writes");
  console.log("4 automatic X integration checks passed. Isolated state: " + state);
} catch (error) {
  console.error(error.stack || error);
  console.error(logs.slice(-6000));
  process.exitCode = 1;
} finally { worker?.kill(); }
