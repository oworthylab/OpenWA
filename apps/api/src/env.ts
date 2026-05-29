/**
 * Worker bindings injected by `wrangler.toml`. All optional in dev mode so
 * the API boots and serves /health even when running with `wrangler dev`
 * before the staging resources exist.
 */

export interface ApiEnv {
  /** D1 binding for the control-plane database. */
  CONTROL_PLANE_DB?: D1Database;
  /** KV namespace caching {prefix → tenantId/keyId/role} for fast auth. */
  AUTH_CACHE?: KVNamespace;
  /** Producer binding for the webhook delivery queue. */
  WEBHOOK_QUEUE?: Queue<WebhookQueueMessage>;
  /** Service binding to the engine Worker (which hosts the session DOs). */
  ENGINE?: Fetcher;
  /** Optional override; defaults to `'production'`. */
  ENVIRONMENT?: string;
  /** Secret used to sign email-verification + password-reset tokens. */
  AUTH_TOKEN_SECRET?: string;
  /** Stripe secret key (`sk_test_...` or `sk_live_...`). When unset, the
   *  billing routes operate in stub mode for local/dev use. */
  STRIPE_SECRET?: string;
  /** Stripe webhook signing secret (`whsec_...`). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Minimum log level (`debug` | `info` | `warn` | `error`). */
  LOG_LEVEL?: string;
  /** Sentry DSN; when unset the reporter no-ops. */
  SENTRY_DSN?: string;
  /** Build sha / release tag for Sentry source-map matching. */
  SENTRY_RELEASE?: string;
  /**
   * Single-tenant self-host mode. When `'true'` (case-insensitive):
   *   - `/v1/auth/register` is disabled (returns 403)
   *   - On the first authenticated request, the worker auto-provisions
   *     a tenant + admin API key if neither exists yet
   *
   * Multi-tenant SaaS mode is the default (unset / `'false'`).
   */
  SELF_HOST_MODE?: string;
  /** Tenant id used by the auto-provisioned self-host tenant. Defaults to a stable slug-derived id. */
  SELF_HOST_TENANT_ID?: string;
  /** Display name for the self-host tenant. */
  SELF_HOST_TENANT_NAME?: string;
  /**
   * Pre-shared admin API key for self-host. When set the operator's
   * `X-API-Key` header is matched against this value during bootstrap
   * so they don't need to fish the generated key out of logs.
   *
   * Format MUST match `openwa_<8>_<32>` (see `lib/crypto.ts`).
   */
  SELF_HOST_ADMIN_API_KEY?: string;
  /** HMAC secret shared with @openwa/wa-bridge for /v1/internal/engine-events. */
  BRIDGE_WEBHOOK_SECRET?: string;
}

export interface WebhookQueueMessage {
  webhookId: string;
  tenantId: string;
  deliveryId: string;
  event: string;
  url: string;
  secret: string;
  body: string;
  /** Total attempts so far (1-indexed). */
  attempt: number;
}
