# Sprint 5 — Desktop App & Shared UI Library

## Sprint Goal

Deliver a fully functional Electron desktop application with local WhatsApp engine management and establish the `@openwa/ui` shared component library as the foundation for cross-platform UI consistency.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 5 |
| Start Date | 2026-07-14 (Monday) |
| End Date | 2026-07-25 (Friday) |
| Working Days | 10 |
| Phase | Phase 5 — Desktop App (Week 9-11) |

## Capacity

| Team Member | Role | Available Days | Story Points Capacity |
|-------------|------|---------------|----------------------|
| Dev A | Senior Full-Stack | 10 | ~12 pts |
| Dev B | Backend/Infra | 10 | ~10 pts |
| Dev C | Frontend | 10 | ~10 pts |
| **Total** | | **30 person-days** | **~30 pts** |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies |
|----------|-------|--------|----------|----------|--------------|
| US-043 | Electron App Scaffold | 5 | Dev A | P0 | None |
| US-044 | Local Engine Manager | 5 | Dev A | P0 | US-043 |
| US-045 | System Tray & Notifications | 3 | Dev C | P1 | US-043 |
| US-046 | Auto-Updater | 3 | Dev B | P1 | US-043 |
| E8-S01 | Initialize `packages/ui` | 3 | Dev B | P0 | None |
| E8-S02 | Chat Components | 5 | Dev C | P1 | E8-S01 |
| E8-S03 | Session Components | 3 | Dev C | P1 | E8-S01 |
| E8-S04 | Form Components | 3 | Dev B | P2 | E8-S01 |
| **Total** | | **30** | | | |

## Day-by-Day Schedule

### Week 1 (July 14–18)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|-----------------|
| **1** Mon | US-043: Electron project init, main/renderer setup | E8-S01: Init `packages/ui` monorepo package, Tailwind config | E8-S01: Help with shadcn/ui base setup, design tokens |
| **2** Tue | US-043: IPC architecture, preload scripts, security | E8-S01: Build tooling, Storybook setup, exports config | US-045: Tray icon design, menu structure |
| **3** Wed | US-043: @openwa/ui integration, window management | E8-S04: WebhookForm component, validation | US-045: System tray implementation, context menu |
| **4** Thu | US-043: Cross-platform build config (electron-builder) | E8-S04: APIKeyDisplay component, copy-to-clipboard | US-045: Native notifications, background mode |
| **5** Fri | US-043: Testing, CI for builds, code review | US-046: Auto-updater research, GitHub Releases config | US-045: Notification preferences, testing |

### Week 2 (July 21–25)

| Day | Dev A (Full-Stack) | Dev B (Backend/Infra) | Dev C (Frontend) |
|-----|-------------------|----------------------|-----------------|
| **6** Mon | US-044: Baileys integration in main process | US-046: electron-updater setup, update server | E8-S02: MessageBubble component (text, media, status) |
| **7** Tue | US-044: IPC bridge for session commands | US-046: Background download, progress events | E8-S02: ChatList component (search, sort, unread) |
| **8** Wed | US-044: Multi-session management, lifecycle | US-046: User notification UI, restart flow | E8-S02: ChatInput component (attachments, emoji) |
| **9** Thu | US-044: Error handling, reconnection logic | US-046: Testing, rollback mechanism | E8-S03: SessionCard, QRDisplay components |
| **10** Fri | US-044: Integration testing, sprint review prep | All: Bug fixes, polish, sprint review | E8-S03: StatusBadge, integration testing |

## Technical Tasks

### US-043: Electron App Scaffold (5 pts) — Dev A

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | Initialize Electron project with electron-vite | 2 | TypeScript, ESM modules |
| 2 | Configure main process entry point | 2 | Window creation, lifecycle management |
| 3 | Set up renderer with React + @openwa/ui | 3 | Shared component library integration |
| 4 | Implement IPC communication layer | 3 | Type-safe channels, preload script |
| 5 | Configure contextIsolation & security policies | 2 | CSP headers, nodeIntegration: false |
| 6 | Set up electron-builder for Win/Mac/Linux | 3 | Code signing config, auto-update targets |
| 7 | Configure CI pipeline for desktop builds | 2 | GitHub Actions, artifact uploads |
| 8 | Write unit tests for IPC layer | 2 | Vitest with electron mocks |

