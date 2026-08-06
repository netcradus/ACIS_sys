import { create } from 'zustand'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'
import { useAuthStore } from './authStore'

export interface AppNotification {
  id: string
  title: string
  message: string
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
  source: string
  timestamp: string
  read: boolean
  actionUrl?: string
}

interface NotificationState {
  notifications: AppNotification[]
  unreadCount: number
  filter: 'ALL' | 'UNREAD' | 'CRITICAL'
  isWsConnected: boolean
  isInitialized: boolean
  
  // Actions
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp' | 'read'> & { id?: string; timestamp?: string }) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
  setFilter: (filter: 'ALL' | 'UNREAD' | 'CRITICAL') => void
  initNotifications: () => void
}

const STORAGE_KEY = 'acis_notifications_v1'

/**
 * Real notifications only — no seeded demo rows. This used to fall back to
 * five fabricated incidents (fake Mimikatz/SQLi/brute-force events) so the
 * bell was never empty; on a genuinely quiet tenant with no real alerts,
 * empty is the honest state.
 */
function getInitialNotifications(): AppNotification[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch (e) {
    console.error('Failed to parse saved notifications:', e)
  }
  return []
}

function saveNotifications(items: AppNotification[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 50)))
  } catch (e) {
    console.error('Failed to save notifications:', e)
  }
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch (e) {
    // Ignore audio autoplay policies
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: getInitialNotifications(),
  unreadCount: getInitialNotifications().filter(n => !n.read).length,
  filter: 'ALL',
  isWsConnected: false,
  isInitialized: false,

  addNotification: (data) => {
    // Real enforcement of the Settings > Profile preferences (previously
    // these toggles changed local state and nothing else ever read them).
    const prefs = useAuthStore.getState().user
    if (prefs?.criticalOnly && (data.severity === 'LOW' || data.severity === 'INFO')) {
      return
    }

    const newNotif: AppNotification = {
      id: data.id || 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: data.title,
      message: data.message,
      severity: data.severity,
      source: data.source || 'ACIS Security Core',
      timestamp: data.timestamp || new Date().toISOString(),
      read: false,
      actionUrl: data.actionUrl || '/dashboard/alerts'
    }

    set((state) => {
      const updated = [newNotif, ...state.notifications]
      saveNotifications(updated)
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.read).length
      }
    })

    if ((data.severity === 'CRITICAL' || data.severity === 'HIGH') && prefs?.soundAlerts !== false) {
      playChime()
    }
  },

  markAsRead: (id) => {
    set((state) => {
      const updated = state.notifications.map(n => n.id === id ? { ...n, read: true } : n)
      saveNotifications(updated)
      return {
        notifications: updated,
        unreadCount: updated.filter(n => !n.read).length
      }
    })
  },

  markAllAsRead: () => {
    set((state) => {
      const updated = state.notifications.map(n => ({ ...n, read: true }))
      saveNotifications(updated)
      return {
        notifications: updated,
        unreadCount: 0
      }
    })
  },

  clearAll: () => {
    set(() => {
      saveNotifications([])
      return {
        notifications: [],
        unreadCount: 0
      }
    })
  },

  setFilter: (filter) => set({ filter }),

  initNotifications: () => {
    if (get().isInitialized) return
    set({ isInitialized: true })

    // 1. Fetch live alerts from API if backend is running
    apiClient.get('/api/alerts')
      .then((res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          const apiNotifs: AppNotification[] = res.data.map((item: any) => ({
            id: item.id || 'api-' + Math.random(),
            title: item.title || 'Security Alert',
            message: item.rawEvent || `Security alert triggered from ${item.source || 'ingest'}`,
            severity: (item.severity || 'HIGH').toUpperCase() as any,
            source: item.source || 'ACIS Alert Service',
            timestamp: item.createdAt || new Date().toISOString(),
            read: item.status === 'RESOLVED' || item.status === 'CLOSED',
            actionUrl: '/dashboard/alerts'
          }))

          set((state) => {
            // Merge with existing notifications without duplicating IDs
            const existingIds = new Set(state.notifications.map(n => n.id))
            const fresh = apiNotifs.filter(n => !existingIds.has(n.id))
            const combined = [...fresh, ...state.notifications]
            saveNotifications(combined)
            return {
              notifications: combined,
              unreadCount: combined.filter(n => !n.read).length
            }
          })
        }
      })
      .catch((err) => {
        console.log('[NotificationStore] API alerts endpoint unavailable:', err?.message)
      })

    // 2. Subscribe to STOMP WebSocket for real-time live events
    wsClient.subscribe('/topic/alerts', (msg) => {
      try {
        const payload = JSON.parse(msg.body)
        get().addNotification({
          id: payload.id,
          title: payload.title || 'Real-time Threat Event',
          message: payload.message || payload.rawEvent || 'Live telemetry event received from WebSocket stream',
          severity: (payload.severity || 'CRITICAL').toUpperCase() as any,
          source: payload.source || 'WebSocket Stream',
          timestamp: payload.timestamp || new Date().toISOString(),
          actionUrl: '/dashboard/alerts'
        })
        set({ isWsConnected: true })
      } catch (e) {
        console.error('[NotificationStore] Failed to parse WS message:', e)
      }
    })
    .then(() => {
      set({ isWsConnected: true })
    })
    .catch(() => {
      set({ isWsConnected: false })
    })
  }
}))
