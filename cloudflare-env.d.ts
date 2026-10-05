declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    LAUNCH_CONFIRMATION_DEPTH?: string;
    ASSET_STATE_FRESHNESS_SECONDS?: string;
    PUBLIC_API_RATE_LIMIT?: string;
  }
}
