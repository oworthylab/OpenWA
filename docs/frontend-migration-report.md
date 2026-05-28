# Frontend & Desktop Architecture: Migration Report

> **Author**: Frontend & Desktop Architect
> **Date**: 2025-05-28
> **Scope**: Dashboard → TanStack Start + @openwa/ui + Electron Desktop

---

## 1. Current Dashboard Analysis

### 1.1 Technology Stack

| Layer | Current | Notes |
|-------|---------|-------|
| Framework | React 19.2 + Vite 7 | SPA, lazy-loaded routes |
| Routing | react-router-dom 7.x | Client-side only |
| State (server) | TanStack Query 5.x | 30s staleTime, window refocus |
| State (client) | React Context (Role, Toast) | No external store (Zustand in docs but unused) |
| WebSocket | socket.io-client 4.8 | Namespace `/events`, API-key auth |
| i18n | i18next + LanguageDetector | EN + HE (RTL), localStorage persistence |
| Icons | lucide-react | ~20 icons used |
| Table | @tanstack/react-table 8 | Used in Logs page |
| Styling | Plain CSS files (per-component) | CSS variables for theming, no Tailwind yet |
| Build | Vite 7, TypeScript 5.9 | SPA mode, dev proxy to :2785 |
| Serving | nginx → Docker | SPA fallback + `/api/` and `/socket.io/` proxy |

### 1.2 Route Structure

```
/                  → Dashboard (stats cards, session overview)
/sessions          → Sessions (CRUD, QR codes, status, WebSocket-driven updates)
/webhooks          → Webhooks (CRUD per session)
/api-keys          → API Keys (admin-only, CRUD + revoke)
/logs              → Audit Logs (paginated, severity filter)
/message-tester    → Message Tester (text/image/video/audio/document)
/infrastructure    → Infrastructure status (DB, Redis, Queue, Storage)
/plugins           → Plugin management + engine switching (admin-only)
```

### 1.3 Auth Model

- **API Key in `sessionStorage`** (X-API-Key header)
- Role validation via `POST /api/auth/validate` → stores role in Context + localStorage
- Roles: `admin` | `operator` | `viewer`
- Route gating: conditional `<Route>` rendering based on role
- No OAuth/JWT — purely API-key authentication

### 1.4 Component Inventory

| Component | Complexity | Reusability |
|-----------|-----------|-------------|
| `Layout` | High (nav, sidebar, mobile, collapse, i18n, theme) | Extract nav + shell |
| `PageHeader` | Low | Direct extraction |
| `Toast / ToastProvider` | Medium (context, auto-dismiss) | Extract to @openwa/ui |
| `Skeleton` (variants) | Low | Direct extraction |
| `ErrorBoundary` | Low | Direct extraction |
| `Sessions` page | High (WS, QR polling, CRUD, search, filter) | Island candidate |
| `Dashboard` page | Medium (stats, TanStack Query) | Partial SSR |
| `Plugins` page | High (engine config, modal state) | Island candidate |
| `MessageTester` page | Medium (form state, API calls) | Island candidate |

### 1.5 API Client Pattern

```typescript
// Centralized fetch wrapper with X-API-Key injection from sessionStorage
async function request<T>(endpoint: string, options?: RequestInit): Promise<T>

// Namespaced API objects
export const sessionApi = { list, get, create, delete, start, stop, getQR, getStats, getGroups }
export const webhookApi = { listBySession, listAll, get, create, update, delete, test }
export const apiKeyApi = { list, get, create, update, delete, revoke }
export const auditApi = { list }
export const infraApi = { status, saveConfig }
export const messageApi = { sendText, sendImage, sendVideo, sendAudio, sendDocument }
export const pluginsApi = { list, enable, disable, ... }
```

### 1.6 WebSocket Pattern

