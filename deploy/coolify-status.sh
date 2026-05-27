#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WS Broker — Coolify servis durumunu göster
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.deploy"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }

: "${COOLIFY_URL:?}"
: "${COOLIFY_TOKEN:?}"
: "${COOLIFY_SERVICE_UUID:?}"

COOLIFY_URL="${COOLIFY_URL%/}"

echo "Servis durumu: $COOLIFY_SERVICE_UUID"
curl -sf -X GET \
  "${COOLIFY_URL}/api/v1/services/${COOLIFY_SERVICE_UUID}" \
  -H "Authorization: Bearer $COOLIFY_TOKEN" | \
  jq '{
    uuid: .uuid,
    name: .name,
    status: .status,
    created_at: .created_at,
    updated_at: .updated_at,
    applications: [.applications[]? | {name: .name, status: .status}],
    databases: [.databases[]? | {name: .name, status: .status}]
  }'
