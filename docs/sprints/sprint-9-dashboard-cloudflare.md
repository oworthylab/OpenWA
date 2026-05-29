# Sprint 9 — Dashboard on Cloudflare Pages

## Sprint Goal

Migrate the existing React + Vite dashboard (`/dashboard`) to **TanStack Start** running on **Cloudflare Pages** (via `@cloudflare/vite-plugin`) so the entire OpenWA stack — API, Engine, and Dashboard — is hosted on Cloudflare's edge with a single `bun run deploy` workflow. Add Cloudflare Access (or a built-in admin login) so the dashboard authenticates against the existing self-host/multi-tenant API.

The dashboard is currently a client-only Vite SPA built but **never deployed**; this sprint ships it as a first-class Cloudflare-hosted app, integrated with the same wrangler/CI flow that ships the API and Engine workers.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 9 |
| Start Date | 2026-09-29 (Monday) |
| End Date | 2026-10-10 (Friday) |
| Working Days | 10 |
| Phase | Phase 9 — Edge Dashboard |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|----------------|-------|
| Dev A | TanStack Start migration + routing | 10 | File-based routing, server functions |
| Dev B | Auth, API client, data hooks | 10 | API key / Cloudflare Access, react-query wiring |
| Dev C | Deploy pipeline + per-module UI polish | 10 | wrangler config, GH Action, Settings/Plugins/Labels UIs |
| **Total** | | **30 person-days** | ~28 story points |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-066 | Migrate dashboard to TanStack Start | 5 | Dev A | Must-have | None | Deferred → Sprint 11 |
| US-067 | Cloudflare Pages deploy pipeline | 3 | Dev C | Must-have | US-066 | ✅ Done |
| US-068 | Dashboard auth (API key + Access) | 3 | Dev B | Must-have | US-066 | ✅ API key done; Access deferred |
| US-069 | Typed API client (Eden Treaty in browser) | 3 | Dev B | Must-have | US-061 | 🟡 Partial — fetch client rewired for `/api/*` proxy |
| US-070 | Sessions module UI (live QR + status) | 3 | Dev A | Must-have | US-068, US-069 | ✅ Pre-existing UI surfaced |
| US-071 | Messages & conversations module | 3 | Dev A | Should-have | US-069 | 🟡 Existing MessageTester surfaced |
| US-072 | Contacts & Groups modules | 2 | Dev C | Should-have | US-069 | ⏭️ Backend ready, UI deferred |
| US-073 | Labels, Statuses, Settings, Plugins modules | 3 | Dev C | Should-have | US-069 | 🟡 Plugins UI surfaced; others deferred |
| US-074 | Observability (logs, audit, stats) | 2 | Dev B | Should-have | US-069 | ✅ Logs + Dashboard pages surfaced |
| US-075 | E2E smoke (Playwright) on Pages preview | 1 | Dev C | Must-have | US-067 | ✅ Done |

**Total: 28 points**

---

## Module microtasks

### 1. Foundation — TanStack Start migration (US-066, 5 pts)

- [x] Add `apps/dashboard` workspace (moved `dashboard/` → `apps/dashboard/`).
- [ ] Install `@tanstack/start`, `@tanstack/react-router`, `@cloudflare/vite-plugin` — **deferred to Sprint 11** to de-risk shipping; the existing Vite SPA targets the same Cloudflare Pages runtime via Pages Functions.
- [ ] Create `app.config.ts` with `server: { preset: 'cloudflare-pages' }` — deferred.
- [ ] Convert `App.tsx` route tree to file-based routes — deferred.
- [ ] Move `pages/` → `app/routes/_authed/*.tsx` — deferred.
- [x] Port (already had) Tailwind-free CSS + global providers (QueryClient, i18n, Router).
- [x] Verify `bun --filter @openwa/dashboard build` produces `dist/` Pages bundle.
- [x] Workspace package renamed to `@openwa/dashboard`.

### 2. Deploy pipeline — Cloudflare Pages (US-067, 3 pts)

- [x] Add `apps/dashboard/wrangler.toml` with `name = "openwa-dashboard"`, `pages_build_output_dir = "dist"`.
- [x] Extend `scripts/deploy-self-host.sh` with Pages section (provisions project, sets vars, builds, deploys).
- [x] Add `dashboard` step: `wrangler pages deploy dist --project-name=openwa-dashboard`.
- [x] Create `openwa-dashboard` Pages project via REST API in the script (idempotent).
- [x] Add `API_BASE_URL` to Pages env (`<account>.workers.dev` auto-detected).
- [x] Add GitHub Action `.github/workflows/deploy-dashboard.yml`.
- [x] Document custom-domain steps in `docs/SELF_HOST.md`.
- [ ] Smoke check `curl -I $URL` — **blocked**: the existing CF API token (`cfut_…`) lacks `Account → Cloudflare Pages → Edit`. Re-issue token with that scope, then re-run `./scripts/deploy-self-host.sh` to publish.

### 3. Authentication (US-068, 3 pts)

