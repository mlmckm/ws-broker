import { useEffect, useState } from 'react'
import { Save, Trash2, WifiOff, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { useAuthStore } from '@/store/authStore'
import { useBrokerStore } from '@/store/brokerStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'
import { formatUptime } from '@/lib/utils'

interface Settings {
  max_messages_stored: string
  ws_ping_interval: string
  ws_ping_timeout: string
  max_connections_per_user: string
  max_payload_size_kb: string
  rate_limit_messages_per_second: string
  ip_blacklist: string
  ip_whitelist: string
  ip_whitelist_enabled: string
}

export default function SettingsPage() {
  const { isAdmin } = useAuthStore()
  const { stats } = useBrokerStore()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [form, setForm] = useState<Partial<Settings>>({})
  const [saving, setSaving] = useState(false)
  const [serverInfo, setServerInfo] = useState<{ db_size_mb: number; broker_version: string } | null>(null)

  const fetchSettings = async () => {
    try {
      const [sRes, statsRes] = await Promise.all([api.get('/settings'), api.get('/stats')])
      setSettings(sRes.data)
      setForm(sRes.data)
      setServerInfo({ db_size_mb: statsRes.data.db_size_mb, broker_version: statsRes.data.broker_version })
    } catch {}
  }

  useEffect(() => { fetchSettings() }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, unknown> = { ...form }
      if (typeof form.ip_blacklist === 'string') {
        payload.ip_blacklist = form.ip_blacklist.split('\n').map(s => s.trim()).filter(Boolean)
      }
      if (typeof form.ip_whitelist === 'string') {
        payload.ip_whitelist = form.ip_whitelist.split('\n').map(s => s.trim()).filter(Boolean)
      }
      await api.patch('/settings', payload)
      toast({ title: 'Ayarlar kaydedildi' })
      fetchSettings()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleClearMessages = async () => {
    try {
      await api.delete('/messages')
      toast({ title: 'Tüm mesajlar silindi' })
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleKickAll = async () => {
    try {
      const res = await api.delete('/clients')
      toast({ title: `${res.data.kicked} bağlantı kesildi` })
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const parseList = (v: string) => {
    try { return JSON.parse(v).join('\n') } catch { return v }
  }

  if (!settings || !form) return <div className="p-8 text-center text-muted-foreground">Yükleniyor...</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm">Broker ayarları ve yönetim</p>
      </div>

      {/* Broker Info */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Broker Bilgileri</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Versiyon</span><span>{serverInfo?.broker_version || '1.0.0'}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Uptime</span><span>{formatUptime(stats.uptime_seconds)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Port</span><span>8883</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Veritabanı Boyutu</span><span>{serverInfo?.db_size_mb} MB</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Aktif Bağlantılar</span><span>{stats.active_clients}</span></div>
        </CardContent>
      </Card>

      {/* Broker Settings */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Broker Ayarları</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Maks. Mesaj Saklama</Label>
              <Input type="number" value={form.max_messages_stored || ''} onChange={e => setForm(f => ({ ...f, max_messages_stored: e.target.value }))} disabled={!isAdmin()} />
            </div>
            <div className="space-y-2">
              <Label>Ping Interval (ms)</Label>
              <Input type="number" value={form.ws_ping_interval || ''} onChange={e => setForm(f => ({ ...f, ws_ping_interval: e.target.value }))} disabled={!isAdmin()} />
            </div>
            <div className="space-y-2">
              <Label>Ping Timeout (ms)</Label>
              <Input type="number" value={form.ws_ping_timeout || ''} onChange={e => setForm(f => ({ ...f, ws_ping_timeout: e.target.value }))} disabled={!isAdmin()} />
            </div>
            <div className="space-y-2">
              <Label>Maks. Bağlantı / Kullanıcı</Label>
              <Input type="number" value={form.max_connections_per_user || ''} onChange={e => setForm(f => ({ ...f, max_connections_per_user: e.target.value }))} disabled={!isAdmin()} />
            </div>
            <div className="space-y-2">
              <Label>Maks. Payload Boyutu (KB)</Label>
              <Input type="number" value={form.max_payload_size_kb || ''} onChange={e => setForm(f => ({ ...f, max_payload_size_kb: e.target.value }))} disabled={!isAdmin()} />
            </div>
            <div className="space-y-2">
              <Label>Rate Limit (msg/sn/kullanıcı)</Label>
              <Input type="number" value={form.rate_limit_messages_per_second || ''} onChange={e => setForm(f => ({ ...f, rate_limit_messages_per_second: e.target.value }))} disabled={!isAdmin()} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IP Settings */}
      <Card>
        <CardHeader><CardTitle className="text-sm">IP Kısıtlamaları</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>IP Blacklist (satır başına bir IP)</Label>
            <Textarea
              value={parseList(form.ip_blacklist || '[]')}
              onChange={e => setForm(f => ({ ...f, ip_blacklist: e.target.value }))}
              placeholder="1.2.3.4"
              rows={4}
              disabled={!isAdmin()}
              className="font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.ip_whitelist_enabled === 'true'}
              onCheckedChange={v => setForm(f => ({ ...f, ip_whitelist_enabled: v ? 'true' : 'false' }))}
              disabled={!isAdmin()}
            />
            <Label>IP Whitelist Aktif</Label>
          </div>
          {form.ip_whitelist_enabled === 'true' && (
            <div className="space-y-2">
              <Label>IP Whitelist (CIDR destekli)</Label>
              <Textarea
                value={parseList(form.ip_whitelist || '[]')}
                onChange={e => setForm(f => ({ ...f, ip_whitelist: e.target.value }))}
                placeholder="192.168.1.0/24"
                rows={4}
                disabled={!isAdmin()}
                className="font-mono text-sm"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin() && (
        <Button onClick={handleSave} disabled={saving} className="w-full">
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
        </Button>
      )}

      {/* Danger Zone */}
      {isAdmin() && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-sm text-destructive flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />Tehlikeli Bölge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Tüm Mesajları Sil</p>
                <p className="text-xs text-muted-foreground">Veritabanındaki tüm mesaj geçmişi silinir</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" />Sil</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tüm mesajları sil?</AlertDialogTitle>
                    <AlertDialogDescription>Bu işlem geri alınamaz. Tüm mesaj geçmişi silinecek.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>İptal</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearMessages}>Evet, Sil</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Tüm Bağlantıları Kes</p>
                <p className="text-xs text-muted-foreground">Bağlı tüm clientlar koparılır</p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><WifiOff className="h-4 w-4 mr-1" />Kes</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tüm bağlantıları kes?</AlertDialogTitle>
                    <AlertDialogDescription>Tüm aktif WebSocket bağlantıları sonlandırılacak.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>İptal</AlertDialogCancel>
                    <AlertDialogAction onClick={handleKickAll}>Evet, Kes</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
