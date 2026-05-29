# Sprint 5 — Desktop App

## Sprint Goal

Deliver a fully functional Electron desktop application that runs the Baileys WhatsApp engine locally, supports multi-session management, system tray integration, native notifications, and auto-updates — enabling users to run OpenWA without deploying a server.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 5 |
| Start Date | 2026-08-04 (Monday) |
| End Date | 2026-08-15 (Friday) |
| Working Days | 10 |
| Phase | Phase 5 — Electron Desktop App |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|---------------|-------|
| Dev A | Senior Full-Stack | 10 | Remaining API work (US-023 spillover if any) |
| Dev B | Backend/Infra | 10 | Electron main process + engine lifecycle |
| Dev C | Frontend | 10 | Electron renderer + UI integration |
| **Total** | | **30 person-days** | ~30 story points capacity |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-043 | Electron Scaffold | 5 | Dev B + Dev C | Must-have | None | — |
| US-044 | Local Engine Manager | 5 | Dev B | Must-have | US-043 | — |
| US-045 | System Tray + Notifications | 5 | Dev B + Dev C | Must-have | US-043, US-044 | — |
| US-046 | Auto-Updater | 3 | Dev B + Dev C | Should-have | US-043 | — |

**Total: 18 points** (within 30-point velocity — remaining capacity for cross-platform testing, polish, and build pipeline)

## Day-by-Day Schedule

### Week 1 (August 4–8)

| Day | Dev A (Full-Stack) | Dev B (Main Process) | Dev C (Renderer) |
|-----|-------------------|---------------------|------------------|
| **D1 Mon** | US-023 spillover / desktop support | US-043: Electron project scaffold (main + renderer, electron-builder config, directory structure) | US-043: Renderer setup with @openwa/ui components, Vite config for Electron |
| **D2 Tue** | Dev environment docs, test harness setup | US-043: IPC bridge design (typed channels, preload script, context bridge) | US-043: IPC client in renderer, type-safe channel definitions, bridge typings |
| **D3 Wed** | IPC type definitions in shared package | US-044: Engine manager service (start/stop/restart Baileys session via IPC) | US-044: Session management UI adapted for desktop (reuse dashboard components) |
| **D4 Thu** | Local SQLite schema for message cache | US-044: Multi-session support in main process, session credential encryption (safeStorage) | US-044: QR display flow via IPC (main generates QR → renderer displays) |
| **D5 Fri** | Code review, integration verification | US-045: System tray icon (green/yellow/red status per session), tray context menu | US-045: Auto-minimize to tray on window close, restore on tray click |

### Week 2 (August 11–15)

| Day | Dev A (Full-Stack) | Dev B (Main Process) | Dev C (Renderer) |
|-----|-------------------|---------------------|------------------|
| **D6 Mon** | Cross-platform testing (Linux AppImage) | US-045: Native OS notifications (incoming messages, connection events) | US-045: Notification click → open chat window, notification preferences UI |
| **D7 Tue** | Message cache query helpers | US-044: Local SQLite message cache (better-sqlite3), message persistence across restarts | US-044: Chat view with local message history, search |
| **D8 Wed** | Build pipeline support (signing configs) | US-046: Auto-updater (electron-updater, GitHub Releases feed, differential downloads) | US-046: Update notification UI (available/downloading/ready), defer/install flow |
| **D9 Thu** | Final integration testing, edge cases | US-046: Cross-platform build pipeline (GitHub Actions: dmg, nsis, AppImage) | Integration testing, window state persistence, error boundaries |
| **D10 Fri** | Sprint Review prep, docs | Sprint Review: Demo on macOS | Sprint Review: Demo full flow |

## Technical Tasks

### US-043: Electron Scaffold (5 pts) — Dev B + Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Project initialization | 1.5h | Electron + Vite scaffold (`electron-vite` or custom), directory structure: `src/main`, `src/preload`, `src/renderer` |
| 2 | Main process entry | 2h | `main.ts` — BrowserWindow creation, app lifecycle handlers, single-instance lock |
| 3 | Preload script | 1.5h | Context bridge exposing typed IPC API to renderer, sandboxed |
| 4 | Renderer setup | 2h | Vite config for renderer, React + @openwa/ui integration, HMR in dev |
| 5 | IPC channel definitions | 2h | Typed bidirectional channels: `session:*`, `engine:*`, `notification:*`, `app:*` |
| 6 | electron-builder config | 2h | `electron-builder.yml` — targets: dmg (macOS), nsis (Windows), AppImage (Linux), app metadata |
| 7 | Dev workflow | 1h | `bun run dev:desktop` — concurrent main + renderer with hot reload |
| 8 | Window state management | 1h | Remember position/size across launches (electron-window-state) |

### US-044: Local Engine Manager (5 pts) — Dev B

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Engine service design | 1.5h | Singleton service managing multiple Baileys instances in main process |
| 2 | Session lifecycle | 3h | Start (init Baileys, QR generation), stop (graceful disconnect), restart, status monitoring |
| 3 | Multi-session orchestration | 2h | Map of active sessions, concurrent session limit (configurable), per-session event emitters |
| 4 | Credential encryption | 2h | `safeStorage.encryptString()` for auth tokens, secure storage in app data directory |
| 5 | QR code IPC flow | 1.5h | Generate QR in main → emit via IPC → renderer displays → scan callback → session ready |
| 6 | Local SQLite setup | 2h | `better-sqlite3` in main process, tables: `messages`, `contacts`, `sessions`, `media_cache` |
| 7 | Message persistence | 2h | Store incoming/outgoing messages, query by chat/date, pagination |
| 8 | Connection recovery | 2h | Auto-reconnect on disconnect, exponential backoff, notify renderer of status changes |
| 9 | Resource cleanup | 1h | Graceful shutdown on app quit, close DB connections, disconnect sessions |

