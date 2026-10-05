import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { build } from "esbuild";

// Bundles the real route handler with its Worker-only dependencies replaced by controllable fakes,
// so the 404 / cache / rate-limit / failure branches run exactly as written.
const root = process.cwd();
const ADDRESS = "0x545a1ff27596de2f31480df39aa9548f363fc361";

type Mock = {
  record: unknown;
  dbThrows: boolean;
  rateThrows: boolean;
  dbCalls: number;
  rateScopes: string[];
  waited: Promise<unknown>[];
  cache: Map<string, Response>;
  cachePuts: string[];
};
const state = globalThis as unknown as { __badge: Mock };

const virtual: Record<string, string> = {
  "cloudflare:workers": `export const waitUntil = (p) => globalThis.__badge.waited.push(p);`,
  "@/lib/server": `
    export class ApiError extends Error { constructor(status, message, code, retryAfter) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; } }
    export const db = () => { globalThis.__badge.dbCalls++; return {}; };
    export const config = async () => ({ chainId: 4663 });
    export const rate = async (_request, scope) => { globalThis.__badge.rateScopes.push(scope); if (globalThis.__badge.rateThrows) throw new ApiError(429, "slow down", "rate_limited", 60); };
  `,
  "@/lib/asset-record": `export const getAssetRecord = async () => { if (globalThis.__badge.dbThrows) throw new Error("secret-rpc-url"); return globalThis.__badge.record; };`,
};

async function loadRoute() {
  const result = await build({
    entryPoints: [path.join(root, "app/badge/[address]/route.ts")],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    logLevel: "silent",
    plugins: [
      {
        name: "fakes",
        setup(b) {
          b.onResolve({ filter: /^(cloudflare:workers|@\/lib\/server|@\/lib\/asset-record)$/ }, (args) => ({ path: args.path, namespace: "fake" }));
          b.onLoad({ filter: /.*/, namespace: "fake" }, (args) => ({ contents: virtual[args.path], loader: "js" }));
          b.onResolve({ filter: /^@\/lib\/record-badge$/ }, () => ({ path: path.join(root, "lib/record-badge.ts") }));
        },
      },
    ],
  });
  const code = result.outputFiles[0].text;
  return (await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`)) as {
    GET: (request: Request, context: { params: Promise<{ address: string }> }) => Promise<Response>;
  };
}

const record = (over: Partial<{ name: string; symbol: string; status: string }> = {}) => ({
  identity: { name: "RovynCore", symbol: "RVYN", ...over },
  recordStatus: over.status ?? "active",
  origin: { timestamp: 1_790_000_000 },
});

function reset(over: Partial<Mock> = {}) {
  state.__badge = { record: record(), dbThrows: false, rateThrows: false, dbCalls: 0, rateScopes: [], waited: [], cache: new Map(), cachePuts: [], ...over };
  (globalThis as unknown as { caches: unknown }).caches = {
    default: {
      // The real edge cache returns responses whose headers are immutable.
      match: async (key: Request) => {
        const hit = state.__badge.cache.get(key.url)?.clone();
        if (!hit) return undefined;
        const frozen = hit.headers;
        for (const method of ["set", "append", "delete"] as const) {
          frozen[method] = () => {
            throw new TypeError("Can't modify immutable headers.");
          };
        }
        return hit;
      },
      put: async (key: Request, response: Response) => {
        state.__badge.cachePuts.push(key.url);
        state.__badge.cache.set(key.url, response);
      },
    },
  };
}
const call = async (route: Awaited<ReturnType<typeof loadRoute>>, raw: string, url = `https://www.rovyncore.com/badge/${raw}`) => {
  const response = await route.GET(new Request(url), { params: Promise.resolve({ address: raw }) });
  await Promise.all(state.__badge.waited);
  return response;
};

test("a confirmed asset returns a sandboxed, cacheable SVG", async () => {
  reset();
  const route = await loadRoute();
  const response = await call(route, `${ADDRESS}.svg`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^image\/svg\+xml/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "cross-origin");
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'.*sandbox/);
  assert.match(response.headers.get("cache-control") ?? "", /max-age=300/);
  const body = await response.text();
  assert.match(body, /Confirmed launch record · 2026-09-21/);
  assert.match(body, /ONCHAIN RECORD · RVYN/);
  assert.deepEqual(state.__badge.rateScopes, [], "a hit never touches the rate limiter");
});

test("a second request, in any letter case or with a query string, is served from the edge cache", async () => {
  reset();
  const route = await loadRoute();
  await call(route, `${ADDRESS}.svg`);
  assert.equal(state.__badge.dbCalls, 1);
  assert.deepEqual(state.__badge.cachePuts, [`https://www.rovyncore.com/badge/${ADDRESS}.svg`]);
  const upper = `0x${ADDRESS.slice(2).toUpperCase()}.svg`.replace("0X", "0x");
  const again = await call(route, upper, `https://www.rovyncore.com/badge/${upper}?utm=1`);
  assert.equal(again.status, 200);
  again.headers.set("x-added-by-framework", "1"); // must not throw: hits are returned as a mutable copy
  assert.match(again.headers.get("content-type") ?? "", /^image\/svg\+xml/);
  assert.equal(state.__badge.dbCalls, 1, "no second database read");
  assert.equal(state.__badge.cachePuts.length, 1, "no extra cache entry");
});

test("malformed addresses are rejected before any database access", async () => {
  reset();
  const route = await loadRoute();
  for (const raw of ["", "0x123", `${ADDRESS}.png`, `../${ADDRESS}`, "<script>"]) {
    const response = await call(route, raw);
    assert.equal(response.status, 404, raw);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  assert.equal(state.__badge.dbCalls, 0);
});

test("an unknown or hidden asset is a 404 that counts against the miss limiter", async () => {
  reset({ record: null });
  const route = await loadRoute();
  const response = await call(route, ADDRESS);
  assert.equal(response.status, 404);
  assert.deepEqual(state.__badge.rateScopes, ["badge-miss"]);
  assert.equal(state.__badge.cachePuts.length, 0, "misses are never cached");
});

test("a scanner that keeps missing is told to slow down", async () => {
  reset({ record: null, rateThrows: true });
  const route = await loadRoute();
  const response = await call(route, ADDRESS);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
});

test("a database failure returns 503 without leaking the error", async () => {
  reset({ dbThrows: true });
  const route = await loadRoute();
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await call(route, ADDRESS);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.doesNotMatch(await response.text(), /secret-rpc-url/);
    assert.equal(state.__badge.cachePuts.length, 0, "failures are never cached");
  } finally {
    console.error = originalError;
  }
});

test("a pending record is not shown as confirmed", async () => {
  reset({ record: record({ status: "pending" }) });
  const route = await loadRoute();
  const body = await (await call(route, ADDRESS)).text();
  assert.match(body, /Awaiting confirmations/);
  assert.doesNotMatch(body, /Confirmed/);
});

test("hostile creator text is escaped in the served SVG", async () => {
  reset({ record: record({ name: `"><script>alert(1)</script>`, symbol: `<img src=x onerror=alert(2)>` }) });
  const route = await loadRoute();
  const body = await (await call(route, ADDRESS)).text();
  assert.doesNotMatch(body, /<script|<img/i);
  assert.match(body, /&lt;script&gt;/);
});

test("the route still works when the edge cache is unavailable", async () => {
  reset();
  delete (globalThis as unknown as { caches?: unknown }).caches;
  const route = await loadRoute();
  const response = await call(route, ADDRESS);
  assert.equal(response.status, 200);
});
