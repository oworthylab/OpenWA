# OpenWA Serverless Rewrite — Complete Plan

## Executive Summary

Rewrite OpenWA from a monolithic NestJS + Puppeteer + Docker application into a **serverless multi-tenant SaaS** running on Cloudflare's edge platform at **$5/month flat**. Add an Electron desktop app as a zero-cost self-hosted option. Integrate with the Mart e-commerce platform as a CRM/messaging bridge.

---

## 1. Architecture Overview

### Deployment Targets

| Target | Engine Location | Cost | Uptime |
|--------|----------------|:----:|:------:|
| **Cloud (Serverless)** | Durable Objects | $5/mo | 24/7 |
| **Desktop (Electron)** | Local Node.js process | $0 | When PC is on |
| **Hybrid** | Desktop engine + Cloud API/CRM | $0-5 | Mixed |

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ Cloudflare ($5/month Workers Paid Plan)                             │
│                                                                     │
│  Pages ──────────── Dashboard (TanStack Start + React)               │
│  Workers ─────────── REST API (Elysia, external consumers only)     │
│  Durable Objects ─── WhatsApp Engine (Baileys fork, 1 DO/session)   │
│  Durable Objects ─── WebSocket Relay (real-time dashboard events)   │
│  D1 (Control) ────── Tenants, API keys, plans, billing              │
│  D1 (×N Tenant) ──── Sessions, messages, contacts, webhooks, CRM   │
│  Queues ──────────── Webhook delivery (with retries)                │
│  KV ─────────────── API key cache, rate limiting, session tokens    │
│  R2 ─────────────── Media storage (images, videos, documents)       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Electron Desktop App (Optional, $0)                                 │
│                                                                     │
│  Main Process ────── Local Baileys engine (same core, Node adapter) │
│  Renderer ────────── React UI (shared @openwa/ui package)           │
│  System Tray ─────── Background operation                           │
│  Sync Layer ──────── Optional state sync to cloud                   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Web Framework** | Astro 6 + @astrojs/cloudflare | SSR on Workers, React islands, edge-native |
| **API Framework** | Elysia | End-to-end type safety, Eden Treaty client, fast on Workers |
| **WhatsApp Engine** | Custom Baileys fork | Pure JS, no browser, ~30MB RAM, WebSocket-only |
| **Database** | Drizzle ORM + NeonDB (PostgreSQL) | Serverless Postgres, branching, auto-suspend |
| **Desktop** | Electron + React | Cross-platform, full Node.js, shares UI components |
| **Package Manager** | Bun | Fast installs, workspace support, native TS |
| **Build System** | Turborepo | Incremental builds, task pipelines |
| **Linter/Formatter** | Biome | Fast, single tool replaces ESLint + Prettier |
| **Validation** | Valibot | Lightweight schema validation (tree-shakeable) |
| **Auth** | better-auth + API keys | Session auth for dashboard, API keys for programmatic access |
| **Real-time** | Durable Objects WebSocket / Electron IPC | Native WebSocket in DO, IPC for desktop |
| **Monorepo Scope** | `@openwa/` | All packages prefixed with `@openwa/` |

---

## 3. Monorepo Structure

