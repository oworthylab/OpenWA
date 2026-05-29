# Sprint 4 Review — Dashboard & Surface Hardening

> **Status:** ✅ Backend slice delivered. Dashboard UI work deferred to Sprint 5 pending a live staging deploy to validate against.
> **Branch:** `serverless`
> **Pipelines:** `bun run lint | typecheck | test | build` — **all green** (38 API unit tests pass; 66 across the workspace).

## Scope shipped

| Story | Title | State |
| --- | --- | --- |
| US-024 | Contact Endpoints | ✅ Routes + validators + engine client; engine returns 501 until Workers-native WA protocol lands |
| US-025 | Group Endpoints | ✅ Routes + validators + engine client; engine returns 501 (same caveat) |
| US-028 | Rate Limiting | ✅ KV-backed per-second per `{tenantId, keyId}` sliding window; plan-based limits; `X-RateLimit-*` headers; 429 + `Retry-After` |
| US-033 | Audit Logging (query) | ✅ `GET /v1/audit` paginated, filterable by action / resourceType / resourceId / dateRange. Audit *writes* shipped in Sprint 3. |
| US-034..042 | Dashboard pages | ⏳ Deferred to Sprint 5 — see *Deferred & rationale* below. |

## What landed

### `apps/api/` — Elysia REST API

- **`src/middleware/rate-limit.ts`** *(new)* — `checkRateLimit(env, auth)` enforces per-tenant+key per-second budgets. Plans → `free=10 / pro=50 / business=200 / enterprise=1000` req/s (`PLAN_LIMITS`). Plan resolution is cached in KV for 60s (`rl:plan:<tenantId>`). Counter bucket uses key `rl:<tenantId>:<keyId>:<unixSecond>` with TTL 2s. KV lacks atomic increments, so the algorithm reads-modifies-writes — it can briefly under-count during bursts but never over-counts. Fails *open* when `AUTH_CACHE` is unbound (dev). `isExemptPath('/health/*')` short-circuits the hook.
- **`src/app.ts`** — Mounted contacts/groups/audit routes and added a global `onBeforeHandle` that calls `authenticate()` + `checkRateLimit()` for non-exempt requests carrying an API key. `onError` now surfaces `Retry-After` and `X-RateLimit-*` headers on 429.
- **`src/routes/contacts.ts`** *(new)* — `GET /v1/sessions/:id/contacts` (paginated), `GET /v1/sessions/:id/contacts/:jid`, `POST /v1/sessions/:id/contacts/check` (bulk phone-on-WA, max 50), `GET /v1/sessions/:id/contacts/:jid/photo`, `POST /v1/sessions/:id/contacts/block`, `POST /v1/sessions/:id/contacts/unblock`. Cross-tenant session lookups return 404 (consistent with Sprint 3).
- **`src/routes/groups.ts`** *(new)* — `GET / POST /v1/sessions/:id/groups`, `GET / PATCH /v1/sessions/:id/groups/:jid`, `POST /v1/sessions/:id/groups/:jid/participants` (add/remove/promote/demote), `GET / DELETE /v1/sessions/:id/groups/:jid/invite` (fetch + revoke+rotate).
- **`src/routes/audit.ts`** *(new)* — `GET /v1/audit?page=&pageSize=&action=&resourceType=&resourceId=&from=&to=`. Scoped via `auth.tenantId`; orders by `createdAt DESC`. Page size clamped to `[1, 100]` (default 25).
- **`src/lib/engine-client.ts`** — Added `listContacts`, `getContact`, `checkContacts`, `getContactPhoto`, `blockContact`, `unblockContact`, `listGroups`, `getGroup`, `createGroup`, `updateGroup`, `groupParticipants`, `groupInviteLink`, `groupRevokeInvite`.

### `packages/validators/`

- **`src/contact.ts`** *(new)* — `CheckContactsSchema` (1-50 E.164 phones), `BlockContactSchema` (JID), `ContactQuerySchema` (page/pageSize/search).
- **`src/group.ts`** *(new)* — `GroupJidSchema`, `CreateGroupSchema` (subject + 1-256 participants by JID or E.164), `UpdateGroupSchema`, `GroupParticipantActionSchema` (`add | remove | promote | demote`).
- **`src/index.ts`** + **`package.json`** — Exports wired for subpath imports.

### `packages/engine/src/adapters/cloudflare/durable-object.ts`

- `/contacts*` and `/groups*` paths return a structured `501 NOT_IMPLEMENTED` so the API layer surfaces a deterministic error until the Workers-native WA protocol lands (still tracked as Sprint 5+ work). All other behaviour unchanged.

### Tests

- **`apps/api/test/rate-limit.test.ts`** *(new)* — 10 tests covering: exempt-path detection, plan-tier ordering, plan resolution (default + cached), counter increments, 429 emission, per-key bucket isolation, KV-less fail-open behaviour, header formatting.
- **`apps/api/test/validators.test.ts`** *(new)* — 10 tests covering happy + reject paths for all six new schemas.

Total: **38 unit tests pass** in `@openwa/api` (up from 18 in Sprint 3).

## Deferred & rationale

| Story | Reason |
| --- | --- |
| US-020 (real-time WebSocket) | Still deferred — pairs naturally with the dashboard slice in Sprint 5 once a UI consumer exists. |
| US-034 Dashboard Auth (better-auth + OAuth) | Scaffolding TanStack Start + better-auth without a live API host to authenticate against would force throwaway mocks. Deferring until we have a deployed staging Worker to point the dev server at. |
| US-035 Layout, US-036 Overview, US-037 Sessions UI, US-038 Webhooks UI, US-039 API Keys UI, US-040 Audit Viewer, US-041 Message Tester, US-042 Infra Status | All depend on US-034 and a deployed backend. Building them blind would risk re-work once the auth layer is finalised. |
| Engine-side contacts/groups implementation | Requires the Workers-native WA protocol port (tracked separately). The API surface, validators, and DO routes are in place so wiring is a swap of the `default` branch in the DO. |

## Stack additions

- New API middleware: `apps/api/src/middleware/rate-limit.ts`
- New API routes: `contacts`, `groups`, `audit`
- New validator modules: `@openwa/validators/contact`, `@openwa/validators/group`
- Engine DO 501-stubs for `/contacts*` and `/groups*` (signalled via `ENGINE_ERROR_CODES.NOT_IMPLEMENTED`)

## Pipeline summary

```text
$ bunx turbo run typecheck   # 11/11 successful
$ bunx turbo run lint        # 1/1 successful (apps/api)
$ bunx turbo run test        # 38 pass / 0 fail (apps/api)
$ bunx turbo run build       # 4/4 successful (api dry-run upload 1192 KiB / 212 KiB gz)
```

## Next sprint hand-off

1. Provision staging Cloudflare resources (D1, KV namespaces, Queues, Engine Worker) and wire `wrangler.toml` bindings.
2. Stand up `apps/dashboard` with TanStack Start + `@cloudflare/vite-plugin`. Wire better-auth to the live API.
3. Resume US-020 real-time WebSocket alongside the dashboard's session UI.
4. Begin the Workers-native WA protocol port so contact/group endpoints stop returning 501.
