# OpenWA Desktop (Electron)

Native desktop client for WhatsApp, built as a thin Electron shell
around `web.whatsapp.com` — the same approach the official WhatsApp
Desktop app uses.

## Why this design

We considered three approaches before choosing:

| Approach | Pros | Cons |
|----------|------|------|
| **A. Electron + Puppeteer / whatsapp-web.js** | Programmatic API, can run "headless" inside the app | Puppeteer downloads its **own** Chromium (~280 MB) separate from Electron's, doubling install size; fragile when WhatsApp updates its internal Store; visible UI is awkward to embed |
| **B. Electron + Baileys bridge (current `apps/desktop-tauri` style)** | Light, no browser | Re-implements the WA protocol; breaks every few months when WA changes; no media-call UI |
| **C. Electron `BrowserWindow` → web.whatsapp.com** ✓ | WhatsApp's own JS handles QR, protocol, chat UI, calls, media; survives WA updates automatically; ~250 MB install; native tray / notifications | No headless automation (use the bundled API server for that) |

Option C is what this app implements. It is functionally identical to
opening WhatsApp Web in Chrome, plus:

- Persistent session (no QR re-scan after restart) via Electron's
  `session.fromPartition('persist:openwa-<account>')`.
- Multi-account: each account gets its own isolated partition. Switch
  with the sidebar — no logout/login dance.
- System tray, native notifications, single-instance lock, badge
  count, hide-to-tray on close.
- External links open in the system browser, not the WA frame.

## Run from source

```bash
cd apps/desktop-electron
npm install --no-workspaces --install-strategy=hoisted --prefix . --no-audit --no-fund
npm start
```

In a headless Linux env (Codespaces, CI) you need a display server and
sandbox bypass:

```bash
xvfb-run -a -s "-screen 0 1280x800x24" npm run start:nosandbox
```

The sandbox can also be enabled properly with:

```bash
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

## Build installers

```bash
npm run dist            # current OS
npm run dist:linux      # AppImage + .deb
npm run dist:mac        # .dmg + .zip
npm run dist:win        # NSIS + portable
```

Output lands in `dist/`.

## Where session data lives

| OS      | Path                                                        |
|---------|-------------------------------------------------------------|
| Linux   | `~/.config/OpenWA/Partitions/openwa-<account>/`             |
| macOS   | `~/Library/Application Support/OpenWA/Partitions/...`       |
| Windows | `%APPDATA%\OpenWA\Partitions\openwa-<account>\`             |

Account list: `accounts.json` in the same `OpenWA` user-data root.

## Adding a second account

Click the **+** at the bottom of the left sidebar. A fresh WhatsApp
Web instance loads in a brand-new browser context — scan the QR with
your second phone. Right-click an account to remove it (wipes its
local data). Double-click to rename.

## Why not just bookmark web.whatsapp.com?

- No tray / no badge / no notifications when the tab is closed.
- One Chrome profile = one WhatsApp account. We give you N.
- Browser updates can purge the session randomly; ours doesn't.
- We never log you out for a "Chrome is too old" warning, because
  Electron pins the Chromium version.

## Relationship to the rest of OpenWA

This app is **only the chat client**. For programmatic / webhook /
multi-tenant scenarios, run the API server + dashboard in
`apps/api` + `dashboard/` and use the Baileys engine. Use this app
when you just want to chat from your desktop.
