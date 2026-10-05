// Run once from a trusted scheduler. Never sends wallet transactions.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
export function encryptBackup(data, key) {
  if (!/^[a-f0-9]{64}$/i.test(key || ""))
    throw new Error("BACKUP_KEY must be 32 bytes in hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    iv,
  );
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  });
}
export function decryptBackup(text, key) {
  const e = JSON.parse(text);
  if (e.version !== 1 || e.algorithm !== "aes-256-gcm")
    throw new Error("Unsupported backup");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "hex"),
    Buffer.from(e.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(e.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(e.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
export async function sendEmailAlert(
  env,
  fetcher = fetch,
  timestamp = Date.now(),
) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL_TO || !env.ALERT_EMAIL_FROM)
    throw new Error("Email service not configured");
  const body = {
    from: env.ALERT_EMAIL_FROM,
    to: [env.ALERT_EMAIL_TO],
    subject: "Genesis 營運異常通知",
    text: "Genesis 營運檢查失敗。請查看受保護的排程紀錄，確認網站、RPC、事件同步與備份狀態。此通知不包含錢包私鑰、金鑰或用戶資料。",
  };
  const identity = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex")
    .slice(0, 20);
  const r = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `genesis-ops-${identity}-${Math.floor(timestamp / 3600000)}`,
    },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Email alert delivery failed");
}
export async function runOperations(env = process.env) {
  const base = new URL(env.GENESIS_URL || "");
  if (
    base.protocol !== "https:" &&
    !(
      base.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(base.hostname)
    )
  )
    throw new Error("HTTPS required");
  if (base.username || base.password || base.search || base.hash)
    throw new Error("Invalid site URL");
  if ((env.OPS_TOKEN || "").length < 32) throw new Error("OPS_TOKEN missing");
  const headers = { Authorization: `Bearer ${env.OPS_TOKEN}` };
  // Private Sites may require an additional supported gateway credential.
  if (env.SITES_AUTH_TOKEN)
    headers["OAI-Sites-Authorization"] = env.SITES_AUTH_TOKEN;
  const request = async (route, method = "GET") => {
    const r = await fetch(new URL("/api/ops/" + route, base), {
      method,
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    if (!r.ok)
      throw new Error(`Operations ${route.split("/")[0]} HTTP ${r.status}`);
    return r;
  };
  let failure;
  try {
    try {
      await request("sync", "POST");
      const status = await (await request("status")).json();
      if (!status.ok || (status.lagBlocks !== null && status.lagBlocks > 5000))
        throw new Error("Database/RPC/indexer health degraded");
      console.log(
        JSON.stringify({
          ok: true,
          chainId: status.chainId,
          lagBlocks: status.lagBlocks,
          privateRpcConfigured: status.privateRpcConfigured,
        }),
      );
    } catch (error) {
      // Keep the daily backup independent: a stale index must not prevent a
      // recoverable database/media snapshot from being written.
      failure = error;
    }
    if (env.GENESIS_BACKUP === "1") {
      try {
        // Validate key before fetching any private data.
        encryptBackup({}, env.BACKUP_KEY);
        const snapshot = await (await request("snapshot")).json();
        const assets = [];
        for (const item of snapshot.objects) {
          const r = await request("media/" + encodeURIComponent(item.key));
          const bytes = Buffer.from(await r.arrayBuffer());
          if (bytes.length !== item.size || r.headers.get("etag") !== item.etag)
            throw new Error("Media changed during backup");
          assets.push({
            ...item,
            contentType: r.headers.get("content-type"),
            sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
            base64: bytes.toString("base64"),
          });
        }
        const bundle = { ...snapshot, assets };
        const encrypted = encryptBackup(bundle, env.BACKUP_KEY);
        const restored = decryptBackup(encrypted, env.BACKUP_KEY);
        if (restored.assets.length !== assets.length)
          throw new Error("Backup verification failed");
        const directory = path.resolve(env.BACKUP_DIR || "backups");
        fs.mkdirSync(directory, { recursive: true });
        const name =
          "genesis-" +
          new Date().toISOString().replace(/[:.]/g, "-") +
          ".json.enc";
        fs.writeFileSync(path.join(directory, name), encrypted, {
          flag: "wx",
          mode: 0o600,
        });
        // Rotate only after the new encrypted file has been read back and authenticated.
        decryptBackup(
          fs.readFileSync(path.join(directory, name), "utf8"),
          env.BACKUP_KEY,
        );
        const removed = rotateBackups(
          directory,
          name,
          env.BACKUP_KEY,
          Number(env.BACKUP_RETENTION_DAYS || 30),
        );
        console.log(
          JSON.stringify({
            backup: name,
            objects: assets.length,
            verified: true,
            expiredBackupsRemoved: removed,
          }),
        );
      } catch (error) {
        failure ||= error;
      }
    }
    if (failure) throw failure;
  } catch (error) {
    // No RPC URLs, request headers, private rows, or raw upstream exception in alerts.
    const text =
      "Genesis operations failed. Check scheduler logs, RPC, indexer and backup status.";
    if (env.ALERT_CHANNEL === "email") {
      try {
        await sendEmailAlert(env);
      } catch {
        console.error(
          "Email alert failed; check mail credentials and verified sender.",
        );
      }
    } else if (env.ALERT_CHANNEL !== "off" && env.ALERT_WEBHOOK) {
      const u = new URL(env.ALERT_WEBHOOK);
      if (u.protocol !== "https:")
        throw new Error("Alert webhook requires HTTPS");
      const r = await fetch(u, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) console.error("Alert delivery failed");
    }
    throw error;
  }
}
export function rotateBackups(
  directory,
  keep,
  key,
  days = 30,
  timestamp = Date.now(),
) {
  if (!Number.isInteger(days) || days < 1 || days > 365)
    throw new Error("Invalid retention days");
  const resolved = path.resolve(directory);
  if (
    resolved === path.parse(resolved).root ||
    resolved === process.cwd() ||
    path.basename(keep) !== keep ||
    fs.lstatSync(resolved).isSymbolicLink()
  )
    throw new Error("Unsafe backup directory");
  const current = path.join(resolved, keep);
  if (fs.lstatSync(current).isSymbolicLink())
    throw new Error("Unsafe backup file");
  decryptBackup(fs.readFileSync(current, "utf8"), key);
  let count = 0;
  for (const item of fs.readdirSync(resolved, { withFileTypes: true })) {
    const match =
      /^genesis-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.json\.enc$/.exec(
        item.name,
      );
    if (!match || item.name === keep || !item.isFile() || item.isSymbolicLink())
      continue;
    const at = Date.parse(
      `${match[1]}T${match[2]}:${match[3]}:${match[4]}.${match[5]}Z`,
    );
    if (!Number.isFinite(at) || at >= timestamp - days * 86400000) continue;
    const target = path.resolve(resolved, item.name);
    if (
      path.dirname(target) !== resolved ||
      fs.lstatSync(target).isSymbolicLink()
    )
      throw new Error("Unsafe rotation target");
    // Never remove unrelated/corrupt files or backups encrypted with a different key.
    try {
      decryptBackup(fs.readFileSync(target, "utf8"), key);
    } catch {
      continue;
    }
    fs.unlinkSync(target);
    count++;
  }
  return count;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runOperations().catch(() => {
    console.error("Operations failed; check protected service configuration.");
    process.exitCode = 1;
  });
}
