# Sprint 7 — CRM & Mart Integration

## Sprint Goal

Deliver a full CRM module with contacts, tags, and conversation management, plus integrate with Mart for order notifications, cart abandonment recovery, and bidirectional contact sync — enabling merchants to manage customer relationships entirely within OpenWA.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 7 |
| Start Date | 2026-09-01 (Monday) |
| End Date | 2026-09-12 (Friday) |
| Working Days | 10 |
| Phase | Phase 7 — CRM + Mart |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | CRM API + Data Model | 10 | Contacts, tags, conversations, import/export |
| Dev B | Mart Integration | 10 | Endpoints, event handlers, sync |
| Dev C | CRM & Mart Dashboard | 10 | Contact views, inbox, Mart UI |
| **Total** | | **30 person-days** | ~28 story points planned |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-051 | CRM Contacts | 5 | Dev A | Must-have | None | — |
| US-052 | Conversation Management | 5 | Dev A | Must-have | US-051 | — |
| US-053 | Mart Store Linking | 3 | Dev B | Must-have | None | — |
| US-054 | Order Notifications | 5 | Dev B | Must-have | US-053 | — |
| US-055 | Cart Abandonment | 5 | Dev B | Must-have | US-053, US-054 | — |
| US-056 | Contact Sync | 5 | Dev B | Should-have | US-051, US-053 | — |

**Total: 28 points** (near full capacity — tightly packed sprint with integration risk buffer on D10)

## Day-by-Day Schedule

### Week 1 (September 1–5)

| Day | Dev A (CRM API) | Dev B (Mart Integration) | Dev C (Dashboard) |
|-----|-----------------|-------------------------|-------------------|
| **D1 Mon** | US-051: CRM contacts schema extension (tags, metadata JSON, link to WA JID) | US-053: Mart integration endpoint (`POST /integrations/mart/link`) | US-051: CRM contact list page scaffold |
| **D2 Tue** | US-051: CRM contacts CRUD API (`GET/POST/PATCH` with tag filtering) | US-053: Shared-secret verification (call Mart API to confirm ownership) | US-051: Contact detail view with tag editor |
| **D3 Wed** | US-051: Tag CRUD (`GET/POST/DELETE /crm/tags`), assign tags to contacts | US-054: Order notification handler (`order.placed` → format → send WA) | US-051: Tag filter UI, bulk tag operations |
| **D4 Thu** | US-052: Conversation model (auto-create on first message, status, assignee) | US-054: Shipping update handler, template variable substitution | US-052: Conversation inbox view |
| **D5 Fri** | US-052: Conversation API (`GET/PATCH` — status, assignment, filter) | US-054: Template message CRUD, variable validation | US-052: Conversation status badges, assignment UI |

### Week 2 (September 8–12)

| Day | Dev A (CRM API) | Dev B (Mart Integration) | Dev C (Dashboard) |
|-----|-----------------|-------------------------|-------------------|
| **D6 Mon** | US-051: Contact import/export (CSV upload, column mapping, download) | US-055: Cart abandonment handler (delayed send via Queue `delaySeconds`) | US-051: Import wizard UI, export button |
| **D7 Tue** | US-051: Contact merge/dedup (detect by phone, merge UI data) | US-055: Opt-out handling (STOP keyword → unsubscribe), recovery tracking | US-051: Merge confirmation dialog, dedup alerts |
| **D8 Wed** | e2e tests for CRM endpoints | US-056: Contact sync (Mart new customer → OpenWA contact), bidirectional updates | US-053: Mart integration dashboard page |
| **D9 Thu** | e2e tests continued, edge cases | US-056: Sync status tracking, manual "Sync Now", conflict resolution | US-056: Sync status UI, recovery metrics display |
| **D10 Fri** | Sprint Review prep, integration verification | Sprint Review prep, final sync testing | Sprint Review prep, demo script |

## Technical Tasks