```
openwa/
├── apps/
│   ├── dashboard/                → TanStack Start (Full React SPA + Server Functions)
│   │   ├── app/
│   │   │   ├── routes/           → File-based routes (TanStack Router)
│   │   │   ├── server/           → Server functions (D1/DO direct access)
│   │   │   ├── components/       → React components
│   │   │   └── lib/              → Utilities, hooks
│   │   ├── app.config.ts
│   │   ├── vite.config.ts        → @cloudflare/vite-plugin
│   │   └── wrangler.jsonc
│   │
│   └── desktop/                  → Electron application
│       ├── electron/
│       │   ├── main.ts           → Main process entry
│       │   ├── engine-manager.ts → Local Baileys session manager
│       │   ├── ipc-handlers.ts   → IPC bridge (renderer ↔ main)
│       │   ├── tray.ts           → System tray integration
│       │   ├── auto-updater.ts   → Auto-update via GitHub Releases
│       │   └── sync.ts           → Cloud sync (optional)
│       ├── src/                  → React renderer (uses @openwa/ui)
│       ├── package.json
│       └── electron-builder.yml
│
├── services/
│   └── api/                      → Elysia on Cloudflare Workers
│       ├── src/
│       │   ├── index.ts          → Worker entry point
│       │   ├── routes/
│       │   │   ├── sessions.ts   → Session CRUD + QR + start/stop
│       │   │   ├── messages.ts   → Send text/image/video/doc/etc.
│       │   │   ├── contacts.ts   → Contact management
│       │   │   ├── groups.ts     → Group management
│       │   │   ├── webhooks.ts   → Webhook CRUD
│       │   │   ├── labels.ts     → Label management
│       │   │   ├── status.ts     → WhatsApp Status/Stories
│       │   │   ├── channels.ts   → Newsletter/Channels
│       │   │   ├── catalog.ts    → Business catalog
│       │   │   ├── crm.ts        → CRM contacts/conversations/tags
│       │   │   ├── auth.ts       → API key management
│       │   │   └── health.ts     → Health/readiness probes
│       │   ├── middleware/
│       │   │   ├── auth.ts       → API key validation
│       │   │   ├── tenant.ts     → Tenant resolution
│       │   │   └── rate-limit.ts → Rate limiting via KV
│       │   └── lib/
│       │       ├── do-client.ts  → Durable Object RPC wrapper
│       │       └── errors.ts     → Error codes & responses
│       ├── wrangler.jsonc
│       └── package.json
│
├── workers/
│   └── wa-session/               → Durable Object (WhatsApp engine host)
│       ├── src/
│       │   ├── index.ts          → DO class definition
│       │   ├── session-do.ts     → Session lifecycle state machine
│       │   ├── websocket-handler.ts → Inbound WS from dashboard clients
│       │   └── event-emitter.ts  → Route WA events to queues/WS
│       ├── wrangler.jsonc
│       └── package.json
│
├── packages/
│   ├── engine/                   → WhatsApp engine (Baileys fork)
│   │   ├── src/
│   │   │   ├── core/
│   │   │   │   ├── connection.ts     → WebSocket connection management
│   │   │   │   ├── session.ts        → Session state machine
│   │   │   │   └── events.ts         → Event types & emitter
│   │   │   ├── crypto/
│   │   │   │   ├── noise.ts          → Noise_XX handshake
│   │   │   │   ├── signal.ts         → Signal Protocol (X3DH + Double Ratchet)
│   │   │   │   ├── sender-keys.ts    → Group messaging (Sender Keys)
│   │   │   │   ├── keys.ts           → Key generation (Curve25519, Ed25519)
│   │   │   │   └── hkdf.ts           → HKDF key derivation
│   │   │   ├── protocol/
│   │   │   │   ├── binary-node.ts    → WA binary XML node encode/decode
│   │   │   │   ├── protobuf/         → Generated .proto types
│   │   │   │   ├── stanzas.ts        → Message stanza builders
│   │   │   │   └── constants.ts      → Protocol constants
│   │   │   ├── media/
│   │   │   │   ├── upload.ts         → Encrypt + upload to WA CDN
│   │   │   │   └── download.ts       → Download + decrypt from WA CDN
│   │   │   ├── auth/
│   │   │   │   ├── qr.ts            → QR code generation
│   │   │   │   ├── pairing-code.ts  → Phone pairing flow
│   │   │   │   └── registration.ts  → Device registration
│   │   │   ├── adapters/
│   │   │   │   ├── interface.ts      → ISessionStorage, ISocketProvider
│   │   │   │   ├── cloudflare.ts     → DO storage + CF WebSocket
│   │   │   │   └── node.ts           → FS storage + ws package
│   │   │   └── index.ts             → IWhatsAppEngine implementation
│   │   └── package.json
│   │
│   ├── db/                       → Drizzle ORM + Cloudflare D1 (SQLite)
│   │   ├── src/
│   │   │   ├── schema/           → SQLite schemas (no tenant_id — DB-per-tenant)
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── messages.ts
│   │   │   │   ├── contacts.ts
│   │   │   │   ├── webhooks.ts
│   │   │   │   ├── api-keys.ts
│   │   │   │   ├── labels.ts
│   │   │   │   ├── groups.ts
│   │   │   │   └── crm.ts
│   │   │   ├── control-plane/    → Control plane schema (tenants, plans, billing)
│   │   │   │   └── tenants.ts
│   │   │   ├── client.ts         → D1 binding wrapper + tenant DB resolver
│   │   │   ├── migrate.ts        → Cross-tenant migration runner
│   │   │   └── index.ts          → Exports
│   │   ├── drizzle/              → Generated migrations
│   │   └── package.json
│   │
│   ├── ui/                       → Shared React components
│   │   ├── src/
│   │   │   ├── components/       → shadcn/ui based components
│   │   │   ├── hooks/            → Shared React hooks
│   │   │   └── lib/              → Utilities
│   │   └── package.json
│   │
│   ├── validators/               → Shared Valibot schemas
│   │   ├── src/
│   │   │   ├── session.ts
│   │   │   ├── message.ts
│   │   │   ├── webhook.ts
│   │   │   ├── contact.ts
│   │   │   └── tenant.ts
│   │   └── package.json
│   │
│   └── shared/                   → Shared types & constants
│       ├── src/
│       │   ├── types/            → TypeScript interfaces
│       │   ├── events.ts         → Event schema definitions
│       │   ├── errors.ts         → Error code constants
│       │   └── config.ts         → Shared config types
│       └── package.json
│
├── _ref/
│   └── mart/                     → Mart e-commerce (reference)
│
├── docs/                         → Documentation
├── biome.json                    → Biome config (linting + formatting)
├── turbo.json                    → Turborepo pipeline config
├── package.json                  → Root workspace config
├── bun.lock
└── bunfig.toml
```

---

## 4. WhatsApp Engine (`packages/engine`)

### Approach: Fork & Adapt Baileys

We fork the Baileys protocol implementation (pure TypeScript, no browser dependency) and restructure it with a **dual-adapter pattern** so the same engine core runs in both Cloudflare Durable Objects and Node.js (Electron).

### Why Not Write From Scratch

| Factor | Fork Baileys | Write From Scratch |
|--------|:---:|:---:|
| Time to working engine | 4-6 weeks | 3-6 months |
| Protocol correctness | Proven (4+ years) | Must reverse-engineer |
| Community updates | Track upstream patches | All on you |
| Risk of breakage | Low (known issues) | Very high |
| Full ownership | Yes (MIT fork) | Yes |

### Protocol Stack

```
Layer 5: Application (send/receive messages, groups, contacts)
Layer 4: Protobuf (binary message serialization, ~200 types)
Layer 3: Signal Protocol (E2E encryption, Double Ratchet, X3DH)
Layer 2: Noise Protocol (transport encryption, Noise_XX handshake)
Layer 1: WebSocket (wss://web.whatsapp.net/ws/chat)
```

