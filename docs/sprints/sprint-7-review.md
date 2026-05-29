# Sprint 7 Review — CRM & Mart Integration

> **Status:** ✅ Backend slice delivered. Dashboard UI, real Mart REST
> sync, queued cart-recovery delays, and outbound WhatsApp wiring for
> template sends deferred to Sprint 8.

## Summary

Sprint 7 shipped the **backend** for OpenWA's CRM and Mart commerce
integration — six user stories (US-051 through US-056) landed with
unit tests across template rendering, CSV import/export, and route
auth gating. The scope intentionally focuses on the durable data
model + signed-webhook ingest path so Sprint 8 can plug in real Mart
sandbox and dashboard UI without reshuffling tables.

## What shipped

### US-051 — Contact directory + CSV import/export

A new route group at `/v1/crm/contacts`:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/crm/contacts` | Paginated list (filter by `tag`, `search`) |
| `POST` | `/v1/crm/contacts` | Create a contact |
| `GET` | `/v1/crm/contacts/:id` | Detail with tag rollup |
| `PATCH` | `/v1/crm/contacts/:id` | Partial update |
| `DELETE` | `/v1/crm/contacts/:id` | Delete |
| `POST` | `/v1/crm/contacts/import` | Bulk CSV import |
| `GET` | `/v1/crm/contacts/export` | CSV download (`text/csv`) |
| `POST` | `/v1/crm/contacts/merge` | Dedup merge (source → target, admin) |

Implementation highlights:

- `apps/api/src/lib/csv.ts` — ~140 LOC RFC-4180-ish parser + writer
  with no dependencies. Handles quoted fields, escaped quotes, CRLF,
  BOM stripping. Hard cap at 200k cells per file.
- `sanitizeCell()` prefixes formula-injection candidates (`=`, `+`,
  `-`, `@`, TAB) with a single quote on every cell we write into
  user-downloaded CSV exports — defence against CVE-class spreadsheet
  payloads.
- Phone numbers validated against E.164; invalid rows are reported
  back to the caller (`{ imported, failed, errors[] }`) without
  blocking the whole batch.

### US-052 — Tags

- Per-tenant unique tag names, 6-digit hex color (defaults to
  GitHub-blue `#1f6feb`).
- Join table `crm_contact_tags` with composite primary key
  `(contact_id, tag_id)` — no duplicate assignments.
- `POST /v1/crm/contacts/:id/tags` validates every supplied tag id
  belongs to the caller's tenant before insert.

### US-053 — Mart integration (link / unlink / sync)

- `POST /v1/integrations/mart/link` (admin) verifies ownership via
  `verifyOwnership()` and stores `sha256(secret)` only — plaintext
  never persisted.
- `DELETE /v1/integrations/mart/link` flips status to `revoked` and
  records `revoked_at`. Re-linking the same store reuses the row.
- `POST /v1/integrations/mart/sync` is a stub that bumps
  `last_sync_at`; live REST sync is in Sprint 8.
- `apps/api/src/lib/mart-client.ts` — runs in **stub mode** when
  `ENVIRONMENT` is `test` or `development` so dev flows don't need
  a Mart sandbox.

### US-054 — Conversations + message templates

- `conversations` table per `(tenant_id, contact_id)` with status
  enum `open|pending|resolved|closed` and optional assignee. Status
  transitions out of `closed` require the `admin` role.
- `message_templates` table — name unique per tenant, body up to
  4 KB, `variables` column auto-derived from `{{...}}` placeholders
  on every write.
- `apps/api/src/lib/template.ts` — placeholder substitution with
  HTML escaping, NUL/control-char stripping, 1 KB per-value cap,
  and an explicit `TemplateRenderError` carrying the list of
  missing required variables. No external deps.
- `POST /v1/crm/templates/:id/render` returns the rendered preview
  (no outbound send — engine wiring deferred).

### US-055 — Abandoned cart capture

- `abandoned_carts` table indexed `(tenant_id, cart_id)` unique.
- Inbound `cart.abandoned` webhook records the cart and renders any
  template named `cart.abandoned` for observability (actual outbound
  delay-then-send queue worker is Sprint 8).
