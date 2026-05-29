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
