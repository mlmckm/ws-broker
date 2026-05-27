import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, Radio, MessageSquare, Shield, Webhook,
  ClipboardList, FlaskConical, Settings, BookOpen, X, Network,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/clients', icon: Network, label: 'Clients' },
  { to: '/topics', icon: Radio, label: 'Topics' },
  { to: '/messages', icon: MessageSquare, label: 'Messages' },
  { to: '/acl', icon: Shield, label: 'ACL' },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/audit', icon: ClipboardList, label: 'Audit Log' },
  { to: '/api-test', icon: FlaskConical, label: 'API Test' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/docs', icon: BookOpen, label: 'Docs' },
]

interface Props {
  collapsed: boolean
  onClose?: () => void
}

export function Sidebar({ collapsed, onClose }: Props) {
  const { role } = useAuthStore()

  const visibleItems = navItems.filter(item => {
    if (item.to === '/users' || item.to === '/audit') return role === 'admin' || role === 'viewer'
    return true
  })

  return (
    <aside className={cn(
      'flex flex-col bg-card border-r border-border transition-all duration-300',
      collapsed ? 'w-16' : 'w-56'
    )}>
      <div className="flex items-center justify-between p-4 border-b border-border">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">WS Broker</span>
          </div>
        )}
        {collapsed && <Radio className="h-5 w-5 text-primary mx-auto" />}
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} className="lg:hidden">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
