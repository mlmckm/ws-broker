import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'

function CodeBlock({ code, language = 'javascript' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <pre className="bg-muted rounded-lg p-4 overflow-auto text-xs font-mono text-foreground leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  )
}

const JS_CODE = `class BrokerClient {
  constructor(url, username, password) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.reconnectDelay = 1000;
    this.maxDelay = 30000;
    this.subscriptions = [];
  }

  connect() {
    this.ws = new WebSocket(this.url);
    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'hello') {
        this.ws.send(JSON.stringify({
          type: 'auth',
          username: this.username,
          password: this.password
        }));
      }
      if (msg.type === 'auth_ok') {
        this.reconnectDelay = 1000;
        this.subscriptions.forEach(t => this.subscribe(t));
        this.onConnect?.();
      }
      if (msg.type === 'ping') {
        this.ws.send(JSON.stringify({ type: 'pong' }));
      }
      if (msg.type === 'message') {
        this.onMessage?.(msg);
      }
    };
    this.ws.onclose = () => {
      this.onDisconnect?.();
      setTimeout(() => {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxDelay);
        this.connect();
      }, this.reconnectDelay);
    };
  }

  subscribe(topic) {
    this.subscriptions.push(topic);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', topic }));
    }
  }

  publish(topic, payload, retain = false) {
    this.ws.send(JSON.stringify({ type: 'publish', topic, payload, retain }));
  }
}

// Kullanım
const broker = new BrokerClient('ws://sunucu:8883/ws', 'kullanici', 'sifre');
broker.onConnect = () => {
  broker.subscribe('ev/salon/+');
  broker.publish('ev/salon/sicaklik', '23.5');
};
broker.onMessage = (msg) => console.log(msg.topic, msg.payload);
broker.connect();`

const ESP32_CODE = `// platformio.ini
// lib_deps = Links2004/WebSockets@^2.4.0

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* ssid = "WiFi-SSID";
const char* password = "WiFi-sifre";
const char* wsHost = "192.168.1.100";
const int wsPort = 8883;
const char* wsPath = "/ws";

WebSocketsClient webSocket;
bool authenticated = false;
unsigned long lastPing = 0;

void sendJson(JsonDocument& doc) {
  String output;
  serializeJson(doc, output);
  webSocket.sendTXT(output);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_TEXT) {
    StaticJsonDocument<512> doc;
    deserializeJson(doc, payload, length);
    const char* msgType = doc["type"];

    if (strcmp(msgType, "hello") == 0) {
      StaticJsonDocument<200> auth;
      auth["type"] = "auth";
      auth["username"] = "esp32-cihaz";
      auth["password"] = "sifre";
      sendJson(auth);
    }
    else if (strcmp(msgType, "auth_ok") == 0) {
      authenticated = true;
      StaticJsonDocument<100> sub;
      sub["type"] = "subscribe";
      sub["topic"] = "ev/salon/komut";
      sendJson(sub);
    }
    else if (strcmp(msgType, "ping") == 0) {
      StaticJsonDocument<50> pong;
      pong["type"] = "pong";
      sendJson(pong);
    }
    else if (strcmp(msgType, "message") == 0) {
      Serial.printf("Topic: %s, Payload: %s\\n",
        (const char*)doc["topic"], (const char*)doc["payload"]);
    }
  }
}

void publishTemperature(float temp) {
  if (!authenticated) return;
  StaticJsonDocument<200> msg;
  msg["type"] = "publish";
  msg["topic"] = "ev/salon/sicaklik";
  msg["payload"] = temp;
  sendJson(msg);
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);

  webSocket.begin(wsHost, wsPort, wsPath);
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
}

void loop() {
  webSocket.loop();
  // Her 10 saniyede bir sıcaklık gönder
  if (millis() - lastPing > 10000 && authenticated) {
    publishTemperature(23.5 + random(-10, 10) / 10.0);
    lastPing = millis();
  }
}`

const FLUTTER_CODE = `// pubspec.yaml:
// dependencies:
//   web_socket_channel: ^2.4.0

import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class BrokerClient {
  late WebSocketChannel _channel;
  final String url;
  final String username;
  final String password;
  Function(Map<String, dynamic>)? onMessage;

  BrokerClient(this.url, this.username, this.password);

  void connect() {
    _channel = WebSocketChannel.connect(Uri.parse(url));

    _channel.stream.listen((data) {
      final msg = jsonDecode(data as String);

      switch (msg['type']) {
        case 'hello':
          _send({'type': 'auth', 'username': username, 'password': password});
          break;
        case 'auth_ok':
          print('Connected as \${msg["username"]}');
          break;
        case 'ping':
          _send({'type': 'pong'});
          break;
        case 'message':
          onMessage?.call(Map<String, dynamic>.from(msg));
          break;
      }
    });
  }

  void subscribe(String topic) {
    _send({'type': 'subscribe', 'topic': topic});
  }

  void publish(String topic, dynamic payload, {bool retain = false}) {
    _send({'type': 'publish', 'topic': topic, 'payload': payload, 'retain': retain});
  }

  void _send(Map<String, dynamic> data) {
    _channel.sink.add(jsonEncode(data));
  }

  void disconnect() => _channel.sink.close();
}

// Kullanım
void main() {
  final broker = BrokerClient(
    'ws://sunucu:8883/ws',
    'flutter-app',
    'sifre'
  );
  broker.onMessage = (msg) => print('\${msg["topic"]}: \${msg["payload"]}');
  broker.connect();

  Future.delayed(const Duration(seconds: 2), () {
    broker.subscribe('ev/#');
    broker.publish('ev/salon/sicaklik', 23.5);
  });
}`

const PYTHON_CODE = `import asyncio
import json
import websockets

async def broker_client():
    uri = "ws://sunucu:8883/ws"

    async with websockets.connect(uri) as ws:
        # Auth akışı
        hello = json.loads(await ws.recv())
        print(f"Hello: {hello}")

        await ws.send(json.dumps({
            "type": "auth",
            "username": "python-client",
            "password": "sifre"
        }))

        auth_ok = json.loads(await ws.recv())
        print(f"Auth: {auth_ok['type']}")

        # Subscribe
        await ws.send(json.dumps({
            "type": "subscribe",
            "topic": "ev/#"
        }))

        # Mesaj al + ping/pong
        async def send_task():
            await asyncio.sleep(2)
            await ws.send(json.dumps({
                "type": "publish",
                "topic": "ev/salon/sicaklik",
                "payload": "23.5"
            }))

        asyncio.create_task(send_task())

        async for message in ws:
            msg = json.loads(message)
            if msg["type"] == "ping":
                await ws.send(json.dumps({"type": "pong"}))
            elif msg["type"] == "message":
                print(f"[{msg['topic']}] {msg['payload']}")

asyncio.run(broker_client())`

const CURL_CODE = `# Login
curl -X POST http://localhost:8883/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"admin","password":"admin123"}'

# Mesaj listele
curl http://localhost:8883/api/messages?limit=10 \\
  -H 'Authorization: Bearer <TOKEN>'

# Mesaj yayınla
curl -X POST http://localhost:8883/api/messages/publish \\
  -H 'Authorization: Bearer <TOKEN>' \\
  -H 'Content-Type: application/json' \\
  -d '{"topic":"ev/salon/sicaklik","payload":"23.5","retain":false}'

# Bağlı clientlar
curl http://localhost:8883/api/clients \\
  -H 'Authorization: Bearer <TOKEN>'

# İstatistikler
curl http://localhost:8883/api/stats \\
  -H 'Authorization: Bearer <TOKEN>'

# Kullanıcı oluştur
curl -X POST http://localhost:8883/api/users \\
  -H 'Authorization: Bearer <TOKEN>' \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"cihaz1","password":"sifre123","role":"client"}'

# ACL kuralı ekle
curl -X POST http://localhost:8883/api/acl \\
  -H 'Authorization: Bearer <TOKEN>' \\
  -H 'Content-Type: application/json' \\
  -d '{"topic_pattern":"ev/#","action":"both","permission":"allow","priority":10}'`

const ARDUINO_CODE = `/*
 * WS Broker — Arduino IDE ESP32 Örneği
 *
 * Kütüphane Kurulumu (Arduino IDE > Tools > Manage Libraries):
 *   - "ArduinoWebsockets" by Gil Maimon (v0.5.x)
 *   - "ArduinoJson" by Benoit Blanchon (v7.x)
 *
 * Board: "ESP32 Dev Module" veya "DOIT ESP32 DEVKIT V1"
 *
 * Bağlantı URL'i (query param auth — ayrı auth mesajı gerekmez):
 *   wss://broker.myensim.com/ws?username=KULLANICI&password=SIFRE
 */

#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>

using namespace websockets;

// ── WiFi Ayarları ─────────────────────────────────────
const char* WIFI_SSID     = "WiFi-Adiniz";
const char* WIFI_PASSWORD = "WiFi-Sifreniz";

// ── Broker Ayarları ───────────────────────────────────
const char* WS_HOST     = "broker.myensim.com";
const int   WS_PORT     = 443;
// Query param auth — bağlanırken otomatik doğrulama
const char* WS_USERNAME = "esp32-cihaz";
const char* WS_PASSWORD = "CihazSifresi";

// Subscribe edilecek topic (komut alma için)
const char* SUB_TOPIC   = "cihazlar/esp32-001/komut";

// Sıcaklık yayınlanacak topic
const char* PUB_TOPIC   = "cihazlar/esp32-001/sicaklik";

// ── Global Değişkenler ────────────────────────────────
WebsocketsClient ws;
bool isAuthenticated = false;
unsigned long lastPublish = 0;
const unsigned long PUBLISH_INTERVAL = 10000; // 10 saniyede bir

// ── Yardımcı: JSON mesaj gönder ───────────────────────
void sendJson(JsonDocument& doc) {
  String output;
  serializeJson(doc, output);
  ws.send(output);
  Serial.println(">> " + output);
}

// ── Sıcaklık oku (gerçek sensör yerine simülasyon) ────
float readTemperature() {
  return 20.0 + (random(0, 100) / 10.0); // DHT22 için: dht.readTemperature()
}

// ── Topic'e abone ol ─────────────────────────────────
void subscribeTopic(const char* topic) {
  StaticJsonDocument<100> doc;
  doc["type"]  = "subscribe";
  doc["topic"] = topic;
  sendJson(doc);
}

// ── Topic'e mesaj yayınla ────────────────────────────
void publishMessage(const char* topic, const char* payload, bool retain = false) {
  StaticJsonDocument<256> doc;
  doc["type"]    = "publish";
  doc["topic"]   = topic;
  doc["payload"] = payload;
  doc["retain"]  = retain;
  sendJson(doc);
}

// ── Gelen mesaj işleyici ─────────────────────────────
void onMessage(WebsocketsMessage message) {
  String raw = message.data();
  Serial.println("<< " + raw);

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, raw);
  if (err) return;

  const char* type = doc["type"];

  if (strcmp(type, "auth_ok") == 0) {
    // Query param auth ile bu da gelir
    isAuthenticated = true;
    Serial.println("[OK] Broker doğrulandı. Kullanıcı: " + String(doc["username"].as<const char*>()));
    subscribeTopic(SUB_TOPIC);

  } else if (strcmp(type, "auth_error") == 0) {
    Serial.println("[HATA] Auth başarısız: " + String(doc["message"].as<const char*>()));

  } else if (strcmp(type, "subscribed") == 0) {
    Serial.println("[OK] Subscribe: " + String(doc["topic"].as<const char*>()));

  } else if (strcmp(type, "message") == 0) {
    // Komut geldi
    const char* topic   = doc["topic"];
    const char* payload = doc["payload"];
    Serial.printf("[MSG] %s => %s\\n", topic, payload);

    // Örnek: LED kontrolü
    // if (strcmp(payload, "on") == 0)  digitalWrite(LED_PIN, HIGH);
    // if (strcmp(payload, "off") == 0) digitalWrite(LED_PIN, LOW);

  } else if (strcmp(type, "ping") == 0) {
    // Ping'e pong yanıtla
    StaticJsonDocument<32> pong;
    pong["type"] = "pong";
    sendJson(pong);

  } else if (strcmp(type, "error") == 0) {
    Serial.println("[HATA] " + String(doc["code"].as<const char*>()) +
                   ": " + String(doc["message"].as<const char*>()));

  } else if (strcmp(type, "server_shutdown") == 0) {
    Serial.println("[WARN] Sunucu kapanıyor, yeniden bağlanılacak...");
    isAuthenticated = false;
  }
}

// ── Broker'a bağlan ──────────────────────────────────
void connectBroker() {
  Serial.println("[WS] Broker'a bağlanılıyor...");

  // Query parametresi ile URL oluştur — ayrıca auth mesajı gerekmez!
  String url = "wss://";
  url += WS_HOST;
  url += "/ws?username=";
  url += WS_USERNAME;
  url += "&password=";
  url += WS_PASSWORD;

  ws.onMessage(onMessage);
  ws.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      Serial.println("[WS] Bağlantı açıldı");
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      Serial.println("[WS] Bağlantı kapandı — yeniden bağlanılacak");
      isAuthenticated = false;
    }
  });

  bool connected = ws.connect(WS_HOST, WS_PORT, url.c_str());
  if (!connected) {
    Serial.println("[WS] Bağlanamadı, 5s sonra tekrar denenecek");
  }
}

// ── Setup ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);

  // WiFi bağlantısı
  Serial.printf("[WiFi] %s bağlanılıyor...\\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("[WiFi] Bağlandı! IP: " + WiFi.localIP().toString());

  connectBroker();
}

// ── Loop ──────────────────────────────────────────────
void loop() {
  // WiFi kopmuşsa yeniden bağlan
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Bağlantı koptu, yeniden bağlanıyor...");
    WiFi.reconnect();
    delay(5000);
    return;
  }

  // WebSocket bağlı değilse yeniden bağlan
  if (!ws.available()) {
    static unsigned long lastRetry = 0;
    if (millis() - lastRetry > 5000) {
      lastRetry = millis();
      isAuthenticated = false;
      connectBroker();
    }
  }

  // Periyodik sıcaklık gönder (her 10s)
  if (isAuthenticated && millis() - lastPublish > PUBLISH_INTERVAL) {
    lastPublish = millis();
    float temp = readTemperature();
    char payload[16];
    dtostrf(temp, 1, 1, payload); // float → "23.5"
    publishMessage(PUB_TOPIC, payload);
    Serial.printf("[PUB] %s => %s\\n", PUB_TOPIC, payload);
  }

  ws.poll(); // WebSocket event loop — mutlaka çağrılmalı
}`

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Docs</h1>
        <p className="text-muted-foreground text-sm">Entegrasyon örnekleri ve protokol referansı</p>
      </div>

      <Tabs defaultValue="js">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="js">JavaScript</TabsTrigger>
          <TabsTrigger value="arduino">Arduino IDE</TabsTrigger>
          <TabsTrigger value="esp32">ESP32 (PlatformIO)</TabsTrigger>
          <TabsTrigger value="flutter">Flutter</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="curl">HTTP / cURL</TabsTrigger>
          <TabsTrigger value="protocol">Protokol</TabsTrigger>
        </TabsList>

        <TabsContent value="js">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-4">Browser veya Node.js ile native WebSocket bağlantısı</p>
              <CodeBlock code={JS_CODE} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arduino">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded-lg px-3 py-2 text-xs">
                  <p className="font-bold mb-1">📦 Gerekli Kütüphaneler</p>
                  <p>Arduino IDE → Tools → Manage Libraries</p>
                  <p className="mt-1">• <strong>ArduinoWebsockets</strong> by Gil Maimon</p>
                  <p>• <strong>ArduinoJson</strong> by Benoit Blanchon</p>
                </div>
                <div className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 rounded-lg px-3 py-2 text-xs">
                  <p className="font-bold mb-1">✅ Query Param Auth</p>
                  <p>URL'e yazarak bağlanın:</p>
                  <code className="text-xs">wss://broker.myensim.com/ws?username=xxx&password=yyy</code>
                  <p className="mt-1">Ayrı auth mesajı göndermenize gerek yok!</p>
                </div>
              </div>
              <CodeBlock code={ARDUINO_CODE} language="cpp" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="esp32">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-4">PlatformIO ile ESP32 entegrasyonu (ArduinoJson + WebSocketsClient)</p>
              <CodeBlock code={ESP32_CODE} language="cpp" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flutter">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-4">Flutter ile web_socket_channel paketi kullanımı</p>
              <CodeBlock code={FLUTTER_CODE} language="dart" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="python">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-4">Python websockets paketi ile asyncio kullanımı</p>
              <CodeBlock code={PYTHON_CODE} language="python" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curl">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-4">HTTP REST API kullanımı</p>
              <CodeBlock code={CURL_CODE} language="bash" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="protocol">
          <Card>
            <CardContent className="p-4 space-y-4">
              <div>
                <h3 className="font-semibold mb-2">WebSocket Endpoint</h3>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Standart bağlantı (sonra auth mesajı gönderilir):</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded block">wss://broker.myensim.com/ws</code>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Query param ile direkt auth (Postman / Arduino için):</p>
                    <code className="text-sm bg-muted px-2 py-1 rounded block">wss://broker.myensim.com/ws?username=KULLANICI&password=SIFRE</code>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Mesaj Tipleri</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead><tr className="border-b bg-muted/50"><th className="p-2 text-left">Tip</th><th className="p-2 text-left">Yön</th><th className="p-2 text-left">Açıklama</th></tr></thead>
                    <tbody className="text-xs font-mono">
                      {[
                        ['hello', '← Server', 'Bağlantı kurulunca ilk mesaj, client_id atanır'],
                        ['auth', '→ Client', 'Kimlik doğrulama: username + password'],
                        ['auth_ok', '← Server', 'Başarılı auth: token + role'],
                        ['auth_error', '← Server', 'Başarısız auth, bağlantı kapanır'],
                        ['subscribe', '→ Client', 'Topic aboneliği (wildcard destekli)'],
                        ['subscribed', '← Server', 'Abonelik onayı'],
                        ['unsubscribe', '→ Client', 'Abonelikten çık'],
                        ['publish', '→ Client', 'Mesaj yayınla: topic + payload + retain'],
                        ['message', '← Server', 'Gelen mesaj: topic + payload + meta'],
                        ['ping', '← Server', 'Her 30s\'de bir canlılık kontrolü'],
                        ['pong', '→ Client', 'Ping\'e cevap (10s içinde)'],
                        ['error', '← Server', 'Hata: code + message'],
                        ['server_shutdown', '← Server', 'Sunucu kapanıyor bildirimi'],
                      ].map(([type, dir, desc]) => (
                        <tr key={type} className="border-b hover:bg-accent/20">
                          <td className="p-2 text-primary">{type}</td>
                          <td className="p-2 text-muted-foreground">{dir}</td>
                          <td className="p-2 font-sans text-muted-foreground">{desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Topic Wildcard Kuralları</h3>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li><code className="text-foreground">ev/+/sicaklik</code> — Tek segment (ev/salon/sicaklik, ev/mutfak/sicaklik)</li>
                  <li><code className="text-foreground">ev/#</code> — Çok seviyeli (ev/salon, ev/salon/sicaklik, ev/salon/nem)</li>
                  <li><code className="text-foreground">$SYS/#</code> — Sistem topiclerini dinle (dashboard)</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
