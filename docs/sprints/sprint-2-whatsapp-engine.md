# Sprint 2 — WhatsApp Engine

> **Note:** This sprint is split into **Sprint 2a** (2 weeks, 30 pts) and **Sprint 2b** (1 week, 37 pts adjusted). Sprint 2a covers the critical path: engine scaffold, adapters, crypto, and auth. Sprint 2b covers messaging operations and resilience.

---

# Sprint 2a — Engine Core & Authentication

## Sprint Goal

Deliver a working WhatsApp engine package with pure-JS crypto, dual adapters (Node.js + Cloudflare DO), and QR/phone-pairing authentication — proving we can connect to WhatsApp from both environments.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 2a |
| Start Date | 2026-06-16 (Monday) |
| End Date | 2026-06-27 (Friday) |
| Working Days | 10 |
| Phase | Phase 2 — WhatsApp Engine |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | Senior Full-Stack | 10 | Engine architecture, adapter interfaces |
| Dev B | Backend/Infra | 10 | DO adapter, crypto implementation |
| Dev C | Frontend | 10 | Node.js adapter, auth flows, testing |
| **Total** | | **30 person-days** | ~30 story points capacity |

## Sprint Backlog — 2a

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-007 | Engine Package Scaffold | 5 | Dev A | Must-have | Sprint 1 complete | — |
| US-008 | Node.js Adapter | 5 | Dev C | Must-have | US-007 | — |
| US-009 | Cloudflare DO Adapter | 8 | Dev B | Must-have | US-007 | — |
| US-010 | Pure-JS Cryptographic Stack | 8 | Dev B | Must-have | US-007 | — |
| US-011 | QR Code Authentication | 5 | Dev A | Must-have | US-007, US-010 | — |
| US-012 | Phone Pairing Code Authentication | 5 | Dev A | Should-have | US-011 | — |

**Total: 36 points** (aggressive but achievable — US-010 and US-009 overlap and Dev B works both; US-012 depends on US-011 patterns)

**Risk adjustment:** US-012 is "should-have" and can spill to 2b if crypto takes longer.

## Day-by-Day Schedule — Sprint 2a

### Week 1 (June 16–20)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D1 Mon** | US-007: Engine package structure, interfaces (`ISocket`, `IStorage`, `ICrypto`, `IAuth`) | US-010: Web Crypto API assessment, Noise protocol research | US-008: Node.js adapter scaffold, dependency analysis |
| **D2 Tue** | US-007: State machine types, event system, protocol message types | US-010: Noise_XX handshake implementation (Web Crypto + @noble/curves) | US-008: Filesystem storage adapter (session keys, creds) |
| **D3 Wed** | US-007: Connection manager interface, retry/backoff config | US-010: Signal Protocol — double ratchet, chain keys, message encrypt/decrypt | US-008: `ws` WebSocket adapter, reconnection logic |
| **D4 Thu** | US-011: QR code generation flow, registration payload | US-010: HKDF, HMAC-SHA256, AES-256-CBC via Web Crypto; key serialization | US-008: Integration test — connect to WA servers via Node adapter |
| **D5 Fri** | US-011: QR authentication handshake, identity key exchange | US-010: Unit tests — round-trip encrypt/decrypt, cross-platform key compat | US-008: Edge cases — timeout, network drop, invalid creds |

### Week 2 (June 23–27)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D6 Mon** | US-011: Pairing approval flow, session credential storage | US-009: DO class scaffold, alarm-based lifecycle | US-008: Final Node adapter polish, documentation |
| **D7 Tue** | US-011: QR refresh logic, timeout handling, error states | US-009: DO storage adapter (put/get/delete, list keys) | Integration testing: Node adapter + crypto + QR auth end-to-end |
| **D8 Wed** | US-012: Phone pairing code registration, noise channel setup | US-009: Native WebSocket in DO (Hibernation API) | Testing: Auth flow automated tests |
| **D9 Thu** | US-012: Pairing code verification, fallback to QR | US-009: DO ↔ engine integration, state persistence across hibernation | Cross-adapter testing: same test suite on both adapters |
| **D10 Fri** | Sprint Review: demo QR auth via Node.js adapter | US-009: Load testing DO adapter, connection limits | Sprint Review prep, test report, demo script |

