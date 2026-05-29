# Sprint 7 — CRM & Mart Integration

## Sprint Goal

Deliver a fully functional CRM module with contact management, conversation tracking, and bidirectional Mart integration enabling order notifications and cart abandonment recovery flows.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 7 |
| Start Date | 2026-07-28 (Monday) |
| End Date | 2026-08-08 (Friday) |
| Working Days | 10 |
| Phase | Phase 7 — CRM & Mart Integration |

## Capacity

| Developer | Role | Available Days | Capacity (pts) |
|-----------|------|---------------|----------------|
| Dev A | Senior Full-Stack | 10 | ~12 |
| Dev B | Backend/Infra | 10 | ~10 |
| Dev C | Frontend | 10 | ~8 |
| **Total** | | **30 dev-days** | **~30 pts** |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies |
|----------|-------|--------|----------|----------|--------------|
| US-051 | CRM Contact Management | 5 | Dev A + Dev C | P1 | Sessions module |
| US-052 | Conversation Management | 5 | Dev A | P1 | US-051 |
| US-053 | Mart Store Linking | 3 | Dev B | P1 | Tenant module |
| US-054 | Order Notifications | 5 | Dev B | P2 | US-053 |
| US-055 | Cart Abandonment Recovery | 5 | Dev B + Dev A | P2 | US-053, US-054 |
| US-056 | Contact Sync | 5 | Dev A + Dev B | P2 | US-051, US-053 |

**Total: 28 points**

## Day-by-Day Schedule

### Week 1 (Jul 28 – Aug 1)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|--------------------|-----------------------|------------------|
| **Day 1** (Mon) | US-051: Design CRM schema, D1 migrations for contacts table | US-053: Mart store linking API design, D1 migration for `mart_links` table | US-051: CRM contacts list page scaffolding, TanStack Router setup |
| **Day 2** (Tue) | US-051: Contacts CRUD endpoints (create, read, update, delete) | US-053: Mart ownership verification webhook, store linking endpoint | US-051: Contact detail view, tag management UI |
| **Day 3** (Wed) | US-051: Tags system, metadata JSONB field, search/filter API | US-053: Integration tests, Mart API client service | US-051: CSV import/export UI, file upload component |
| **Day 4** (Thu) | US-051: CSV import/export workers (CF Queue for large imports) | US-054: Order notification webhook receiver, event schema | US-051: Contact search, filter, pagination UI |
| **Day 5** (Fri) | US-052: Conversation schema design, auto-creation logic | US-054: Template message composition, delivery via session | US-052: Conversations list view, status badges |

### Week 2 (Aug 4 – Aug 8)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|--------------------|-----------------------|------------------|
| **Day 6** (Mon) | US-052: Conversation status machine, assignment API | US-054: Order event mapping (placed → confirmed → shipped → delivered) | US-052: Conversation detail, assignment dropdown, status transitions |
| **Day 7** (Tue) | US-052: Conversation search, message linking, tests | US-055: Cart abandonment detection, CF Queue delayed jobs | US-052: Real-time conversation updates (SSE/polling) |
| **Day 8** (Wed) | US-056: Contact sync architecture, diff algorithm | US-055: Recovery message templates, opt-out tracking | US-055: Cart recovery settings UI, opt-out management |
| **Day 9** (Thu) | US-056: Bidirectional sync worker (OpenWA → Mart) | US-055: Retry logic, analytics events, integration tests | US-056: Sync status dashboard, conflict resolution UI |
| **Day 10** (Fri) | US-056: Conflict resolution, sync tests, sprint cleanup | US-056: Mart → OpenWA sync webhook handler, e2e tests | Sprint demo prep, UI polish, integration testing |

## Technical Tasks

