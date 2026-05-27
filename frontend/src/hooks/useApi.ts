import axios from 'axios'
import { useAuthStore } from '@/store/authStore'
import { toast } from './use-toast'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useAuthStore.getState().clearAuth()
      window.location.href = '/login'
    } else if (err.response?.status === 403) {
      toast({ title: 'Erişim Reddedildi', description: 'Bu işlem için yetkiniz yok', variant: 'destructive' })
    }
    return Promise.reject(err)
  }
)

export default api
export { api }
