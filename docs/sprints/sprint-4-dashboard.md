# Sprint 4 — Dashboard

## Sprint Goal
Build the TanStack Start dashboard on Cloudflare Pages with server functions for direct D1/DO access. Deliver: authentication, layout, session management UI, webhook management, API key management, audit log viewer, message tester, and infrastructure status page.

## Sprint Duration & Dates
| Field | Value |
|-------|-------|
| Sprint # | 4 |
| Start Date | 2026-07-21 (Monday) |
| End Date | 2026-08-01 (Friday) |
| Working Days | 10 |
| Phase | Phase 4 — Dashboard |

## Capacity
3 devs × 10 days = 30 person-days (~30 story points)
Note: Dev C is now primary on dashboard work. Dev A continues API spillover (US-023 remaining media endpoints, US-024 contacts, US-025 groups, US-028 rate limiting). Dev B focuses on remaining infra (US-028 rate limiting, US-033 audit logging).

## Sprint Backlog
| Story ID | Title | Points | Assignee | Priority | Dependencies |
|----------|-------|--------|----------|----------|--------------|
| US-034 | Dashboard Authentication (Login/Register) | 5 | Dev C | Must-have | Sprint 3 auth |
| US-035 | Dashboard Layout & Navigation | 3 | Dev C | Must-have | US-034 |
| US-036 | Dashboard Overview Page | 3 | Dev C | Must-have | US-035 |
| US-037 | Session Management UI | 5 | Dev C | Must-have | US-035 |
| US-038 | Webhook Management UI | 3 | Dev C | Should-have | US-035 |
| US-039 | API Key Management UI | 3 | Dev C | Should-have | US-035 |
| US-040 | Audit Log Viewer | 3 | Dev C | Should-have | US-035 |
| US-041 | Message Tester | 3 | Dev C | Should-have | US-037 |
| US-042 | Infrastructure Status Page | 2 | Dev C | Could-have | US-035 |
| US-024 | Contact Endpoints (spillover) | 3 | Dev A | Must-have | Sprint 3 API |
| US-025 | Group Endpoints (spillover) | 5 | Dev A | Must-have | Sprint 3 API |
| US-028 | Rate Limiting | 3 | Dev B | Must-have | Sprint 3 auth |
| US-033 | Audit Logging | 3 | Dev B | Must-have | Sprint 3 DB |

Total: ~44 points (Dev C: 30pts dashboard, Dev A: 8pts API, Dev B: 6pts infra — balanced across team)

## Day-by-Day Schedule

### Week 1 (July 21–25)
| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D1 Mon** | US-024: Contact list endpoint, get by JID, phone check | US-028: KV sliding window implementation, per-plan config | US-034: TanStack Start scaffold, @cloudflare/vite-plugin, dev server |
| **D2 Tue** | US-024: Profile photo endpoint, block/unblock | US-028: Rate limit headers (X-RateLimit-*), 429 response with Retry-After | US-034: better-auth integration, login page, email/password form |
| **D3 Wed** | US-024: Validation, e2e tests for contacts | US-028: Health endpoint exemption, e2e tests | US-034: OAuth buttons (GitHub/Google), session cookie (httpOnly), redirect |
| **D4 Thu** | US-025: Group list, create, get info endpoints | US-033: Audit log middleware — intercept sensitive operations | US-035: Layout shell — sidebar, header, routing, responsive |
| **D5 Fri** | US-025: Participant management (add/remove/promote/demote) | US-033: Audit query endpoint (paginated, filterable), e2e tests | US-035: Dark/light toggle, mobile hamburger, active route highlight |

### Week 2 (July 28–August 1)
| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D6 Mon** | US-025: Invite links, group update, e2e tests | Sprint 4 support: fix integration issues, perf tuning | US-036: Dashboard overview — stats cards, session list, auto-refresh |
| **D7 Tue** | API spillover: remaining US-023 media endpoints if any | Sprint 4 support: WebSocket relay optimization | US-037: Session list page, create form, status indicators |
| **D8 Wed** | e2e test authoring: contacts, groups, messages | Code review, staging deploy verification | US-037: Session detail — QR display, start/stop/logout actions, WS updates |
| **D9 Thu** | e2e-frontend support: API mocking setup | Security review: auth flows, tenant isolation | US-038: Webhook management + US-039: API key management pages |
| **D10 Fri** | Sprint Review: API demo (contacts, groups, rate limiting) | Sprint Review: audit log, rate limit demo | US-040: Audit log viewer + US-041: Message tester + US-042: Infra status |

## Technical Tasks

### US-034: Dashboard Authentication (5 pts) — Dev C
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | TanStack Start project | 2h | Scaffold with `@cloudflare/vite-plugin`, TanStack Router, TanStack Query |
| 2 | better-auth setup | 3h | Email/password + GitHub/Google OAuth providers |
| 3 | Login page | 2h | Form with validation, error states, OAuth buttons |
| 4 | Server function: validateSession | 2h | Cookie-based auth, KV-cached validation |
| 5 | Route guard (beforeLoad) | 1h | Redirect unauthenticated to /login |
| 6 | Logout flow | 1h | Clear cookie, redirect to /login |