## Technical Tasks — Sprint 2a

### US-007: Engine Package Scaffold (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Package structure | 1h | `packages/engine/` — `src/`, `src/adapters/`, `src/crypto/`, `src/auth/`, `src/protocol/` |
| 2 | Core interfaces | 3h | `ISocket` (connect/send/recv/close), `IStorage` (get/set/delete/list), `ICrypto` (encrypt/decrypt/sign/verify/hkdf), `IAuth` (authenticate/refresh) |
| 3 | Protocol message types | 3h | Binary protocol nodes, protobuf schemas (from Baileys), message frame encoding/decoding |
| 4 | Event system | 2h | Typed EventEmitter — `connection.update`, `messages.upsert`, `messages.update`, `groups.upsert` |
| 5 | State machine types | 2h | `ConnectionState`: `idle → connecting → authenticating → open → closing → closed → reconnecting` |
| 6 | Configuration | 1h | `EngineConfig` type — auth strategy, retry policy, log level, adapter selection |
| 7 | Fork Baileys integration | 4h | Identify reusable modules from Baileys, copy protocol handling code, adapt to adapter interfaces |
| 8 | Export structure | 1h | Public API surface: `createEngine(config, adapters)` factory function |

### US-008: Node.js Adapter (5 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Storage adapter | 3h | `NodeStorage` — filesystem-based key-value (JSON files in `./auth_info/`) |
| 2 | WebSocket adapter | 3h | `NodeSocket` — wraps `ws` library, handles binary frames, ping/pong |
| 3 | Connection lifecycle | 2h | Connect, reconnect with backoff, graceful close, error propagation |
| 4 | Credential management | 2h | Read/write auth credentials, key rotation support |
| 5 | Integration test harness | 3h | Test against real WA servers (sandboxed), mock server for CI |
| 6 | Error handling | 2h | Network timeouts, DNS failures, TLS errors, invalid frames |
| 7 | Platform compatibility | 1h | Verify works with Bun runtime (not just Node.js) |

### US-009: Cloudflare DO Adapter (8 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | DO class definition | 2h | `WhatsAppSessionDO` class extending `DurableObject`, alarm setup |
| 2 | DO storage adapter | 4h | `DOStorage` — transactional put/get/delete/list using `this.ctx.storage` |
| 3 | Native WebSocket | 4h | `DOSocket` — WebSocket via `WebSocket` constructor (not ws), binary frame handling |
| 4 | Hibernation API | 3h | `webSocketMessage()`, `webSocketClose()`, `webSocketError()` handlers for zero-cost idle |
| 5 | State persistence | 3h | Session state survives DO hibernation/eviction, atomic credential storage |
| 6 | Alarm-based lifecycle | 2h | Health check alarms, session timeout, reconnection triggers |
| 7 | Worker → DO bridge | 3h | Stub API for Worker to call DO methods (send message, get status) |
| 8 | DO isolation testing | 2h | Verify tenant isolation, no cross-DO state leakage |
| 9 | Performance testing | 2h | Measure latency: Worker → DO → WA, identify bottlenecks |

### US-010: Pure-JS Cryptographic Stack (8 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Noise_XX handshake | 6h | Full Noise Protocol Framework XX pattern using Web Crypto + `@noble/curves` (Curve25519) |
| 2 | Signal Protocol primitives | 6h | Double Ratchet, X3DH key agreement, chain/message key derivation |
| 3 | AES-256-CBC encryption | 2h | Web Crypto `subtle.encrypt`/`decrypt`, IV generation, padding |
| 4 | HKDF-SHA256 | 1.5h | Key derivation via Web Crypto `deriveBits` or manual HMAC-based HKDF |
| 5 | HMAC-SHA256 | 1h | Message authentication codes via Web Crypto `sign`/`verify` |
| 6 | Curve25519 operations | 3h | `@noble/curves` — key generation, ECDH, signature (Ed25519) |
| 7 | Key serialization | 2h | Encode/decode keys for storage (base64url, protobuf wire format) |
| 8 | Cross-platform tests | 3h | Same test vectors pass in Node.js, Bun, and Cloudflare Workers |
| 9 | Security audit prep | 1.5h | Document crypto choices, known limitations, upgrade path |

