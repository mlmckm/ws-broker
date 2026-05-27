import { create } from 'zustand'

export interface ActiveClient {
  client_id: string
  username: string
  role: string
  connected_at: string
  ip_address: string
  user_agent: string
  subscriptions: string[]
  message_count: number
  bytes_sent: number
  bytes_received: number
}

export interface LiveMessage {
  id: string
  topic: string
  payload: string
  payload_type: string
  payload_size: number
  sender_username: string
  sender_client_id: string | null
  timestamp: string
}

export interface TopicInfo {
  topic: string
  subscribers: number
  retained: boolean
  last_message_at?: string
  message_count?: number
  messages_per_minute?: number
}

export interface BrokerStats {
  active_clients: number
  messages_today: number
  total_messages: number
  active_topics: number
  uptime_seconds: number
  active_webhooks?: number
  alarms: string[]
}

interface BrokerState {
  clients: ActiveClient[]
  liveMessages: LiveMessage[]
  topics: TopicInfo[]
  stats: BrokerStats
  paused: boolean
  setClients: (clients: ActiveClient[]) => void
  addClient: (client: Partial<ActiveClient>) => void
  removeClient: (clientId: string) => void
  addLiveMessage: (msg: LiveMessage) => void
  setTopics: (topics: TopicInfo[]) => void
  updateTopicFromMessage: (topic: string) => void
  setStats: (stats: Partial<BrokerStats>) => void
  setPaused: (paused: boolean) => void
  clearLiveMessages: () => void
}

export const useBrokerStore = create<BrokerState>((set, get) => ({
  clients: [],
  liveMessages: [],
  topics: [],
  stats: {
    active_clients: 0,
    messages_today: 0,
    total_messages: 0,
    active_topics: 0,
    uptime_seconds: 0,
    alarms: [],
  },
  paused: false,

  setClients: (clients) => set({ clients }),
  addClient: (clientData) => set(state => ({
    clients: state.clients.some(c => c.client_id === clientData.client_id)
      ? state.clients
      : [...state.clients, clientData as ActiveClient],
  })),
  removeClient: (clientId) => set(state => ({
    clients: state.clients.filter(c => c.client_id !== clientId),
  })),
  addLiveMessage: (msg) => {
    if (get().paused) return
    set(state => ({
      liveMessages: [msg, ...state.liveMessages].slice(0, 200),
    }))
  },
  setTopics: (topics) => set({ topics }),
  updateTopicFromMessage: (topic) => set(state => ({
    topics: state.topics.some(t => t.topic === topic)
      ? state.topics.map(t => t.topic === topic ? { ...t, last_message_at: new Date().toISOString() } : t)
      : [...state.topics, { topic, subscribers: 0, retained: false, last_message_at: new Date().toISOString() }],
  })),
  setStats: (stats) => set(state => ({ stats: { ...state.stats, ...stats } })),
  setPaused: (paused) => set({ paused }),
  clearLiveMessages: () => set({ liveMessages: [] }),
}))
