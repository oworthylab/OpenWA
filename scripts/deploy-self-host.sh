#!/usr/bin/env bash
# OpenWA — One-command self-host deploy to Cloudflare.
#
# Provisions D1 + KV + Queues + 2 Workers. Idempotent.
# Uses Cloudflare REST API for resource creation (wrangler's output is
# TTY-only and unreliable when piped), wrangler only for deploy + secrets.
#
# Prerequisites:
#   CLOUDFLARE_API_TOKEN  (required)
#   CLOUDFLARE_ACCOUNT_ID (optional; auto-detected from first account)
#   SELF_HOST_ADMIN_API_KEY (optional; generated if missing)
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=cf_xxx
#   ./scripts/deploy-self-host.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set." >&2
  exit 1
fi

API="https://api.cloudflare.com/client/v4"
TOKEN="$CLOUDFLARE_API_TOKEN"

# wrangler under bun's runtime exits silently mid-deploy on node 24.
# Force node 22 from nvm if available; fall back to bunx.
if [[ -x "/usr/local/share/nvm/versions/node/v22.22.1/bin/node" ]]; then
  export PATH="/usr/local/share/nvm/versions/node/v22.22.1/bin:$PATH"
  WRANGLER="npx --yes wrangler@4"
elif command -v node >/dev/null 2>&1 && [[ "$(node --version)" =~ ^v(20|22)\. ]]; then
  WRANGLER="npx --yes wrangler@4"
else
  echo "WARNING: node 20/22 not found, falling back to bunx wrangler (may exit silently)" >&2
  WRANGLER="bunx wrangler"
fi

cf() {
  local method="$1" path="$2" body="${3:-}"
  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "$API$path" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      --data "$body"
  else
    curl -sS -X "$method" "$API$path" -H "Authorization: Bearer $TOKEN"
  fi
}

py() { python3 -c "import sys,json; d=json.load(sys.stdin); print($1)" 2>/dev/null || true; }

