import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, TestTube2, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'

interface Webhook {
  id: number
  name: string
  topic_pattern: string | null
  trigger_on: 'message' | 'client_connect' | 'client_disconnect'
  delay_seconds: number
  url: string
  url_template?: string
  method: string
  active: boolean
  retry_count: number
  timeout_ms: number
  total_triggers: number
  failed_triggers: number
  last_triggered_at: string
  last_status_code: number
  headers: Record<string, string>
  header_templates?: Record<string, string>
  body_template?: string
  secret: string
}

interface WebhookLog {
  id: number
  created_at: string
  status_code: number
  duration_ms: number
  success: boolean
  response_body: string
}

const emptyForm = {
  name: '', topic_pattern: '', trigger_on: 'message', delay_seconds: 0,
  url: '', url_template: '', method: 'POST',
  headers: '{}', header_templates: '{}',
  body_template: '', secret: '', retry_count: 3, timeout_ms: 5000,
}

export default function WebhooksPage() {
  const { isAdmin } = useAuthStore()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Webhook | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selected, setSelected] = useState<Webhook | null>(null)
  const [logs, setLogs] = useState<WebhookLog[]>([])
  const [testResult, setTestResult] = useState<{ success: boolean; status_code: number; duration_ms: number; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)

  const fetchWebhooks = async () => {
    try {
      const res = await api.get('/webhooks')
      setWebhooks(res.data.webhooks)
    } catch {}
  }

  const fetchLogs = async (id: number) => {
    try {
      const res = await api.get(`/webhooks/${id}/logs?limit=50`)
      setLogs(res.data.logs)
    } catch {}
  }

  useEffect(() => { fetchWebhooks() }, [])

  const openEdit = (wh: Webhook) => {
    setEditing(wh)
    setForm({
      name: wh.name, topic_pattern: wh.topic_pattern || '', trigger_on: wh.trigger_on || 'message',
      delay_seconds: wh.delay_seconds || 0, url: wh.url,
      url_template: wh.url_template || '',
      method: wh.method,
      headers: JSON.stringify(wh.headers || {}, null, 2),
      header_templates: JSON.stringify(wh.header_templates || {}, null, 2),
      body_template: wh.body_template || '',
      secret: wh.secret || '', retry_count: wh.retry_count, timeout_ms: wh.timeout_ms,
    })
    setShowForm(true)
  }

  const handleSave = async () => {
    try {
      let headers = {}
      try { headers = JSON.parse(form.headers) } catch {}
      let header_templates = {}
      try { header_templates = JSON.parse(form.header_templates) } catch {}
      const data = {
        ...form,
        headers,
        header_templates,
        secret: form.secret || undefined,
        body_template: form.body_template || undefined,
        url_template: form.url_template || undefined,
        topic_pattern: form.trigger_on === 'message' ? form.topic_pattern : null,
      }
      if (editing) await api.put(`/webhooks/${editing.id}`, data)
      else await api.post('/webhooks', data)
      toast({ title: editing ? 'Webhook güncellendi' : 'Webhook eklendi' })
      setShowForm(false)
      setEditing(null)
      setForm(emptyForm)
      fetchWebhooks()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/webhooks/${id}`)
      toast({ title: 'Webhook silindi' })
      fetchWebhooks()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleToggle = async (id: number) => {
    try {
      await api.patch(`/webhooks/${id}/toggle`)
      fetchWebhooks()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleTest = async (id: number) => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.post(`/webhooks/${id}/test`)
      setTestResult(res.data)
      toast({ title: res.data.success ? 'Test başarılı' : 'Test başarısız', variant: res.data.success ? 'default' : 'destructive' })
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground text-sm">{webhooks.filter(w => w.active).length} aktif webhook</p>
        </div>
        {isAdmin() && (
          <Button size="sm" onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-1" />Yeni Webhook
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Aktif</th>
                  <th className="p-3 text-left font-medium">İsim</th>
                  <th className="p-3 text-left font-medium">Topic Pattern</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">URL</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">Tetiklenme</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">Son</th>
                  <th className="p-3 text-left font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(wh => (
                  <tr key={wh.id} className="border-b hover:bg-accent/30">
                    <td className="p-3">
                      <Switch checked={wh.active} onCheckedChange={() => isAdmin() && handleToggle(wh.id)} disabled={!isAdmin()} />
                    </td>
                    <td className="p-3 font-medium cursor-pointer" onClick={() => { setSelected(wh); fetchLogs(wh.id) }}>
                      {wh.name}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {wh.trigger_on === 'message' ? wh.topic_pattern :
                       wh.trigger_on === 'client_connect' ? '🔌 Bağlandı' :
                       wh.trigger_on === 'client_disconnect' ? `🔴 Ayrıldı${wh.delay_seconds ? ` (+${wh.delay_seconds}s)` : ''}` :
                       wh.topic_pattern}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground hidden md:table-cell max-w-[200px] truncate">{wh.url}</td>
                    <td className="p-3 hidden lg:table-cell">
                      <span>{wh.total_triggers}</span>
                      {wh.failed_triggers > 0 && (
                        <span className="text-red-500 ml-1 text-xs">({wh.failed_triggers} hata)</span>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground hidden lg:table-cell text-xs">
                      {wh.last_triggered_at ? <TimeAgo date={wh.last_triggered_at} /> : '—'}
                      {wh.last_status_code && <span className="ml-1">{wh.last_status_code}</span>}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelected(wh); fetchLogs(wh.id) }}>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                        {isAdmin() && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(wh)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Webhook silinsin mi?</AlertDialogTitle>
                                  <AlertDialogDescription>Bu webhook ve tüm logları silinecek.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>İptal</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => handleDelete(wh.id)}>Sil</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {webhooks.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Webhook yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Webhook Düzenle' : 'Yeni Webhook'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-2"><Label>İsim</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2">
              <Label>Tetikleyici</Label>
              <Select value={form.trigger_on} onValueChange={v => setForm(f => ({ ...f, trigger_on: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">📨 Topic Mesajı</SelectItem>
                  <SelectItem value="client_connect">🔌 Client Bağlandı</SelectItem>
                  <SelectItem value="client_disconnect">🔴 Client Ayrıldı</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.trigger_on === 'message' && (
              <div className="space-y-2"><Label>Topic Pattern</Label><Input value={form.topic_pattern} onChange={e => setForm(f => ({ ...f, topic_pattern: e.target.value }))} placeholder="ev/+/sicaklik" /></div>
            )}
            {form.trigger_on === 'client_disconnect' && (
              <div className="space-y-2">
                <Label>Gecikme (saniye) — 0 = anında</Label>
                <Input type="number" min={0} value={form.delay_seconds} onChange={e => setForm(f => ({ ...f, delay_seconds: parseInt(e.target.value) || 0 }))} placeholder="0" />
                <p className="text-xs text-muted-foreground">Client disconnect olduktan kaç saniye sonra tetiklensin?</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Hedef URL</Label>
              <Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://n8n.sirketim.com/webhook/abc" />
              <p className="text-xs text-muted-foreground">Sabit URL. Değişken kullanmak için URL Şablonu alanını doldurun.</p>
            </div>
            <div className="space-y-2">
              <Label>URL Şablonu <span className="text-muted-foreground">(opsiyonel — değişken kullanmak için)</span></Label>
              <Input value={form.url_template} onChange={e => setForm(f => ({ ...f, url_template: e.target.value }))} placeholder="https://api.sirketim.com/sensor/{{topic_parts.2}}/data" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Method</Label>
                <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2"><Label>Retry Count</Label><Input type="number" min={0} max={5} value={form.retry_count} onChange={e => setForm(f => ({ ...f, retry_count: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div className="space-y-2"><Label>Timeout (ms)</Label><Input type="number" value={form.timeout_ms} onChange={e => setForm(f => ({ ...f, timeout_ms: parseInt(e.target.value) || 5000 }))} /></div>
            <div className="space-y-2">
              <Label>Body Şablonu <span className="text-muted-foreground">(boşsa varsayılan gönderilir)</span></Label>
              <textarea
                className="w-full h-28 font-mono text-xs p-2 border rounded bg-background"
                value={form.body_template}
                onChange={e => setForm(f => ({ ...f, body_template: e.target.value }))}
                placeholder={'{\n  "cihaz": "{{sender}}",\n  "deger": {{payload.temperature}},\n  "topic": "{{topic}}"\n}'}
              />
            </div>

            {/* Değişken Referans Kılavuzu */}
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1">
              <p className="font-semibold mb-2">📋 Kullanılabilir Değişkenler</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                {[
                  ['{{topic}}', 'ev/salon/sicaklik'],
                  ['{{topic_parts.0}}', 'ev'],
                  ['{{topic_parts.1}}', 'salon'],
                  ['{{payload}}', 'ham payload string'],
                  ['{{payload.temperature}}', 'JSON alan'],
                  ['{{payload.sensor.value}}', 'iç içe JSON'],
                  ['{{sender}}', 'gönderen kullanıcı'],
                  ['{{client_id}}', 'client UUID'],
                  ['{{timestamp}}', 'ISO tarih/saat'],
                  ['{{event}}', 'message/connect/disconnect'],
                ].map(([v, d]) => (
                  <div key={v} className="flex gap-2">
                    <span className="text-primary">{v}</span>
                    <span className="text-muted-foreground">→ {d}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Statik Headers (JSON)</Label>
              <textarea className="w-full h-16 font-mono text-xs p-2 border rounded bg-background" value={form.headers} onChange={e => setForm(f => ({ ...f, headers: e.target.value }))} placeholder='{"X-Api-Key": "token123"}' />
            </div>
            <div className="space-y-2">
              <Label>Dinamik Header Şablonları (JSON) <span className="text-muted-foreground">— değişken kullanabilirsiniz</span></Label>
              <textarea className="w-full h-16 font-mono text-xs p-2 border rounded bg-background" value={form.header_templates} onChange={e => setForm(f => ({ ...f, header_templates: e.target.value }))} placeholder='{"X-Device": "{{sender}}", "X-Topic": "{{topic}}"}' />
            </div>
            <div className="space-y-2"><Label>Secret (HMAC imzalama, opsiyonel)</Label><Input value={form.secret} onChange={e => setForm(f => ({ ...f, secret: e.target.value }))} placeholder="gizli-anahtar" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>İptal</Button>
            <Button onClick={handleSave} disabled={!form.name || !form.topic_pattern || !form.url}>Kaydet</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Drawer */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setTestResult(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Topic:</span> <code className="text-xs">{selected.topic_pattern}</code></div>
                <div><span className="text-muted-foreground">URL:</span> <span className="text-xs">{selected.url}</span></div>
                <div><span className="text-muted-foreground">Toplam:</span> {selected.total_triggers}</div>
                <div><span className="text-muted-foreground">Hata:</span> {selected.failed_triggers}</div>
              </div>

              {isAdmin() && (
                <div>
                  <Button size="sm" variant="outline" onClick={() => handleTest(selected.id)} disabled={testing}>
                    <TestTube2 className="h-4 w-4 mr-1" />{testing ? 'Test ediliyor...' : 'Test Et'}
                  </Button>
                  {testResult && (
                    <div className={`mt-2 p-3 rounded text-sm ${testResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                      Status: {testResult.status_code} | {testResult.duration_ms}ms
                      {testResult.error && <span> | {testResult.error}</span>}
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Son 50 Çalışma Logu</p>
                <ScrollArea className="h-48">
                  <table className="w-full text-xs">
                    <thead className="border-b">
                      <tr>
                        <th className="p-2 text-left">Zaman</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Süre</th>
                        <th className="p-2 text-left">Sonuç</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id} className="border-b">
                          <td className="p-2"><TimeAgo date={log.created_at} /></td>
                          <td className="p-2">{log.status_code || '—'}</td>
                          <td className="p-2">{log.duration_ms}ms</td>
                          <td className="p-2">
                            <Badge variant={log.success ? 'success' : 'destructive'} className="text-xs">
                              {log.success ? 'OK' : 'HATA'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
