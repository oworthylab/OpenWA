# Product Requirements Document (PRD)

## OpenWA Serverless Rewrite

**Document Version:** 1.0
**Date:** 2026-05-28
**Status:** Draft
**Owner:** OpenWA Team

---

## 1. Overview

### 1.1 Problem Statement

The current OpenWA platform is a monolithic NestJS + Puppeteer + Docker application that requires dedicated server infrastructure, resulting in:

- **High operational costs** — Dedicated Docker containers per session (~512MB+ RAM each)
- **Complex deployment** — Docker orchestration, scaling challenges, single points of failure
- **No multi-tenancy** — Each deployment serves a single user/organization
- **No desktop option** — Users must maintain server infrastructure for 24/7 uptime
- **Puppeteer dependency** — Heavy browser automation (Chromium) for WhatsApp Web, consuming ~500MB+ per session

### 1.2 Proposed Solution

Rewrite OpenWA as a **serverless multi-tenant SaaS** on Cloudflare's edge platform with an optional Electron desktop app. Replace Puppeteer with a pure TypeScript Baileys-based engine that communicates directly via WebSocket protocol (~30MB RAM per session).

### 1.3 Goals

| # | Goal | Success Metric |
|---|------|---------------|
| G1 | Reduce per-session resource cost by 90%+ | <50MB RAM per session vs. ~500MB+ today |
| G2 | Enable $5/month flat-rate cloud hosting | Single Cloudflare Workers Paid plan sufficient |
| G3 | Multi-tenant architecture | Single deployment serves unlimited tenants with isolation |
| G4 | Zero-cost self-hosted option | Electron desktop app for individual users |
| G5 | Sub-second API latency at edge | p95 < 200ms for API requests (excl. WA operations) |
| G6 | Feature parity with current platform | All existing messaging, contacts, groups, webhooks capabilities preserved |
| G7 | Mart e-commerce integration | Seamless CRM/messaging bridge for Mart stores |

### 1.4 Non-Goals

- Mobile app (out of scope for initial release)
- Official WhatsApp Business API integration (separate product)
- Custom chatbot builder (can be built on top by users)
- Message scheduling (can be implemented via external cron/workers later)
- Multi-device WhatsApp linking (limited by WA protocol)

---

## 2. Target Users & Personas

### 2.1 Developer (API Consumer)

- Integrates WhatsApp messaging into their application via REST API
- Needs reliable webhook delivery, clear documentation, type-safe SDK
- Values: uptime, simplicity, predictable pricing

### 2.2 Small Business Owner (Dashboard User)

- Manages customer conversations via the web dashboard
- Sends bulk notifications (order updates, promotions)
- Values: ease of use, CRM features, low cost

### 2.3 Self-Hosted User (Desktop)

- Runs OpenWA locally on their PC for personal/small-scale use
- Doesn't want recurring cloud costs
- Values: privacy, zero cost, simple setup

### 2.4 E-Commerce Platform (Mart Integration)

- Automated order notifications, shipping updates, cart recovery
- CRM contact sync between Mart and WhatsApp
- Values: reliability, event-driven integration, shared customer data

---

## 3. Functional Requirements

### 3.1 WhatsApp Engine

| ID | Requirement | Priority |
|----|-------------|:--------:|
| FR-E01 | Connect to WhatsApp via QR code scanning | P0 |
| FR-E02 | Connect via phone pairing code (alternative to QR) | P0 |
| FR-E03 | Maintain persistent WebSocket connection to WA servers | P0 |
| FR-E04 | Automatic reconnection on disconnect (< 5s recovery) | P0 |
| FR-E05 | Full Signal Protocol E2E encryption (X3DH + Double Ratchet) | P0 |
| FR-E06 | Send text messages | P0 |
| FR-E07 | Send media (image, video, audio, document, sticker) | P0 |
| FR-E08 | Send location, contact card | P1 |
| FR-E09 | Reply to messages, forward messages | P0 |
| FR-E10 | React to messages (emoji reactions) | P1 |
| FR-E11 | Delete messages (for me / for everyone) | P1 |
| FR-E12 | Receive and decrypt incoming messages (all types) | P0 |
| FR-E13 | Message delivery/read receipts (ack status) | P0 |
| FR-E14 | Contact list retrieval | P0 |
| FR-E15 | Check if phone number exists on WhatsApp | P0 |
| FR-E16 | Profile picture retrieval | P1 |
| FR-E17 | Block/unblock contacts | P2 |
| FR-E18 | Group management (create, add/remove participants, admin) | P1 |
| FR-E19 | Group metadata (subject, description, invite link) | P1 |
| FR-E20 | Label management (WhatsApp Business labels) | P2 |
| FR-E21 | Status/Stories (post text, image, video; delete) | P2 |
| FR-E22 | Newsletter/Channel support (subscribe, list) | P2 |
| FR-E23 | Business catalog (read product listings) | P2 |
| FR-E24 | Dual-adapter pattern: same engine core on Cloudflare DO and Node.js | P0 |