### Cryptographic Requirements

| Algorithm | Purpose | CF Workers Support |
|-----------|---------|:------------------:|
| Curve25519 (ECDH) | Noise + Signal key exchange | `@noble/curves` |
| Ed25519 (sign) | Identity verification | `@noble/curves` |
| AES-256-GCM | Frame + media encryption | ✅ Web Crypto native |
| AES-256-CBC | Legacy media decryption | ✅ Web Crypto native |
| HMAC-SHA256 | Key derivation, MAC | ✅ Web Crypto native |
| HKDF-SHA256 | Key derivation | ✅ Web Crypto native |
| SHA-256/512 | Hashing | ✅ Web Crypto native |

### Adapter Pattern

```typescript
// packages/engine/src/adapters/interface.ts
interface ISessionStorage {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  getAll(prefix: string): Promise<Map<string, Uint8Array>>;
}

interface ISocketProvider {
  connect(url: string): WebSocket;
  // Returns platform-appropriate WebSocket
}

// packages/engine/src/adapters/cloudflare.ts
class CloudflareAdapter implements ISessionStorage, ISocketProvider {
  constructor(private state: DurableObjectState) {}
  async get(key: string) { return this.state.storage.get<Uint8Array>(key) ?? null; }
  async set(key: string, value: Uint8Array) { await this.state.storage.put(key, value); }
  connect(url: string) { return new WebSocket(url); } // CF native WebSocket
}

// packages/engine/src/adapters/node.ts
class NodeAdapter implements ISessionStorage, ISocketProvider {
  constructor(private dir: string) {}
  async get(key: string) { /* read from filesystem */ }
  async set(key: string, value: Uint8Array) { /* write to filesystem */ }
  connect(url: string) { return new (require('ws'))(url); }
}
```

### Session State (Persisted in DO Storage or FS)

```typescript
interface PersistedSessionState {
  // Noise Protocol
  noiseStaticKeyPair: { private: Uint8Array; public: Uint8Array };

  // Signal Protocol
  identityKeyPair: { private: Uint8Array; public: Uint8Array };
  registrationId: number;
  signedPreKey: { keyId: number; keyPair: KeyPair; signature: Uint8Array };
  preKeys: { keyId: number; keyPair: KeyPair }[];

  // Signal Sessions (per contact JID)
  signalSessions: Map<string, Uint8Array>; // serialized session records

  // Sender Keys (per group)
  senderKeys: Map<string, Uint8Array>;

  // WhatsApp Auth
  advSecretKey: Uint8Array;
  phoneNumber: string;
  pushName: string;
  routingInfo: Uint8Array;
  platform: string;
}
```

### Engine Interface Contract

```typescript
interface IWhatsAppEngine {
  // Lifecycle
  initialize(): Promise<void>;
  disconnect(): Promise<void>;
  logout(): Promise<void>;
  destroy(): Promise<void>;
  getStatus(): SessionStatus;

  // Auth
  getQRCode(): Promise<string | null>;
  getPairingCode(phoneNumber: string): Promise<string>;

  // Messaging
  sendText(chatId: string, text: string, options?: MessageOptions): Promise<MessageResult>;
  sendImage(chatId: string, media: MediaInput, caption?: string): Promise<MessageResult>;
  sendVideo(chatId: string, media: MediaInput, caption?: string): Promise<MessageResult>;
  sendAudio(chatId: string, media: MediaInput, ptt?: boolean): Promise<MessageResult>;
  sendDocument(chatId: string, media: MediaInput, filename: string): Promise<MessageResult>;
  sendLocation(chatId: string, lat: number, lng: number): Promise<MessageResult>;
  sendContact(chatId: string, contact: ContactCard): Promise<MessageResult>;
  sendSticker(chatId: string, media: MediaInput): Promise<MessageResult>;
  replyTo(chatId: string, messageId: string, text: string): Promise<MessageResult>;
  forward(chatId: string, messageId: string, toChatId: string): Promise<MessageResult>;
  react(chatId: string, messageId: string, emoji: string): Promise<void>;
  deleteMessage(chatId: string, messageId: string, forEveryone?: boolean): Promise<void>;

  // Contacts
  getContacts(): Promise<Contact[]>;
  getContactById(jid: string): Promise<Contact>;
  checkNumberExists(phone: string): Promise<{ exists: boolean; jid: string }>;
  getProfilePicture(jid: string): Promise<string | null>;
  blockContact(jid: string): Promise<void>;
  unblockContact(jid: string): Promise<void>;

  // Groups
  getGroups(): Promise<Group[]>;
  getGroupInfo(groupId: string): Promise<GroupInfo>;
  createGroup(name: string, participants: string[]): Promise<Group>;
  addParticipants(groupId: string, participants: string[]): Promise<void>;
  removeParticipants(groupId: string, participants: string[]): Promise<void>;
  promoteParticipants(groupId: string, participants: string[]): Promise<void>;
  demoteParticipants(groupId: string, participants: string[]): Promise<void>;
  leaveGroup(groupId: string): Promise<void>;
  setGroupSubject(groupId: string, subject: string): Promise<void>;
  setGroupDescription(groupId: string, description: string): Promise<void>;
  getGroupInviteCode(groupId: string): Promise<string>;
  revokeGroupInviteCode(groupId: string): Promise<string>;

  // Labels (Business)
  getLabels(): Promise<Label[]>;
  getLabelById(labelId: string): Promise<Label>;
  addLabelToChat(chatId: string, labelId: string): Promise<void>;
  removeLabelFromChat(chatId: string, labelId: string): Promise<void>;

  // Channels/Newsletter
  getSubscribedChannels(): Promise<Channel[]>;
  getChannelById(channelId: string): Promise<Channel>;
  subscribeToChannel(channelId: string): Promise<void>;
  unsubscribeFromChannel(channelId: string): Promise<void>;

  // Status/Stories
  getStatuses(): Promise<Status[]>;
  postTextStatus(text: string, options?: StatusOptions): Promise<void>;
  postImageStatus(media: MediaInput, caption?: string): Promise<void>;
  postVideoStatus(media: MediaInput, caption?: string): Promise<void>;
  deleteStatus(statusId: string): Promise<void>;

  // Catalog (Business)
  getCatalog(): Promise<CatalogProduct[]>;
  getProductById(productId: string): Promise<CatalogProduct>;

  // Events
  on(event: 'qr', handler: (qr: string) => void): void;
  on(event: 'ready', handler: (info: ConnectionInfo) => void): void;
  on(event: 'message', handler: (message: IncomingMessage) => void): void;
  on(event: 'message.ack', handler: (ack: MessageAck) => void): void;
  on(event: 'disconnected', handler: (reason: string) => void): void;
  on(event: 'state.changed', handler: (state: SessionStatus) => void): void;
}
```

