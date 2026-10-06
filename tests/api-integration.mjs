import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, cpSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ganache from "ganache";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEther,
  decodeEventLog,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
const A = JSON.parse(readFileSync("packages/web3/artifacts.json", "utf8"));
const state = mkdtempSync(path.join(tmpdir(), "genesis-api-test-"));
const base = "http://127.0.0.1:8791";
const operationsToken = "isolated-test-token-not-a-production-secret";
let worker;
let logs = "";
let passed = 0;
const server = ganache.server({
  logging: { quiet: true },
  chain: { chainId: 46630, hardfork: "shanghai" },
  wallet: { totalAccounts: 3, defaultBalance: 100 },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function sql(args) {
  const r = spawnSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      state,
      ...args,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
}
const call = async (route, body, origin = base, retry = 0) => {
  const r = await fetch(base + "/api/" + route, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const bodyText = await r.text();
  if (
    route === "sync" &&
    bodyText.startsWith("Your worker restarted mid-request") &&
    retry < 2
  ) {
    await sleep(1000);
    return call(route, body, origin, retry + 1);
  }
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`${route}: HTTP ${r.status}: ${bodyText.slice(0, 1000)}`);
  }
  return { status: r.status, data };
};
const callWithCookie = async (route, body, cookie) => {
  const r = await fetch(base + "/api/" + route, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, data: JSON.parse(text), headers: r.headers };
};
async function check(name, fn) {
  await fn();
  passed++;
  console.log("PASS", name);
}
try {
  await server.listen(0, "127.0.0.1");
  const rpcUrl = `http://127.0.0.1:${server.address().port}`;
  const chain = defineChain({
    id: 46630,
    name: "Isolated Robinhood-compatible test chain",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({
    chain,
    transport: http(rpcUrl),
    cacheTime: 0,
  });
  const wallet = createWalletClient({ chain, transport: http(rpcUrl) });
  const mineToConfirmationDepth = async (hash, required = 4) => {
    const receipt = await client.getTransactionReceipt({ hash });
    while ((await client.getBlockNumber()) - receipt.blockNumber + 1n < BigInt(required)) {
      await server.provider.request({ method: "evm_mine", params: [] });
    }
  };
  const [owner, creator] = await wallet.getAddresses();
  const ownerAccount = privateKeyToAccount(
    server.provider.getInitialAccounts()[owner.toLowerCase()].secretKey,
  );
  const otherAccount = privateKeyToAccount(
    server.provider.getInitialAccounts()[creator.toLowerCase()].secretKey,
  );
  const deployHash = await wallet.deployContract({
    account: owner,
    abi: A.GenesisPlatform.abi,
    bytecode: A.GenesisPlatform.bytecode,
    args: [owner, owner, parseEther("0.0001")],
    gas: 10000000n,
  });
  const deployment = await client.waitForTransactionReceipt({
    hash: deployHash,
  });
  const platform = deployment.contractAddress;
  sql(["--file", "drizzle/0000_chief_tenebrous.sql"]);
  sql(["--file", "drizzle/0001_asset_record_layer.sql"]);
  sql(["--file", "drizzle/0002_rvyn_sale_desk.sql"]);
  const deploymentConfig = JSON.stringify({
    platform,
    deploymentBlock: Number(deployment.blockNumber),
    genesis: null,
    sale: null,
  });
  sql([
    "--command",
    `INSERT INTO settings(key,value) VALUES('deployment:46630','${deploymentConfig}')`,
  ]);
  const fixture = path.join(state, "fixture-worker");
  cpSync("dist/server", fixture, { recursive: true });
  const patchAdmin = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) patchAdmin(target);
      else if (entry.name.endsWith(".js")) {
        const original = readFileSync(target, "utf8");
        const changed = original.replaceAll("0xee4c435b9207ba5bb5f4860156409ae78032ff6e", owner.toLowerCase());
        if (changed !== original) writeFileSync(target, changed);
      }
    }
  };
  patchAdmin(fixture);
  const fixtureConfig = JSON.parse(readFileSync(path.join(fixture, "wrangler.json"), "utf8"));
  fixtureConfig.assets.directory = path.resolve("dist/client");
  const fixtureConfigPath = path.join(fixture, "wrangler.json");
  writeFileSync(fixtureConfigPath, JSON.stringify(fixtureConfig));
  worker = spawn(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "node_modules/wrangler/bin/wrangler.js",
      "dev",
      "--config",
      fixtureConfigPath,
      "--local",
      "--persist-to",
      state,
      "--ip",
      "127.0.0.1",
      "--port",
      "8791",
      "--inspector-port",
      "0",
      "--var",
      `RPC_TESTNET:${rpcUrl}`,
      "--var",
      `OPS_TOKEN:${operationsToken}`,
      "--var",
      "LAUNCH_CONFIRMATION_DEPTH:4",
      "--var",
      "PUBLIC_API_RATE_LIMIT:240",
    ],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  worker.stdout.on("data", (d) => (logs += d));
  worker.stderr.on("data", (d) => (logs += d));
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await call("health")).status === 200) {
        ready = true;
        break;
      }
    } catch {}
    await sleep(500);
  }
  if (!ready) throw new Error("Worker startup failed: " + logs.slice(-2000));
  // Preserve all defaults while explicitly selecting this suite's isolated chain.
  const initialConfig = await call("config");
  sql(["--command", `INSERT INTO settings(key,value) VALUES('config','${JSON.stringify({ ...initialConfig.data, chainId: 46630 }).replaceAll("'", "''")}')`]);
  await sleep(2000);
  await check(
    "public config reads actual onchain fee and Treasury",
    async () => {
      const r = await call("config");
      assert.equal(r.status, 200);
      assert.equal(r.data.chainStatus, "connected");
      assert.equal(r.data.treasury.toLowerCase(), owner.toLowerCase());
      assert.equal(r.data.launchFee, "0.0001");
    },
  );
  await check("RVYN public sale stages fail closed and allowlist lookup reflects registry", async () => {
    const initial = await call("rvyn/status");
    assert.equal(initial.status, 200);
    assert.equal(initial.data.phase, "allowlist_prep");
    assert.equal(initial.data.purchasesOpen, false);
    assert.equal(initial.data.allowlistEnforcedOnchain, false);
    assert.equal(initial.data.registrationStatus, "disabled");
    assert.equal(initial.data.registryOpen, false);
    const walletAddress = owner.toLowerCase();
    const timestamp = Math.floor(Date.now() / 1000);
    sql(["--command", `INSERT INTO rvyn_allowlist(chain_id,wallet_address,status,source,public_note,listed_at,updated_at,updated_by) VALUES(46630,'${walletAddress}','listed','test','',${timestamp},${timestamp},'test')`]);
    assert.equal((await call(`rvyn/allowlist?address=${walletAddress}`)).data.result, "preparing");
    sql(["--command", `INSERT INTO settings(key,value) VALUES('rvyn:sale-desk:46630','{"phase":"allowlist_open","updatedAt":${timestamp},"updatedBy":"test","reason":"Integration fixture"}')`]);
    sql(["--command", `INSERT INTO settings(key,value) VALUES('rvyn:allowlist-window:46630','{"enabled":true,"opensAt":${timestamp - 60},"closesAt":${timestamp + 3600},"updatedAt":${timestamp},"updatedBy":"test"}')`]);
    assert.equal((await call("rvyn/status")).data.registrationStatus, "open");
    const openRegistry = await call(`rvyn/allowlist?address=${walletAddress}`);
    assert.equal(openRegistry.data.result, "listed");
    assert.equal(openRegistry.data.purchasesOpen, false);
    assert.equal(openRegistry.data.listedCount, 1);
    const unknown = await call("rvyn/allowlist?address=0x0000000000000000000000000000000000000001");
    assert.equal(unknown.data.result, "not_listed");
    const invalid = await call("rvyn/allowlist?address=invalid");
    assert.equal(invalid.status, 400);
    const signupChallenge = await call("wallet/challenge", { account: creator });
    const signupSignature = await otherAccount.signMessage({ message: signupChallenge.data.message });
    const signupVerified = await fetch(base + "/api/wallet/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ id: signupChallenge.data.id, signature: signupSignature }),
    });
    assert.equal(signupVerified.status, 200);
    const signupCookie = (signupVerified.headers.get("set-cookie") || "").split(";")[0];
    const signup = await callWithCookie("rvyn/register", {}, signupCookie);
    assert.equal(signup.status, 201);
    assert.equal(signup.data.status, "pending");
    const duplicateSignup = await callWithCookie("rvyn/register", {}, signupCookie);
    assert.equal(duplicateSignup.status, 200);
    assert.equal(duplicateSignup.data.idempotent, true);
    assert.equal((await call(`rvyn/allowlist?address=${creator.toLowerCase()}`)).data.result, "pending");
    sql(["--command", `UPDATE settings SET value='{"enabled":true,"opensAt":${timestamp - 60},"closesAt":${timestamp},"updatedAt":${timestamp},"updatedBy":"test"}' WHERE key='rvyn:allowlist-window:46630'`]);
    const closedRegistry = await call("rvyn/status");
    assert.equal(closedRegistry.data.registrationStatus, "closed");
    assert.equal(closedRegistry.data.registryOpen, false);
    assert.equal((await call(`rvyn/allowlist?address=${creator.toLowerCase()}`)).data.result, "pending");
    assert.equal((await call(`rvyn/allowlist?address=${walletAddress}`)).data.result, "preparing");
    assert.equal((await callWithCookie("rvyn/register", {}, signupCookie)).status, 409);
    sql(["--command", `UPDATE settings SET value='{"phase":"sale_open","updatedAt":${timestamp},"updatedBy":"test","reason":"Unsafe fixture"}' WHERE key='rvyn:sale-desk:46630'`]);
    const unsafe = await call("rvyn/status");
    assert.equal(unsafe.data.effectivePhase, "allowlist_open");
    assert.equal(unsafe.data.purchasesOpen, false);
    sql(["--command", `UPDATE settings SET value='{"phase":"allowlist_prep","updatedAt":0,"updatedBy":"test","reason":"Reset fixture"}' WHERE key='rvyn:sale-desk:46630'`]);
  });
  const draft = {
    name: "Integration Token",
    symbol: "INT",
    supply: "1000000",
    description: "Disposable local integration token.",
    website: "",
    x: "",
    telegram: "",
    logo: "",
  };
  let metadata;
  await check("metadata persists and can be retrieved", async () => {
    const r = await call("metadata", draft);
    assert.equal(r.status, 201);
    metadata = r.data;
    const get = await call("metadata/" + metadata.id);
    assert.equal(get.data.description, draft.description);
  });
  await check("unsafe URL and invalid integer are rejected", async () => {
    assert.equal(
      (await call("metadata", { ...draft, website: "javascript:alert(1)" }))
        .status,
      400,
    );
    assert.equal(
      (await call("metadata", { ...draft, supply: "1e9" })).status,
      400,
    );
  });
  await check("cross-origin writes denied", async () =>
    assert.equal(
      (await call("metadata", draft, "https://other.example")).status,
      403,
    ),
  );
  const launchHash = await wallet.writeContract({
    account: owner,
    address: platform,
    abi: A.GenesisPlatform.abi,
    functionName: "launch",
    args: [draft.name, draft.symbol, parseEther(draft.supply), metadata.uri],
    value: parseEther("0.0001"),
    gas: 5000000n,
  });
  const launch = await client.waitForTransactionReceipt({ hash: launchHash });
  const token = launch.logs
    .map((l) => {
      try {
        return decodeEventLog({ abi: A.GenesisPlatform.abi, ...l });
      } catch {
        return null;
      }
    })
    .find((e) => e?.eventName === "TokenCreated")
    .args.token.toLowerCase();
  await check("first receipt creates a pending canonical record that stays out of the directory", async () => {
    const sync = await call("sync", { tx: launchHash });
    assert.equal(sync.status, 200);
    assert.equal(sync.data.record.status, "pending");
    assert.equal((await call("v1/assets")).data.assets.length, 0);
  });
  await server.provider.request({ method: "evm_mine", params: [] });
  await server.provider.request({ method: "evm_mine", params: [] });
  await server.provider.request({ method: "evm_mine", params: [] });
  await sleep(4500);
  await check(
    "confirmed receipt creates token in New with linked metadata",
    async () => {
      const sync = await call("sync", { tx: launchHash });
      assert.equal(sync.status, 200);
      assert.equal(sync.data.record.status, "active");
      const r = await call("tokens?tab=new");
      assert.equal(r.data.tokens.length, 1);
      assert.equal(r.data.tokens[0].address, token);
      assert.equal(r.data.tokens[0].metadata.name, draft.name);
      const directory = await call("v1/assets?limit=1");
      assert.equal(directory.data.assets.length, 1);
      assert.equal(directory.data.assets[0].asset.contractAddress, token);
      const detail = await call(`v1/assets/${token}`);
      assert.equal(detail.data.schemaVersion, "1.0.0");
      assert.equal(detail.data.identity.symbol, draft.symbol);
      assert.equal(detail.data.origin.creatorWallet.toLowerCase(), owner.toLowerCase());
      assert.equal(detail.data.origin.factoryVersion, "v1");
      assert.equal(detail.data.originalState.values.decimals, 18);
      assert.equal(detail.data.originalState.values.totalSupply, String(BigInt(draft.supply) * 10n ** 18n));
      assert.equal(detail.data.canonicalState.type, "original");
      assert.equal(detail.data.comparison.fields.length, 3);
      assert.ok(!detail.data.comparison.fields.some((field) => ["owner", "mintable", "buyTax", "sellTax", "paused", "upgradeable"].includes(field.field)));
      assert.equal(detail.data.comparison.fields.find((field) => field.field === "officialPair").current, "no_pool");
      assert.equal(detail.data.comparison.fields.find((field) => field.field === "officialPair").status, "not_observed");
      assert.equal(detail.data.links.liquidityStatus, "no_pool");
      const history = await call(`v1/assets/${token}/history?limit=10`);
      assert.ok(history.data.events.some((event) => event.type === "asset_launched"));
      assert.ok(history.data.events.some((event) => event.type === "launch_confirmed"));
    },
  );
  await check("receipt indexing is idempotent and can recover a revalidated record", async () => {
    sql([
      "--command",
      `UPDATE assets SET record_status='unavailable' WHERE chain_id=46630 AND contract_address='${token}'`,
    ]);
    await call("sync", { tx: launchHash });
    assert.equal((await call("tokens?tab=new")).data.tokens.length, 1);
    assert.equal((await call(`v1/assets/${token}`)).data.recordStatus, "active");
    const history = await call(`v1/assets/${token}/history?limit=20`);
    assert.ok(history.data.events.some((event) => event.type === "record_recovered"));
  });
  let creatorCookie = "";
  await check("creator metadata requires a signed wallet session and appends history", async () => {
    const denied = await call(`v1/assets/${token}/metadata`, {
      name: "Changed Name",
      logo: "",
      description: "A valid but unauthorized metadata update.",
      links: { website: "", x: "", telegram: "", liquidity: "" },
    });
    assert.equal(denied.status, 401);
    const otherChallenge = await call("wallet/challenge", { account: creator });
    const otherSignature = await otherAccount.signMessage({ message: otherChallenge.data.message });
    const otherVerified = await fetch(base + "/api/wallet/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ id: otherChallenge.data.id, signature: otherSignature }),
    });
    assert.equal(otherVerified.status, 200);
    const otherCookie = (otherVerified.headers.get("set-cookie") || "").split(";")[0];
    const wrongCreator = await callWithCookie(`v1/assets/${token}/metadata`, {
      name: "Unauthorized Edit",
      logo: "",
      description: "A signed but non-creator edit must be refused.",
      links: { website: "", x: "", telegram: "", liquidity: "" },
    }, otherCookie);
    assert.equal(wrongCreator.status, 403);
    const challenge = await call("wallet/challenge", { account: owner });
    const signature = await ownerAccount.signMessage({ message: challenge.data.message });
    const verified = await fetch(base + "/api/wallet/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({ id: challenge.data.id, signature }),
    });
    assert.equal(verified.status, 200);
    creatorCookie = (verified.headers.get("set-cookie") || "").split(";")[0];
    assert.ok(creatorCookie.includes("__Host-rovyn-wallet="));
    const updated = await callWithCookie(`v1/assets/${token}/metadata`, {
      name: "Integration Record",
      logo: "",
      description: "Creator-updated metadata remains separate from immutable chain facts.",
      links: { website: "https://example.org/project", x: "", telegram: "", liquidity: "" },
    }, creatorCookie);
    assert.equal(updated.status, 200);
    assert.equal(updated.data.identity.name, "Integration Record");
    assert.equal(updated.data.identity.symbol, draft.symbol);
    assert.equal(updated.data.links.website, "https://example.org/project");
    const events = await call(`v1/assets/${token}/history?limit=20`);
    assert.ok(events.data.events.some((event) => event.type === "metadata_updated"));
    assert.ok(events.data.events.some((event) => event.type === "link_updated"));
  });
  await check("manual current-state refresh reads frozen fields and enforces per-wallet throttle", async () => {
    const refreshed = await callWithCookie(`v1/assets/${token}/refresh`, {}, creatorCookie);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.data.currentState.syncStatus, "fresh");
    assert.equal(refreshed.data.comparisonStatus, "matched");
    assert.equal(refreshed.data.comparison.fields.length, 3);
    assert.equal(refreshed.data.comparison.fields.find((field) => field.field === "totalSupply").status, "matched");
    const limited = await callWithCookie(`v1/assets/${token}/refresh`, {}, creatorCookie);
    assert.equal(limited.status, 429);
    assert.equal(limited.data.code, "refresh_throttled");
    assert.ok(limited.data.retryAfter > 0);
  });
  await check("operator corrections retain the immutable launch snapshot and become the comparison baseline", async () => {
    const originalSupply = String(BigInt(draft.supply) * 10n ** 18n);
    const correctedSupply = String(BigInt(originalSupply) + 1000n);
    const canonical = JSON.stringify({ totalSupply: correctedSupply, decimals: 18 });
    const reason = "Verified the canonical launch snapshot.";
    sql(["--command", `INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES('test-correction',46630,'${token}','correction',1,'${canonical}','operator-correction','fresh',NULL,${Math.floor(Date.now() / 1000)},${Math.floor(Date.now() / 1000)})`]);
    sql(["--command", `INSERT INTO asset_events(id,chain_id,contract_address,event_type,source,actor,payload,created_at) VALUES('test-correction',46630,'${token}','correction','correction','${owner.toLowerCase()}','${JSON.stringify({ reason, canonical: JSON.parse(canonical) })}',${Math.floor(Date.now() / 1000)})`]);
    const detail = await call(`v1/assets/${token}`);
    assert.equal(detail.data.originalState.values.totalSupply, originalSupply);
    assert.equal(detail.data.correctionState.values.totalSupply, correctedSupply);
    assert.equal(detail.data.canonicalState.type, "correction");
    assert.equal(detail.data.comparison.baseline, "correction");
    assert.equal(detail.data.comparison.fields.find((field) => field.field === "totalSupply").original, correctedSupply);
    const history = await call(`v1/assets/${token}/history?limit=20`);
    assert.ok(history.data.events.some((event) => event.type === "correction" && event.payload.reason === reason));
  });
  await check("search and literal SQL wildcard behavior", async () => {
    assert.equal((await call("tokens?q=INT")).data.tokens.length, 1);
    assert.equal((await call("tokens?q=%25")).data.tokens.length, 0);
    const recordSearch = await call("v1/assets?q=Integration");
    assert.equal(recordSearch.data.assets.length, 1);
    assert.equal(recordSearch.data.assets[0].identity.name, "Integration Record");
    assert.equal((await call("v1/assets?q=%25")).data.assets.length, 0);
    const firstHistoryPage = await call(`v1/assets/${token}/history?limit=1`);
    assert.equal(firstHistoryPage.data.events.length, 1);
    assert.ok(firstHistoryPage.data.nextCursor);
    const secondHistoryPage = await call(`v1/assets/${token}/history?limit=1&cursor=${encodeURIComponent(firstHistoryPage.data.nextCursor)}`);
    assert.equal(secondHistoryPage.data.events.length, 1);
    assert.notEqual(firstHistoryPage.data.events[0].id, secondHistoryPage.data.events[0].id);
  });
  const boostHash = await wallet.writeContract({
    account: creator,
    address: platform,
    abi: A.GenesisPlatform.abi,
    functionName: "boost",
    args: [token, 1],
    value: parseEther("0.0008"),
    gas: 5000000n,
  });
  await client.waitForTransactionReceipt({ hash: boostHash });
  for (let i = 0; i < 3; i++)
    await server.provider.request({ method: "evm_mine", params: [] });
  await sleep(4500);
  await check(
    "Boosted uses verified exact payment events with no double-counting",
    async () => {
      await call("sync", { tx: boostHash });
      await call("sync", { tx: boostHash });
      const r = await call("tokens?tab=boosted");
      assert.equal(r.data.tokens[0].activeBoost, 50);
      assert.equal(r.data.tokens[0].boosters, 1);
    },
  );
  await check(
    "natural page views deduplicate and exclude Boost units",
    async () => {
      await call("view", { token });
      await call("view", { token });
      const r = await call("tokens?tab=trending");
      assert.equal(r.data.tokens[0].views, 1);
      assert.ok(r.data.tokens[0].score <= 1);
    },
  );
  await check("token detail and reporting persist", async () => {
    const r = await call("token/" + token);
    assert.equal(r.data.activity.length, 1);
    assert.equal(
      (
        await call("report", {
          token,
          reason: "Disposable moderation test report.",
        })
      ).status,
      200,
    );
  });
  await check("X post fetching is removed: no endpoint, no admin action, updates page shows the log only", async () => {
    assert.equal((await call("x-updates")).status, 404);
    for (const action of ["x-update-import", "x-update-remove"]) assert.equal((await call("challenge", { action, payload: {} })).status, 400);
    const html = await (await fetch(base + "/latest-info")).text();
    assert.match(html, /Development log|開發日誌|开发日志|개발 기록/);
    assert.ok(!html.includes("What if a game token"));
  });
  await check("anonymous admin settings denied", async () => {
    assert.equal(
      (
        await call("admin", {
          action: "settings",
          payload: {},
          auth: { id: "missing", signature: "0x" },
        })
      ).status,
      401,
    );
  });
  await check(
    "full event replay rebuilds canonical rows without duplication",
    async () => {
      const r = await call("sync", {});
      assert.equal(r.status, 200);
      assert.equal((await call("tokens?tab=new")).data.tokens.length, 1);
      assert.equal((await call("v1/assets")).data.assets.length, 1);
      assert.equal(
        (await call("tokens?tab=boosted")).data.tokens[0].activeBoost,
        50,
      );
    },
  );
  await check(
    "operations endpoints reject anonymous and wrong credentials",
    async () => {
      assert.equal((await call("ops/status")).status, 401);
      const r = await fetch(base + "/api/ops/snapshot", {
        headers: { Authorization: "Bearer wrong" },
      });
      assert.equal(r.status, 401);
    },
  );
  await check(
    "authorized operations report sync health and bounded private snapshot",
    async () => {
      const headers = { Authorization: `Bearer ${operationsToken}` };
      const status = await fetch(base + "/api/ops/status", { headers }).then(
        (r) => r.json(),
      );
      assert.equal(status.database, "ok");
      assert.equal(status.sync.ok, true);
      const snapshot = await fetch(base + "/api/ops/snapshot", {
        headers,
      }).then((r) => r.json());
      assert.equal(snapshot.schemaVersion, 2);
      assert.equal(snapshot.tables.tokens.length, 1);
      assert.equal(snapshot.tables.assets.length, 1);
      assert.ok(snapshot.tables.asset_states.length >= 2);
      assert.equal(
        snapshot.tables.asset_states.filter((row) => row.state_kind === "original").length,
        1,
      );
      assert.ok(Array.isArray(snapshot.tables.rvyn_allowlist));
      assert.equal(snapshot.tables.challenges, undefined);
      assert.equal(snapshot.tables.limits, undefined);
      assert.ok(
        snapshot.tables.settings.every((row) => !row.key.startsWith("ops:")),
      );
    },
  );
  await check("global metadata quota fails closed", async () => {
    const day = Math.floor(Date.now() / 86400000);
    sql([
      "--command",
      `INSERT INTO limits(key,count,expires) VALUES('daily:metadata:${day}',1000,${(day + 1) * 86400}) ON CONFLICT(key) DO UPDATE SET count=1000`,
    ]);
    assert.equal((await call("metadata", draft)).status, 429);
  });
  await check("malformed directory cursors return a client error", async () => {
    const result = await call("v1/assets?cursor=not-a-cursor");
    assert.equal(result.status, 400);
    assert.equal(result.data.error, "cursor 格式無效");
  });
  await check("directory cursor pagination and creator wallet filter return a stable complete listing", async () => {
    const creatorAddress = owner.toLowerCase();
    const paginationTx = await wallet.writeContract({
      account: owner,
      address: platform,
      abi: A.GenesisPlatform.abi,
      functionName: "launch",
      args: ["Pagination Token", "PAGE", parseEther("1000"), metadata.uri],
      value: parseEther("0.0001"),
      gas: 5000000n,
    });
    await client.waitForTransactionReceipt({ hash: paginationTx });
    await mineToConfirmationDepth(paginationTx);
    const launchResult = await call("sync", { tx: paginationTx });
    assert.equal(launchResult.data.record.status, "active");
    const first = await call(`v1/assets?limit=1&creator=${creatorAddress}`);
    assert.equal(first.data.assets.length, 1);
    assert.ok(first.data.nextCursor);
    const second = await call(`v1/assets?limit=1&creator=${creatorAddress}&cursor=${encodeURIComponent(first.data.nextCursor)}`);
    assert.equal(second.data.assets.length, 1);
    assert.notEqual(first.data.assets[0].asset.contractAddress, second.data.assets[0].asset.contractAddress);
    assert.ok(first.data.assets[0].asset.createdAt <= second.data.assets[0].asset.createdAt);
    const excluded = await call(`v1/assets?limit=10&creator=${creatorAddress}&exclude=${first.data.assets[0].asset.contractAddress}`);
    assert.ok(excluded.data.assets.every((asset) => asset.asset.contractAddress !== first.data.assets[0].asset.contractAddress));
    const mine = await call(`v1/creators/${creatorAddress}/assets?limit=10`);
    assert.equal(mine.data.assets.length, 2);
    assert.equal(mine.data.creator, creatorAddress);
  });
  await check("legacy launch records disclose missing factory provenance without inferring token safety", async () => {
    const legacyToken = "0x0000000000000000000000000000000000000fed";
    const legacyTx = `0x${"d".repeat(64)}`;
    const legacyTime = Math.floor(Date.now() / 1000);
    const legacyValues = JSON.stringify({ totalSupply: "10000000000000000000000000", decimals: 18 });
    const legacyMetadata = JSON.stringify({ name: "Legacy RovynCore", symbol: "LRVYN", description: "Historical import fixture.", logo: "" });
    sql(["--command", [
      `INSERT INTO assets(chain_id,contract_address,asset_type,record_status,launch_tx,created_at,updated_at) VALUES(46630,'${legacyToken}','erc20','active','${legacyTx}',${legacyTime},${legacyTime})`,
      `INSERT INTO asset_origins(chain_id,contract_address,origin_type,creator_wallet,factory_address,factory_version,launch_tx,block_number,timestamp,created_at) VALUES(46630,'${legacyToken}','rovyncore_launch','${owner.toLowerCase()}',NULL,NULL,'${legacyTx}',10,${legacyTime},${legacyTime})`,
      `INSERT INTO asset_metadata(chain_id,contract_address,data,version,updated_by,updated_at) VALUES(46630,'${legacyToken}','${legacyMetadata}',1,'${owner.toLowerCase()}',${legacyTime})`,
      `INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES('legacy-fixture-original',46630,'${legacyToken}','original',1,'${legacyValues}','legacy-indexed-launch-event','fresh',10,${legacyTime},${legacyTime})`,
      `INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES('legacy-fixture-current',46630,'${legacyToken}','current',1,'${legacyValues}','robinhood-rpc','fresh',10,${legacyTime},${legacyTime})`,
    ].join("; ")]);
    const detail = await call(`v1/assets/${legacyToken}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.origin.type, "legacy_import");
    assert.equal(detail.data.origin.factoryAddress, null);
    assert.equal(detail.data.originalState.dataSource, "legacy-indexed-launch-event");
    assert.ok(!detail.data.comparison.fields.some((field) => field.field === "buyTax" || field.field === "sellTax"));
  });
  await check("reorg marks a previously confirmed launch unavailable without erasing its record history", async () => {
    const snapshot = await server.provider.request({ method: "evm_snapshot", params: [] });
    const reorgHash = await wallet.writeContract({
      account: owner,
      address: platform,
      abi: A.GenesisPlatform.abi,
      functionName: "launch",
      args: ["Reorg Fixture", "REORG", parseEther("1000"), metadata.uri],
      value: parseEther("0.0001"),
      gas: 5000000n,
    });
    await client.waitForTransactionReceipt({ hash: reorgHash });
    await mineToConfirmationDepth(reorgHash);
    const indexed = await call("sync", { tx: reorgHash });
    assert.equal(indexed.data.record.status, "active");
    assert.equal(await server.provider.request({ method: "evm_revert", params: [snapshot] }), true);
    assert.equal((await call("sync", { tx: reorgHash })).status, 409);
    const reorgedToken = indexed.data.record.contractAddress;
    const detail = await call(`v1/assets/${reorgedToken}`);
    assert.equal(detail.data.recordStatus, "unavailable");
    const history = await call(`v1/assets/${reorgedToken}/history?limit=20`);
    assert.ok(history.data.events.some((event) => event.type === "asset_launched"));
    assert.ok(history.data.events.some((event) => event.type === "record_unavailable"));
    assert.ok(!(await call("v1/assets?limit=100")).data.assets.some((asset) => asset.asset.contractAddress === reorgedToken));
  });
  await check("latest unavailable state keeps the last successful values and timestamp", async () => {
    const failureToken = "0x0000000000000000000000000000000000000abc";
    const tx = `0x${"c".repeat(64)}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const previous = JSON.stringify({ totalSupply: "987654321", decimals: 18 });
    const metadataJson = JSON.stringify({ name: "Unavailable Fixture", symbol: "UNAV", description: "RPC failure fixture", logo: "" }).replaceAll("'", "''");
    sql(["--command", [
      `INSERT INTO assets(chain_id,contract_address,asset_type,record_status,launch_tx,created_at,updated_at) VALUES(46630,'${failureToken}','erc20','active','${tx}',${timestamp},${timestamp})`,
      `INSERT INTO asset_origins(chain_id,contract_address,origin_type,creator_wallet,launch_tx,block_number,timestamp,created_at) VALUES(46630,'${failureToken}','rovyncore_launch','${owner.toLowerCase()}','${tx}',1,${timestamp},${timestamp})`,
      `INSERT INTO asset_metadata(chain_id,contract_address,data,version,updated_by,updated_at) VALUES(46630,'${failureToken}','${metadataJson}',1,'${owner.toLowerCase()}',${timestamp})`,
      `INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES('fixture-original',46630,'${failureToken}','original',1,'${previous}','fixture','fresh',1,${timestamp - 20},${timestamp - 20})`,
      `INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES('fixture-current-fresh',46630,'${failureToken}','current',1,'${previous}','fixture-rpc','fresh',10,${timestamp - 10},${timestamp - 10})`,
      `INSERT INTO asset_states(id,chain_id,contract_address,state_kind,version,payload,data_source,sync_status,block_number,observed_at,created_at) VALUES('fixture-current-unavailable',46630,'${failureToken}','current',2,'${previous}','fixture-rpc','unavailable',NULL,${timestamp},${timestamp})`,
      `INSERT INTO limits(key,count,expires) VALUES('asset-sync:46630:${failureToken}',1,${timestamp + 3600})`,
    ].join("; ")]);
    const state = await call(`v1/assets/${failureToken}/state`);
    assert.equal(state.status, 200);
    assert.equal(state.data.currentState.syncStatus, "unavailable");
    assert.equal(state.data.currentState.values.totalSupply, "987654321");
    assert.equal(state.data.currentState.lastSyncedAt, timestamp - 10);
    assert.equal(state.data.comparison.status, "unavailable");
  });
  await check("public API throttling returns machine-readable 429 and Retry-After", async () => {
    let limited;
    for (let i = 0; i < 260; i++) {
      const response = await fetch(base + "/api/v1/assets?limit=1", { headers: { Origin: base, "cf-connecting-ip": "198.51.100.24" } });
      if (response.status === 429) { limited = response; break; }
    }
    assert.ok(limited, "expected the configured per-IP public API limit to be reached");
    const payload = await limited.json();
    assert.equal(payload.code, "rate_limited");
    assert.equal(payload.retryAfter, 60);
    assert.equal(limited.headers.get("retry-after"), "60");
  });
  await check("original snapshots and event history reject update and delete", async () => {
    const originalId = `original:46630:${launchHash.toLowerCase()}`;
    const launchEventId = `launched:46630:${launchHash.toLowerCase()}`;
    assert.throws(
      () => sql(["--command", `UPDATE asset_states SET payload='{}' WHERE id='${originalId}'`]),
      /append-only/i,
    );
    assert.throws(
      () => sql(["--command", `DELETE FROM asset_states WHERE id='${originalId}'`]),
      /append-only/i,
    );
    assert.throws(
      () => sql(["--command", `UPDATE asset_events SET payload='{}' WHERE id='${launchEventId}'`]),
      /append-only/i,
    );
    assert.throws(
      () => sql(["--command", `DELETE FROM asset_events WHERE id='${launchEventId}'`]),
      /append-only/i,
    );
  });
  console.log(
    `${passed} API integration checks passed. Isolated state: ${state}`,
  );
} catch (e) {
  console.error(e.stack || e.message);
  console.error(logs.slice(-6000));
  process.exitCode = 1;
} finally {
  worker?.kill();
  await server.close();
}