### US-011: QR Code Authentication (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Registration payload | 2h | Build initial client hello with identity keys |
| 2 | QR code data encoding | 2h | Encode ref, public key, and client ID into QR format |
| 3 | Auth handshake | 4h | Handle server challenge → sign → receive encrypted session keys |
| 4 | Credential extraction | 2h | Parse and store `creds` (noiseKey, signedIdentityKey, registrationId, advSecretKey) |
| 5 | QR refresh | 2h | Re-generate QR on timeout (every ~20s), handle max retries |
| 6 | Error states | 1h | Timeout, scan failure, multi-device limit reached |
| 7 | Integration test | 2h | Mock WA server simulating auth flow |

### US-012: Phone Pairing Code Authentication (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Pairing code request | 2h | Request numeric pairing code from WA servers |
| 2 | Code display interface | 1h | Event emission for UI to display 8-digit code |
| 3 | Pairing verification | 3h | Handle server ack, exchange encrypted credentials |
| 4 | Noise channel setup | 3h | Establish encrypted channel using phone's public key |
| 5 | Credential storage | 1.5h | Same credential storage path as QR flow |
| 6 | Fallback logic | 1.5h | If pairing code fails/times out, offer QR fallback |
| 7 | Unit tests | 2h | Mock pairing flow, timeout scenarios |

## Risks & Mitigations — Sprint 2a

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | WhatsApp protocol changes break Baileys fork assumptions | Medium | Critical | Pin to known-working protocol version; monitor `@whiskeysockets/baileys` issues daily |
| 2 | Web Crypto API missing operations in Workers runtime | Medium | High | Dev B to validate ALL needed operations D1; fallback to `@noble/hashes` if `subtle` lacks algo |
| 3 | Noise_XX implementation takes longer than 6h | High | High | Use `@noble/ciphers` for AES if Web Crypto is too complex; budget 2 overflow days |
| 4 | DO WebSocket Hibernation API edge cases | Medium | Medium | Test with Miniflare locally first; have non-hibernation fallback |
| 5 | QR auth requires real phone to test | Low | Medium | Use dedicated test phone number; record/replay for CI |
| 6 | US-012 spills to Sprint 2b | Medium | Low | Marked as should-have; QR alone is sufficient MVP auth |
| 7 | 36 points exceeds velocity | Medium | Medium | US-012 is buffer; crypto expertise from Dev B reduces estimation risk |

## Sprint Review Checklist — Sprint 2a

- [ ] `packages/engine` compiles and exports public API
- [ ] **Demo: QR code authentication** — generate QR, scan with phone, session established
- [ ] Node.js adapter connects to WhatsApp servers, maintains WebSocket
- [ ] DO adapter connects to WhatsApp servers via Cloudflare Workers
- [ ] Crypto stack passes all test vectors (Noise_XX handshake, Signal encrypt/decrypt)
- [ ] Same engine code works with both adapters (swap via config)
- [ ] Session credentials persist and allow reconnection without re-auth
- [ ] Phone pairing code flow works (if US-012 complete)
- [ ] All unit tests pass, crypto tests pass on Node.js + Bun + Workers

## Definition of Done Verification — Sprint 2a

```bash
# Build engine package
cd packages/engine
bun run build
# Expected: clean build, no type errors

# Crypto test suite
bun test src/crypto/
# Expected: all tests pass, including cross-platform vectors
# Tests cover: Noise_XX, double ratchet, AES-256-CBC, HKDF, HMAC, Curve25519

# Node.js adapter tests
bun test src/adapters/node/
# Expected: connection, reconnection, storage read/write all pass

# DO adapter tests (Miniflare)
bun test src/adapters/cloudflare/
# Expected: DO lifecycle, storage, WebSocket all pass in Miniflare

# Auth flow tests
bun test src/auth/
# Expected: QR generation, handshake simulation, credential storage pass

# Integration test (requires test phone — manual gate)
bun run test:integration:auth
# Expected: QR displayed → scan → "authenticated" event fires

# Full engine test suite
bun test --coverage
# Expected: > 70% coverage, all tests green

# Verify adapter interchangeability
ENGINE_ADAPTER=node bun run test:e2e:auth
ENGINE_ADAPTER=cloudflare bun run test:e2e:auth
# Expected: same test passes with both adapters
```