- Uses `socket.io-client` connecting to `{origin}/events` namespace
- Auth: API key sent via `auth`, `extraHeaders`, and `query` params
- Events: `session:status`, `session:qr`, `session:message`
- Reconnection: 5 attempts, 1s delay
- Connected state tracked via `useState`

---

## 2. Dashboard → TanStack Start Migration Strategy

### 2.1 Full React SPA with Server Functions

TanStack Start gives us SSR + full hydration without the mental model split of islands:

| Route | Rendering | Rationale |
|-------|-----------|-----------|
| `/` (Dashboard) | **SSR + hydrate** | Stats prefetched on server, interactive on client |
| `/sessions` | **SSR + hydrate** | Heavy interactivity (WS, QR, modals) — server prefetch list |
| `/webhooks` | **SSR + hydrate** | CRUD + inline edit, prefetch on server |
| `/api-keys` | **SSR + hydrate** | Admin-only, server validates role before render |
| `/logs` | **SSR + hydrate** | First page SSR, paginate client-side |
| `/message-tester` | **Client only** | Form-heavy, no SEO benefit from SSR |
| `/infrastructure` | **SSR + hydrate** | Status snapshot SSR, poll client-side |
| `/plugins` | **Client only** | Complex modal state, engine switching |
| `/login` | **SSR** | Simple form, redirect on success |

### 2.2 TanStack Start Project Structure

```
packages/
  dashboard/                    # TanStack Start + @cloudflare/vite-plugin
    app.config.ts               # TanStack Start config
    vite.config.ts              # Vite + @cloudflare/vite-plugin
    wrangler.jsonc              # D1, KV, DO bindings
    src/
      routes/
        __root.tsx              # Root layout (nav, sidebar, theme)
        index.tsx               # Dashboard (stats)
        login.tsx               # Login page
        sessions/
          index.tsx             # Session list
          $sessionId.tsx        # Session detail
        webhooks.tsx
        api-keys.tsx
        logs.tsx
        message-tester.tsx
        infrastructure.tsx
        plugins.tsx
      server/
        auth.ts                 # Server function: validate session
        sessions.ts             # Server functions: CRUD via D1/DO
        messages.ts             # Server functions: send via DO
        webhooks.ts             # Server functions: CRUD via D1
      lib/
        eden-client.ts          # Eden Treaty (for external API consumers only)
      components/               # Page-specific components
        SessionManager.tsx
        WebhookManager.tsx
        ApiKeyManager.tsx
        LogViewer.tsx
        MessageTester.tsx
        InfraStatus.tsx
        PluginManager.tsx
        DashboardStats.tsx
```

### 2.3 Authentication via Server Functions

```typescript
// src/server/auth.ts
import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie } from 'vinxi/http';
import { createControlDb } from '@openwa/db';
import { eq } from 'drizzle-orm';
import { apiKeys } from '@openwa/db/control-plane';

export const validateSession = createServerFn({ method: 'GET' })
  .handler(async ({ context }) => {
    const env = context.cloudflare.env;
    const sessionToken = getCookie('openwa_session');

    if (!sessionToken) throw new Error('Not authenticated');

    // Check KV cache first
    const cached = await env.KV.get(`session:${sessionToken}`, { type: 'json' });
    if (cached) return cached;

    // Validate against control plane D1
    const controlDb = createControlDb(env.CONTROL_DB);
    const keyHash = await hashApiKey(sessionToken);
    const [key] = await controlDb
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!key || !key.isActive) throw new Error('Invalid session');

    const user = { tenantId: key.tenantId, role: key.role, apiKeyId: key.id };
    await env.KV.put(`session:${sessionToken}`, JSON.stringify(user), { expirationTtl: 300 });
    return user;
  });

export const login = createServerFn({ method: 'POST' })
  .validator((data: { apiKey: string }) => data)
  .handler(async ({ data, context }) => {
    const env = context.cloudflare.env;
    const controlDb = createControlDb(env.CONTROL_DB);
    const keyHash = await hashApiKey(data.apiKey);

    const [key] = await controlDb
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, keyHash))
      .limit(1);

    if (!key || !key.isActive) throw new Error('Invalid API key');

    setCookie('openwa_session', data.apiKey, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return { role: key.role, tenantId: key.tenantId };
  });
```

