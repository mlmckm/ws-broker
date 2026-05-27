export const ROLES = {
  admin: { label: 'Admin', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300' },
  viewer: { label: 'Viewer', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' },
  client: { label: 'Client', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300' },
} as const

export const AUDIT_ACTIONS = [
  'auth.login', 'auth.logout', 'auth.login_failed',
  'user.create', 'user.update', 'user.delete',
  'client.kick', 'client.kick_all',
  'acl.create', 'acl.update', 'acl.delete',
  'webhook.create', 'webhook.update', 'webhook.delete', 'webhook.toggle',
  'message.publish', 'message.clear',
  'settings.update', 'topic.retain_delete',
]

export const WS_URL = typeof window !== 'undefined'
  ? `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`
  : 'ws://localhost:8883/ws'