### US-044: Local Engine Manager (5 pts) — Dev A

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | Integrate Baileys as local engine adapter | 3 | Main process, sandboxed execution |
| 2 | Implement IPC bridge (session.start, session.stop, etc.) | 3 | Typed message protocol |
| 3 | Multi-session state management | 3 | Session registry, concurrent sessions |
| 4 | QR code generation & display pipeline | 2 | IPC streaming, renderer display |
| 5 | Connection lifecycle (connect/disconnect/reconnect) | 3 | Exponential backoff, health checks |
| 6 | Message send/receive pipeline via IPC | 3 | Queue management, delivery confirmation |
| 7 | Error handling & graceful degradation | 2 | Crash recovery, session restore |
| 8 | Integration tests with mock WhatsApp server | 2 | Deterministic test scenarios |

### US-045: System Tray & Notifications (3 pts) — Dev C

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | System tray icon with platform-specific assets | 2 | Windows ICO, macOS template, Linux PNG |
| 2 | Tray context menu (Show/Hide, Sessions, Quit) | 2 | Dynamic menu based on session state |
| 3 | Native notification integration | 2 | electron Notification API, click handlers |
| 4 | Background mode (close to tray) | 2 | Platform-specific behavior |
| 5 | Notification preferences (per-session settings) | 2 | Stored in electron-store |
| 6 | Badge/unread count on dock/taskbar | 1 | macOS dock badge, Windows taskbar |
| 7 | Testing across platforms | 1 | Manual + automated checks |

### US-046: Auto-Updater (3 pts) — Dev B

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | Configure electron-updater with GitHub Releases | 2 | Release channel config (stable/beta) |
| 2 | Background download with progress tracking | 2 | IPC progress events to renderer |
| 3 | Update notification UI in renderer | 2 | "Update available" banner, changelog |
| 4 | Install-on-quit flow | 2 | Graceful session shutdown before update |
| 5 | Rollback mechanism on failed update | 2 | Previous version fallback |
| 6 | Version check interval configuration | 1 | User settings, default 4 hours |
| 7 | E2E test for update flow | 1 | Mock update server |

### E8-S01: Initialize `packages/ui` (3 pts) — Dev B

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | Create `packages/ui` in monorepo with tsconfig | 2 | pnpm workspace, package.json |
| 2 | Configure Tailwind CSS with design tokens | 2 | Shared theme (colors, spacing, typography) |
| 3 | Install and configure shadcn/ui base | 2 | Button, Input, Dialog, Card primitives |
| 4 | Set up Storybook for component development | 2 | Vite-based, autodocs |
| 5 | Configure build pipeline (tsup/vite lib mode) | 2 | ESM + CJS exports, tree-shaking |
| 6 | Export structure and barrel files | 1 | `@openwa/ui` import paths |

### E8-S02: Chat Components (5 pts) — Dev C

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | MessageBubble: text messages with timestamps | 2 | Sent/received variants, read receipts |
| 2 | MessageBubble: media messages (image, audio, video) | 3 | Thumbnails, playback controls |
| 3 | MessageBubble: system messages & status | 1 | Group events, encryption notices |
| 4 | ChatList: conversation list with avatars | 3 | Virtual scrolling, last message preview |
| 5 | ChatList: search, filter, sort functionality | 2 | Fuzzy search, pinned chats |
| 6 | ChatInput: text input with emoji picker | 3 | @mentions, formatting toolbar |
| 7 | ChatInput: attachment handling (file, media, contact) | 2 | Drag-and-drop, preview before send |
| 8 | Storybook stories for all chat components | 2 | Interactive examples, edge cases |