**Key changes from current:**
- API key stored in **httpOnly cookie** instead of sessionStorage (XSS-safe)
- Session validation cached in **KV** (avoids per-request backend calls)
- Role available on server via `validateSession()` — used in route `beforeLoad`

### 2.4 Server Functions: Direct D1/DO Access (Zero API Hops)

For the **dashboard**, server functions access D1 and Durable Objects directly — no need
to go through the Elysia API (which exists for external SDK/webhook consumers):

```typescript
// src/server/sessions.ts
import { createServerFn } from '@tanstack/react-start';
import { createTenantDb } from '@openwa/db';
import { sessions } from '@openwa/db/tenant';
import { eq } from 'drizzle-orm';

export const listSessions = createServerFn({ method: 'GET' })
  .handler(async ({ context }) => {
    const env = context.cloudflare.env;
    const tenantDb = createTenantDb(env.TENANT_DB);
    return tenantDb.select().from(sessions);
  });

export const createSession = createServerFn({ method: 'POST' })
  .validator((data: { name: string; proxyUrl?: string }) => data)
  .handler(async ({ data, context }) => {
    const env = context.cloudflare.env;
    const tenantDb = createTenantDb(env.TENANT_DB);
    const [session] = await tenantDb.insert(sessions).values(data).returning();

    // Initialize Durable Object
    const doId = env.WA_SESSION_DO.idFromName(session.id);
    const stub = env.WA_SESSION_DO.get(doId);
    await stub.fetch(new Request('http://do/init', { method: 'POST' }));

    return session;
  });
```

**Route using server functions + TanStack Query:**

```typescript
// src/routes/sessions/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSessions, createSession } from '../../server/sessions';
import { validateSession } from '../../server/auth';

export const Route = createFileRoute('/sessions/')({
  beforeLoad: async () => {
    const user = await validateSession();
    return { user };
  },
  loader: async () => ({ sessions: await listSessions() }),
  component: SessionsPage,
});

function SessionsPage() {
  const { sessions: initialSessions } = Route.useLoaderData();
  const queryClient = useQueryClient();

  const { data: sessions } = useSuspenseQuery({
    queryKey: ['sessions'],
    queryFn: () => listSessions(),
    initialData: initialSessions,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createSession({ name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sessions'] }),
  });

  return <SessionManager sessions={sessions} onCreate={createMutation.mutate} />;
}
```

**Migration mapping:**

| Current | TanStack Start Server Function |
|---------|-------------------------------|
| `sessionApi.list()` | `listSessions()` (server fn, direct D1) |
| `sessionApi.create(name)` | `createSession({ name })` |
| `sessionApi.start(id)` | `startSession({ sessionId: id })` |
| `webhookApi.create(sid, data)` | `createWebhook({ sessionId: sid, ...data })` |
| `messageApi.sendText(sid, chatId, text)` | `sendTextMessage({ sessionId: sid, chatId, text })` |

**Benefits**: Zero API hops for dashboard, full end-to-end type safety, direct CF binding access.

### 2.5 Real-Time: Socket.IO → Durable Object WebSocket

```typescript
// Current: socket.io-client
const socket = io('/events', { auth: { apiKey } });
socket.on('session:status', handler);

// New: Native WebSocket to Durable Object
class RealtimeConnection {
  private ws: WebSocket;
  private reconnectAttempts = 0;
  private maxReconnects = 10;
  private buffer: Array<{ event: string; data: unknown }> = [];

  constructor(private url: string, private apiKey: string) {
    this.connect();
  }

  private connect() {
    this.ws = new WebSocket(`${this.url}/ws/events?token=${this.apiKey}`);
    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.flushBuffer();
    };
    this.ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      this.emit(type, payload);
    };
    this.ws.onclose = () => this.handleReconnect();
  }

  private handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnects) return;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30000);
    setTimeout(() => { this.reconnectAttempts++; this.connect(); }, delay);
  }
}
```

