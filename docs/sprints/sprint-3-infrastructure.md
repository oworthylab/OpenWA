# Sprint 3 — Infrastructure Layer

## Sprint Goal
Build the Durable Object session host, Elysia REST API scaffold, multi-tenant auth (API keys + tenant isolation), and webhook delivery system — proving the full request path from API → DO → WhatsApp works.

## Sprint Duration & Dates
| Field | Value |
|-------|-------|
| Sprint # | 3 |
| Start Date | 2026-07-07 (Monday) |
| End Date | 2026-07-18 (Friday) |
| Working Days | 10 |
| Phase | Phase 3 — Infrastructure |

## Capacity
3 devs × 10 days = 30 person-days (~30 story points)

## Sprint Backlog
Stories from USER-STORIES.md:
- US-019: Durable Object Session Host (8 pts) — Dev B — Must-have
- US-020: Real-Time WebSocket (DO → Dashboard) (5 pts) — Dev B — Must-have
- US-021: Session CRUD API (5 pts) — Dev A — Must-have
- US-022: Session Lifecycle API (5 pts) — Dev A — Must-have
- US-023: Message Send API (All Types) (8 pts) — Dev A — Should-have (may spill)
- US-026: API Key Authentication (5 pts) — Dev B — Must-have
- US-029: Tenant Data Isolation (3 pts) — Dev B — Must-have
- US-030: Webhook CRUD (3 pts) — Dev C — Must-have
- US-031: Webhook Delivery with Retries (5 pts) — Dev C — Must-have
- US-032: Health Endpoints (2 pts) — Dev C — Must-have

Total: ~49 points (aggressive — US-023 is "should-have" overflow into Sprint 4 if needed)

## Day-by-Day Schedule

### Week 1 (July 7–11)
| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D1 Mon** | US-021: Elysia app scaffold, CORS, error handling, Worker entry point | US-019: DO class scaffold, `fetch()` + `alarm()` handlers, wrangler DO binding | US-032: Health endpoints `/health`, `/health/live`, `/health/ready` |
| **D2 Tue** | US-021: Session CRUD routes (POST/GET/GET/:id/DELETE), Valibot validation | US-019: Engine integration in DO, state persistence across requests | US-030: Webhook CRUD routes (POST/GET/PATCH/DELETE), URL validation (HTTPS only) |
| **D3 Wed** | US-021: Session create → provisions DO instance, unique name enforcement | US-026: API key auth middleware — extract header, hash lookup, resolve tenant | US-030: Event filtering config, wildcard support, test delivery endpoint |
| **D4 Thu** | US-022: Session lifecycle routes (start/stop/logout), DO RPC calls | US-026: KV cache for key validation (5min TTL), revoked key rejection | US-031: Queue producer (DO → WEBHOOK_QUEUE), message format |
| **D5 Fri** | US-022: QR endpoint, pairing code endpoint, state transition validation | US-029: Tenant DB resolution — API key → tenant → D1 binding dispatch | US-031: Queue consumer worker, webhook delivery with HMAC signing |

### Week 2 (July 14–18)
| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D6 Mon** | US-023: Text message endpoint, route to DO sendMessage RPC | US-019: Keep-alive alarm (25s cycle), hibernation-aware reconnection | US-031: Retry logic (3 attempts, exponential backoff), DLQ on final failure |
| **D7 Tue** | US-023: Media message endpoints (image, video, audio, document) | US-020: WebSocket upgrade handler in DO, auth via cookie token | US-031: DLQ query endpoint, delivery status tracking per webhook |
| **D8 Wed** | US-023: Location, contact, sticker endpoints, validation for all | US-020: Event broadcasting (message, ack, status) to connected WS clients | Integration testing: API → DO → WA flow end-to-end |
| **D9 Thu** | US-023: Response standardization, error codes, e2e test scaffolding | US-020: Multi-client fan-out, reconnection with missed event queue | e2e tests: webhook delivery, health endpoints, CRUD |
| **D10 Fri** | Sprint Review: full API demo, e2e test results | Sprint Review: DO lifecycle demo, WebSocket events | Sprint Review: webhook delivery demo, DLQ viewer |

## Technical Tasks

### US-019: Durable Object Session Host (8 pts) — Dev B
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | DO class scaffold | 2h | `WhatsAppSessionDO` class, `fetch()`, `alarm()`, wrangler config |
| 2 | Engine integration | 4h | Instantiate engine in DO, connect adapters, manage lifecycle |
| 3 | State persistence | 3h | Serialize engine state to DO storage on every mutation |
| 4 | Hibernation recovery | 4h | On wake: restore auth from storage, reconnect engine in <5s |
| 5 | Keep-alive alarm | 2h | 25s interval, ping WA, reset alarm, log missed pings |
| 6 | RPC interface | 3h | Type-safe methods: sendMessage, getStatus, getQR, start, stop, logout |
| 7 | Memory management | 2h | Lazy-load contacts/groups from D1, stay under 128MB |
| 8 | Graceful shutdown | 2h | Stop: close WS, notify clients, persist state. Logout: clear all auth |

