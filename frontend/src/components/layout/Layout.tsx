import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useWebSocket } from '@/hooks/useWebSocket'

export function Layout() {
  useWebSocket()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile sidebar overlay */}
      {mobileSidebar && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileSidebar(false)} />
          <div className="relative z-50 h-full">
            <Sidebar collapsed={false} onClose={() => setMobileSidebar(false)} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar collapsed={collapsed} />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <TopBar onMenuToggle={() => {
          if (window.innerWidth < 1024) setMobileSidebar(v => !v)
          else setCollapsed(v => !v)
        }} />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
