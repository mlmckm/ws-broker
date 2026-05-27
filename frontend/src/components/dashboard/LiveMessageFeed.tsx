import { useState } from 'react'
import { Pause, Play, Trash2, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useBrokerStore } from '@/store/brokerStore'
import type { LiveMessage } from '@/store/brokerStore'
import { JsonViewer } from '@/components/shared/JsonViewer'
import { TimeAgo } from '@/components/shared/TimeAgo'
import { cn } from '@/lib/utils'

const TOPIC_COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
]

const topicColorMap = new Map<string, string>()
let colorIdx = 0

function getTopicColor(topic: string) {
  if (!topicColorMap.has(topic)) {
    topicColorMap.set(topic, TOPIC_COLORS[colorIdx % TOPIC_COLORS.length])
    colorIdx++
  }
  return topicColorMap.get(topic)!
}

function MessageRow({ msg }: { msg: LiveMessage }) {
  const [expanded, setExpanded] = useState(false)
  const isJson = msg.payload_type === 'json' || (() => { try { JSON.parse(msg.payload); return true } catch { return false } })()

  return (
    <div className="border-b border-border py-2 px-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-start gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5 w-16 flex-shrink-0">
          <TimeAgo date={msg.timestamp} />
        </span>
        <Badge className={cn('text-xs flex-shrink-0', getTopicColor(msg.topic))} style={{ border: 'none' }}>
          {msg.topic.length > 30 ? msg.topic.slice(0, 30) + '…' : msg.topic}
        </Badge>
        <span className="text-xs text-muted-foreground flex-shrink-0">{msg.sender_username}</span>
      </div>
      <div className="mt-1 ml-[74px]">
        {isJson ? (
          <button onClick={() => setExpanded(e => !e)} className="text-left w-full">
            {!expanded ? (
              <span className="text-xs font-mono text-muted-foreground truncate block">
                {msg.payload.slice(0, 100)}{msg.payload.length > 100 ? '…' : ''}
              </span>
            ) : (
              <JsonViewer data={msg.payload} />
            )}
          </button>
        ) : (
          <span className="text-xs font-mono">{msg.payload.slice(0, 150)}{msg.payload.length > 150 ? '…' : ''}</span>
        )}
      </div>
    </div>
  )
}

export function LiveMessageFeed() {
  const { liveMessages, paused, setPaused, clearLiveMessages } = useBrokerStore()
  const [topicFilter, setTopicFilter] = useState('')

  const topics = Array.from(new Set(liveMessages.map(m => m.topic)))
  const filtered = topicFilter ? liveMessages.filter(m => m.topic === topicFilter) : liveMessages

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Canlı Mesaj Akışı</CardTitle>
          <div className="flex items-center gap-1">
            {topics.length > 0 && (
              <select
                value={topicFilter}
                onChange={e => setTopicFilter(e.target.value)}
                className="text-xs border border-input rounded px-2 py-1 bg-background"
              >
                <option value="">Tüm Topicler</option>
                {topics.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPaused(!paused)}>
              {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearLiveMessages}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {paused && (
          <div className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
            <Filter className="h-3 w-3" /> Durduruldu
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Henüz mesaj yok
            </div>
          ) : (
            filtered.map(msg => <MessageRow key={msg.id} msg={msg} />)
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}
