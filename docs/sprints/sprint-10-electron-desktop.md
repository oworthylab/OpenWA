# Sprint 10 — Electron Desktop App

## Sprint Goal

Take `apps/desktop` from the existing scaffold (US-043 — main process, preload bridge, electron-builder config) to a **shippable, code-signed, auto-updating Electron app** for macOS, Windows, and Linux. The desktop app embeds the Baileys engine locally (zero Cloudflare cost), reuses the dashboard UI from Sprint 9 in a `BrowserWindow`, persists data in better-sqlite3, and optionally syncs with a self-host or SaaS API.

## Sprint Duration & Dates

| Field | Value |
|-------|-------|
| Sprint # | 10 |
| Start Date | 2026-10-13 (Monday) |
| End Date | 2026-10-24 (Friday) |
| Working Days | 10 |
| Phase | Phase 10 — Desktop GA |

## Capacity

| Team Member | Role | Available Days | Notes |
|-------------|------|----------------|-------|
| Dev A | Engine adapter + IPC | 10 | Local Baileys driver, IPC contract |
| Dev B | Renderer integration (reuse dashboard) | 10 | Hash-routing build of dashboard for `file://` |
| Dev C | Packaging, signing, updater, CI | 10 | electron-builder, notarization, GH Releases |
| **Total** | | **30 person-days** | ~28 story points |

## Sprint Backlog

| Story ID | Title | Points | Assignee | Priority | Dependencies | Status |
|----------|-------|--------|----------|----------|--------------|--------|
| US-076 | Local Baileys engine adapter | 5 | Dev A | Must-have | None | — |
| US-077 | IPC contract (typed, validated) | 3 | Dev A | Must-have | US-076 | — |
| US-078 | Local storage (better-sqlite3 + Drizzle) | 3 | Dev A | Must-have | None | — |
| US-079 | Bundle dashboard renderer for desktop | 3 | Dev B | Must-have | US-066 | — |
| US-080 | Local auth + system tray | 2 | Dev B | Must-have | US-079 | — |
| US-081 | Optional cloud-sync mode | 3 | Dev B | Should-have | US-077 | — |
| US-082 | electron-builder multi-platform | 3 | Dev C | Must-have | US-079 | — |
| US-083 | Code signing + notarization | 3 | Dev C | Must-have | US-082 | — |
| US-084 | Auto-updater (GH Releases) | 2 | Dev C | Must-have | US-083 | — |
| US-085 | CI release pipeline (matrix build) | 1 | Dev C | Must-have | US-082 | — |

**Total: 28 points**

---

## Module microtasks

### 1. Local Baileys engine adapter (US-076, 5 pts)

- [ ] In `packages/engine-core`, formalise `EngineAdapter` interface (already partially defined for DO).
- [ ] Implement `LocalAdapter` in `apps/desktop/src/main/engine/local-adapter.ts`:
  - [ ] Uses `@whiskeysockets/baileys` (Node-only) directly.
  - [ ] Persists auth state to `~/Library/Application Support/OpenWA/sessions/<id>/auth.json` (or platform equivalent).
  - [ ] Streams `qr`, `connection.update`, `messages.upsert` events into the main process EventEmitter.
- [ ] Spawn one engine per session in a separate `child_process.fork` to isolate crashes.
- [ ] Add `engine.health()` returning `{ status, lastSeen, sessionCount }`.
- [ ] Unit tests against a stubbed Baileys with `bun test`.

### 2. IPC contract (US-077, 3 pts)

- [ ] Move shared types to `packages/desktop-ipc`: `IpcRequest<T>`, `IpcResponse<T>`, channel names enum.
- [ ] Generate Zod validators (reuse `packages/validators` where possible).
- [ ] `preload.ts`: expose `window.openwa = { sessions: { list, create, getQR, disconnect }, messages: { send, list }, events: { on, off } }` via `contextBridge`.
- [ ] `main/ipc-handlers.ts`: dispatch with validation; any thrown error → `{ ok: false, error: { code, message } }`.
- [ ] Streaming via `webContents.send('openwa:event', ...)` for engine events.
- [ ] Snapshot-test the IPC schema so renderer/main never drift.

### 3. Local storage (US-078, 3 pts)

- [ ] Add `packages/db/src/schema/local.ts` mirroring tenant schema, but plain SQLite (no D1 dialect quirks).
- [ ] `apps/desktop/src/main/db.ts`: opens `~/.../OpenWA/data.sqlite` with better-sqlite3, runs `drizzle-kit` migrations from `packages/db/src/migrations/local/`.
- [ ] Generate first local migration (`bunx drizzle-kit generate --config=./drizzle.local.config.ts`).
- [ ] Provide `getLocalDB()` helper symmetric to `getControlPlaneDB()`.
- [ ] Backup/restore commands: `File → Export data…` writes a tar.gz of the data dir.

### 4. Bundle dashboard for desktop (US-079, 3 pts)

