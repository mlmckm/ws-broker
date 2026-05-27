import { Menu, Moon, Sun, LogOut, Radio } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusDot } from '@/components/shared/StatusDot'
import { useAuthStore } from '@/store/authStore'
import { useWsStore } from '@/store/wsStore'
import { useBrokerStore } from '@/store/brokerStore'
import { useTheme } from '@/hooks/useTheme'
import { api } from '@/hooks/useApi'

interface Props {
  onMenuToggle: () => void
}

export function TopBar({ onMenuToggle }: Props) {
  const { username, role, clearAuth } = useAuthStore()
  const { status } = useWsStore()
  const { stats } = useBrokerStore()
  const { theme, toggle } = useTheme()

  const wsStatusMap = {
    connected: 'online' as const,
    connecting: 'connecting' as const,
    disconnected: 'offline' as const,
    error: 'error' as const,
  }

  const wsLabels = {
    connected: 'Bağlı',
    connecting: 'Bağlanıyor...',
    disconnected: 'Bağlı Değil',
    error: 'Hata',
  }

  const handleLogout = async () => {
    try { await api.post('/auth/logout') } catch {}
    clearAuth()
    window.location.href = '/login'
  }

  return (
    <header className="h-14 border-b border-border bg-card px-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onMenuToggle}>
          <Menu className="h-4 w-4" />
        </Button>

        {stats.alarms && stats.alarms.length > 0 && (
          <div className="flex items-center gap-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1 rounded-full text-xs font-medium">
            <Radio className="h-3 w-3 animate-pulse" />
            {stats.alarms[0]}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <StatusDot status={wsStatusMap[status]} />
          <span className="text-muted-foreground hidden sm:block">{wsLabels[status]}</span>
        </div>

        <Badge variant="outline" className="hidden sm:flex text-xs">
          {username} · {role}
        </Badge>

        <Button variant="ghost" size="icon" onClick={toggle}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <Button variant="ghost" size="icon" onClick={handleLogout} title="Çıkış Yap">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
