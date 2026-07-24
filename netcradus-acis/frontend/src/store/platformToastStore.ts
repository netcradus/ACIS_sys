import { create } from 'zustand'

export interface PlatformToast {
  id: string
  type: 'success' | 'error'
  message: string
}

interface PlatformToastState {
  toasts: PlatformToast[]
  show: (type: PlatformToast['type'], message: string) => void
  dismiss: (id: string) => void
}

/**
 * Lightweight toast store scoped to the Platform Admin panel. The rest of
 * the app has no toast system (existing pages use bare alert()/console.error
 * — see SettingsPage/ReportsPage), so this is deliberately new and small
 * rather than retrofitted everywhere.
 */
export const usePlatformToastStore = create<PlatformToastState>((set, get) => ({
  toasts: [],
  show: (type, message) => {
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => get().dismiss(id), 5000)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
