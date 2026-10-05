export type VerificationConfig = {
  mode?: string;
  siteKey?: string;
  secret?: string;
  hostnames?: string;
};
export class HumanVerificationError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function protectionStatus(config: VerificationConfig) {
  const enabled = config.mode === "required";
  return {
    enabled,
    siteKey:
      enabled && config.secret && config.hostnames ? config.siteKey || "" : "",
  };
}
export async function verifyHumanRequest(
  request: Request,
  action: string,
  config: VerificationConfig,
  fetcher: typeof fetch = fetch,
) {
  if (config.mode !== "required") return;
  if (!config.siteKey || !config.secret || !config.hostnames)
    throw new HumanVerificationError(
      "configuration",
      503,
      "Verification service unavailable",
    );
  const token = request.headers.get("X-Human-Verification");
  if (!token || token.length > 2048)
    throw new HumanVerificationError(
      "missing-proof",
      403,
      "Human verification required",
    );
  let response: Response;
  try {
    response = await fetcher(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: config.secret, response: token }),
        signal: AbortSignal.timeout(10000),
        // Workers rejects redirect:"error" before contacting Siteverify.
        // Return redirects untouched and reject all non-2xx responses below.
        redirect: "manual",
      },
    );
  } catch {
    throw new HumanVerificationError(
      "provider-network",
      503,
      "Verification service unavailable",
    );
  }
  if (!response.ok)
    throw new HumanVerificationError(
      "provider-http",
      503,
      "Verification service unavailable",
    );
  const result = (await response.json()) as {
    success?: boolean;
    action?: string;
    hostname?: string;
    "error-codes"?: string[];
  };
  if (!result.success) {
    const codes = (result["error-codes"] || []).filter((c) =>
      /^[a-z-]+$/.test(c),
    );
    const configuration = codes.some((c) =>
      [
        "missing-input-secret",
        "invalid-input-secret",
        "bad-request",
        "internal-error",
      ].includes(c),
    );
    throw new HumanVerificationError(
      codes.join(",") || "provider-rejected",
      configuration ? 503 : 403,
      configuration
        ? "Verification service unavailable"
        : "Human verification failed",
    );
  }
  const hosts = config.hostnames
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (result.action !== action)
    throw new HumanVerificationError(
      "action-mismatch",
      403,
      "Human verification failed",
    );
  if (!hosts.includes((result.hostname || "").toLowerCase()))
    throw new HumanVerificationError(
      "hostname-mismatch",
      403,
      "Human verification failed",
    );
}