---

# Sprint 2b — Messaging & Resilience

## Sprint Goal

Enable full message send/receive capabilities (text, media, reactions, replies) and implement session state management with automatic reconnection — completing the WhatsApp engine's MVP feature set.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 2b |
| Start Date | 2026-06-30 (Monday) |
| End Date | 2026-07-11 (Friday) |
| Working Days | 10 |
| Phase | Phase 2 — WhatsApp Engine (cont.) |

> **Note:** Original plan called for 1 week (37 pts), but at 30 pts/sprint velocity this is a full 2-week sprint. US-012 may carry over from 2a as well.

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | Senior Full-Stack | 10 | Message protocol, state machine |
| Dev B | Backend/Infra | 10 | Media handling, DO integration |
| Dev C | Frontend | 10 | Message operations, testing |
| **Total** | | **30 person-days** | ~30 story points capacity |

## Sprint Backlog — 2b

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-012* | Phone Pairing Code Authentication (spillover) | 5 | Dev A | Must-have | US-011 | — |
| US-013 | Send Text Messages | 8 | Dev A | Must-have | US-007, US-010, US-011 | — |
| US-014 | Send Media Messages | 5 | Dev B | Must-have | US-013 | — |
| US-015 | Receive Incoming Messages | 5 | Dev C | Must-have | US-007, US-010 | — |
| US-016 | Message Operations | 3 | Dev C | Should-have | US-013, US-015 | — |
| US-017 | Session State Machine | 5 | Dev A | Must-have | US-007 | — |
| US-018 | Automatic Reconnection | 5 | Dev B | Must-have | US-017 | — |

**Total: 36 points** (31 if US-012 completed in 2a)

*US-012 included as contingency; if completed in 2a, team has buffer for hardening.

## Day-by-Day Schedule — Sprint 2b

### Week 1 (June 30 – July 4)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D1 Mon** | US-012: Complete spillover (if needed) OR US-017: State machine impl | US-018: Reconnection strategy design, exponential backoff | US-015: Incoming message frame parsing, decryption |
| **D2 Tue** | US-013: Message encoding — text payload, protobuf serialization | US-018: Connection health monitoring, heartbeat/ping-pong | US-015: Message type routing (text, media, notification, receipt) |
| **D3 Wed** | US-013: Message send flow — encrypt → frame → send → ack | US-014: Media upload flow — encrypt media, upload to WA CDN | US-015: Event emission for received messages, deduplication |
| **D4 Thu** | US-013: Delivery receipts, message ID tracking, retry on failure | US-014: Media types — image, video, audio, document, sticker | US-015: Message history sync (initial burst on connect) |
| **D5 Fri** | US-013: Group messages, broadcast lists, quoted replies | US-014: Thumbnail generation, media download URL signing | US-016: React to messages, delete/revoke messages |

### Week 2 (July 7–11)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|------------------|
| **D6 Mon** | US-017: State machine implementation — FSM with transition guards | US-018: Reconnection triggers — alarm, error, network change | US-016: Edit messages, star/unstar, forward |
| **D7 Tue** | US-017: State persistence, recovery from crash, event replay | US-018: Session resume (no re-auth), credential refresh | US-016: Unit tests for all message operations |
| **D8 Wed** | US-017: Health check protocol, connection quality metrics | US-018: DO-specific reconnection (alarm-triggered wake) | Integration testing: send + receive end-to-end |
| **D9 Thu** | Integration: full message lifecycle test (send → deliver → read) | Integration: media send/receive across both adapters | Stress testing: rapid messages, large media, concurrent sessions |
| **D10 Fri** | Sprint Review: demo full messaging flow | Final testing, documentation, perf benchmarks | Sprint Review prep, demo script, test report |

## Technical Tasks — Sprint 2b