### US-051: CRM Contact Management (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | D1 migration: `contacts` table (id, tenant_id, phone, name, email, tags JSON, metadata JSON, created_at, updated_at) | 1h | Dev A |
| 2 | D1 migration: `contact_tags` table (contact_id, tag, created_at) | 1h | Dev A |
| 3 | Elysia contacts controller: GET /contacts (paginated, filterable) | 2h | Dev A |
| 4 | Elysia contacts controller: POST/PUT/DELETE /contacts/:id | 2h | Dev A |
| 5 | Contact search service (full-text on name/phone/email, tag filter) | 2h | Dev A |
| 6 | CSV import worker (CF Queue consumer, batch insert, validation) | 3h | Dev A |
| 7 | CSV export endpoint (streaming response, field selection) | 2h | Dev A |
| 8 | Frontend: Contacts list page with DataTable, pagination, search | 3h | Dev C |
| 9 | Frontend: Contact detail/edit form with tag editor | 2h | Dev C |
| 10 | Frontend: CSV import dialog with progress indicator | 2h | Dev C |
| 11 | Frontend: CSV export button with field picker | 1h | Dev C |
| 12 | Unit tests: contact service, CSV parsing | 2h | Dev A |
| 13 | E2E test: contact CRUD flow | 1h | Dev A |

### US-052: Conversation Management (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | D1 migration: `conversations` table (id, tenant_id, contact_id, session_id, status, assigned_to, created_at) | 1h | Dev A |
| 2 | Auto-creation trigger: new inbound message → create conversation if none open | 2h | Dev A |
| 3 | Conversation status machine (open → pending → resolved → closed) | 2h | Dev A |
| 4 | Assignment API: POST /conversations/:id/assign | 1h | Dev A |
| 5 | Conversation list endpoint with filters (status, assignee, contact) | 2h | Dev A |
| 6 | Message linking: associate messages with conversation_id | 2h | Dev A |
| 7 | Frontend: Conversations list with status filters | 3h | Dev C |
| 8 | Frontend: Conversation detail view with message thread | 3h | Dev C |
| 9 | Frontend: Assignment UI and status transition buttons | 2h | Dev C |
| 10 | Unit tests: status machine, auto-creation logic | 2h | Dev A |

### US-053: Mart Store Linking (3 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | D1 migration: `mart_links` table (id, tenant_id, mart_org_id, store_url, verified, api_key_hash) | 1h | Dev B |
| 2 | Linking endpoint: POST /integrations/mart/link (store URL, API key) | 2h | Dev B |
| 3 | Ownership verification: call Mart API to confirm org ownership | 2h | Dev B |
| 4 | Unlink endpoint: DELETE /integrations/mart/link/:id | 1h | Dev B |
| 5 | Mart API client service (reusable HTTP client with auth) | 2h | Dev B |
| 6 | Integration tests: linking flow, verification failure cases | 2h | Dev B |

### US-054: Order Notifications (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Webhook receiver: POST /webhooks/mart/orders (signature verification) | 2h | Dev B |
| 2 | Event schema validation (order.placed, shipping.updated, order.delivered) | 1h | Dev B |
| 3 | D1 migration: `notification_templates` table | 1h | Dev B |
| 4 | Template message composer (variable substitution: {customer_name}, {order_id}, {tracking_url}) | 3h | Dev B |
| 5 | Message delivery: resolve contact → find session → send via engine | 2h | Dev B |
| 6 | Delivery status tracking and retry on failure | 2h | Dev B |
| 7 | Notification log: D1 table for audit trail | 1h | Dev B |
| 8 | Unit tests: template rendering, event handling | 2h | Dev B |
| 9 | Integration test: full webhook → message delivery flow | 2h | Dev B |

### US-055: Cart Abandonment Recovery (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | Webhook receiver: POST /webhooks/mart/carts (cart.abandoned event) | 1h | Dev B |
| 2 | CF Queue: delayed job scheduler (configurable delay: 1h, 4h, 24h) | 3h | Dev B |
| 3 | D1 migration: `recovery_campaigns` table (contact_id, cart_id, status, sent_at, opted_out) | 1h | Dev B |
| 4 | Recovery message template with cart items summary | 2h | Dev B |
| 5 | Opt-out mechanism: reply STOP → mark opted_out, stop sequence | 2h | Dev A |
| 6 | Recovery analytics: sent/opened/recovered counters | 2h | Dev B |
| 7 | Frontend: Cart recovery settings (delay config, template editor) | 3h | Dev C |
| 8 | Frontend: Opt-out list management | 1h | Dev C |
| 9 | Integration tests: delayed delivery, opt-out flow | 2h | Dev B |