### 3.2 REST API

| ID | Requirement | Priority |
|----|-------------|:--------:|
| FR-A01 | Session CRUD (create, list, get, delete) | P0 |
| FR-A02 | Session lifecycle (start, stop, logout, QR, pairing code) | P0 |
| FR-A03 | Message send endpoints (all types: text, image, video, audio, doc, location, contact, sticker) | P0 |
| FR-A04 | Message operations (reply, forward, react, delete) | P0 |
| FR-A05 | Bulk message send (queued processing) | P1 |
| FR-A06 | Message history retrieval | P1 |
| FR-A07 | Contact endpoints (list, get, check existence, profile pic, block/unblock) | P0 |
| FR-A08 | Group endpoints (CRUD, participants, invite links) | P1 |
| FR-A09 | Webhook CRUD (create, list, update, delete per session) | P0 |
| FR-A10 | Label endpoints (list, assign to chat, remove) | P2 |
| FR-A11 | Status/Stories endpoints (post, list, delete) | P2 |
| FR-A12 | Channel endpoints (list, subscribe, unsubscribe) | P2 |
| FR-A13 | API key management (create, list, revoke) | P0 |
| FR-A14 | Tenant info and settings | P0 |
| FR-A15 | Health/readiness probes | P0 |
| FR-A16 | CRM endpoints (contacts with tags/metadata, conversations, assignments) | P1 |
| FR-A17 | End-to-end type safety via Eden Treaty | P0 |

### 3.3 Dashboard (Web UI)

| ID | Requirement | Priority |
|----|-------------|:--------:|
| FR-D01 | User authentication (better-auth: email/password + OAuth) | P0 |
| FR-D02 | Session management UI (create, scan QR, view status, stop/start) | P0 |
| FR-D03 | Conversation view (list chats, send/receive messages in real-time) | P0 |
| FR-D04 | Contact list with search and CRM tagging | P1 |
| FR-D05 | Webhook management UI | P1 |
| FR-D06 | API key management UI (create, view prefix, revoke) | P0 |
| FR-D07 | Tenant settings (name, plan info, usage metrics) | P1 |
| FR-D08 | Real-time updates via WebSocket (new messages, status changes) | P0 |
| FR-D09 | Responsive design (mobile-friendly) | P1 |
| FR-D10 | Dark/light mode | P2 |

### 3.4 Desktop App (Electron)

| ID | Requirement | Priority |
|----|-------------|:--------:|
| FR-X01 | Local WhatsApp engine (same core, Node adapter) | P0 |
| FR-X02 | System tray operation (background when window closed) | P0 |
| FR-X03 | Same UI as web dashboard (shared @openwa/ui components) | P0 |
| FR-X04 | Native OS notifications for incoming messages | P1 |
| FR-X05 | Auto-start on system boot (configurable) | P2 |
| FR-X06 | Auto-updater via GitHub Releases | P1 |
| FR-X07 | Cross-platform builds (macOS, Windows, Linux) | P0 |
| FR-X08 | Optional cloud sync (push state to D1 via API) | P2 |
| FR-X09 | Offline message history (local SQLite cache) | P1 |
| FR-X10 | Drag-and-drop media sending | P2 |

### 3.5 Multi-Tenancy & SaaS

