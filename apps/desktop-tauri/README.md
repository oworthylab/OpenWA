# OpenWA Desktop (Tauri)

A native desktop app for WhatsApp. **No Docker, no cloud, no command line for the user.**
Open the app → click **+** → scan the QR with your phone → chat.

```
┌──────────────────────────────────────────────────────────────┐
│  OpenWA.app                                                  │
│                                                              │
│  Accounts                                                    │
│  ──────────                                                  │
│  Personal      ┌──────────────────────────────┐              │
│  Work          │                              │              │
│  + Add         │       QR  CODE  HERE         │              │
│                │                              │              │
│                └──────────────────────────────┘              │
│                Open WhatsApp → Linked devices → Link…        │
└──────────────────────────────────────────────────────────────┘
```

## How it works

The app bundles three things:

1. A small **portable Node.js binary** (fetched once via `npm run prepare:node`).
2. The **wa-bridge** Baileys server, bundled as a single CommonJS file.
3. A tiny vanilla-JS UI that talks to the bridge over `http://127.0.0.1:<random>`.

When the window opens, the Rust process spawns the bridge on a random
free port, reads the auto-generated bearer token, and hands `{base_url, token}`
to the frontend through a Tauri command. The UI then drives the bridge
directly — `/sessions/:id/start`, `/qr`, `/messages/text`, etc.

No cloud round-trip, no Cloudflare tunnel, no manual config. Auth data
lives under the OS-standard app data directory:

| OS      | Path                                           |
| ------- | ---------------------------------------------- |
| macOS   | `~/Library/Application Support/com.openwa.desktop/wa-auth/` |
| Linux   | `~/.local/share/com.openwa.desktop/wa-auth/`   |
| Windows | `%APPDATA%\com.openwa.desktop\wa-auth\`        |

## Prerequisites (build machine only — end users need nothing)

- **Rust** ≥ 1.77 — install via [rustup.rs](https://rustup.rs)
- **Node.js** ≥ 20 — for the bundle/prepare scripts
- Platform deps for Tauri:
  - macOS: Xcode Command Line Tools (`xcode-select --install`)
  - Linux: `apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
  - Windows: Microsoft C++ Build Tools + WebView2 (preinstalled on Win11)

## Run it

From the repo root:

```bash
cd apps/desktop-tauri
pnpm install          # or npm install
pnpm run dev          # bundles bridge + downloads Node + launches Tauri dev window
```

The first run takes ~1 minute (downloading Node, compiling Rust).
Subsequent runs are seconds.

## Build a distributable

```bash
pnpm run build
```

Produces:
- macOS: `.dmg` and `.app` under `src-tauri/target/release/bundle/`
- Linux: `.AppImage` and `.deb`
- Windows: `.msi` and `.exe`

> Before shipping a release, replace the placeholder icons by running
> `npx @tauri-apps/cli icon path/to/logo.png` from this directory.

## Troubleshooting

- **"bridge failed to start"** in the status bar → click the ⓵ button to
  open the auth dir; tail `bridge.log` to see what Node printed.
- **QR never appears** → make sure the bundle/prepare step ran. Re-run
  `pnpm run prepare:all`.
- **Native module errors when bundling** → the staging script copies
  `@whiskeysockets/baileys` and its native deps from the workspace
  `node_modules`. Run `pnpm install` at the repo root first so they exist.

## Differences from the cloud edition

The desktop app **does not** use:
- the Cloudflare API Worker
- the Cloudflare Engine Worker
- the Pages dashboard
- D1, R2, KV, or any other cloud storage

It only uses `wa-bridge` and a local UI. That's by design — desktop should
be standalone. If you also want the multi-tenant cloud product, run the
serverless stack separately (`pnpm dev` at the repo root).
