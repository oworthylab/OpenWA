# Sprint 5 Review — Desktop App

> **Status:** ✅ Scaffold delivered. Live cross-platform packaging deferred to Sprint 6.

## Summary

Sprint 5 shipped a complete, type-safe scaffold for `@openwa/desktop` —
the Electron app that embeds the Baileys engine for single-user,
local-first WhatsApp automation. The scaffold compiles, lints, and is
covered by 14 unit tests. The live application — boot on macOS / Windows
/ Linux, code-signed installers, automated GitHub Releases — is deferred
to Sprint 6 because the dev container used for day-to-day work cannot
run Electron or rebuild Baileys' native dependencies (`better-sqlite3`,
`utf-8-validate`, `bufferutil`).

## What shipped

### Typed IPC contract (`@openwa/shared/desktop`)

A new subpath export from `@openwa/shared` defines the entire main →
renderer surface as TypeScript types:

| Surface | Channels |
|---|---|
| `IpcInvokeMap` (request/response) | `app:getInfo`, `app:getSettings`, `app:updateSettings`, `app:quit`, `session:list`, `session:create`, `session:start`, `session:stop`, `session:restart`, `session:remove`, `session:logout`, `session:requestQr`, `updater:check`, `updater:installNow` |
| `IpcEventMap` (one-way) | `session:status`, `session:qr`, `session:removed`, `engine:error`, `notification:click`, `updater:status` |

Channel names are constrained at compile time. Any drift between main
and renderer fails `tsc -b`.

### Electron app scaffold (`apps/desktop`)

```
apps/desktop/
├── package.json              # electron + electron-updater declared as optional peer deps
├── tsconfig.json
├── electron-builder.yml      # dmg / nsis / AppImage / deb targets
├── README.md
└── src/
    ├── electron-shims.d.ts   # minimal Electron type shims (avoids native install)
    ├── main/
    │   ├── index.ts          # bootstrap + service composition
    │   ├── engine-manager.ts # NodeEngine pool + event-to-IPC translation
    │   ├── ipc.ts            # typed ipcMain.handle registration
    │   ├── session-store.ts  # JSON-backed session metadata
    │   ├── settings.ts       # DesktopSettings persistence
    │   ├── tray.ts           # tray controller (US-045)
    │   ├── notifications.ts  # native notification center (US-045)
    │   └── updater.ts        # electron-updater wiring (US-046)
    ├── preload/index.ts      # contextBridge → window.openwa
    └── renderer/             # placeholder shell (Sprint 6 replaces with React)
```

The scaffold is added to the root `tsconfig.json` project references so
`bunx tsc -b` and `bunx turbo run typecheck|test|lint` cover it.

### User stories

| ID | Title | Status |
|---|---|---|
| US-043 | Electron Scaffold | ✅ Shipped (compiling skeleton) |
| US-044 | Local Engine Manager | ✅ Shipped (full event surface, mocked tests) |
| US-045 | Tray + Notifications | ✅ Shipped (typed scaffolds) |
| US-046 | Auto-Updater | ✅ Shipped (electron-updater wiring + IPC broadcast) |

### Tests

`apps/desktop` ships with 14 unit tests (28 assertions) across two
suites:

- `SessionStore` — CRUD, persistence across instances, credential reset.
- `EngineManager` — lifecycle (create/start/stop/logout/remove), QR
  forwarding, shutdown fan-out, error handling. Uses a fake engine that
  matches the real `NodeEngine` event surface.

```
Tasks:    4 successful, 4 total (turbo run test)
14 pass, 0 fail, 28 expect() calls
```

## Deferred to Sprint 6

| Item | Reason |
|---|---|
| Live Electron boot (`bun run dev`) | Requires Electron binary + native rebuilds; not feasible in dev container. |
| Cross-platform CI build pipeline | Needs macOS / Windows runners on GitHub Actions. |
| Code signing + Apple notarisation | Requires Apple Developer credentials + Windows EV cert. |
| React renderer UI | Sprint 6 owns the design system migration to desktop. |
| Playwright integration tests against built app | Depends on the live boot above. |
| `better-sqlite3` session store backend | JSON snapshot is sufficient for Sprint 5 scaffold; sqlite + `safeStorage` lands with the live UI. |

## Risks tracked

- **Native module rebuild matrix.** Baileys depends on `utf-8-validate`,
  `bufferutil`, and (optionally) `sodium-native`. The Sprint 6 build
  pipeline needs `electron-rebuild` invoked for each target platform.
- **Auto-update channel split.** `electron-updater` reads `channel`
  from the published `latest.yml`. Sprint 6 must standardise the
  `stable` / `beta` / `dev` semantics across `package.json` versions
  and GitHub Release tags.
- **Auth state portability.** The local session store + Baileys auth
  directory are not yet encrypted at rest. Sprint 6 wraps these with
  Electron `safeStorage` before the first live release.

## Pipeline status

```
bunx tsc -b --force              → clean
bunx turbo run typecheck         → 7 packages, all green
bunx turbo run lint              → all green
bunx turbo run test              → 4 packages, 14 pass
```

## Next steps (Sprint 6 scope)

1. Live Electron boot on a host OS with `electron@^33` installed.
2. React renderer wired against `window.openwa`.
3. `better-sqlite3` + `safeStorage` for the session store.
4. Cross-platform packaging via GitHub Actions (mac dmg, win nsis,
   linux AppImage/deb) with code signing.
5. Playwright E2E suite for the desktop app.