### US-013: Send Text Messages (8 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Message payload construction | 3h | Protobuf message encoding, message ID generation (random bytes) |
| 2 | Encryption pipeline | 4h | Signal session → encrypt → wrap in binary frame with noise |
| 3 | Send & acknowledge | 3h | Write to socket, wait for server ack (tag-based correlation) |
| 4 | Retry mechanism | 2h | Retry on timeout/nack, idempotent message sends |
| 5 | Group messages | 3h | Sender key distribution, group encrypt (Signal Groups v2) |
| 6 | Reply/quote | 2h | `contextInfo` with quoted message reference |
| 7 | Delivery receipts | 2h | Parse incoming receipt stanzas, emit status updates |
| 8 | Rate limiting | 1h | Client-side rate limiter to avoid WA anti-spam |

### US-014: Send Media Messages (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Media encryption | 3h | Generate media key, encrypt with AES-256-CBC, calculate SHA-256 hashes |
| 2 | Upload to WA CDN | 3h | HTTP upload to `mmg.whatsapp.net`, handle auth headers |
| 3 | Media message payload | 2h | Build protobuf with `directPath`, `mediaKey`, `fileEncSha256`, `fileSha256` |
| 4 | Image handling | 2h | Thumbnail generation (canvas in Workers / sharp in Node.js), EXIF strip |
| 5 | Video/audio handling | 2h | Duration extraction, waveform for voice notes |
| 6 | Document handling | 1h | Filename, MIME type, page count for PDFs |
| 7 | Stickers | 1.5h | WebP format validation, animated sticker support |
| 8 | Download received media | 2h | Decrypt received media from URL, stream to caller |

### US-015: Receive Incoming Messages (5 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Frame parsing | 3h | Parse incoming binary frames, extract encrypted payload |
| 2 | Decryption | 2h | Signal session decrypt, verify MAC, handle out-of-order |
| 3 | Message type routing | 2h | Discriminate: text, media, reaction, receipt, notification, call |
| 4 | Event emission | 2h | Typed events: `messages.upsert`, `messages.update`, `messages.delete` |
| 5 | Deduplication | 1.5h | Track seen message IDs, handle server replays |
| 6 | History sync | 3h | Handle initial message dump on new session, batch processing |
| 7 | Acknowledgment | 1.5h | Send read receipts, delivery confirmations back to server |

### US-016: Message Operations (3 pts) — Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | React to message | 2h | Send reaction (emoji) to existing message by ID |
| 2 | Delete/revoke message | 2h | Revoke own message (everyone), delete for me |
| 3 | Edit message | 2h | Send edit payload with original message reference |
| 4 | Star/unstar | 1h | Toggle star status for bookmarking |
| 5 | Forward message | 1.5h | Forward with attribution, handle forwarded counter |
| 6 | Unit tests | 2h | Each operation with mock socket responses |

### US-017: Session State Machine (5 pts) — Dev A

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | FSM implementation | 4h | States: `idle`, `connecting`, `authenticating`, `open`, `closing`, `closed`, `reconnecting` |
| 2 | Transition guards | 2h | Valid transitions only, emit error on invalid transition attempt |
| 3 | State persistence | 3h | Serialize state to storage adapter, recover on process restart |
| 4 | Event hooks | 2h | `onStateChange` callbacks, promise-based `waitForState('open')` |
| 5 | Health monitoring | 2h | Ping interval, latency tracking, `stale` detection |
| 6 | Graceful shutdown | 1.5h | `close()` → flush pending sends → disconnect → `closed` |
| 7 | Tests | 2h | FSM transitions, concurrent state changes, crash recovery |

### US-018: Automatic Reconnection (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Reconnection triggers | 2h | Socket close, error, heartbeat timeout, DO alarm |
| 2 | Exponential backoff | 2h | 1s → 2s → 4s → 8s → 16s → max 60s, jitter |
| 3 | Session resume | 3h | Resume without full re-auth (reuse epoch, send resume stanza) |
| 4 | Credential refresh | 2h | Handle expired creds, trigger re-auth only when needed |
| 5 | Max retry limit | 1h | After N failures, emit `connection.failed`, stop retrying |
| 6 | DO alarm integration | 2h | Alarm wakes hibernated DO, triggers reconnect if session was active |
| 7 | Connection quality | 2h | Track success/failure rate, adaptive backoff based on history |
| 8 | Integration tests | 2h | Simulate network drops, verify automatic recovery |

