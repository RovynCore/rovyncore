import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyHumanRequest,
  protectionStatus,
  HumanVerificationError,
} from "../lib/human-verification";
test("verification is fail-closed when enabled and checks hostname/action", async () => {
  const request = new Request("https://rovyncore.com/api/metadata", {
    headers: { "X-Human-Verification": "proof" },
  });
  const config = {
    mode: "required",
    siteKey: "public",
    secret: "private",
    hostnames: "rovyncore.com,rovyncore.net",
  };
  assert.deepEqual(protectionStatus(config), {
    enabled: true,
    siteKey: "public",
  });
  await verifyHumanRequest(request, "metadata", { mode: "off" });
  await assert.rejects(
    verifyHumanRequest(request, "metadata", { mode: "required" }),
  );
  await assert.rejects(
    verifyHumanRequest(new Request(request.url), "metadata", config),
  );
  const reply = (data: unknown) =>
    (async () => Response.json(data)) as typeof fetch;
  await verifyHumanRequest(
    request,
    "metadata",
    config,
    reply({ success: true, action: "metadata", hostname: "rovyncore.com" }),
  );
  await assert.rejects(
    verifyHumanRequest(
      request,
      "metadata",
      config,
      reply({ success: true, action: "report", hostname: "rovyncore.com" }),
    ),
  );
  await assert.rejects(
    verifyHumanRequest(
      request,
      "metadata",
      config,
      reply({
        success: true,
        action: "metadata",
        hostname: "attacker.example",
      }),
    ),
  );
  await assert.rejects(
    verifyHumanRequest(request, "metadata", config, reply({ success: false })),
  );
});
test("provider failures retain a safe diagnostic without exposing credentials", async () => {
  const config = {
    mode: "required",
    siteKey: "public",
    secret: "private-secret",
    hostnames: "rovyncore.com",
  };
  const request = new Request("https://rovyncore.com/api/upload", {
    headers: { "X-Human-Verification": "single-use-proof" },
  });
  for (const [code, status] of [
    ["invalid-input-secret", 503],
    ["timeout-or-duplicate", 403],
  ] as const) {
    await assert.rejects(
      verifyHumanRequest(request, "upload", config, (async () =>
        Response.json({
          success: false,
          "error-codes": [code],
        })) as typeof fetch),
      (error: unknown) => {
        assert.ok(error instanceof HumanVerificationError);
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.ok(!JSON.stringify(error).includes(config.secret));
        return true;
      },
    );
  }
  await verifyHumanRequest(request, "upload", config, (async (_url, init) => {
    assert.deepEqual(JSON.parse(init!.body as string), {
      secret: config.secret,
      response: "single-use-proof",
    });
    return Response.json({
      success: true,
      action: "upload",
      hostname: "rovyncore.com",
    });
  }) as typeof fetch);
  assert.equal(protectionStatus({ ...config, hostnames: "" }).siteKey, "");
});
