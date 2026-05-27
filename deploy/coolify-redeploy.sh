#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WS Broker — Coolify Yeniden Deploy
# Mevcut uygulamayı en son commit ile rebuild + deploy eder.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.deploy"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; }

COOLIFY_URL="${COOLIFY_URL%/}"
APP_UUID="${COOLIFY_APP_UUID:-${COOLIFY_SERVICE_UUID:-}}"

[[ -z "$COOLIFY_URL" ]]   && { echo "COOLIFY_URL tanımlı değil"; exit 1; }
[[ -z "$COOLIFY_TOKEN" ]] && { echo "COOLIFY_TOKEN tanımlı değil"; exit 1; }
[[ -z "$APP_UUID" ]]      && { echo "COOLIFY_APP_UUID tanımlı değil — önce coolify-deploy.sh çalıştırın"; exit 1; }

echo "[REDEPLOY] Uygulama deploy ediliyor: $APP_UUID"

RESPONSE=$(curl -sf -X GET \
  "${COOLIFY_URL}/api/v1/applications/${APP_UUID}/start" \
  -H "Authorization: Bearer $COOLIFY_TOKEN")

echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"
echo "[OK] Deploy tetiklendi. Coolify panelinden ilerlemeyi takip edin."
