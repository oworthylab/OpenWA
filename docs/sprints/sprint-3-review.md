# Sprint 3 Review — Infrastructure Layer

> **Status:** ✅ Core delivered. WebSocket (US-020) deferred to Sprint 4 alongside dashboard work.
> **Branch:** `serverless`
> **Pipelines:** `bun run lint | typecheck | test | build` — **all green** (66 unit tests pass).

## Scope shipped

| Story | Title | State |
| --- | --- | --- |
| US-019 | Durable Object Session Host | ⚠️ Partial — extended in Sprint 2; protocol I/O still deferred to Sprint 4 |
| US-020 | Real-Time WebSocket | ⏳ Deferred to Sprint 4 (lands with dashboard) |
| US-021 | Session CRUD API | ✅ |
| US-022 | Session Lifecycle API | ✅ |
| US-023 | Message Send API (text + media) | ✅ wired end-to-end to the engine; live WA sending still requires Node engine until Sprint 4 |
| US-026 | API Key Authentication | ✅ |
| US-029 | Tenant Data Isolation | ✅ (tenant resolved from API key, all queries scoped) |
| US-030 | Webhook CRUD | ✅ |
| US-031 | Webhook Delivery with Retries | ✅ Queue consumer with HMAC + exponential backoff + DLQ |
| US-032 | Health Endpoints | ✅ `/health`, `/health/live`, `/health/ready` |

## What landed

### `apps/api/` — Elysia REST API on Cloudflare Workers

- **`src/index.ts`** — Worker entry exporting both `fetch` (Elysia app) and `queue` (webhook consumer).
- **`src/app.ts`** — Elysia 1.4 app factory; per-request closure-bound to `ApiEnv`. Centralised `onError` handler maps `ApiError` → standard error envelope.
- **`src/env.ts`** — `ApiEnv` bindings + `WebhookQueueMessage` type.
- **`src/errors.ts`** — `ApiError` class + `notFound`/`badRequest`/`validationFailed`/`conflict`/`unauthorized`/`forbidden`/`internal` helpers.
- **`src/middleware/auth.ts`** — `authenticate()` extracts `X-API-Key` / `Authorization: Bearer`, parses the `openwa_<prefix>_<secret>` format, looks up by SHA-256 hash via KV (5min TTL) → D1 fallback. Joins `tenants` and enforces status. Throws `ApiError` with `INVALID_API_KEY` / `EXPIRED_API_KEY` / `TENANT_INACTIVE` / `INSUFFICIENT_ROLE` codes.
- **`src/lib/crypto.ts`** — Web Crypto primitives: `sha256Hex`, `hmacSha256Hex`, `timingSafeEqualHex`, `newId` (UUIDv4), `generateApiKey`, `parseApiKeyPrefix`, `generateWebhookSecret`.
- **`src/lib/audit.ts`** — Best-effort writes to `audit_log` (failures swallowed so they never block the user response).
- **`src/lib/engine-client.ts`** — Thin client over the engine Worker's service binding (`env.ENGINE`). Methods: `status / start / stop / logout / qr / sendText / sendMedia / health`.
- **`src/routes/health.ts`** — Public liveness/readiness endpoints. `ready` returns 503 unless `CONTROL_PLANE_DB` and `AUTH_CACHE` both respond.
- **`src/routes/sessions.ts`** — Full CRUD + lifecycle + message send. Cross-tenant lookups return 404 (not 403) to avoid leaking existence. Audit entries for create/delete.
- **`src/routes/webhooks.ts`** — Full CRUD + `POST /:id/test` synthetic delivery. URL validator blocks `http://`, `localhost`, private RFC1918 ranges, and `.internal`. Secret returned exactly once at creation.
- **`src/webhook-consumer.ts`** — Cloudflare Queue consumer. Signs each delivery with HMAC-SHA256 (`X-OpenWA-Signature: sha256=<hex>`). Retries on 5xx/408/429 with delays `[1s, 5s, 30s, 120s]` up to 4 attempts; permanent 4xx are acked immediately. Updates `webhooks.lastDeliveryAt/Status/failureCount` after every attempt.
- **`wrangler.toml`** — Per-environment bindings declared (commented until IDs are provisioned): `CONTROL_PLANE_DB`, `AUTH_CACHE`, `WEBHOOK_QUEUE` (producer + consumer + DLQ), `ENGINE` (service binding).

### `packages/engine/src/adapters/cloudflare/durable-object.ts`

Extended the DO's `fetch` switch with `/logout`, `/qr`, `/messages/text`, `/messages/media`. The QR endpoint returns `{ qr: null }` until Sprint 4's Workers-native WA protocol lands; the message endpoints return a structured `501 NOT_IMPLEMENTED` so the API can pass the error straight through.

### Tests (18 new, 66 total)

- `apps/api/test/crypto.test.ts` — SHA-256 reference vector, HMAC determinism, timing-safe compare, API key roundtrip, webhook secret format, UUID format/uniqueness.
- `apps/api/test/errors.test.ts` — `ApiError` serialisation, status codes, default error codes.
- `apps/api/test/app.test.ts` — Health endpoints, ready-check degraded path, auth gating (`UNAUTHORIZED` vs `INVALID_API_KEY`).

## Deliberate cuts

- **WebSocket (US-020)** — no dashboard to drive it yet; queueing a real-time channel adds maintenance surface without a consumer. Lands in Sprint 4.
- **DO live WhatsApp protocol** — Baileys depends on `node:ws`; the Workers-native re-implementation is large enough to warrant its own slice (Sprint 4). The DO scaffolding, persistence, alarms, and RPC surface are all in place to receive it.
- **Per-tenant D1 dispatch (US-029)** — wired through the auth context (`tenantDbId` is resolved and threaded), but no per-tenant queries land in Sprint 3. Sprint 4 introduces message history endpoints that need it.
- **Audit log read API** — only writes are wired; the read endpoints land in Sprint 7.

## DoD verification

```bash
bun run lint        # ✅ 7/7 packages
bun run typecheck   # ✅ 11/11 tasks
bun run test        # ✅ 66 unit tests pass (24 engine + 18 api + 24 others)
bun run build       # ✅ wrangler dry-run succeeds for both Workers
```

End-to-end suites (`e2e/tests/01-health|02-auth|03-sessions|05-webhooks|10-audit`) require a deployed `wrangler dev` instance with D1/KV/Queue resources provisioned — those run after the staging bindings are filled in.

## Known follow-ups

- Provision Cloudflare D1 databases, KV namespaces, Queues + DLQs; replace `REPLACE_ME` in `apps/api/wrangler.toml`.
- Wire `ENGINE` service binding pointing at the `openwa-engine` Worker.
- Sprint 4: dashboard, WebSocket stream, Workers-native WhatsApp protocol inside the DO, real message sending from the Cloudflare deployment.
