# WS Broker — Coolify Deploy Kılavuzu

Üç deploy yöntemi mevcuttur. Hepsinde sonuç aynıdır; hangisini seçeceğiniz iş akışınıza bağlıdır.

---

## Yöntem 1: Shell Scripti (Tavsiye Edilen)

Tek komutla ilk kurulum ve sonraki deploy'lar için en kolay yol.

### Ön Koşullar

- `curl`, `jq`, `base64` kurulu olmalı
- Coolify instance'ınız çalışıyor olmalı
- Coolify API token oluşturulmuş olmalı

### 1. API Token Alın

Coolify panelinde: **Keys & Tokens → API Tokens → New Token**

### 2. `.env.deploy` Dosyası Oluşturun

```bash
cp .env.deploy.example .env.deploy
# .env.deploy dosyasını düzenleyin
```

```env
COOLIFY_URL=https://coolify.sirketim.com
COOLIFY_TOKEN=xxxxxxxxxxxxxxxxxxxxx

# Server/Project UUID — boş bırakırsanız otomatik algılanır
# COOLIFY_SERVER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# COOLIFY_PROJECT=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

JWT_SECRET=cok-uzun-ve-gizli-bir-string-en-az-64-karakter
API_KEY=guclu-api-anahtari
ADMIN_PASSWORD=ilk-admin-sifresi
```

> `.env.deploy` `.gitignore`'a ekleniyor — commit'lemeyin.

### 3. İlk Deploy

```bash
chmod +x deploy/coolify-deploy.sh
./deploy/coolify-deploy.sh
```

Script şunları yapar:
1. Coolify bağlantısını test eder
2. Sunucu UUID'sini otomatik algılar
3. Yeni proje oluşturur (veya mevcut projeye ekler)
4. `docker-compose.yml`'yi base64 encode eder
5. `POST /api/v1/services` ile servisi oluşturur
6. Deploy'ı başlatır ve durumu takip eder
7. `COOLIFY_SERVICE_UUID`'yi `.env.deploy`'a yazar

### 4. Sonraki Deploy'lar (Restart)

```bash
./deploy/coolify-redeploy.sh
```

### 5. Durum Kontrolü

```bash
./deploy/coolify-status.sh
```

---

## Yöntem 2: GitHub Actions (CI/CD)

Her `main` branch push'unda otomatik deploy.

### GitHub Secrets Ayarlayın

Repository → **Settings → Secrets and variables → Actions**

| Secret | Açıklama |
|--------|----------|
| `COOLIFY_URL` | `https://coolify.sirketim.com` |
| `COOLIFY_TOKEN` | Coolify API token |
| `COOLIFY_SERVER` | Server UUID |
| `COOLIFY_PROJECT` | Project UUID |
| `COOLIFY_SERVICE_UUID` | İlk deploy sonrası (redeploy için) |
| `JWT_SECRET` | Broker JWT secret |
| `API_KEY` | Broker API key |
| `ADMIN_PASSWORD` | Admin şifresi |

### Workflow Tetikleyiciler

```yaml
# Otomatik: main branch'e her push
git push origin main

# Manuel: GitHub Actions sekmesinden
# → "Run workflow" → action seç:
#   - fresh-deploy: Yeni servis oluştur
#   - redeploy: Mevcut servisi restart et
```

### Server & Project UUID Nasıl Bulunur?

```bash
# Tüm sunucuları listele
curl https://coolify.sirketim.com/api/v1/servers \
  -H "Authorization: Bearer $TOKEN" | jq '.[].uuid'

# Tüm projeleri listele
curl https://coolify.sirketim.com/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" | jq '.[].uuid'
```

---

## Yöntem 3: Coolify Panelinden Manuel

Otomatizasyon istemiyorsanız:

1. Coolify panelinde **Projects → New Project → ws-broker**
2. **New Resource → Docker Compose**
3. `docker-compose.yml` içeriğini yapıştırın
4. Environment variables ekleyin:
   ```
   JWT_SECRET=...
   API_KEY=...
   ADMIN_PASSWORD=...
   ```
5. **Deploy** butonuna tıklayın

---

## SSL Kurulumu (Coolify + Traefik)

Coolify, Traefik üzerinden otomatik SSL sağlar. Uygulama tarafında ek bir ayar gerekmez.

1. Coolify servis ayarlarında **Domain** alanına gidin
2. `wss-broker.sirketim.com` gibi bir domain ekleyin
3. **SSL Certificate** → Let's Encrypt seçin
4. **Save & Redeploy**

Uygulama `ws://` ile çalışır, Traefik `wss://`'e çevirir. Frontend `window.location.protocol` ile bunu otomatik algılar.

---

## Coolify API Referansı

```
# Servis listesi
GET  /api/v1/services

# Servis detayı
GET  /api/v1/services/{uuid}

# Servis oluştur
POST /api/v1/services
  Body: { server_uuid, project_uuid, environment_name,
          docker_compose_raw (base64), instant_deploy }

# Servis başlat
GET  /api/v1/services/{uuid}/start

# Servis durdur
GET  /api/v1/services/{uuid}/stop

# Servis restart
GET  /api/v1/services/{uuid}/restart

# Servis sil
DELETE /api/v1/services/{uuid}

# Sunucu listesi
GET  /api/v1/servers

# Proje listesi
GET  /api/v1/projects

# Proje oluştur
POST /api/v1/projects
  Body: { name, description }
```

---

## Sorun Giderme

### `docker_compose_raw` 422 Hatası

Coolify, compose dosyasının ASCII-only olmasını zorunlu kılar. Script bunu otomatik halleder. Manuel yapıyorsanız:

```bash
# macOS
base64 -i docker-compose.yml | tr -d '\n'

# Linux
base64 -w 0 docker-compose.yml
```

### PostgreSQL Bağlanamıyor

`docker-compose.yml`'deki `depends_on` + `healthcheck` zaten sıralı başlatmayı sağlar. Yine de bağlanamazsa:

```bash
# Coolify panelinde loglara bakın:
# Services → ws-broker → Logs → postgres container
```

### Uygulama 8883 Portuna Ulaşılamıyor

Coolify bir Traefik proxy sağlar, direkt port erişimi yerine domain üzerinden erişin. Geliştirme için port mapping açmak isterseniz Coolify servis ayarlarında **Ports** bölümüne `8883:8883` ekleyin.

### İlk Admin Şifresi Değiştirme

```bash
# Deploy sonrası dashboard'a giriş yapın
# Settings → Users → admin → Şifre Değiştir
# Veya API ile:
curl -X PATCH https://broker.sirketim.com/api/users/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"password": "yeni-guclu-sifre"}'
```
