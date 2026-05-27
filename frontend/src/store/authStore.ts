import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  username: string | null
  role: 'admin' | 'viewer' | 'client' | null
  wsPassword: string | null
  setAuth: (token: string, username: string, role: string, password?: string) => void
  clearAuth: () => void
  isAdmin: () => boolean
  isViewer: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      username: null,
      role: null,
      wsPassword: null,
      setAuth: (token, username, role, password) => set({
        token, username, role: role as AuthState['role'],
        wsPassword: password ?? get().wsPassword,
      }),
      clearAuth: () => set({ token: null, username: null, role: null, wsPassword: null }),
      isAdmin: () => get().role === 'admin',
      isViewer: () => get().role === 'viewer' || get().role === 'admin',
    }),
    { name: 'auth-storage' }
  )
)