- `cart.recovered` webhook stamps `recovered_at` so dashboards can
  report a recovery rate.

### US-056 — Signed inbound webhooks from Mart

- `POST /v1/integrations/mart/webhooks` accepts unauthenticated
  requests but requires the `X-Mart-Secret` header. We sha256 the
  inbound secret and constant-time compare against every active
  integration's stored hash. A mismatch returns 403
  `MART_SIGNATURE_INVALID`.
- Idempotency via KV — `mart:event:<tenantId>:<eventId>` with 24-hour
  TTL — replayed events return `{ deduped: true }` without re-running
  side effects.
- Envelope validated by `MartWebhookEnvelopeSchema` (id, type
  picklist of 7 events, unix-seconds timestamp, `data` record).
  Unknown types are dropped silently rather than 400'd so Mart can
  add events without breaking our ingest.

## What didn't ship (deferred to Sprint 8)

| Item | Reason |
|---|---|
| Dashboard UI for CRM contacts, tags, conversations, templates | Out of scope for Sprint 7 backend slice; design hand-off pending |
| Live Mart REST sync (`POST /sync` is a stub) | Requires Mart sandbox credentials & contract sign-off |
| Outbound WhatsApp send for template renders + cart reminders | Requires engine-side outbound bridge work that wasn't budgeted |
| Cloudflare Queue with `delaySeconds` for cart reminders | Will fold in once the engine outbound bridge lands |
| Conversation auto-creation on inbound message | Needs engine→API inbound webhook plumbing |
| Per-tenant signing secret separate from `secretHash` | Single secret today; will split when key rotation lands |

## Open risks

1. **Webhook secret reuse for inbound auth.** We currently use the
   same shared secret for both link verification *and* inbound
   signing. A leak of either rotates both. Sprint 8 will introduce
   a derived signing secret so rotations are independent.
2. **Webhook tenant lookup is O(active integrations).** Acceptable
   while tenant count is small (we have ~0 today); switch to a
   `kv:mart-secret-index:<hash>` reverse lookup before we cross 1k
   active integrations.
3. **CSV import is single-request.** A 5 MB cap keeps memory
   bounded but blocks really large migrations — large customers
   should use the API in batches. Streaming import lives on the
   Sprint 9 backlog.

## Pipeline status

- ✅ `bunx tsc -b --force` — 0 errors across the workspace.
- ✅ `apps/api` Biome check (src + test) — clean.
- ✅ `packages/{db,validators,shared}` Biome check — clean (the
  pre-existing `@openwa/shared` desktop-bridge lint warnings are
  baseline noise not introduced by Sprint 7).
- ✅ `bun test` — 106 tests pass (30 new across template, csv, crm,
  mart suites).

## Files

### Added

- `apps/api/src/lib/csv.ts`
- `apps/api/src/lib/mart-client.ts`
- `apps/api/src/lib/template.ts`
- `apps/api/src/routes/crm.ts`
- `apps/api/src/routes/mart.ts`
- `apps/api/test/crm.test.ts`
- `apps/api/test/csv.test.ts`
- `apps/api/test/mart.test.ts`
- `apps/api/test/template.test.ts`
- `packages/validators/src/crm.ts`
- `packages/validators/src/mart.ts`
- `docs/sprints/sprint-7-review.md`

### Modified

- `apps/api/src/app.ts` — wires `crmRoutes` + `martRoutes`.
- `packages/db/src/schema/control-plane.ts` — 7 new tables
  (`crm_contacts`, `crm_tags`, `crm_contact_tags`, `conversations`,
  `message_templates`, `mart_integrations`, `abandoned_carts`)
  plus relations and inferred types.
- `packages/shared/src/errors/index.ts` — 10 new error codes for
  CRM and Mart domains.
- `packages/validators/src/index.ts` — re-export `crm` + `mart`.
- `packages/validators/package.json` — `./crm` + `./mart` subpath
  exports.
