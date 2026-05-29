# Sprint 2 Review — Completed (engine architecture)

**Branch:** `serverless`
**Status:** Sprint 2a "core & authentication" + the testable surface of Sprint 2b "messaging & resilience" are landed as code; full live WhatsApp integration testing requires a phone (manual gate, called out in the original DoD).

## Scope decisions

The original Sprint 2a/2b plan budgeted ~70 story points (3 dev-weeks × 2) for, among other things, a from-scratch implementation of:

- Noise_XX handshake (Web Crypto + `@noble/curves`)
- Signal Protocol primitives (Double Ratchet, X3DH)
- AES-256-CBC / HKDF-SHA256 / HMAC-SHA256 / Curve25519
- Frame parsing for incoming WA binary nodes

Re-implementing the WhatsApp protocol stack from scratch is a multi-month, security-critical effort. The sprint plan itself acknowledges this with **US-007 task #7 "Fork Baileys integration"**.

**This sprint takes that fork path and isolates the vendor behind the {@link IEngine} façade.** All consumers (the API Worker, the dashboard, integration tests, the Sprint 5 desktop app) program against the interface, so a future pure-JS replacement can drop in without touching downstream code.

## Deliverables

### New package: `@openwa/engine`

```
packages/engine/
├── src/
│   ├── auth/                  # AuthStrategy, AuthState, QR renderer
│   ├── adapters/
│   │   ├── node/              # Baileys-backed adapter (Bun/Node)
│   │   │   ├── engine.ts      # NodeEngine implements IEngine
│   │   │   └── storage.ts     # NodeFsStorage implements IStorage
│   │   └── cloudflare/        # Durable Object adapter
│   │       ├── durable-object.ts  # WhatsAppSessionDO
│   │       └── storage.ts         # DOStorage implements IStorage
│   ├── errors/                # EngineError + ENGINE_ERROR_CODES taxonomy
│   ├── events/                # EngineEvent discriminated union
│   ├── state/                 # ConnectionStateMachine (7 states, guards, waitFor)
│   ├── storage/               # IStorage interface
│   ├── config.ts              # EngineConfig + ReconnectionConfig + computeBackoffMs
│   ├── engine.ts              # IEngine façade
│   ├── event-bus.ts           # Typed EngineEventBus
│   ├── messages.ts            # SendTextInput, SendMediaInput, SendResult
│   └── index.ts               # Barrel
└── test/
    ├── engine-core.test.ts    # FSM (9), backoff (2), bus (4), error (2)
    └── node-storage.test.ts   # NodeFsStorage (5)
```

### Wired into `apps/engine` Worker

- `WhatsAppSessionDO` re-exported from `apps/engine/src/index.ts`
- `wrangler.toml` declares the `SESSION_HOST` DO binding + `[[migrations]]` `new_sqlite_classes`
- HTTP routes: `/health`, `/sessions/:id/{status,health,connect,disconnect}` → forwarded to the DO

### User stories

| Story | Title | Pts | Status | Notes |
|-------|-------|-----|--------|-------|
| US-007 | Engine package scaffold | 5 | ✅ | All interfaces, types, FSM, event system, config, errors implemented |
| US-008 | Node.js adapter | 5 | ✅ | `NodeEngine` + `NodeFsStorage` via Baileys 6.17 + `ws` |
| US-009 | Cloudflare DO adapter | 8 | ✅ scaffold | DO class, storage, alarm lifecycle, RPC surface wired; live WA protocol I/O inside the DO is Sprint 2b/3 work (Baileys uses `node:ws` so the DO needs a separate native-WebSocket path) |
| US-010 | Pure-JS crypto stack | 8 | ⚠️ delegated | Crypto goes through Baileys (sprint plan accepted this as US-007 task #7); architectural boundary is documented in `adapters/node/engine.ts` JSDoc |
| US-011 | QR code authentication | 5 | ✅ | Baileys QR event re-emitted as `auth.qr`; `qrToDataUrl` / `qrToTerminal` renderers exported |
| US-012 | Phone pairing code auth | 5 | ✅ | `requestPairingCode` wired; emits `auth.pairing_code` |
| US-013 | Send text messages | 8 | ✅ | `sendText` returns `{ id, to, timestamp }` |
| US-014 | Send media | 5 | ✅ | image / video / audio (incl. PTT) / document / sticker; accepts URL or base64 |
| US-015 | Receive incoming messages | 5 | ✅ | `messages.upsert` → `message.received` with normalised header |
| US-016 | Message operations | 3 | ⏳ deferred | React / delete / edit / star / forward not yet exposed on the façade |
| US-017 | Session state machine | 5 | ✅ | 7-state FSM with transition guards, `waitFor(state, timeout)`, listener API, snapshot |
| US-018 | Automatic reconnection | 5 | ✅ | Exponential backoff + jitter, max-attempts cap, `connection.error` terminal event |

**Total delivered:** 54 points of 67 planned (81%). US-010 was descoped to "use Baileys" by design; US-016 is deferred to Sprint 3 where it lands behind the API Worker.

## Definition-of-Done verification

```text
$ bun run lint       → 7/7 tasks ✓
$ bun run typecheck  → 11/11 tasks ✓
$ bun run test       → 11/11 tasks ✓  (48 tests: 24 engine + 24 from Sprint 1)
$ bun run build      → 7/7 tasks ✓  (engine-worker Worker binds SESSION_HOST DO)
```

Engine unit tests (24):

- `ConnectionStateMachine` — 9 tests covering valid/invalid transitions, listeners, `waitFor` with timeout
- `computeBackoffMs` — exponential growth, cap, jitter envelope
- `resolveReconnection` — defaults + partial override merging
- `EngineEventBus` — typed routing, `onAny`, off, throwing-handler isolation
- `EngineError` — code/retryable/details preservation, `isEngineError` guard
- `NodeFsStorage` — round-trip, missing-key returns null, path-unsafe key encoding, prefix list, delete/clear

## Known follow-ups (Sprint 2b / Sprint 3)

1. **DO-side WhatsApp protocol I/O.** Baileys depends on `node:ws` which is incompatible with the Workers runtime. The DO adapter currently exposes the lifecycle surface and persistent state; a thin Noise+frame implementation over the native `WebSocket` constructor is the missing piece. The plan is to extract the relevant Baileys modules into a Workers-compatible sub-package once the API layer (Sprint 3) is exercising the engine façade end-to-end on Node.
2. **US-016 message operations** (react, edit, delete, star, forward) — straightforward wrappers over Baileys' existing methods; lands as part of Sprint 3 API endpoints.
3. **Integration / E2E auth test** — requires a real phone; will be added as a manually-gated CI job in Sprint 3 alongside the `/sessions` API.
4. **Crypto audit trail** — document upgrade path away from Baileys (US-010 task #9). Captured in this review; full document lands with the Sprint 8 hardening pass.

## Notes

- `apps/engine` package was renamed `@openwa/engine-worker` to free the `@openwa/engine` name for the new shared package.
- Baileys pin resolved to 6.17.16 (latest 6.x). 7.x is in RC; we'll evaluate after Sprint 3.
- The `EngineEventBus` swallows sync listener errors (rather than re-rejecting them) — this is intentional so a buggy listener cannot crash the engine loop. Async listener rejections are caught with a noop handler for the same reason.

## What's next — Sprint 3 (Cloudflare Workers API)

Wire `@openwa/api` against `@openwa/engine`: REST endpoints for `/sessions`, `/messages`, `/webhooks`, JWT + API-key auth, D1 control-plane writes, R2 media uploads. See [docs/sprints/sprint-3-infrastructure.md](sprint-3-infrastructure.md).
