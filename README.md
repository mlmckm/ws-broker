# WS Broker

MQTT mantığında çalışan, tam özellikli WebSocket broker uygulaması. Node.js backend + React dashboard, tek Docker container olarak deploy edilir.

---

## Hızlı Başlangıç

```bash
# Repository klonla
git clone https://github.com/kullanici/ws-broker.git
cd ws-broker

# .env ayarlarını düzenle
cp docker-compose.yml docker-compose.yml  # JWT_SECRET ve API_KEY değerlerini değiştir

# Başlat
docker compose up -d

# Dashboard: http://localhost:8883
# Kullanıcı: admin / admin123
```

---

## Environment Variables

| Değişken | Açıklama | Varsayılan |
|---|---|---|
| `PORT` | Sunucu portu | `8883` |
| `JWT_SECRET` | JWT imzalama anahtarı (**zorunlu, değiştirin**) | — |
| `API_KEY` | Dış sistem HTTP API anahtarı (**zorunlu**) | — |
| `ADMIN_PASSWORD` | İlk admin kullanıcı şifresi | `admin123` |
| `DATABASE_URL` | PostgreSQL bağlantı URL'i | — |

---

## Coolify'da Deploy

### 1. Coolify Panelinde Yeni Proje

1. **Services** → **New Service** → **Docker Compose**
2. Repository URL'ini girin veya manuel yapıştırın
3. `docker-compose.yml` seçin

### 2. Environment Variables

Coolify panelinde şu değişkenleri **mutlaka** güncelleyin:

```
JWT_SECRET=<en-az-64-karakter-rastgele-string>
API_KEY=<guvenli-api-anahtari>
ADMIN_PASSWORD=<guclu-sifre>
```

### 3. Domain & SSL

Coolify + Traefik SSL'i otomatik halleder.
- Domain ekleyin (ör. `broker.sirketim.com`)
- HTTPS otomatik etkinleşir
- Uygulama `ws://` ve `http://` ile çalışır; Traefik `wss://` ve `https://`'e çevirir

> **Not:** Uygulama SSL sonlandırmaz. Container içinde tüm trafik plain `ws://` ve `http://`'dir. SSL Coolify/Traefik tarafında sonlandırılır.

### 4. PostgreSQL

`docker-compose.yml` içindeki PostgreSQL kullanılır. Harici bir PostgreSQL için `DATABASE_URL`'yi değiştirin:

```yaml
DATABASE_URL=postgresql://kullanici:sifre@harici-host:5432/dbadi
```

---

## Geliştirici Modu

### Backend

```bash
cd backend
npm install
# .env dosyası oluştur
cat > .env << EOF
PORT=8883
JWT_SECRET=dev-secret-key
API_KEY=dev-api-key
ADMIN_PASSWORD=admin123
DATABASE_URL=postgresql://broker:broker_pass@localhost:5432/brokerdb
EOF
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:5173 — /api ve /ws proxy ile 8883'e iletilir
```

---

## WebSocket Protokol Referansı

**Endpoint:** `ws://sunucu:8883/ws`

Tüm mesajlar JSON formatındadır.

### Bağlantı Akışı

```
Client bağlanır
  ← { "type": "hello", "client_id": "uuid" }
  → { "type": "auth", "username": "...", "password": "..." }
  ← { "type": "auth_ok", "token": "jwt", "username": "...", "role": "client" }
```

### Mesaj Tipleri

| Tip | Yön | Açıklama |
|---|---|---|
| `hello` | ← Server | Bağlantı kurulunca, client_id atanır |
| `auth` | → Client | Kimlik doğrulama |
| `auth_ok` | ← Server | Başarılı auth + JWT token |
| `auth_error` | ← Server | Başarısız auth (bağlantı kapanır) |
| `subscribe` | → Client | Topic aboneliği |
| `subscribed` | ← Server | Abonelik onayı |
| `unsubscribe` | → Client | Abonelikten çık |
| `publish` | → Client | Mesaj yayınla |
| `message` | ← Server | Gelen mesaj |
| `ping` | ← Server | Her 30s canlılık kontrolü |
| `pong` | → Client | Ping cevabı (10s içinde) |
| `error` | ← Server | Hata mesajı |
| `server_shutdown` | ← Server | Sunucu kapanıyor |

### Publish Örneği

```json
{
  "type": "publish",
  "topic": "ev/salon/sicaklik",
  "payload": "23.5",
  "retain": false
}
```

### Wildcard

- `ev/+/sicaklik` — Tek segment wildcard
- `ev/#` — Çok seviyeli wildcard
- `$SYS/#` — Sistem event'leri

---

## HTTP API Referansı

**Base URL:** `http://sunucu:8883/api`

**Auth Header:** `Authorization: Bearer <token>`

### Önemli Endpoint'ler

```
POST   /api/auth/login          # Dashboard girişi
GET    /api/clients             # Aktif bağlantılar
GET    /api/topics              # Aktif topicler
GET    /api/messages            # Mesaj geçmişi
POST   /api/messages/publish    # Mesaj yayınla
GET    /api/users               # Kullanıcı listesi
POST   /api/users               # Yeni kullanıcı (admin)
GET    /api/acl                 # ACL kuralları
POST   /api/acl                 # Yeni kural (admin)
GET    /api/webhooks            # Webhook listesi
POST   /api/webhooks            # Yeni webhook (admin)
GET    /api/audit               # Audit log
GET    /api/stats               # İstatistikler
GET    /api/settings            # Ayarlar
PATCH  /api/settings            # Ayar güncelle (admin)
```

---

## Roller

| Rol | Açıklama |
|---|---|
| `admin` | Tüm işlemler |
| `viewer` | Okuma, değişiklik yapamaz |
| `client` | Sadece WebSocket bağlantısı, dashboard'a giremez |

---

## Örnek Kodlar

Tüm entegrasyon örnekleri (JavaScript, ESP32, Flutter, Python, cURL) dashboard'daki **Docs** sayfasında bulunur.

---

## Mimari

```
Coolify/Traefik (SSL termination)
    ↓ wss:// → ws://
Docker Container :8883
    ├── Express HTTP (/api/*)
    ├── WebSocket Server (/ws)
    └── Static Files (React build)
    ↓
PostgreSQL :5432
```

## Özellikler

- MQTT benzeri topic + wildcard abonelik
- JWT tabanlı kimlik doğrulama
- Topic bazlı ACL (Access Control List)
- Retain mesaj desteği
- Webhook tetikleme (HMAC imzalama + retry)
- Gerçek zamanlı dashboard (WebSocket ile canlı güncelleme)
- Audit log
- IP blacklist/whitelist (CIDR destekli)
- Rate limiting
- Graceful shutdown
- Multi-stage Docker build
- Dark/Light mode
