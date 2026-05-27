import { useEffect, useState, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Play, RotateCcw, ChevronDown, ChevronRight, Sparkles, Maximize2, Minimize2, X } from 'lucide-react'
import Editor from '@monaco-editor/react'
import '@/lib/monaco-setup'
import { WEBHOOK_PRESETS, type WebhookPresetId } from '@/lib/webhookPresets'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'
import { useTheme } from '@/hooks/useTheme'

// ── Default JS transform script ───────────────────────────────────────────────
const DEFAULT_SCRIPT = `// WS Broker — Webhook Transform Script
// Bu script, webhook tetiklendiğinde çalışır.
// Giriş: ctx objesi (aşağıya bakın)
// Çıkış: { url?, headers?, body?, skip? }
//
// ctx.topic          → "ev/salon/sicaklik"
// ctx.payload        → ham string "23.5"
// ctx.parsedPayload  → JSON parse edilmiş obje { temperature: 23.5 }
// ctx.topicParts[0]  → "ev"
// ctx.topicParts[1]  → "salon"
// ctx.sender         → "esp32-salon"
// ctx.clientId       → "uuid..."
// ctx.timestamp      → "2026-05-27T..."
// ctx.event          → "message"
//
// fetch(url, options) → dış servise istek at
// log(...)           → loglara yaz

// Örnek: payload'dan veri al, başka bir servise sor, body'i zenginleştir
const temp = ctx.parsedPayload?.temperature ?? parseFloat(ctx.payload);

// İsteğe bağlı: dış servisten ek veri çek
// const extra = await fetch('https://api.openweathermap.org/...', {});
// const weather = extra.data;

// Skip koşulu: negatif değerleri gönderme
if (temp < 0) {
  log('Negatif sıcaklık, atlanıyor:', temp);
  return { skip: true };
}

// Özelleştirilmiş body döndür
return {
  body: {
    device: ctx.sender,
    location: ctx.topicParts[1] ?? 'unknown',
    temperature: temp,
    unit: 'celsius',
    timestamp: ctx.timestamp,
    alert: temp > 30 ? 'HIGH_TEMP' : null,
  },
  // headers override (opsiyonel)
  // headers: { 'X-Priority': temp > 30 ? 'high' : 'normal' },
  // url override (opsiyonel)
  // url: \`https://api.sirket.com/sensors/\${ctx.sender}\`,
};
`

const TEMPLATE_VARS = [
  ['ctx.topic', 'ev/salon/sicaklik', 'Tam topic'],
  ['ctx.topicParts[0]', 'ev', 'Segment 0'],
  ['ctx.topicParts[1]', 'salon', 'Segment 1'],
  ['ctx.topicParts[2]', 'sicaklik', 'Segment 2'],
  ['ctx.payload', '"23.5"', 'Ham payload string'],
  ['ctx.parsedPayload', '{temp: 23.5}', 'JSON parse edilmiş'],
  ['ctx.parsedPayload.field', '23.5', 'JSON alan'],
  ['ctx.sender', 'esp32-salon', 'Gönderen kullanıcı'],
  ['ctx.clientId', 'uuid...', 'Gönderen UUID'],
  ['ctx.timestamp', 'ISO zaman', 'ISO 8601'],
  ['ctx.event', 'message', 'Event tipi'],
]

interface FormData {
  name: string
  trigger_on: string
  topic_pattern: string
  delay_seconds: number
  url: string
  url_template: string
  method: string
  headers: string
  header_templates: string
  body_template: string
  transform_script: string
  secret: string
  retry_count: number
  timeout_ms: number
}

const defaultForm: FormData = {
  name: '',
  trigger_on: 'message',
  topic_pattern: '',
  delay_seconds: 0,
  url: '',
  url_template: '',
  method: 'POST',
  headers: '{}',
  header_templates: '{}',
  body_template: '',
  transform_script: DEFAULT_SCRIPT,
  secret: '',
  retry_count: 3,
  timeout_ms: 5000,
}

