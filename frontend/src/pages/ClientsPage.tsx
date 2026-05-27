import { useEffect, useState } from 'react'
import { Wifi, WifiOff, Trash2, ChevronRight, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { CopyButton } from '@/components/shared/CopyButton'
import { StatusDot } from '@/components/shared/StatusDot'
import { useBrokerStore } from '@/store/brokerStore'
import type { ActiveClient } from '@/store/brokerStore'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'
import { formatBytes } from '@/lib/utils'

export default function ClientsPage() {
  const { clients, setClients } = useBrokerStore()
  const { isAdmin } = useAuthStore()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<ActiveClient | null>(null)
  const [history, setHistory] = useState<unknown[]>([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [page, setPage] = useState(0)

  // Refresh active clients from API every 5s
  useEffect(() => {
    const refresh = async () => {
      try {
        const res = await api.get('/clients')
        setClients(res.data.clients)
      } catch {}
    }
    refresh()
    const t = setInterval(refresh, 5000)
    return () => clearInterval(t)
  }, [])

  const filtered = clients.filter(c =>
    c.username.toLowerCase().includes(search.toLowerCase()) ||
    c.client_id.toLowerCase().includes(search.toLowerCase()) ||
    c.ip_address?.includes(search)
  )

  const fetchHistory = async (p = 0) => {
    try {
      const res = await api.get(`/clients/history?limit=20&offset=${p * 20}`)
      setHistory(res.data.sessions)
      setHistoryTotal(res.data.total)
      setPage(p)
    } catch {}
  }

  const handleKick = async (clientId: string) => {
    try {
      await api.delete(`/clients/${clientId}`)
      toast({ title: 'Client bağlantısı kesildi' })
      setSelected(null)
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted-foreground text-sm">{clients.length} aktif bağlantı</p>
        </div>
        {isAdmin() && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={clients.length === 0}>
                <Trash2 className="h-4 w-4 mr-2" />
                Tümünü Kes
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tüm bağlantıları kes?</AlertDialogTitle>
                <AlertDialogDescription>Bu işlem {clients.length} aktif bağlantıyı sonlandıracak.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction onClick={handleKickAll}>Evet, Kes</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Aktif ({clients.length})</TabsTrigger>
          <TabsTrigger value="history" onClick={() => fetchHistory(0)}>Geçmiş</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <Input
            placeholder="Kullanıcı adı, client ID veya IP ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm"
          />

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Durum</th>
                      <th className="p-3 text-left font-medium">Client ID</th>
                      <th className="p-3 text-left font-medium">Kullanıcı</th>
                      <th className="p-3 text-left font-medium hidden md:table-cell">IP</th>
                      <th className="p-3 text-left font-medium hidden lg:table-cell">Bağlanma</th>
                      <th className="p-3 text-left font-medium hidden lg:table-cell">Sub</th>
                      <th className="p-3 text-left font-medium hidden xl:table-cell">Mesajlar</th>
                      <th className="p-3 text-left font-medium hidden xl:table-cell">Bytes</th>
                      <th className="p-3 text-left font-medium">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(client => (
                      <tr key={client.client_id} className="border-b hover:bg-accent/30 cursor-pointer" onClick={() => setSelected(client)}>
                        <td className="p-3"><StatusDot status="online" /></td>
                        <td className="p-3 font-mono text-xs">
                          <div className="flex items-center gap-1">
                            {client.client_id.slice(0, 12)}…
                            <CopyButton text={client.client_id} className="h-5 w-5" />
                          </div>
                        </td>
                        <td className="p-3 font-medium">{client.username}</td>
                        <td className="p-3 text-muted-foreground hidden md:table-cell">{client.ip_address}</td>
                        <td className="p-3 text-muted-foreground hidden lg:table-cell"><TimeAgo date={client.connected_at} /></td>
                        <td className="p-3 hidden lg:table-cell">{client.subscriptions.length}</td>
                        <td className="p-3 hidden xl:table-cell">{client.message_count}</td>
                        <td className="p-3 hidden xl:table-cell text-muted-foreground">{formatBytes(client.bytes_sent + client.bytes_received)}</td>
                        <td className="p-3">
                          {isAdmin() && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={e => { e.stopPropagation(); handleKick(client.client_id) }}
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Aktif bağlantı yok</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Toplam: {historyTotal}</p>
            <Button variant="ghost" size="sm" onClick={() => fetchHistory(page)}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="p-3 text-left font-medium">Client ID</th>
                      <th className="p-3 text-left font-medium">Kullanıcı</th>
                      <th className="p-3 text-left font-medium">IP</th>
                      <th className="p-3 text-left font-medium">Bağlanma</th>
                      <th className="p-3 text-left font-medium">Ayrılma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(history as Array<{ id: number; client_id: string; username: string; ip_address: string; connected_at: string; disconnected_at: string }>).map(s => (
                      <tr key={s.id} className="border-b">
                        <td className="p-3 font-mono text-xs">{s.client_id.slice(0, 16)}…</td>
                        <td className="p-3">{s.username}</td>
                        <td className="p-3 text-muted-foreground">{s.ip_address}</td>
                        <td className="p-3 text-muted-foreground"><TimeAgo date={s.connected_at} /></td>
                        <td className="p-3 text-muted-foreground">{s.disconnected_at ? <TimeAgo date={s.disconnected_at} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-center gap-2 p-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => fetchHistory(page - 1)}>Önceki</Button>
                <span className="text-sm text-muted-foreground">Sayfa {page + 1}</span>
                <Button variant="outline" size="sm" disabled={(page + 1) * 20 >= historyTotal} onClick={() => fetchHistory(page + 1)}>Sonraki</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Client Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Client Detayı</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Client ID:</span><br /><code className="text-xs">{selected.client_id}</code></div>
                <div><span className="text-muted-foreground">Kullanıcı:</span><br /><strong>{selected.username}</strong></div>
                <div><span className="text-muted-foreground">IP:</span><br />{selected.ip_address}</div>
                <div><span className="text-muted-foreground">User Agent:</span><br /><span className="text-xs">{selected.user_agent || '—'}</span></div>
                <div><span className="text-muted-foreground">Bağlanma:</span><br /><TimeAgo date={selected.connected_at} /></div>
                <div><span className="text-muted-foreground">Mesajlar:</span><br />{selected.message_count}</div>
                <div><span className="text-muted-foreground">Gönderilen:</span><br />{formatBytes(selected.bytes_sent)}</div>
                <div><span className="text-muted-foreground">Alınan:</span><br />{formatBytes(selected.bytes_received)}</div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Abonelikler ({selected.subscriptions.length})</p>
                <div className="flex flex-wrap gap-2">
                  {selected.subscriptions.map(s => (
                    <Badge key={s} variant="secondary">{s}</Badge>
                  ))}
                  {selected.subscriptions.length === 0 && <span className="text-sm text-muted-foreground">Yok</span>}
                </div>
              </div>

              {isAdmin() && (
                <div className="flex justify-end pt-2">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Bağlantıyı Kes
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Bağlantıyı kes?</AlertDialogTitle>
                        <AlertDialogDescription>{selected.username} kullanıcısının bağlantısı kesilecek.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>İptal</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleKick(selected.client_id)}>Evet, Kes</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
