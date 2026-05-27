import { useEffect, useState } from 'react'
import { Users, MessageSquare, Radio, Clock, Webhook } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { StatCard } from '@/components/dashboard/StatCard'
import { LiveMessageFeed } from '@/components/dashboard/LiveMessageFeed'
import { ClientCard } from '@/components/dashboard/ClientCard'
import { TopicTree } from '@/components/dashboard/TopicTree'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useBrokerStore } from '@/store/brokerStore'
import { api } from '@/hooks/useApi'
import { formatUptime } from '@/lib/utils'

type Period = '1h' | '6h' | '24h'

export default function DashboardPage() {
  const { stats, clients, setClients, setStats } = useBrokerStore()
  const [chartData, setChartData] = useState<Array<{ time: string; count: number }>>([])
  const [period, setPeriod] = useState<Period>('1h')

  // Load active clients and stats on mount (in case WS events were missed)
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [clientRes, statsRes] = await Promise.all([
          api.get('/clients'),
          api.get('/stats'),
        ])
        setClients(clientRes.data.clients)
        setStats(statsRes.data)
      } catch {}
    }
    bootstrap()
    const refreshTimer = setInterval(bootstrap, 10000)
    return () => clearInterval(refreshTimer)
  }, [])

  useEffect(() => {
    fetchChart()
    const timer = setInterval(fetchChart, 30000)
    return () => clearInterval(timer)
  }, [period])

  const fetchChart = async () => {
    try {
      const res = await api.get(`/stats/timeseries?period=${period}`)
      setChartData(res.data.data.map((d: { time: string; count: string }) => ({
        time: new Date(d.time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
        count: parseInt(d.count),
      })))
    } catch {}
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Lonca Broker genel görünümü</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Aktif Bağlantılar" value={clients.length} icon={Users} />
        <StatCard title="Bugünkü Mesajlar" value={stats.messages_today.toLocaleString('tr-TR')} icon={MessageSquare} />
        <StatCard title="Aktif Topicler" value={stats.active_topics} icon={Radio} />
        <StatCard title="Uptime" value={formatUptime(stats.uptime_seconds)} icon={Clock} />
        <StatCard
          title="Aktif Webhook"
          value={stats.active_webhooks ?? 0}
          icon={Webhook}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Mesaj / Dakika</CardTitle>
            <div className="flex gap-1">
              {(['1h', '6h', '24h'] as Period[]).map(p => (
                <Button
                  key={p}
                  variant={period === p ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 6, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ height: '500px' }}>
        {/* Clients */}
        <div className="overflow-y-auto space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Bağlı Clientlar ({clients.length})</h3>
          {clients.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8">Aktif bağlantı yok</div>
          ) : (
            clients.map(c => <ClientCard key={c.client_id} client={c} />)
          )}
        </div>

        {/* Live feed */}
        <LiveMessageFeed />

        {/* Topic tree */}
        <TopicTree />
      </div>
    </div>
  )
}