### US-035: Dashboard Layout (3 pts) — Dev C
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Root layout component | 2h | Sidebar + header + main content area |
| 2 | Sidebar navigation | 2h | Links to all pages, active state, collapse on mobile |
| 3 | Header | 1h | Tenant name, user menu (settings, logout) |
| 4 | Theme toggle | 1h | Dark/light mode with localStorage persistence |
| 5 | Responsive breakpoints | 1h | Mobile: hamburger menu, tablet: collapsed sidebar, desktop: full |

### US-037: Session Management UI (5 pts) — Dev C
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Session list page | 3h | Server function data loading, status badges, search/filter |
| 2 | Create session form | 2h | Modal with name + optional proxy URL, optimistic add |
| 3 | Session detail view | 3h | Full state info, action buttons (start/stop/logout/delete) |
| 4 | QR code display | 2h | Full-screen QR on start, auto-refresh, countdown timer |
| 5 | WebSocket integration | 3h | Connect to DO WS, update session state reactively |
| 6 | Delete confirmation | 1h | Dialog with session name confirmation |

### US-024: Contact Endpoints (3 pts) — Dev A
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | GET /sessions/:id/contacts | 2h | List with pagination, DO RPC call |
| 2 | GET /sessions/:id/contacts/:jid | 1h | Single contact detail |
| 3 | POST /sessions/:id/contacts/check | 2h | Batch phone number check |
| 4 | GET /sessions/:id/contacts/:jid/photo | 1h | Profile picture URL from WA |
| 5 | POST block/unblock | 1h | Block/unblock via DO RPC |
| 6 | e2e tests | 2h | Full contact suite assertions |

### US-028: Rate Limiting (3 pts) — Dev B
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Sliding window algorithm | 2h | KV-based, per-API-key, sub-second precision |
| 2 | Plan configuration | 1h | Free: 10/s, Pro: 50/s, Business: 200/s from tenant plan |
| 3 | Response headers | 1h | X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset |
| 4 | 429 response | 1h | Clear error + Retry-After header |
| 5 | Health exemption | 30min | Skip rate limiting for /health/* paths |
| 6 | e2e tests | 1.5h | Burst test, 429 verification |

## e2e Tests Required

| Test File | Stories Covered | Key Assertions |
|-----------|----------------|----------------|
| `06-contacts.e2e.ts` | US-024 | List, get, check, photo, block/unblock |
| `07-groups.e2e.ts` | US-025 | CRUD, participants, invite links |
| `02-auth.e2e.ts` (extended) | US-028 | Rate limit 429, headers, retry-after |
| `10-audit.e2e.ts` | US-033 | Audit entries for all sensitive ops |

| Frontend Test File | Stories Covered | Key Assertions |
|-------------------|----------------|----------------|
| `01-login.spec.ts` | US-034 | Login form, OAuth, error states, redirect |
| `02-navigation.spec.ts` | US-035 | All nav links work, active state, responsive |
| `03-dashboard.spec.ts` | US-036 | Stats cards render, auto-refresh |
| `04-sessions.spec.ts` | US-037 | Create, list, QR display, status updates |
| `05-webhooks.spec.ts` | US-038 | CRUD, test delivery, validation |
| `06-api-keys.spec.ts` | US-039 | Create, show once, revoke |
| `07-logs.spec.ts` | US-040 | Table, filters, pagination |
| `08-message-tester.spec.ts` | US-041 | Send each type, success/error display |
| `09-infrastructure.spec.ts` | US-042 | Component status indicators |

## Risks & Mitigations
| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | TanStack Start RC instability | Medium | High | Pin exact version, monitor GitHub issues, have Vite SPA fallback |
| 2 | @cloudflare/vite-plugin issues with server functions | Medium | High | Test deployment on D1 early; fallback to separate API calls |
| 3 | 30pts for Dev C alone is aggressive | Medium | Medium | US-038–042 are "should-have"; simpler pages (3pts each) can be compressed to D10 |
| 4 | better-auth CF Workers compatibility | Low | High | Verified in Sprint 3 auth; adapter exists for Workers |

## Sprint Review Checklist
- [ ] Login with email/password works end-to-end
- [ ] Dashboard layout renders on desktop + mobile
- [ ] Session creation from UI provisions DO
- [ ] QR code displays and refreshes from UI
- [ ] Session status updates in real-time via WebSocket
- [ ] Webhook CRUD from UI with test delivery
- [ ] API key created, shown once, listed (prefix only)
- [ ] Audit log page shows filtered entries
- [ ] Message tester sends text message successfully
- [ ] Contact and group API endpoints with e2e tests passing
- [ ] Rate limiting returns 429 on burst

## Definition of Done Verification
```bash
# Backend e2e (all existing + new)
cd e2e && pnpm test
# Expected: 01-health through 10-audit all pass

# Frontend e2e
cd e2e-frontend && npx playwright test
# Expected: 01-login through 09-infrastructure all pass

# Deploy
wrangler pages deploy --project-name openwa-dashboard
# Expected: Dashboard accessible on staging URL
```
