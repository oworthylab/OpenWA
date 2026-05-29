#!/usr/bin/env bash
# OpenWA — One-command self-host deploy to Cloudflare.
#
# Provisions a complete single-tenant deployment on a fresh Cloudflare
# account: D1 (control plane), KV (auth cache), Queues (webhook fanout),
# Durable Objects (engine), and two Workers (api + engine).
#
# Idempotent: re-running skips already-created resources.
#
# Prerequisites:
#   1. A Cloudflare API token with these permissions, exported as
#      CLOUDFLARE_API_TOKEN:
#        - Workers Scripts: Edit
#        - Workers KV Storage: Edit
#        - D1: Edit
#        - Queues: Edit            (requires Workers Paid plan, $5/mo)
#        - Account Settings: Read
#      Create at https://dash.cloudflare.com/profile/api-tokens
#
#   2. (Optional) CLOUDFLARE_ACCOUNT_ID — only needed if your token covers
#      multiple accounts; wrangler will prompt otherwise.
#
#   3. bun + wrangler installed (handled by `bun install` at the repo root).
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=cf_xxx...
#   ./scripts/deploy-self-host.sh
#
# Or with a pre-shared admin key:
#   SELF_HOST_ADMIN_API_KEY=openwa_xxxxxxxx_xxxxxxxx... \
#     ./scripts/deploy-self-host.sh
#
# What gets created (on the linked CF account):
#   D1:     openwa-control-plane
#   KV:     openwa-auth-cache
#   Queues: openwa-webhooks, openwa-webhooks-dlq
#   Workers: openwa-api, openwa-engine
#
# To tear down, see ./scripts/teardown-self-host.sh.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------- 0. Sanity ----------
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set." >&2
  echo "       Create one at https://dash.cloudflare.com/profile/api-tokens" >&2
  exit 1
fi

# Use bun's wrangler so we don't depend on a globally installed wrangler.
WRANGLER="bunx wrangler"

echo "==> Verifying Cloudflare credentials..."
WHOAMI_OUT="$($WRANGLER whoami 2>&1)"
echo "$WHOAMI_OUT" | grep -E "(Email|associated|account)" || true

# ---------- 1. Create resources (idempotent via grep on existing list) ----------
TOML="$REPO_ROOT/apps/api/wrangler.toml"
PROFILE="[env.self-host]"

cd "$REPO_ROOT/apps/api"

# ----- D1 -----
echo "==> Ensuring D1 database 'openwa-control-plane' exists..."
D1_LIST="$($WRANGLER d1 list 2>&1 || true)"
if echo "$D1_LIST" | grep -q "openwa-control-plane"; then
  D1_ID="$(echo "$D1_LIST" | awk '/openwa-control-plane/ {print $2}' | head -1)"
  echo "    found existing D1: $D1_ID"