---

## 3. Shared UI Library (`@openwa/ui`) Design

### 3.1 Package Structure

```
packages/
  ui/
    package.json              # @openwa/ui
    tsconfig.json
    src/
      index.ts                # Barrel exports
      components/
        button.tsx
        input.tsx
        select.tsx
        dialog.tsx
        toast.tsx
        skeleton.tsx
        page-header.tsx
        error-boundary.tsx
        data-table.tsx
        badge.tsx
        card.tsx
        dropdown-menu.tsx
        sidebar.tsx
        tabs.tsx
      hooks/
        use-theme.ts
        use-toast.ts
        use-media-query.ts
      lib/
        utils.ts              # cn() helper
        themes.ts             # CSS variable definitions
      styles/
        globals.css           # Base styles + CSS variables
        themes/
          light.css
          dark.css
```

### 3.2 Components to Extract from Current Dashboard

| Current Source | @openwa/ui Target | Changes Required |
|---------------|-------------------|------------------|
| `Toast.tsx` + `Toast.css` | `toast.tsx` | Refactor to shadcn pattern (Radix Toast) |
| `Skeleton.tsx` + `Skeleton.css` | `skeleton.tsx` | Adopt Tailwind classes |
| `PageHeader.tsx` + `PageHeader.css` | `page-header.tsx` | Slot-based API, Tailwind |
| `ErrorBoundary.tsx` | `error-boundary.tsx` | Add error reporting hook |
| `Layout.tsx` (sidebar/nav portion) | `sidebar.tsx` + `nav.tsx` | Headless, composable |
| Custom CSS theme system | `themes/` + CSS vars | Migrate to Tailwind + CSS vars |

### 3.3 shadcn/ui Integration Strategy

**Approach**: Use shadcn/ui as the foundation, customize with OpenWA design tokens.

```json
// packages/ui/components.json (shadcn config)
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "zinc",
    "cssVariables": true
  },
  "aliases": {
    "components": "@openwa/ui/components",
    "utils": "@openwa/ui/lib/utils",
    "hooks": "@openwa/ui/hooks"
  }
}
```

**shadcn components to add (not in current codebase):**
- `Dialog` (replace custom modals in Sessions, Plugins)
- `DropdownMenu` (replace custom context menus)
- `Select` (replace native `<select>` elements)
- `Tabs` (for Infrastructure page sections)
- `Command` (future: command palette)
- `Sheet` (mobile sidebar)

### 3.4 Theme System

```css
/* packages/ui/src/styles/globals.css */
:root {
  /* OpenWA brand */
  --owa-primary: 142 71% 45%;        /* Green accent */
  --owa-primary-foreground: 0 0% 98%;

  /* Semantic tokens (light) */
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --radius: 0.5rem;

  /* Status colors (WhatsApp semantic) */
  --status-ready: 142 71% 45%;
  --status-connecting: 48 96% 53%;
  --status-disconnected: 0 84% 60%;
  --status-idle: 240 3.8% 46.1%;
}

.dark {
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  /* ... dark overrides */
}
```

**Theme switching**: Same `data-theme` attribute pattern as current, but using Tailwind's `dark:` variant tied to the attribute:

```typescript
// tailwind.config.ts (shared across all packages)
export default {
  darkMode: ['selector', '[data-theme="dark"]'],
}
```

### 3.5 Component API Design (Web + Electron)

```typescript
// packages/ui/src/components/toast.tsx
// Works in both TanStack Start dashboard and Electron renderer

export interface ToastProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

// Headless hook (works anywhere React runs)
export function useToast() {
  return { toast, dismiss, toasts };
}

// Pre-styled component (uses @openwa/ui theme tokens)
export function Toaster() { /* renders toast stack */ }
```

