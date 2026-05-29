# Sprint 4 — Dashboard

## 1. Sprint Goal

Deliver a fully functional dashboard with authentication, session management UI, webhook/API key management, audit log viewer, message tester, and infrastructure status page — enabling users to manage their WhatsApp sessions without direct API calls.

## 2. Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint | 4 |
| Start Date | 2026-07-20 (Monday) |
| End Date | 2026-07-31 (Friday) |
| Duration | 2 weeks (10 working days) |
| Phase | Phase 4, Week 7-9 of overall timeline |

## 3. Capacity

| Team Member | Role | Available Days | Capacity (pts) | Focus |
|-------------|------|---------------|----------------|-------|
| Dev A | Senior Full-Stack | 10 | ~10 | Auth integration, complex UI logic |
| Dev B | Backend/Infra | 5 (partial) | ~5 | API support, bug fixes from Sprint 3 |
| Dev C | Frontend (Lead) | 10 | ~16 | All dashboard pages, Playwright tests |
| **Total** | | **25 days** | **~31 pts** | |

> Dev B is partially allocated to Sprint 3b spillover and production hardening.

## 4. Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Target Days |
|----------|-------|--------|----------|----------|--------------|-------------|
| US-034 | Dashboard Authentication | 5 | Dev A | P0 | Backend auth API | D1–D3 |
| US-035 | Dashboard Layout & Navigation | 3 | Dev C | P0 | None | D1–D2 |
| US-036 | Dashboard Overview Page | 3 | Dev C | P0 | US-035 | D3–D4 |
| US-037 | Session Management UI | 5 | Dev C | P0 | US-034, US-035 | D4–D6 |
| US-038 | Webhook Management UI | 3 | Dev C | P1 | US-035 | D6–D7 |
| US-039 | API Key Management UI | 3 | Dev C | P1 | US-035 | D7–D8 |
| US-040 | Audit Log Viewer | 3 | Dev A | P1 | US-035 | D7–D8 |
| US-041 | Message Tester | 3 | Dev C | P2 | US-037 | D8–D9 |
| US-042 | Infrastructure Status Page | 3 | Dev A | P2 | US-035 | D9 |

**Sprint 4 Total: 31 pts**

## 5. Day-by-Day Schedule

| Day | Dev A | Dev B | Dev C |
|-----|-------|-------|-------|
| D1 (Jul 20) | better-auth setup, login page integration | Sprint 3b spillover fixes | Layout shell: sidebar, header, router |
| D2 (Jul 21) | Register page, OAuth providers (Google, GitHub) | API CORS config for dashboard | Responsive layout, dark/light theme toggle |
| D3 (Jul 22) | Auth guards, session persistence, token refresh | Rate limit tuning (production) | Overview page: stats cards (sessions, messages) |
| D4 (Jul 23) | Auth e2e testing, role-based route guards | — (other project) | Overview: session list widget, recent activity |
| D5 (Jul 24) | Code review, assist Dev C on complex flows | — (other project) | Session UI: list view, status indicators |
| D6 (Jul 25) | WebSocket integration for live session status | Bug fixes as needed | Session UI: create, QR flow, start/stop/delete |
| D7 (Jul 27) | Audit Log Viewer: table, pagination, filters | — (other project) | Webhook UI: list, create, edit, delete, test |
| D8 (Jul 28) | Audit Log Viewer: date range, export | Bug fixes as needed | API Key UI: create, list (masked), revoke |
| D9 (Jul 29) | Infrastructure Status Page: health display | Production deploy prep | Message Tester: form, message type selector, send |
| D10 (Jul 30-31) | Playwright tests, final integration | Deploy validation | Playwright tests, visual QA, polish |

## 6. Technical Tasks

### US-034: Dashboard Authentication (5 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Install and configure better-auth client | 2h |
| 2 | Login page: email/password form with validation | 2h |
| 3 | Register page: form + email verification flow | 2h |
| 4 | OAuth integration: Google provider | 2h |
| 5 | OAuth integration: GitHub provider | 1.5h |
| 6 | Auth context provider (React context + TanStack Query) | 2h |
| 7 | Token refresh logic (silent refresh) | 1.5h |
| 8 | Protected route wrapper (redirect to login) | 1h |
| 9 | Logout flow | 0.5h |
| 10 | Playwright test: `01-login.spec.ts` | 2h |

