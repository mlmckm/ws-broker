# WS Broker — Tam API & Entegrasyon Kılavuzu

> **URL:** `https://broker.myensim.com`  
> **WebSocket:** `wss://broker.myensim.com/ws`  
> **HTTP API:** `https://broker.myensim.com/api`

---

## İçindekiler

1. [Kimlik Doğrulama](#kimlik-doğrulama)
2. [WebSocket Protokolü](#websocket-protokolü)
3. [HTTP API Referansı](#http-api-referansı)
4. [ACL — Erişim Kontrolü](#acl--erişim-kontrolü)
5. [Webhook Sistemi](#webhook-sistemi)
6. [Rol Sistemi](#rol-sistemi)
7. [Güvenlik](#güvenlik)
8. [Hata Kodları](#hata-kodları)

---

## Kimlik Doğrulama

### Dashboard Girişi

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "şifre"
}
```

**Yanıt:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "admin",
  "role": "admin"
}
```

Token tüm HTTP API isteklerinde `Authorization: Bearer <token>` header'ı ile gönderilir. Token süresi 24 saattir.

### API Key (Dış Sistemler)

Dış sistemler için token yerine API key kullanılabilir:
```http
Authorization: Bearer <API_KEY>
```

---

## WebSocket Protokolü

### Bağlantı

**Yöntem 1 — Standart (auth mesajı)**
```
wss://broker.myensim.com/ws
```

**Yöntem 2 — Query Parameter (Postman, Arduino, hızlı test)**
```
wss://broker.myensim.com/ws?username=KULLANICI&password=SIFRE
wss://broker.myensim.com/ws?username=KULLANICI&password=SIFRE&keepalive=60
```

> `keepalive=0` → ping/pong devre dışı  
> `keepalive=60` → 60 saniyede bir ping

### Mesaj Tipleri

| Tip | Yön | Açıklama |
|-----|-----|----------|
| `hello` | ← Server | İlk bağlantıda gönderilir, `client_id` atanır |
| `auth` | → Client | Kimlik doğrulama |
| `auth_ok` | ← Server | Başarılı auth, JWT token döner |
| `auth_error` | ← Server | Başarısız auth, bağlantı kapanır |
| `subscribe` | → Client | Topic aboneliği (wildcard destekli) |
| `subscribed` | ← Server | Abonelik onayı |
| `unsubscribe` | → Client | Aboneliği iptal et |
| `unsubscribed` | ← Server | İptal onayı |
| `publish` | → Client | Mesaj yayınla |
| `message` | ← Server | Gelen mesaj |
| `ping` | ← Server | Canlılık kontrolü (her N saniyede) |
| `pong` | → Client | Ping'e yanıt |
| `error` | ← Server | Hata mesajı |
| `server_shutdown` | ← Server | Sunucu kapanıyor |

### Tam Bağlantı Akışı

```
Client                              Server
  |                                    |
  |──── WebSocket bağlantısı ─────→   |
  |←── { "type": "hello",             |
  |       "client_id": "uuid" } ───── |
  |                                    |
  |──→ { "type": "auth",              |
  |       "username": "esp32",        |
  |       "password": "sifre",        |
  |       "keepalive": 60 } ─────→   |
  |                                    |
  |←── { "type": "auth_ok",           |
  |       "token": "jwt...",          |
  |       "username": "esp32",        |
  |       "role": "client" } ──────── |
  |                                    |
  |──→ { "type": "subscribe",         |
  |       "topic": "ev/salon/+" } ──→ |
  |←── { "type": "subscribed",        |
  |       "topic": "ev/salon/+" } ─── |
  |                                    |
  |──→ { "type": "publish",           |
  |       "topic": "ev/salon/nem",    |
  |       "payload": "65.2",          |
  |       "retain": false } ─────→   |
  |←── { "type": "message", ... } ─── | (abonelere iletilir)
  |                                    |
  |   (her 60 saniye)                  |
  |←── { "type": "ping" } ─────────── |
  |──→ { "type": "pong" } ─────────── |
```

### Auth Mesajı

```json
{
  "type": "auth",
  "username": "kullanici-adi",
  "password": "sifre",
  "keepalive": 60
}
```

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `username` | string | ✅ | Kullanıcı adı |
| `password` | string | ✅ | Şifre |
| `keepalive` | number | ❌ | Ping aralığı (saniye). `0` = ping yok. Varsayılan: global ayar |

### Subscribe

```json
{
  "type": "subscribe",
  "topic": "ev/salon/+"
}
```

**Wildcard Kuralları:**

| Pattern | Örnek | Eşleşir |
|---------|-------|---------|
| `+` | `ev/+/sicaklik` | `ev/salon/sicaklik`, `ev/mutfak/sicaklik` |
| `#` | `ev/#` | `ev/salon`, `ev/salon/sicaklik`, `ev/salon/nem` |
| `$SYS/#` | `$SYS/clients/connected` | Sistem eventleri |

> ⚠️ `#` sadece son segment olabilir: `ev/#` geçerli, `ev/#/sicaklik` geçersiz.

### Publish

```json
{
  "type": "publish",
  "topic": "ev/salon/sicaklik",
  "payload": "23.5",
  "retain": false
}
```

`payload` string veya JSON olabilir. JSON gönderilirse otomatik algılanır.

**Retain:** `true` gönderilirse bu mesaj saklanır ve topic'e yeni abone olan client'lara hemen iletilir.

### $SYS Topicler (Sistem Eventleri)

Dashboard ve monitoring için:

```
$SYS/clients/connected    → { client_id, username, ip, connected_at }
$SYS/clients/disconnected → { client_id, username, connected_at, disconnected_at }
$SYS/messages/new         → { topic, payload, sender, size }
$SYS/stats                → { active_clients, messages_today, active_topics, uptime_seconds, ... }
$SYS/webhook/triggered    → { webhook_id, topic, success }
```

---

## HTTP API Referansı

**Base URL:** `https://broker.myensim.com/api`

### Auth

#### POST `/auth/login`
Dashboard girişi, JWT token döner.

```json
// Request
{ "username": "admin", "password": "sifre" }

// Response 200
{ "token": "jwt...", "username": "admin", "role": "admin" }
```

#### POST `/auth/logout`
Mevcut tokenı geçersiz kılar. Audit log'a yazılır.

---

### Clients

#### GET `/clients`
Bağlı aktif clientları listeler. `admin` veya `viewer` rolü gerekir.

```json
{
  "clients": [{
    "client_id": "uuid",
    "username": "esp32-salon",
    "role": "client",
    "connected_at": "2026-05-27T...",
    "ip_address": "192.168.1.50",
    "user_agent": "ArduinoWebsockets/1.0",
    "subscriptions": ["ev/salon/+"],
    "message_count": 42,
    "bytes_sent": 1024,
    "bytes_received": 512
  }],
  "total": 1
}
```

#### DELETE `/clients/:client_id`
Client'ı zorla bağlantıdan kopar. `admin` rolü gerekir.

#### DELETE `/clients`
Tüm client'ları bağlantıdan kopar. `admin` rolü gerekir.

#### GET `/clients/history?limit=50&offset=0`
Geçmiş bağlantı logları.

---

### Topics

#### GET `/topics`
Aktif topicler ve istatistikleri.

```json
{
  "topics": [{
    "topic": "ev/salon/sicaklik",
    "subscribers": 2,
    "retained": true,
    "last_message_at": "2026-05-27T...",
    "message_count": 150,
    "messages_per_minute": 4.2
  }]
}
```

#### GET `/topics/:topic/metrics?period=1h`
Topic'in zaman serisi metriği. `period`: `1h`, `6h`, `24h`, `7d`.

#### DELETE `/topics/:topic/retain`
Retain mesajını siler.

---

### Messages

#### POST `/messages/publish`
HTTP üzerinden mesaj yayınla.

```json
// Request
{
  "topic": "ev/salon/sicaklik",
  "payload": "25.3",
  "retain": false
}

// Response 200
{ "success": true, "delivered_to": 3 }
```

#### GET `/messages?topic=&limit=50&offset=0&from=ISO&to=ISO&sender=&payload_type=`
Mesaj geçmişi. `limit` max 500. Tüm parametreler opsiyonel.

```json
{
  "messages": [{
    "id": 1,
    "topic": "ev/salon/sicaklik",
    "payload": "23.5",
    "payload_type": "string",
    "payload_size": 4,
    "sender_username": "esp32-salon",
    "sender_client_id": "uuid",
    "created_at": "2026-05-27T..."
  }],
  "total": 150
}
```

#### DELETE `/messages?topic=`
Mesaj geçmişini temizler. `topic` parametresiyle sadece o topic, parametresiz tümünü siler.

---

### Users

#### GET `/users`
Kullanıcı listesi. `admin` veya `viewer` rolü gerekir.

#### POST `/users`
Yeni kullanıcı oluştur. `admin` rolü gerekir.

```json
{ "username": "esp32-cihaz", "password": "guclu-sifre", "role": "client" }
```

`role`: `admin`, `viewer`, `client`

#### PATCH `/users/:id`
Şifre veya rol güncelle.

```json
{ "password": "yeni-sifre" }
{ "role": "viewer" }
```

#### DELETE `/users/:id`
Kullanıcı ve aktif bağlantılarını siler.

---

### ACL

#### GET `/acl`
Tüm erişim kontrol kuralları.

#### POST `/acl`
Yeni kural ekle.

```json
{
  "username": "esp32-salon",
  "topic_pattern": "ev/salon/#",
  "action": "both",
  "permission": "allow",
  "priority": 10
}
```

| Alan | Değer |
|------|-------|
| `username` | Kullanıcı adı. Boş bırakılırsa tüm kullanıcılara uygulanır |
| `topic_pattern` | Wildcard destekli pattern |
| `action` | `publish`, `subscribe`, `both` |
| `permission` | `allow`, `deny` |
| `priority` | Yüksek sayı = önce uygulanır |

#### PUT `/acl/:id` — Güncelle

#### DELETE `/acl/:id` — Sil

#### POST `/acl/test`
ACL test aracı.

```json
// Request
{ "username": "esp32-salon", "topic": "ev/salon/sicaklik", "action": "publish" }

// Response
{
  "allowed": true,
  "reason": "Kural ID 3: priority=10, permission=allow"
}
```

**Değerlendirme Mantığı:**
1. Priority sırasına göre eşleşen kurallar aranır
2. İlk eşleşen kural uygulanır
3. Hiç kural yoksa → izin verilir (varsayılan açık)

---

### Webhooks

#### GET `/webhooks`
Tüm webhook listesi.

#### POST `/webhooks`
Yeni webhook oluştur.

```json
{
  "name": "Sıcaklık Alarmı",
  "trigger_on": "message",
  "topic_pattern": "ev/+/sicaklik",
  "url": "https://n8n.sirketim.com/webhook/abc",
  "method": "POST",
  "headers": { "Authorization": "Bearer token" },
  "body_template": "{ \"cihaz\": \"{{sender}}\", \"deger\": {{payload.temperature}}, \"topic\": \"{{topic}}\" }",
  "url_template": "",
  "header_templates": { "X-Device": "{{sender}}" },
  "secret": "hmac-anahtari",
  "retry_count": 3,
  "timeout_ms": 5000
}
```

**trigger_on Değerleri:**

| Değer | Açıklama | Ek Alanlar |
|-------|----------|------------|
| `message` | Topic'e mesaj gelince | `topic_pattern` (zorunlu) |
| `client_connect` | Client bağlandığında | — |
| `client_disconnect` | Client bağlantısı kopunca | `delay_seconds` (opsiyonel) |

#### Şablon Değişkenleri

URL, body ve header'larda `{{değişken}}` sözdizimi kullanılır:

| Değişken | Açıklama | Örnek |
|----------|----------|-------|
| `{{topic}}` | Tam topic | `ev/salon/sicaklik` |
| `{{topic_parts.0}}` | Topic segment 0 | `ev` |
| `{{topic_parts.1}}` | Topic segment 1 | `salon` |
| `{{topic_parts.2}}` | Topic segment 2 | `sicaklik` |
| `{{payload}}` | Ham payload string | `23.5` |
| `{{payload.temperature}}` | JSON payload alanı | `23.5` |
| `{{payload.sensor.value}}` | İç içe JSON | `23.5` |
| `{{sender}}` | Gönderen kullanıcı adı | `esp32-salon` |
| `{{client_id}}` | Gönderen client UUID | `uuid-...` |
| `{{timestamp}}` | ISO 8601 zaman damgası | `2026-05-27T...` |
| `{{event}}` | Event tipi | `message` / `client_connect` / `client_disconnect` |

**Örnekler:**

```json
// URL şablonu
"https://api.sirketim.com/devices/{{topic_parts.1}}/readings"
→ "https://api.sirketim.com/devices/salon/readings"

// Body şablonu
"{\"device\": \"{{sender}}\", \"temp\": {{payload.temperature}}, \"ts\": \"{{timestamp}}\"}"
→ "{\"device\": \"esp32-salon\", \"temp\": 23.5, \"ts\": \"2026-05-27T...\"}"

// Header şablonu
{"X-Device-Id": "{{client_id}}", "X-Topic": "{{topic}}"}
```

**HMAC İmzalama:**

`secret` tanımlıysa body HMAC-SHA256 ile imzalanır:
```
X-Broker-Signature: sha256=<hex>
```

Python ile doğrulama:
```python
import hmac, hashlib
signature = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
```

#### PATCH `/webhooks/:id/toggle` — Aktif/Pasif yap

#### GET `/webhooks/:id/logs?limit=50` — Çalışma logları

#### POST `/webhooks/:id/test` — Test isteği gönder

---

### Audit Log

#### GET `/audit?limit=50&offset=0&actor=&action=&from=ISO&to=ISO`

```json
{
  "logs": [{
    "id": 1,
    "actor_username": "admin",
    "action": "user.create",
    "target_type": "user",
    "target_id": "esp32-salon",
    "details": { "role": "client" },
    "ip_address": "85.x.x.x",
    "result": "success",
    "created_at": "2026-05-27T..."
  }],
  "total": 150
}
```

**Kaydedilen action tipleri:**
`auth.login`, `auth.logout`, `auth.login_failed`, `user.create`, `user.update`, `user.delete`, `client.kick`, `client.kick_all`, `acl.create`, `acl.update`, `acl.delete`, `webhook.create`, `webhook.update`, `webhook.delete`, `webhook.toggle`, `message.publish`, `message.clear`, `settings.update`, `topic.retain_delete`

---

### İstatistikler

#### GET `/stats`

```json
{
  "uptime_seconds": 3600,
  "total_clients_ever": 42,
  "active_clients": 3,
  "total_messages_today": 1250,
  "total_messages_all": 48200,
  "messages_per_minute": 12,
  "active_topics": 8,
  "db_size_mb": 12.4,
  "active_webhooks": 2,
  "broker_version": "1.0.0"
}
```

#### GET `/stats/timeseries?period=1h`
Mesaj/dakika zaman serisi. `period`: `1h`, `6h`, `24h`, `7d`.

---

### Ayarlar

#### GET `/settings`
Tüm ayarlar.

#### PATCH `/settings`
Ayarları güncelle (anında uygulanır, restart gerekmez).

```json
{
  "max_messages_stored": "10000",
  "ws_ping_interval": "30000",
  "ws_ping_timeout": "60000",
  "max_connections_per_user": "10",
  "max_payload_size_kb": "256",
  "rate_limit_messages_per_second": "100",
  "ip_blacklist": ["1.2.3.4"],
  "ip_whitelist_enabled": "false",
  "ip_whitelist": ["192.168.1.0/24"]
}
```

---

## ACL — Erişim Kontrolü

### Nasıl Çalışır?

1. Tüm kurallar priority (öncelik) sırasına göre değerlendirilir
2. İlk eşleşen kural uygulanır
3. **Hiç kural yoksa → herkese izin verilir**

### Örnek Senaryo

```
# ESP32 sensörler sadece kendi topiclerine publish edebilsin
username: esp32-salon    | topic: ev/salon/#  | action: publish  | allow | priority: 10
username: esp32-mutfak   | topic: ev/mutfak/# | action: publish  | allow | priority: 10

# Komut topiclerine sadece admin publish edebilsin
username: (boş=herkes)   | topic: +/+/komut   | action: publish  | deny  | priority: 5

# Uygulama kullanıcıları her şeyi okuyabilsin
username: flutter-app    | topic: #           | action: subscribe | allow | priority: 1
```

---

## Webhook Sistemi

### Çalışma Akışı

```
Mesaj gelir
    ↓
Topic pattern eşleşmesi kontrol edilir
    ↓
Body şablonu render edilir ({{değişken}} yerleştirilir)
    ↓
HTTP isteği atılır
    ↓
Başarısız? → Exponential backoff ile retry_count kadar tekrar
    ↓
webhook_logs tablosuna yazılır
```

### n8n Entegrasyonu Örneği

n8n'de bir Webhook trigger node'u açın ve URL'yi kopyalayın.

```json
{
  "name": "n8n Sıcaklık",
  "trigger_on": "message",
  "topic_pattern": "ev/+/sicaklik",
  "url": "https://n8n.sirketim.com/webhook/xxxxx",
  "body_template": "{\"sensor\": \"{{topic_parts.1}}\", \"deger\": {{payload}}, \"zaman\": \"{{timestamp}}\"}"
}
```

n8n'de `$json.sensor`, `$json.deger`, `$json.zaman` ile kullanabilirsiniz.

---

## Rol Sistemi

| Rol | Dashboard | Okuma | Yazma | WebSocket |
|-----|-----------|-------|-------|-----------|
| `admin` | ✅ | ✅ | ✅ | ✅ |
| `viewer` | ✅ | ✅ | ❌ | ✅ |
| `client` | ❌ | ❌ | ❌ | ✅ |

- **admin:** Her şeyi yapabilir
- **viewer:** Okuyabilir, değişiklik yapamaz (butonlar disabled)
- **client:** Sadece WebSocket bağlantısı, dashboard'a giremez

---

## Güvenlik

### Katmanlar

```
Internet
   ↓
Coolify / Traefik (SSL termination)
   ↓
Rate Limiting (express-rate-limit)
   ↓
Helmet (HTTP security headers)
   ↓
JWT / API Key authentication
   ↓
Role-based authorization
   ↓
ACL (topic-level access control)
   ↓
Input validation & sanitization
```

### WS Güvenlik Önlemleri

| Önlem | Detay |
|-------|-------|
| Unauthenticated timeout | 30s içinde auth yapılmazsa bağlantı kapanır |
| Brute-force koruması | 10 başarısız deneme → 5 dakika blok (IP bazlı) |
| IP blacklist | Dashboard'dan yönetilir |
| IP whitelist | CIDR destekli, opsiyonel |
| Rate limiting | Kullanıcı başına mesaj/saniye sınırı |
| Payload size | Max KB ayarlanabilir |
| Max connections | Kullanıcı başına eş zamanlı bağlantı sınırı |
| $SYS koruma | Client'lar $SYS topic'lerine publish yapamaz |

### HTTP Güvenlik Başlıkları (Helmet)

```
Content-Security-Policy
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
X-XSS-Protection
Referrer-Policy
```

---

## Hata Kodları

### WebSocket Hata Kodları

| Kod | Açıklama |
|-----|----------|
| `AUTH_TIMEOUT` | 30s içinde auth yapılmadı |
| `ALREADY_AUTHENTICATED` | Zaten giriş yapılmış |
| `UNAUTHORIZED` | Auth yapılmadan mesaj gönderildi |
| `INVALID_JSON` | Geçersiz JSON formatı |
| `INVALID_TOPIC` | Geçersiz topic formatı |
| `RESERVED_TOPIC` | $SYS topic'e publish yapılamaz |
| `ACL_DENIED` | ACL kuralı erişimi reddetti |
| `RATE_LIMITED` | Mesaj gönderme hızı aşıldı |
| `PAYLOAD_TOO_LARGE` | Payload boyutu limiti aşıldı |
| `KICKED` | Admin tarafından bağlantı kesildi |

### HTTP Durum Kodları

| Kod | Açıklama |
|-----|----------|
| `200` | Başarılı |
| `201` | Oluşturuldu |
| `400` | Geçersiz istek |
| `401` | Kimlik doğrulaması gerekli |
| `403` | Yetki yetersiz |
| `404` | Kayıt bulunamadı |
| `409` | Çakışma (örn. kullanıcı adı alınmış) |
| `429` | Rate limit aşıldı |
| `500` | Sunucu hatası |

---

## Hızlı Başlangıç

### 1. Kullanıcı Oluştur

```bash
curl -X POST https://broker.myensim.com/api/users \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"username":"esp32-001","password":"GucluSifre123!","role":"client"}'
```

### 2. WebSocket'e Bağlan

```javascript
const ws = new WebSocket('wss://broker.myensim.com/ws?username=esp32-001&password=GucluSifre123!');

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'auth_ok') {
    ws.send(JSON.stringify({ type: 'subscribe', topic: 'komutlar/#' }));
  }
  if (msg.type === 'message') {
    console.log(msg.topic, msg.payload);
  }
  if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong' }));
  }
};
```

### 3. HTTP'den Mesaj Gönder

```bash
curl -X POST https://broker.myensim.com/api/messages/publish \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"topic":"komutlar/esp32-001","payload":"restart","retain":false}'
```

---

*WS Broker v1.0.0 — broker.myensim.com*