---

## 4. Electron Desktop Architecture

### 4.1 Shared UI Strategy

```
packages/
  ui/            → @openwa/ui (shared components + hooks)
  dashboard/     → TanStack Start (web, CF Workers via @cloudflare/vite-plugin)
  desktop/       → Electron app
    src/
      main/               # Main process
        index.ts
        ipc-handlers.ts
        tray.ts
        auto-updater.ts
      preload/
        index.ts          # contextBridge API
      renderer/           # Uses @openwa/ui components
        src/
          main.tsx
          App.tsx          # React app (same components as web)
          pages/           # Mirrors web pages
          lib/
            ipc-client.ts  # IPC-based API client (same interface as Eden)
```

**Key principle**: The renderer uses the exact same React components from `@openwa/ui`, but swaps the data layer:

```typescript
// Web (TanStack Start): Server functions (direct D1/DO binding access)
import { listSessions } from '@openwa/dashboard/server/sessions';

// External SDK/API consumers: Eden Treaty over HTTP
import { treaty } from '@elysiajs/eden';
import type { App } from '@openwa/api';
const client = treaty<App>('https://api.openwa.dev');

// Electron renderer: IPC bridge (same interface)
import { createIPCClient } from '@openwa/desktop/lib/ipc-client';
```

### 4.2 IPC Bridge Design

```typescript
// desktop/src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('openwa', {
  // Session operations (main process runs engine directly)
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list'),
    create: (name: string) => ipcRenderer.invoke('sessions:create', name),
    start: (id: string) => ipcRenderer.invoke('sessions:start', id),
    stop: (id: string) => ipcRenderer.invoke('sessions:stop', id),
    getQR: (id: string) => ipcRenderer.invoke('sessions:qr', id),
  },
  // Messages
  messages: {
    send: (sessionId: string, chatId: string, payload: MessagePayload) =>
      ipcRenderer.invoke('messages:send', sessionId, chatId, payload),
  },
  // Real-time events (main → renderer)
  on: (channel: string, callback: (...args: any[]) => void) => {
    const subscription = (_event: any, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, subscription);
    return () => ipcRenderer.removeListener(channel, subscription);
  },
  // System
  system: {
    getVersion: () => ipcRenderer.invoke('system:version'),
    minimize: () => ipcRenderer.invoke('window:minimize'),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
  },
});

// desktop/src/main/ipc-handlers.ts
import { ipcMain } from 'electron';
import { EngineManager } from '@openwa/engine'; // Direct engine access

export function registerHandlers(engine: EngineManager) {
  ipcMain.handle('sessions:list', () => engine.listSessions());
  ipcMain.handle('sessions:create', (_, name) => engine.createSession(name));
  ipcMain.handle('sessions:start', (_, id) => engine.startSession(id));
  ipcMain.handle('sessions:stop', (_, id) => engine.stopSession(id));
  ipcMain.handle('sessions:qr', (_, id) => engine.getQR(id));

  ipcMain.handle('messages:send', (_, sessionId, chatId, payload) =>
    engine.sendMessage(sessionId, chatId, payload));
}
```

### 4.3 Local State (SQLite for Offline)

```typescript
// desktop/src/main/local-store.ts
import Database from 'better-sqlite3';

export class LocalStore {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages_queue (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT DEFAULT 'pending', -- pending | sent | failed
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        sent_at DATETIME
      );
      CREATE TABLE IF NOT EXISTS session_cache (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  // Offline message queue
  queueMessage(sessionId: string, chatId: string, payload: unknown) {
    return this.db.prepare(
      'INSERT INTO messages_queue (id, session_id, chat_id, payload) VALUES (?, ?, ?, ?)'
    ).run(crypto.randomUUID(), sessionId, chatId, JSON.stringify(payload));
  }

  getPendingMessages() {
    return this.db.prepare("SELECT * FROM messages_queue WHERE status = 'pending'").all();
  }
}
```