export default function WebhookEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAdmin } = useAuthStore()
  const { theme } = useTheme()
  const isNew = !id || id === 'new'

  const [form, setForm] = useState<FormData>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [scriptResult, setScriptResult] = useState<{ result: unknown; logs: string[]; error: string | null } | null>(null)
  const [testRunning, setTestRunning] = useState(false)
  const [testContext, setTestContext] = useState(JSON.stringify({
    topic: 'ev/salon/sicaklik',
    payload: '{"temperature":23.5,"humidity":65}',
    sender: 'esp32-test',
  }, null, 2))
  const [showVars, setShowVars] = useState(false)
  const [useScript, setUseScript] = useState(false)
  const [useTemplates, setUseTemplates] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<WebhookPresetId | ''>('')
  const [editorFullscreen, setEditorFullscreen] = useState(false)

  useEffect(() => {
    if (!editorFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEditorFullscreen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [editorFullscreen])

  const applyPreset = (presetId: WebhookPresetId) => {
    const preset = WEBHOOK_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    setSelectedPreset(presetId)
    setUseScript(preset.useScript)
    setUseTemplates(preset.useTemplates)
    setForm(prev => ({
      ...prev,
      name: prev.name || preset.name,
      topic_pattern: preset.topic_pattern,
      body_template: preset.body_template ?? prev.body_template,
      transform_script: preset.transform_script ?? prev.transform_script,
    }))
    toast({
      title: 'Hazır ayar uygulandı',
      description: preset.description,
    })
  }

  useEffect(() => {
    if (!isNew) fetchWebhook()
  }, [id])

  const fetchWebhook = async () => {
    try {
      const res = await api.get('/webhooks')
      const wh = res.data.webhooks.find((w: Record<string, unknown>) => String(w.id) === id)
      if (!wh) return navigate('/webhooks')
      setForm({
        name: wh.name || '',
        trigger_on: wh.trigger_on || 'message',
        topic_pattern: wh.topic_pattern || '',
        delay_seconds: wh.delay_seconds || 0,
        url: wh.url || '',
        url_template: wh.url_template || '',
        method: wh.method || 'POST',
        headers: JSON.stringify(wh.headers || {}, null, 2),
        header_templates: JSON.stringify(wh.header_templates || {}, null, 2),
        body_template: wh.body_template || '',
        transform_script: wh.transform_script || DEFAULT_SCRIPT,
        secret: wh.secret || '',
        retry_count: wh.retry_count || 3,
        timeout_ms: wh.timeout_ms || 5000,
      })
      if (wh.transform_script) setUseScript(true)
      if (wh.body_template || wh.url_template) setUseTemplates(true)
    } catch {
      toast({ title: 'Webhook yüklenemedi', variant: 'destructive' })
    }
  }

  const f = useCallback(<K extends keyof FormData>(key: K, val: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleSave = async () => {
    if (!form.name || !form.url) return toast({ title: 'İsim ve URL gerekli', variant: 'destructive' })
    setSaving(true)
    try {
      let headers = {}; try { headers = JSON.parse(form.headers) } catch {}
      let header_templates = {}; try { header_templates = JSON.parse(form.header_templates) } catch {}

      const payload = {
        ...form,
        headers,
        header_templates,
        body_template: useTemplates ? form.body_template || undefined : undefined,
        url_template: useTemplates ? form.url_template || undefined : undefined,
        transform_script: useScript ? form.transform_script || undefined : undefined,
        topic_pattern: form.trigger_on === 'message' ? form.topic_pattern : null,
      }

      if (isNew) {
        await api.post('/webhooks', payload)
        toast({ title: 'Webhook oluşturuldu' })
      } else {
        await api.put(`/webhooks/${id}`, payload)
        toast({ title: 'Webhook güncellendi' })
      }
      navigate('/webhooks')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Hata'
      toast({ title: msg, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleTestScript = async () => {
    setTestRunning(true)
    setScriptResult(null)
    try {
      let ctx = {}
      try { ctx = JSON.parse(testContext) } catch {}
      const res = await api.post('/webhooks/test-script', {
        script: form.transform_script,
        context: ctx,
      })
      setScriptResult(res.data)
    } catch {
      toast({ title: 'Script test hatası', variant: 'destructive' })
    } finally {
      setTestRunning(false)
    }
  }

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'light'

  const editorHeight = editorFullscreen ? 'calc(100vh - 11rem)' : '70vh'

  const scriptEditorBlock = (fullscreen: boolean) => (
    <>
      <div className={fullscreen ? 'flex-1 min-h-0 border rounded-md overflow-hidden' : 'border rounded-md overflow-hidden'}>
        <Editor
          loading={<div className="flex items-center justify-center h-full text-sm text-muted-foreground">Editör yükleniyor...</div>}
          height={editorHeight}
          defaultLanguage="javascript"
          value={form.transform_script}
          onChange={v => f('transform_script', v || '')}
          theme={monacoTheme}
          options={{
            fontSize: fullscreen ? 14 : 13,
            minimap: { enabled: fullscreen },
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            readOnly: !isAdmin() || !useScript,
            tabSize: 2,
            automaticLayout: true,
            suggest: { showKeywords: true },
          }}
        />
      </div>

      <div className={`border rounded-lg bg-muted/30 ${fullscreen ? 'flex-shrink-0 max-h-48 overflow-y-auto' : ''}`}>
        <Tabs defaultValue="context">
          <div className="flex items-center justify-between px-3 pt-2">
            <TabsList className="h-7">
              <TabsTrigger value="context" className="text-xs h-6">Test Context</TabsTrigger>
              <TabsTrigger value="result" className="text-xs h-6">Sonuç</TabsTrigger>
              <TabsTrigger value="vars" className="text-xs h-6">Değişkenler</TabsTrigger>
            </TabsList>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => f('transform_script', DEFAULT_SCRIPT)}>
                <RotateCcw className="h-3 w-3 mr-1" />Sıfırla
              </Button>
              <Button size="sm" className="h-6 text-xs gap-1" onClick={handleTestScript} disabled={testRunning || !useScript}>
                <Play className="h-3 w-3" />
                {testRunning ? 'Çalışıyor...' : 'Çalıştır'}
              </Button>
            </div>
          </div>

          <TabsContent value="context" className="p-2 pt-1">
            <p className="text-xs text-muted-foreground mb-1">Simüle edilecek giriş verisi (JSON):</p>
            <div className="border rounded overflow-hidden" style={{ height: fullscreen ? '100px' : '120px' }}>
              <Editor
                height={fullscreen ? '100px' : '120px'}
                defaultLanguage="json"
                value={testContext}
                onChange={v => setTestContext(v || '')}
                theme={monacoTheme}
                options={{ fontSize: 11, minimap: { enabled: false }, lineNumbers: 'off', scrollBeyondLastLine: false }}
              />
            </div>
          </TabsContent>

          <TabsContent value="result" className="p-2 pt-1">
            {!scriptResult ? (
              <p className="text-xs text-muted-foreground p-2">Scripti çalıştırın...</p>
            ) : (
              <div className="space-y-2">
                {scriptResult.error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 text-xs text-red-700 dark:text-red-300">
                    ❌ {scriptResult.error}
                  </div>
                )}
                {scriptResult.logs.length > 0 && (
                  <div className="bg-muted rounded p-2 font-mono text-xs space-y-0.5">
                    {scriptResult.logs.map((l, i) => <div key={i} className="text-muted-foreground">📋 {l}</div>)}
                  </div>
                )}
                {scriptResult.result !== null && !scriptResult.error && (
                  <div className="bg-green-50 dark:bg-green-900/20 rounded p-2">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">✅ Sonuç (body/headers/url):</p>
                    <pre className="text-xs font-mono text-green-800 dark:text-green-200 overflow-auto max-h-24">
                      {JSON.stringify(scriptResult.result, null, 2)}
                    </pre>
                  </div>
                )}
                {scriptResult.result === null && !scriptResult.error && (
                  <p className="text-xs text-muted-foreground">Script null döndürdü (varsayılan body kullanılacak)</p>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="vars" className="p-2 pt-1">
            <div className="grid grid-cols-1 gap-0.5 text-xs font-mono">
              {TEMPLATE_VARS.map(([v, ex, desc]) => (
                <div key={v} className="flex gap-2 py-0.5 hover:bg-muted/50 rounded px-1">
                  <span className="text-primary w-44 flex-shrink-0">{v}</span>
                  <span className="text-orange-500 dark:text-orange-400 w-28 flex-shrink-0">{ex}</span>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </>
  )

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/webhooks')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{isNew ? 'Yeni Webhook' : 'Webhook Düzenle'}</h1>
            <p className="text-muted-foreground text-sm">Tetikleyici, dönüşüm ve hedef ayarları</p>
          </div>
        </div>
        {isAdmin() && (
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            <Save className="h-4 w-4" />
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
        )}
      </div>

      {/* Hazır şablonlar — JS yazmadan */}
      {isAdmin() && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Hazır ayar (JS yazmanız gerekmez)</span>
              </div>
              <Select
                value={selectedPreset || undefined}
                onValueChange={v => applyPreset(v as WebhookPresetId)}
              >
                <SelectTrigger className="sm:max-w-md bg-background">
                  <SelectValue placeholder="Bir hazır ayar seçin..." />
                </SelectTrigger>
                <SelectContent>
                  {WEBHOOK_PRESETS.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground sm:flex-1">
                Öneri: n8n kullanıyorsanız <strong>Basit ilet (JS yok)</strong> seçin, URL&apos;nizi yazıp Kaydet&apos;e basın.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tam ekran JS editörü */}
      {editorFullscreen && useScript && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setEditorFullscreen(false)}>
                <X className="h-4 w-4" />
              </Button>
              <span className="font-semibold">JS Transform — Tam Ekran</span>
              <Badge variant="outline" className="text-xs">Esc ile çık</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditorFullscreen(false)}>
                <Minimize2 className="h-4 w-4 mr-1" /> Küçült
              </Button>
              {isAdmin() && (
                <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                  <Save className="h-4 w-4" /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-3 p-4 min-h-0 overflow-hidden">
            {scriptEditorBlock(true)}
          </div>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${useScript ? '' : 'xl:grid-cols-2'}`}>
        {/* Form alanları */}
        <div className={useScript ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'space-y-4 xl:col-span-1'}>
          <div className="space-y-4">
          {/* Temel Bilgiler */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Temel Bilgiler</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>İsim</Label>
                <Input value={form.name} onChange={e => f('name', e.target.value)} placeholder="Sıcaklık Alarmı" disabled={!isAdmin()} />
              </div>

              <div className="space-y-2">
                <Label>Tetikleyici</Label>
                <Select value={form.trigger_on} onValueChange={v => f('trigger_on', v)} disabled={!isAdmin()}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message">📨 Topic Mesajı</SelectItem>
                    <SelectItem value="client_connect">🔌 Client Bağlandı</SelectItem>
                    <SelectItem value="client_disconnect">🔴 Client Ayrıldı</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.trigger_on === 'message' && (
                <div className="space-y-2">
                  <Label>Topic Pattern</Label>
                  <Input value={form.topic_pattern} onChange={e => f('topic_pattern', e.target.value)} placeholder="ev/+/sicaklik" disabled={!isAdmin()} />
                  <p className="text-xs text-muted-foreground">Wildcard: <code>+</code> tek segment, <code>#</code> çok seviye</p>
                </div>
              )}

              {form.trigger_on === 'client_disconnect' && (
                <div className="space-y-2">
                  <Label>Gecikme (saniye)</Label>
                  <Input type="number" min={0} value={form.delay_seconds} onChange={e => f('delay_seconds', parseInt(e.target.value) || 0)} disabled={!isAdmin()} />
                  <p className="text-xs text-muted-foreground">Disconnect'ten kaç saniye sonra tetiklensin? 0 = anında</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Hedef */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Hedef URL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-2">
                  <Label>URL</Label>
                  <Input value={form.url} onChange={e => f('url', e.target.value)} placeholder="https://n8n.sirket.com/webhook/xxx" disabled={!isAdmin()} />
                </div>
                <div className="space-y-2">
                  <Label>Method</Label>
                  <Select value={form.method} onValueChange={v => f('method', v)} disabled={!isAdmin()}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                      <SelectItem value="GET">GET</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Retry Count</Label>
                  <Input type="number" min={0} max={10} value={form.retry_count} onChange={e => f('retry_count', parseInt(e.target.value) || 0)} disabled={!isAdmin()} />
                </div>
                <div className="space-y-2">
                  <Label>Timeout (ms)</Label>
                  <Input type="number" value={form.timeout_ms} onChange={e => f('timeout_ms', parseInt(e.target.value) || 5000)} disabled={!isAdmin()} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Secret (HMAC imzalama)</Label>
                <Input value={form.secret} onChange={e => f('secret', e.target.value)} placeholder="opsiyonel" disabled={!isAdmin()} />
              </div>
            </CardContent>
          </Card>
          </div>

          <div className="space-y-4">
          {/* Şablon / Template */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Şablon Ayarları</CardTitle>
                <Switch checked={useTemplates} onCheckedChange={setUseTemplates} disabled={!isAdmin()} />
              </div>
              <p className="text-xs text-muted-foreground">URL, body ve header'larda {`{{değişken}}`} kullanın</p>
            </CardHeader>
            {useTemplates && (
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>URL Şablonu <span className="text-muted-foreground">(sabit URL'in yerini alır)</span></Label>
                  <Input value={form.url_template} onChange={e => f('url_template', e.target.value)} placeholder="https://api.sirket.com/{{sender}}/data" disabled={!isAdmin()} />
                </div>
                <div className="space-y-2">
                  <Label>Body Şablonu (JSON)</Label>
                  <Textarea
                    value={form.body_template}
                    onChange={e => f('body_template', e.target.value)}
                    rows={5}
                    className="font-mono text-xs"
                    placeholder={'{\n  "device": "{{sender}}",\n  "value": {{payload.temperature}},\n  "ts": "{{timestamp}}"\n}'}
                    disabled={!isAdmin()}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Statik Headers</Label>
                  <Textarea value={form.headers} onChange={e => f('headers', e.target.value)} rows={3} className="font-mono text-xs" placeholder='{"Authorization": "Bearer token"}' disabled={!isAdmin()} />
                </div>
                <div className="space-y-2">
                  <Label>Dinamik Header Şablonları</Label>
                  <Textarea value={form.header_templates} onChange={e => f('header_templates', e.target.value)} rows={3} className="font-mono text-xs" placeholder='{"X-Device": "{{sender}}"}' disabled={!isAdmin()} />
                </div>

                {/* Değişken referans */}
                <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowVars(v => !v)}>
                  {showVars ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  Kullanılabilir değişkenler
                </button>
                {showVars && (
                  <div className="bg-muted/50 rounded-lg p-3 text-xs grid grid-cols-1 gap-1 font-mono">
                    {[
                      ['{{topic}}', 'ev/salon/sicaklik'],
                      ['{{topic_parts.1}}', 'salon'],
                      ['{{payload}}', 'ham string'],
                      ['{{payload.temperature}}', 'JSON alan'],
                      ['{{sender}}', 'kullanıcı adı'],
                      ['{{timestamp}}', 'ISO zaman'],
                    ].map(([v, d]) => (
                      <div key={v} className="flex gap-2">
                        <span className="text-primary w-40 flex-shrink-0">{v}</span>
                        <span className="text-muted-foreground">→ {d}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
          </div>
        </div>

        {/* JS kapalıyken sağda bilgi kartı */}
        {!useScript && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">JS Transform Script</CardTitle>
                <Switch checked={useScript} onCheckedChange={setUseScript} disabled={!isAdmin()} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                JS kapalı — <strong>Şablon Ayarları</strong> anahtarını açın veya yukarıdan hazır ayar seçin. Kod yazmanız gerekmez.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* JS açıkken tam genişlik editör */}
      {useScript && !editorFullscreen && (
        <Card className="flex flex-col w-full">
          <CardHeader className="pb-2 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  <span>JS Transform Script</span>
                  <Badge variant="default" className="text-xs">Aktif</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Gelen veriyi işle, dış servis çağır, body/header/url özelleştir
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1"
                  onClick={() => setEditorFullscreen(true)}
                >
                  <Maximize2 className="h-4 w-4" />
                  Tam ekran
                </Button>
                <Switch checked={useScript} onCheckedChange={setUseScript} disabled={!isAdmin()} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-3">
            {scriptEditorBlock(false)}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