else
  D1_CREATE="$($WRANGLER d1 create openwa-control-plane 2>&1)"
  D1_ID="$(echo "$D1_CREATE" | grep -oE '"database_id":\s*"[^"]+"' | head -1 | cut -d'"' -f4)"
  echo "    created D1: $D1_ID"
fi

# ----- KV -----
echo "==> Ensuring KV namespace 'openwa-auth-cache' exists..."
KV_LIST="$($WRANGLER kv namespace list 2>&1 || true)"
KV_ID="$(echo "$KV_LIST" | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    for ns in data:
        if ns.get('title') in ('openwa-auth-cache', 'openwa-api-AUTH_CACHE'):
            print(ns['id'])
            break
except Exception:
    pass
" || true)"
if [[ -z "$KV_ID" ]]; then
  KV_CREATE="$($WRANGLER kv namespace create AUTH_CACHE 2>&1)"
  KV_ID="$(echo "$KV_CREATE" | grep -oE 'id\s*=\s*"[^"]+"' | head -1 | cut -d'"' -f2)"
  echo "    created KV: $KV_ID"
else
  echo "    found existing KV: $KV_ID"
fi

# ----- Queues (optional, requires Workers Paid plan) -----
HAS_QUEUES=true
echo "==> Ensuring queues exist (requires Workers Paid plan)..."
if ! $WRANGLER queues list >/dev/null 2>&1; then
  echo "    queues unavailable — skipping (free plan?). Webhook fan-out will be disabled."
  HAS_QUEUES=false
else
  for q in openwa-webhooks openwa-webhooks-dlq; do
    if $WRANGLER queues list 2>&1 | grep -q "$q"; then
      echo "    queue exists: $q"
    else
      $WRANGLER queues create "$q" 2>&1 | tail -1
    fi
  done
fi

# ---------- 2. Apply schema ----------
echo "==> Applying D1 migrations..."
cd "$REPO_ROOT/packages/db"
if [[ ! -d "src/migrations/control-plane" ]] || [[ -z "$(ls src/migrations/control-plane/*.sql 2>/dev/null)" ]]; then
  echo "    generating migration from drizzle schema..."
  $WRANGLER --version >/dev/null  # ensure wrangler is reachable
  bunx drizzle-kit generate --config=./drizzle.control-plane.config.ts | tail -5
fi
# Apply via wrangler d1 execute on the most recent migration file.
MIG="$(ls -t src/migrations/control-plane/*.sql | head -1)"
echo "    applying $MIG to openwa-control-plane (remote)..."
$WRANGLER d1 execute openwa-control-plane --remote --file="$MIG" 2>&1 | tail -5

# ---------- 3. Patch wrangler.toml ----------
echo "==> Patching apps/api/wrangler.toml with resource IDs..."
python3 - "$TOML" "$D1_ID" "$KV_ID" "$HAS_QUEUES" <<'PYEOF'
import sys, re, pathlib
toml_path, d1_id, kv_id, has_queues_str = sys.argv[1:5]
has_queues = has_queues_str == 'true'
p = pathlib.Path(toml_path)
text = p.read_text()

# Build the resolved [env.self-host] block (replaces commented stubs).
block = f"""[env.self-host]
name = "openwa-api"

[env.self-host.vars]
SELF_HOST_MODE = "true"
ENVIRONMENT = "production"
LOG_LEVEL = "info"
SELF_HOST_TENANT_ID = "self-host-tenant"
SELF_HOST_TENANT_NAME = "Self-Host"

[[env.self-host.d1_databases]]
binding = "CONTROL_PLANE_DB"
database_name = "openwa-control-plane"
database_id = "{d1_id}"

[[env.self-host.kv_namespaces]]
binding = "AUTH_CACHE"
id = "{kv_id}"
"""
if has_queues:
    block += """
[[env.self-host.queues.producers]]
binding = "WEBHOOK_QUEUE"
queue = "openwa-webhooks"

[[env.self-host.queues.consumers]]
queue = "openwa-webhooks"
max_batch_size = 10
max_batch_timeout = 5
max_retries = 4
dead_letter_queue = "openwa-webhooks-dlq"
"""
block += """
[[env.self-host.services]]
binding = "ENGINE"
service = "openwa-engine"
"""

# Replace from the "self-host" comment block down to EOF.
marker_re = re.compile(r"# -+\s*self-host.*", re.IGNORECASE)
m = marker_re.search(text)
if m:
    new = text[: m.start()].rstrip() + "\n\n# ---------------- self-host (single-tenant) ----------------\n" + block
else:
    new = text.rstrip() + "\n\n# ---------------- self-host (single-tenant) ----------------\n" + block
p.write_text(new)
print(f"    wrote {toml_path}")
PYEOF

# ---------- 4. Secrets ----------
echo "==> Setting secrets..."
cd "$REPO_ROOT/apps/api"

# AUTH_TOKEN_SECRET: required for password reset + email verification.
if ! $WRANGLER secret list --env self-host 2>/dev/null | grep -q AUTH_TOKEN_SECRET; then
  AUTH_TOKEN_SECRET="$(openssl rand -hex 32)"
  echo "$AUTH_TOKEN_SECRET" | $WRANGLER secret put AUTH_TOKEN_SECRET --env self-host 2>&1 | tail -2
fi

# SELF_HOST_ADMIN_API_KEY: pre-shared or generated.
if [[ -n "${SELF_HOST_ADMIN_API_KEY:-}" ]]; then
  echo "    using provided SELF_HOST_ADMIN_API_KEY"
elif ! $WRANGLER secret list --env self-host 2>/dev/null | grep -q SELF_HOST_ADMIN_API_KEY; then
  # Generate a key in `openwa_<8>_<32>` format.
  ALPHABET='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  rand_chars() {
    local n="$1"
    LC_ALL=C tr -dc "$ALPHABET" </dev/urandom | head -c "$n"
  }
  P="$(rand_chars 8)"; S="$(rand_chars 32)"
  SELF_HOST_ADMIN_API_KEY="openwa_${P}_${S}"
  echo ""
  echo "    >>> Generated admin API key (SAVE THIS, it won't be shown again):"
  echo "    >>> $SELF_HOST_ADMIN_API_KEY"
  echo ""
fi
if [[ -n "${SELF_HOST_ADMIN_API_KEY:-}" ]]; then
  echo "$SELF_HOST_ADMIN_API_KEY" | $WRANGLER secret put SELF_HOST_ADMIN_API_KEY --env self-host 2>&1 | tail -2
fi

# ---------- 5. Deploy engine first (api depends on its service binding) ----------
echo "==> Deploying openwa-engine..."
cd "$REPO_ROOT/apps/engine"
$WRANGLER deploy --env self-host 2>&1 | tail -10

# ---------- 6. Deploy api ----------
echo "==> Deploying openwa-api..."
cd "$REPO_ROOT/apps/api"
$WRANGLER deploy --env self-host 2>&1 | tail -10

# ---------- 7. Smoke test ----------
ACCOUNT_SUBDOMAIN="$($WRANGLER whoami 2>&1 | grep -oE '[a-z0-9-]+\.workers\.dev' | head -1 || true)"
if [[ -z "$ACCOUNT_SUBDOMAIN" ]]; then
  ACCOUNT_SUBDOMAIN="$(echo "$WHOAMI_OUT" | grep -oE '[a-zA-Z0-9-]+@[a-zA-Z0-9.-]+' | head -1 || true)"
fi
URL="https://openwa-api.${ACCOUNT_SUBDOMAIN:-<your-subdomain>.workers.dev}"
echo ""
echo "================================================================"
echo "  ✅  Self-host deploy complete."
echo "================================================================"
echo "  API base URL:  $URL"
echo "  Health check:  curl $URL/health"
echo "  Docs portal:   $URL/docs"
echo ""
echo "  Try it:"
echo "    curl -H \"X-API-Key: \$SELF_HOST_ADMIN_API_KEY\" $URL/v1/sessions"
echo ""
echo "  Tenant registration is DISABLED in self-host mode. To switch to"
echo "  multi-tenant SaaS mode, unset SELF_HOST_MODE in wrangler.toml"
echo "  and redeploy."
echo "================================================================"
