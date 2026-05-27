import { useEffect, useState } from 'react'
import { Copy, Check, ExternalLink, BookOpen } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// ── Code Block ────────────────────────────────────────────────────────────────
function CodeBlock({ code, language = 'text' }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="relative group">
      <pre className="bg-zinc-950 dark:bg-zinc-900 text-zinc-100 rounded-lg p-4 overflow-auto text-xs font-mono leading-relaxed border border-zinc-800">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-800 hover:bg-zinc-700"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3 text-zinc-300" />}
      </Button>
    </div>
  )
}

// ── API Docs Markdown Renderer ─────────────────────────────────────────────────
function ApiDocs() {
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState('')
  const [sections, setSections] = useState<Array<{ id: string; title: string; level: number }>>([])

  useEffect(() => {
    fetch('/API_DOCS.md')
      .then(r => r.text())
      .then(text => {
        setContent(text)
        // Extract headings for sidebar
        const headings = [...text.matchAll(/^(#{1,3})\s+(.+)$/gm)].map(m => ({
          level: m[1].length,
          title: m[2].replace(/[^a-zA-Z0-9\s\-ığüşöçİĞÜŞÖÇ]/g, '').trim(),
          id: m[2].toLowerCase()
            .replace(/[^a-z0-9\s\-ığüşöçİĞÜŞÖÇ]/g, '')
            .trim()
            .replace(/\s+/g, '-')
        }))
        setSections(headings)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActiveSection(e.target.id)
        })
      },
      { rootMargin: '-20% 0% -70% 0%' }
    )
    document.querySelectorAll('h1[id], h2[id], h3[id]').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [content])

  if (loading) return (
    <div className="flex items-center justify-center h-96 text-muted-foreground">
      Dokümantasyon yükleniyor...
    </div>
  )

  return (
    <div className="flex gap-6 min-h-[80vh]">
      {/* Sidebar navigation */}
      <aside className="hidden xl:block w-56 flex-shrink-0">
        <div className="sticky top-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">İçindekiler</p>
          <ScrollArea className="h-[calc(100vh-200px)]">
            <nav className="space-y-0.5 pr-2">
              {sections.map((s, i) => (
                <a
                  key={i}
                  href={`#${s.id}`}
                  className={`block text-xs py-1 transition-colors truncate ${
                    s.level === 1 ? 'font-semibold' : s.level === 2 ? 'pl-3' : 'pl-6'
                  } ${
                    activeSection === s.id
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {s.title}
                </a>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="prose prose-sm dark:prose-invert max-w-none
          prose-headings:scroll-mt-4
          prose-h1:text-2xl prose-h1:font-bold prose-h1:border-b prose-h1:pb-3 prose-h1:mb-6
          prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-10 prose-h2:mb-4
          prose-h3:text-base prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3
          prose-p:leading-7 prose-p:mb-4
          prose-strong:font-semibold
          prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
          prose-table:text-sm prose-table:w-full
          prose-thead:bg-muted/50
          prose-th:p-2 prose-th:text-left prose-th:font-semibold
          prose-td:p-2 prose-td:border-b
          prose-tr:border-b prose-tr:hover:bg-muted/30
          prose-blockquote:border-l-4 prose-blockquote:border-primary/50 prose-blockquote:bg-muted/30 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:rounded-r
          prose-ul:list-disc prose-ul:pl-6
          prose-ol:list-decimal prose-ol:pl-6
          prose-li:mb-1
        ">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              // Headings with anchor IDs
              h1: ({ children }) => {
                const id = String(children).toLowerCase().replace(/[^a-z0-9\s\-ığüşöçİĞÜŞÖÇ]/g, '').trim().replace(/\s+/g, '-')
                return <h1 id={id}>{children}</h1>
              },
              h2: ({ children }) => {
                const id = String(children).toLowerCase().replace(/[^a-z0-9\s\-ığüşöçİĞÜŞÖÇ]/g, '').trim().replace(/\s+/g, '-')
                return <h2 id={id}>{children}</h2>
              },
              h3: ({ children }) => {
                const id = String(children).toLowerCase().replace(/[^a-z0-9\s\-ığüşöçİĞÜŞÖÇ]/g, '').trim().replace(/\s+/g, '-')
                return <h3 id={id}>{children}</h3>
              },
              // Code blocks with copy button
              code({ className, children }) {
                const lang = /language-(\w+)/.exec(className || '')?.[1] || 'text'
                const code = String(children).replace(/\n$/, '')
                // Inline vs block
                if (!className) {
                  return <code className={className}>{children}</code>
                }
                return <CodeBlock code={code} language={lang} />
              },
              // Tables
              table: ({ children }) => (
                <div className="overflow-x-auto my-4">
                  <table className="w-full text-sm border-collapse border border-border rounded-lg overflow-hidden">
                    {children}
                  </table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
              th: ({ children }) => <th className="p-2.5 text-left font-semibold border-b border-border text-xs uppercase tracking-wide">{children}</th>,
              td: ({ children }) => <td className="p-2.5 border-b border-border text-sm">{children}</td>,
              tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
              // Blockquote
              blockquote: ({ children }) => (
                <blockquote className="border-l-4 border-primary/40 bg-primary/5 px-4 py-3 rounded-r-lg my-4 text-sm">
                  {children}
                </blockquote>
              ),
              // Links
              a: ({ href, children }) => (
                <a href={href} className="text-primary hover:underline" target={href?.startsWith('http') ? '_blank' : undefined}>
                  {children}
                </a>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  )
}

// ── Entegrasyon Örnekleri ──────────────────────────────────────────────────────
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

// Ya da query param ile direkt:
const ws = new WebSocket('wss://broker.myensim.com/ws?username=user&password=pass');
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.type === 'auth_ok') console.log('Bağlandı!');
  if (msg.type === 'ping') ws.send('{"type":"pong"}');
  if (msg.type === 'message') console.log(msg.topic, msg.payload);
};`

const ARDUINO_CODE = `/*
 * WS Broker — Arduino IDE ESP32 Örneği
 * Kütüphaneler: ArduinoWebsockets + ArduinoJson
 * (Tools > Manage Libraries)
 */
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include <ArduinoJson.h>
using namespace websockets;

const char* WIFI_SSID = "WiFi-Adiniz";
const char* WIFI_PASS = "WiFi-Sifreniz";
// Query param ile direkt auth — ayrı auth mesajı gerekmez!
const char* WS_URL = "wss://broker.myensim.com/ws?username=esp32-001&password=SifreXXX&keepalive=60";

WebsocketsClient ws;
bool authenticated = false;
unsigned long lastPub = 0;

void sendJson(JsonDocument& doc) {
  String out; serializeJson(doc, out); ws.send(out);
}

void onMessage(WebsocketsMessage msg) {
  StaticJsonDocument<512> doc;
  deserializeJson(doc, msg.data());
  const char* type = doc["type"];

  if (strcmp(type, "auth_ok") == 0) {
    authenticated = true;
    Serial.println("Broker'a bağlandı!");
    StaticJsonDocument<100> sub;
    sub["type"] = "subscribe"; sub["topic"] = "cihazlar/esp32-001/komut";
    sendJson(sub);
  } else if (strcmp(type, "message") == 0) {
    Serial.printf("Mesaj: %s => %s\\n", doc["topic"].as<const char*>(), doc["payload"].as<const char*>());
  } else if (strcmp(type, "ping") == 0) {
    StaticJsonDocument<32> pong; pong["type"] = "pong"; sendJson(pong);
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\\nWiFi OK!");

  ws.onMessage(onMessage);
  ws.onEvent([](WebsocketsEvent e, String d) {
    if (e == WebsocketsEvent::ConnectionClosed) { authenticated = false; Serial.println("Bağlantı koptu"); }
  });
  ws.connect(WS_URL);
}

void loop() {
  if (!ws.available()) { delay(3000); ws.connect(WS_URL); return; }
  if (authenticated && millis() - lastPub > 10000) {
    lastPub = millis();
    StaticJsonDocument<150> msg;
    msg["type"] = "publish"; msg["topic"] = "cihazlar/esp32-001/sicaklik";
    msg["payload"] = 20.0 + random(0,100)/10.0;
    sendJson(msg);
  }
  ws.poll();
}`

const ESP32_CODE = `; platformio.ini
; [env:esp32dev]
; platform = espressif32
; board = esp32dev
; framework = arduino
; lib_deps = Links2004/WebSockets@^2.4.0

#include <Arduino.h>
#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "WiFi-Adiniz";
const char* WIFI_PASS = "WiFi-Sifreniz";
const char* WS_HOST   = "broker.myensim.com";
const int   WS_PORT   = 443;

WebSocketsClient ws;
bool authenticated = false;

void sendJson(JsonDocument& doc) {
  String out; serializeJson(doc, out); ws.sendTXT(out);
}

void wsEvent(WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_TEXT) {
    StaticJsonDocument<512> doc;
    deserializeJson(doc, payload, length);
    const char* t = doc["type"];

    if (strcmp(t, "hello") == 0) {
      StaticJsonDocument<200> auth;
      auth["type"] = "auth"; auth["username"] = "esp32"; auth["password"] = "sifre"; auth["keepalive"] = 60;
      sendJson(auth);
    } else if (strcmp(t, "auth_ok") == 0) {
      authenticated = true;
      StaticJsonDocument<100> sub;
      sub["type"] = "subscribe"; sub["topic"] = "cihazlar/esp32/komut";
      sendJson(sub);
    } else if (strcmp(t, "ping") == 0) {
      StaticJsonDocument<32> pong; pong["type"] = "pong"; sendJson(pong);
    } else if (strcmp(t, "message") == 0) {
      Serial.printf("%s => %s\\n", doc["topic"].as<const char*>(), doc["payload"].as<const char*>());
    }
  }
}

void setup() {
  Serial.begin(115200);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  ws.beginSSL(WS_HOST, WS_PORT, "/ws");
  ws.onEvent(wsEvent);
  ws.setReconnectInterval(5000);
}

void loop() { ws.loop(); }`

const FLUTTER_CODE = `// pubspec.yaml: web_socket_channel: ^2.4.0
import 'dart:convert';
import 'package:web_socket_channel/web_socket_channel.dart';

class BrokerClient {
  late WebSocketChannel _ch;
  final String url;
  final String username;
  final String password;
  Function(Map<String, dynamic>)? onMessage;

  // Query param ile direkt auth:
  BrokerClient.withQueryParam(String baseUrl, this.username, this.password)
    : url = '\$baseUrl?username=\$username&password=\$password&keepalive=60';

  BrokerClient(this.url, this.username, this.password);

  void connect() {
    _ch = WebSocketChannel.connect(Uri.parse(url));
    _ch.stream.listen((data) {
      final msg = jsonDecode(data as String);
      switch (msg['type']) {
        case 'hello':
          _send({'type': 'auth', 'username': username, 'password': password});
          break;
        case 'auth_ok':
          print('Bağlandı: \${msg["username"]}');
          break;
        case 'ping': _send({'type': 'pong'}); break;
        case 'message': onMessage?.call(Map<String,dynamic>.from(msg)); break;
      }
    });
  }

  void subscribe(String topic) => _send({'type': 'subscribe', 'topic': topic});
  void publish(String topic, dynamic payload, {bool retain = false}) =>
    _send({'type': 'publish', 'topic': topic, 'payload': payload, 'retain': retain});
  void _send(Map<String,dynamic> d) => _ch.sink.add(jsonEncode(d));
}`

const PYTHON_CODE = `import asyncio, json, websockets

# Query param ile direkt auth
WS_URL = "wss://broker.myensim.com/ws?username=python-client&password=sifre&keepalive=0"

async def broker():
    async with websockets.connect(WS_URL) as ws:
        # auth_ok bekle
        while True:
            msg = json.loads(await ws.recv())
            if msg.get('type') == 'auth_ok':
                print(f"Bağlandı! Rol: {msg['role']}")
                break
            if msg.get('type') == 'auth_error':
                raise Exception(msg['message'])

        # Subscribe
        await ws.send(json.dumps({"type": "subscribe", "topic": "ev/#"}))

        # Mesaj döngüsü
        async for raw in ws:
            msg = json.loads(raw)
            if msg['type'] == 'ping':
                await ws.send(json.dumps({"type": "pong"}))
            elif msg['type'] == 'message':
                print(f"[{msg['topic']}] {msg['payload']}")

        # Gönderme örneği
        await ws.send(json.dumps({
            "type": "publish",
            "topic": "ev/salon/sicaklik",
            "payload": "23.5"
        }))

asyncio.run(broker())`

const CURL_CODE = `# Login → token al
TOKEN=$(curl -s -X POST https://broker.myensim.com/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"admin","password":"WsBroker2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# Mesaj yayınla
curl -X POST https://broker.myensim.com/api/messages/publish \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"topic":"ev/salon/sicaklik","payload":"25.3","retain":false}'

# Aktif clientlar
curl https://broker.myensim.com/api/clients \\
  -H "Authorization: Bearer $TOKEN"

# İstatistikler
curl https://broker.myensim.com/api/stats \\
  -H "Authorization: Bearer $TOKEN"

# Kullanıcı oluştur
curl -X POST https://broker.myensim.com/api/users \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"esp32-001","password":"GucluSifre123!","role":"client"}'

# ACL kural ekle — sadece kendi topicine publish edebilsin
curl -X POST https://broker.myensim.com/api/acl \\
  -H "Authorization: Bearer $TOKEN" \\
  -H 'Content-Type: application/json' \\
  -d '{"username":"esp32-001","topic_pattern":"cihazlar/esp32-001/#","action":"both","permission":"allow","priority":10}'`

export default function DocsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6" />
            Dokümantasyon
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Entegrasyon örnekleri, API referansı ve protokol kılavuzu</p>
        </div>
        <a
          href="/API_DOCS.md"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs bg-muted hover:bg-accent px-3 py-1.5 rounded-md transition-colors"
        >
          <ExternalLink className="h-3 w-3" />
          Raw .md
        </a>
      </div>

      <Tabs defaultValue="api-docs">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="api-docs" className="flex items-center gap-1.5">
            📖 API Referansı
          </TabsTrigger>
          <TabsTrigger value="js">JavaScript</TabsTrigger>
          <TabsTrigger value="arduino">Arduino IDE</TabsTrigger>
          <TabsTrigger value="esp32">ESP32 (PlatformIO)</TabsTrigger>
          <TabsTrigger value="flutter">Flutter</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="curl">cURL</TabsTrigger>
        </TabsList>

        {/* Full API Docs rendered from markdown */}
        <TabsContent value="api-docs">
          <Card>
            <CardContent className="p-6">
              <ApiDocs />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="js">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">Browser / Node.js — native WebSocket</p>
              <CodeBlock code={JS_CODE} language="javascript" />
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
                  <p>URL'e yazarak bağlanın — ayrı auth mesajı yok:</p>
                  <code className="text-xs block mt-1">wss://broker.myensim.com/ws?username=xxx&password=yyy</code>
                </div>
              </div>
              <CodeBlock code={ARDUINO_CODE} language="cpp" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="esp32">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">PlatformIO ile ESP32 — ArduinoJson + WebSocketsClient</p>
              <CodeBlock code={ESP32_CODE} language="cpp" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flutter">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">Flutter — web_socket_channel paketi</p>
              <CodeBlock code={FLUTTER_CODE} language="dart" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="python">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">Python — websockets + asyncio</p>
              <CodeBlock code={PYTHON_CODE} language="python" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curl">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">HTTP REST API — cURL örnekleri</p>
              <CodeBlock code={CURL_CODE} language="bash" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
