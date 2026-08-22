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
 * Lightweight toast store scoped to the Platform Admin console. The tenant
 * console has its own real toast system (see store/toastStore.ts) — kept as
 * a separate store rather than merged, since the two consoles never render
 * in the same tree and each already has its own container mounted in its
 * own layout (ToastContainer.tsx vs modules/platform-admin/components/ToastContainer.tsx).
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
