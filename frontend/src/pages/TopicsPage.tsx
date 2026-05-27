import { useEffect, useState } from 'react'
import { Pin, Trash2, Send, Users, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'

interface TopicStat {
  topic: string
  subscribers: number
  retained: boolean
  last_message_at: string
  message_count: number
  messages_per_minute: number
}

export default function TopicsPage() {
  const { isAdmin } = useAuthStore()
  const [topics, setTopics] = useState<TopicStat[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Array<{ time: string; count: number }>>([])
  const [publishPayload, setPublishPayload] = useState('')
  const [retain, setRetain] = useState(false)
  const [publishing, setPublishing] = useState(false)

  const fetchTopics = async () => {
    try {
      const res = await api.get('/topics')
      setTopics(res.data.topics)
    } catch {}
  }

  const fetchMetrics = async (topic: string) => {
    try {
      const res = await api.get(`/topics/${encodeURIComponent(topic)}/metrics?period=1h`)
      setMetrics(res.data.data.map((d: { time: string; count: string }) => ({
        time: new Date(d.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        count: parseInt(d.count),
      })))
    } catch {}
  }

  useEffect(() => {
    fetchTopics()
  }, [])

  useEffect(() => {
    if (selected) fetchMetrics(selected)
  }, [selected])

  const handleDeleteRetain = async (topic: string) => {
    try {
      await api.delete(`/topics/${encodeURIComponent(topic)}/retain`)
      toast({ title: 'Retain mesajı silindi' })
      fetchTopics()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  const handlePublish = async () => {
    if (!selected || !publishPayload) return
    setPublishing(true)
    try {
      const res = await api.post('/messages/publish', { topic: selected, payload: publishPayload, retain })
      toast({ title: `${res.data.delivered_to} client'a iletildi` })
      setPublishPayload('')
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    } finally {
      setPublishing(false)
    }
  }

  const selectedTopic = topics.find(t => t.topic === selected)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Topics</h1>
          <p className="text-muted-foreground text-sm">{topics.length} aktif topic</p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchTopics}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Topic list */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-0">
              <div className="overflow-y-auto max-h-[600px]">
                {topics.length === 0 ? (
                  <p className="p-6 text-center text-muted-foreground text-sm">Aktif topic yok</p>
                ) : (
                  topics.map(t => (
                    <button
                      key={t.topic}
                      className={`w-full text-left p-3 border-b hover:bg-accent transition-colors ${selected === t.topic ? 'bg-accent' : ''}`}
                      onClick={() => setSelected(t.topic)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono text-xs font-medium truncate flex-1">{t.topic}</span>
                        {t.retained && <Pin className="h-3 w-3 text-orange-500 flex-shrink-0 ml-1" />}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{t.subscribers}</span>
                        <span>{t.message_count} msg</span>
                        {t.last_message_at && <TimeAgo date={t.last_message_at} />}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Topic detail */}
        <div className="lg:col-span-2 space-y-4">
          {selectedTopic ? (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-mono">{selectedTopic.topic}</CardTitle>
                    <div className="flex gap-2">
                      {selectedTopic.retained && isAdmin() && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-orange-500">
                              <Trash2 className="h-4 w-4 mr-1" />Retain Sil
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Retain mesajı sil?</AlertDialogTitle>
                              <AlertDialogDescription>Bu topic'in retain mesajı silinecek.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>İptal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDeleteRetain(selectedTopic.topic)}>Sil</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                    <div><p className="text-muted-foreground text-xs">Aboneler</p><p className="font-bold">{selectedTopic.subscribers}</p></div>
                    <div><p className="text-muted-foreground text-xs">Mesajlar</p><p className="font-bold">{selectedTopic.message_count}</p></div>
                    <div><p className="text-muted-foreground text-xs">Msg/dk</p><p className="font-bold">{selectedTopic.messages_per_minute.toFixed(1)}</p></div>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={metrics}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Mesaj Gönder</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Textarea
                    placeholder="Payload..."
                    value={publishPayload}
                    onChange={e => setPublishPayload(e.target.value)}
                    rows={3}
                    disabled={!isAdmin()}
                  />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch id="retain" checked={retain} onCheckedChange={setRetain} disabled={!isAdmin()} />
                      <Label htmlFor="retain" className="text-sm">Retain</Label>
                    </div>
                    <Button size="sm" onClick={handlePublish} disabled={!publishPayload || publishing || !isAdmin()}>
                      <Send className="h-4 w-4 mr-2" />
                      {publishing ? 'Gönderiliyor...' : 'Gönder'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Detay görmek için bir topic seçin
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