| ID | Requirement | Priority |
|----|-------------|:--------:|
| FR-T01 | Tenant registration and onboarding flow | P0 |
| FR-T02 | Plan-based resource limits (sessions, messages, storage, rate) | P0 |
| FR-T03 | Strict tenant data isolation (physical DB-per-tenant via D1) | P0 |
| FR-T04 | Usage metering and analytics | P1 |
| FR-T05 | Billing integration (Stripe or LemonSqueezy) | P1 |
| FR-T06 | Super-admin panel for managing all tenants | P2 |
| FR-T07 | Tenant-scoped media storage (R2 path isolation) | P0 |

### 3.6 Mart Integration

| ID | Requirement | Priority |
|----|-------------|:--------:|
| FR-M01 | Shared tenant linking (Mart org → OpenWA tenant) | P1 |
| FR-M02 | Order event → WhatsApp notification webhook bridge | P1 |
| FR-M03 | Shipping update notifications | P1 |
| FR-M04 | Cart abandonment recovery messages | P2 |
| FR-M05 | Incoming WA message → Mart ticket system webhook | P1 |
| FR-M06 | Contact sync between Mart CRM and OpenWA contacts | P1 |
| FR-M07 | Template messages with order data variables | P2 |
| FR-M08 | Eden Treaty type-safe client for Mart ↔ OpenWA | P1 |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-P01 | API response time (non-WA operations) | p95 < 200ms |
| NFR-P02 | Message send latency (WA round-trip) | p95 < 3s |
| NFR-P03 | WebSocket event propagation to dashboard | < 500ms |
| NFR-P04 | Session reconnection after hibernation | < 5s |
| NFR-P05 | QR code generation | < 2s |
| NFR-P06 | Cold start (Worker) | < 50ms |

### 4.2 Scalability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-S01 | Concurrent sessions per tenant (Pro plan) | Up to 3 |
| NFR-S02 | Concurrent sessions per tenant (Business plan) | Up to 10 |
| NFR-S03 | Total platform sessions | 1000+ (limited by DO count) |
| NFR-S04 | API requests per second (per tenant) | 10-200 based on plan |
| NFR-S05 | Webhook delivery throughput | 10,000 events/min via Queues |
| NFR-S06 | Message storage | 50K-unlimited based on plan |

### 4.3 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-R01 | API uptime | 99.9% (matches CF Workers SLA) |
| NFR-R02 | Webhook delivery success (with retries) | 99.5% |
| NFR-R03 | Session state persistence | Zero data loss on DO eviction |
| NFR-R04 | Sub-millisecond DB queries | D1 native binding, no cold start |
| NFR-R05 | Desktop app: offline operation | Full functionality without internet (except WA connection) |

### 4.4 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-SEC01 | API authentication via SHA-256 hashed API keys | All endpoints |
| NFR-SEC02 | Dashboard auth via better-auth (session cookies + OAuth) | All pages |
| NFR-SEC03 | Tenant isolation enforced at database level | Physical DB-per-tenant (separate D1 databases) |
| NFR-SEC04 | Webhook payload signing (HMAC-SHA256) | Every delivery |
| NFR-SEC05 | Rate limiting via KV sliding window | Per API key |
| NFR-SEC06 | Input validation (Valibot schemas) | All API boundaries |
| NFR-SEC07 | Media access via time-limited presigned R2 URLs | Scoped to tenant |
| NFR-SEC08 | DO access only via internal Worker RPC | Never exposed publicly |
| NFR-SEC09 | Secrets stored in CF Worker secrets (encrypted at rest) | All credentials |
| NFR-SEC10 | Audit log for all sensitive operations | Immutable append-only |

### 4.5 Cost

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-C01 | Cloud hosting cost for Pro plan | $5/month (CF Workers Paid) |
| NFR-C02 | Database cost (low usage) | $0 (D1 included in Workers Paid plan) |
| NFR-C03 | Desktop app cost | $0 |
| NFR-C04 | No per-message charges from platform | Included in plan |

---

## 5. Technical Architecture Summary

### 5.1 Platform Components