### 4.4 System Tray + Notifications

```typescript
// desktop/src/main/tray.ts
import { Tray, Menu, nativeImage, Notification } from 'electron';

export class SystemTray {
  private tray: Tray;
  private sessionCount = 0;

  constructor(private mainWindow: BrowserWindow) {
    const icon = nativeImage.createFromPath(join(__dirname, 'assets/tray-icon.png'));
    this.tray = new Tray(icon);
    this.updateMenu();
  }

  private updateMenu() {
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: `OpenWA — ${this.sessionCount} sessions`, enabled: false },
      { type: 'separator' },
      { label: 'Show Dashboard', click: () => this.mainWindow.show() },
      { label: 'Quick Connect', click: () => this.mainWindow.webContents.send('action:quick-connect') },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ]));
  }

  notifyDisconnection(sessionName: string) {
    new Notification({
      title: 'Session Disconnected',
      body: `${sessionName} has disconnected. Click to reconnect.`,
      icon: join(__dirname, 'assets/icon.png'),
    }).show();
  }

  notifyMessage(sessionName: string, from: string, preview: string) {
    new Notification({
      title: `${sessionName}: ${from}`,
      body: preview.slice(0, 100),
    }).show();
  }
}
```

---

## 5. Real-Time UI Architecture

### 5.1 Current → New Pattern

| Aspect | Current (socket.io) | Target (DO WebSocket) |
|--------|--------------------|-----------------------|
| Transport | Socket.IO (polling fallback) | Native WebSocket (no fallback needed on modern browsers) |
| Server | NestJS Gateway on same port | Durable Object per session group |
| Auth | API key in 3 places | Token in URL query param (validated by DO) |
| Events | `session:status`, `session:qr`, `session:message` | Same events, JSON-framed |
| Reconnection | socket.io built-in (5 attempts) | Custom exponential backoff (10 attempts, max 30s) |
| Namespace | `/events` | Path-based: `/ws/events` |
| Rooms | Server-managed | DO isolation (one DO per tenant/session-group) |

### 5.2 React Hook: `useRealtimeConnection`

```typescript
// packages/ui/src/hooks/use-realtime.ts
import { useEffect, useRef, useState, useCallback } from 'react';

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface RealtimeEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

interface UseRealtimeOptions {
  url: string;
  token: string;
  onEvent?: (event: RealtimeEvent) => void;
  enabled?: boolean;
}

export function useRealtimeConnection({ url, token, onEvent, enabled = true }: UseRealtimeOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);
  const reconnectAttempt = useRef(0);
  const bufferRef = useRef<RealtimeEvent[]>([]);

  const connect = useCallback(() => {
    if (!enabled) return;
    setState('connecting');

    const ws = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setState('connected');
      reconnectAttempt.current = 0;
      // Flush buffered outgoing messages
      bufferRef.current.forEach(e => ws.send(JSON.stringify(e)));
      bufferRef.current = [];
    };

    ws.onmessage = (e) => {
      const event: RealtimeEvent = JSON.parse(e.data);
      setLastEvent(event);
      onEvent?.(event);
    };

    ws.onclose = (e) => {
      if (e.code === 4001) { // Auth failure
        setState('disconnected');
        return;
      }
      setState('reconnecting');
      const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 30_000);
      setTimeout(() => { reconnectAttempt.current++; connect(); }, delay);
    };

    ws.onerror = () => ws.close();
  }, [url, token, enabled, onEvent]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(1000); };
  }, [connect]);

  const send = useCallback((type: string, payload: unknown) => {
    const event = { type, payload, timestamp: Date.now() };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    } else {
      bufferRef.current.push(event); // Buffer while disconnected
    }
  }, []);

  return { state, lastEvent, send };
}
```

### 5.3 Optimistic Updates for Message Sending

