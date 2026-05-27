#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WS Broker — Coolify REST API Deploy Scripti
#
# Ne yapar:
#   1. PostgreSQL veritabanı oluşturur (Coolify managed)
#   2. Uygulamayı GitHub repo'dan Dockerfile ile oluşturur
#   3. Env değişkenlerini set eder
#   4. Build + deploy tetikler
#
# Gerekli .env.deploy değişkenleri:
#   COOLIFY_URL      Coolify instance URL (ör. https://coolify.sirketim.com)
#   COOLIFY_TOKEN    API token (Keys & Tokens > API Tokens)
#   GITHUB_REPO      GitHub repo URL (ör. https://github.com/user/ws-broker)
#   GITHUB_BRANCH    Deploy edilecek branch (varsayılan: main)
#   JWT_SECRET       Broker JWT secret (min 32 karakter)
#   API_KEY          Broker API key
#   ADMIN_PASSWORD   İlk admin şifresi
#
# Opsiyonel:
#   COOLIFY_SERVER   Server UUID (yoksa otomatik algılanır)
#   COOLIFY_PROJECT  Project UUID (yoksa yeni oluşturulur)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${BLUE}[DEPLOY]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }
err()  { echo -e "${RED}[ERROR ]${NC} $*" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.deploy"
[[ -f "$ENV_FILE" ]] && { set -a; source "$ENV_FILE"; set +a; } || err ".env.deploy bulunamadı. Önce: cp .env.deploy.example .env.deploy"

# Zorunlu değişken kontrolleri
: "${COOLIFY_URL:?COOLIFY_URL .env.deploy dosyasında tanımlı değil}"
: "${COOLIFY_TOKEN:?COOLIFY_TOKEN .env.deploy dosyasında tanımlı değil}"
: "${GITHUB_REPO:?GITHUB_REPO .env.deploy dosyasında tanımlı değil (ör. https://github.com/user/ws-broker)}"
: "${JWT_SECRET:?JWT_SECRET .env.deploy dosyasında tanımlı değil}"
: "${API_KEY:?API_KEY .env.deploy dosyasında tanımlı değil}"

GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
COOLIFY_URL="${COOLIFY_URL%/}"

for cmd in curl jq; do
  command -v "$cmd" &>/dev/null || err "Gerekli araç eksik: $cmd (brew install $cmd)"
done

# ── API yardımcı fonksiyon ────────────────────────────────────────────────────
api() {
  local method="$1" path="$2" data="${3:-}"
  local args=(-sf -X "$method" "${COOLIFY_URL}/api/v1${path}"
              -H "Authorization: Bearer $COOLIFY_TOKEN"
              -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(-d "$data")
  curl "${args[@]}" || { echo -e "${RED}[HTTP ERROR]${NC} $method /api/v1$path"; exit 1; }
}

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     WS Broker — Coolify Deploy        ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# ── 1. Bağlantı testi ────────────────────────────────────────────────────────
log "Coolify bağlantısı test ediliyor: $COOLIFY_URL"
VERSION=$(api GET /version | jq -r '.version // "bilinmiyor"')
ok "Coolify v$VERSION"

# ── 2. Server UUID ────────────────────────────────────────────────────────────
if [[ -z "${COOLIFY_SERVER:-}" ]]; then
  log "Sunucu listesi alınıyor..."
  SERVERS=$(api GET /servers)
  SERVER_COUNT=$(echo "$SERVERS" | jq 'length')
  [[ "$SERVER_COUNT" -eq 0 ]] && err "Coolify'da kayıtlı sunucu bulunamadı"
  echo "$SERVERS" | jq -r '.[] | "  [\(.uuid)] \(.name) (\(.ip))"'
  COOLIFY_SERVER=$(echo "$SERVERS" | jq -r '.[0].uuid')
  warn "İlk sunucu otomatik seçildi: $COOLIFY_SERVER"
  warn "Farklı sunucu için .env.deploy'a COOLIFY_SERVER=UUID ekleyin"
fi
log "Server: $COOLIFY_SERVER"

# ── 3. Project ────────────────────────────────────────────────────────────────
if [[ -z "${COOLIFY_PROJECT:-}" ]]; then
  log "Proje oluşturuluyor: ws-broker"
  PROJ=$(api POST /projects '{"name":"ws-broker","description":"WS Broker"}')
  COOLIFY_PROJECT=$(echo "$PROJ" | jq -r '.uuid')
  ok "Proje oluşturuldu: $COOLIFY_PROJECT"
else
  log "Mevcut proje: $COOLIFY_PROJECT"
fi

# ── 4. PostgreSQL veritabanı ──────────────────────────────────────────────────
if [[ -z "${COOLIFY_DB_UUID:-}" ]]; then
  log "PostgreSQL veritabanı oluşturuluyor..."
  DB_PAYLOAD=$(jq -n \
    --arg server "$COOLIFY_SERVER" \
    --arg project "$COOLIFY_PROJECT" \
    '{
      type: "standalone-postgresql",
      server_uuid: $server,
      project_uuid: $project,
      environment_name: "production",
      name: "ws-broker-db",
      postgres_user: "broker",
      postgres_password: "broker_pass_change_me",
      postgres_db: "brokerdb",
      instant_deploy: true
    }')
  DB_RESP=$(api POST /databases "$DB_PAYLOAD")
  COOLIFY_DB_UUID=$(echo "$DB_RESP" | jq -r '.uuid')
  DB_INTERNAL_URL=$(echo "$DB_RESP" | jq -r '.internal_db_url // empty')
  ok "PostgreSQL oluşturuldu: $COOLIFY_DB_UUID"
  [[ -n "$DB_INTERNAL_URL" ]] && ok "Bağlantı URL: $DB_INTERNAL_URL"
  # Internal hostname genellikle: postgresql://broker:pass@ws-broker-db:5432/brokerdb
  DB_URL="${DB_INTERNAL_URL:-postgresql://broker:broker_pass_change_me@ws-broker-db:5432/brokerdb}"
else
  log "Mevcut DB kullanılıyor: $COOLIFY_DB_UUID"
  DB_URL="${DATABASE_URL:-postgresql://broker:broker_pass_change_me@ws-broker-db:5432/brokerdb}"
fi

# ── 5. Uygulama oluştur ───────────────────────────────────────────────────────
log "Uygulama oluşturuluyor (GitHub → Dockerfile)..."
APP_PAYLOAD=$(jq -n \
  --arg server "$COOLIFY_SERVER" \
  --arg project "$COOLIFY_PROJECT" \
  --arg repo "$GITHUB_REPO" \
  --arg branch "$GITHUB_BRANCH" \
  '{
    server_uuid: $server,
    project_uuid: $project,
    environment_name: "production",
    name: "ws-broker",
    description: "MQTT benzeri WebSocket Broker",
    git_repository: $repo,
    git_branch: $branch,
    build_pack: "dockerfile",
    dockerfile_location: "/Dockerfile",
    ports_exposes: "8883",
    instant_deploy: false
  }')

APP_RESP=$(api POST /applications "$APP_PAYLOAD")
APP_UUID=$(echo "$APP_RESP" | jq -r '.uuid')
[[ "$APP_UUID" == "null" || -z "$APP_UUID" ]] && {
  echo "$APP_RESP" | jq .
  err "Uygulama oluşturulamadı. Yukarıdaki hatayı kontrol edin."
}
ok "Uygulama oluşturuldu: $APP_UUID"

# ── 6. Env değişkenleri ───────────────────────────────────────────────────────
log "Environment variables ayarlanıyor..."
ENV_VARS=$(jq -n \
  --arg jwt "$JWT_SECRET" \
  --arg apikey "$API_KEY" \
  --arg adminpw "$ADMIN_PASSWORD" \
  --arg dburl "$DB_URL" \
  '[
    {key: "JWT_SECRET",       value: $jwt,     is_multiline: false},
    {key: "API_KEY",          value: $apikey,   is_multiline: false},
    {key: "ADMIN_PASSWORD",   value: $adminpw,  is_multiline: false},
    {key: "DATABASE_URL",     value: $dburl,    is_multiline: false},
    {key: "PORT",             value: "8883",    is_multiline: false},
    {key: "NODE_ENV",         value: "production", is_multiline: false}
  ]')

api POST /applications/${APP_UUID}/envs/bulk "{\"data\": $ENV_VARS}" > /dev/null 2>&1 && \
  ok "Env değişkenleri set edildi" || \
  warn "Bulk env API desteklenmiyor — env'leri tek tek set ediyorum..."

# Bulk başarısız olursa tek tek dene
if ! api POST /applications/${APP_UUID}/envs/bulk "{\"data\": $ENV_VARS}" > /dev/null 2>&1; then
  for item in "JWT_SECRET:$JWT_SECRET" "API_KEY:$API_KEY" "ADMIN_PASSWORD:$ADMIN_PASSWORD" "DATABASE_URL:$DB_URL" "PORT:8883" "NODE_ENV:production"; do
    KEY="${item%%:*}"; VAL="${item#*:}"
    api POST /applications/${APP_UUID}/envs \
      "{\"key\":\"$KEY\",\"value\":\"$VAL\",\"is_multiline\":false}" > /dev/null 2>&1 || true
  done
fi

# ── 7. Deploy başlat ──────────────────────────────────────────────────────────
log "Build & Deploy başlatılıyor..."
api GET /applications/${APP_UUID}/start > /dev/null 2>&1 && \
  ok "Deploy tetiklendi!" || warn "Deploy başlatılamadı — Coolify panelinden manuel tetikleyin"

# ── 8. UUID'leri kaydet ───────────────────────────────────────────────────────
{
  echo ""
  echo "# --- Deploy $(date '+%Y-%m-%d %H:%M:%S') tarafından eklendi ---"
  echo "COOLIFY_SERVER=$COOLIFY_SERVER"
  echo "COOLIFY_PROJECT=$COOLIFY_PROJECT"
  echo "COOLIFY_APP_UUID=$APP_UUID"
  echo "COOLIFY_DB_UUID=${COOLIFY_DB_UUID:-}"
} >> "$ENV_FILE"

# ── Özet ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║           Deploy Başarıyla Tetiklendi!       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BLUE}Coolify Paneli:${NC}     $COOLIFY_URL"
echo -e "  ${BLUE}Uygulama UUID:${NC}      $APP_UUID"
echo -e "  ${BLUE}DB UUID:${NC}            ${COOLIFY_DB_UUID:-'mevcut kullanıldı'}"
echo ""
echo -e "  ${YELLOW}Build süreci Coolify'da devam ediyor...${NC}"
echo -e "  ${YELLOW}İzlemek için:${NC} $COOLIFY_URL (Applications → ws-broker → Deployments)"
echo ""
echo -e "  ${BLUE}Sonraki deploy'lar için:${NC}"
echo -e "  COOLIFY_APP_UUID=$APP_UUID ./deploy/coolify-redeploy.sh"
echo ""
echo -e "  ${YELLOW}İlk giriş:${NC} admin / $ADMIN_PASSWORD"
echo ""