---

## 5. Durable Object: Session Host (`workers/wa-session`)

### Lifecycle & State Machine

```
CREATED → CONNECTING → QR_READY → SCANNING → AUTHENTICATED → CONNECTED
                                                      │
                                              DISCONNECTED → RECONNECTING → CONNECTED
                                                      │
                                                   LOGGED_OUT
```

### DO Responsibilities

1. **Hosts one Baileys engine instance** per WhatsApp session
2. **Maintains persistent WebSocket** to WhatsApp servers
3. **Accepts inbound WebSocket** connections from dashboard clients (live events)
4. **Uses Alarm API** for keep-alive pings (every 25s) and reconnection
5. **Hibernation-aware** — stores auth state in DO storage, reconnects on wake
6. **Emits events to Queue** — incoming messages → Cloudflare Queue → webhook delivery

### Resource Limits

| Resource | DO Limit | Engine Usage | Status |
|----------|:--------:|:------------:|:------:|
| Memory | 128MB | ~30-50MB | ✅ Safe |
| CPU per request | 30s | <1s per message | ✅ Safe |
| Storage | Unlimited (KV-style) | ~50-200KB per session | ✅ Safe |
| WebSocket connections | Unlimited outbound | 1 to WhatsApp | ✅ Safe |
| Alarm interval | Minimum 1s | 25s keep-alive | ✅ Safe |

### DO WebSocket Protocol (Dashboard ↔ DO)

```typescript
// Client → DO
{ type: 'subscribe', sessionId: string }
{ type: 'send-message', chatId: string, text: string }
{ type: 'request-qr' }

// DO → Client
{ type: 'qr', data: string }
{ type: 'status', state: SessionStatus }
{ type: 'message', data: IncomingMessage }
{ type: 'ack', messageId: string, status: AckStatus }
```

---

## 6. Database Schema (`packages/db`)

### Cloudflare D1 — Database-Per-Tenant Architecture

**Model:** Each tenant gets their own isolated D1 database. A control plane D1 holds tenant metadata.

```
Control Plane (D1: openwa-control)
├── tenants
├── api_keys
├── plans
└── billing

Per-Tenant (D1: openwa-tenant-{slug})
├── sessions
├── messages
├── contacts
├── webhooks
├── labels
├── conversations
└── audit_log
```

### Control Plane Schema (SQLite via Drizzle sqlite-core)

```sql
-- Control plane DB: tenants & API keys (global)
CREATE TABLE tenants (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'business')),
  max_sessions INTEGER NOT NULL DEFAULT 1,
  d1_database_id TEXT,                             -- CF D1 database ID for this tenant
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- API Keys (in control plane for global auth lookup)
CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  key_hash    TEXT NOT NULL UNIQUE,                -- SHA-256 of actual key
  key_prefix  TEXT NOT NULL,                       -- First 8 chars for identification
  role        TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
  allowed_ips TEXT DEFAULT '[]',                   -- JSON array
  allowed_sessions TEXT DEFAULT '[]',              -- JSON array
  is_active   INTEGER NOT NULL DEFAULT 1,
  expires_at  INTEGER,
  last_used_at INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_api_keys_tenant ON api_keys(tenant_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

### Per-Tenant Schema (SQLite — no tenant_id needed!)

```sql
-- Sessions (WhatsApp connections)
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name        TEXT NOT NULL UNIQUE,
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'created'
              CHECK (status IN ('created','initializing','qr_ready','authenticating','ready','disconnected','failed')),
  do_id       TEXT,                                -- Durable Object ID
  push_name   TEXT,
  proxy_url   TEXT,
  proxy_type  TEXT,
  config      TEXT DEFAULT '{}',                   -- JSON serialized
  connected_at INTEGER,
  last_active_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Messages (stored for CRM/history)
CREATE TABLE messages (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wa_id       TEXT NOT NULL,                       -- WhatsApp message ID
  chat_id     TEXT NOT NULL,
  from_jid    TEXT,
  to_jid      TEXT,
  type        TEXT NOT NULL DEFAULT 'text',        -- text|image|video|audio|document|location|contact|sticker
  body        TEXT,
  media_url   TEXT,                                -- R2 URL if media stored
  media_mime  TEXT,
  direction   TEXT NOT NULL DEFAULT 'outgoing' CHECK (direction IN ('incoming', 'outgoing')),
  status      TEXT DEFAULT 'sent' CHECK (status IN ('pending','sent','delivered','read','failed')),
  metadata    TEXT DEFAULT '{}',                   -- JSON
  wa_timestamp INTEGER NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_id, wa_id)
);

