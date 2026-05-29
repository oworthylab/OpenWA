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
| US-066 | Migrate dashboard to TanStack Start | 5 | Dev A | Must-have | None | — |
| US-067 | Cloudflare Pages deploy pipeline | 3 | Dev C | Must-have | US-066 | — |
| US-068 | Dashboard auth (API key + Access) | 3 | Dev B | Must-have | US-066 | — |
| US-069 | Typed API client (Eden Treaty in browser) | 3 | Dev B | Must-have | US-061 | — |
| US-070 | Sessions module UI (live QR + status) | 3 | Dev A | Must-have | US-068, US-069 | — |
| US-071 | Messages & conversations module | 3 | Dev A | Should-have | US-069 | — |
| US-072 | Contacts & Groups modules | 2 | Dev C | Should-have | US-069 | — |
| US-073 | Labels, Statuses, Settings, Plugins modules | 3 | Dev C | Should-have | US-069 | — |
| US-074 | Observability (logs, audit, stats) | 2 | Dev B | Should-have | US-069 | — |
| US-075 | E2E smoke (Playwright) on Pages preview | 1 | Dev C | Must-have | US-067 | — |

**Total: 28 points**

---

## Module microtasks

### 1. Foundation — TanStack Start migration (US-066, 5 pts)

- [ ] Add `apps/dashboard` workspace (move `dashboard/` → `apps/dashboard/`).
- [ ] Install `@tanstack/start`, `@tanstack/react-router`, `@cloudflare/vite-plugin`.
- [ ] Create `app.config.ts` with `server: { preset: 'cloudflare-pages' }`.
- [ ] Convert `App.tsx` route tree to file-based routes under `app/routes/`.
- [ ] Move `pages/` → `app/routes/_authed/*.tsx`; add `__root.tsx`.
- [ ] Port Tailwind (or current CSS) + global providers (QueryClient, i18n, Router).
- [ ] Verify `bun run --filter dashboard build` produces `.output/` Pages bundle.
- [ ] Update `tsconfig` to extend repo `tsconfig.base.json`; fix path aliases.

### 2. Deploy pipeline — Cloudflare Pages (US-067, 3 pts)

- [ ] Add `apps/dashboard/wrangler.toml` with `name = "openwa-dashboard"`, `pages_build_output_dir = ".output/public"`.
- [ ] Extend `scripts/deploy-self-host.sh` with `--component dashboard|api|engine|all` (default all).
- [ ] Add `dashboard` step: `npx wrangler@4 pages deploy .output/public --project-name=openwa-dashboard`.
- [ ] Create `openwa-dashboard` Pages project via REST API in the script (idempotent).
- [ ] Add `[env.self-host.vars]` with `API_BASE_URL = "https://openwa-api.<sub>.workers.dev"`.
- [ ] Add GitHub Action `.github/workflows/deploy-dashboard.yml` (on push to main, build + `wrangler pages deploy`).
- [ ] Document custom-domain steps in `docs/SELF_HOST.md` (`dashboard.example.com` CNAME).
- [ ] Smoke check: `curl -I $URL` returns 200 with `cf-cache-status` header.

### 3. Authentication (US-068, 3 pts)

- [ ] Add `app/routes/login.tsx` with API-key paste form (single field) — for self-host.
- [ ] Persist key in `httpOnly` cookie via TanStack server function `setApiKey`.
- [ ] Add `beforeLoad` guard in `_authed/__layout.tsx` that redirects to `/login` when cookie missing.
- [ ] For multi-tenant mode, integrate Cloudflare Access (read `Cf-Access-Jwt-Assertion`, resolve user via `/v1/auth/me`).
- [ ] Add `/logout` server function clearing the cookie.
- [ ] Cover with one Playwright spec (`auth.spec.ts`).

### 4. Typed API client (US-069, 3 pts)

- [ ] Publish `@openwa/sdk-js` from Sprint 8 to a workspace dep, re-export `treaty<App>` from `apps/dashboard/src/lib/api.ts`.
- [ ] Create `useApi()` hook that returns the treaty client bound to the current API key.
- [ ] Wrap react-query: `useSessions()`, `useMessages()`, `useContacts()`, etc.
- [ ] Generate types in `bun run codegen` step (CI fails if API types drift).
- [ ] Add error boundary translating `ApiError` codes to localized toasts.

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

- [ ] Add `apps/dashboard/playwright.config.ts` targeting Pages preview URL from CI.
- [ ] One spec per module: auth → sessions → conversations → settings.
- [ ] Wire into GH Action: deploy preview → run Playwright → comment on PR.

---

## Definition of Done

- Dashboard reachable at `https://openwa-dashboard.<account>.pages.dev` (and custom domain when set).
- `./scripts/deploy-self-host.sh` deploys all three (API + Engine + Dashboard) idempotently.
- Login → Sessions → QR → Send message round-trips successfully against the live `openwa-api` worker.
- All Sprint 8 backend endpoints have a corresponding dashboard UI.
- `bun test`, `bun run typecheck`, `biome check`, and Playwright smoke suite pass in CI.
- `docs/SELF_HOST.md` updated with dashboard URL + custom-domain instructions.
- `docs/17-dashboard-design.md` reflects TanStack Start architecture and Cloudflare hosting.