### E8-S03: Session Components (3 pts) — Dev C

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | SessionCard: session overview with status | 2 | Phone number, connection state, uptime |
| 2 | QRDisplay: animated QR code with countdown | 3 | Refresh timer, scan instructions |
| 3 | StatusBadge: connection status indicator | 1 | Connected/Disconnected/Connecting states |
| 4 | Session action buttons (disconnect, restart, delete) | 2 | Confirmation dialogs, loading states |
| 5 | Storybook stories for session components | 2 | All states documented |

### E8-S04: Form Components (3 pts) — Dev B

| # | Task | Hours | Notes |
|---|------|-------|-------|
| 1 | WebhookForm: URL input with validation & test | 3 | HTTP method select, headers config |
| 2 | WebhookForm: event selector (multi-select) | 2 | Grouped by category |
| 3 | APIKeyDisplay: masked key with reveal/copy | 2 | Regenerate confirmation, expiry display |
| 4 | APIKeyDisplay: permissions badge list | 1 | Read/Write/Admin scopes |
| 5 | Storybook stories for form components | 2 | Validation states, error displays |

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Electron + Baileys memory issues in main process | Medium | High | Profile early (Day 6), consider worker_threads if needed |
| Cross-platform build failures in CI | Medium | Medium | Test all 3 platforms on Day 5, fix before Week 2 |
| Code signing certificates not ready | Low | High | Order certificates by Sprint 4 end; unsigned dev builds acceptable |
| shadcn/ui conflicts with existing dashboard styles | Low | Medium | Isolate via package boundary, separate Tailwind config |
| Auto-updater differential updates complex | Medium | Low | Ship full updates initially; differential in future sprint |
| Electron security vulnerabilities (nodeIntegration) | Low | High | contextIsolation: true, strict CSP, preload whitelist only |

## Sprint Review Checklist

### Desktop App Demo
- [ ] Electron app launches on Windows, macOS, and Linux
- [ ] QR code scan connects a WhatsApp session locally
- [ ] Send and receive text messages through desktop app
- [ ] Multiple sessions running concurrently
- [ ] System tray icon with context menu (show/hide/quit)
- [ ] Native notification on incoming message
- [ ] App continues running when window closed (tray mode)
- [ ] Auto-updater detects mock update and shows notification
- [ ] Cross-platform installers generated from CI

### Shared UI Library Demo
- [ ] `packages/ui` importable from both dashboard and desktop app
- [ ] Storybook running with all components documented
- [ ] MessageBubble renders text, media, and system messages
- [ ] ChatList with search and virtual scrolling
- [ ] ChatInput with emoji picker and file attachments
- [ ] SessionCard showing real session data
- [ ] QRDisplay with animated countdown
- [ ] WebhookForm with validation and test button
- [ ] APIKeyDisplay with mask/reveal/copy functionality

## Definition of Done Verification

```bash
# 1. Build packages/ui library
cd packages/ui && pnpm build && pnpm test

# 2. Run Storybook (visual verification)
cd packages/ui && pnpm storybook

# 3. Build Electron app for current platform
cd apps/desktop && pnpm build

# 4. Run desktop app unit tests
cd apps/desktop && pnpm test

# 5. Run IPC integration tests
cd apps/desktop && pnpm test:ipc

# 6. Verify cross-platform builds in CI
gh run list --workflow=desktop-build.yml --limit=1

# 7. Lint and type-check
pnpm lint && pnpm typecheck

# 8. Component library exports correctly
node -e "require('@openwa/ui')" && echo "CJS OK"
node --input-type=module -e "import '@openwa/ui'" && echo "ESM OK"

# 9. Auto-updater mock test
cd apps/desktop && pnpm test:updater

# 10. Package size check (< 100MB installer)
ls -la apps/desktop/dist/*.{dmg,exe,AppImage} | awk '{print $5, $9}'
```

---