## Risks & Mitigations — Sprint 2b

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Group message encryption (Sender Keys) is complex | High | High | Dev A to focus on 1:1 first; group support can be "should-have" |
| 2 | Media upload to WA CDN requires specific auth tokens | Medium | High | Analyze Baileys media upload code early D1; have raw binary fallback |
| 3 | History sync floods memory on large accounts | Medium | Medium | Stream processing with backpressure, limit initial sync to 30 days |
| 4 | State machine edge cases cause session corruption | Medium | High | Extensive property-based testing (fast-check), defensive transition guards |
| 5 | WA anti-spam triggers on rapid message testing | Medium | Medium | Rate limit test sends, use separate test numbers, add delays |
| 6 | 36 points slightly over velocity | Medium | Low | US-016 (3 pts) is should-have; can be partially delivered or deferred |

## Sprint Review Checklist — Sprint 2b

- [ ] **Demo: Send text message** — type message → encrypt → send → delivered ack
- [ ] **Demo: Send image** — upload media → send → recipient sees image
- [ ] **Demo: Receive message** — incoming message → decrypt → event fires → display
- [ ] **Demo: React to message** — send emoji reaction to received message
- [ ] **Demo: Reconnection** — kill WebSocket → engine auto-reconnects → no message loss
- [ ] Session state machine transitions visualized (log output showing state changes)
- [ ] Media types: image, video, audio, document all send successfully
- [ ] Both Node.js and DO adapters pass full message lifecycle test
- [ ] Phone pairing code auth works end-to-end (if spillover from 2a)
- [ ] Performance: < 200ms send latency for text messages

## Definition of Done Verification — Sprint 2b

```bash
# Full engine test suite
cd packages/engine
bun test --coverage
# Expected: > 75% coverage, all tests green

# Message send tests
bun test src/messages/send/
# Expected: text, media, group, reply all pass

# Message receive tests
bun test src/messages/receive/
# Expected: text, media, reactions, receipts, history sync

# Message operations
bun test src/messages/operations/
# Expected: react, delete, edit, star, forward

# State machine tests
bun test src/state/
# Expected: all transitions, persistence, recovery

# Reconnection tests
bun test src/connection/reconnect/
# Expected: backoff timing, resume flow, max retry, DO alarm

# Integration test — full lifecycle (requires test phone)
bun run test:integration:messaging
# Expected: send text → receive ack → receive reply → react → verify

# Media integration test
bun run test:integration:media
# Expected: upload image → send → recipient confirms receipt

# Cross-adapter verification
ENGINE_ADAPTER=node bun run test:e2e:messages
ENGINE_ADAPTER=cloudflare bun run test:e2e:messages
# Expected: identical behavior on both adapters

# Stress test
bun run test:stress --messages=100 --interval=500ms
# Expected: all messages delivered, no drops, reconnection if needed

# Build verification
bun run build
bun run typecheck
bun run lint
# Expected: all pass, no regressions from Sprint 2a
```

---

## Sprint 2 Summary

| Sprint | Duration | Points | Focus |
|--------|----------|--------|-------|
| 2a | Jun 16–27 | 36 | Engine scaffold, adapters, crypto, authentication |
| 2b | Jun 30–Jul 11 | 36 | Messaging (send/receive/operations), state machine, reconnection |
| **Total** | 4 weeks | 72 | Complete WhatsApp engine MVP |

### Critical Path

```
US-007 (Scaffold) → US-010 (Crypto) → US-011 (QR Auth) → US-013 (Send) → US-015 (Receive)
                  → US-008 (Node Adapter) ─────────────────────────────────┘
                  → US-009 (DO Adapter) ────────────────────────────────────┘
```

### Velocity Notes

- Sprint 1: 19 pts (comfortable, includes Sprint 2 prep)
- Sprint 2a: 36 pts (aggressive, 1 story is should-have buffer)
- Sprint 2b: 36 pts (aggressive, 1 story is should-have buffer)
- Running total after Sprint 2: 91 pts delivered over 6 weeks