### US-045: System Tray + Notifications (5 pts) — Dev B + Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | Tray icon creation | 1.5h | Platform-specific icons (Template images for macOS, ICO for Windows), status colors |
| 2 | Tray context menu | 1.5h | Show/hide window, session status list, quick actions (new message), quit |
| 3 | Dynamic tray updates | 1h | Icon changes based on session states (all connected/some disconnected/all offline) |
| 4 | Minimize to tray | 1h | Window close → hide (not quit), configurable behavior in settings |
| 5 | Native notifications | 2h | `Notification` API in main process for incoming messages, connection events |
| 6 | Notification actions | 1.5h | Click → focus app + navigate to relevant chat, reply action (macOS) |
| 7 | Notification preferences | 2h | UI: enable/disable per session, DND schedule, sound toggle |
| 8 | Unread badge | 1h | macOS dock badge, Windows taskbar overlay — unread message count |

### US-046: Auto-Updater (3 pts) — Dev B + Dev C

| # | Task | Estimate | Description |
|---|------|----------|-------------|
| 1 | electron-updater setup | 1.5h | Configure `autoUpdater` with GitHub Releases as update feed |
| 2 | Update check logic | 1h | Check on app start + periodic (every 4h), respect user preference |
| 3 | Download & stage | 1h | Background download, progress reporting via IPC |
| 4 | Update UI | 2h | Renderer: banner "Update available", progress bar, "Restart now" / "Later" buttons |
| 5 | Install flow | 1h | `quitAndInstall()` on user action, handle mid-session gracefully (warn if sessions active) |
| 6 | Build pipeline | 3h | GitHub Actions workflow: build all platforms, code sign (macOS notarize, Windows sign), upload artifacts as release |
| 7 | Version management | 1h | Auto-version from git tags, changelog generation |

## End-to-End Tests

> No backend e2e tests for this sprint. Testing via Electron-specific test harness.

### Electron Integration Tests (Playwright Electron)

| # | Test | Description |
|---|------|-------------|
| 1 | App launches successfully | Main window opens, renderer loads, no crash |
| 2 | Session creation flow | Create session → QR displayed → mock scan → session connected |
| 3 | Multi-session management | Create 2+ sessions, verify independent lifecycle |
| 4 | IPC message roundtrip | Renderer sends command → main processes → response received |
| 5 | System tray interaction | Minimize to tray → restore from tray click |
| 6 | Notification display | Simulate incoming message → native notification appears |
| 7 | Message persistence | Send/receive messages → quit app → relaunch → history intact |
| 8 | Auto-update detection | Mock update server → app detects update → UI shows prompt |
| 9 | Window state persistence | Resize/move window → quit → relaunch → same position/size |
| 10 | Graceful shutdown | Close with active sessions → sessions disconnect cleanly → app exits |

## Risks & Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | Electron + Bun runtime compatibility | Medium | High | Fallback: use Node.js for main process; Bun for build tooling only |
| 2 | Code signing costs/complexity | Low | Medium | Use free Apple Developer account for open-source; defer Windows EV signing to post-launch |
| 3 | Native notification permissions (macOS Ventura+) | Low | Low | Handle permission request gracefully on first message, fallback to in-app notifications |
| 4 | Engine memory in Electron | Low | Medium | Same ~30MB per session, Electron overhead ~100MB base; document recommended limits |
| 5 | Cross-platform UI inconsistencies | Medium | Low | Use native-like styling per platform; test on all three OS early (D6) |
| 6 | better-sqlite3 native module rebuild | Medium | Medium | Include in electron-builder `afterPack` rebuild script; pre-built binaries for all platforms |

## Sprint Review Checklist

- [ ] Desktop app installs cleanly on macOS (dmg)
- [ ] App launches with splash screen → main window in < 3s
- [ ] Create a new WhatsApp session → QR code displayed
- [ ] Scan QR → session connects → status shows "Connected"
- [ ] Send a text message from desktop app
- [ ] Receive a message → native notification appears
- [ ] Click notification → app focuses on correct chat
- [ ] Minimize to tray → tray icon shows status → click restores window
- [ ] Multiple sessions run simultaneously with independent status
- [ ] Close app → reopen → sessions auto-reconnect, message history intact
- [ ] Auto-updater detects mock update → shows update prompt
- [ ] Linux AppImage and Windows NSIS installer build successfully

## Definition of Done Verification

```bash
# Build desktop app (all platforms)
cd apps/desktop
bun run build
# Expected: electron-builder produces .dmg, .exe (nsis), .AppImage

# Run Electron integration tests
bun run test:electron
# Expected: all Playwright Electron tests pass (10/10)

# Verify app launches (macOS)
open dist/mac/OpenWA.app
# Expected: app launches, main window displays login/session view

# Verify IPC types
bun run typecheck
# Expected: 0 errors, IPC channels fully typed across main/preload/renderer

# Check bundle size
du -sh dist/mac/OpenWA.app
# Expected: < 200MB (Electron base + app code + dependencies)

# Verify auto-update feed
curl -s https://api.github.com/repos/openwa/openwa/releases/latest | jq '.tag_name'
# Expected: matches built version

# Smoke test: session lifecycle
# Manual: Create session → scan QR → send message → receive → quit → reopen → history shows

# Cross-platform CI
gh workflow run desktop-build.yml
# Expected: all platform builds succeed (macOS, Windows, Linux)
```

---
