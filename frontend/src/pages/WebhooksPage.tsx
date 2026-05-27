import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, TestTube2, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
  transform_script?: string
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

const TRIGGER_LABELS: Record<string, string> = {
  message: '📨 Mesaj',
  client_connect: '🔌 Bağlandı',
  client_disconnect: '🔴 Ayrıldı',
}

export default function WebhooksPage() {
  const { isAdmin } = useAuthStore()
  const navigate = useNavigate()
  const [webhooks, setWebhooks] = useState<Webhook[]>([])
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

  const successRate = (wh: Webhook) => {
    if (!wh.total_triggers) return null
    return Math.round(((wh.total_triggers - wh.failed_triggers) / wh.total_triggers) * 100)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-muted-foreground text-sm">
            {webhooks.filter(w => w.active).length} aktif / {webhooks.length} toplam
          </p>
        </div>
        {isAdmin() && (
          <Button size="sm" onClick={() => navigate('/webhooks/new')}>
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
                  <th className="p-3 text-left font-medium w-10">Aktif</th>
                  <th className="p-3 text-left font-medium">İsim</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Tetikleyici</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">URL</th>
                  <th className="p-3 text-left font-medium hidden xl:table-cell">Tetiklenme</th>
                  <th className="p-3 text-left font-medium hidden xl:table-cell">Son</th>
                  <th className="p-3 text-left font-medium">İşlem</th>
                </tr>
              </thead>
              <tbody>
                {webhooks.map(wh => {
                  const rate = successRate(wh)
                  const hasScript = !!wh.transform_script
                  return (
                    <tr key={wh.id} className="border-b hover:bg-accent/30">
                      <td className="p-3">
                        <Switch checked={wh.active} onCheckedChange={() => isAdmin() && handleToggle(wh.id)} disabled={!isAdmin()} />
                      </td>
                      <td className="p-3">
                        <div className="font-medium flex items-center gap-2">
                          {wh.name}
                          {hasScript && <Badge variant="secondary" className="text-xs">JS</Badge>}
                        </div>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <span className="text-sm">{TRIGGER_LABELS[wh.trigger_on] || wh.trigger_on}</span>
                        {wh.topic_pattern && (
                          <p className="text-xs font-mono text-muted-foreground mt-0.5">{wh.topic_pattern}</p>
                        )}
                        {wh.trigger_on === 'client_disconnect' && wh.delay_seconds > 0 && (
                          <p className="text-xs text-muted-foreground">+{wh.delay_seconds}s gecikme</p>
                        )}
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <span className="text-xs text-muted-foreground font-mono truncate block max-w-[200px]">
                          {wh.url_template || wh.url}
                        </span>
                      </td>
                      <td className="p-3 hidden xl:table-cell">
                        <span>{wh.total_triggers}</span>
                        {rate !== null && (
                          <Badge variant={rate >= 90 ? 'success' : rate >= 70 ? 'warning' : 'destructive'} className="ml-1 text-xs">
                            {rate}%
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs hidden xl:table-cell">
                        {wh.last_triggered_at ? <TimeAgo date={wh.last_triggered_at} /> : '—'}
                        {wh.last_status_code && <span className="ml-1 text-muted-foreground">{wh.last_status_code}</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelected(wh); fetchLogs(wh.id) }} title="Loglar">
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                          {isAdmin() && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/webhooks/${wh.id}`)} title="Düzenle">
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
                  )
                })}
                {webhooks.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Webhook yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <Dialog open={!!selected} onOpenChange={() => { setSelected(null); setTestResult(null) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.name}
              {selected?.transform_script && <Badge variant="secondary">JS Transform</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Tetikleyici:</span> {TRIGGER_LABELS[selected.trigger_on]}</div>
                {selected.topic_pattern && <div><span className="text-muted-foreground">Topic:</span> <code className="text-xs">{selected.topic_pattern}</code></div>}
                <div><span className="text-muted-foreground">URL:</span> <span className="text-xs">{selected.url}</span></div>
                <div><span className="text-muted-foreground">Toplam:</span> {selected.total_triggers} | <span className="text-red-500">{selected.failed_triggers} hata</span></div>
              </div>

              {isAdmin() && (
                <div>
                  <Button size="sm" variant="outline" onClick={() => handleTest(selected.id)} disabled={testing}>
                    <TestTube2 className="h-4 w-4 mr-1" />{testing ? 'Test ediliyor...' : 'Test Et'}
                  </Button>
                  {testResult && (
                    <div className={`mt-2 p-2 rounded text-sm ${testResult.success ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'}`}>
                      Status: {testResult.status_code} | {testResult.duration_ms}ms
                      {testResult.error && ` | ${testResult.error}`}
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-sm font-medium mb-2">Son 50 Log</p>
                <ScrollArea className="h-44">
                  <table className="w-full text-xs">
                    <thead className="border-b"><tr><th className="p-1.5 text-left">Zaman</th><th className="p-1.5 text-left">Status</th><th className="p-1.5 text-left">Süre</th><th className="p-1.5 text-left">Sonuç</th></tr></thead>
                    <tbody>
                      {logs.map(log => (
                        <tr key={log.id} className="border-b">
                          <td className="p-1.5"><TimeAgo date={log.created_at} /></td>
                          <td className="p-1.5">{log.status_code || '—'}</td>
                          <td className="p-1.5">{log.duration_ms}ms</td>
                          <td className="p-1.5">
                            <Badge variant={log.success ? 'success' : 'destructive'} className="text-xs">{log.success ? 'OK' : 'HATA'}</Badge>
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