### US-026: API Key Authentication (5 pts) — Dev B
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Auth middleware plugin | 3h | Elysia `derive()` — extract X-API-Key, hash with SHA-256, lookup prefix in KV |
| 2 | Key validation | 2h | Compare hash, check active status, check expiry |
| 3 | KV cache layer | 2h | Cache resolved tenant in KV with 5min TTL, invalidate on revoke |
| 4 | Role resolution | 1h | Inject `{ tenantId, role, keyId }` into request context |
| 5 | Error responses | 1h | 401 for invalid/missing key, 403 for insufficient role |

### US-021: Session CRUD API (5 pts) — Dev A
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | POST /sessions | 3h | Validate input, create D1 record, provision DO stub, return session object |
| 2 | GET /sessions | 2h | Paginated list for tenant, include status from DO |
| 3 | GET /sessions/:id | 1h | Single session with full details + current state |
| 4 | DELETE /sessions/:id | 2h | Destroy DO, delete D1 record, cleanup media (R2 prefix) |
| 5 | Unique name enforcement | 1h | 409 on duplicate name within tenant |
| 6 | Cross-tenant protection | 1h | Return 404 (not 403) for other tenant's sessions |
| 7 | Audit logging | 1h | Create/delete operations logged to audit_log |

### US-030: Webhook CRUD (3 pts) — Dev C
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | CRUD routes | 3h | POST/GET/PATCH/DELETE with session scoping |
| 2 | URL validation | 1h | HTTPS required, format check, no private IPs |
| 3 | Event filtering | 1h | `events[]` array, wildcard `*` support |
| 4 | Test delivery | 2h | POST /webhooks/:id/test sends sample payload |

### US-031: Webhook Delivery with Retries (5 pts) — Dev C
| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Queue producer | 2h | DO event → serialized message → CF Queue.send() |
| 2 | Consumer worker | 3h | Batch consumer, fan-out per webhook, parallel delivery |
| 3 | HMAC signing | 1h | X-OpenWA-Signature header, SHA-256 of body with webhook secret |
| 4 | Retry logic | 2h | 3 attempts with exponential backoff (delaySeconds) |
| 5 | Dead Letter Queue | 2h | DLQ consumer, store failed deliveries, query endpoint |
| 6 | Delivery tracking | 1h | Update webhook lastDeliveryStatus on each attempt |

## e2e Tests Required

| Test File | Stories Covered | Key Assertions |
|-----------|----------------|----------------|
| `01-health.e2e.ts` | US-032 | 200 OK, timestamp, no-auth required |
| `02-auth.e2e.ts` | US-026 | 401 without key, 401 invalid key, 200 valid key, role enforcement |
| `03-sessions.e2e.ts` | US-021, US-022 | CRUD lifecycle, state transitions, cross-tenant 404 |
| `05-webhooks.e2e.ts` | US-030, US-031 | CRUD, HMAC signature verification, retry on failure, DLQ |
| `10-audit.e2e.ts` | US-021 (audit) | Audit entries created on session CRUD |

## Risks & Mitigations
| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | DO ↔ Engine integration complexity | Medium | High | Spike completed in Sprint 2 (DO adapter); focus on lifecycle management |
| 2 | CF Queue consumer cold start delays webhook delivery | Low | Medium | Consumer always deployed; monitor p95 delivery latency |
| 3 | 49 points exceeds capacity | Medium | Medium | US-023 is "should-have"; spill remaining media endpoints to Sprint 4 |
| 4 | WebSocket auth across DO boundary | Medium | Medium | Use signed cookie token verified in DO fetch handler |

## Sprint Review Checklist
- [ ] `POST /sessions` creates a session + provisions DO (demo)
- [ ] `POST /sessions/:id/start` → QR data returned from DO
- [ ] API key auth rejects invalid keys with 401
- [ ] Cross-tenant access returns 404
- [ ] `POST /sessions/:id/messages/text` routes through DO to WA
- [ ] Webhook delivery: event → queue → HTTP POST with HMAC signature
- [ ] Failed webhook retried 3x then moved to DLQ
- [ ] Health endpoint responds without auth
- [ ] WebSocket: dashboard connects, receives session events
- [ ] All e2e tests passing: `01-health`, `02-auth`, `03-sessions`, `05-webhooks`

## Definition of Done Verification
```bash
# Backend e2e
cd e2e && pnpm test -- --testPathPattern="01-health|02-auth|03-sessions|05-webhooks|10-audit"
# Expected: all suites pass

# Unit tests
bun run test
# Expected: all pass including new DO, API, webhook tests

# Deploy verification
wrangler deploy --env staging
# Expected: API + DO + Queue consumer all deploy, health returns 200
```