### US-051: CRM Contacts (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Schema extension | 2h | Add `tags` (JSON array), `metadata` (JSON), `wa_jid` (TEXT FK) to contacts table in per-tenant D1 |
| 2 | Contacts CRUD API | 3h | `GET /crm/contacts` (paginated, filterable by tag), `POST`, `PATCH /crm/contacts/:id` |
| 3 | Tag CRUD | 2h | `GET /crm/tags`, `POST /crm/tags`, `DELETE /crm/tags/:id`; assign/remove tags from contacts |
| 4 | Contact import | 3h | `POST /crm/contacts/import` — CSV upload, column mapping validation, batch insert |
| 5 | Contact export | 1h | `GET /crm/contacts/export` — CSV download with tag columns |
| 6 | Contact merge/dedup | 3h | Detect duplicate phone numbers, `POST /crm/contacts/merge` with source/target |
| 7 | Unit tests | 2h | CRUD operations, tag filtering, import validation |

### US-052: Conversation Management (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Conversation model | 2h | D1 table: `conversations` (id, contact_id, status, assignee, created_at, updated_at) |
| 2 | Auto-create trigger | 2h | On first inbound message from unknown contact → create contact + conversation |
| 3 | Conversation API | 3h | `GET /crm/conversations` (filter by status/assignee), `PATCH` (status, assignment) |
| 4 | Status transitions | 1h | Open → Pending → Resolved → Closed; validation rules |
| 5 | Assignment logic | 1h | Round-robin default, manual override via PATCH |
| 6 | Integration tests | 2h | Message flow → conversation creation → status updates |

### US-053: Mart Store Linking (3 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Link endpoint | 2h | `POST /integrations/mart/link` — accept store URL + shared secret |
| 2 | Secret verification | 2h | Call Mart API `GET /api/verify-integration` with secret to confirm ownership |
| 3 | Store config storage | 1h | Per-tenant `mart_integrations` table (store_url, secret_hash, status, linked_at) |
| 4 | Unlink endpoint | 1h | `DELETE /integrations/mart/link` — revoke, clear webhooks |
| 5 | Webhook registration | 2h | Register OpenWA webhook URL with Mart for order/cart/customer events |

### US-054: Order Notifications (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Order placed handler | 2h | Webhook `order.placed` → extract order details → format message |
| 2 | Shipping update handler | 2h | Webhook `order.shipped` → tracking number → template send |
| 3 | Template message CRUD | 3h | `GET/POST/PATCH/DELETE /crm/templates` — name, body, variables list |
| 4 | Variable substitution | 2h | Parse `{{order_id}}`, `{{tracking_url}}`, etc. from template + event data |
| 5 | Variable sanitization | 1h | Strip HTML/scripts from all substitution values, max length enforcement |
| 6 | Delivery confirmation | 1h | Webhook `order.delivered` → thank you message + review request |
| 7 | Tests | 2h | Event handling, template rendering, XSS prevention |

### US-055: Cart Abandonment (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Abandonment handler | 2h | Webhook `cart.abandoned` → queue delayed message (configurable 1–24h) |
| 2 | Queue integration | 2h | CF Queue producer with `delaySeconds`, consumer sends WA message |
| 3 | Opt-out handling | 2h | STOP/UNSUBSCRIBE keyword detection → flag contact, skip future sends |
| 4 | Recovery tracking | 2h | Track if customer completes order after reminder; calculate recovery rate |
| 5 | Rate limiting | 1h | Max 1 abandonment message per contact per 24h |
| 6 | Tests | 2h | Queue delay, opt-out flow, rate limiting |