-- Contacts (CRM)
CREATE TABLE contacts (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  wa_id       TEXT NOT NULL UNIQUE,                -- phone@c.us
  phone       TEXT NOT NULL,
  name        TEXT,
  push_name   TEXT,
  tags        TEXT DEFAULT '[]',                   -- JSON array
  metadata    TEXT DEFAULT '{}',                   -- JSON (custom fields)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Webhooks
CREATE TABLE webhooks (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id  TEXT REFERENCES sessions(id) ON DELETE CASCADE,  -- NULL = all sessions
  url         TEXT NOT NULL,
  events      TEXT NOT NULL DEFAULT '["message.received"]',    -- JSON array
  secret      TEXT,                                -- HMAC signing secret
  headers     TEXT DEFAULT '{}',                   -- JSON
  active      INTEGER NOT NULL DEFAULT 1,
  retry_count INTEGER DEFAULT 3,
  last_triggered_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Labels
CREATE TABLE labels (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  wa_label_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_id, wa_label_id)
);

-- CRM Conversations (aggregated chat view)
CREATE TABLE conversations (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  contact_id  TEXT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  chat_id     TEXT NOT NULL,
  last_message_at INTEGER,
  unread_count INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'open' CHECK (status IN ('open','closed','archived')),
  assigned_to TEXT,                                -- Agent/team assignment
  metadata    TEXT DEFAULT '{}',                   -- JSON
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(session_id, chat_id)
);

-- Audit Log
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  resource_id TEXT,
  actor       TEXT NOT NULL,                       -- API key prefix or user
  details     TEXT,                                -- JSON
  ip_address  TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Indexes (per-tenant DB — no tenant_id filtering needed)
CREATE INDEX idx_messages_chat ON messages(session_id, chat_id, wa_timestamp DESC);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_webhooks_session ON webhooks(session_id, active);
CREATE INDEX idx_conversations_session ON conversations(session_id, last_message_at DESC);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
```

---

## 7. API Design (`services/api`)

### Elysia REST API — Endpoint Map

All endpoints require `X-API-Key` header. Tenant is resolved from the API key.

#### Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions` | List all sessions for tenant |
| POST | `/sessions` | Create new session |
| GET | `/sessions/:id` | Get session details |
| DELETE | `/sessions/:id` | Delete session |
| POST | `/sessions/:id/start` | Start session (connect to WA) |
| POST | `/sessions/:id/stop` | Stop session (disconnect) |
| GET | `/sessions/:id/qr` | Get QR code for scanning |
| POST | `/sessions/:id/pairing-code` | Get pairing code (alternative to QR) |
| POST | `/sessions/:id/logout` | Logout from WhatsApp |

#### Messages

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sessions/:id/messages/text` | Send text message |
| POST | `/sessions/:id/messages/image` | Send image |
| POST | `/sessions/:id/messages/video` | Send video |
| POST | `/sessions/:id/messages/audio` | Send audio/voice note |
| POST | `/sessions/:id/messages/document` | Send document |
| POST | `/sessions/:id/messages/location` | Send location |
| POST | `/sessions/:id/messages/contact` | Send contact card |
| POST | `/sessions/:id/messages/sticker` | Send sticker |
| POST | `/sessions/:id/messages/reaction` | React to message |
| POST | `/sessions/:id/messages/reply` | Reply to message |
| POST | `/sessions/:id/messages/forward` | Forward message |
| DELETE | `/sessions/:id/messages/:msgId` | Delete message |
| POST | `/sessions/:id/messages/bulk` | Bulk send (queued) |
| GET | `/sessions/:id/messages` | Get message history |

#### Contacts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/:id/contacts` | List contacts |
| GET | `/sessions/:id/contacts/:jid` | Get contact info |
| POST | `/sessions/:id/contacts/check` | Check if number on WA |
| GET | `/sessions/:id/contacts/:jid/photo` | Get profile picture |
| POST | `/sessions/:id/contacts/:jid/block` | Block contact |
| POST | `/sessions/:id/contacts/:jid/unblock` | Unblock contact |

#### Groups

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/:id/groups` | List all groups |
| POST | `/sessions/:id/groups` | Create group |
| GET | `/sessions/:id/groups/:gid` | Get group info |
| PATCH | `/sessions/:id/groups/:gid` | Update group (subject/description) |
| DELETE | `/sessions/:id/groups/:gid/leave` | Leave group |
| POST | `/sessions/:id/groups/:gid/participants/add` | Add participants |
| POST | `/sessions/:id/groups/:gid/participants/remove` | Remove participants |
| POST | `/sessions/:id/groups/:gid/participants/promote` | Promote to admin |
| POST | `/sessions/:id/groups/:gid/participants/demote` | Demote from admin |
| GET | `/sessions/:id/groups/:gid/invite-code` | Get invite link |
| POST | `/sessions/:id/groups/:gid/invite-code/revoke` | Revoke invite link |

#### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/:id/webhooks` | List webhooks |
| POST | `/sessions/:id/webhooks` | Create webhook |
| PATCH | `/sessions/:id/webhooks/:wid` | Update webhook |
| DELETE | `/sessions/:id/webhooks/:wid` | Delete webhook |

#### Labels

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/:id/labels` | List labels |
| POST | `/sessions/:id/labels/:lid/chats/:chatId` | Add label to chat |
| DELETE | `/sessions/:id/labels/:lid/chats/:chatId` | Remove label from chat |

#### Channels/Newsletter

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/:id/channels` | List subscribed channels |
| GET | `/sessions/:id/channels/:cid` | Get channel info |
| POST | `/sessions/:id/channels/:cid/subscribe` | Subscribe |
| POST | `/sessions/:id/channels/:cid/unsubscribe` | Unsubscribe |

#### Status/Stories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sessions/:id/status` | Get statuses |
| POST | `/sessions/:id/status/text` | Post text status |
| POST | `/sessions/:id/status/image` | Post image status |
| POST | `/sessions/:id/status/video` | Post video status |
| DELETE | `/sessions/:id/status/:sid` | Delete status |

#### CRM (Multi-tenant)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/crm/contacts` | List CRM contacts (with tags, metadata) |
| POST | `/crm/contacts` | Create/import CRM contact |
| PATCH | `/crm/contacts/:id` | Update contact (tags, metadata) |
| GET | `/crm/conversations` | List conversations |
| PATCH | `/crm/conversations/:id` | Update (assign, close, archive) |
| GET | `/crm/tags` | List all tags |
| POST | `/crm/tags` | Create tag |

#### Auth & Tenant

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/api-keys` | Create new API key |
| GET | `/auth/api-keys` | List API keys |
| DELETE | `/auth/api-keys/:id` | Revoke API key |
| GET | `/tenant` | Get current tenant info |
| PATCH | `/tenant` | Update tenant settings |

#### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/health/ready` | Readiness check |

---

## 8. Multi-Tenancy Model

### Tenant Isolation

```
┌─────────────────────────────────────────────────────────────┐
│ Tenant: "Mart TechBench" (slug: techbench)                  │
│                                                             │
│  API Key: openwa_sk_7fG3...  (scoped to this tenant)        │
│                                                             │
│  Sessions:                                                  │
│  ┌────────────┐  ┌────────────┐                             │
│  │ support    │  │ marketing  │  (each = 1 Durable Object)  │
│  │ +628xxx    │  │ +628yyy    │                             │
│  └────────────┘  └────────────┘                             │
│                                                             │
│  Webhooks: [mart-api.com/wa-webhook]                        │
│  Contacts: 500 (isolated, tagged, with CRM metadata)        │
│  Messages: 10,000 (last 30 days)                            │
│  Media: 2GB in R2 (path: /tenants/techbench/media/*)        │
└─────────────────────────────────────────────────────────────┘
```

### Plan Limits

| Feature | Free (Desktop) | Pro ($5/mo) | Business ($20/mo) |
|---------|:-:|:-:|:-:|
| Sessions | 1 | 3 | 10 |
| Messages stored | 1,000 | 50,000 | Unlimited |
| Media storage | 500MB | 5GB | 50GB |
| Webhooks per session | 2 | 10 | 50 |
| CRM contacts | 100 | 5,000 | Unlimited |
| API rate limit | 10 req/s | 50 req/s | 200 req/s |
| Bulk messaging | ❌ | ✅ | ✅ |
| Custom domain | ❌ | ❌ | ✅ |

### Tenant Resolution Flow

```
Request → API Key Header → KV Cache Lookup → Resolve tenant_id + D1 DB name
                                    ↓ (cache miss)
                              D1 Control Plane api_keys table → cache in KV (5min TTL)
                                    ↓
                              Resolve tenant D1 database → bind dynamically
```

---

## 9. Electron Desktop App (`apps/desktop`)

### Features

- **Full WhatsApp engine** running locally (Baileys + Node adapter)
- **Same UI** as web dashboard (shared `@openwa/ui` components)
- **System tray** — runs in background when window closed
- **Auto-start on boot** (configurable)
- **Native notifications** for incoming messages
- **Drag & drop media** sending
- **Offline message history** (local SQLite cache)
- **Optional cloud sync** — push contacts/messages to D1 via API
- **Auto-updater** via GitHub Releases (electron-updater)

### IPC Bridge

```typescript
// electron/ipc-handlers.ts
ipcMain.handle('engine:start', (_, sessionName) => engineManager.start(sessionName));
ipcMain.handle('engine:stop', (_, sessionName) => engineManager.stop(sessionName));
ipcMain.handle('engine:status', (_, sessionName) => engineManager.getStatus(sessionName));
ipcMain.handle('engine:send-text', (_, { session, chatId, text }) => ...);
ipcMain.handle('engine:get-qr', (_, sessionName) => engineManager.getQR(sessionName));

// Renderer subscribes to events
ipcMain.on('engine:subscribe', (event, sessionName) => {
  engineManager.on(sessionName, 'message', (msg) => {
    event.sender.send('engine:event', { type: 'message', data: msg });
  });
});
```

### Build & Distribution

```yaml
# electron-builder.yml
appId: com.openwa.desktop
productName: OpenWA
directories:
  output: release
files:
  - dist/**/*
  - electron/**/*
mac:
  target: [dmg, zip]
win:
  target: [nsis, portable]
linux:
  target: [AppImage, deb]
publish:
  provider: github
```

---

## 10. Mart E-Commerce Integration

### Integration Pattern

OpenWA acts as a **WhatsApp CRM module** for Mart stores. Each Mart organization maps to an OpenWA tenant.

```
┌─────────────────────────┐         ┌─────────────────────────────┐
│ Mart (E-commerce)       │         │ OpenWA (WhatsApp SaaS)       │
│                         │         │                              │
│ Event: Order Placed ────┼────────►│ Send order confirmation      │
│ Event: Shipping Update ─┼────────►│ Send tracking notification   │
│ Event: Cart Abandoned ──┼────────►│ Send recovery message        │
│ Event: New Customer ────┼────────►│ Add to CRM contacts          │
│                         │         │                              │
│ Ticket System ◄─────────┼────────│ Incoming WA message webhook  │
│ CRM ◄──────────────────┼────────│ Contact sync                 │
│ Analytics ◄─────────────┼────────│ Message delivery stats       │
└─────────────────────────┘         └─────────────────────────────┘
```

### Shared Event Schema

```typescript
// packages/shared/src/events.ts
type WebhookEvent =
  | { event: 'message.received'; data: IncomingMessage }
  | { event: 'message.sent'; data: OutgoingMessage }
  | { event: 'message.ack'; data: MessageAck }
  | { event: 'session.status'; data: { sessionId: string; status: SessionStatus } }
  | { event: 'contact.joined'; data: { phone: string; name: string } }
  | { event: 'group.joined'; data: GroupEvent };
```

### Mart → OpenWA Integration Code

```typescript
// In Mart's API service
import { treaty } from '@elysiajs/eden';
import type { OpenWAAPI } from '@openwa/api';

const openwa = treaty<OpenWAAPI>('https://api.openwa.dev', {
  headers: { 'X-API-Key': env.OPENWA_API_KEY }
});

// On order placed
async function onOrderPlaced(order: Order) {
  await openwa.sessions[sessionId].messages.text.post({
    chatId: `${order.customerPhone}@c.us`,
    text: `✅ Order #${order.id} confirmed! Total: ${order.total}`
  });
}
```

---

## 11. Cloudflare Bindings (`wrangler.jsonc`)

```jsonc
{
  "name": "openwa-api",
  "compatibility_date": "2026-05-01",
  "compatibility_flags": ["nodejs_compat"],

  // Durable Objects
  "durable_objects": {
    "bindings": [
      { "name": "WA_SESSION", "class_name": "WhatsAppSessionDO" },
      { "name": "WS_RELAY", "class_name": "WebSocketRelayDO" }
    ]
  },

  // D1 Databases
  "d1_databases": [
    { "binding": "CONTROL_DB", "database_name": "openwa-control", "database_id": "..." }
    // Tenant DBs are resolved dynamically via D1 REST API or env bindings
  ],

  // KV (API key cache, rate limiting)
  "kv_namespaces": [
    { "binding": "AUTH_KV", "id": "..." },
    { "binding": "RATE_LIMIT", "id": "..." }
  ],

  // R2 (media storage)
  "r2_buckets": [
    { "binding": "MEDIA", "bucket_name": "openwa-media" }
  ],

  // Queues (webhook delivery)
  "queues": {
    "producers": [
      { "binding": "WEBHOOK_QUEUE", "queue": "openwa-webhooks" }
    ],
    "consumers": [
      { "queue": "openwa-webhooks", "max_retries": 3, "dead_letter_queue": "openwa-webhooks-dlq" }
    ]
  }
}
```

---

## 12. Security Design

| Layer | Mechanism |
|-------|-----------|
| **API Authentication** | API key (SHA-256 hashed in DB, prefix-indexed in KV) |
| **Dashboard Auth** | better-auth (session cookies, OAuth providers) |
| **Tenant Isolation** | Physical isolation via DB-per-tenant (separate D1 databases) |
| **Webhook Signing** | HMAC-SHA256 with per-webhook secret |
| **Rate Limiting** | KV-based sliding window (per API key) |
| **Input Validation** | Valibot schemas on all endpoints |
| **Media Access** | R2 presigned URLs (time-limited, scoped to tenant path) |
| **DO Access** | Only via Worker → DO RPC (not exposed to internet) |
| **Secrets** | Cloudflare Worker secrets (encrypted at rest) |

---

## 13. Real-Time Architecture

### Cloud Mode (Dashboard ↔ DO)

```
Browser → WebSocket → CF Worker → DO (WS_RELAY) → subscribes to WA_SESSION DO events
                                                 ← pushes events to all connected clients