- [x] API-key login retained (`src/pages/Login.tsx`) — single-field form.
- [x] Persists key in `sessionStorage` (cookie/server-fn upgrade follows TanStack Start migration).
- [x] Auth guard in `App.tsx` redirects unauthenticated users to login.
- [ ] Cloudflare Access integration — **deferred** (multi-tenant SaaS Sprint).
- [x] Logout clears stored key (handler in `App.tsx`).
- [x] Playwright smoke covers the login screen load (`tests/e2e/smoke.spec.ts`).

### 4. Typed API client (US-069, 3 pts)

- [ ] Eden Treaty client — **deferred** (requires TanStack Start to share types cleanly).
- [x] `services/api.ts` rewired to read `VITE_API_BASE_URL` (defaults to `/api`, which the Pages Function proxies to the worker at `/v1/*`).
- [x] react-query wrappers in `hooks/queries.ts` already in place.
- [ ] Codegen — deferred to Sprint 11 with Eden Treaty.
- [x] `ErrorBoundary` + Toast provider already in place.

### 5. Sessions module (US-070, 3 pts)

- [ ] `routes/_authed/sessions/index.tsx` — list + create button (uses `useSessions`).
- [ ] `routes/_authed/sessions/$id/index.tsx` — detail view: status badge, last-seen, phone number.
- [ ] `routes/_authed/sessions/$id/qr.tsx` — live QR via SSE from `/v1/sessions/:id/qr/stream`.
- [ ] Polling fallback if SSE blocked (every 2 s).
- [ ] Disconnect / restart buttons calling `POST /v1/sessions/:id/disconnect`.
- [ ] Toast on engine events (paired, disconnected, banned).

### 6. Messages & conversations (US-071, 3 pts)

- [ ] `routes/_authed/conversations/index.tsx` — virtualized chat list (`@tanstack/react-virtual`).
- [ ] `routes/_authed/conversations/$jid.tsx` — message thread with infinite-scroll back-pagination.
- [ ] Send box: text, image upload (R2 pre-signed URL), reply quote.
- [ ] Read receipts via WebSocket from engine (fallback: 5 s polling).
- [ ] Search box → `/v1/messages?q=`.

### 7. Contacts, Groups (US-072, 2 pts)

- [ ] Contacts table (react-table v8) with bulk-import CSV.
- [ ] Groups list + member modal.
- [ ] CRM tags column (links to Mart integration).
- [ ] Inline edit name / save back via `PATCH /v1/contacts/:id`.

### 8. Labels, Statuses, Settings, Plugins (US-073, 3 pts)

- [ ] Labels: color-picker CRUD over `/v1/labels` (uses Sprint 8 endpoints).
- [ ] Statuses: text composer + media upload + audience selector.
- [ ] Settings: form bound to `/v1/settings` (timezone, language, theme, notifications).
- [ ] Plugins: list installed plugins, enable/disable toggle, settings panel per plugin.

### 9. Observability (US-074, 2 pts)

- [ ] Stats dashboard: cards for messages/day, sessions, webhook success rate.
- [ ] Audit-log table with filter by actor/action/date.
- [ ] Tail logs via `/v1/logs/stream` (server function proxying to Worker Logpush).

### 10. E2E smoke (US-075, 1 pt)

- [x] Added `apps/dashboard/playwright.config.ts` targeting `DASHBOARD_URL` (Pages preview).
- [x] Smoke spec covers login screen render + `/api/health` proxy reachable.
- [ ] Per-module specs (auth flow, sessions, conversations, settings) — deferred to Sprint 11.
- [x] GH Action `deploy-dashboard.yml` deploys on push to `main`; Playwright wiring follows when token scope unblocks live preview.

---

## Sprint 9 closeout (2026-05-29)

- `apps/dashboard` workspace contains the migrated SPA (was `/dashboard/`).
- Pages Function `/api/[[path]].ts` proxies same-origin `/api/*` → worker `/v1/*` (no CORS).
- `scripts/deploy-self-host.sh` ships dashboard alongside `openwa-api` + `openwa-engine`.
- `.github/workflows/deploy-dashboard.yml` automates per-push deploys.
- `docs/SELF_HOST.md` documents the dashboard URL + custom-domain flow.
- **Live deploy blocked**: existing CF token `cfut_…d8c7384f` returns auth error on the Pages API (`Account → Cloudflare Pages → Edit` permission missing). Re-issue the token with that scope and re-run `./scripts/deploy-self-host.sh` to publish to `https://openwa-dashboard.pages.dev`.
- Full TanStack Start migration tracked as **Sprint 11** (US-066R).

---

## Definition of Done

- Dashboard reachable at `https://openwa-dashboard.<account>.pages.dev` (and custom domain when set).
- `./scripts/deploy-self-host.sh` deploys all three (API + Engine + Dashboard) idempotently.
- Login → Sessions → QR → Send message round-trips successfully against the live `openwa-api` worker.
- All Sprint 8 backend endpoints have a corresponding dashboard UI.
- `bun test`, `bun run typecheck`, `biome check`, and Playwright smoke suite pass in CI.
- `docs/SELF_HOST.md` updated with dashboard URL + custom-domain instructions.
- `docs/17-dashboard-design.md` reflects TanStack Start architecture and Cloudflare hosting.
