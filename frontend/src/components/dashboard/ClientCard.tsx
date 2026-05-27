import { useNavigate } from 'react-router-dom'
import { Wifi, WifiOff, Trash2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/shared/CopyButton'
import { TimeAgo } from '@/components/shared/TimeAgo'
import type { ActiveClient } from '@/store/brokerStore'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/hooks/useApi'
import { toast } from '@/hooks/use-toast'

interface Props {
  client: ActiveClient
  onKick?: () => void
}

export function ClientCard({ client, onKick }: Props) {
  const { isAdmin } = useAuthStore()
  const navigate = useNavigate()

  const handleKick = async () => {
    try {
      await api.delete(`/clients/${client.client_id}`)
      toast({ title: 'Client bağlantısı kesildi' })
      onKick?.()
    } catch {
      toast({ title: 'Hata', variant: 'destructive' })
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/clients')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="font-medium text-sm">{client.username}</span>
          </div>
          {isAdmin() && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={e => { e.stopPropagation(); handleKick() }}
              title="Bağlantıyı Kes"
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          )}
        </div>
        <div className="flex items-center gap-1 mb-2">
          <span className="text-xs text-muted-foreground font-mono">
            {client.client_id.slice(0, 8)}…
          </span>
          <CopyButton text={client.client_id} className="h-5 w-5" />
        </div>
        <div className="text-xs text-muted-foreground mb-2">{client.ip_address}</div>
        <div className="flex flex-wrap gap-1 mb-2">
          {client.subscriptions.slice(0, 3).map(s => (
            <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
          ))}
          {client.subscriptions.length > 3 && (
            <Badge variant="outline" className="text-xs">+{client.subscriptions.length - 3}</Badge>
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <TimeAgo date={client.connected_at} />
          <span>{client.message_count} msg</span>
        </div>
      </CardContent>
    </Card>
  )
}
