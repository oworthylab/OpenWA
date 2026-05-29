# @openwa/wa-bridge

Node sidecar that hosts Baileys WhatsApp sessions and exposes a tiny HTTP
API the Cloudflare engine Worker proxies to.

**Why:** Baileys depends on `ws`, `node:crypto`, native Curve25519 bindings,
and a writable filesystem (auth state). None of that runs in the Workers
runtime. Until OpenWA ships its Workers-native WA protocol implementation,
this sidecar is the production path for real WhatsApp connectivity.

## Quick start

```bash
export BRIDGE_TOKEN=$(openssl rand -hex 32)
export BRIDGE_WEBHOOK_SECRET=$(openssl rand -hex 32)
export BRIDGE_WEBHOOK_URL=https://openwa-api.example.workers.dev/v1/internal/engine-events

bun install
bun --cwd apps/wa-bridge dev
# bridge listening on 0.0.0.0:3001
```

Then point the engine Worker at it:

```bash
cd apps/engine
wrangler secret put BRIDGE_URL   --env self-host   # https://wa-bridge.your-host.com
wrangler secret put BRIDGE_TOKEN --env self-host   # same value as BRIDGE_TOKEN above
wrangler deploy --env self-host
```

And give the API Worker the matching webhook secret:

```bash
cd apps/api
wrangler secret put BRIDGE_WEBHOOK_SECRET --env self-host
wrangler deploy --env self-host
```

From the dashboard, create a session → open the QR modal → scan with
WhatsApp. The bridge emits `auth.ready` once paired and you can start
sending messages.

## Environment variables

| Var | Default | Required | Purpose |
| --- | --- | --- | --- |
| `BRIDGE_TOKEN` | — | yes | Shared bearer token between engine Worker and bridge. |
| `BRIDGE_WEBHOOK_URL` | unset | no | API `/v1/internal/engine-events` URL. Disables event forwarding when unset. |
| `BRIDGE_WEBHOOK_SECRET` | `dev-secret-change-me` | yes if URL set | HMAC-SHA256 secret used to sign engine events. |
| `BRIDGE_PORT` | `3001` | no | Listen port. |
| `BRIDGE_HOST` | `0.0.0.0` | no | Listen host. |
| `BRIDGE_AUTH_DIR` | `./.wa-auth` | no | Baileys multi-file auth state directory. Mount a volume here in prod. |
| `LOG_LEVEL` | `info` | no | Pino log level. |

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

## Hosting

The bridge is a stateful Node process; it can't run on Workers/Pages. Pick:

- **Fly.io** (free tier): `fly launch --dockerfile apps/wa-bridge/Dockerfile`, attach a volume at `/data/wa-auth`.
- **VPS / Hetzner / DigitalOcean**: `docker run -d -p 3001:3001 -v wa_auth:/data/wa-auth -e BRIDGE_TOKEN=... openwa/wa-bridge`.
- **Local Docker** (development): `docker compose -f docker-compose.dev.yml up wa-bridge`.

Whatever you pick, terminate TLS at the front (Cloudflare Tunnel, Fly's
managed TLS, a reverse proxy). The bridge speaks plain HTTP; the bearer
token is the only trust boundary.
