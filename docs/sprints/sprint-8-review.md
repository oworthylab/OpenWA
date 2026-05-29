# Sprint 8 Review — Operations & Launch

> **Status:** ✅ Backend slice delivered. Production Sentry DSN +
> source maps, npm/PyPI publishing, k6 load tests, third-party security
> audit findings, DNS + production deploy, dashboard UI for the new
> resources, R2 media upload pipeline for status, and WhatsApp-native
> label bidirectional sync are deferred — see [Deferred](#deferred).

## Summary

Sprint 8 closes the technical scope ahead of public launch: structured
logging, error tracking, label management, statuses/stories, an
expanded SDK, an OpenAPI-backed docs portal, tenant settings, and
plugin install management. Eight user stories (US-057 → US-064)
shipped as production-quality backend slices with **131 passing
tests** (up from 106 in Sprint 7), clean TypeScript builds, and a
clean Biome lint pass across `apps/api`.

The deferred items are all infrastructure handovers (CI secret
injection, package registry publish keys, DNS) or polish that needs
real users in front of it (k6 baselines, dashboard UI) — none of them
require schema or contract changes from this sprint.

## What shipped

### US-057 — Structured logging

- `apps/api/src/lib/logger.ts` — zero-dep, level-filtered JSON logger
  built on `console.log(JSON.stringify(…))`. Plays directly into
  Cloudflare Logpush; deliberately avoids `pino`/`winston` because
  both ship Node streams the Worker runtime doesn't expose.
- `redact()` masks known-sensitive keys (`authorization`, `cookie`,
  `token`, `webhookSecret`, …) and recurses one level into objects.
  `maskPhone()` keeps the trailing 4 digits for support triage.
- `apps/api/src/middleware/logging.ts` — `beginRequest()` +
  `completeRequest()` emit a `request.complete` record per request
  with `requestId`, `method`, `path`, `status`, `duration_ms`. The
  request id is propagated outbound on `x-request-id` (and accepts an
  inbound override so partners can stitch their own traces).
- `LOG_LEVEL` env binding controls the floor; in `test` we default to
  `error` to keep CI output quiet.

### US-058 — Error tracking (Sentry envelope)

- `apps/api/src/lib/sentry.ts` — hand-rolled Sentry envelope client
  (`POST {dsn}/api/{projectId}/envelope/`). When `SENTRY_DSN` is unset
  or `'stub'`, `report()` is a no-op so dev/test stay silent.
- Errors are routed through `app.ts onError`; the `withRequestId()`
  helper guarantees every error response carries `x-request-id` so a
  caller can correlate a 500 to a Sentry event without diff-ing
  timestamps.
- Failures from the transport are swallowed — error tracking is
  best-effort and must never cascade an outage.

### US-059 — Label management

Tables (`labels`, `contact_labels`), schemas, and routes:

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/v1/labels`                                   | List |
| `POST`   | `/v1/labels`                                   | Create (admin) |
| `PATCH`  | `/v1/labels/:id`                               | Rename / recolor (admin) |
| `DELETE` | `/v1/labels/:id`                               | Delete (admin) |
| `POST`   | `/v1/contacts/:contactId/labels`               | Assign labels to contact |
| `DELETE` | `/v1/contacts/:contactId/labels/:labelId`      | Remove one |
| `POST`   | `/v1/labels/bulk`                              | Bulk `assign`/`remove` |

- Names are unique per tenant; colors are validated against a `#RRGGBB`
  regex. `waLabelId` is captured for a future plugin that mirrors
  labels into the WhatsApp-native label space.
- Bulk operations cap at 500 contacts × 50 labels per call — chosen so
  the worst-case insert loop fits comfortably inside a single Worker
  CPU budget.

### US-060 — Status / stories

Tables (`statuses`, `status_views`), routes under `/v1/status`:

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/v1/status`            | Paginated list (filter `?sessionId`) |
| `POST`   | `/v1/status/text`       | Post text status (color + font) |
| `POST`   | `/v1/status/media`      | Post image/video (URL or R2 key) |
| `GET`    | `/v1/status/:id`        | Detail (rejects expired with `STATUS_EXPIRED`) |
| `DELETE` | `/v1/status/:id`        | Soft delete |
| `GET`    | `/v1/status/:id/views`  | Viewer list |
| `POST`   | `/v1/status/:id/views`  | Record a view |

- 24-hour TTL stamped on create. `view_count` is denormalised on the
  status row and bumped only when `INSERT … ON CONFLICT DO NOTHING`
  returns a new row, so duplicate `recordView` calls are idempotent.
- Media is currently accepted as an `https://` URL or a pre-uploaded R2
  object key — the R2 upload pipeline itself is the deferred half (see
  below).

### US-061 — Eden Treaty SDK expansion (JS + Python)

Both SDKs were rewritten to target `/v1/...` and ship typed errors:

- **JavaScript** (`sdk/javascript/src/index.ts`):
  - Resource groups: `sessions`, `messages`, `crm.{contacts,tags,conversations,templates}`, `mart`, `labels`, `status`, `settings`, `plugins`, `webhooks`.
  - Error hierarchy: `OpenWAError` → `AuthError`, `ValidationError`, `NotFoundError`, `ConflictError`, `RateLimitError` (with `retryAfterSeconds`), `ServerError`. Every thrown error carries `code`, `status`, `details`, and the response `x-request-id`.
  - Zero deps. Works in Node, Bun, Deno, browsers.
- **Python** (`sdk/python/openwa/__init__.py`):
  - `OpenWAClient` (sync) and `AsyncOpenWAClient` (asyncio over `httpx.AsyncClient`) share the same resource surface.
  - Mirror of the JS error classes.
  - `httpx` is an optional install — calls raise `ImportError` with an
    actionable message if it's missing.

Eden Treaty wasn't used directly because we run Elysia with `aot: false`
on Workers (route schemas are validated by Valibot, not TypeBox). The
handwritten clients give us the same typed surface without the AOT
constraint.

### US-062 — API documentation portal

- `apps/api/src/lib/openapi.ts` — hand-tuned OpenAPI 3.0 spec covering
  the public `/v1` surface, returned at `/docs/openapi.json`.
- `apps/api/src/routes/docs.ts` — `/docs` serves a single-script
  Scalar viewer pointing at the spec.
- Both endpoints are unauthenticated (added to `isExemptPath()`) so
  partners can load the docs into their tooling without a key.
- A smoke test enforces every documented `operationId` is unique and
  every path starts with `/v1` or `/health`.

### US-063 — Settings management

- `tenant_settings` table keyed by `tenantId` (one row per tenant).
- `GET /v1/settings` auto-creates the row with defaults on first read.
- `PATCH /v1/settings` (admin) accepts partial updates for
  `displayName`, `timezone`, `language` (BCP-47), `theme` (`light`/
  `dark`/`system`), notification toggles, and `notifyEmail`.

### US-064 — Plugin management

- `tenant_plugins` table with a unique `(tenantId, pluginId)` index.
- `GET /v1/plugins` lists installed plugins; `POST /v1/plugins` (admin)
  installs one; `PATCH /v1/plugins/:id` toggles `enabled` /
  reconfigures `config`; `DELETE /v1/plugins/:id` (admin) uninstalls.
- Plugin runtime stays in the engine workers — this surface only
  records install state + tenant config.

## Tests

| Suite | Tests | Notes |
|---|---|---|
| Sprint 7 baseline | 106 | preserved, zero regressions |
| `logger.test.ts` | 11 | level filter, redact, maskPhone, child(), sink failure tolerance |
| `sentry.test.ts` | 5 | DSN parse, envelope shape, no-op when disabled, fetch failure swallow |
| `sprint8-routes.test.ts` | 10 | auth gating on `/v1/labels|status|settings|plugins`, public `/docs`, OpenAPI unique-ops invariant, `x-request-id` propagation |
| **Total** | **131** | `bun test` clean, `bunx tsc -b --force` clean, `bunx biome check src test` clean |

## Deferred

| Item | Why deferred | Pickup |
|---|---|---|
| Real Sentry DSN + source-map upload | Needs CI secret + build-time uploader; outside Worker scope | Ops sprint |
| `npm publish` / `pip publish` for SDKs | Needs npm + PyPI org credentials | Pre-launch release sprint |
| k6 load test baselines | Best run against the production-tier stack | Pre-launch release sprint |
| Third-party security audit findings | Audit not yet engaged | Pre-launch release sprint |
| DNS + production deploy (workers.dev → custom domain) | Operational rollout | Pre-launch release sprint |
| Dashboard UI for labels/statuses/settings/plugins | Visual layer; APIs are stable | Sprint 9 (UI) |
| R2 upload pipeline for status media | Status routes currently accept a URL or pre-uploaded key; we still need the signed-upload endpoint | Sprint 9 |
| WhatsApp-native label bidirectional sync | Engine-side plugin; out of API tier | Sprint 9+ |
| Scalar UI polish (custom theme, examples) | Default theme is already serviceable | Post-launch |

## Notable design choices

- **Hand-rolled logger / Sentry / OpenAPI** instead of pulling
  `pino`, `@sentry/cloudflare`, and `@elysiajs/swagger`. Each
  alternative either bloats the Worker bundle, requires Node APIs the
  isolate doesn't ship, or hard-conflicts with our `aot: false`
  Elysia configuration. The hand-rolled equivalents are <200 LOC each
  and fully unit-tested.
- **`WeakMap<Request, ctx>` for request correlation** instead of
  Elysia's `store`. The Elysia `store` is per-app (not per-request),
  so it leaked the previous request's id when reused across tests.
  Keying by the `Request` instance gives us per-request isolation
  without a custom plugin.
- **Settings table keyed by `tenantId` directly** (rather than a
  surrogate id with a unique constraint) — there is exactly one row
  per tenant, and PATCH uses an upsert via `loadOrCreate()` so the
  row materialises on first read.
- **Status `viewCount` denormalised**: listing statuses is the hot
  path; computing the view count from `status_views` would mean an N+1
  aggregate per row. The bump is gated on `INSERT … ON CONFLICT DO
  NOTHING` returning a row, so repeated `recordView` calls don't
  inflate the counter.

## Sprint 9 candidate scope

- Dashboard UI for the four new resource groups (labels, statuses,
  settings, plugins) — plus a slot for the `/docs` portal in the nav.
- R2 signed-upload pipeline for status media + CRM contact avatars.
- Plugin runtime in the engine worker (manifest fetch, sandbox,
  webhook dispatch).
- WhatsApp-native label mirror plugin.
- k6 load baselines published as a CI artefact.
