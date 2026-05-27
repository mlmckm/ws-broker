import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { Toaster } from '@/components/ui/toaster'
import { useAuthStore } from '@/store/authStore'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ClientsPage from '@/pages/ClientsPage'
import TopicsPage from '@/pages/TopicsPage'
import MessagesPage from '@/pages/MessagesPage'
import AclPage from '@/pages/AclPage'
import WebhooksPage from '@/pages/WebhooksPage'
import WebhookEditPage from '@/pages/WebhookEditPage'
import UsersPage from '@/pages/UsersPage'
import AuditLogPage from '@/pages/AuditLogPage'
import ApiTestPage from '@/pages/ApiTestPage'
import SettingsPage from '@/pages/SettingsPage'
import DocsPage from '@/pages/DocsPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="topics" element={<TopicsPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="acl" element={<AclPage />} />
          <Route path="webhooks" element={<WebhooksPage />} />
          <Route path="webhooks/new" element={<WebhookEditPage />} />
          <Route path="webhooks/:id" element={<WebhookEditPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="api-test" element={<ApiTestPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="docs" element={<DocsPage />} />
        </Route>
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
