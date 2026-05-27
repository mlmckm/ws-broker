import { useEffect, useState } from 'react'
import { Send, Download, Trash2, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { JsonViewer } from '@/components/shared/JsonViewer'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'
import { downloadCsv, formatBytes } from '@/lib/utils'

interface Message {
  id: number
  topic: string
  payload: string
  payload_type: string
  payload_size: number
  sender_username: string
  sender_client_id: string
  created_at: string
}

const PAGE_SIZE = 50

export default function MessagesPage() {
  const { isAdmin } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Message | null>(null)
  const [showPublish, setShowPublish] = useState(false)
  const [publishTopic, setPublishTopic] = useState('')
  const [publishPayload, setPublishPayload] = useState('')
  const [publishRetain, setPublishRetain] = useState(false)
  const [filters, setFilters] = useState({ topic: '', sender: '', payload_type: '', from: '', to: '' })

  const fetchMessages = async (p = 0) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(p * PAGE_SIZE),
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      })
      const res = await api.get(`/messages?${params}`)
      setMessages(res.data.messages)
      setTotal(res.data.total)
      setPage(p)
    } catch {} finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMessages(0) }, [])

  const handlePublish = async () => {
    try {
      const res = await api.post('/messages/publish', { topic: publishTopic, payload: publishPayload, retain: publishRetain })
      toast({ title: `${res.data.delivered_to} client'a iletildi` })
      setShowPublish(false)
      setPublishTopic('')
      setPublishPayload('')
      fetchMessages(0)
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleClear = async (topic?: string) => {
    try {
      await api.delete(topic ? `/messages?topic=${encodeURIComponent(topic)}` : '/messages')
      toast({ title: 'Mesajlar silindi' })
      fetchMessages(0)
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handleExport = () => {
    downloadCsv(messages.map(m => ({
      id: m.id, topic: m.topic, payload: m.payload, payload_type: m.payload_type,
      size: m.payload_size, sender: m.sender_username, created_at: m.created_at,
    })), 'messages.csv')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Messages</h1>
          <p className="text-muted-foreground text-sm">{total.toLocaleString('tr-TR')} mesaj</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />CSV</Button>
          {isAdmin() && (
            <>
              <Button size="sm" onClick={() => setShowPublish(true)}>
                <Send className="h-4 w-4 mr-1" />Gönder
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm"><Trash2 className="h-4 w-4 mr-1" />Temizle</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tüm mesajları sil?</AlertDialogTitle>
                    <AlertDialogDescription>Bu işlem geri alınamaz.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>İptal</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleClear()}>Sil</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Topic" value={filters.topic} onChange={e => setFilters(f => ({ ...f, topic: e.target.value }))} className="w-48" />
        <Input placeholder="Gönderen" value={filters.sender} onChange={e => setFilters(f => ({ ...f, sender: e.target.value }))} className="w-36" />
        <Select value={filters.payload_type || 'all'} onValueChange={v => setFilters(f => ({ ...f, payload_type: v === 'all' ? '' : v }))}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Tip" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
            <SelectItem value="string">String</SelectItem>
          </SelectContent>
        </Select>
        <Input type="datetime-local" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="w-48" />
        <Input type="datetime-local" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="w-48" />
        <Button size="sm" onClick={() => fetchMessages(0)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />Ara
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-3 text-left font-medium">Zaman</th>
                  <th className="p-3 text-left font-medium">Topic</th>
                  <th className="p-3 text-left font-medium hidden md:table-cell">Gönderen</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">Tip</th>
                  <th className="p-3 text-left font-medium hidden lg:table-cell">Boyut</th>
                  <th className="p-3 text-left font-medium">Payload</th>
                </tr>
              </thead>
              <tbody>
                {messages.map(msg => (
                  <tr key={msg.id} className="border-b hover:bg-accent/30 cursor-pointer" onClick={() => setSelected(msg)}>
                    <td className="p-3 text-muted-foreground whitespace-nowrap">
                      <TimeAgo date={msg.created_at} />
                    </td>
                    <td className="p-3 max-w-[200px]">
                      <span className="font-mono text-xs truncate block">{msg.topic}</span>
                    </td>
                    <td className="p-3 text-muted-foreground hidden md:table-cell">{msg.sender_username}</td>
                    <td className="p-3 hidden lg:table-cell">
                      <Badge variant={msg.payload_type === 'json' ? 'default' : 'secondary'} className="text-xs">
                        {msg.payload_type}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground hidden lg:table-cell">{formatBytes(msg.payload_size || 0)}</td>
                    <td className="p-3 max-w-[300px]">
                      <span className="font-mono text-xs truncate block text-muted-foreground">
                        {msg.payload.slice(0, 80)}{msg.payload.length > 80 ? '…' : ''}
                      </span>
                    </td>
                  </tr>
                ))}
                {messages.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Mesaj bulunamadı</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-center gap-2 p-4 border-t">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => fetchMessages(page - 1)}>Önceki</Button>
            <span className="text-sm text-muted-foreground">Sayfa {page + 1} / {Math.ceil(total / PAGE_SIZE)}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => fetchMessages(page + 1)}>Sonraki</Button>
          </div>
        </CardContent>
      </Card>

      {/* Payload Viewer */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{selected?.topic}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Gönderen: {selected.sender_username}</span>
                <span>Boyut: {formatBytes(selected.payload_size || 0)}</span>
                <span>Tip: {selected.payload_type}</span>
                <span><TimeAgo date={selected.created_at} /></span>
              </div>
              <div className="bg-muted rounded-lg p-4 overflow-auto max-h-96">
                <JsonViewer data={selected.payload} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Publish Dialog */}
      <Dialog open={showPublish} onOpenChange={setShowPublish}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mesaj Gönder</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Topic</Label>
              <Input value={publishTopic} onChange={e => setPublishTopic(e.target.value)} placeholder="ev/salon/sicaklik" />
            </div>
            <div className="space-y-2">
              <Label>Payload</Label>
              <Textarea value={publishPayload} onChange={e => setPublishPayload(e.target.value)} placeholder='{"temp": 23.5}' rows={4} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={publishRetain} onCheckedChange={setPublishRetain} />
              <Label>Retain</Label>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPublish(false)}>İptal</Button>
              <Button onClick={handlePublish} disabled={!publishTopic || !publishPayload}>Gönder</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
