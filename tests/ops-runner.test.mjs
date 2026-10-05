import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  encryptBackup,
  decryptBackup,
  runOperations,
  sendEmailAlert,
  rotateBackups,
} from "../scripts/ops-runner.mjs";
test("30-day rotation preserves recent, unrelated, corrupt and current backups", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "rovyn-backup-test-"),
  );
  const key = "ab".repeat(32);
  const current = "genesis-2026-09-13T00-00-00-000Z.json.enc";
  const old = "genesis-2026-08-01T00-00-00-000Z.json.enc";
  const recent = "genesis-2026-09-01T00-00-00-000Z.json.enc";
  const corrupt = "genesis-2026-07-01T00-00-00-000Z.json.enc";
  for (const name of [old, recent, current])
    fs.writeFileSync(
      path.join(directory, name),
      encryptBackup({ ok: true }, key),
    );
  fs.writeFileSync(path.join(directory, corrupt), "unrelated");
  fs.writeFileSync(path.join(directory, "personal.txt"), "keep");
  assert.equal(
    rotateBackups(
      directory,
      current,
      key,
      30,
      Date.parse("2026-09-13T00:00:00Z"),
    ),
    1,
  );
  assert.ok(!fs.existsSync(path.join(directory, old)));
  for (const name of [recent, current, corrupt, "personal.txt"])
    assert.ok(fs.existsSync(path.join(directory, name)));
  assert.throws(() => rotateBackups(directory, "../escape", key));
  // Explicit files in this isolated, newly-created test directory only.
  for (const name of [recent, current, corrupt, "personal.txt"])
    fs.unlinkSync(path.join(directory, name));
  fs.rmdirSync(directory);
});
test("encrypted backup round trip and authentication", () => {
  const key = "ab".repeat(32);
  const payload = {
    tables: { settings: [{ key: "deployment:46630", value: "test" }] },
    assets: [{ key: "example", base64: "AA==" }],
  };
  const encrypted = encryptBackup(payload, key);
  assert.deepEqual(decryptBackup(encrypted, key), payload);
  assert.ok(!encrypted.includes("deployment"));
  assert.notEqual(encrypted, encryptBackup(payload, key));
  assert.throws(() => decryptBackup(encrypted, "cd".repeat(32)));
  assert.throws(() => encryptBackup(payload, "short"));
  const corrupt = JSON.parse(encrypted);
  corrupt.tag = Buffer.alloc(16).toString("base64");
  assert.throws(() => decryptBackup(JSON.stringify(corrupt), key));
});
test("email uses intended recipient, no sensitive diagnostics, hourly deduplication and handles failure", async () => {
  const env = {
    RESEND_API_KEY: "test-key",
    ALERT_EMAIL_TO: "owner@example.com",
    ALERT_EMAIL_FROM: "alerts@example.com",
  };
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, init });
    return { ok: true };
  };
  await sendEmailAlert(env, fake, 100);
  await sendEmailAlert(env, fake, 200);
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.deepEqual(JSON.parse(calls[0].init.body).to, ["owner@example.com"]);
  assert.equal(
    calls[0].init.headers["Idempotency-Key"],
    calls[1].init.headers["Idempotency-Key"],
  );
  assert.ok(!calls[0].init.body.includes("test-key"));
  await assert.rejects(sendEmailAlert(env, async () => ({ ok: false }), 100));
  await assert.rejects(sendEmailAlert({}, fake));
});
test("runner rejects unsafe URLs and missing credentials before network", async () => {
  await assert.rejects(
    runOperations({
      GENESIS_URL: "http://example.com",
      OPS_TOKEN: "a".repeat(32),
    }),
  );
  await assert.rejects(
    runOperations({
      GENESIS_URL: "https://user:pass@example.com",
      OPS_TOKEN: "a".repeat(32),
    }),
  );
  await assert.rejects(runOperations({ GENESIS_URL: "https://example.com" }));
});
test("daily backup still completes when sync is temporarily unavailable", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "rovyn-backup-daily-"));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const route = new URL(url).pathname;
    if (route.endsWith("/api/ops/sync")) return { ok: false, status: 503 };
    if (route.endsWith("/api/ops/status"))
      return { ok: true, status: 200, json: async () => ({ ok: false, lagBlocks: null }) };
    if (route.endsWith("/api/ops/snapshot"))
      return { ok: true, status: 200, json: async () => ({ objects: [], tables: {} }) };
    throw new Error("unexpected route " + route);
  };
  try {
    await assert.rejects(
      runOperations({
        GENESIS_URL: "https://example.com",
        OPS_TOKEN: "a".repeat(32),
        GENESIS_BACKUP: "1",
        BACKUP_KEY: "ab".repeat(32),
        BACKUP_DIR: directory,
        BACKUP_RETENTION_DAYS: "30",
        ALERT_CHANNEL: "off",
      }),
    );
    const files = fs.readdirSync(directory);
    assert.equal(files.length, 1);
    assert.match(files[0], /^genesis-.*\.json\.enc$/);
    assert.deepEqual(decryptBackup(fs.readFileSync(path.join(directory, files[0]), "utf8"), "ab".repeat(32)).objects, []);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
    fs.rmdirSync(directory);
  }
});
