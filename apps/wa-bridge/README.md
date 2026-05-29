# @openwa/wa-bridge

Node sidecar that hosts Baileys WhatsApp sessions and exposes a tiny HTTP
API the Cloudflare engine Worker proxies to.

## Why do I need this?

The WhatsApp Web protocol needs `ws`, native crypto, and a writable
filesystem — none of which work in Cloudflare Workers. So one Node
process has to host the actual WhatsApp connection. Every WA library
(Baileys, whatsapp-web.js, venom) has this requirement.

This bridge is the *only* always-on Node piece in the OpenWA stack.
Everything else (API, dashboard, engine routing) runs on Cloudflare.

## Quick start (zero config)

```bash
# from the repo root:
bun install
bun run bridge
```

That's it. The bridge will:
1. Listen on `http://0.0.0.0:3001`.
2. Generate a `BRIDGE_TOKEN` and `BRIDGE_WEBHOOK_SECRET` on first run.
3. Print them to your terminal once with copy/paste-ready `wrangler` commands.
4. Persist them to `./.wa-auth/.bridge-config.json` so subsequent restarts
   reuse the same values.

You'll see something like:

```
────────────────────────────────────────────────────────────────
  wa-bridge first run — generated credentials (saved to disk):

  BRIDGE_TOKEN          = a1b2c3...
  BRIDGE_WEBHOOK_SECRET = 9f8e7d...

  Wire these into Cloudflare:
    cd apps/engine && wrangler secret put BRIDGE_TOKEN --env self-host
    cd apps/engine && wrangler secret put BRIDGE_URL   --env self-host
    cd apps/api    && wrangler secret put BRIDGE_WEBHOOK_SECRET --env self-host
────────────────────────────────────────────────────────────────
```

Run those three `wrangler secret put` commands, set `BRIDGE_URL` to a
URL Cloudflare can reach (see "Exposing the bridge" below), and the
dashboard will work end-to-end: create session → scan QR → chat.

## Exposing the bridge to Cloudflare

The bridge runs on your laptop / VPS / wherever. Cloudflare needs to
reach it over the public internet. Pick the easiest option:

### Option A — Cloudflare Tunnel (recommended, free, no port forwarding)

```bash
# install once
brew install cloudflared        # or apt install cloudflared
cloudflared tunnel login

# then, while the bridge is running:
cloudflared tunnel --url http://localhost:3001
```

Cloudflared prints a `https://<random>.trycloudflare.com` URL — paste
it as the value for `wrangler secret put BRIDGE_URL --env self-host`.

For a stable URL, create a named tunnel and CNAME a subdomain to it
([docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)).

### Option B — ngrok

```bash
ngrok http 3001
```

Use the `https://...ngrok-free.app` URL as `BRIDGE_URL`.

### Option C — a VPS with a public IP

Run the bridge behind any reverse proxy (Caddy / nginx / Traefik) with
TLS, and use that domain as `BRIDGE_URL`.

## Want Docker anyway?

Optional — useful for `systemd`-managed VPS deployments:

```bash
docker compose -f apps/wa-bridge/docker-compose.yml up -d
```

## Environment variables (all optional)

| Var | Default | Purpose |
| --- | --- | --- |
| `BRIDGE_TOKEN` | auto-generated | Shared bearer token between engine Worker and bridge. |
| `BRIDGE_WEBHOOK_URL` | unset | API `/v1/internal/engine-events` URL. Without it, the dashboard still works but webhooks won't fire. |
| `BRIDGE_WEBHOOK_SECRET` | auto-generated | HMAC-SHA256 secret used to sign engine events. |
| `BRIDGE_PORT` | `3001` | Listen port. |
| `BRIDGE_HOST` | `0.0.0.0` | Listen host. |
| `BRIDGE_AUTH_DIR` | `./.wa-auth` | Where Baileys auth state and generated config live. |
| `LOG_LEVEL` | `info` | Pino log level. |

## HTTP surface

All routes except `GET /health` require `Authorization: Bearer $BRIDGE_TOKEN`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET    | `/health` | liveness probe |
| GET    | `/sessions` | list active sessions |
| POST   | `/sessions/:id/start` (alias `/connect`) | start engine; QR emitted via webhook |
| POST   | `/sessions/:id/stop` (alias `/disconnect`) | graceful disconnect |
| POST   | `/sessions/:id/logout` | logout from WhatsApp and forget |
| GET    | `/sessions/:id/status` | engine state + health + auth |
| GET    | `/sessions/:id/qr` | last QR (data URL) — only after `/start` |
| POST   | `/sessions/:id/messages/text` | `{to, text}` |
| POST   | `/sessions/:id/messages/media` | `{to, kind, url\|base64, mimeType?, caption?, filename?, ptt?}` |
| POST   | `/sessions/:id/delete` | dispose engine + remove from map |

## Backup

The only state worth backing up is `./.wa-auth/`. It contains:

- Baileys session keys (`<sessionId>/`) — losing these means re-pairing on next start.
- `.bridge-config.json` — the generated `BRIDGE_TOKEN` and `BRIDGE_WEBHOOK_SECRET`.

Copying that directory between machines is a complete migration.