- [ ] Add `apps/dashboard/vite.config.desktop.ts` with `base: './'` and hash-based router.
- [ ] Build step `bun run build:desktop-renderer` outputs to `apps/desktop/dist/renderer/`.
- [ ] Main process loads `file://${__dirname}/../renderer/index.html` in production, `http://localhost:5173` in dev.
- [ ] Configure CSP: `default-src 'self' file:; connect-src 'self' ipc:`.
- [ ] Replace `fetch('/v1/...')` calls with an `apiClient` that, when `window.openwa` exists, routes through IPC; otherwise hits the network (same code, two backends).
- [ ] Visual regression: take a screenshot of `/sessions` and diff against the Pages build.

### 5. Auth + system tray (US-080, 2 pts)

- [ ] Local-only mode: skip login screen entirely, app starts directly in `/sessions`.
- [ ] Optional cloud mode: paste API key on first run, stored in OS keychain via `keytar`.
- [ ] System tray icon with menu: Show / Hide / Quit / Connected sessions count.
- [ ] Notifications via `new Notification()` on incoming messages (toggleable in Settings).
- [ ] Launch-on-login toggle via `app.setLoginItemSettings`.

### 6. Optional cloud-sync mode (US-081, 3 pts)

- [ ] Setting `cloudSync.enabled`: when true, the desktop engine periodically posts messages/contacts/labels to `/v1/sync/...` on the configured API URL.
- [ ] Conflict resolution: last-writer-wins, surfaced as a "sync conflict" entry in the audit log.
- [ ] Throttle to one POST batch per 30 s to stay inside Cloudflare free-tier limits.
- [ ] Offline queue: failed posts retried with exponential backoff; UI badge shows pending count.
- [ ] Disable sync button → wipes local sync state, keeps data.

### 7. Multi-platform packaging (US-082, 3 pts)

- [ ] Update `electron-builder.yml`:
  - [ ] `mac.target: dmg`, hardened runtime, entitlements file for keychain access.
  - [ ] `win.target: nsis`, per-machine + per-user installers.
  - [ ] `linux.target: [AppImage, deb, rpm]`, category `Office`.
- [ ] Pack `apps/desktop/dist/main` + `dist/renderer` + `node_modules/@whiskeysockets/baileys`.
- [ ] Native module rebuild step: `electron-builder install-app-deps` in postinstall.
- [ ] Verify each artifact launches and shows the QR screen.
- [ ] Artifact size budget: ≤ 180 MB per platform.

### 8. Code signing + notarization (US-083, 3 pts)

- [ ] macOS:
  - [ ] Apple Developer ID Application certificate (request via CSR).
  - [ ] Store `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` in GitHub Secrets.
  - [ ] electron-builder `afterSign` hook runs `electron-notarize`.
  - [ ] Verify with `spctl --assess --verbose=4 OpenWA.app`.
- [ ] Windows:
  - [ ] EV code-signing certificate (or Azure Trusted Signing).
  - [ ] `WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD` secrets; signs both .exe and .msi.
  - [ ] Verify with `signtool verify /pa OpenWA-Setup.exe`.
- [ ] Linux: PGP-sign AppImage + provide SHA-256 sums alongside release assets.

### 9. Auto-updater (US-084, 2 pts)

- [ ] `electron-updater` configured with `provider: github`, `owner: rmyndharis`, `repo: OpenWA`.
- [ ] `dev-app-update.yml` for local dev runs against a fake feed.
- [ ] In main process: `autoUpdater.checkForUpdatesAndNotify()` 30 s after launch + every 6 h.
- [ ] Renderer IPC events for `update-available`, `download-progress`, `update-downloaded`.
- [ ] Settings UI surface: "Check for updates" button + current version.
- [ ] Staged rollout via release channel tags (`beta`, `latest`).

### 10. CI release pipeline (US-085, 1 pt)

- [ ] `.github/workflows/release-desktop.yml`, triggered on `v*` tag push.
- [ ] Matrix: `macos-14`, `windows-2022`, `ubuntu-22.04`.
- [ ] Steps: checkout → setup-node@22 → setup-bun → `bun install` → `bun run --filter @openwa/desktop build` → `electron-builder --publish always`.
- [ ] Concurrency group `desktop-release` to avoid races.
- [ ] Post-release job: smoke-download each artifact and `--version` exits 0.

---

## Definition of Done

- Signed DMG, NSIS .exe, AppImage, .deb, and .rpm artifacts published to a GitHub Release.
- Fresh install on each platform: launches, shows QR, pairs a WhatsApp account, sends + receives a message — all without contacting Cloudflare.
- Cloud-sync toggle works: messages created locally appear in the dashboard within 60 s.
- Auto-update from version `v0.1.0` → `v0.1.1` succeeds without user interaction beyond the prompt.
- `bun run --filter @openwa/desktop typecheck`, `bun test`, `biome check` all green.
- `apps/desktop/README.md` updated with install + dev + build instructions, and `docs/SELF_HOST.md` mentions the desktop app as a zero-cost alternative.