# ---------- 0. Account ----------
echo "==> Verifying Cloudflare credentials..."
if [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  CLOUDFLARE_ACCOUNT_ID="$(cf GET /accounts | py "d['result'][0]['id']")"
fi
ACCT="$CLOUDFLARE_ACCOUNT_ID"
ACCT_NAME="$(cf GET "/accounts/$ACCT" | py "d['result']['name']")"
export CLOUDFLARE_ACCOUNT_ID="$ACCT"
echo "    account: $ACCT_NAME ($ACCT)"

# ---------- 1. D1 ----------
echo "==> Ensuring D1 database 'openwa-control-plane' exists..."
D1_LIST="$(cf GET "/accounts/$ACCT/d1/database?name=openwa-control-plane")"
D1_ID="$(echo "$D1_LIST" | py "next((x['uuid'] for x in d['result'] if x['name']=='openwa-control-plane'), '')")"
if [[ -z "$D1_ID" ]]; then
  CREATE="$(cf POST "/accounts/$ACCT/d1/database" '{"name":"openwa-control-plane"}')"
  D1_ID="$(echo "$CREATE" | py "d['result']['uuid']")"
  [[ -z "$D1_ID" ]] && { echo "FAILED to create D1:"; echo "$CREATE"; exit 1; }
  echo "    created D1: $D1_ID"
else
  echo "    found D1: $D1_ID"
fi

# ---------- 2. KV ----------
echo "==> Ensuring KV namespace 'openwa-auth-cache' exists..."
KV_LIST="$(cf GET "/accounts/$ACCT/storage/kv/namespaces?per_page=100")"
KV_ID="$(echo "$KV_LIST" | py "next((x['id'] for x in d['result'] if x['title']=='openwa-auth-cache'), '')")"
if [[ -z "$KV_ID" ]]; then
  CREATE="$(cf POST "/accounts/$ACCT/storage/kv/namespaces" '{"title":"openwa-auth-cache"}')"
  KV_ID="$(echo "$CREATE" | py "d['result']['id']")"
  [[ -z "$KV_ID" ]] && { echo "FAILED to create KV:"; echo "$CREATE"; exit 1; }
  echo "    created KV: $KV_ID"
else
  echo "    found KV: $KV_ID"
fi

# ---------- 3. Queues ----------
HAS_QUEUES=true
echo "==> Ensuring queues exist..."
Q_LIST="$(cf GET "/accounts/$ACCT/queues" || true)"
Q_OK="$(echo "$Q_LIST" | py "d.get('success', False)")"
if [[ "$Q_OK" != "True" ]]; then
  echo "    queues unavailable (likely free plan) — skipping"
  HAS_QUEUES=false
else
  for q in openwa-webhooks openwa-webhooks-dlq; do
    EXISTS="$(echo "$Q_LIST" | py "any(x['queue_name']==('$q') for x in d.get('result',[]))")"
    if [[ "$EXISTS" == "True" ]]; then
      echo "    queue exists: $q"
    else
      R="$(cf POST "/accounts/$ACCT/queues" "{\"queue_name\":\"$q\"}")"
      OK="$(echo "$R" | py "d.get('success', False)")"
      if [[ "$OK" == "True" ]]; then
        echo "    created queue: $q"
      else
        echo "    cannot create queue: $q ($(echo "$R" | py "d.get('errors')"))"
        HAS_QUEUES=false
      fi
    fi
  done
fi

# ---------- 4. Apply schema ----------
echo "==> Applying D1 migrations..."
cd "$REPO_ROOT/packages/db"
if ! ls src/migrations/control-plane/*.sql >/dev/null 2>&1; then
  bunx drizzle-kit generate --config=./drizzle.control-plane.config.ts >/dev/null
fi
MIG="$(ls -t src/migrations/control-plane/*.sql | head -1)"
echo "    applying $MIG"

# The /query endpoint accepts a single SQL string. Drizzle migrations
# are separated by --> statement-breakpoint; split + send one at a time.
RESP="$(python3 - "$MIG" "$API" "$ACCT" "$D1_ID" "$TOKEN" <<'PY'
import json,sys,urllib.request,urllib.error,re
mig_path, api, acct, db_id, token = sys.argv[1:6]
sql = open(mig_path).read()
# Split on Drizzle's statement breakpoint marker
stmts = [s.strip() for s in re.split(r'-->\s*statement-breakpoint', sql) if s.strip()]
ok = 0; skipped = 0; errors = []
for i, stmt in enumerate(stmts):
    req = urllib.request.Request(
      f"{api}/accounts/{acct}/d1/database/{db_id}/query",
      data=json.dumps({"sql": stmt}).encode(),
      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
      method="POST")
    try:
      r = json.loads(urllib.request.urlopen(req).read().decode())
      if r.get("success"): ok += 1
      else:
        msg = json.dumps(r.get("errors", []))
        if "already exists" in msg: skipped += 1
        else: errors.append((i, msg))
    except urllib.error.HTTPError as e:
      body = e.read().decode()
      if "already exists" in body: skipped += 1
      else: errors.append((i, body[:200]))
print(json.dumps({"ok": ok, "skipped": skipped, "errors": errors, "total": len(stmts)}))
PY
)"
echo "    $(echo "$RESP" | py "f\"ok={d['ok']} skipped={d['skipped']} errors={len(d['errors'])} total={d['total']}\"")"
ERR_COUNT="$(echo "$RESP" | py "len(d['errors'])")"
if [[ "$ERR_COUNT" != "0" ]]; then
  echo "    errors:"
  echo "$RESP" | py "d['errors']"
  exit 1
fi

# ---------- 5. Patch wrangler.toml ----------
echo "==> Patching apps/api/wrangler.toml with resource IDs..."
TOML="$REPO_ROOT/apps/api/wrangler.toml"
python3 - "$TOML" "$D1_ID" "$KV_ID" "$HAS_QUEUES" <<'PYEOF'
import sys, re, pathlib
toml_path, d1_id, kv_id, has_queues_str = sys.argv[1:5]
has_queues = has_queues_str == 'true'
p = pathlib.Path(toml_path)
text = p.read_text()
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
marker_re = re.compile(r"# -+\s*self-host.*", re.IGNORECASE)
m = marker_re.search(text)
if m:
    new = text[: m.start()].rstrip() + "\n\n# ---------------- self-host (single-tenant) ----------------\n" + block
else:
    new = text.rstrip() + "\n\n# ---------------- self-host (single-tenant) ----------------\n" + block
p.write_text(new)
print(f"    wrote {toml_path}")
PYEOF

# ---------- 6. Secrets ----------
echo "==> Setting secrets..."
cd "$REPO_ROOT/apps/api"
AUTH_TOKEN_SECRET="$(openssl rand -hex 32)"
set +o pipefail
printf '%s\n' "$AUTH_TOKEN_SECRET" | $WRANGLER secret put AUTH_TOKEN_SECRET --env self-host > /tmp/secret-out.log 2>&1 || true
tail -3 /tmp/secret-out.log
set -o pipefail
echo "    AUTH_TOKEN_SECRET set"

if [[ -z "${SELF_HOST_ADMIN_API_KEY:-}" ]]; then
  set +o pipefail
  P="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 8)"
  S="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom 2>/dev/null | head -c 32)"
  set -o pipefail
  SELF_HOST_ADMIN_API_KEY="openwa_${P}_${S}"
  echo ""
  echo "    >>> Generated admin API key (SAVE THIS, only shown once):"
  echo "    >>> $SELF_HOST_ADMIN_API_KEY"
  echo ""
fi
set +o pipefail
printf '%s\n' "$SELF_HOST_ADMIN_API_KEY" | $WRANGLER secret put SELF_HOST_ADMIN_API_KEY --env self-host > /tmp/secret-out.log 2>&1 || true
tail -3 /tmp/secret-out.log
set -o pipefail
echo "    SELF_HOST_ADMIN_API_KEY set"

# ---------- 7. Deploy engine ----------
echo "==> Deploying openwa-engine..."
cd "$REPO_ROOT/apps/engine"
set +o pipefail
$WRANGLER deploy --env self-host > /tmp/engine-deploy.log 2>&1 || { tail -30 /tmp/engine-deploy.log; exit 1; }
tail -20 /tmp/engine-deploy.log
set -o pipefail

# ---------- 8. Deploy api ----------
echo "==> Deploying openwa-api..."
cd "$REPO_ROOT/apps/api"
set +o pipefail
$WRANGLER deploy --env self-host > /tmp/api-deploy.log 2>&1 || { tail -30 /tmp/api-deploy.log; exit 1; }
tail -20 /tmp/api-deploy.log
set -o pipefail

# ---------- 8b. Deploy dashboard to Pages ----------
echo "==> Ensuring Cloudflare Pages project 'openwa-dashboard' exists..."
PAGES_LIST="$(cf GET "/accounts/$ACCT/pages/projects?per_page=100")"
PAGES_EXISTS="$(echo "$PAGES_LIST" | py "any(x['name']=='openwa-dashboard' for x in d.get('result',[]))")"
if [[ "$PAGES_EXISTS" != "True" ]]; then
  CREATE="$(cf POST "/accounts/$ACCT/pages/projects" \
    '{"name":"openwa-dashboard","production_branch":"main"}')"
  OK="$(echo "$CREATE" | py "d.get('success', False)")"
  if [[ "$OK" == "True" ]]; then
    echo "    created Pages project: openwa-dashboard"
  else
    echo "    WARN: Pages project create returned: $(echo "$CREATE" | py "d.get('errors')")"
  fi
else
  echo "    found Pages project: openwa-dashboard"
fi

# Detect subdomain early so we can wire it into the Pages var.
SUB="$(cf GET "/accounts/$ACCT/workers/subdomain" | py "d['result']['subdomain']")"
API_URL="https://openwa-api.${SUB:-workers}.workers.dev"

echo "==> Setting Pages var API_BASE_URL=$API_URL ..."
PROD_VARS_BODY="$(python3 -c "import json; print(json.dumps({'deployment_configs':{'production':{'env_vars':{'API_BASE_URL':{'value':'$API_URL','type':'plain_text'}}},'preview':{'env_vars':{'API_BASE_URL':{'value':'$API_URL','type':'plain_text'}}}}}))")"
cf PATCH "/accounts/$ACCT/pages/projects/openwa-dashboard" "$PROD_VARS_BODY" > /tmp/pages-vars.log 2>&1 || true

echo "==> Building dashboard..."
cd "$REPO_ROOT/apps/dashboard"
if [[ ! -d node_modules ]]; then
  (cd "$REPO_ROOT" && bun install) > /tmp/dash-install.log 2>&1 || { tail -20 /tmp/dash-install.log; exit 1; }
fi
VITE_API_BASE_URL="/api" bun run build > /tmp/dash-build.log 2>&1 || { tail -30 /tmp/dash-build.log; exit 1; }
tail -10 /tmp/dash-build.log

echo "==> Deploying dashboard to Cloudflare Pages..."
set +o pipefail
$WRANGLER pages deploy dist --project-name=openwa-dashboard --branch=main --commit-dirty=true > /tmp/pages-deploy.log 2>&1 || { tail -30 /tmp/pages-deploy.log; exit 1; }
tail -10 /tmp/pages-deploy.log
DASHBOARD_URL="$(grep -oE 'https://[a-z0-9-]+\.openwa-dashboard\.pages\.dev' /tmp/pages-deploy.log | head -1)"
DASHBOARD_URL="${DASHBOARD_URL:-https://openwa-dashboard.pages.dev}"
set -o pipefail
echo "    dashboard: $DASHBOARD_URL"

# ---------- 9. Done ----------
URL="$API_URL"
cat <<EOF

================================================================
  Self-host deploy complete.
================================================================
  Account:        $ACCT_NAME
  API base URL:   $URL
  Dashboard URL:  $DASHBOARD_URL
  Health check:   curl $URL/health
  Docs portal:    $URL/docs

  Admin API key:  $SELF_HOST_ADMIN_API_KEY

  Smoke test:
    curl -H 'X-API-Key: $SELF_HOST_ADMIN_API_KEY' $URL/v1/sessions
================================================================
EOF