### US-056: Contact Sync (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Mart → OpenWA sync | 2h | Webhook `customer.created` / `customer.updated` → upsert CRM contact |
| 2 | OpenWA → Mart sync | 2h | On contact update with Mart link → push changes to Mart API |
| 3 | Conflict resolution | 2h | Last-write-wins with `updated_at` timestamp comparison |
| 4 | Sync status tracking | 2h | `sync_status` field (synced/pending/error), last_sync_at timestamp |
| 5 | Manual sync trigger | 1h | `POST /integrations/mart/sync` — force full resync |
| 6 | Tests | 2h | Bidirectional updates, conflict scenarios, error recovery |

## End-to-End Tests

| Test File | Stories | Description |
|-----------|---------|-------------|
| `09-crm-contacts.e2e.ts` | US-051 | CRUD contacts, tags, import/export, merge |
| `10-crm-conversations.e2e.ts` | US-052 | Conversation lifecycle, assignment, status |
| `11-mart-integration.e2e.ts` | US-053, US-054 | Store linking, order notifications |
| `12-cart-abandonment.e2e.ts` | US-055 | Delayed messages, opt-out, recovery |
| `13-contact-sync.e2e.ts` | US-056 | Bidirectional sync, conflict resolution |
| `08-crm-contacts.spec.ts` (frontend) | US-051 | Contact list, detail, tags, import |
| `09-crm-inbox.spec.ts` (frontend) | US-052 | Conversation inbox, status updates |

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Mart API availability for testing | Medium | High | Mock Mart API for e2e tests, use sandbox environment for integration testing |
| 2 | Template message variable injection (XSS) | Medium | High | Sanitize all template variables server-side, no HTML allowed, max 1024 chars per variable |
| 3 | Cart abandonment timing accuracy with Queue delays | Low | Medium | Use CF Queue `delaySeconds` (supports up to 24h); document precision limitations |
| 4 | Bidirectional sync conflicts | Medium | Medium | Last-write-wins with `updated_at` timestamp comparison; log conflicts for audit |
| 5 | CSV import with malformed data | Medium | Low | Validate each row, return partial success with error report for failed rows |

## Sprint Review Checklist

- [ ] CRM contacts CRUD works with tag filtering (demo: create, tag, filter, export)
- [ ] Contact import: upload CSV → mapped → created (demo: 100-row import)
- [ ] Contact merge: detect duplicates → merge → single record
- [ ] Conversation inbox: messages arrive → conversation auto-created → assign → resolve
- [ ] Mart store linked successfully (demo: enter URL + secret → verified)
- [ ] Order placed → customer receives WhatsApp notification with order details
- [ ] Shipping update → customer receives tracking link
- [ ] Cart abandoned → delayed message sent → customer recovers cart
- [ ] STOP keyword → customer unsubscribed → no further messages
- [ ] Contact sync: new Mart customer → appears in CRM; update in CRM → reflected in Mart
- [ ] All e2e tests pass (backend + frontend)

## Definition of Done Verification

```bash
# Backend tests
bun run test
# Expected: all unit tests pass including CRM + Mart modules

# e2e tests
cd e2e && pnpm test
# Expected: 09-crm-contacts, 10-conversations, 11-mart, 12-cart, 13-sync all pass

# Frontend tests
cd e2e-frontend && npx playwright test
# Expected: 08-crm-contacts.spec.ts, 09-crm-inbox.spec.ts pass

# CRM API verification
curl -H "Authorization: Bearer $TOKEN" https://api.openwa.dev/crm/contacts?tag=vip
# Expected: 200 OK, filtered contacts returned

# Mart integration verification
curl -X POST https://api.openwa.dev/integrations/mart/link \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"store_url": "https://mystore.mart.dev", "secret": "test-secret"}'
# Expected: 200 OK, store linked

# Template send verification
curl -X POST https://api.openwa.dev/crm/templates/order-confirmation/send \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"contact_id": "abc", "variables": {"order_id": "ORD-123", "total": "$59.99"}}'
# Expected: 200 OK, message queued

# Cart abandonment queue check
wrangler queues list
# Expected: cart-abandonment queue exists with scheduled messages
```

---
