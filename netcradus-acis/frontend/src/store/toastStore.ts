import { create } from 'zustand'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  type: ToastType
  message: string
}

interface ToastState {
  toasts: Toast[]
  show: (type: ToastType, message: string) => void
  dismiss: (id: string) => void
}

/**
 * Shared toast store for the tenant console — generalizes
 * platformToastStore (success/error only, platform-admin-scoped) to the
 * four semantic types the tenant console's former alert()/confirm() call
 * sites actually need (success/error/warning/info). Kept as a separate
 * store rather than merging with platformToastStore since the two consoles
 * never render in the same tree and each already has its own container
 * mounted in its own layout.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (type, message) => {
    const id = `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    set((state) => ({ toasts: [...state.toasts, { id, type, message }] }))
    setTimeout(() => get().dismiss(id), 5000)
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export const toast = {
  success: (message: string) => useToastStore.getState().show('success', message),
  error: (message: string) => useToastStore.getState().show('error', message),
  warning: (message: string) => useToastStore.getState().show('warning', message),
  info: (message: string) => useToastStore.getState().show('info', message),
}
