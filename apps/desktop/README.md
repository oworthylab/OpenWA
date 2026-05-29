# @openwa/desktop

OpenWA Desktop is an Electron app that embeds the Baileys engine for
single-user, local-first WhatsApp automation. It is the desktop
companion to the cloud platform — the same `@openwa/engine` runs locally
in the main process and is exposed to the renderer over a fully typed
IPC bridge.

## Sprint 5 scope (this release)

This package ships as a **compiling scaffold** with the full type
surface and process wiring in place. The dev container used for
day-to-day work cannot run Electron or rebuild Baileys' native
dependencies, so the live UI + cross-platform release pipeline are
deferred to Sprint 6.

Shipped:

- [x] **US-043 — Electron Scaffold:** package layout, `tsconfig`,
      `electron-builder.yml`, BrowserWindow bootstrap, preload bridge.
- [x] **US-044 — Local Engine Manager:** `EngineManager` + `SessionStore`
      backed by JSON snapshots, with full event-to-IPC translation.
- [x] **US-045 — Tray + Notifications:** tray controller + notification
      center scaffolds backed by typed contracts.
- [x] **US-046 — Auto-Updater:** `UpdaterController` wired into
      `electron-updater` events + IPC broadcast.

Deferred to Sprint 6:

- Cross-platform CI build pipeline (mac dmg, win nsis, linux AppImage)
- Code signing + notarisation
- Real React renderer UI
- Playwright integration tests against the built app
- Native module rebuild matrix (better-sqlite3, Baileys)

## Typed IPC

The contract lives in [`@openwa/shared/desktop`](../../packages/shared/src/desktop/ipc.ts):

- `IpcInvokeMap` — request/response shape for `ipcRenderer.invoke`.
- `IpcEventMap` — payload shape for one-way `webContents.send` events.

The preload script exposes a `window.openwa` bridge with two methods:

```ts
window.openwa.invoke('session:list', undefined);
window.openwa.on('session:status', (summary) => { /* … */ });
```

Both methods are constrained by the channel name, so renderer + main
drift fails at compile time.

## Local development

Install Electron and the native modules in your host environment:

```bash
cd apps/desktop
bun add -d electron@^33 electron-builder@^25 electron-updater@^6 better-sqlite3@^11
bun run typecheck
```

Once Sprint 6 wires the live launcher, `bun run dev` will boot the app
against a Vite dev server.

## Architecture

```
src/
  electron-shims.d.ts   ← minimal Electron type declarations so the
                          package typechecks without installing the
                          (heavy, native) electron + electron-updater
                          packages in the monorepo.
  main/
    index.ts            ← Electron bootstrap + service composition.
    engine-manager.ts   ← Per-session NodeEngine pool + IPC broadcast.
    ipc.ts              ← Typed `ipcMain.handle` registration.
    session-store.ts    ← JSON-backed session metadata store.
    settings.ts         ← User settings (`DesktopSettings`).
    tray.ts             ← System tray controller (US-045).
    notifications.ts    ← OS notification center (US-045).
    updater.ts          ← electron-updater wiring (US-046).
  preload/
    index.ts            ← contextBridge → `window.openwa`.
  renderer/
    index.html          ← Sprint 5 placeholder shell.
    main.ts             ← Renderer entry — demonstrates the bridge.
```

The main process is intentionally service-oriented — each subsystem is
a single class with explicit dependencies, so Sprint 6 can drop in a
real React renderer without touching engine wiring.
