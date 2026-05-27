import { useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useBrokerStore } from '@/store/brokerStore'
import { useWsStore } from '@/store/wsStore'
import { WS_URL } from '@/lib/constants'
import { toast } from './use-toast'
import { v4 as uuidv4 } from 'uuid'

let wsInstance: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 1000
const MAX_DELAY = 30000

export function useWebSocket() {
  const { token, username, wsPassword, clearAuth } = useAuthStore()
  const { addClient, removeClient, addLiveMessage, setStats, updateTopicFromMessage } = useBrokerStore()
  const { setStatus } = useWsStore()
  const connectedRef = useRef(false)

  const connect = useCallback(() => {
    if (!token || !username || !wsPassword) return
    if (wsInstance && wsInstance.readyState === WebSocket.OPEN) return

    setStatus('connecting')
    // type=dashboard → broker client listesinde gösterme, keepalive=0 → ping/pong yok
    const wsUrl = `${WS_URL}?username=${encodeURIComponent(username)}&password=${encodeURIComponent(wsPassword)}&type=dashboard&keepalive=0`
    const ws = new WebSocket(wsUrl)
    // wsUrl'i message handler'dan erişilebilir yap
    ;(ws as WebSocket & { _wsUrl?: string })._wsUrl = wsUrl
    wsInstance = ws

    ws.onopen = () => {
      connectedRef.current = true
    }

    ws.onmessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data as string)
        handleMessage(msg, ws)
      } catch (err) {
        console.error('WS parse error', err)
      }
    }

    ws.onclose = () => {
      connectedRef.current = false
      setStatus('disconnected')

      if (reconnectDelay < MAX_DELAY) {
        toast({ title: 'Bağlantı koptu', description: `${reconnectDelay / 1000}s sonra yeniden bağlanılıyor...`, variant: 'destructive' })
      }

      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY)
        connect()
      }, reconnectDelay)
    }

    ws.onerror = () => {
      setStatus('error')
    }
  }, [token, username])

  const handleMessage = (msg: Record<string, unknown>, ws: WebSocket) => {
    switch (msg.type) {
      case 'hello':
        // Query param auth kullanıyoruz — hello'ya auth mesajı göndermeye gerek yok
        break

      case 'auth_ok':
        reconnectDelay = 1000
        setStatus('connected')
        ws.send(JSON.stringify({ type: 'subscribe', topic: '$SYS/#' }))
        toast({ title: 'Bağlantı kuruldu', description: 'WebSocket broker\'a bağlanıldı' })
        break

      case 'auth_error':
        setStatus('error')
        clearAuth()
        break

      case 'message': {
        const topic = msg.topic as string
        const payload = msg.payload as string

        if (topic === '$SYS/clients/connected') {
          try { addClient(JSON.parse(payload)) } catch {}
        } else if (topic === '$SYS/clients/disconnected') {
          try { const d = JSON.parse(payload); removeClient(d.client_id) } catch {}
        } else if (topic === '$SYS/stats') {
          try { setStats(JSON.parse(payload)) } catch {}
        } else if (topic === '$SYS/messages/new') {
          try {
            const d = JSON.parse(payload)
            addLiveMessage({
              id: uuidv4(),
              topic: d.topic,
              payload: d.payload,
              payload_type: typeof d.payload === 'object' ? 'json' : 'string',
              payload_size: d.size || 0,
              sender_username: d.sender,
              sender_client_id: null,
              timestamp: new Date().toISOString(),
            })
            updateTopicFromMessage(d.topic)
          } catch {}
        }
        break
      }

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }))
        break

      case 'server_shutdown':
        setStatus('disconnected')
        toast({ title: 'Sunucu kapanıyor', description: 'Broker yeniden başlatılıyor...', variant: 'destructive' })
        break
    }
  }

  useEffect(() => {
    if (token && wsPassword) {
      connect()
    }
    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer)
      wsInstance?.close()
      wsInstance = null
    }
  }, [token, wsPassword])

  const sendMessage = useCallback((msg: object) => {
    if (wsInstance?.readyState === WebSocket.OPEN) {
      wsInstance.send(JSON.stringify(msg))
    }
  }, [])

  return { sendMessage, wsInstance }
}

// Special WS instance for API Test page
export function createTestWsConnection(url: string, username: string, password: string, onMessage: (msg: unknown) => void, onStatusChange: (s: string) => void) {
  const ws = new WebSocket(url)

  ws.onopen = () => onStatusChange('connecting')
  ws.onclose = () => onStatusChange('disconnected')
  ws.onerror = () => onStatusChange('error')
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      onMessage(msg)
      if (msg.type === 'hello') {
        ws.send(JSON.stringify({ type: 'auth', username, password }))
      }
      if (msg.type === 'auth_ok') {
        onStatusChange('connected')
      }
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }))
      }
    } catch {}
  }
  return ws
}