### US-035: Dashboard Layout & Navigation (3 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | App shell: sidebar + main content area | 2h |
| 2 | Sidebar navigation items with icons (Lucide) | 1.5h |
| 3 | Responsive: collapsible sidebar on mobile | 2h |
| 4 | Dark/light mode toggle (CSS variables + localStorage) | 1.5h |
| 5 | Breadcrumb component | 1h |
| 6 | User avatar + dropdown menu in header | 1h |
| 7 | Playwright test: `02-navigation.spec.ts` | 1.5h |

### US-036: Dashboard Overview Page (3 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Stats cards: total sessions, active sessions, messages today, webhook deliveries | 2h |
| 2 | Session list widget (top 5, status badges) | 2h |
| 3 | Recent activity feed (last 10 events) | 1.5h |
| 4 | Auto-refresh with TanStack Query (30s interval) | 1h |
| 5 | Loading skeletons and empty states | 1h |
| 6 | Playwright test: `03-dashboard.spec.ts` | 1.5h |

### US-037: Session Management UI (5 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Session list page: table with search, filter by status | 2h |
| 2 | Create session dialog: name, config options | 2h |
| 3 | QR code display flow (polling + WebSocket for scan event) | 3h |
| 4 | Session detail view: status, uptime, config | 2h |
| 5 | Action buttons: start, stop, restart, delete (with confirmation) | 2h |
| 6 | Real-time status updates via WebSocket | 2h |
| 7 | Error handling: connection failures, timeouts | 1h |
| 8 | Playwright test: `04-sessions.spec.ts` | 2h |

### US-038: Webhook Management UI (3 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Webhook list: table with URL, events, status | 1.5h |
| 2 | Create/edit webhook dialog: URL, event selection, secret display | 2h |
| 3 | Delete webhook with confirmation | 0.5h |
| 4 | Test delivery button (fires test event) | 1.5h |
| 5 | Delivery history (last 10 attempts with status) | 2h |
| 6 | Playwright test: `05-webhooks.spec.ts` | 1.5h |

### US-039: API Key Management UI (3 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | API key list: table with name, prefix, created date, role | 1.5h |
| 2 | Create key dialog: name, role selection → show full key once | 2h |
| 3 | Copy-to-clipboard for new key | 0.5h |
| 4 | Revoke key with confirmation dialog | 1h |
| 5 | Playwright test: `06-api-keys.spec.ts` | 1.5h |

### US-040: Audit Log Viewer (3 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Paginated table: timestamp, actor, action, resource, details | 2h |
| 2 | Filters: action type, date range, actor | 2h |
| 3 | Detail drawer: full event payload | 1.5h |
| 4 | Export to CSV | 1h |
| 5 | Playwright test: `07-logs.spec.ts` | 1.5h |

### US-041: Message Tester (3 pts) — Dev C

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Session selector (dropdown) | 1h |
| 2 | Message type selector (text, image, document, etc.) | 1h |
| 3 | Dynamic form fields per message type | 2h |
| 4 | Send button + response display (success/error) | 1.5h |
| 5 | Message history (last 10 sent from tester) | 1.5h |
| 6 | Playwright test: `08-message-tester.spec.ts` | 1.5h |

### US-042: Infrastructure Status Page (3 pts) — Dev A

| # | Task | Est. Hours |
|---|------|-----------|
| 1 | Component health cards (API, D1, KV, R2, Queues) | 2h |
| 2 | Status indicators (healthy/degraded/down) with colors | 1h |
| 3 | Last-checked timestamp + manual refresh | 1h |
| 4 | Uptime percentage (24h, 7d, 30d) from health check history | 2h |
| 5 | Incident log (recent failures) | 1.5h |
| 6 | Playwright test: `09-infrastructure.spec.ts` | 1.5h |

