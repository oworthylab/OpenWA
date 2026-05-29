# Self-Hosting OpenWA on Cloudflare

OpenWA's serverless API runs entirely on Cloudflare Workers + D1 + KV +
Queues + Durable Objects. This guide covers two deployment shapes:

1. **Single-tenant** — one operator, one team, one auto-provisioned
   admin key. Registration is disabled.
2. **Multi-tenant (SaaS)** — the default. `/v1/auth/register` is open,
   each tenant gets isolated data + an admin key.

Both shapes share the same code; only `wrangler.toml` env profiles and
the `SELF_HOST_MODE` flag differ.

---

## Prerequisites

- Cloudflare account (Workers Paid plan recommended for queues + D1
  beyond the free tier).
- Node.js 22 + Bun ≥ 1.3 (or use `npm`/`pnpm` with the workspace).
- Wrangler 4 (`bunx wrangler --version`).
- `bun install` from the repo root.

---

## 1. Single-tenant self-host

### Step 1 — Provision Cloudflare resources

```bash
cd apps/api
bunx wrangler d1 create openwa-control-plane
bunx wrangler kv namespace create AUTH_CACHE
bunx wrangler queues create openwa-webhooks
bunx wrangler queues create openwa-webhooks-dlq
```

Copy the returned IDs into `apps/api/wrangler.toml` under
`[env.self-host]` — uncomment the `[[env.self-host.d1_databases]]`,
`[[env.self-host.kv_namespaces]]`, and queue blocks, then replace
`REPLACE_ME` with the real IDs.

### Step 2 — Apply schema

```bash
cd packages/db
bunx drizzle-kit generate --config=./drizzle.control-plane.config.ts
bunx wrangler d1 migrations apply openwa-control-plane --remote
```

### Step 3 — Set secrets

```bash
cd apps/api

# Required: token signing secret for password reset/email verification.
bunx wrangler secret put AUTH_TOKEN_SECRET --env self-host

# Recommended: pre-shared admin API key. Format must be
# `openwa_<8 alphanumerics>_<32 alphanumerics>`.
# If you skip this, the worker generates one on first boot and logs
# it once at WARN level — fish it out of Logpush.
bunx wrangler secret put SELF_HOST_ADMIN_API_KEY --env self-host

# Optional: error tracking.
bunx wrangler secret put SENTRY_DSN --env self-host
```

### Step 4 — Deploy

```bash
cd apps/api
bunx wrangler deploy --env self-host
```

### Step 5 — Verify

```bash
# Health is public.
curl https://openwa-api.<your-account>.workers.dev/health

# Authenticated endpoints with your admin key:
curl -H "X-API-Key: openwa_xxxxxxxx_..." \
  https://openwa-api.<your-account>.workers.dev/v1/sessions
```

Registration is intentionally disabled in this mode:

```bash
curl -X POST https://openwa-api.<your-account>.workers.dev/v1/auth/register \
  -d '{"email":"x@y.com","password":"p","name":"x","tenantName":"x","tenantSlug":"x"}'
# {"error":{"code":"SELF_HOST_REGISTRATION_DISABLED",...}}
```

### What you get

| Resource | Default | Override |
|---|---|---|
| Tenant id | `self-host-tenant` | `SELF_HOST_TENANT_ID` |
| Tenant name | `Self-Host` | `SELF_HOST_TENANT_NAME` |
| Plan | `enterprise` (no usage limits) | — |
| Admin key | auto-generated | `SELF_HOST_ADMIN_API_KEY` |

All Sprint 8 features — labels, statuses, settings, plugins, `/docs`
portal, structured logs, Sentry envelope — are enabled out of the box.

---

## 2. Multi-tenant SaaS

Identical to single-tenant **except**:

- Leave `SELF_HOST_MODE` unset (or set to `false`).
- Use the `[env.staging]` or `[env.production]` profile in `wrangler.toml`.
- `/v1/auth/register` is open so each customer creates their own
  tenant + admin key via the public flow.
- Set `STRIPE_SECRET` + `STRIPE_WEBHOOK_SECRET` to enable
  `/v1/billing/*` (otherwise billing routes operate in stub mode).

```bash
cd apps/api
bunx wrangler secret put STRIPE_SECRET --env production
bunx wrangler secret put STRIPE_WEBHOOK_SECRET --env production
bunx wrangler secret put AUTH_TOKEN_SECRET --env production
bunx wrangler deploy --env production
```

---

## Environment variable reference

| Var | Mode | Purpose |
|---|---|---|
| `SELF_HOST_MODE` | self-host | `'true'` enables single-tenant mode |
| `SELF_HOST_TENANT_ID` | self-host | tenant id of the auto-provisioned tenant |
| `SELF_HOST_TENANT_NAME` | self-host | display name |
| `SELF_HOST_ADMIN_API_KEY` | self-host | pre-shared admin key (secret) |
| `AUTH_TOKEN_SECRET` | both | HMAC secret for verification tokens (secret) |
| `STRIPE_SECRET` | multi-tenant | Stripe live/test secret (secret) |
| `STRIPE_WEBHOOK_SECRET` | multi-tenant | Stripe webhook signing secret (secret) |
| `SENTRY_DSN` | optional | Sentry envelope reporter target |
| `SENTRY_RELEASE` | optional | Sentry release tag (build sha) |
| `LOG_LEVEL` | optional | `debug` \| `info` \| `warn` \| `error` |
| `ENVIRONMENT` | both | `development` \| `staging` \| `production` |

---

## Local development

```bash
cd apps/api
bunx wrangler dev --env self-host --local
# In another terminal:
curl -H "X-API-Key: openwa_xxxxxxxx_..." http://localhost:8787/v1/sessions
```

`--local` uses Miniflare's in-memory D1 + KV. Schema is applied via:

```bash
cd packages/db
bunx wrangler d1 migrations apply openwa-control-plane --local
```

---

## Migrating between modes

| From → To | Steps |
|---|---|
| Multi-tenant → Self-host | Pick one tenant id, set `SELF_HOST_TENANT_ID` to it, flip `SELF_HOST_MODE=true`, redeploy. Existing data preserved. |
| Self-host → Multi-tenant | Unset `SELF_HOST_MODE`, redeploy. The original tenant remains; `/v1/auth/register` accepts new tenants. |

No schema changes are required to switch.

---

## Testing

```bash
cd apps/api
bun test
# 131+ tests covering routes, auth, billing, logger, Sentry,
# multi-tenant isolation contract, and self-host mode.
```

The legacy NestJS e2e suite under `legacy/e2e-nestjs/` is archived —
it targets a stack that no longer exists. See
[`legacy/e2e-nestjs/ARCHIVED.md`](../legacy/e2e-nestjs/ARCHIVED.md).

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `401 INVALID_API_KEY` on every request after self-host deploy | Bootstrap couldn't write to D1 (binding misconfigured) or `SELF_HOST_ADMIN_API_KEY` format is wrong (`openwa_<8>_<32>`). Check `wrangler tail`. |
| `500 INTERNAL_ERROR` on `/v1/*` routes | `CONTROL_PLANE_DB` binding missing — verify `wrangler.toml` IDs match the resources created in Step 1. |
| `503` on `/v1/billing/webhooks` | `STRIPE_WEBHOOK_SECRET` not set — only needed for multi-tenant billing. |
| Auto-generated key not appearing in logs | Confirm `LOG_LEVEL` is `warn` or lower (default is `info` in production). |