### US-056: Contact Sync (5 pts)

| # | Task | Est. | Assignee |
|---|------|------|----------|
| 1 | D1 migration: `sync_state` table (tenant_id, last_sync_at, cursor, direction) | 1h | Dev A |
| 2 | OpenWA → Mart sync: push new/updated contacts to Mart API | 3h | Dev A |
| 3 | Mart → OpenWA sync: webhook handler for contact.created/updated | 2h | Dev B |
| 4 | Conflict resolution: last-write-wins with manual override option | 2h | Dev A |
| 5 | Sync scheduler: CF Cron trigger every 15 min for full reconciliation | 2h | Dev A |
| 6 | Frontend: Sync status indicator, last sync timestamp | 2h | Dev C |
| 7 | Frontend: Conflict resolution UI (side-by-side diff) | 2h | Dev C |
| 8 | Unit tests: diff algorithm, conflict resolution | 2h | Dev A |
| 9 | Integration tests: bidirectional sync scenarios | 2h | Dev B |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Mart API instability or rate limits | Medium | High | Implement circuit breaker pattern, retry with exponential backoff, cache responses |
| Cart abandonment timing issues with CF Queues | Medium | Medium | Use CF Queue's built-in delay feature, add dead-letter queue for failures |
| Contact sync conflicts causing data loss | Low | High | Default to last-write-wins, maintain audit log, allow manual conflict resolution |
| Large CSV imports exceeding D1 batch limits | Medium | Low | Chunk imports into 500-row batches, use CF Queue for async processing |
| Conversation auto-creation race conditions | Low | Medium | Use D1 transactions with UNIQUE constraint on (contact_id, status='open') |

## Sprint Review Checklist

### Demo Script (Sprint Review — Aug 8)

- [ ] **CRM Contacts**: Create contact, add tags, search by name/tag, import 100 contacts via CSV, export filtered contacts
- [ ] **Conversations**: Show auto-created conversation from inbound message, assign to user, transition through statuses
- [ ] **Mart Linking**: Link a Mart store, show verification flow, display linked store in settings
- [ ] **Order Notifications**: Trigger order.placed webhook → show WhatsApp message delivered to customer
- [ ] **Cart Recovery**: Trigger cart.abandoned → show delayed message after configured interval, demonstrate opt-out
- [ ] **Contact Sync**: Create contact in Mart → show it appear in OpenWA, update in OpenWA → show sync to Mart

## Definition of Done Verification

```bash
# Unit tests
cd /workspaces/OpenWA
pnpm test -- --grep "contacts|conversation|mart|notification|recovery|sync"

# Integration tests
pnpm test:integration -- --grep "crm|mart"

# E2E Backend tests
cd /workspaces/OpenWA/e2e
pnpm test -- 01-health 02-auth 03-sessions

# E2E Frontend tests
cd /workspaces/OpenWA/e2e-frontend
pnpm test -- 01-login

# Type checking
cd /workspaces/OpenWA
pnpm tsc --noEmit

# Lint
pnpm lint

# D1 migrations apply cleanly
wrangler d1 migrations apply openwa-db --local
```

### Acceptance Criteria Verification

- [ ] All contacts CRUD operations return correct HTTP status codes
- [ ] CSV import handles 10,000 rows without timeout (async via Queue)
- [ ] Conversations auto-create on first inbound message per contact
- [ ] Mart store linking requires valid ownership verification
- [ ] Order notification delivered within 5s of webhook receipt
- [ ] Cart recovery message sent after configured delay (±30s tolerance)
- [ ] Opt-out stops all future recovery messages for that contact
- [ ] Bidirectional sync resolves within 15-minute cron cycle
- [ ] All endpoints enforce tenant isolation (no cross-tenant data access)
- [ ] Eden Treaty types generated for all new endpoints