| Component | Technology | Deployment |
|-----------|-----------|------------|
| REST API | Elysia on Cloudflare Workers | `services/api` |
| WhatsApp Engine | Baileys fork (pure TS) | `packages/engine` |
| Session Host | Cloudflare Durable Objects | `workers/wa-session` |
| WebSocket Relay | Cloudflare Durable Objects | `workers/wa-session` |
| Dashboard | TanStack Start + React on CF Pages | `apps/dashboard` |
| Desktop App | Electron + React | `apps/desktop` |
| Database | Cloudflare D1 (SQLite, DB-per-tenant) + Drizzle ORM | `packages/db` |
| Media Storage | Cloudflare R2 | Per-tenant paths |
| Webhook Delivery | Cloudflare Queues | Consumer worker |
| Caching | Cloudflare KV | Auth, rate limits |
| Shared UI | React + shadcn/ui | `packages/ui` |
| Validation | Valibot | `packages/validators` |
| Shared Types | TypeScript | `packages/shared` |

### 5.2 Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| Baileys fork over Puppeteer | 90% less memory, no browser dependency, WebSocket-native |
| Durable Objects over containers | Auto-scaling, no infrastructure management, hibernation-safe |
| Elysia over Hono/Express | End-to-end type safety, Eden Treaty client generation |
| D1 over NeonDB | Zero extra cost, <1ms latency, physical tenant isolation (DB-per-tenant), 50K DBs |
| Bun over pnpm/yarn | Faster installs, native TS execution, workspace support |
| TanStack Start over Astro/Next.js | Unified React DX, server functions with direct CF binding access, TanStack Query built-in |
| Valibot over Zod | Smaller bundle (tree-shakeable), faster validation |

---

## 6. Release Criteria

### 6.1 MVP (Public Beta)

- [ ] WhatsApp engine: connect, send/receive text + media, groups
- [ ] REST API: full session + messaging + webhook endpoints
- [ ] Dashboard: auth, session management, basic chat view
- [ ] Multi-tenancy: tenant isolation, API key auth, rate limiting
- [ ] Webhook delivery with retries
- [ ] Documentation: API reference, quickstart guide
- [ ] Security: all P0 NFR-SEC items implemented
- [ ] <100ms p95 API latency (non-WA operations)

### 6.2 GA (General Availability)

- All MVP criteria met
- Desktop app with cross-platform builds
- Billing integration active
- CRM features (contacts, tags, conversations)
- Mart integration operational
- Load tested to 100+ concurrent sessions
- Security audit completed
- 99.9% uptime demonstrated over 30 days

---

## 7. Success Metrics

| Metric | Baseline (Current) | Target (6 months post-launch) |
|--------|:---:|:---:|
| Infrastructure cost per session | ~$15-30/mo | < $2/mo |
| Session startup time | 30-60s (Docker + Puppeteer) | < 5s |
| Memory per session | 500MB+ | < 50MB |
| API p95 latency | 500ms+ | < 200ms |
| Deployment complexity | Docker + orchestration | `bun run deploy` |
| Tenant onboarding time | Manual setup | < 2 minutes self-serve |
| Active tenants | 0 (single-user) | 100+ |

---

## 8. Open Questions & Decisions Needed

| # | Question | Status |
|---|----------|--------|
| Q1 | Billing provider: Stripe vs LemonSqueezy? | Pending |
| Q2 | Free tier limits — how generous? | Proposed in plan |
| Q3 | WhatsApp ban mitigation — phone rotation strategy details? | Needs research |
| Q4 | Mart integration: webhook-only or embedded SDK? | Proposed: both |
| Q5 | Desktop auto-update: GitHub Releases vs custom server? | Proposed: GitHub |
| Q6 | Custom domain support: CF for SaaS vs manual DNS? | Pending |
| Q7 | Data retention policy for messages (GDPR compliance)? | Needs legal review |

---

## 9. Dependencies & Assumptions

### Dependencies

- Cloudflare Workers Paid plan ($5/month) is sufficient for initial scale
- D1 included storage (5GB + 50M writes/mo) supports initial database needs
- Baileys protocol remains functional (WhatsApp doesn't block)
- @noble/curves library works in CF Workers environment (Web Crypto API)

### Assumptions

- WhatsApp Web protocol remains stable enough to maintain compatibility
- Durable Objects 128MB memory limit is sufficient for single-session engine
- Users accept unofficial API risk (potential bans)
- Mart integration is additive (not blocking for MVP)
