import application from "../dist/server/index.js";
import { syncXUpdates } from "../lib/x-auto-sync.ts";

// Baseline browser hardening. No CSP yet: wallet extensions and third-party media need a reviewed policy first.
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

async function withSecurityHeaders(response) {
  // WebSocket upgrades and opaque responses must pass through untouched.
  if (response.status === 101 || response.webSocket) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) if (!headers.has(name)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const worker = {
  async fetch(request, env, context) {
    // Browsers probe /favicon.ico regardless of <link rel=icon>; point them at the SVG icon.
    if (new URL(request.url).pathname === "/favicon.ico") return Response.redirect(new URL("/favicon.svg", request.url).toString(), 301);
    return withSecurityHeaders(await application.fetch(request, env, context));
  },
  async scheduled(event, env) {
    if (env.X_AUTO_SYNC !== "enabled") return;
    const result = await syncXUpdates(env.DB);
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .bind("official:x-cron-heartbeat", JSON.stringify({ invokedAt: Math.floor(Date.now() / 1000), cron: event.cron, status: result.state.status, skipped: result.skipped })).run();
    // Record upstream failures as cron failures while preserving the saved feed.
    if (result.state.status === "error") throw new Error("Official X synchronization is temporarily unavailable.");
  },
};

export default worker;
