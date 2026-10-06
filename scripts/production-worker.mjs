import application from "../dist/server/index.js";

// Baseline browser hardening. No CSP yet: wallet extensions and third-party media need a reviewed policy first.
const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  // Report-only while the policy is validated against real pages; it blocks nothing.
  "Content-Security-Policy-Report-Only": "default-src 'self'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://rpc.mainnet.chain.robinhood.com https://rpc.testnet.chain.robinhood.com https://cloudflareinsights.com; frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
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
};

export default worker;