```typescript
// packages/dashboard/src/islands/MessageTester.tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function useOptimisticSendMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { sessionId: string; chatId: string; text: string }) => {
      return client.sessions({ id: params.sessionId }).messages.text.post({
        chatId: params.chatId,
        text: params.text,
      });
    },
    // Optimistic update: show message immediately
    onMutate: async (params) => {
      const optimisticMsg = {
        id: `optimistic-${crypto.randomUUID()}`,
        sessionId: params.sessionId,
        chatId: params.chatId,
        content: params.text,
        status: 'sending' as const,
        timestamp: Date.now(),
      };

      queryClient.setQueryData(
        ['messages', params.sessionId, params.chatId],
        (old: Message[] = []) => [...old, optimisticMsg]
      );

      return { optimisticMsg };
    },
    // On success: replace optimistic with real
    onSuccess: (data, params, context) => {
      queryClient.setQueryData(
        ['messages', params.sessionId, params.chatId],
        (old: Message[] = []) => old.map(m =>
          m.id === context.optimisticMsg.id
            ? { ...m, id: data.messageId, status: 'sent' }
            : m
        )
      );
    },
    // On error: mark as failed (allow retry)
    onError: (_, params, context) => {
      if (!context) return;
      queryClient.setQueryData(
        ['messages', params.sessionId, params.chatId],
        (old: Message[] = []) => old.map(m =>
          m.id === context.optimisticMsg.id
            ? { ...m, status: 'failed' }
            : m
        )
      );
    },
  });
}
```

### 5.4 Typing Indicators, Read Receipts, Presence

```typescript
// Typed event protocol (DO WebSocket)
type WsEvent =
  | { type: 'session:status'; payload: { sessionId: string; status: string } }
  | { type: 'session:qr'; payload: { sessionId: string; qrCode: string } }
  | { type: 'message:received'; payload: { sessionId: string; msg: IncomingMessage } }
  | { type: 'message:ack'; payload: { sessionId: string; msgId: string; ack: number } }
  | { type: 'typing'; payload: { sessionId: string; chatId: string; isTyping: boolean } }
  | { type: 'presence'; payload: { sessionId: string; chatId: string; status: 'online' | 'offline' | 'typing' } }
  | { type: 'read'; payload: { sessionId: string; chatId: string; msgIds: string[] } };

// React hook for presence
export function usePresence(sessionId: string, chatId: string) {
  const { lastEvent } = useRealtimeConnection({ /* ... */ });
  const [presence, setPresence] = useState<'online' | 'offline' | 'typing'>('offline');

  useEffect(() => {
    if (lastEvent?.type === 'presence' &&
        lastEvent.payload.sessionId === sessionId &&
        lastEvent.payload.chatId === chatId) {
      setPresence(lastEvent.payload.status);
    }
  }, [lastEvent, sessionId, chatId]);

  return presence;
}

// Typing indicator with debounce (outgoing)
export function useTypingIndicator(sessionId: string, chatId: string) {
  const { send } = useRealtimeConnection({ /* ... */ });
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const sendTyping = useCallback(() => {
    send('typing:start', { sessionId, chatId });
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      send('typing:stop', { sessionId, chatId });
    }, 3000);
  }, [send, sessionId, chatId]);

  return { sendTyping };
}
```

### 5.5 Connection State Management

