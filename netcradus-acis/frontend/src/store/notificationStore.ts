import { create } from 'zustand'
import apiClient from '@/lib/apiClient'
import wsClient from '@/lib/wsClient'

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

const INITIAL_DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-101',
    title: 'Anomalous PowerShell Script Execution',
    message: 'Encoded PowerShell payload executed on host WORKSTATION-92 by user domain\\jsmith',
    severity: 'CRITICAL',
    source: 'AI Anomaly Engine',
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: '/dashboard/alerts'
  },
  {
    id: 'notif-102',
    title: 'Multiple Failed SSH Auth Attempts',
    message: '48 failed authentication attempts from IP 194.26.29.11 targeting Gateway Proxy',
    severity: 'HIGH',
    source: 'Log Explorer SIEM',
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: '/dashboard/logs'
  },
  {
    id: 'notif-103',
    title: 'Suspicious Keycloak Realm Admin Role Grant',
    message: 'User admin granted SUPER_ADMIN privileges to external identity user_external_02',
    severity: 'HIGH',
    source: 'Keycloak Security Audit',
    timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    read: false,
    actionUrl: '/dashboard/settings?tab=Users%20%26%20Groups'
  },
  {
    id: 'notif-104',
    title: 'Threat Intel Feed Synced',
    message: '1,420 new IoC indicators imported from AlienVault OTX and CISA Feed',
    severity: 'INFO',
    source: 'Threat Intelligence Service',
    timestamp: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    read: true,
    actionUrl: '/dashboard/threat-intel'
  },
  {
    id: 'notif-105',
    title: 'Correlation Rule Triggered: Pass-the-Hash',
    message: 'NTLM authentication relay detected across subnet 10.0.4.0/24',
    severity: 'CRITICAL',
    source: 'Correlation Engine',
    timestamp: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    read: true,
    actionUrl: '/dashboard/correlation'
  }
]

function getInitialNotifications(): AppNotification[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (e) {
    console.error('Failed to parse saved notifications:', e)
  }
  return INITIAL_DEMO_NOTIFICATIONS
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

    if (data.severity === 'CRITICAL' || data.severity === 'HIGH') {
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
        console.log('[NotificationStore] API alerts endpoint offline (using local live telemetry stream):', err?.message)
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

    // 3. Periodic real-time security event generator (simulates live telemetry traffic every 25 seconds if active)
    const liveEventsPool = [
      { title: 'Brute Force Authentication Detected', message: '15 failed logins in 60s for user root from 185.220.101.5', severity: 'HIGH', source: 'Auth Ingest' },
      { title: 'Suspicious Outbound Data Transfer', message: '480 MB transferred to unrated IP 91.240.118.12 over TCP 443', severity: 'CRITICAL', source: 'Network Sensor' },
      { title: 'Mimikatz LSASS Dump Attempt', message: 'Process LSASS.exe accessed with PROCESS_ALL_ACCESS by cmd.exe', severity: 'CRITICAL', source: 'Endpoint Agent' },
      { title: 'New Cloud Admin Identity Provisioned', message: 'AWS IAM role SecOpsAdmin assumed from external IP', severity: 'MEDIUM', source: 'CloudTrail Audit' },
      { title: 'SQL Injection Attack Blocked', message: 'Malicious payload `UNION SELECT null, @@version` dropped by WAF', severity: 'HIGH', source: 'WAF Gateway' }
    ]

    let poolIdx = 0
    const interval = setInterval(() => {
      const event = liveEventsPool[poolIdx % liveEventsPool.length]
      poolIdx++
      
      // Only inject periodically if less than 20 total notifications to keep performance high
      if (get().notifications.length < 25) {
        get().addNotification({
          ...event,
          severity: event.severity as any,
          timestamp: new Date().toISOString(),
          actionUrl: '/dashboard/alerts'
        })
      }
    }, 28000)

    return () => clearInterval(interval)
  }
}))