```

### Desktop Mode (Renderer ↔ Main Process)

```
React Renderer → IPC → Electron Main → Baileys engine events → IPC → Renderer
```

### Event Flow (Message Received)

```
WhatsApp Server
    │ (WebSocket frame)
    ▼
Durable Object (WA_SESSION)
    │
    ├──► Decrypt (Signal Protocol)
    ├──► Parse (Protobuf)
    ├──► Store in D1 (messages table, per-tenant DB)
    ├──► Push to WS_RELAY DO → all connected dashboard clients
    └──► Enqueue webhook delivery → Cloudflare Queue
                                        │
                                        ▼
                                   Queue Consumer Worker
                                        │
                                        ├──► Sign payload (HMAC)
                                        └──► POST to webhook URL
                                             (retry up to 3x on failure)
```

---

## 14. Development Workflow

```bash
# Install dependencies
bun install

# Run all in development
bun run dev

# Run specific apps/services
bun run dev --filter=@openwa/api
bun run dev --filter=@openwa/dashboard
bun run dev --filter=@openwa/desktop

# Database
bun run db:generate    # Generate migration from schema changes
bun run db:migrate     # Apply migrations to all tenant D1 databases
bun run db:studio      # Open Drizzle Studio

# Deploy
bun run deploy         # Deploy all workers + pages

