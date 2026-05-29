#!/usr/bin/env bash
# Tears down the self-host deployment. DESTRUCTIVE — drops D1 data, KV
# entries, queues, and the deployed workers.
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=cf_xxx...
#   ./scripts/teardown-self-host.sh --confirm

set -euo pipefail

if [[ "${1:-}" != "--confirm" ]]; then
  echo "This will DELETE all openwa-* resources on the linked Cloudflare account."
  echo "Re-run with --confirm to proceed:"
  echo "    ./scripts/teardown-self-host.sh --confirm"
  exit 1
fi

WRANGLER="bunx wrangler"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT/apps/api"
$WRANGLER delete --env self-host openwa-api 2>&1 | tail -3 || true

cd "$REPO_ROOT/apps/engine"
$WRANGLER delete --env self-host openwa-engine 2>&1 | tail -3 || true

# Queues
$WRANGLER queues delete openwa-webhooks 2>&1 | tail -3 || true
$WRANGLER queues delete openwa-webhooks-dlq 2>&1 | tail -3 || true

# KV — list and delete by id
KV_IDS="$($WRANGLER kv namespace list 2>&1 | python3 -c "
import json, sys
try:
    data = json.loads(sys.stdin.read())
    for ns in data:
        if 'AUTH_CACHE' in ns.get('title','') or 'openwa-auth-cache' == ns.get('title',''):
            print(ns['id'])
except Exception: pass
" || true)"
for id in $KV_IDS; do
  $WRANGLER kv namespace delete --namespace-id="$id" 2>&1 | tail -3 || true
done

# D1
$WRANGLER d1 delete openwa-control-plane --skip-confirmation 2>&1 | tail -3 || true

echo "Teardown complete."
