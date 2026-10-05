import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { Miniflare, createFetchMock } from "miniflare";

test("real Workers runtime verifies upload proofs and refuses provider redirects", async () => {
  const fetchMock = createFetchMock();
  fetchMock.disableNetConnect();
  const origin = fetchMock.get("https://challenges.cloudflare.com");
  origin.intercept({ path: "/turnstile/v0/siteverify", method: "POST" })
    .reply(200, JSON.stringify({ success: true, action: "upload", hostname: "rovyncore.com" }));
  origin.intercept({ path: "/turnstile/v0/siteverify", method: "POST" })
    .reply(302, "", { headers: { location: "https://example.com/" } });
  const source = ts.transpileModule(readFileSync(new URL("../lib/human-verification.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const mf = new Miniflare({ modules: true, compatibilityDate: "2026-05-15", fetchMock,
    script: source + `\nexport default { async fetch(request) {
      try {
        await verifyHumanRequest(request, "upload", { mode: "required", siteKey: "public", secret: "test-only-secret", hostnames: "rovyncore.com" });
        return Response.json({ ok: true });
      } catch (error) { return Response.json({ code: error.code, message: error.message }, { status: error.status || 500 }); }
    } };`,
  });
  try {
    const first = await mf.dispatchFetch("https://rovyncore.com/api/upload", { headers: { "X-Human-Verification": "proof-one" } });
    assert.equal(first.status, 200, await first.text());
    const redirect = await mf.dispatchFetch("https://rovyncore.com/api/upload", { headers: { "X-Human-Verification": "proof-two" } });
    assert.equal(redirect.status, 503);
    assert.equal((await redirect.json()).code, "provider-http");
  } finally { await mf.dispose(); await fetchMock.close(); }
});