# Build desktop
bun run build:desktop  # Build Electron app for all platforms

# Type check
bun run typecheck

# Lint & format
bun run lint
bun run format
```

---

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| **WhatsApp bans** (unofficial API) | Session permanently lost | Rate limiting, random delays, anti-detection, phone rotation strategy |
| **Baileys upstream breaking** | Protocol stops working | Pin version, maintain fork, monitor WA Web updates |
| **DO eviction/hibernation** | Temporary disconnect | Auth persisted in DO storage; Alarm-based reconnect; <5s recovery |
| **DO 128MB memory limit** | Crash if too many contacts loaded | Lazy-load contacts from DB, don't cache all in memory |
| **NeonDB cold start** | ~~2-5s first query after idle~~ | Eliminated — D1 has no cold start (native binding) |
| **Cloudflare outage** | API + engine down | Desktop app works offline; status page monitoring |
| **Protocol update by WhatsApp** | Engine breaks | Active monitoring, community patches, version detection |
| **Media size limits** | Large files rejected | Pre-upload validation, chunked upload for R2 |

---

## 16. Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Monorepo scaffold (Bun + Turborepo + Biome)
- [ ] `packages/shared` — types, events, error codes
- [ ] `packages/validators` — Valibot schemas
- [ ] `packages/db` — Drizzle schema (sqlite-core) + D1 client + migrations
- [ ] D1 Control Plane database setup
- [ ] Basic CI (typecheck, lint, test)

### Phase 2: Engine (Week 3-5)
- [ ] `packages/engine` — Fork Baileys core
- [ ] Strip Node-specific code, add adapter interface
- [ ] Implement Cloudflare adapter (DO storage + native WS)
- [ ] Implement Node adapter (filesystem + ws)
- [ ] QR code generation + pairing code flow
- [ ] Send/receive text messages (proof of concept)
- [ ] Media upload/download

### Phase 3: API + DO (Week 5-7)
- [ ] `workers/wa-session` — Durable Object wrapping engine
- [ ] `services/api` — Elysia REST API
- [ ] Session CRUD endpoints
- [ ] Message send endpoints (all types)
- [ ] Contact, group, label endpoints
- [ ] Webhook CRUD + Queue-based delivery
- [ ] API key auth + tenant middleware
- [ ] Rate limiting

### Phase 4: Dashboard (Week 7-9)
- [ ] `packages/ui` — Shared React components (shadcn/ui)
- [ ] `apps/dashboard` — TanStack Start + @cloudflare/vite-plugin
- [ ] Login/auth pages (better-auth, session cookies)
- [ ] Session management (create, QR scan, status) via server functions
- [ ] Message view (conversation list, chat) with TanStack Query
- [ ] Webhook management
- [ ] API key management
- [ ] Tenant settings
- [ ] Real-time via DO WebSocket hook

### Phase 5: Desktop (Week 9-11)
- [ ] `apps/desktop` — Electron scaffold
- [ ] Engine manager (local Baileys sessions)
- [ ] IPC bridge (renderer ↔ main)
- [ ] System tray + background operation
- [ ] Same UI via @openwa/ui
- [ ] Auto-updater setup
- [ ] Build pipelines (Mac/Win/Linux)

### Phase 6: Multi-Tenant SaaS (Week 11-13)
- [ ] Tenant registration/onboarding flow
- [ ] Plan limits enforcement
- [ ] Usage metering
- [ ] Billing integration (Stripe or LemonSqueezy)
- [ ] Admin panel (super-admin for managing tenants)

### Phase 7: CRM + Mart Integration (Week 13-15)
- [ ] CRM module (contacts, tags, conversations, assignments)
- [ ] Mart webhook bridge (order → WA notification)
- [ ] Shared tenant linking (Mart org → OpenWA tenant)
- [ ] Eden Treaty client for type-safe Mart ↔ OpenWA calls
- [ ] Template messages (variables from order data)

### Phase 8: Polish & Launch (Week 15-16)
- [ ] Documentation (API docs, integration guide)
- [ ] Landing page
- [ ] Rate limit dashboard
- [ ] Error tracking (Sentry or CF Logpush)
- [ ] Load testing
- [ ] Security audit
- [ ] Public beta launch

---

## 17. Commands Reference

```bash
# Root package.json scripts
bun run dev              # Start all (portless proxy + turbo dev)
bun run dev:api          # API worker only (wrangler dev)
bun run dev:dashboard    # TanStack Start dashboard (vite dev)
bun run dev:desktop      # Electron app
bun run build            # Build all packages
bun run deploy           # Deploy workers + pages to CF
bun run deploy:api       # Deploy API worker only
bun run deploy:dashboard # Deploy dashboard to Pages
bun run typecheck        # Type check all
bun run lint             # Biome lint
bun run format           # Biome format
bun run test             # Run all tests
bun run db:generate      # Generate Drizzle migration
bun run db:migrate       # Run migrations on all D1 databases
bun run db:studio        # Open Drizzle Studio
bun run build:desktop    # Build Electron for distribution
```

---

## 18. File Naming & Code Conventions

- **Package scope:** `@openwa/`
- **File naming:** `kebab-case.ts`
- **No `any` type** — use proper generics or `unknown` with guards
- **Validation:** Valibot at API boundaries
- **Errors:** Typed error codes (from `@openwa/shared`)
- **No default exports** — named exports only
- **Biome** for lint + format (no ESLint/Prettier)
- **Tests:** Vitest for unit, Playwright for E2E
- **Environment:** `.dev.vars` for local secrets (wrangler convention)