```typescript
// packages/ui/src/components/connection-status.tsx
export function ConnectionStatus({ state }: { state: ConnectionState }) {
  const indicators: Record<ConnectionState, { color: string; label: string }> = {
    connected: { color: 'bg-green-500', label: 'Live' },
    connecting: { color: 'bg-yellow-500 animate-pulse', label: 'Connecting...' },
    reconnecting: { color: 'bg-orange-500 animate-pulse', label: 'Reconnecting...' },
    disconnected: { color: 'bg-red-500', label: 'Offline' },
  };

  const { color, label } = indicators[state];

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className={`h-2 w-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}
```

---

## 6. Migration Execution Plan

### Phase 1: Extract @openwa/ui (Week 1-2)

1. Initialize `packages/ui/` with Tailwind + shadcn/ui
2. Extract `Toast`, `Skeleton`, `PageHeader`, `ErrorBoundary`
3. Port CSS variable theme system → Tailwind CSS variables
4. Add shadcn components: `Button`, `Input`, `Dialog`, `Select`, `DropdownMenu`, `Tabs`
5. Set up Storybook for isolated development
6. Export barrel from `@openwa/ui`

### Phase 2: TanStack Start Dashboard (Week 2-4)

1. Scaffold TanStack Start project with `@cloudflare/vite-plugin`
2. Implement auth server functions (cookie-based + KV cache)
3. Create root layout `__root.tsx` (SSR sidebar/nav from `@openwa/ui`)
4. Migrate pages one-by-one as file routes:
   - Login → Dashboard → Sessions → Webhooks → Logs → others
5. Create server functions for each domain (sessions, messages, webhooks)
6. Replace `useWebSocket` with `useRealtimeConnection`
7. Port i18n (use Paraglide or i18next)
8. Set up CF Workers deployment via Wrangler

### Phase 3: Electron Shell (Week 4-6)

1. Scaffold Electron app with Vite + React renderer
2. Wire `@openwa/ui` components in renderer
3. Implement IPC bridge matching Eden Treaty interface
4. Add local SQLite store for offline queue
5. System tray + native notifications
6. Package with electron-builder (macOS, Windows, Linux)

### Phase 4: Real-Time Overhaul (Week 5-6, parallel)

1. Implement DO WebSocket endpoint on backend
2. Port `useRealtimeConnection` hook
3. Add optimistic updates to message sending
4. Add typing indicators and presence events
5. Connection state UI component
6. E2E test WebSocket reconnection scenarios

---

## 7. Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | TanStack Start (React) | Full React SPA + SSR + server functions; unified DX, direct CF binding access |
| UI library format | ESM package + Tailwind preset | Tree-shakeable, works in TanStack Start + Electron |
| State management | TanStack Query (keep) + Zustand (add for complex client state) | Query deeply integrated; Zustand for WS state, offline queue |
| CSS strategy | Tailwind CSS → replaces per-component `.css` files | Consistency, design tokens, shadcn compat |
| Auth (web) | httpOnly cookie + KV cache + server functions | More secure than sessionStorage, SSR-compatible |
| Auth (electron) | API key stored in OS keychain (via `keytar`) | Secure credential storage |
| i18n | Paraglide (compile-time) | Better bundle size than runtime i18next on CF Workers |
| WebSocket transport | Native WebSocket (drop socket.io) | CF Durable Objects use native WS, smaller bundle |
| Electron renderer | Vite + React (matches web) | Shared component library, single React version |
| Desktop DB | better-sqlite3 (via Electron main) | Sync access in main process, reliable offline storage |
| Dashboard data | Server functions (direct D1/DO) | Zero API hops, type-safe, SSR prefetch |

---

## 8. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|-----------|
| i18n migration (i18next → Paraglide) | Medium | Can keep i18next initially, migrate later |
| Socket.IO → native WS | High (different reconnection semantics) | Comprehensive reconnection layer in `useRealtimeConnection` |
| CSS → Tailwind migration | Low-Medium (tedious but straightforward) | One page at a time, keep old CSS during transition |
| TanStack Start is pre-1.0 (RC) | Medium (breaking changes possible) | Pin exact version; follow changelog; framework is stable in practice |
| Electron IPC type safety | Medium | Share types from `@openwa/engine` package |
| CF Workers cold start for SSR | Low | TanStack Start supports streaming SSR; most routes are interactive anyway |
| Server function bundling | Low | @cloudflare/vite-plugin handles splitting; monitor Worker size |
