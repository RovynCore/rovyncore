import { waitUntil } from "cloudflare:workers";
import { getAssetRecord } from "@/lib/asset-record";
import { ApiError, config, db, rate } from "@/lib/server";
import { parseBadgeAddress, renderBadgeSvg } from "@/lib/record-badge";

// Public, embeddable badge for an asset's Onchain Record. Read-only: it reads one record and writes nothing,
// except a rate-limit counter when the address is unknown (so the endpoint cannot be used to scan the database).
const CACHE_SECONDS = 300;

const plain = (status: number, body: string, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra },
  });

export async function GET(request: Request, context: { params: Promise<{ address: string }> }) {
  const address = parseBadgeAddress((await context.params).address);
  if (!address) return plain(404, "Not found");

  // Key the edge cache on the canonical path only, so query strings and letter case cannot multiply entries.
  const cacheKey = new Request(`${new URL(request.url).origin}/badge/${address}.svg`);
  // `caches.default` is the Workers edge cache; the DOM typings do not know about it.
  const cache = typeof caches === "undefined" ? null : (caches as unknown as { default: Cache }).default;
  const cached = cache ? await cache.match(cacheKey).catch(() => undefined) : undefined;
  // A cache hit has immutable headers and the framework adds its own after the handler returns, so hand back a copy.
  if (cached) return new Response(cached.body, { status: cached.status, headers: new Headers(cached.headers) });

  try {
    const record = await getAssetRecord(db(), (await config()).chainId, address);
    if (!record) {
      await rate(request, "badge-miss", 60);
      return plain(404, "Not found");
    }
    const svg = renderBadgeSvg({
      name: record.identity.name,
      symbol: record.identity.symbol,
      status: record.recordStatus,
      launchedAt: record.origin.timestamp || null,
    });
    const response = new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
        "X-Content-Type-Options": "nosniff",
        // An SVG opened directly must not be able to run script or load anything.
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        "Cross-Origin-Resource-Policy": "cross-origin",
      },
    });
    if (cache) waitUntil(cache.put(cacheKey, response.clone()).catch(() => undefined));
    return response;
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) {
      return plain(429, "Too many requests", { "Retry-After": String(error.retryAfter ?? 60) });
    }
    console.error("badge failed", error instanceof Error ? { name: error.name } : "Unknown");
    return plain(503, "Temporarily unavailable", { "Retry-After": "60" });
  }
}