## 7. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| better-auth OAuth configuration complexity | Medium | Medium | Dev A handles all auth; use well-documented providers only |
| QR code flow UX (polling vs WebSocket race condition) | Medium | High | Primary: WebSocket; fallback: 2s polling with timeout |
| Backend APIs not stable (Sprint 3b spillover) | Low | High | Dev B dedicated to fixing blockers; mock APIs for frontend dev |
| Dark mode CSS inconsistencies | Low | Low | Use CSS variables exclusively; Tailwind dark: variant |
| Playwright test flakiness (timing issues) | Medium | Medium | Use `waitForSelector`, proper test isolation, retry config |

## 8. Sprint Review Checklist

- [ ] Demo: Register → Login → Dashboard overview
- [ ] Demo: OAuth login (Google)
- [ ] Demo: Create session → scan QR → session active (real-time update)
- [ ] Demo: Stop/restart/delete session
- [ ] Demo: Create webhook → test delivery → view history
- [ ] Demo: Create API key → copy → revoke
- [ ] Demo: Audit log with filters and date range
- [ ] Demo: Send test message from Message Tester
- [ ] Demo: Infrastructure status page showing all components
- [ ] Demo: Dark/light mode toggle
- [ ] Demo: Mobile responsive layout
- [ ] Show: All Playwright tests passing

## 9. Definition of Done Verification

```bash
# Frontend unit tests
cd dashboard && pnpm test

# Type checking
cd dashboard && pnpm tsc --noEmit

# Lint
cd dashboard && pnpm lint

# Playwright e2e tests (full suite)
cd e2e-frontend && pnpm test

# Individual test files
npx playwright test tests/01-login.spec.ts
npx playwright test tests/02-navigation.spec.ts
npx playwright test tests/03-dashboard.spec.ts
npx playwright test tests/04-sessions.spec.ts
npx playwright test tests/05-webhooks.spec.ts
npx playwright test tests/06-api-keys.spec.ts
npx playwright test tests/07-logs.spec.ts
npx playwright test tests/08-message-tester.spec.ts
npx playwright test tests/09-infrastructure.spec.ts

# Visual regression (if configured)
npx playwright test --update-snapshots

# Build verification
cd dashboard && pnpm build

# Lighthouse accessibility audit
npx lighthouse http://localhost:5173 --only-categories=accessibility
```

## 10. e2e Test Coverage

| Test File | Stories Validated | Key Assertions |
|-----------|-----------------|----------------|
| `01-login.spec.ts` | US-034 | Login form, validation errors, successful auth, OAuth redirect, logout |
| `02-navigation.spec.ts` | US-035 | Sidebar links, responsive collapse, dark/light toggle, breadcrumbs |
| `03-dashboard.spec.ts` | US-036 | Stats cards render, session list displays, auto-refresh works |
| `04-sessions.spec.ts` | US-037 | Create session, QR display, start/stop/delete, status updates |
| `05-webhooks.spec.ts` | US-038 | CRUD operations, test delivery, delivery history |
| `06-api-keys.spec.ts` | US-039 | Create key (shown once), list (masked), revoke |
| `07-logs.spec.ts` | US-040 | Table renders, pagination, filters, date range, export |
| `08-message-tester.spec.ts` | US-041 | Session select, type select, form fields, send, response display |
| `09-infrastructure.spec.ts` | US-042 | Health cards, status indicators, refresh, uptime display |

---

## Cross-Sprint Dependencies

```
Sprint 3a ─── US-019 (DO) ──────┐
              US-026 (Auth) ─────┤
              US-032 (Health) ───┤
                                 ▼
Sprint 3b ─── US-023 (Messages) ─┐
              US-030/031 (Webhooks)│
              US-033 (Audit) ─────┤
                                  ▼
Sprint 4 ──── US-034 (Dashboard Auth) ← Backend auth API
              US-037 (Sessions UI) ← US-019, US-021, US-022
              US-038 (Webhooks UI) ← US-030
              US-039 (API Keys UI) ← US-027
              US-040 (Audit UI) ← US-033
              US-041 (Msg Tester) ← US-023
              US-042 (Infra Status) ← US-032
```

## Sprint 4 Exit Criteria

1. All 9 Playwright test files pass in CI
2. Dashboard builds with zero errors/warnings
3. Lighthouse accessibility score ≥ 90
4. All CRUD operations functional end-to-end
5. WebSocket real-time updates working
6. Mobile responsive (tested at 375px, 768px, 1440px)
7. No console errors in production build
