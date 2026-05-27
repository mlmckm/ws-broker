import { create } from 'zustand'

type WsStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface WsState {
  status: WsStatus
  setStatus: (status: WsStatus) => void
}

export const useWsStore = create<WsState>((set) => ({
  status: 'disconnected',
  setStatus: (status) => set({ status }),
}))
