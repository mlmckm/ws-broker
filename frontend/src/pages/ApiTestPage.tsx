import { useState, useRef, useEffect } from 'react'
import { Send, Copy, Plug, PlugZap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { WS_URL } from '@/lib/constants'
import { toast } from '@/hooks/use-toast'

export default function ApiTestPage() {
  const { username, token } = useAuthStore()

  // Publish tester
  const [pubTopic, setPubTopic] = useState('')
  const [pubPayload, setPubPayload] = useState('')
  const [pubRetain, setPubRetain] = useState(false)
  const [pubResult, setPubResult] = useState<string>('')

  // WS tester
  const wsRef = useRef<WebSocket | null>(null)
  const [wsStatus, setWsStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [wsUsername, setWsUsername] = useState(username || '')
  const [wsPassword, setWsPassword] = useState('')
  const [wsMessages, setWsMessages] = useState<Array<{ dir: 'in' | 'out'; data: string; time: string }>>([])
  const [wsInput, setWsInput] = useState('')
  const [wsTopic, setWsTopic] = useState('')

  // HTTP Explorer
  const [httpMethod, setHttpMethod] = useState('GET')
  const [httpPath, setHttpPath] = useState('/api/stats')
  const [httpBody, setHttpBody] = useState('')
  const [httpResponse, setHttpResponse] = useState<{ status: number; data: unknown } | null>(null)
  const [httpLoading, setHttpLoading] = useState(false)

  const handlePublish = async () => {
    try {
      const res = await api.post('/messages/publish', { topic: pubTopic, payload: pubPayload, retain: pubRetain })
      setPubResult(`✓ Başarılı — ${res.data.delivered_to} client'a iletildi`)
    } catch {
      setPubResult('✗ Hata')
    }
  }

  const connectWs = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    setWsStatus('connecting')
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const time = new Date().toLocaleTimeString('tr-TR')
      setWsMessages(m => [...m.slice(-100), { dir: 'in', data: e.data, time }])
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'hello') {
          ws.send(JSON.stringify({ type: 'auth', username: wsUsername, password: wsPassword }))
          setWsMessages(m => [...m, { dir: 'out', data: JSON.stringify({ type: 'auth', username: wsUsername, password: '***' }), time }])
        }
        if (msg.type === 'auth_ok') setWsStatus('connected')
        if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }))
      } catch {}
    }
    ws.onclose = () => setWsStatus('disconnected')
    ws.onerror = () => setWsStatus('disconnected')
  }

  const disconnectWs = () => {
    wsRef.current?.close()
    wsRef.current = null
    setWsStatus('disconnected')
  }

  const wsSend = (data: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(data)
    setWsMessages(m => [...m, { dir: 'out', data, time: new Date().toLocaleTimeString('tr-TR') }])
    setWsInput('')
  }

  const wsSubscribe = () => {
    if (!wsTopic) return
    wsSend(JSON.stringify({ type: 'subscribe', topic: wsTopic }))
  }

  const handleHttp = async () => {
    setHttpLoading(true)
    try {
      let body = undefined
      if (httpBody) try { body = JSON.parse(httpBody) } catch { body = httpBody }
      const res = await api.request({ method: httpMethod, url: httpPath.replace('/api', ''), data: body })
      setHttpResponse({ status: res.status, data: res.data })
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: unknown } }
      setHttpResponse({ status: e.response?.status || 0, data: e.response?.data || 'Hata' })
    } finally {
      setHttpLoading(false)
    }
  }

  const curlCommand = `curl -X ${httpMethod} \\
  '${window.location.origin}${httpPath}' \\
  -H 'Authorization: Bearer ${token}' \\
  -H 'Content-Type: application/json'${httpBody ? ` \\\n  -d '${httpBody}'` : ''}`

  useEffect(() => () => { wsRef.current?.close() }, [])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">API Test</h1>
        <p className="text-muted-foreground text-sm">Broker API'sini test edin</p>
      </div>

      <Tabs defaultValue="publish">
        <TabsList>
          <TabsTrigger value="publish">Publish Test</TabsTrigger>
          <TabsTrigger value="ws">WS Tester</TabsTrigger>
          <TabsTrigger value="http">HTTP Explorer</TabsTrigger>
        </TabsList>

        <TabsContent value="publish">
          <Card>
            <CardHeader><CardTitle className="text-sm">Mesaj Yayınla</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2"><Label>Topic</Label><Input value={pubTopic} onChange={e => setPubTopic(e.target.value)} placeholder="ev/salon/sicaklik" /></div>
              <div className="space-y-2"><Label>Payload</Label><Textarea value={pubPayload} onChange={e => setPubPayload(e.target.value)} placeholder='{"temp": 23.5}' rows={4} /></div>
              <div className="flex items-center gap-2"><Switch checked={pubRetain} onCheckedChange={setPubRetain} /><Label>Retain</Label></div>
              <Button onClick={handlePublish} disabled={!pubTopic || !pubPayload}><Send className="h-4 w-4 mr-2" />Gönder</Button>
              {pubResult && <p className="text-sm font-mono bg-muted p-3 rounded">{pubResult}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ws">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">WebSocket Tester</CardTitle>
                <Badge variant={wsStatus === 'connected' ? 'success' : wsStatus === 'connecting' ? 'warning' : 'secondary'}>
                  {wsStatus}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {wsStatus === 'disconnected' && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Kullanıcı Adı</Label><Input value={wsUsername} onChange={e => setWsUsername(e.target.value)} /></div>
                  <div className="space-y-2"><Label>Şifre</Label><Input type="password" value={wsPassword} onChange={e => setWsPassword(e.target.value)} /></div>
                  <Button className="col-span-2" onClick={connectWs}><PlugZap className="h-4 w-4 mr-2" />Bağlan</Button>
                </div>
              )}
              {wsStatus !== 'disconnected' && (
                <Button variant="outline" onClick={disconnectWs}><Plug className="h-4 w-4 mr-2" />Bağlantıyı Kes</Button>
              )}

              {wsStatus === 'connected' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input value={wsTopic} onChange={e => setWsTopic(e.target.value)} placeholder="ev/salon/+" className="flex-1" />
                    <Button onClick={wsSubscribe} size="sm">Subscribe</Button>
                  </div>
                  <div className="flex gap-2">
                    <Input value={wsInput} onChange={e => setWsInput(e.target.value)} placeholder='{"type":"ping"}' className="flex-1" onKeyDown={e => e.key === 'Enter' && wsSend(wsInput)} />
                    <Button onClick={() => wsSend(wsInput)} size="sm">Gönder</Button>
                  </div>
                </div>
              )}

              <ScrollArea className="h-64 border rounded bg-muted/30 p-3">
                <div className="space-y-1 font-mono text-xs">
                  {wsMessages.map((m, i) => (
                    <div key={i} className={m.dir === 'in' ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}>
                      <span className="text-muted-foreground">{m.time} </span>
                      <span>{m.dir === 'in' ? '← ' : '→ '}</span>
                      {m.data.slice(0, 200)}
                    </div>
                  ))}
                  {wsMessages.length === 0 && <p className="text-muted-foreground">Mesaj yok</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="http">
          <Card>
            <CardHeader><CardTitle className="text-sm">HTTP API Explorer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <select value={httpMethod} onChange={e => setHttpMethod(e.target.value)} className="border rounded px-3 py-2 text-sm bg-background">
                  <option>GET</option><option>POST</option><option>PUT</option><option>PATCH</option><option>DELETE</option>
                </select>
                <Input value={httpPath} onChange={e => setHttpPath(e.target.value)} placeholder="/api/stats" className="flex-1" />
              </div>
              {['POST', 'PUT', 'PATCH'].includes(httpMethod) && (
                <div className="space-y-2">
                  <Label>Request Body (JSON)</Label>
                  <Textarea value={httpBody} onChange={e => setHttpBody(e.target.value)} placeholder='{}' rows={4} className="font-mono text-xs" />
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleHttp} disabled={httpLoading}>{httpLoading ? 'İstek atılıyor...' : 'İstek At'}</Button>
                <Button variant="ghost" onClick={() => { navigator.clipboard.writeText(curlCommand); toast({ title: 'cURL kopyalandı' }) }}>
                  <Copy className="h-4 w-4 mr-1" />cURL
                </Button>
              </div>

              {httpResponse && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={httpResponse.status < 300 ? 'success' : 'destructive'}>HTTP {httpResponse.status}</Badge>
                  </div>
                  <div className="bg-muted rounded-lg p-4 overflow-auto max-h-64 font-mono text-xs">
                    <pre>{JSON.stringify(httpResponse.data, null, 2)}</pre>
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded font-mono">
                <pre className="whitespace-pre-wrap">{curlCommand}</pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
